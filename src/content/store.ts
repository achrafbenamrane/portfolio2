import layout from "./store-layout.json";

/**
 * The sports store's catalogue, and where its fixtures stand.
 *
 * The positions come from the Blender build (scripts/blender/build_store.py),
 * which writes store-layout.json, so the page and the model cannot disagree about
 * where a shirt hangs. Blender is Z-up and three.js is Y-up: go through toWeb().
 *
 * These are concept kits in club colours, with our own monograms, and Wolfexo where
 * a sponsor would be. Nothing here is official or for sale.
 */
export const storeLayout = layout;

export const toWeb = (x: number, y: number, z: number): [number, number, number] => [x, z, -y];

export type KitSlug =
  | "barcelona"
  | "real-madrid"
  | "man-city"
  | "liverpool"
  | "bayern"
  | "juventus"
  | "paris"
  | "milan";

export interface Kit {
  slug: KitSlug;
  club: string;
  /** The pattern and trim, as painted by scripts/store_kits.py. */
  blurb: string;
  price: number;
  /** The kit's main colour, for its swatch in the picker. */
  swatch: string;
  /** A second colour for striped and banded kits. */
  swatchTwo?: string;
}

/** In the order they hang on the wall, left to right. */
export const KITS: readonly Kit[] = [
  {
    slug: "barcelona",
    club: "FC Barcelona",
    blurb: "Blue and garnet stripes, navy ribbed collar with a gold tip.",
    price: 95,
    swatch: "#A50044",
    swatchTwo: "#004D98",
  },
  {
    slug: "real-madrid",
    club: "Real Madrid",
    blurb: "White with a fine pinstripe, gold tipping on the collar and cuffs.",
    price: 95,
    swatch: "#F4F3EE",
    swatchTwo: "#B8912F",
  },
  {
    slug: "man-city",
    club: "Manchester City",
    blurb: "Sky blue with a tonal chevron, navy collar and cuffs.",
    price: 89,
    swatch: "#74B3E3",
    swatchTwo: "#14305A",
  },
  {
    slug: "liverpool",
    club: "Liverpool",
    blurb: "All red with a fine pinstripe, cream tipping on the collar and cuffs.",
    price: 89,
    swatch: "#C8102E",
    swatchTwo: "#F2E9C9",
  },
  {
    slug: "bayern",
    club: "Bayern Munich",
    blurb: "Red with a tonal diamond weave, white collar and cuffs.",
    price: 89,
    swatch: "#DC052D",
    swatchTwo: "#FFFFFF",
  },
  {
    slug: "juventus",
    club: "Juventus",
    blurb: "Black and white stripes, black sleeves, gold print.",
    price: 85,
    swatch: "#141414",
    swatchTwo: "#F2F2EF",
  },
  {
    slug: "paris",
    club: "Paris Saint-Germain",
    blurb: "Navy with a red band down the centre, edged in white.",
    price: 89,
    swatch: "#0B2147",
    swatchTwo: "#DA291C",
  },
  {
    slug: "milan",
    club: "AC Milan",
    blurb: "Red and black stripes, black sleeves, red tipping on the cuffs.",
    price: 85,
    swatch: "#C4142B",
    swatchTwo: "#101010",
  },
];

export const SIZES = ["S", "M", "L", "XL"] as const;
export type Size = (typeof SIZES)[number];

export function kitBySlug(slug: KitSlug): Kit {
  const kit = KITS.find((candidate) => candidate.slug === slug);
  if (!kit) throw new Error(`No such kit: ${slug}`);
  return kit;
}

/** What's on the 3D websites page. One so far; the page is built for more. */
export const THREE_D_SITES = [
  {
    slug: "sports-store",
    href: "/3d/sports-store",
    title: "Sports store",
    summary:
      "A football shop you walk into. Watch the sales floor from the corner camera, take a shirt off the wall and turn it in your hands, then step up to the mirror and wear it.",
    poster: "/store/poster.webp",
    tags: ["Blender", "Three.js", "Computer vision", "On-device"],
    brand: "#8F1024",
    alt: "A white football shop seen from a high corner, with a chrome rail of shirts, a deep red counter and a tall mirror.",
    cta: "Enter the store",
  },
  {
    slug: "oneframe-museum",
    href: "/3d/oneframe-museum",
    title: "The ONEFRAME museum",
    summary:
      "A black hall built like the product it shows. Your screen becomes a window: move your head and you look into each frame, lean in and you walk closer. Then bring a car out of its frame, and hang it on your own wall.",
    poster: "/museum/poster.webp",
    tags: ["Blender", "Three.js", "Head tracking", "On-device"],
    brand: "#111111",
    alt: "A black gallery with a polished floor: lit ONEFRAME frames along one wall, each throwing its own colour, under one long bar of light.",
    cta: "Enter the museum",
  },
  {
    slug: "pizza-kitchen",
    href: "/3d/pizza-kitchen",
    title: "Wolfexo Fast Food",
    summary:
      "A whole Italian pizzeria. See the room from the corner, take a seat, and leaf through a menu that's a real book. Then make the pizza yourself, and watch the chef slide it into the wood-fired oven.",
    poster: "/pizza/cover.webp",
    tags: ["Blender", "Three.js", "Hand tracking", "On-device"],
    brand: "#B3122A",
    alt: "A chef in a white toque and green apron sliding a pizza on a long peel into a wood-fired brick oven, in a pizzeria with red and white checked tables.",
    cta: "Enter the pizzeria",
  },
  {
    slug: "2090",
    href: "/3d/2090",
    title: "Tether",
    summary:
      "A space game you play with your hands. It's 2090: your robot is on the Moon and you're not. Walk it, fight with it, then fly a warship into orbit, all through your webcam.",
    poster: "/2090/tether-cover.webp",
    tags: ["Blender", "Three.js", "Hand tracking", "Body tracking", "On-device"],
    brand: "#B3122A",
    alt: "A battered white robot seen from behind, standing on the Moon and looking up at the Earth.",
    cta: "Play Tether",
  },
  {
    slug: "alger-la-nuit",
    href: "/3d/alger-la-nuit",
    title: "Alger la Nuit",
    summary:
      "An open map of Algiers at night: nearly 600 km of real streets, on a supercharged motorcycle, in any direction you like. A map in the corner leads you to the city's famous places, from Maqam Echahid to the Great Mosque. Ride it with your keyboard, or with your bare hands on invisible handlebars.",
    poster: "/moto/alger-la-nuit-night.webp",
    tags: ["Blender", "Three.js", "OpenStreetMap", "Hand tracking", "On-device"],
    brand: "#B3122A",
    alt: "Achraf in black race leathers, smiling, black helmet in hand, standing behind a Kawasaki Ninja H2R with its green frame on a street in central Algiers at night, with Algerian flags flying behind him.",
    cta: "Ride Alger la Nuit",
  },
] as const;
