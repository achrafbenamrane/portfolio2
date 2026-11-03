/**
 * Every piece of copy and data on the site lives here. Nothing else needs
 * editing to change what the page says.
 *
 * Migrated from the previous portfolio (github.com/achrafbenamrane/Portfolio).
 */

export const site = {
  name: "Benamrane Mohamed Achraf",
  shortName: "Achraf Benamrane",
  initials: "BA",

  /** The business the site speaks for. Copy says "we", never "I". */
  brand: "AXIOM",
  brandLine: "Full-stack development, computer vision and brand identity.",

  /**
   * Canonical origin, used for metadataBase, the sitemap and OG image URLs.
   * Vercel injects the production domain at build time, so a custom domain
   * added later is picked up without editing anything here.
   */
  url: process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://portfolio2-woad-tau.vercel.app",

  /**
   * The hero name is set as a two-tier lockup: given names light and tracked
   * over the surname in black. Split here rather than in the component so the
   * emphasis can be moved without touching layout.
   */
  nameLines: {
    light: "Mohamed Achraf",
    bold: "Benamrane",
  },

  /** Cycled by the hero typewriter. First entry is server-rendered. */
  roles: [
    "Full-Stack Developer",
    "Network & Security Engineer",
    "UI/UX & Graphic Designer",
  ],

  tagline:
    "We build web and mobile apps end to end, and software that can see.",

  bio: "Full-Stack Engineer with an MSc in Network & Information Security, and experience in web and mobile application development, secure communication platforms, UI/UX design and technical project leadership. Currently working remotely at PROGIX, building full-stack applications with React, Next.js, Node.js and PostgreSQL.",

  availability: "OPEN FOR NEW PROJECTS",
  location: "REMOTE — CLIENTS WORLDWIDE",

  email: "Mohamed-achraf.benamrane@univ-annaba.dz",
  phone: "+213 558 78 01 31",
  phoneHref: "tel:+213558780131",
  cvHref: "/benamrane-cv.pdf",

  links: [
    { label: "GitHub", href: "https://github.com/achrafbenamrane" },
    {
      label: "LinkedIn",
      href: "https://linkedin.com/in/mohamed-achraf-benamrane-582127350",
    },
  ],
} as const;

/* ── services ────────────────────────────────────────────────────── */

export interface Service {
  /** Matches an icon in src/components/services.tsx. */
  icon: "code" | "phone" | "shield" | "pen";
  title: string;
  description: string;
  /** Deep-links the Work page filter, so a claim leads to the evidence. */
  href: string;
}

/**
 * The section's own copy. It lives here with everything else you would edit to
 * change what the page says.
 *
 * "Ideas that make an impact" was a placeholder lifted from a reference
 * screenshot, and it described no one. The line below is the actual argument:
 * three disciplines usually mean three people and two handovers, and the
 * interesting thing about Achraf is that they do not.
 */
export const servicesIntro = {
  label: "WHAT WE DO",
  headingTop: "From the wireframe",
  headingBottom: "to the firewall",
  body: "Most projects lose something in the handover — design to development, development to whoever secures it. We work across all three, so nothing gets lost in between.",
  cta: "See the work",
} as const;

/**
 * The four disciplines, drawn from the skill groups above and the categories
 * the projects are already filed under — not aspirational extras. Every one of
 * these has finished work behind it on the Work page, which is the only reason
 * to claim it.
 */
export const services: readonly Service[] = [
  {
    icon: "code",
    title: "Web Development",
    description:
      "Full-stack sites and platforms in React, Next.js and Node — from the database through to the interface.",
    href: "/projects",
  },
  {
    icon: "phone",
    title: "Mobile Apps",
    description:
      "Cross-platform applications in React Native, with real-time data and payments built in.",
    href: "/projects",
  },
  {
    icon: "shield",
    title: "Network & Security",
    description:
      "Intrusion detection, network hardening and Cisco infrastructure, backed by a Master's in the field.",
    href: "/projects",
  },
  {
    icon: "pen",
    title: "UI/UX & Branding",
    description:
      "Interfaces, identities and print design — the visual side handled by the person who builds it.",
    href: "/projects",
  },
];

/* ── testimonials ────────────────────────────────────────────────── */

export interface Testimonial {
  quote: string;
  name: string;
  /** Role and company, e.g. "Founder, NeemaFood". */
  role: string;
  /** Optional headshot in /public. Initials are drawn when absent. */
  avatar?: string;
}

/**
 * PLACEHOLDER CONTENT — replace before sharing this site widely.
 *
 * These are sample entries so the section can be designed and reviewed; the
 * people and companies are invented and no real person is quoted. Swap them
 * for real quotes, or empty the array and the section disappears on its own.
 *
 * Why it matters: a portfolio is the one place a reader can verify a claim,
 * and unattributed praise that turns out to be invented costs more once
 * noticed than having no testimonials at all.
 */
