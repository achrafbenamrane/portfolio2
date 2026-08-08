/**
 * One Euro filter — adaptive low-pass for noisy real-time signals.
 * Casiez, Roussel & Vogel, CHI 2012.
 *
 * Chosen over a plain EMA because gesture input needs two things at once: low
 * jitter while the hand is still, and low lag while it moves. A fixed-cutoff
 * filter can only buy one at the expense of the other. This one raises its
 * cutoff as the signal speeds up, so it smooths hard when still and gets out of
 * the way when you move.
 */

function alpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

class LowPass {
  private state: number | null = null;

  filter(x: number, a: number): number {
    this.state = this.state === null ? x : a * x + (1 - a) * this.state;
    return this.state;
  }

  reset(): void {
    this.state = null;
  }
}

export interface OneEuroParams {
  /** Lower = less jitter, more lag. Tune this first, with the hand held still. */
  minCutoff: number;
  /** Higher = less lag on fast motion. Tune second, waving the hand. */
  beta: number;
  /** Cutoff for the derivative estimate. Rarely needs changing. */
  dCutoff: number;
}

export const DEFAULT_ONE_EURO: OneEuroParams = {
  minCutoff: 1.0,
  beta: 0.007,
  dCutoff: 1.0,
};

export class OneEuroFilter {
  private readonly xFilter = new LowPass();
  private readonly dxFilter = new LowPass();
  private lastRaw: number | null = null;
  private lastTimeMs: number | null = null;

  constructor(public params: OneEuroParams = { ...DEFAULT_ONE_EURO }) {}

  /** @param timeMs monotonic timestamp, e.g. `performance.now()` */
  filter(x: number, timeMs: number): number {
    let dt = 1 / 60;
    if (this.lastTimeMs !== null) {
      const delta = (timeMs - this.lastTimeMs) / 1000;
      // Guard against tab-switch gaps and duplicate timestamps, both of which
      // would otherwise produce a divide-by-zero or a nonsense derivative.
      if (delta > 0 && delta < 1) dt = delta;
    }
    this.lastTimeMs = timeMs;

    const { minCutoff, beta, dCutoff } = this.params;

    const dx = this.lastRaw === null ? 0 : (x - this.lastRaw) / dt;
    this.lastRaw = x;

    const edx = this.dxFilter.filter(dx, alpha(dCutoff, dt));
    const cutoff = minCutoff + beta * Math.abs(edx);

    return this.xFilter.filter(x, alpha(cutoff, dt));
  }

  reset(): void {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastRaw = null;
    this.lastTimeMs = null;
  }
}
