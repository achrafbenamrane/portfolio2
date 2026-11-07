import type { HandReading, Point } from "@/lib/vision/puppet-sensor";

/*
 * Reading a hand: which fingers are out, and so what shape it's making. Everything's measured
 * on the model's 3D hand in metres, not the picture, so it doesn't matter how far from the
 * camera the operator is standing, or how the hand is turned.
 */

export type HandShape = "open" | "fist" | "two" | "one" | "pinch" | "unsure";

const WRIST = 0;
const THUMB_IP = 3;
const THUMB_TIP = 4;
const FINGERS = [
  { tip: 8, knuckle: 6 },
  { tip: 12, knuckle: 10 },
  { tip: 16, knuckle: 14 },
  { tip: 20, knuckle: 18 },
];
const INDEX_BASE = 5;
const MIDDLE_BASE = 9;
const PINKY_BASE = 17;

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** A finger's out when its tip is clearly further from the wrist than its middle joint. */
export function fingersOut(world: Point[]) {
  return FINGERS.map(({ tip, knuckle }) => distance(world[tip], world[WRIST]) > distance(world[knuckle], world[WRIST]) * 1.08);
}

export function shapeOf(world: Point[]): HandShape {
  const out = fingersOut(world);
  const count = out.filter(Boolean).length;
  const palm = distance(world[WRIST], world[MIDDLE_BASE]);

  // Thumb and finger together, with the other fingers free: the universal "that one".
  if (distance(world[THUMB_TIP], world[8]) < palm * 0.3 && (out[1] || out[2] || out[3])) return "pinch";
  if (count === 0) return "fist";
  if (count >= 4) return "open";
  if (count === 2 && out[0] && out[1]) return "two";
  if (count === 1 && out[0]) return "one";
  if (count === 3) return "open";
  return "unsure";
}

/** Whether the thumb is out as well: used to tell an open hand from a loose one. */
export function thumbOut(world: Point[]) {
  return distance(world[THUMB_TIP], world[PINKY_BASE]) > distance(world[THUMB_IP], world[PINKY_BASE]) * 1.05;
}

/** The middle of the palm in the picture, mirrored so it matches what the operator sees. */
export function palmOf(hand: HandReading) {
  const p = hand.points;
  return {
    x: 1 - (p[WRIST].x + p[INDEX_BASE].x + p[PINKY_BASE].x) / 3,
    y: (p[WRIST].y + p[INDEX_BASE].y + p[PINKY_BASE].y) / 3,
  };
}

/** How big the hand looks. It's what makes every movement scale with distance from the camera. */
export function sizeOf(hand: HandReading, aspect: number) {
  const p = hand.points;
  return Math.hypot((p[WRIST].x - p[MIDDLE_BASE].x) * aspect, p[WRIST].y - p[MIDDLE_BASE].y);
}

/** How far the hand is rolled from upright, in radians. Positive leans it to the operator's right. */
export function rollOf(hand: HandReading, aspect: number) {
  const p = hand.points;
  return Math.atan2(-(p[MIDDLE_BASE].x - p[WRIST].x) * aspect, -(p[MIDDLE_BASE].y - p[WRIST].y));
}

/** Fingertips, in the picture, mirrored. Thumb first. */
export const TIPS = [4, 8, 12, 16, 20];

export const BONES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];
