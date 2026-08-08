import { clamp, dot, LM, normalize, subtract, type Vec3 } from "./landmarks";
import { DEFAULT_ONE_EURO, type OneEuroParams } from "./one-euro";

/**
 * Hand openness from finger curl angles.
 *
 * The obvious metric — fingertip-to-palm distance — is wrong. It is not scale
 * invariant, so the value drifts as you lean toward or away from the camera and
 * the character morphs when your hand hasn't moved.
 *
 * Instead we measure the angle at each finger's PIP joint: the turn between the
 * proximal segment (MCP→PIP) and the distal one (PIP→TIP). That angle is a
 * property of the finger's pose alone — invariant to hand distance, position,
 * and rotation.
 *
 * Fed with MediaPipe `worldLandmarks` (metric, origin at the hand's geometric
 * center) rather than the image-normalized ones, which are stretched by the
 * frame's aspect ratio and would skew the angles.
 */

/** [MCP, PIP, TIP] per finger. The thumb is excluded — see below. */
const FINGER_CHAINS: ReadonlyArray<readonly [number, number, number]> = [
  [LM.INDEX_MCP, LM.INDEX_PIP, LM.INDEX_TIP],
  [LM.MIDDLE_MCP, LM.MIDDLE_PIP, LM.MIDDLE_TIP],
  [LM.RING_MCP, LM.RING_PIP, LM.RING_TIP],
  [LM.PINKY_MCP, LM.PINKY_PIP, LM.PINKY_TIP],
];

export const FINGER_NAMES = ["index", "middle", "ring", "pinky"] as const;

export interface OpennessConfig extends OneEuroParams {
  /** Curl angle in radians treated as fully closed. ~2.2 rad ≈ 126°. */
  curlMax: number;
  /** Flat region at each end of the range. Guarantees the extremes are exact. */
  deadzone: number;
}

export const DEFAULT_OPENNESS_CONFIG: OpennessConfig = {
  ...DEFAULT_ONE_EURO,
  curlMax: 2.2,
  deadzone: 0.08,
};

/**
 * Per-finger openness, 0 = fully curled, 1 = straight.
 *
 * The thumb is deliberately left out. Its landmarks are the least stable of the
 * five, it curls across a different axis, and users don't think of thumb
 * position as part of "open" vs "closed" anyway — including it adds noise and
 * costs nothing to drop.
 */
export function fingerOpenness(
  world: readonly Vec3[],
  curlMax: number,
  out: number[] = [],
): number[] {
  out.length = FINGER_CHAINS.length;

  for (let i = 0; i < FINGER_CHAINS.length; i++) {
    const [mcp, pip, tip] = FINGER_CHAINS[i];
    const proximal = normalize(subtract(world[pip], world[mcp]));
    const distal = normalize(subtract(world[tip], world[pip]));
    const curl = Math.acos(clamp(dot(proximal, distal), -1, 1));
    out[i] = 1 - clamp(curl / curlMax, 0, 1);
  }

  return out;
}

/** Mean per-finger openness. Uncalibrated — feed this to the filter. */
export function rawOpenness(world: readonly Vec3[], curlMax: number): number {
  const per = fingerOpenness(world, curlMax);
  let sum = 0;
  for (const v of per) sum += v;
  return sum / per.length;
}

/**
 * Self-calibrating range.
 *
 * Fixed calibration constants cannot work here. The raw curl a hand produces
 * depends on the hand, the camera, the lens, and how far away the person sits —
 * hardcoded bounds mean a fully open hand reads 79% for one visitor and 110%
 * for the next. This tracks the range it actually observes instead.
 *
 * Bounds jump outward instantly and contract slowly, so an extreme is adopted
 * on the first frame that shows it and a stale one fades over seconds. The
 * clamps on each bound are what make a held pose still read correctly: a hand
 * held open forever can only push `min` up to CLOSED_CEIL, never up to itself,
 * so it keeps reading fully open rather than drifting to the middle.
 */
const OPEN_FLOOR = 0.55;
const CLOSED_CEIL = 0.35;
const RELAX_PER_SECOND = 0.04;

export class AdaptiveRange {
  min = CLOSED_CEIL;
  max = OPEN_FLOOR;

  normalize(value: number, dt: number): number {
    const relax = RELAX_PER_SECOND * Math.min(dt, 0.25);
    this.max = Math.max(value, Math.max(this.max - relax, OPEN_FLOOR));
    this.min = Math.min(value, Math.min(this.min + relax, CLOSED_CEIL));
    return clamp((value - this.min) / (this.max - this.min), 0, 1);
  }

  reset(): void {
    this.min = CLOSED_CEIL;
    this.max = OPEN_FLOOR;
  }
}

/**
 * Flattens both ends of the range.
 *
 * Without this the last few percent of hand travel still produce visible
 * movement, so a fully open hand never quite yields a whole image. The flat
 * regions make the extremes exact and absorb tracking jitter there.
 */
export function applyDeadzone(value: number, deadzone: number): number {
  return clamp((value - deadzone) / (1 - 2 * deadzone), 0, 1);
}

/**
 * Discrete open/closed state with hysteresis.
 *
 * The gap between the thresholds is the entire point — a single threshold makes
 * the state flicker while you hover near it.
 */
export const GESTURE_ENTER_CLOSED = 0.25;
export const GESTURE_EXIT_CLOSED = 0.45;

export function nextClosedState(openness: number, wasClosed: boolean): boolean {
  if (wasClosed) return openness < GESTURE_EXIT_CLOSED;
  return openness < GESTURE_ENTER_CLOSED;
}
