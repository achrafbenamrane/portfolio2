import { site } from "./site";

/**
 * What the assistant can be asked, and what it says back.
 *
 * Deliberately deterministic — no model, no API key, nothing to abuse on a
 * public site, and it answers instantly and offline. Visitors to a portfolio
 * ask a small, predictable set of things; this covers them.
 *
 * `speech` is what gets spoken and what gets pre-rendered in Achraf's cloned
 * voice as `public/voice/<id>.mp3`. Keep the wording stable: changing a line
 * means regenerating its clip (`npm run voice:lines`).
 */

export type VoiceAction =
  | { kind: "folder"; id: "works" | "experiences" | "certifications" | "contacts" }
  | { kind: "app"; id: "quran" | "settings" | "phone" }
  | { kind: "link"; href: string }
  | { kind: "close" }
  | { kind: "none" };

export interface Intent {
  id: string;
  /**
   * Every group must contribute at least one hit for the intent to match —
   * AND across groups, OR inside one. Single-group intents are the common
   * case; a second group is how "open the quran" is kept from colliding with
   * "open my work".
   */
  triggers: readonly (readonly string[])[];
  /**
   * Whole-sentence fragments, matched before tokens and decisive when they
   * hit. This is how questions built entirely from stopwords — "what do you
   * do", "what can you do" — stay reachable at all.
   */
  phrases?: readonly string[];
  /** Nudges ties. Higher wins when two intents both match. */
  weight?: number;
  speech: string;
  action: VoiceAction;
}

export const INTENTS: readonly Intent[] = [
  // ── identity ──
  {
    id: "who",
    triggers: [["who", "introduce", "yourself", "bio"]],
    phrases: ["who are you", "about yourself"],
    speech: `Hi, I am Achraf Benamrane. I am a full stack developer, a designer, and a network security engineer. I live in Annaba, Algeria.`,
    action: { kind: "none" },
  },
  {
    id: "roles",
    triggers: [["role", "roles", "job", "speciality", "specialty", "skill", "skills", "profession"]],
    phrases: ["what do you do", "what you do"],
    speech: `I work in three areas. Web and mobile development. Network and information security. And user interface design.`,
    action: { kind: "none" },
  },
  {
    id: "where",
    triggers: [["where", "located", "location", "live", "based"]],
    speech: `I live in Annaba, in Algeria.`,
    action: { kind: "none" },
  },
  {
    id: "available",
    triggers: [["available", "availability", "hiring", "freelance"]],
    weight: 2,
    speech: `Yes, I am available for work now. The best way to reach me is by email.`,
    action: { kind: "none" },
  },

  // ── folders ──
  {
    id: "works",
    triggers: [["work", "works", "project", "projects", "built", "build", "portfolio"]],
    speech: `Here are my projects. Web, mobile, security, and design work.`,
    action: { kind: "folder", id: "works" },
  },
  {
    id: "experiences",
    triggers: [["experience", "experiences", "career", "history", "worked", "background"]],
    weight: 2,
    speech: `This is my experience. Where I worked, and what I did there.`,
    action: { kind: "folder", id: "experiences" },
  },
  {
    id: "certifications",
    triggers: [["certification", "certifications", "certificate", "certified", "diploma", "degree", "credential", "credentials", "qualification"]],
    speech: `These are my diplomas and certificates.`,
    action: { kind: "folder", id: "certifications" },
  },
  {
    id: "contacts",
    triggers: [["contact", "reach", "email", "mail", "touch", "message", "hire", "phone"]],
    speech: `Here is how to reach me. Email is best. My phone and my social links are also here.`,
    action: { kind: "folder", id: "contacts" },
  },

  // ── apps and links ──
  {
    id: "quran",
    triggers: [["quran", "koran", "recitation", "surah"]],
    weight: 3,
    speech: `Opening the Quran player. Choose a reader and a surah.`,
    action: { kind: "app", id: "quran" },
  },
  {
    id: "cv",
    triggers: [["cv", "resume", "résumé", "download"]],
    weight: 3,
    speech: `Downloading my CV now.`,
    action: { kind: "link", href: site.cvHref },
  },
  {
    id: "github",
    triggers: [["github", "git", "repo", "repos", "repository", "repositories"]],
    weight: 3,
    speech: `Opening my GitHub.`,
    action: { kind: "link", href: site.links[0].href },
  },
  {
    id: "linkedin",
    triggers: [["linkedin"]],
    weight: 3,
    speech: `Opening my LinkedIn.`,
    action: { kind: "link", href: site.links[1].href },
  },
  {
    id: "settings",
    triggers: [["settings", "setting", "preferences", "camera", "microphone"]],
    weight: 2,
    speech: `Opening settings. You can turn hand control on and off here.`,
    action: { kind: "app", id: "settings" },
  },

  // ── control ──
  {
    id: "close",
    triggers: [["close", "back", "exit", "dismiss", "quit", "home", "cancel"]],
    weight: 4,
    speech: `Closing that.`,
    action: { kind: "close" },
  },
  {
    id: "help",
    triggers: [["help", "commands", "command"]],
    phrases: ["what can you do", "what can i ask", "what can you say", "what can i say"],
    speech: `You can ask me to open my work, my experience, my certificates, or my contacts. You can also ask who I am, or if I am free for work.`,
    action: { kind: "none" },
  },
];

/** Spoken when nothing scores high enough. Also pre-rendered. */
export const FALLBACK = {
  id: "fallback",
  speech: `Sorry, I did not understand. Try asking about my work, or how to contact me.`,
} as const;

/**
 * Spoken when the question was understood but the answering service is down or
 * not yet configured. Distinct from FALLBACK on purpose: telling someone you
 * did not catch them when you did is a lie, and it sends them off re-phrasing
 * a question that was never the problem.
 */
export const UNAVAILABLE = {
  id: "unavailable",
  speech: `Sorry, I cannot answer that now. But I can show you my work, my experience, or my contacts.`,
} as const;

/** Spoken the first time the assistant opens. */
export const GREETING = {
  id: "greeting",
  speech: `Hi, I am Achraf. Ask me about my work. Or tell me what to open.`,
} as const;

/** Everything that needs an audio clip, for the generator script. */
export const ALL_LINES = [
  GREETING,
  FALLBACK,
  UNAVAILABLE,
  ...INTENTS.map((intent) => ({ id: intent.id, speech: intent.speech })),
] as const;