export const testimonials: readonly Testimonial[] = [
  {
    quote:
      "Achraf rebuilt our storefront end to end and the difference was immediate. He handled the design and the code himself, so nothing was lost between the two.",
    name: "Karim Belhadj",
    role: "Founder, Northline Studio",
  },
  {
    quote:
      "We came to him with a security problem and left with a working system. He explained every decision in plain language, which is rarer than it should be.",
    name: "Lina Farouk",
    role: "Operations Lead, Meridian Labs",
  },
  {
    quote:
      "The mobile app shipped on time and looked better than the mockups. He asked the right questions early instead of guessing and reworking later.",
    name: "Yanis Cherif",
    role: "Product Manager, Atlas Retail",
  },
];

/* ── projects ────────────────────────────────────────────────────── */

export type ProjectCategory =
  | "Web Development"
  | "Mobile Development"
  | "Desktop Development"
  | "AI Automation"
  | "Computer Vision"
  | "Graphic Design";

export interface Project {
  slug: string;
  title: string;
  description: string;
  category: ProjectCategory;
  tags: readonly string[];
  year: string;
  /** First image is the index-row preview, and the showcase mockup. */
  images: readonly string[];
  href?: string;
  /** Leads the Work page in a device mockup. Keep this to a handful. */
  featured?: boolean;
  /**
   * Square app icon, for the app's launch screen and its name under the
   * phone on /projects — e.g. "/apps/neemafood.png". Without one they draw a
   * tinted tile with the app's initials, so a missing logo looks deliberate
   * rather than broken.
   */
  icon?: string;
  /**
   * The app's brand colour, as six-digit hex — e.g. "#249CA8". Its badges
   * are drawn in it. Sample it from the icon, or from the app's own screens
   * when the icon is mostly black or white.
   */
  brand?: string;
  /**
   * Where the app can be installed — its App Store and Google Play pages.
   * Each one given gets its store's button under the app's write-up.
   */
  stores?: { appStore?: string; googlePlay?: string };
  /**
   * Screen recording that plays inside the app's phone on /projects —
   * e.g. "/apps/neemafood.mp4", produced by `npm run app:video`. Takes
   * precedence over the screenshot gallery: a recording shows the app being
   * used, which no set of stills can.
   */
  video?: string;
  /** A case-study page on this site, e.g. "/case-studies/oneframe". */
  caseStudy?: string;
  /**
   * The recording had no status bar of its own and went through
   * `npm run app:video -- --bare`, which leaves an empty strip of the app's
   * colour at the top. The phone draws its own clock there.
   */
  videoBare?: boolean;
}

