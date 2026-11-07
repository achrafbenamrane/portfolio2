import layers from "./museum-frames.json";
import layout from "./museum-layout.json";

/**
 * The ONEFRAME museum's collection, and where everything in it stands.
 *
 * The positions come from the Blender build (scripts/blender/build_museum.py) and the
 * layers from scripts/museum_frames.py, so the page and the model cannot disagree.
 * Blender is Z-up and three.js is Y-up: go through toWeb().
 */
export const museumLayout = layout;
export const frameLayers = layers;

export const toWeb = (x: number, y: number, z: number): [number, number, number] => [x, z, -y];

export type FrameSlug = keyof typeof layers;

export interface MuseumFrame {
  slug: FrameSlug;
  name: string;
  /** The line printed with it, in ONEFRAME's own words. */
  line: string;
}

/** In the order they hang, left to right. */
export const MUSEUM_FRAMES: readonly MuseumFrame[] = [
  { slug: "camaro", name: "Chevrolet Camaro", line: "Born to Lead" },
  { slug: "amg", name: "Mercedes-AMG", line: "Power in Motion" },
  { slug: "lotus", name: "Lotus T127", line: "The Lotus Legacy" },
  { slug: "brezina", name: "Brezina", line: "Explore the Algerian Arizona" },
  { slug: "just-go-out", name: "Just Go Out", line: "Make memories with your van" },
  { slug: "bike-life", name: "Bike Life", line: "Where bikes meet mountains, adventure is born" },
];

export const ONEFRAME_STORE = "https://oneframe.me";
