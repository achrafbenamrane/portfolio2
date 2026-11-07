// Type-only — the runtime is imported inside start(), so it never touches the
// server render and only reaches visitors who turn the camera on.
import type * as MP from "@mediapipe/tasks-vision";

import { HandSensor, type SensorStatus } from "./hand-sensor";
import { OneEuroFilter } from "./one-euro";
import { filterRoutineMediaPipeNotes } from "./mediapipe-log";

const WASM_PATH = "/mediapipe/wasm";
const MODEL_PATH = "/models/face_landmarker.task";

/** The outer corners of the eyes, in MediaPipe's face mesh. Stable through a smile
 *  and a blink, and their spacing says how far away the head is. */
const EYE_RIGHT = 33;
const EYE_LEFT = 263;

/** How far a head usually travels, as a share of the picture, to reach the end of
 *  each axis. Past it the value keeps going, so a big lean does more. */
const REACH = 0.22;

/** How much nearer than usual reads as a full lean: eyes 45% further apart. */
const LEAN_RANGE = 0.45;

/** Seconds for a new resting position to become the middle. A person settles, slumps
 *  and shifts in their chair: the window should stay centred on where they sit now. */
const SETTLE_SECONDS = 7;

/**
 * Mutated in place on every detection, and read from the render loop: like HandFrame,
 * it is deliberately not React state.
 */
export interface HeadFrame {
  hasFace: boolean;
  /** Head right of where it rests, as seen by the visitor. -1..1, can overshoot. */
  x: number;
  /** Head above where it rests. -1..1, can overshoot. */
  y: number;
  /** How far nearer than usual. 0 at rest, 1 leaning right in, negative pulling back. */
  lean: number;
  detectFps: number;
  /** Every landmark of the face, as the model gave them. Null when there's no face. */
  points: MP.NormalizedLandmark[] | null;
}

/**
 * Follows the visitor's head, so the screen can act as a window onto what's behind it.
 *
 * Lag is what kills the illusion, more than jitter: a view that trails the head reads as
 * a picture sliding about, not a room. So the filter is set to get out of the way as soon
 * as the head moves, and the face model runs on the GPU on every camera frame.
 */
export class HeadSensor {
  readonly frame: HeadFrame = { hasFace: false, x: 0, y: 0, lean: 0, detectFps: 0, points: null };

  status: SensorStatus = "idle";
  errorMessage: string | null = null;

  private readonly filters = {
    x: new OneEuroFilter({ minCutoff: 1.6, beta: 14, dCutoff: 1 }),
    y: new OneEuroFilter({ minCutoff: 1.6, beta: 14, dCutoff: 1 }),
    eyes: new OneEuroFilter({ minCutoff: 1.0, beta: 6, dCutoff: 1 }),
  };
  private readonly listeners = new Set<() => void>();
  private version = 0;

  private landmarker: MP.FaceLandmarker | null = null;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private rafId = 0;
  private lastVideoTime = -1;
  private lastDetectAt = 0;
  private lastTimestamp = 0;
  private startToken = 0;
  private rest: { x: number; y: number; eyes: number } | null = null;

  /** `useSyncExternalStore` pair. Fires on status changes, never per frame. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getVersion = (): number => this.version;

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
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });
      if (token !== this.startToken) return this.releaseStream();

      video.srcObject = this.stream;
      video.playsInline = true;
      video.muted = true;
      await video.play();
      if (token !== this.startToken) return this.releaseStream();

      this.setStatus("loading");
      filterRoutineMediaPipeNotes();
      const mp = await import("@mediapipe/tasks-vision");
      const fileset = await mp.FilesetResolver.forVisionTasks(WASM_PATH);
      if (token !== this.startToken) return this.releaseStream();

      this.landmarker = await mp.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
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
        this.errorMessage = error instanceof Error ? error.message : String(error);
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
    this.filters.x.reset();
    this.filters.y.reset();
    this.filters.eyes.reset();
    this.rest = null;

    this.frame.hasFace = false;
    this.frame.points = null;
    this.frame.x = 0;
    this.frame.y = 0;
    this.frame.lean = 0;
    this.setStatus("idle");
  }

  private setStatus(status: SensorStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.version++;
    for (const listener of this.listeners) listener();
  }

  private releaseStream(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
  }

  private readonly onVisibilityChange = (): void => {
    // Inference on a hidden tab is pure heat. The camera stays warm.
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
    if (video.currentTime === this.lastVideoTime || video.readyState < 2) return;
    this.lastVideoTime = video.currentTime;

    const now = performance.now();
    const seconds = this.lastDetectAt ? (now - this.lastDetectAt) / 1000 : 1 / 30;
    if (this.lastDetectAt) {
      this.frame.detectFps = this.frame.detectFps
        ? this.frame.detectFps * 0.9 + (1 / seconds) * 0.1
        : 1 / seconds;
    }
    this.lastDetectAt = now;

    // MediaPipe requires strictly increasing timestamps across calls.
    const timestamp = Math.max(now, this.lastTimestamp + 1);
    this.lastTimestamp = timestamp;

    let result;
    try {
      result = landmarker.detectForVideo(video, timestamp);
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
      this.setStatus("error");
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
      return;
    }

    const face = result.faceLandmarks?.[0];
    if (!face) {
      this.frame.hasFace = false;
      this.frame.points = null;
      return;
    }
    this.frame.hasFace = true;
    this.frame.points = face;

    const right = face[EYE_RIGHT];
    const left = face[EYE_LEFT];
    const x = this.filters.x.filter((right.x + left.x) / 2, timestamp);
    const y = this.filters.y.filter((right.y + left.y) / 2, timestamp);
    const eyes = this.filters.eyes.filter(Math.hypot(right.x - left.x, right.y - left.y), timestamp);

    this.rest ??= { x, y, eyes };
    const rest = this.rest;
    const lean = (eyes / rest.eyes - 1) / LEAN_RANGE;

    // Drift towards wherever the head has settled, but not while it is leaning in on
    // purpose, or holding a lean would slowly cancel it.
    const settle = Math.abs(lean) < 0.3 ? Math.min(1, seconds / SETTLE_SECONDS) : 0;
    rest.x += (x - rest.x) * settle;
    rest.y += (y - rest.y) * settle;
    rest.eyes += (eyes - rest.eyes) * settle;

    // The picture isn't mirrored here, so a head moving to the visitor's right is
    // moving left in it.
    this.frame.x = (rest.x - x) / REACH;
    this.frame.y = (rest.y - y) / REACH;
    this.frame.lean = lean;
  };
}
