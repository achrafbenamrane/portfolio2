import { groq } from "@ai-sdk/groq";
import { generateText, type LanguageModel } from "ai";

import { SYSTEM_INSTRUCTIONS } from "@/lib/voice/knowledge";

/**
 * Open-ended questions about Achraf and this site.
 *
 * This endpoint is public and costs money per call, so the guards below are
 * part of the feature rather than hardening bolted on afterwards. The
 * deterministic intent table still runs FIRST on the client — commands and the
 * common questions never reach this route at all, so it only pays for genuinely
 * novel questions.
 */

/**
 * Groq when a key is present, otherwise Vercel's AI Gateway.
 *
 * Groq is the default because its free tier serves this outright, where the
 * Gateway refuses every request until a card is on file. Keeping both means
 * the endpoint follows whichever is provisioned rather than hard-failing on
 * the one that is not — and switching later is an env var, not a deploy.
 *
 * GROQ_MODEL overrides the default: Groq retires model ids periodically, and
 * that should be a dashboard change, not a code change. Current catalogue:
 * https://console.groq.com/docs/models
 */
function resolveModel(): LanguageModel {
  if (process.env.GROQ_API_KEY) {
    return groq(process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile");
  }
  return "anthropic/claude-haiku-4.5";
}

/** Spoken answers are short; this is a hard stop, not a target. */
const MAX_OUTPUT_TOKENS = 200;

/** A real spoken question is short. Anything longer is not a question. */
const MAX_QUESTION_CHARS = 300;

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 8;
const MAX_PER_HOUR = 40;

/**
 * Per-IP limiter held in module scope.
 *
 * Fluid Compute reuses instances across requests, so this holds for the
 * traffic a portfolio sees. It is deliberately not a distributed limiter: that
 * would mean provisioning Redis for a site that gets a few visitors a day.
 * The real cost ceiling is MAX_OUTPUT_TOKENS combined with the answer cache.
 */
const hits = new Map<string, number[]>();

function rateLimit(ip: string) {
  const now = Date.now();
  const times = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  times.push(now);
  hits.set(ip, times);

  // Keep the map from growing without bound on a long-lived instance.
  if (hits.size > 5_000) {
    for (const [key, value] of hits) {
      if (value.every((t) => now - t > 3_600_000)) hits.delete(key);
    }
  }

  const lastMinute = times.filter((t) => now - t < WINDOW_MS).length;
  return lastMinute <= MAX_PER_WINDOW && times.length <= MAX_PER_HOUR;
}

/**
 * Identical questions are common on a portfolio — "what do you do", "are you
 * available" — and the answer only changes when the content does. Caching them
 * for the life of the instance removes most of the repeat spend.
 */
const answers = new Map<string, string>();

export async function POST(request: Request) {
  // Same-origin only. Does not stop a determined caller, but it stops the
  // casual "found an open LLM endpoint" case, which is the realistic threat.
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
      model: resolveModel(),
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
