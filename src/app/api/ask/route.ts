import { groq } from "@ai-sdk/groq";
import { generateText, type LanguageModel } from "ai";

import { ANSWERS, UNAVAILABLE } from "@/content/voice";

/**
 * Routes a spoken question to one of Achraf's recorded answers.
 *
 * The model CHOOSES a line; it does not write one. That is the whole point:
 * every reply the assistant speaks has to exist as audio in Achraf's own
 * voice, and nothing can produce a sentence he never recorded. Generating free
 * text would mean falling back to a synthetic voice for exactly the questions
 * visitors care most about, which is the inconsistency this replaces.
 *
 * So the model does the part it is good at — understanding that "do you know
 * React Native?" is a question about his work — and the answer comes back as
 * an id whose clip is already on disk.
 *
 * This endpoint is public and costs money per call, so the guards below are
 * part of the feature. The deterministic keyword table still runs FIRST on the
 * client, so commands and obvious questions never reach here at all.
 */

const MODEL: LanguageModel = process.env.GROQ_API_KEY
  ? groq(process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile")
  : "anthropic/claude-haiku-4.5";

/** Choosing a number needs a handful of tokens, not a paragraph. */
const MAX_OUTPUT_TOKENS = 8;
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

/** Same question, same answer — so a repeat costs nothing. */
const routed = new Map<string, string>();

const CATALOGUE = ANSWERS.map(
  (answer, index) => `${index + 1}. ${answer.speech}`,
).join("\n");

const INSTRUCTIONS = `You route questions asked on Achraf Benamrane's portfolio
website to one of his pre-recorded answers.

Below are the answers he can give, numbered. Reply with the NUMBER of the one
that best addresses the visitor's question, and nothing else — no words, no
punctuation, no explanation.

If no answer genuinely addresses the question, reply 0. Do not stretch: a
loosely related answer is worse than admitting there isn't one.

ANSWERS:
${CATALOGUE}`;

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    const host = request.headers.get("host");
    if (host && !origin.endsWith(host)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(ip)) {
    return Response.json({ error: "Too many questions" }, { status: 429 });
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
  const cached = routed.get(key);
  if (cached) return Response.json(answerFor(cached), { headers: HIT });

  try {
    const { text } = await generateText({
      model: MODEL,
      instructions: INSTRUCTIONS,
      prompt: trimmed,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: 0,
    });

    // The model was asked for a bare number; take the first one it produced
    // and ignore anything else, rather than trusting the format.
    const picked = Number.parseInt(text.match(/\d+/)?.[0] ?? "0", 10);
    const answer = ANSWERS[picked - 1];
    const id = answer ? answer.id : UNAVAILABLE.id;

    if (routed.size > 500) routed.clear();
    routed.set(key, id);

    return Response.json(answerFor(id));
  } catch (error) {
    console.error("ask route failed:", error);
    return Response.json(answerFor(UNAVAILABLE.id), { status: 200 });
  }
}

const HIT = { "x-answer-cache": "hit" };

function answerFor(id: string) {
  const answer =
    ANSWERS.find((entry) => entry.id === id) ?? UNAVAILABLE;
  return { id: answer.id, text: answer.speech };
}
