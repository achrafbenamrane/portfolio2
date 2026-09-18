/**
 * Respellings applied ONLY to text on its way to speech synthesis.
 *
 * The page keeps the spellings Achraf actually uses; the voice gets whatever
 * makes an English model say them correctly. The two are different problems
 * and conflating them means choosing between a page that looks wrong and a
 * voice that sounds wrong.
 *
 * "Achraf" is the case that forced this. أشرف is Ash-raf, and the French-style
 * transliteration writes the ش as "ch" — but an English voice reads "ch"
 * before an "r" as /k/, so it said "Akraf". Respelling it "Ashraf" for the
 * synthesiser gets the Arabic sound from an English voice.
 */

export const PRONUNCIATION: readonly (readonly [RegExp, string])[] = [
  // أشرف — the ش is "sh", not the hard "ch" English infers here.
  [/\bAchraf\b/gi, "Ashraf"],
  // Read as one word it comes out mangled; the space lets it find the stress.
  [/\bBenamrane\b/gi, "Ben Amrane"],
  // عنابة — three syllables, ah-NAA-ba, not "a-NAB-uh".
  [/\bAnnaba\b/gi, "Annahba"],
  // Badji Mokhtar — the "dj" is a soft j, and "kh" is closer to a hard k here.
  [/\bBadji\b/gi, "Baji"],
  [/\bMokhtar\b/gi, "Moktar"],
];

/** Rewrites a line for the synthesiser. Display text is never passed through. */
export function forSpeech(text: string): string {
  let out = text;
  for (const [pattern, replacement] of PRONUNCIATION) {
    out = out.replace(pattern, replacement);
  }
  return out;
}
