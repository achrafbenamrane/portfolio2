// Type-only: the runtime is imported inside start(), so it never reaches a visitor who doesn't
// turn the camera on.
import type * as MP from "@mediapipe/tasks-vision";

import { HandSensor, type SensorStatus } from "./hand-sensor";
import { filterRoutineMediaPipeNotes } from "./mediapipe-log";

const WASM_PATH = "/mediapipe/wasm";
const HAND_MODEL = "/models/hand_landmarker.task";
const BODY_MODEL = "/models/pose_landmarker_lite.task";

export type PuppetMode = "hands" | "body";

export type Point = { x: number; y: number; z: number };

export type HandReading = {
  /** Image position, 0 to 1, in the raw video: a mirror is the caller's business. */
  points: Point[];
  /** Metres from the middle of the hand. */
  world: Point[];
};

export type BodyReading = {
  points: (Point & { visibility?: number })[];
  world: Point[];
};

/**
 * Mutated in place on every detection, and read from the game loop. Like the other sensors,
 * it's deliberately not React state: this is a 30 Hz signal.
 */
export interface PuppetFrame {
  hands: HandReading[];
  body: BodyReading | null;
  detectFps: number;
  /** performance.now() of the last detection. */
  at: number;
}

/**
 * The operator, seen by the camera: both hands, or a whole body stood back from it. Nothing
 * here leaves the machine. The models run in this tab, on this GPU, and no frame is kept.
 */
export class PuppetSensor {
  readonly frame: PuppetFrame = { hands: [], body: null, detectFps: 0, at: 0 };
  status: SensorStatus = "idle";
  mode: PuppetMode = "hands";

  private readonly listeners = new Set<() => void>();
  private version = 0;
  private hands: MP.HandLandmarker | null = null;
  private pose: MP.PoseLandmarker | null = null;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private rafId = 0;
  private lastVideoTime = -1;
  private lastTimestamp = 0;
  private startToken = 0;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getVersion = (): number => this.version;

  async start(video: HTMLVideoElement, mode: PuppetMode): Promise<void> {
    if (this.status === "running" || this.status === "loading" || this.status === "requesting") return;
    if (!HandSensor.isSupported()) {
      this.setStatus("unsupported");
      return;
    }
    const token = ++this.startToken;
    this.video = video;
    this.mode = mode;
    this.setStatus("requesting");

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 }, facingMode: "user" },
        audio: false,
      });
      if (token !== this.startToken) return this.releaseStream();
      video.srcObject = this.stream;
      video.playsInline = true;
      video.muted = true;
      await video.play();
      if (token !== this.startToken) return this.releaseStream();

      this.setStatus("loading");
      await this.loadModel(mode);
      if (token !== this.startToken) return this.closeModels();

      document.addEventListener("visibilitychange", this.onVisibilityChange);
      this.setStatus("running");
      this.loop();
    } catch (error) {
      this.releaseStream();
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") this.setStatus("denied");
      else if (name === "NotFoundError" || name === "OverconstrainedError") this.setStatus("unsupported");
      else this.setStatus("error");
    }
  }

  /** Changes between reading hands and reading a whole body, without touching the camera. */
  async setMode(mode: PuppetMode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.frame.hands = [];
    this.frame.body = null;
    if (this.status === "running") await this.loadModel(mode);
  }

  private async loadModel(mode: PuppetMode) {
    filterRoutineMediaPipeNotes();
    const mp = await import("@mediapipe/tasks-vision");
    const fileset = await mp.FilesetResolver.forVisionTasks(WASM_PATH);
    if (mode === "hands" && !this.hands) {
      this.hands = await mp.HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: HAND_MODEL, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.45,
        minHandPresenceConfidence: 0.45,
        minTrackingConfidence: 0.45,
      });
    }
    if (mode === "body" && !this.pose) {
      this.pose = await mp.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: BODY_MODEL, delegate: "GPU" },
        runningMode: "VIDEO",
        numPoses: 1,
      });
    }
  }

  stop(): void {
    this.startToken++;
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.closeModels();
    this.frame.hands = [];
    this.frame.body = null;
    this.setStatus("idle");
  }

  private closeModels() {
    this.hands?.close();
    this.hands = null;
    this.pose?.close();
    this.pose = null;
    this.releaseStream();
  }

  private setStatus(status: SensorStatus) {
    if (this.status === status) return;
    this.status = status;
    this.version++;
    for (const listener of this.listeners) listener();
  }

  private releaseStream() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
  }

  private readonly onVisibilityChange = () => {
    // Inference on a hidden tab is pure heat.
    if (document.hidden) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    } else if (this.status === "running" && this.rafId === 0) {
      this.loop();
    }
  };

  private readonly loop = () => {
    this.rafId = requestAnimationFrame(this.loop);
    const video = this.video;
    if (!video || video.readyState < 2 || video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = video.currentTime;

    const now = performance.now();
    // MediaPipe requires strictly increasing timestamps across calls.
    const timestamp = Math.max(now, this.lastTimestamp + 1);
    this.lastTimestamp = timestamp;
    const frame = this.frame;
    const spent = frame.at ? (now - frame.at) / 1000 : 1 / 30;
    frame.detectFps = frame.detectFps ? frame.detectFps * 0.9 + (1 / spent) * 0.1 : 1 / spent;
    frame.at = now;

    try {
      if (this.mode === "hands" && this.hands) {
        const result = this.hands.detectForVideo(video, timestamp);
        frame.hands = result.landmarks.map((points, index) => ({ points, world: result.worldLandmarks[index] }));
      } else if (this.mode === "body" && this.pose) {
        const result = this.pose.detectForVideo(video, timestamp);
        const points = result.landmarks[0];
        frame.body = points ? { points, world: result.worldLandmarks[0] } : null;
      }
    } catch {
      this.setStatus("error");
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  };
}
