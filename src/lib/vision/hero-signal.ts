import { HandSensor, type SensorStatus } from "./hand-sensor";

/**
 * The single openness signal the hero renders from, 0..1.
 *
 * The portrait is the resting state and nothing else disturbs it — no idle
 * loop, no scroll coupling. The image holds still until a hand closes in front
 * of the camera, and returns to held-still when the hand leaves.
 *
 *   fixed  portrait, motionless. The default, and what every visitor without a
 *          camera sees for the entire visit.
 *   hand   live tracking. The only thing that ever animates the fold.
 */
export type SignalMode = "fixed" | "hand";

/** How long a hand can be missing before we settle back to the portrait. */
const HAND_GRACE_MS = 900;

/** Frame-rate-independent damping. Higher = snappier. */
const DAMPING = 11;

/** Below this, the signal counts as settled and the renderer can stop. */
const SETTLE_EPSILON = 1e-4;

export class HeroSignal {
  readonly sensor = new HandSensor();

  /** Damped output. Read this every frame; never read `target` directly. */
  value = 1;
  mode: SignalMode = "fixed";

  /** Freezes the fold entirely. Tracking still runs. */
  reducedMotion = false;

  private target = 1;
  private lastTick = 0;
  private rafId = 0;
  private readonly listeners = new Set<() => void>();
  private version = 0;
  private unsubscribeSensor: (() => void) | undefined;

  /** `useSyncExternalStore` pair — fires on mode/status changes only. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getVersion = (): number => this.version;

  get status(): SensorStatus {
    return this.sensor.status;
  }

  /**
   * True when the portrait is at rest and nothing is driving it. The renderer
   * uses this to skip drawing entirely rather than pushing an unchanging frame
   * sixty times a second.
   */
  get settled(): boolean {
    return (
      this.mode !== "hand" && Math.abs(this.value - this.target) < SETTLE_EPSILON
    );
  }

  /**
   * What the hand-control panel displays. While tracking, that's the sensor's
   * own reading rather than the damped render value — the panel is an
   * instrument, and it should report the input, not the output.
   */
  get displayValue(): number {
    return this.mode === "hand" && this.sensor.frame.hasHand
      ? this.sensor.frame.openness
      : this.value;
  }

  start(): void {
    if (this.rafId) return;

    // Reduced motion suppresses the fold, not the feature. Tracking still runs
    // so the panel stays honest about what the camera sees.
    this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

    this.unsubscribeSensor = this.sensor.subscribe(this.onSensorChange);
    this.lastTick = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.unsubscribeSensor?.();
    this.sensor.stop();
  }

  async enableCamera(video: HTMLVideoElement): Promise<void> {
    await this.sensor.start(video);
  }

  private readonly onSensorChange = (): void => {
    this.setMode(this.sensor.status === "running" ? "hand" : "fixed");
  };

  private setMode(mode: SignalMode): void {
    if (this.mode === mode) {
      this.bump();
      return;
    }
    this.mode = mode;
    this.bump();
  }

  private bump(): void {
    this.version++;
    for (const listener of this.listeners) listener();
  }

  private readonly tick = (now: number): void => {
    this.rafId = requestAnimationFrame(this.tick);

    const dt = Math.min((now - this.lastTick) / 1000, 0.1);
    this.lastTick = now;

    if (this.reducedMotion || this.mode !== "hand") {
      this.target = 1;
    } else {
      const frame = this.sensor.frame;
      // Holding the last value through a brief dropout stops the portrait from
      // snapping back every time tracking blinks. Past the grace window it's a
      // genuine absence, so ease home to the portrait.
      this.target =
        frame.hasHand || frame.sinceHandMs < HAND_GRACE_MS ? frame.openness : 1;
    }

    this.value += (this.target - this.value) * (1 - Math.exp(-dt * DAMPING));
  };
}