export const projects: readonly Project[] = [
  {
    slug: "neemafood",
    featured: true,
    title: "NeemaFood",
    description:
      "Mobile application connecting local food vendors with customers looking for great food deals. Real-time vendor discovery, seamless ordering, secure payments and personalised recommendations.",
    category: "Mobile Development",
    tags: ["React Native", "Firebase", "Real-time", "Food Delivery"],
    year: "2026",
    href: "https://neemafood.vercel.app/",
    icon: "/apps/neemafood.png",
    brand: "#0CB478",
    images: [
      "https://res.cloudinary.com/dwvgbojw0/image/upload/v1769250138/logo_fnhfo9.png",
      "https://res.cloudinary.com/dwvgbojw0/image/upload/v1769250156/Screenshot_20260124-111331_yaqa13.jpg",
      "https://res.cloudinary.com/dwvgbojw0/image/upload/v1769250154/Screenshot_20260124-111300_sygukd.jpg",
      "https://res.cloudinary.com/dwvgbojw0/image/upload/v1769250154/Screenshot_20260124-111245_et8rrj.jpg",
      "https://res.cloudinary.com/dwvgbojw0/image/upload/v1769250154/Screenshot_20260124-111309_b6r3vp.jpg",
      "https://res.cloudinary.com/dwvgbojw0/image/upload/v1769250152/Screenshot_20260124-111240_xsv4h8.jpg",
      "https://res.cloudinary.com/dwvgbojw0/image/upload/v1769250146/Screenshot_20260124-111128_vmqg1v.jpg",
      "https://res.cloudinary.com/dwvgbojw0/image/upload/v1769250139/Screenshot_20260124-111039_berfhv.jpg",
      "https://res.cloudinary.com/dwvgbojw0/image/upload/v1769250145/Screenshot_20260124-111103_vvxydb.jpg",
      "https://res.cloudinary.com/dwvgbojw0/image/upload/v1769250140/Screenshot_20260124-111022_fcmkrq.jpg",
    ],
  },
  /*
   * The rest of the apps. Icons are real. Descriptions are taken from each
   * app's own public page — La Casa da Pizza's from its fivex write-up,
   * Getdraft's and Linky's from their sites — and say only what those say.
   * Wave and M are still placeholders until their details arrive, and
   * years are unconfirmed throughout. Each `video` lands once its screen
   * recording has been through `npm run app:video`. An empty description
   * keeps the entry out of the voice assistant's knowledge, so it cannot be
   * asked about an app nobody has described yet.
   */
  {
    slug: "la-casa",
    title: "La Casa da Pizza",
    description:
      "An Android app for building a pizza on a dial and tracking the loyalty stamp it earns. Every order counts toward a free pizza, and delivery is booked on a clock-face dial down to the half hour.",
    category: "Mobile Development",
    tags: ["Android", "Food delivery"],
    year: "—",
    href: "https://la-casa-da-pizza.vercel.app/",
    icon: "/apps/la-casa.png",
    // The icon is mostly black; this is the red of the app's own header.
    brand: "#D20612",
    images: ["/apps/la-casa.png"],
    video: "/apps/la-casa.mp4",
    videoBare: true,
  },
  {
    slug: "wave",
    title: "Wave",
    description: "",
    category: "Mobile Development",
    tags: [],
    year: "—",
    icon: "/apps/wave.png",
    brand: "#249CA8",
    images: ["/apps/wave.png"],
  },
  {
    slug: "getdraft",
    title: "Getdraft",
    description:
      "Get discovered. It's a Draft! A sports recruiting app where athletes, coaches and recruiters swipe to pass or Draft — when it's mutual, chat unlocks. A talent map, world rankings and a highlights feed put athletes in front of scouts, every adult is ID-verified, and under-18s go live only once a parent approves.",
    category: "Mobile Development",
    tags: ["iOS", "Android", "Sports recruiting"],
    year: "—",
    href: "https://getdraft.net/",
    // Both listed on getdraft.net, and both checked: they open GetDraft.
    stores: {
      appStore: "https://apps.apple.com/us/app/getdraft/id6802070784",
      googlePlay: "https://play.google.com/store/apps/details?id=com.getdraft.app",
    },
    icon: "/apps/getdraft.png",
    brand: "#0C0C0C",
    images: ["/apps/getdraft.png"],
  },
  {
    slug: "linky",
    title: "Linky",
    description:
      "A marketplace and real-estate app for Guinea, built in Conakry. Buy from verified local sellers or browse homes in a swipeable feed, pay with Orange Money, MTN Mobile Money or card, and every payment is held in escrow until the buyer confirms delivery. Guineans abroad can pay in euros and book video visits of a home.",
    category: "Mobile Development",
    tags: ["Android", "Marketplace", "Real estate"],
    year: "—",
    href: "https://linkygroup.com/",
    icon: "/apps/linky.png",
    brand: "#006C54",
    images: ["/apps/linky.png"],
  },
  {
    slug: "m",
    title: "M",
    description: "",
    category: "Mobile Development",
    tags: [],
    year: "—",
    icon: "/apps/m.png",
    brand: "#C00C24",
    images: ["/apps/m.png"],
  },
  {
    slug: "oneframe",
    featured: true,
    title: "ONEFRAME",
    description:
      "E-commerce storefront built for our own brand, from product pages through to checkout.",
    category: "Web Development",
    tags: ["E-commerce", "Next.js", "Stripe"],
    year: "2025",
    href: "https://oneframe.me",
    brand: "#0088B8",
    images: ["/projects/ONEFRAME.webp"],
  },
  /*
   * The sites below are described from what each says about itself; their
   * screens were taken from the live sites, and each brand colour is the
   * site's own theme colour, or sampled from its buttons where it sets none.
   */
  {
    slug: "linky-web",
    title: "Linky",
    description:
      "Linky's French site: Guinea's marketplace and real-estate app, its swipe-through Discover feed, escrow payments by Mobile Money, and the Android download.",
    category: "Web Development",
    tags: ["Next.js", "Landing page", "Marketplace"],
    year: "2026",
    href: "https://linkygroup.com/",
    brand: "#0E6E55",
    caseStudy: "/case-studies/linky",
    images: [
      "/projects/linky-web/screen-1.webp",
      "/projects/linky-web/screen-2.webp",
      "/projects/linky-web/screen-3.webp",
    ],
  },
  {
    slug: "la-reserve",
    title: "La Réserve",
    description:
      "Landing page for La Réserve, an Android safety app: a geolocated SOS reaches the nearest reservists first, then widens step by step until someone answers.",
    category: "Web Development",
    tags: ["Landing page", "Public safety", "Android"],
    year: "2026",
    href: "https://la-reserve-landing.vercel.app/",
    brand: "#E8342C",
    images: [
      "/projects/la-reserve/screen-1.webp",
      "/projects/la-reserve/screen-2.webp",
      "/projects/la-reserve/screen-3.webp",
    ],
  },
  {
    slug: "getdraft-web",
    title: "Getdraft",
    description:
      "The site for Getdraft, the sports recruiting app: how athletes and recruiters swipe to Draft and match, its safety rules for minors, and the store downloads.",
    category: "Web Development",
    tags: ["Landing page", "Sports recruiting"],
    year: "2026",
    href: "https://getdraft.net/",
    brand: "#121212",
    caseStudy: "/case-studies/getdraft",
    images: [
      "/projects/getdraft-web/screen-1.webp",
      "/projects/getdraft-web/screen-2.webp",
      "/projects/getdraft-web/screen-3.webp",
    ],
  },
  {
    // The domain is aloulou98.com; the brand calls itself Aloulou 93.
    slug: "aloulou93",
    title: "Aloulou 93",
    description:
      "Online store for the Aloulou 93 clothing brand: shoes, clothes and football jerseys, delivered nationwide and paid on delivery, with order tracking.",
    category: "Web Development",
    tags: ["Next.js", "E-commerce", "Fashion"],
    year: "2026",
    href: "https://aloulou98.com/",
    brand: "#2B4739",
    caseStudy: "/case-studies/aloulou93",
    images: [
      "/projects/aloulou93/screen-1.webp",
      "/projects/aloulou93/screen-2.webp",
      "/projects/aloulou93/screen-3.webp",
    ],
  },
  {
    slug: "boutique-amine",
    title: "Boutique Amine",
    description:
      "An Arabic-first boutique for women's shoes: heels, shoes and boots, delivered nationwide and paid on delivery, with a French version.",
    category: "Web Development",
    tags: ["Next.js", "E-commerce", "Arabic RTL"],
    year: "2026",
    href: "https://boutiqueamine.com/",
    brand: "#C82868",
    images: [
      "/projects/boutique-amine/screen-1.webp",
      "/projects/boutique-amine/screen-2.webp",
      "/projects/boutique-amine/screen-3.webp",
    ],
  },
  {
    slug: "origami-portrait",
    title: "Origami Portrait",
    description:
      "A portrait that folds into paper as a hand closes in front of the camera. MediaPipe reads the hand in the browser, and a vertex shader creases the photograph — no video leaves the device.",
    category: "Computer Vision",
    tags: ["MediaPipe", "Hand Tracking", "Three.js", "WebGL Shaders"],
    year: "2026",
    brand: "#24689B",
    images: ["/portrait.webp"],
  },
  {
    slug: "point-and-pinch-desktop",
    title: "Point & Pinch Desktop",
    description:
      "A desktop driven by the hand instead of a mouse: the index finger steers the cursor and a pinch clicks, filtered so it holds steady on small targets and freezes for the instant of the pinch, so a click lands where it was aimed.",
    category: "Computer Vision",
    tags: ["MediaPipe", "Gesture Control", "React Three Fiber", "TypeScript"],
    year: "2026",
    brand: "#24689B",
    images: ["/origami.webp"],
  },
  {
    slug: "ecommerce-automation",
    title: "E-commerce Workflow Automation",
    description:
      "New Shopify order → saved to Google Sheets → Telegram notification → SMS via Twilio, end to end without a server.",
    category: "AI Automation",
    tags: ["Make.com", "Shopify", "Telegram", "Twilio", "Google Sheets"],
    year: "2025",
    images: ["/projects/ai-automation/ecommerce.webp"],
  },
  {
    slug: "winning-products",
    title: "AliExpress Winning Products Finder",
    description:
      "Fetches AliExpress data, scores products against winning-product heuristics and writes the results to Google Sheets.",
    category: "AI Automation",
    tags: ["Make.com", "AliExpress", "Data Analysis", "Google Sheets"],
    year: "2025",
    images: ["/projects/ai-automation/winnersProduct.webp"],
  },
  {
    slug: "weather-alerts",
    title: "Weather Change Detector",
    description:
      "Polls weather data, detects meaningful change, logs it to Google Sheets and fires alerts over Telegram or HTTP.",
    category: "AI Automation",
    tags: ["Make.com", "Weather API", "Telegram", "Monitoring"],
    year: "2025",
    images: ["/projects/ai-automation/weather.webp"],
  },
  {
    slug: "oneframe-identity",
    title: "ONEFRAME Brand Identity",
    description:
      "Logo and identity for ONEFRAME, our own brand of 3D car frames: a boxed black-and-white wordmark that carries from the website to every box and post.",
    category: "Graphic Design",
    tags: ["Logo", "Brand identity"],
    year: "2025",
    brand: "#111111",
    caseStudy: "/case-studies/oneframe",
    href: "https://www.instagram.com/oneframe.dz?igsh=eGR6Z3ljZ3FkZzFt",
    images: ["/projects/oneframe/road-to-your-walls.webp", "/projects/oneframe/logo-bw.webp"],
  },
  {
    slug: "oneframe-packaging",
    title: "ONEFRAME Packaging",
    description:
      "Packaging design collection featuring custom car-themed artwork for ONEFRAME brand products.",
    category: "Graphic Design",
    tags: ["Packaging", "Branding", "Adobe Illustrator"],
    caseStudy: "/case-studies/oneframe",
    year: "2025",
    href: "https://www.instagram.com/oneframe.dz?igsh=eGR6Z3ljZ3FkZzFt",
    images: [
      "https://res.cloudinary.com/dwvgbojw0/image/upload/f_auto,q_auto/v1765668611/3_mvdmkz.webp",
      "https://res.cloudinary.com/dwvgbojw0/image/upload/f_auto,q_auto/v1765668606/5_zsjru0.webp",
      "https://res.cloudinary.com/dwvgbojw0/image/upload/f_auto,q_auto/v1765668604/2_wdhnke.webp",
      "https://res.cloudinary.com/dwvgbojw0/image/upload/f_auto,q_auto/v1765668609/4_hrie4t.webp",
    ],
  },
  {
    slug: "rital-panels",
    title: "Rital Fast Food Panels",
    description:
      "Large-scale outdoor advertising panels for Rital Fast Food — bold typography and food photography built to read at distance.",
    category: "Graphic Design",
    tags: ["Billboard", "Advertising", "Branding"],
    year: "2025",
    images: [
      "https://res.cloudinary.com/dwvgbojw0/image/upload/f_auto,q_auto/v1765647418/1_gkle1x.webp",
      "https://res.cloudinary.com/dwvgbojw0/image/upload/f_auto,q_auto/v1765661742/10_n9p2ew.webp",
      "https://res.cloudinary.com/dwvgbojw0/image/upload/f_auto,q_auto/v1765647425/3_yzckiq.webp",
      "https://res.cloudinary.com/dwvgbojw0/image/upload/f_auto,q_auto/v1765647413/11_ledogt.webp",
      "https://res.cloudinary.com/dwvgbojw0/image/upload/f_auto,q_auto/v1765661751/5_igcbux.webp",
      "https://res.cloudinary.com/dwvgbojw0/image/upload/f_auto,q_auto/v1765661744/9_bxa46e.webp",
      "https://res.cloudinary.com/dwvgbojw0/image/upload/f_auto,q_auto/v1765647422/7_fcnnqh.webp",
      "https://res.cloudinary.com/dwvgbojw0/image/upload/f_auto,q_auto/v1765661787/13_wlawwc.webp",
    ],
  },
  {
    slug: "rital-branding",
    title: "Rital Fast Food Branding",
    description:
      "Restaurant branding and menu design for Rital Fast Food — visual identity through to plated presentation.",
    category: "Graphic Design",
    tags: ["Branding", "Menu Design", "Restaurant"],
    year: "2025",
    images: [
      "https://res.cloudinary.com/dwvgbojw0/image/upload/f_auto,q_auto/v1765669018/2_boun0k.webp",
      "https://res.cloudinary.com/dwvgbojw0/image/upload/f_auto,q_auto/v1765668973/1_dinedx.webp",
      "https://res.cloudinary.com/dwvgbojw0/image/upload/f_auto,q_auto/v1765668975/3_qbfn6x.webp",
      "https://res.cloudinary.com/dwvgbojw0/image/upload/f_auto,q_auto/v1765668977/4_lsco7q.webp",
      "https://res.cloudinary.com/dwvgbojw0/image/upload/f_auto,q_auto/v1765668979/5_qel7ap.webp",
    ],
  },
  {
    slug: "berchicha-logo",
    title: "Berchicha Store Logo",
    description:
      "Brand identity for Berchicha, a retailer specialising in authentic TN and Lacoste products.",
    category: "Graphic Design",
    tags: ["Logo", "Brand Identity", "Retail"],
    year: "2025",
    href: "https://www.tiktok.com/@originalberchicha04?_r=1&_t=ZS-92BWRZ1BCeG",
    images: [
      "https://res.cloudinary.com/dwvgbojw0/image/upload/f_auto,q_auto/v1765646528/1_wlfegs.webp",
      "https://res.cloudinary.com/dwvgbojw0/image/upload/f_auto,q_auto/v1765646535/2_d70ngg.webp",
      "https://res.cloudinary.com/dwvgbojw0/image/upload/f_auto,q_auto/v1765646536/3_l68alr.webp",
      "https://res.cloudinary.com/dwvgbojw0/image/upload/f_auto,q_auto/v1765662234/4_rv0a6c.webp",
      "https://res.cloudinary.com/dwvgbojw0/image/upload/f_auto,q_auto/v1765646529/5_rxtguc.webp",
      "https://res.cloudinary.com/dwvgbojw0/image/upload/f_auto,q_auto/v1765646528/6_mcgtes.webp",
    ],
  },
  {
    slug: "osca-logo",
    title: "OSCA Logo",
    description:
      "Official logo for OSCA, a scientific club promoting open-source technology among developers.",
    category: "Graphic Design",
    tags: ["Logo", "Brand Identity", "Community"],
    year: "2024",
    href: "https://t.me/OSCommunityChat",
    images: [
      "https://res.cloudinary.com/dwvgbojw0/image/upload/f_auto,q_auto/v1765674697/Screenshot_20251214-020612_g3xfwx.jpg",
      "https://res.cloudinary.com/dwvgbojw0/image/upload/f_auto,q_auto/v1765674745/IMG_20251123_095302_401_cdnnx9.jpg",
    ],
  },
  {
    slug: "school-banners",
    title: "Private School Banners",
    description:
      "Banner designs for اكاديمية طلائع المستقبل (Future Pioneers Academy) in Ain Beida, Oum El Bouaghi.",
    category: "Graphic Design",
    tags: ["Banner", "Educational Branding", "Print"],
    year: "2025",
    href: "https://www.facebook.com/share/1A2rR5FSFm/",
    images: [
      "https://res.cloudinary.com/dwvgbojw0/image/upload/f_auto,q_auto/v1765755966/IMG_20251211_194731_388_uxgrke.jpg",
      "https://res.cloudinary.com/dwvgbojw0/image/upload/f_auto,q_auto/v1765756023/IMG_20251211_194739_264_bxs2n5.jpg",
      "https://res.cloudinary.com/dwvgbojw0/image/upload/f_auto,q_auto/v1765756022/IMG_20251211_194735_861_mmipqs.jpg",
    ],
  },
  {
    slug: "butcher-menu",
    title: "Butcher Pricing Menu",
    description:
      "Pricing menu for a butcher shop in Ain Bidha, Oum Bouaghi — clean layout and traditional butchery typography.",
    category: "Graphic Design",
    tags: ["Menu Design", "Typography", "Print"],
    year: "2025",
    images: [
      "https://res.cloudinary.com/dwvgbojw0/image/upload/f_auto,q_auto/v1765668887/1_jg0sv1.webp",
      "https://res.cloudinary.com/dwvgbojw0/image/upload/f_auto,q_auto/v1765668888/2_gwmo56.webp",
    ],
  },
  {
    slug: "maison-du-choco",
    title: "Maison du Choco Card",
    description:
      "Business card design for Maison du Choco, a premium chocolate and pastry boutique.",
    category: "Graphic Design",
    tags: ["Business Card", "Brand Identity", "Print"],
    year: "2025",
    href: "https://maison-de-choco.vercel.app/",
    images: [
      "https://res.cloudinary.com/dwvgbojw0/image/upload/f_auto,q_auto/v1765669316/1_a12pgv.webp",
    ],
  },
  {
    slug: "dmd-logo",
    title: "DMD Logo",
    description:
      "Logo for DMD, a clothing store. Distinctive branding for fashion retail.",
    category: "Graphic Design",
    tags: ["Logo", "Branding", "Fashion"],
    year: "2025",
    href: "https://www.instagram.com/dmdstore_annaba23?igsh=dGJkbXA1YnV6OWJ5",
    images: [
      "https://res.cloudinary.com/dwvgbojw0/image/upload/f_auto,q_auto/v1765765968/Screenshot_20251213-182824_xdiie9.jpg",
    ],
  },
];

