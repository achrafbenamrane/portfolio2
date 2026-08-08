// Type-only — the 200 KB runtime is dynamically imported inside start(), so it
// never touches the server render and never lands in the initial bundle for
// visitors who don't opt into the camera.
import type * as MP from "@mediapipe/tasks-vision";

import type { Vec3 } from "./landmarks";
import { OneEuroFilter } from "./one-euro";
import { PointerTracker } from "./pointer";
import {
  AdaptiveRange,
  applyDeadzone,
  DEFAULT_OPENNESS_CONFIG,
  fingerOpenness,
  nextClosedState,
  type OpennessConfig,
} from "./openness";

export type SensorStatus =
  | "idle"
  | "requesting"
  | "loading"
  | "running"
  | "denied"
  | "unsupported"
  | "error";

/**
 * Mutated in place, every frame. Consumers read fields directly inside their
 * own animation loop — this object is deliberately NOT React state. Pushing a
 * 60 Hz signal through `useState` costs 60 re-renders a second and produces a
 * stuttering hero on a site whose entire pitch is real-time performance.
 */
export interface HandFrame {
  /** Calibrated, smoothed, 0..1. This is the one the renderer consumes. */
  openness: number;
  /** Uncalibrated instantaneous mean curl. Debug + calibration source. */
  raw: number;
  /** Uncalibrated, filtered. Calibration captures this. */
  smoothedRaw: number;
  perFinger: number[];
  hasHand: boolean;
  isClosed: boolean;
  handedness: string | null;
  /** Image-normalized landmarks for overlay drawing. Null when no hand. */
  landmarks: MP.NormalizedLandmark[] | null;
  detectFps: number;
  /** Wall time since a hand was last seen, ms. */
  sinceHandMs: number;
  /** Live self-calibrated bounds, for debugging the range. */
  rangeMin: number;
  rangeMax: number;

  /** Cursor across the target surface, 0..1, already gained and smoothed. */
  pointerX: number;
  pointerY: number;
  pinching: boolean;
  /** Monotonic click counter — consumers diff it against their own last-seen
   *  value, so several can observe the same click without consuming it. */
  clickCount: number;
}

const WASM_PATH = "/mediapipe/wasm";
const MODEL_PATH = "/models/hand_landmarker.task";

export interface HandSensorOptions {
  /** Inference cadence. 30 Hz is plenty — the render loop interpolates. */
  detectIntervalMs?: number;
  config?: Partial<OpennessConfig>;
}

export class HandSensor {
  readonly frame: HandFrame = {
    openness: 0,
    raw: 0,
    smoothedRaw: 0,
    perFinger: [0, 0, 0, 0],
    hasHand: false,
    isClosed: false,
    handedness: null,
    landmarks: null,
    detectFps: 0,
    sinceHandMs: Infinity,
    rangeMin: 0,
    rangeMax: 1,
    pointerX: 0.5,
    pointerY: 0.5,
    pinching: false,
    clickCount: 0,
  };

  config: OpennessConfig;
  status: SensorStatus = "idle";
  errorMessage: string | null = null;

  private readonly detectIntervalMs: number;
  private readonly filter = new OneEuroFilter();
  private readonly range = new AdaptiveRange();
  private readonly pointer = new PointerTracker();
  private readonly listeners = new Set<() => void>();
  private version = 0;

  private landmarker: MP.HandLandmarker | null = null;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private rafId = 0;
  private lastDetectAt = 0;
  private lastVideoTime = -1;
  private lastTimestamp = 0;
  private lastHandAt = 0;
  private startToken = 0;

  constructor(options: HandSensorOptions = {}) {
    this.detectIntervalMs = options.detectIntervalMs ?? 33;
    this.config = { ...DEFAULT_OPENNESS_CONFIG, ...options.config };
    this.filter.params = this.config;
  }

  /**
   * `useSyncExternalStore` pair. Fires on status and config changes only —
   * never per-frame, so React re-renders a handful of times over the sensor's
   * whole lifetime rather than sixty times a second.
   */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getVersion = (): number => this.version;

  setConfig(patch: Partial<OpennessConfig>): void {
    this.config = { ...this.config, ...patch };
    this.filter.params = this.config;
    this.bump();
  }

  private bump(): void {
    this.version++;
    for (const listener of this.listeners) listener();
  }

  static isSupported(): boolean {
    return (
      typeof window !== "undefined" &&
      typeof WebAssembly !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia
    );
  }

  async start(video: HTMLVideoElement): Promise<void> {
    if (this.status === "running" || this.status === "loading") return;

    if (!HandSensor.isSupported()) {
      this.setStatus("unsupported");
      return;
    }

    const token = ++this.startToken;
    this.video = video;
    this.setStatus("requesting");

    try {
      // Camera first: if the user denies, we've skipped a 7 MB model download.
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
        audio: false,
      });
      if (token !== this.startToken) return this.releaseStream();

      video.srcObject = this.stream;
      video.playsInline = true;
      video.muted = true;
      await video.play();
      await waitForVideoDimensions(video);
      if (token !== this.startToken) return this.releaseStream();

