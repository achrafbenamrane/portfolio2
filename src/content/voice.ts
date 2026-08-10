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
    speech: `I am Achraf Benamrane — a full-stack developer, a UI/UX and graphic designer, and a network and information security engineer, based in Annaba, Algeria.`,
    action: { kind: "none" },
  },
  {
    id: "roles",
    triggers: [["role", "roles", "job", "speciality", "specialty", "skill", "skills", "profession"]],
    phrases: ["what do you do", "what you do"],
    speech: `I work across three things: full-stack development, network and information security, and UI/UX and graphic design.`,
    action: { kind: "none" },
  },
  {
    id: "where",
    triggers: [["where", "located", "location", "live", "based"]],
    speech: `I'm based in Annaba, Algeria.`,
    action: { kind: "none" },
  },
  {
    id: "available",
    triggers: [["available", "availability", "hiring", "freelance"]],
    weight: 2,
    speech: `Yes — I'm available for work right now. The fastest way to reach me is email.`,
    action: { kind: "none" },
  },

  // ── folders ──
  {
    id: "works",
    triggers: [["work", "works", "project", "projects", "built", "build", "portfolio"]],
    speech: `Here are my projects — web, mobile, security and design work.`,
    action: { kind: "folder", id: "works" },
  },
  {
    id: "experiences",
    triggers: [["experience", "experiences", "career", "history", "worked", "background"]],
    weight: 2,
    speech: `Opening my experience — where I have worked and what I did there.`,
    action: { kind: "folder", id: "experiences" },
  },
  {
    id: "certifications",
    triggers: [["certification", "certifications", "certificate", "certified", "diploma", "degree", "credential", "credentials", "qualification"]],
    speech: `These are my certifications and credentials.`,
    action: { kind: "folder", id: "certifications" },
  },
  {
    id: "contacts",
    triggers: [["contact", "reach", "email", "mail", "touch", "message", "hire", "phone"]],
    speech: `Here's how to reach me. Email is best, but my phone and socials are all here.`,
    action: { kind: "folder", id: "contacts" },
  },

  // ── apps and links ──
  {
    id: "quran",
    triggers: [["quran", "koran", "recitation", "surah"]],
    weight: 3,
    speech: `Opening the Quran player. Pick a reciter and a surah.`,
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
    speech: `Opening settings. You can turn hand control on and off there.`,
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
    speech: `Ask me to open my work, my experience, my certifications or my contacts. You can also ask who I am, where I'm based, or whether I'm available.`,
    action: { kind: "none" },
  },
];

/** Spoken when nothing scores high enough. Also pre-rendered. */
export const FALLBACK = {
  id: "fallback",
  speech: `I didn't catch that. Try asking to see my work, my experience, or how to get in touch.`,
} as const;

/** Spoken the first time the assistant opens. */
export const GREETING = {
  id: "greeting",
  speech: `Hey — I'm Achraf. Ask me about my work, or tell me what to open.`,
} as const;

/** Everything that needs an audio clip, for the generator script. */
export const ALL_LINES = [
  GREETING,
  FALLBACK,
  ...INTENTS.map((intent) => ({ id: intent.id, speech: intent.speech })),
] as const;