export const projectCategories = [
  "All",
  "Web Development",
  "Mobile Development",
  "Desktop Development",
  "AI Automation",
  "Computer Vision",
  "Graphic Design",
] as const;

/* ── experience ──────────────────────────────────────────────────── */

export interface Experience {
  role: string;
  organisation: string;
  period: string;
  description: string;
  achievements: readonly string[];
  /**
   * A photograph from the time, shown whole beside the entry — never
   * cropped, so the card takes the photo's own shape. Width and height are
   * the file's pixel size; they set the aspect ratio before the image loads.
   */
  image?: {
    src: string;
    width: number;
    height: number;
    alt: string;
    caption: string;
  };
}

export const experiences: readonly Experience[] = [
  {
    role: "Full-Stack Engineer",
    organisation: "PROGIX — Montreal, Canada (remote)",
    period: "May 2026 — Present",
    image: {
      src: "/experience/progix.webp",
      width: 962,
      height: 1240,
      alt: "A laptop showing a Google Meet call with the PROGIX team, eight faces on screen.",
      caption: "On a call with the PROGIX team",
    },
    description:
      "Building web and mobile applications end to end with React, Next.js, Node.js, Express.js and PostgreSQL, as part of a fully remote team.",
    achievements: [
      "REST APIs, database schemas, authentication and application logic",
      "Interactive 3D interfaces with Three.js, UI/UX prototypes and design systems",
      "Debugging, optimisation and deployment",
    ],
  },
  {
    role: "Cybersecurity & Network Intern",
    organisation: "Sonelgaz",
    period: "Feb — Apr 2026",
    image: {
      src: "/experience/sonelgaz-thesis.webp",
      width: 800,
      height: 1035,
      alt: "Cover page of the Master's thesis: Design and Development of an Intelligent and Secure Internal Communication Platform for SONELGAZ Employees, with Artificial Intelligence Integration. Badji Mokhtar University, academic year 2025/2026.",
      caption: "The Master's thesis, on the Sonelgaz platform",
    },
    description:
      "Designed and developed a secure internal communication platform for Sonelgaz employees.",
    achievements: [
      "Role-based access control, strong authentication and encrypted communication",
      "Explored AI-assisted anomaly detection for monitoring suspicious activity",
    ],
  },
  {
    role: "Master's Degree (MSc), Network & Information Security",
    organisation: "Badji Mokhtar University",
    period: "2026",
    image: {
      src: "/experience/msc.webp",
      width: 1008,
      height: 1318,
      alt: "Achraf in a graduation sash holding a cap that reads “I did it”, seated on the steps of the Department of Computer Science.",
      caption: "Graduation, Department of Computer Science",
    },
    description:
      "Advanced study in cybersecurity, network architecture and information protection.",
    achievements: [
      "Cybersecurity and threat modelling",
      "Network architecture and security protocols",
      "Information protection systems",
    ],
  },
  {
    // TODO: studio name and exact period still to come from Achraf.
    role: "Graphic Designer",
    organisation: "Design studio",
    period: "2025",
    image: {
      src: "/experience/design.webp",
      width: 1080,
      height: 607,
      alt: "Achraf at a desk in a design studio, a “Graphic Design” sign on the wall behind him and a laptop open beside him.",
      caption: "At the studio",
    },
    description:
      "Print and identity work for local businesses — outdoor advertising panels and menus for Rital Fast Food, packaging for ONEFRAME, logos for DMD and Berchicha Store.",
    achievements: [
      "Brand identities and logos",
      "Large-format print: panels, banners, menus and packaging",
      "Adobe Illustrator, Photoshop and Inkscape",
    ],
  },
  {
    role: "Bachelor's Degree, Computer Science",
    organisation: "Badji Mokhtar University",
    period: "2024",
    image: {
      src: "/experience/bsc-graduation.webp",
      width: 1080,
      height: 810,
      alt: "Four graduates in gowns and “Yes I did it” sashes in front of the brick wall of Badji Mokhtar University, one holding his cap in the air.",
      caption: "Graduation day, Badji Mokhtar University",
    },
    description:
      "Foundation in computer science, programming and system design.",
    achievements: [
      "Computer science fundamentals",
      "Programming and software development",
      "System design and architecture",
    ],
  },
  {
    role: "Co-Founder & UI/UX Design Kernel Lead",
    organisation: "Open-Source Community (OSCA)",
    period: "2023 — 2025",
    image: {
      src: "/experience/osc.webp",
      width: 719,
      height: 943,
      alt: "A classroom design session: the OSC monogram open in Inkscape on a laptop, mirrored on the projector screen behind it.",
      caption: "Drawing the OSC logo in Inkscape, at a session",
    },
    description:
      "Co-founded the Computer Science Department's Open-Source Community Club and led its design kernel.",
    achievements: [
      "Mentored students in graphic design and UI/UX through volunteer training sessions",
      "Maintained the computer labs",
      "Organised events, including the international Study in Japan event",
    ],
  },
  {
    role: "Team Lead & Co-Founder",
    organisation: "Smart Dental Platform Startup, Badji Mokhtar University",
    period: "2023 — 2024",
    image: {
      src: "/experience/podium.webp",
      width: 403,
      height: 535,
      alt: "Achraf speaking into a microphone at a lectern beside a flag, an audience seated to the left.",
      caption: "Pitching the platform at Badji Mokhtar University",
    },
    description:
      "Led a team across the Medicine and Technology faculties to build a smart dental SaaS platform.",
    achievements: [
      "Built the frontend, backend and UI/UX",
      "The project obtained a Startup Brevet",
    ],
  },
];

