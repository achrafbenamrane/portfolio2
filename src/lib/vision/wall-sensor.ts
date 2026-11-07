// Type-only — the runtime is imported inside start(), so it never touches the
// server render and only reaches visitors who turn the camera on.
import type * as MP from "@mediapipe/tasks-vision";

import { HandSensor, type SensorStatus } from "./hand-sensor";
import type { Vec3 } from "./landmarks";
import { PointerTracker } from "./pointer";
import { filterRoutineMediaPipeNotes } from "./mediapipe-log";

const WASM_PATH = "/mediapipe/wasm";
const HAND_MODEL = "/models/hand_landmarker.task";
const BODY_MODEL = "/models/selfie_multiclass_256x256.tflite";

const MASK_SIZE = 256;
const FRAME_MAX_WIDTH = 1280;

/**
 * What the camera sees of the visitor's room, read from the render loop. As with the
 * mirror, the picture and the outline come from one captured frame, so a person walking
 * in front of the frame is cut out where they actually are.
 */
export interface WallFrame {
  picture: HTMLCanvasElement;
  /** Bumps with each processed camera frame. */
  version: number;
  /** Non-zero wherever there is a person, top row first, in the raw video. */
  person: { width: number; height: number; labels: Uint8Array; version: number };
  /** The visitor's hand, 0..1 across the mirrored picture. */
  hand: { seen: boolean; x: number; y: number; pinching: boolean };
}

/**
 * Sees the room for "on your wall": who is standing in it, and whether a hand is
 * pinching. It needs neither to work. Hanging the frame is done with a mouse or a
 * finger as well, so if either model fails to load the frame still hangs.
 */
export class WallSensor {
  readonly frame: WallFrame;

  status: SensorStatus = "idle";
  errorMessage: string | null = null;

  private readonly listeners = new Set<() => void>();
  private readonly pointer = new PointerTracker();
  private version = 0;

  private hands: MP.HandLandmarker | null = null;
  private segmenter: MP.ImageSegmenter | null = null;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private readonly picture = document.createElement("canvas");
  private readonly pictureContext: CanvasRenderingContext2D;
  private readonly small = document.createElement("canvas");
  private readonly smallContext: CanvasRenderingContext2D;
  private rafId = 0;
  private lastVideoTime = -1;
  private lastDetectAt = 0;
  private lastTimestamp = 0;
  private ticks = 0;
  private startToken = 0;

  constructor() {
    this.pictureContext = this.picture.getContext("2d", { alpha: false })!;
    this.smallContext = this.small.getContext("2d", { alpha: false })!;
    this.small.width = MASK_SIZE;
    this.small.height = MASK_SIZE;
    this.frame = {
      picture: this.picture,
      version: 0,
      person: { width: 0, height: 0, labels: new Uint8Array(0), version: 0 },
      hand: { seen: false, x: 0.5, y: 0.5, pinching: false },
    };
  }

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
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: false,
      });
      if (token !== this.startToken) return this.releaseStream();

      video.srcObject = this.stream;
      video.playsInline = true;
      video.muted = true;
      await video.play();
      await new Promise<void>((resolve) => {
        if (video.videoWidth > 0) resolve();
        else video.addEventListener("loadeddata", () => resolve(), { once: true });
      });
      if (token !== this.startToken) return this.releaseStream();

      const scale = Math.min(1, FRAME_MAX_WIDTH / video.videoWidth);
      this.picture.width = Math.round(video.videoWidth * scale);
      this.picture.height = Math.round(video.videoHeight * scale);

      // The picture goes up at once. The models catch up behind it.
      document.addEventListener("visibilitychange", this.onVisibilityChange);
      this.setStatus("running");
      this.loop();
      void this.loadModels(token);
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

  private async loadModels(token: number): Promise<void> {
    try {
      filterRoutineMediaPipeNotes();
      const mp = await import("@mediapipe/tasks-vision");
      const fileset = await mp.FilesetResolver.forVisionTasks(WASM_PATH);
      if (token !== this.startToken) return;

      const segmenter = await mp.ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: BODY_MODEL, delegate: "GPU" },
        runningMode: "VIDEO",
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      });
      if (token !== this.startToken) return segmenter.close();
      this.segmenter = segmenter;

      const hands = await mp.HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: HAND_MODEL, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 1,
      });
      if (token !== this.startToken) return hands.close();
      this.hands = hands;
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
    }
  }

  stop(): void {
    this.startToken++;
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.hands?.close();
    this.hands = null;
    this.segmenter?.close();
    this.segmenter = null;
    this.releaseStream();
    this.pointer.reset();
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
    if (!video || video.readyState < 2 || video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = video.currentTime;

    const now = performance.now();
    const seconds = this.lastDetectAt ? (now - this.lastDetectAt) / 1000 : 1 / 30;
    this.lastDetectAt = now;
    const timestamp = Math.max(now, this.lastTimestamp + 1);
    this.lastTimestamp = timestamp;
    this.ticks += 1;

    const { picture, pictureContext, small, smallContext, frame } = this;
    pictureContext.drawImage(video, 0, 0, picture.width, picture.height);

    try {
      if (this.segmenter && this.ticks % 2 === 0) {
        smallContext.drawImage(picture, 0, 0, small.width, small.height);
        this.segmenter.segmentForVideo(small, timestamp, (result) => {
          const mask = result.categoryMask;
          if (!mask) return;
          const { person } = frame;
          if (person.labels.length !== mask.width * mask.height) {
            person.labels = new Uint8Array(mask.width * mask.height);
            person.width = mask.width;
            person.height = mask.height;
          }
          person.labels.set(mask.getAsUint8Array());
          person.version += 1;
        });
      }

      if (this.hands) {
        const result = this.hands.detectForVideo(small.width ? picture : video, timestamp);
        const marks = result.landmarks?.[0];
        const world = result.worldLandmarks?.[0] as Vec3[] | undefined;
        frame.hand.seen = !!marks && !!world;
        if (marks && world) {
          this.pointer.update(marks, world, timestamp, seconds);
          frame.hand.x = this.pointer.x;
          frame.hand.y = this.pointer.y;
          frame.hand.pinching = this.pointer.pinching;
        } else {
          frame.hand.pinching = false;
        }
      }
    } catch (error) {
      // A model failing mid-way costs the feature it drives, not the picture.
      this.errorMessage = error instanceof Error ? error.message : String(error);
      this.segmenter = null;
      this.hands = null;
    }

    frame.version += 1;
  };
}