      this.setStatus("loading");
      const mp = await import("@mediapipe/tasks-vision");
      const fileset = await mp.FilesetResolver.forVisionTasks(WASM_PATH);
      if (token !== this.startToken) return this.releaseStream();

      this.landmarker = await mp.HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      if (token !== this.startToken) {
        this.landmarker.close();
        this.landmarker = null;
        return this.releaseStream();
      }

      document.addEventListener("visibilitychange", this.onVisibilityChange);
      this.setStatus("running");
      this.loop();
    } catch (error) {
      this.releaseStream();
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        this.setStatus("denied");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        this.setStatus("unsupported");
      } else {
        this.errorMessage =
          error instanceof Error ? error.message : String(error);
        this.setStatus("error");
      }
    }
  }

  stop(): void {
    this.startToken++;
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    document.removeEventListener("visibilitychange", this.onVisibilityChange);

    this.landmarker?.close();
    this.landmarker = null;
    this.releaseStream();
    this.filter.reset();
    this.range.reset();
    this.pointer.reset();

    this.frame.hasHand = false;
    this.frame.landmarks = null;
    this.frame.sinceHandMs = Infinity;
    this.setStatus("idle");
  }

  /** Forget the observed range and re-learn it from the next frames. */
  recalibrate(): void {
    this.range.reset();
  }

  private setStatus(status: SensorStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.bump();
  }

  private releaseStream(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
  }

  private readonly onVisibilityChange = (): void => {
    // Inference on a hidden tab is pure heat. Suspend the loop; the camera
    // track stays warm so resuming costs nothing.
    if (document.hidden) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    } else if (this.status === "running" && this.rafId === 0) {
      this.loop();
    }
  };

  private readonly loop = (): void => {
    this.rafId = requestAnimationFrame(this.loop);

    const video = this.video;
    const landmarker = this.landmarker;
    if (!video || !landmarker) return;

    const now = performance.now();
    this.frame.sinceHandMs = this.lastHandAt ? now - this.lastHandAt : Infinity;

    // Two gates: don't outrun the target cadence, and don't spend inference on
    // a frame the camera hasn't replaced yet.
    if (now - this.lastDetectAt < this.detectIntervalMs) return;
    if (video.currentTime === this.lastVideoTime) return;
    if (video.readyState < 2) return;

    this.lastVideoTime = video.currentTime;

    const sincePrevMs = this.lastDetectAt ? now - this.lastDetectAt : 33;
    if (this.lastDetectAt) {
      const fps = 1000 / sincePrevMs;
      this.frame.detectFps = this.frame.detectFps
        ? this.frame.detectFps * 0.9 + fps * 0.1
        : fps;
    }
    this.lastDetectAt = now;

    // MediaPipe requires strictly increasing timestamps across calls.
    const timestamp = Math.max(now, this.lastTimestamp + 1);
    this.lastTimestamp = timestamp;

    let result;
    try {
      result = landmarker.detectForVideo(video, timestamp);
    } catch (error) {
      this.errorMessage =
        error instanceof Error ? error.message : String(error);
      this.setStatus("error");
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
      return;
    }

    const world = result.worldLandmarks?.[0] as Vec3[] | undefined;
    if (!world || world.length < 21) {
      this.frame.hasHand = false;
      this.frame.landmarks = null;
      this.frame.handedness = null;
      return;
    }

    this.lastHandAt = now;
    this.frame.hasHand = true;
    this.frame.sinceHandMs = 0;
    this.frame.landmarks = result.landmarks?.[0] ?? null;
    this.frame.handedness = result.handedness?.[0]?.[0]?.categoryName ?? null;

    fingerOpenness(world, this.config.curlMax, this.frame.perFinger);

    let sum = 0;
    for (const v of this.frame.perFinger) sum += v;
    const raw = sum / this.frame.perFinger.length;

    this.frame.raw = raw;
    this.frame.smoothedRaw = this.filter.filter(raw, timestamp);

    const normalized = this.range.normalize(
      this.frame.smoothedRaw,
      sincePrevMs / 1000,
    );
    this.frame.openness = applyDeadzone(normalized, this.config.deadzone);
    this.frame.rangeMin = this.range.min;
    this.frame.rangeMax = this.range.max;
    this.frame.isClosed = nextClosedState(
      this.frame.openness,
      this.frame.isClosed,
    );

    const normalized2d = this.frame.landmarks;
    if (normalized2d && normalized2d.length >= 21) {
      this.pointer.update(normalized2d, world, timestamp, sincePrevMs / 1000);
      this.frame.pointerX = this.pointer.x;
      this.frame.pointerY = this.pointer.y;
      this.frame.pinching = this.pointer.pinching;
      this.frame.clickCount = this.pointer.clickCount;
    }
  };
}

function waitForVideoDimensions(video: HTMLVideoElement): Promise<void> {
  if (video.videoWidth > 0) return Promise.resolve();
  return new Promise((resolve) => {
    video.addEventListener("loadeddata", () => resolve(), { once: true });
  });
}
