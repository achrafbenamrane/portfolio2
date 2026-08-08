import { clamp, LM, type Vec3 } from "./landmarks";
import { OneEuroFilter, type OneEuroParams } from "./one-euro";

/**
 * Turns hand landmarks into a screen pointer with a pinch click.
 *
 * Deliberately separate from `openness.ts`, which measures a slow morph. A
 * pointer is a different signal with different failure modes, and the two
 * cannot share a filter tuning — see the beta note below.
 */

/**
 * `beta` scales with the signal's own velocity units, so it cannot be carried
 * over from the openness filter. Openness is 0..1 changing at ~1/s, so its
 * beta of 0.007 is effectively a fixed 1 Hz low-pass. A cursor in viewport
 * units moves at ~3/s on a flick; reusing 0.007 would give a cursor with 160 ms
 * of lag that never lets go.
 */
export const DEFAULT_POINTER_ONE_EURO: OneEuroParams = {
  minCutoff: 1.0,
  beta: 6.0,
  dCutoff: 1.0,
};

/**
 * Pinch is measured in 3D on the world landmarks and divided by the wrist →
 * middle-MCP span. That reference is MediaPipe's own ROI axis: it crosses the
 * near-rigid palm, so it is invariant to finger pose, hand size and camera
 * distance. Measuring the pinch in image space instead collapses to near-zero
 * whenever the palm turns edge-on, and fires constantly.
 */
export const PINCH_ENTER = 0.3;
export const PINCH_EXIT = 0.45;

/** Blend toward the knuckle: fingertips are MediaPipe's jitteriest landmarks. */
const TIP_WEIGHT = 0.7;

/** Hand travel covers far less of the frame than the frame covers, so the
 *  observed rectangle is stretched to the full screen. Span clamps bound the
 *  resulting gain to roughly 1.8×–4.5×. */
const MIN_SPAN = 0.22;
const MAX_SPAN = 0.55;
const RELAX_PER_SECOND = 0.03;

/** Soft, not hard — a hard deadband makes slow tracking stair-step visibly. */
const DEADBAND = 0.004;
const DEADBAND_SOFT = 0.012;

/** Hold the cursor still through the pinch transient, the way visionOS gets
 *  for free by putting the pointer on the eyes and the click on the hand. */
const LATCH_MS = 120;
const DRAG_SLOP = 0.03;

function distance3(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function pinchRatio(world: readonly Vec3[]): number {
  const palm = distance3(world[LM.WRIST], world[LM.MIDDLE_MCP]);
  if (palm < 1e-6) return Number.POSITIVE_INFINITY;
  return distance3(world[LM.THUMB_TIP], world[LM.INDEX_TIP]) / palm;
}

export function nextPinchState(ratio: number, wasPinching: boolean): boolean {
  return wasPinching ? ratio < PINCH_EXIT : ratio < PINCH_ENTER;
}

/** Per-axis adaptive range. Same fast-expand / slow-contract shape as
 *  `AdaptiveRange`, but span-clamped at both ends to bound the gain. */
class AdaptiveAxis {
  low = 0.5 - MIN_SPAN / 2;
  high = 0.5 + MIN_SPAN / 2;

  map(value: number, dt: number, frozen: boolean): number {
    if (!frozen) {
      const relax = RELAX_PER_SECOND * Math.min(dt, 0.25);
      this.low = Math.min(value, this.low + relax);
      this.high = Math.max(value, this.high - relax);

      const span = this.high - this.low;
      const centre = (this.low + this.high) / 2;
      if (span < MIN_SPAN) {
        this.low = centre - MIN_SPAN / 2;
        this.high = centre + MIN_SPAN / 2;
      } else if (span > MAX_SPAN) {
        this.low = centre - MAX_SPAN / 2;
        this.high = centre + MAX_SPAN / 2;
      }
    }
    return clamp((value - this.low) / (this.high - this.low), 0, 1);
  }

  reset(): void {
    this.low = 0.5 - MIN_SPAN / 2;
    this.high = 0.5 + MIN_SPAN / 2;
  }
}

export class PointerTracker {
  /** Smoothed, gained, deadbanded. 0..1 across the target surface. */
  x = 0.5;
  y = 0.5;
  pinching = false;
  /** Monotonic. Consumers compare against their own last-seen value, so any
   *  number of them can observe the same click without racing to consume it. */
  clickCount = 0;

  private readonly filterX = new OneEuroFilter({
    ...DEFAULT_POINTER_ONE_EURO,
  });
  private readonly filterY = new OneEuroFilter({
    ...DEFAULT_POINTER_ONE_EURO,
  });
  private readonly axisX = new AdaptiveAxis();
  private readonly axisY = new AdaptiveAxis();

  private latchX = 0.5;
  private latchY = 0.5;
  private latchUntil = 0;

  update(
    landmarks: readonly { x: number; y: number }[],
    world: readonly Vec3[],
    timeMs: number,
    dt: number,
  ): void {
    const tip = landmarks[LM.INDEX_TIP];
    const knuckle = landmarks[LM.INDEX_MCP];

    // Mirrored to match the flipped preview: moving your hand right should move
    // the cursor right, which is the opposite of the raw camera image.
    const rawX =
      1 - (TIP_WEIGHT * tip.x + (1 - TIP_WEIGHT) * knuckle.x);
    const rawY = TIP_WEIGHT * tip.y + (1 - TIP_WEIGHT) * knuckle.y;

    const ratio = pinchRatio(world);
    const wasPinching = this.pinching;
    this.pinching = nextPinchState(ratio, wasPinching);

    // Freezing the range during a pinch stops the mapping shifting under the
    // user mid-click.
    const frozen = this.pinching;
    const gainedX = this.axisX.map(rawX, dt, frozen);
    const gainedY = this.axisY.map(rawY, dt, frozen);

    const smoothX = this.filterX.filter(gainedX, timeMs);
    const smoothY = this.filterY.filter(gainedY, timeMs);

    const dx = smoothX - this.x;
    const dy = smoothY - this.y;
    const travel = Math.hypot(dx, dy);
    const scale =
      travel <= DEADBAND
        ? 0
        : Math.min(1, (travel - DEADBAND) / (DEADBAND_SOFT - DEADBAND));
    this.x += dx * scale;
    this.y += dy * scale;

    if (this.pinching && !wasPinching) {
      this.latchX = this.x;
      this.latchY = this.y;
      this.latchUntil = timeMs + LATCH_MS;
      this.clickCount++;
    }

    if (timeMs < this.latchUntil) {
      // Promote to a drag once the hand genuinely travels, so pinch-and-drag
      // still works despite the freeze.
      if (Math.hypot(this.x - this.latchX, this.y - this.latchY) > DRAG_SLOP) {
        this.latchUntil = 0;
      } else {
        this.x = this.latchX;
        this.y = this.latchY;
      }
    }
  }

  reset(): void {
    this.filterX.reset();
    this.filterY.reset();
    this.axisX.reset();
    this.axisY.reset();
    this.x = 0.5;
    this.y = 0.5;
    this.pinching = false;
    this.latchUntil = 0;
  }
}