/* ── certifications ──────────────────────────────────────────────── */

export type CertificationKind =
  | "degree"
  | "security"
  | "automation"
  | "recognition";

export const certificationKinds: Record<CertificationKind, string> = {
  degree: "DEGREE",
  security: "SECURITY",
  automation: "AUTOMATION",
  recognition: "RECOGNITION",
};

export interface Certification {
  title: string;
  issuer: string;
  /** As shown: a year, or the span of the work it recognises. */
  date: string;
  /** When it was issued, ISO, as far as the document says — for ordering.
   *  "2024" alone sorts after every dated day in 2024. */
  issued: string;
  kind: CertificationKind;
  /** The certificate itself, at the file's pixel size. Absent until scanned. */
  image?: {
    src: string;
    width: number;
    height: number;
  };
  skills: readonly string[];
}

export const certifications: readonly Certification[] = [
  {
    title: "Master's Degree in Networks & Computer Security",
    issuer: "Badji Mokhtar University",
    date: "2026",
    issued: "2026-07-01",
    kind: "degree",
    image: {
      src: "/certifications/masters-degree.webp",
      width: 1280,
      height: 905,
    },
    skills: [
      "Network Security",
      "Information Security",
      "Secure Communication",
      "Authentication & Access Control",
    ],
  },
  {
    title: "CRTOM — Certified Red Team Operations Management",
    issuer: "Red Team Leaders",
    date: "2025",
    issued: "2025-12-24",
    kind: "security",
    image: {
      src: "/certifications/crtom.webp",
      width: 823,
      height: 618,
    },
    skills: [
      "Red Team Operations",
      "Adversary Emulation",
      "Engagement Management",
      "Reporting",
    ],
  },
  {
    title: "Investigating Ransomware — Workshop",
    issuer: "Cyber Triage",
    date: "2025",
    issued: "2025-12-24",
    kind: "security",
    image: {
      src: "/certifications/cyber-triage-ransomware.webp",
      width: 1025,
      height: 719,
    },
    skills: [
      "Incident Response",
      "Digital Forensics",
      "Ransomware Investigation",
    ],
  },
  {
    title: "Introduction to Cybersecurity",
    issuer: "Cisco Networking Academy",
    date: "2025",
    issued: "2025-12-23",
    kind: "security",
    image: {
      src: "/certifications/cisco-intro-cybersecurity.webp",
      width: 1080,
      height: 826,
    },
    skills: [
      "Cyber Threats & Vulnerabilities",
      "Online Safety",
      "Organisational Defence",
      "Cisco Networking",
    ],
  },
  {
    title: "Make Basics Certification",
    issuer: "Make.com",
    date: "2025",
    issued: "2025-07-06",
    kind: "automation",
    image: {
      src: "/certifications/make-basics.webp",
      width: 790,
      height: 606,
    },
    skills: [
      "AI Automation",
      "Workflow Design",
      "API Integration",
      "No-Code Development",
    ],
  },
  {
    title: "Make Foundation Certification",
    issuer: "Make.com",
    date: "2025",
    issued: "2025-07-03",
    kind: "automation",
    image: {
      src: "/certifications/make-foundation.webp",
      width: 790,
      height: 606,
    },
    skills: [
      "AI Agents",
      "Advanced Automation",
      "Scenario Building",
      "System Integration",
    ],
  },
  {
    title: "Bachelor's Degree in Computer Systems",
    issuer: "Badji Mokhtar University",
    date: "2024",
    issued: "2024-07-21",
    kind: "degree",
    image: {
      src: "/certifications/bachelors-degree.webp",
      width: 1280,
      height: 910,
    },
    skills: [
      "Computer Science",
      "Software Engineering",
      "Network Security",
      "Databases",
      "Algorithms",
    ],
  },
  {
    title: "Startup Brevet — Smart Dental Platform",
    issuer: "Badji Mokhtar University",
    date: "2023 — 2024",
    issued: "2024-06-29",
    kind: "recognition",
    image: {
      src: "/certifications/startup-brevet.webp",
      width: 800,
      height: 636,
    },
    skills: [
      "Project Leadership",
      "Full-Stack Development",
      "Healthcare Technology",
      "Entrepreneurship",
    ],
  },
  {
    title: "Open-Source Community Leader",
    issuer: "OSCA — Computer Science Department",
    date: "2023 — 2024",
    issued: "2024",
    kind: "recognition",
    image: {
      src: "/certifications/club-founder.webp",
      width: 800,
      height: 630,
    },
    skills: [
      "Leadership",
      "Community Management",
      "Event Planning",
      "Open Source",
    ],
  },
  {
    title: "Event Organizer — Study in Japan 2024",
    issuer: "Open-Source Community (OSCA)",
    date: "2024",
    issued: "2024",
    kind: "recognition",
    image: {
      src: "/certifications/events-organizer.webp",
      width: 818,
      height: 634,
    },
    skills: [
      "Event Management",
      "International Relations",
      "Public Speaking",
      "Coordination",
    ],
  },
];

/* ── skills ──────────────────────────────────────────────────────── */

export const skillGroups = [
  {
    label: "WEB",
    items: [
      "HTML & CSS",
      "JavaScript",
      "TypeScript",
      "React",
      "Next.js",
      "Node.js",
      "Express.js",
    ],
  },
  {
    label: "SECURITY & SYSTEMS",
    items: [
      "Network Security",
      "Intrusion Detection",
      "Python",
      "Cisco Networking",
    ],
  },
  {
    label: "AUTOMATION",
    items: ["Make.com", "AI Agents", "API Integration", "Webhooks"],
  },
  {
    label: "DESIGN",
    items: ["UI/UX", "Figma", "Adobe Illustrator", "Photoshop", "Branding"],
  },
] as const;
