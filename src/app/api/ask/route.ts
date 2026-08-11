import { groq } from "@ai-sdk/groq";
import { generateText, type LanguageModel } from "ai";

import { SYSTEM_INSTRUCTIONS } from "@/lib/voice/knowledge";

/**
 * Open-ended questions about Achraf and this site.
 *
 * The model writes the answer again, rather than picking from a fixed list.
 * That was only a restriction while every reply had to be a clip Achraf had
 * recorded; now that speech is generated, any sentence can be spoken, so the
 * limit no longer buys anything.
 *
 * This endpoint is public and costs money per call, so the guards below are
 * part of the feature. The deterministic keyword table still runs FIRST on the
 * client, so commands and the common questions never reach here at all.
 */

const MODEL: LanguageModel = process.env.GROQ_API_KEY
  ? groq(process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile")
  : "anthropic/claude-haiku-4.5";

/** Spoken answers are short; a hard stop, not a target. */
const MAX_OUTPUT_TOKENS = 200;
const MAX_QUESTION_CHARS = 300;

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 8;
const MAX_PER_HOUR = 40;

const hits = new Map<string, number[]>();

function rateLimit(ip: string) {
  const now = Date.now();
  const times = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  times.push(now);
  hits.set(ip, times);

  if (hits.size > 5_000) {
    for (const [key, value] of hits) {
      if (value.every((t) => now - t > 3_600_000)) hits.delete(key);
    }
  }

  const lastMinute = times.filter((t) => now - t < WINDOW_MS).length;
  return lastMinute <= MAX_PER_WINDOW && times.length <= MAX_PER_HOUR;
}

/** Repeated questions are common on a portfolio and the answer only changes
 *  when the content does, so caching removes most of the repeat spend. */
const answers = new Map<string, string>();

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && !origin.endsWith(host)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(ip)) {
    return Response.json(
      { error: "Too many questions — give it a minute." },
      { status: 429 },
    );
  }

  let question: unknown;
  try {
    ({ question } = await request.json());
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  if (typeof question !== "string") {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  const trimmed = question.trim().slice(0, MAX_QUESTION_CHARS);
  if (trimmed.length < 2) {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  const key = trimmed.toLowerCase();
  const cached = answers.get(key);
  if (cached) return Response.json({ answer: cached, cached: true });

  try {
    const { text } = await generateText({
      model: MODEL,
      instructions: SYSTEM_INSTRUCTIONS,
      prompt: trimmed,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: 0.3,
    });

    const answer = text.trim();
    if (!answer) {
      return Response.json({ error: "Empty answer" }, { status: 502 });
    }

    if (answers.size > 500) answers.clear();
    answers.set(key, answer);

    return Response.json({ answer });
  } catch (error) {
    // Never surface the provider's error text to a public caller.
    console.error("ask route failed:", error);
    return Response.json({ error: "Assistant unavailable" }, { status: 502 });
  }
}
