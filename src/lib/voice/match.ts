import { INTENTS, type Intent } from "@/content/voice";

/**
 * Intent matching over a transcript.
 *
 * Scoring rather than a regex table, because speech recognition returns
 * whatever the speaker actually said — "can you show me the stuff you built"
 * has to reach the same place as "open work". Word-level hits are forgiving in
 * a way patterns are not.
 */

/**
 * Words that carry no intent and wreck matching if treated as triggers.
 *
 * This list is not fussiness. Testing showed "open" as a trigger for the
 * availability intent ("open to work") swallowed "open settings" and "open
 * your experience", and "do" as a trigger for roles ("what do you do")
 * swallowed "how do I contact you". Command verbs and auxiliaries appear in
 * nearly every spoken sentence, so they can only ever be noise.
 *
 * Question words that genuinely disambiguate — "who", "where" — are NOT here.
 */
const STOPWORDS = new Set([
  "a", "an", "the", "this", "that", "these", "those",
  "i", "me", "my", "mine", "you", "your", "yours", "we", "us", "they", "it",
  "is", "are", "am", "was", "were", "be", "been", "do", "does", "did",
  "have", "has", "had", "can", "could", "will", "would", "should", "shall",
  "please", "let", "want", "wanna", "need", "like", "get", "got", "give",
  "tell", "say", "know", "see", "view", "look", "check",
  "open", "show", "go", "take", "bring", "put", "play",
  "to", "of", "and", "or", "but", "so", "if", "then", "than",
  "on", "in", "at", "by", "for", "with", "from", "up", "down", "out",
  "some", "any", "more", "again", "now", "just", "really", "very",
  "s", "t", "re", "ve", "ll", "m",
]);

/** A matched phrase is decisive — it beats any accumulation of loose words. */
const PHRASE_SCORE = 10;

/** Cheap stem: folds plurals so "projects" hits a "project" trigger. */
function stem(word: string) {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith("es")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s")) return word.slice(0, -1);
  return word;
}

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(text: string): string[] {
  return normalize(text).split(" ").filter(Boolean);
}

function scoreIntent(intent: Intent, tokens: Set<string>, phrase: string) {
  const weight = intent.weight ?? 0;

  // Phrases are checked against the untouched sentence, since they are made of
  // exactly the words the token pass throws away.
  if (intent.phrases?.some((candidate) => phrase.includes(candidate))) {
    return PHRASE_SCORE + weight;
  }

  let score = 0;
  for (const group of intent.triggers) {
    const hits = group.filter(
      (trigger) => tokens.has(trigger) || tokens.has(stem(trigger)),
    ).length;
    // Every group must contribute — this is the AND that stops a stray word
    // from dragging in an unrelated intent.
    if (hits === 0) return 0;
    score += hits;
  }

  return score === 0 ? 0 : score + weight;
}

export interface Match {
  intent: Intent;
  score: number;
}

/**
 * Returns the best intent, or null when nothing is confident enough. A single
 * weak word should produce "I didn't catch that" rather than a confident jump
 * to the wrong screen — being wrong out loud is worse than asking again.
 */
export function matchIntent(transcript: string): Match | null {
  const phrase = normalize(transcript);
  if (!phrase) return null;

  const tokens = new Set(
    tokenize(transcript)
      .filter((token) => !STOPWORDS.has(token))
      .flatMap((token) => [token, stem(token)]),
  );

  let best: Match | null = null;
  for (const intent of INTENTS) {
    const score = scoreIntent(intent, tokens, phrase);
    if (score > 0 && (!best || score > best.score)) best = { intent, score };
  }

  return best;
}
