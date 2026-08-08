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
    "I combine development, design and security to build modern digital solutions.",

  bio: "Full-Stack Developer, UI/UX Designer, Graphic Designer, and Network & Information Security Engineer. Currently reading a Master's in Network & Information Security at Badji Mokhtar University, Annaba.",

  availability: "AVAILABLE FOR WORK",
  location: "ANNABA, ALGERIA",

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
    { label: "Instagram", href: "https://instagram.com/adventurero_dz" },
  ],
} as const;

/* ── projects ────────────────────────────────────────────────────── */

export type ProjectCategory =
  | "Web Development"
  | "Mobile Development"
  | "Desktop Development"
  | "AI Automation"
  | "Graphic Design";

export interface Project {
  slug: string;
  title: string;
  description: string;
  category: ProjectCategory;
  tags: readonly string[];
  year: string;
  /** First image is the index-row preview. */
  images: readonly string[];
  href?: string;
}

export const projects: readonly Project[] = [
  {
    slug: "neemafood",
    title: "NeemaFood",
    description:
      "Mobile application connecting local food vendors with customers looking for great food deals. Real-time vendor discovery, seamless ordering, secure payments and personalised recommendations.",
    category: "Mobile Development",
    tags: ["React Native", "Firebase", "Real-time", "Food Delivery"],
    year: "2026",
    href: "https://neemafood.vercel.app/",
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
  {
    slug: "smart-dental",
    title: "Smart Dental Platform",
    description:
      "Healthcare platform built with the Medicine and Technology faculties, connecting patients and dental practitioners. Earned a startup brevet for innovative project development.",
    category: "Web Development",
    tags: ["Full-Stack", "Healthcare", "Innovation"],
    year: "2024",
    href: "https://smiley.vercel.app",
    images: [
      "/projects/smiley/1.webp",
      "/projects/smiley/2.webp",
      "/projects/smiley/3.webp",
      "/projects/smiley/4.webp",
      "/projects/smiley/5.webp",
    ],
  },
  {
    slug: "desktop-ids",
    title: "Desktop IDS",
    description:
      "Advanced intrusion detection system for desktop networks — packet inspection, signature matching and live alerting.",
    category: "Desktop Development",
    tags: ["Python", "Security", "Network", "Desktop App"],
    year: "2025",
    href: "https://desktop-ids.vercel.app/",
    images: [
      "/projects/ids/1.webp",
      "/projects/ids/2.webp",
      "/projects/ids/3.webp",
    ],
  },
  {
    slug: "oneframe",
    title: "ONEFRAME",
    description:
      "E-commerce storefront built for my own brand, from product pages through to checkout.",
    category: "Web Development",
    tags: ["E-commerce", "Next.js", "Stripe"],
    year: "2025",
    href: "https://oneframe.me",
    images: ["/projects/ONEFRAME.webp"],
  },
  {
    slug: "manliness-ebook",
    title: "Manliness Evolution Ebook",
    description:
      "Interactive digital book exploring modern masculinity and personal growth, with a smooth paged reading experience.",
    category: "Web Development",
    tags: ["Next.js", "TypeScript", "Interactive", "Digital Publishing"],
    year: "2025",
    href: "https://manliness-smart-book.vercel.app",
    images: [
      "/projects/ebook/1.webp",
      "/projects/ebook/2.webp",
      "/projects/ebook/3.webp",
    ],
  },
  {
    slug: "student-portal",
    title: "Student Reclamation Portal",
    description:
      "Student complaint management system with automated Telegram notifications — reclamations route straight to class delegates for quick resolution.",
    category: "Web Development",
    tags: ["Web App", "Telegram Bot", "Automation", "Issue Tracking"],
    year: "2025",
    href: "https://student-reclamation-portal.vercel.app/",
    images: ["/projects/student/1.webp"],
  },
  {
    slug: "rsi-calculator",
    title: "RSI Calculator",
    description:
      "Semester average calculator for tracking academic progress, built around the university's own grading rules.",
    category: "Web Development",
    tags: ["React", "Education", "Grade Calculator"],
    year: "2024",
    href: "https://rsi-calculator-m2.vercel.app/",
    images: ["/projects/calculator/calculator.png"],
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
    slug: "oneframe-packaging",
    title: "ONEFRAME Packaging",
    description:
      "Packaging design collection featuring custom car-themed artwork for ONEFRAME brand products.",
    category: "Graphic Design",
    tags: ["Packaging", "Branding", "Adobe Illustrator"],
    year: "2025",
    href: "https://www.instagram.com/oneframe.dz?igsh=eGR6Z3ljZ3FkZzFt",
    images: [
      "https://res.cloudinary.com/dwvgbojw0/image/upload/f_auto,q_auto/v1765668604/1_hdwbhl.webp",
      "https://res.cloudinary.com/dwvgbojw0/image/upload/f_auto,q_auto/v1765668605/6_hzpruh.webp",
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
      "Large-scale outdoor advertising panels for Rital Fast Food, Sidi Amar, Annaba — bold typography and food photography built to read at distance.",
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
      "Restaurant branding and menu design for Rital Fast Food in Sidi Amar, Annaba — visual identity through to plated presentation.",
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
      "Brand identity for Berchicha, an Algerian retailer specialising in authentic TN and Lacoste products.",
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
      "Official logo for the Open Source Community Annaba, a scientific club promoting open-source technology among developers in Annaba.",
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
      "Logo for DMD, an Algerian clothing store in Annaba. Distinctive branding for Algerian fashion retail.",
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
  "Graphic Design",
] as const;

/* ── experience ──────────────────────────────────────────────────── */

export interface Experience {
  role: string;
  organisation: string;
  period: string;
  description: string;
  achievements: readonly string[];
}

export const experiences: readonly Experience[] = [
  {
    role: "Freelance Designer & Developer",
    organisation: "Freelance",
    period: "2025 — Present",
    description:
      "Web development and design for clients: responsive, user-friendly sites built on UI/UX principles and graphic design expertise.",
    achievements: [
      "Built responsive, user-friendly websites end to end",
      "Applied UI/UX principles and graphic design expertise",
      "Managed projects directly with clients",
    ],
  },
  {
    role: "Master's 1, Network & Information Security",
    organisation: "Badji Mokhtar University, Annaba",
    period: "2025",
    description:
      "Advanced study in cybersecurity, network architecture and information protection.",
    achievements: [
      "Cybersecurity and threat modelling",
      "Network architecture and security protocols",
      "Information protection systems",
    ],
  },
  {
    role: "Bachelor's Degree, Computer Systems",
    organisation: "Badji Mokhtar University, Annaba",
    period: "2024",
    description:
      "Foundation in computer science, programming and system design.",
    achievements: [
      "Computer science fundamentals",
      "Programming and software development",
      "System design and architecture",
    ],
  },
  {
    role: "Leader, Graphic & UI/UX Design Kernel",
    organisation: "Open-Source Community Annaba",
    period: "2023 — 2024",
    description:
      "Led the design kernel and mentored students in graphic and UI/UX design through volunteer training sessions.",
    achievements: [
      "Mentored students in graphic and UI/UX design",
      "Ran volunteer training sessions",
      "Built leadership and communication practice",
    ],
  },
  {
    role: "Co-Founder, Smart Dental Platform",
    organisation: "Badji Mokhtar University, Annaba",
    period: "2023 — 2024",
    description:
      "Collaborated across the Medicine and Technology faculties to build a smart dental platform.",
    achievements: [
      "Built the platform with cross-faculty collaboration",
      "Earned a startup brevet for innovation",
      "Bridged technology and healthcare",
    ],
  },
  {
    role: "Co-Founder, Open-Source Community Club",
    organisation: "Computer Science Department, Annaba",
    period: "2023 — 2024",
    description:
      "Founded the department's Open-Source Community Club, maintained the computer labs and organised events including the international 'Study in Japan Annaba 2024'.",
    achievements: [
      "Founded the Open-Source Community Club",
      "Maintained computer labs, officially certified for the work",
      "Organised 'Study in Japan Annaba 2024'",
    ],
  },
];

/* ── certifications ──────────────────────────────────────────────── */

export interface Certification {
  title: string;
  issuer: string;
  date: string;
  image: string;
  skills: readonly string[];
}

export const certifications: readonly Certification[] = [
  {
    title: "Bachelor's Degree in Computer Systems",
    issuer: "Badji Mokhtar University, Annaba",
    date: "2024",
    image: "/certifications/bachelors-degree.webp",
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
    issuer: "Badji Mokhtar University, Annaba",
    date: "2023 — 2024",
    image: "/certifications/startup-brevet.webp",
    skills: [
      "Project Leadership",
      "Full-Stack Development",
      "Healthcare Technology",
      "Entrepreneurship",
    ],
  },
  {
    title: "Open-Source Community Leader",
    issuer: "OSC Annaba — Computer Science Department",
    date: "2023 — 2024",
    image: "/certifications/club-founder.webp",
    skills: [
      "Leadership",
      "Community Management",
      "Event Planning",
      "Open Source",
    ],
  },
  {
    title: "Event Organizer — Study in Japan 2024",
    issuer: "Open-Source Community Annaba",
    date: "2024",
    image: "/certifications/events-organizer.webp",
    skills: [
      "Event Management",
      "International Relations",
      "Public Speaking",
      "Coordination",
    ],
  },
  {
    title: "Make Foundation Certification",
    issuer: "Make.com",
    date: "2024",
    image: "/certifications/make-foundation.webp",
    skills: [
      "AI Agents",
      "Advanced Automation",
      "Scenario Building",
      "System Integration",
    ],
  },
  {
    title: "Make Basics Certification",
    issuer: "Make.com",
    date: "2024",
    image: "/certifications/make-basics.webp",
    skills: [
      "AI Automation",
      "Workflow Design",
      "API Integration",
      "No-Code Development",
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
