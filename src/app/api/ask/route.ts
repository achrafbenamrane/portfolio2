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

/**
 * Groq retires models without much notice — llama-3.3-70b-versatile went in
 * late 2026 and every open question failed until this was changed. Check
 * https://console.groq.com/docs/models before pinning another.
 */
const GROQ_MODEL = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";

const MODEL: LanguageModel = process.env.GROQ_API_KEY
  ? groq(GROQ_MODEL)
  : "anthropic/claude-haiku-4.5";

/**
 * gpt-oss reasons before it answers, and the reasoning is billed against the
 * same output cap. So it reasons at low effort, and the cap carries room for
 * that on top of the answer's — without it, the answer is what gets cut off.
 */
const REASONS =
  Boolean(process.env.GROQ_API_KEY) && GROQ_MODEL.startsWith("openai/gpt-oss");

/** Spoken answers are short; a hard stop, not a target. */
const ANSWER_TOKENS = 200;
const REASONING_TOKENS = 400;
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
      maxOutputTokens: ANSWER_TOKENS + (REASONS ? REASONING_TOKENS : 0),
      temperature: 0.3,
      providerOptions: REASONS
        ? { groq: { reasoningEffort: "low" } }
        : undefined,
    });

    // gpt-oss writes typography the old model never did — a non-breaking
    // hyphen (U+2011) in "e-commerce", narrow no-break spaces. They display
    // fine, but the synthesiser reads the same text, so it goes out plain.
    const answer = text
      .trim()
      .replace(/[\u2010\u2011]/g, "-")
      .replace(/[\u00a0\u202f]/g, " ");
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
