// Type-only — the runtime is imported inside start(), so it never touches the
// server render and only reaches visitors who open the mirror.
import type * as MP from "@mediapipe/tasks-vision";

import { HandSensor, type SensorStatus } from "./hand-sensor";
import { OneEuroFilter } from "./one-euro";
import { filterRoutineMediaPipeNotes } from "./mediapipe-log";

const WASM_PATH = "/mediapipe/wasm";

/** The heavier model on a computer, the lighter one on anything with a touch
 *  screen, where the same inference has to share a phone's GPU with the shirt. */
const MODEL_FULL = "/models/pose_landmarker_full.task";
const MODEL_LITE = "/models/pose_landmarker_lite.task";

/** Sorts each pixel into hair, skin, face, clothes or background. */
const MODEL_BODY = "/models/selfie_multiclass_256x256.tflite";

/** The outline model's own input size, in pixels a side. */
const MASK_SIZE = 256;

/** The frame is kept no wider than this: it is drawn every frame, and the shirt
 *  is what needs the detail. */
const FRAME_MAX_WIDTH = 1280;

/** What the pose model is handed. It works at 256 pixels on a crop of the body, so a
 *  bigger picture only costs time getting it onto the GPU. */
const POSE_WIDTH = 640;

/** MediaPipe's pose indices for the joints a shirt hangs from. */
export const JOINT = {
  nose: 0,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftIndex: 19,
  rightIndex: 20,
  leftHip: 23,
  rightHip: 24,
} as const;

export type Joint = keyof typeof JOINT;

const JOINTS = Object.keys(JOINT) as Joint[];

/** What each value in the body outline means. */
export const BODY_LABEL = {
  background: 0,
  hair: 1,
  skin: 2,
  face: 3,
  clothes: 4,
  other: 5,
} as const;

export interface JointReading {
  /** Image position, 0..1, in the raw (unmirrored) video. */
  x: number;
  y: number;
  /** Metres from the hips, MediaPipe's axes: x as the image, y down, z away. */
  wx: number;
  wy: number;
  wz: number;
  /** How sure the model is this joint is in frame and unhidden, 0..1. */
  seen: number;
}

export interface BodyOutline {
  width: number;
  height: number;
  /** One BODY_LABEL per pixel, top row first, in the raw (unmirrored) video. */
  labels: Uint8Array;
  /** The part of the picture these pixels cover, 0..1. The model only ever sees 256
   *  pixels across, so it is shown the person, not the room they are standing in. */
  crop: { x: number; y: number; width: number; height: number };
  /** Where the shoulders were when this was read, 0..1. The outline is only read on
   *  some frames, so in between it is moved along by how far they have gone since. */
  heldAt: { x: number; y: number };
  /** Bumps with each new outline. Zero until the model has loaded. */
  version: number;
}

/**
 * Mutated in place on every camera frame. Consumers read it from their own render
 * loop: like HandFrame, it is deliberately not React state, because a 30 Hz signal
 * through useState would re-render the whole mirror thirty times a second.
 *
 * Everything here belongs together. `picture`, the joints and the outline all come
 * from one captured frame, and the mirror draws that picture rather than the live
 * video. A shirt drawn over live video is always a frame or two behind the person
 * and slides as they move. Drawn over the frame it was fitted to, it cannot.
 */
export interface BodyFrame {
  hasBody: boolean;
  joints: Record<Joint, JointReading>;
  outline: BodyOutline;
  picture: HTMLCanvasElement;
  /** Bumps with each processed camera frame. */
  version: number;
  detectFps: number;
  /** What each stage costs, ms, averaged. */
  timing: { capture: number; pose: number; outline: number };
  /** Wall time since a body was last seen, ms. */
  sinceBodyMs: number;
}

export interface BodySensorOptions {
  /** Inference cadence. The render loop runs at its own rate on top of it. */
  detectIntervalMs?: number;
}

/**
 * Light filtering: the shirt is drawn over the same frame the joints came from, so
 * any lag here is the shirt lagging the body. Betas are per unit of each axis, so
 * they differ between image coordinates and metres.
 */
const SCREEN_FILTER = { minCutoff: 1.8, beta: 18, dCutoff: 1 };
const WORLD_FILTER = { minCutoff: 1.4, beta: 8, dCutoff: 1 };

function emptyJoint(): JointReading {
  return { x: 0.5, y: 0.5, wx: 0, wy: 0, wz: 0, seen: 0 };
}

export class BodySensor {
  readonly frame: BodyFrame;

  status: SensorStatus = "idle";
  errorMessage: string | null = null;

  private readonly detectIntervalMs: number;
  private readonly filters = new Map<string, OneEuroFilter>();
  private readonly listeners = new Set<() => void>();
  private version = 0;

  private landmarker: MP.PoseLandmarker | null = null;
  private segmenter: MP.ImageSegmenter | null = null;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private readonly picture = document.createElement("canvas");
  private readonly pictureContext: CanvasRenderingContext2D;
  private readonly small = document.createElement("canvas");
  private readonly smallContext: CanvasRenderingContext2D;
  private readonly posed = document.createElement("canvas");
  private readonly posedContext: CanvasRenderingContext2D;
  private rafId = 0;
  private lastDetectAt = 0;
  private lastVideoTime = -1;
  private lastTimestamp = 0;
  private lastBodyAt = 0;
  private startToken = 0;
  private outlineEvery = 2;
  private ticks = 0;

  constructor(options: BodySensorOptions = {}) {
    this.detectIntervalMs = options.detectIntervalMs ?? 30;
    this.pictureContext = this.picture.getContext("2d", { alpha: false })!;
    this.smallContext = this.small.getContext("2d", { alpha: false })!;
    this.posedContext = this.posed.getContext("2d", { alpha: false })!;
    this.frame = {
      hasBody: false,
      joints: Object.fromEntries(JOINTS.map((joint) => [joint, emptyJoint()])) as Record<
        Joint,
        JointReading
      >,
      outline: {
        width: 0,
        height: 0,
        labels: new Uint8Array(0),
        crop: { x: 0, y: 0, width: 1, height: 1 },
        heldAt: { x: 0.5, y: 0.5 },
        version: 0,
      },
      picture: this.picture,
      version: 0,
      detectFps: 0,
      timing: { capture: 0, pose: 0, outline: 0 },
      sinceBodyMs: Infinity,
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
      // Camera first: if the visitor says no, they skip a 9 MB model download.
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
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

      const scale = Math.min(1, FRAME_MAX_WIDTH / video.videoWidth);
      this.picture.width = Math.round(video.videoWidth * scale);
      this.picture.height = Math.round(video.videoHeight * scale);
      this.small.width = MASK_SIZE;
      this.small.height = MASK_SIZE;
      this.posed.width = Math.min(POSE_WIDTH, this.picture.width);
      this.posed.height = Math.round((this.posed.width * video.videoHeight) / video.videoWidth);

      this.setStatus("loading");
      filterRoutineMediaPipeNotes();
      const mp = await import("@mediapipe/tasks-vision");
      const fileset = await mp.FilesetResolver.forVisionTasks(WASM_PATH);
      if (token !== this.startToken) return this.releaseStream();

      const coarse = matchMedia("(pointer: coarse)").matches;
      this.outlineEvery = coarse ? 3 : 2;
      this.landmarker = await mp.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: coarse ? MODEL_LITE : MODEL_FULL,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
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

      // The shirt is already on by now. The outline sharpens it when it arrives,
      // and if the 16 MB model can't load, the shirt simply stays as it is.
      void this.loadOutline(mp, fileset, token);
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

  private async loadOutline(
    mp: typeof MP,
    fileset: Awaited<ReturnType<typeof MP.FilesetResolver.forVisionTasks>>,
    token: number,
  ): Promise<void> {
    try {
      const segmenter = await mp.ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_BODY, delegate: "GPU" },
        runningMode: "VIDEO",
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      });
      if (token !== this.startToken) {
        segmenter.close();
        return;
      }
      this.segmenter = segmenter;
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
    }
  }

  stop(): void {
    this.startToken++;
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    document.removeEventListener("visibilitychange", this.onVisibilityChange);

    this.landmarker?.close();
    this.landmarker = null;
    this.segmenter?.close();
    this.segmenter = null;
    this.releaseStream();
    for (const filter of this.filters.values()) filter.reset();

    this.frame.hasBody = false;
    this.frame.sinceBodyMs = Infinity;
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
    // Inference on a hidden tab is pure heat. The camera stays warm, so coming
    // back costs nothing.
    if (document.hidden) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    } else if (this.status === "running" && this.rafId === 0) {
      this.loop();
    }
  };

  private smooth(key: string, value: number, time: number, world: boolean): number {
    let filter = this.filters.get(key);
    if (!filter) {
      filter = new OneEuroFilter({ ...(world ? WORLD_FILTER : SCREEN_FILTER) });
      this.filters.set(key, filter);
    }
    return filter.filter(value, time);
  }

  /** Follows the body with a square crop, eased so the outline doesn't swim. */
  private moveCrop(): void {
    const { joints, outline, hasBody } = this.frame;
    const { crop } = outline;
    const { width: pictureWidth, height: pictureHeight } = this.picture;
    let goal = { x: 0, y: 0, width: 1, height: 1 };

    if (hasBody) {
      let left = 1;
      let right = 0;
      let top = 1;
      let bottom = 0;
      for (const joint of JOINTS) {
        const reading = joints[joint];
        if (reading.seen < 0.3) continue;
        left = Math.min(left, reading.x);
        right = Math.max(right, reading.x);
        top = Math.min(top, reading.y);
        bottom = Math.max(bottom, reading.y);
      }
      if (right > left) {
        // Joints are inside the body: the crop has to reach the skin and the sleeves.
        const side = Math.max((right - left) * pictureWidth, (bottom - top) * pictureHeight) * 1.5;
        const width = Math.min(1, side / pictureWidth);
        const height = Math.min(1, side / pictureHeight);
        const x = Math.min(1 - width, Math.max(0, (left + right) / 2 - width / 2));
        const y = Math.min(1 - height, Math.max(0, (top + bottom) / 2 - height / 2));
        goal = { x, y, width, height };
      }
    }

    const ease = 0.25;
    crop.x += (goal.x - crop.x) * ease;
    crop.y += (goal.y - crop.y) * ease;
    crop.width += (goal.width - crop.width) * ease;
    crop.height += (goal.height - crop.height) * ease;
  }

  private readOutline(timestamp: number): void {
    const segmenter = this.segmenter;
    if (!segmenter || this.ticks % this.outlineEvery !== 0) return;

    this.moveCrop();
    const { small, smallContext, picture } = this;
    const outline = this.frame.outline;
    const { crop } = outline;
    smallContext.drawImage(
      picture,
      crop.x * picture.width,
      crop.y * picture.height,
      crop.width * picture.width,
      crop.height * picture.height,
      0,
      0,
      small.width,
      small.height,
    );

    // The mask only lives as long as this callback, so its data is copied out.
    segmenter.segmentForVideo(small, timestamp, (result) => {
      const mask = result.categoryMask;
      if (!mask) return;
      if (outline.labels.length !== mask.width * mask.height) {
        outline.labels = new Uint8Array(mask.width * mask.height);
        outline.width = mask.width;
        outline.height = mask.height;
      }
      outline.labels.set(mask.getAsUint8Array());
      const { leftShoulder, rightShoulder } = this.frame.joints;
      outline.heldAt.x = (leftShoulder.x + rightShoulder.x) / 2;
      outline.heldAt.y = (leftShoulder.y + rightShoulder.y) / 2;
      outline.version += 1;
    });
  }

  private readonly loop = (): void => {
    this.rafId = requestAnimationFrame(this.loop);

    const video = this.video;
    const landmarker = this.landmarker;
    if (!video || !landmarker) return;

    const now = performance.now();
    this.frame.sinceBodyMs = this.lastBodyAt ? now - this.lastBodyAt : Infinity;

    // Two gates: don't outrun the cadence, and don't spend inference on a frame
    // the camera hasn't replaced yet.
    if (now - this.lastDetectAt < this.detectIntervalMs) return;
    if (video.currentTime === this.lastVideoTime) return;
    if (video.readyState < 2) return;

    this.lastVideoTime = video.currentTime;

    if (this.lastDetectAt) {
      const fps = 1000 / (now - this.lastDetectAt);
      this.frame.detectFps = this.frame.detectFps
        ? this.frame.detectFps * 0.9 + fps * 0.1
        : fps;
    }
    this.lastDetectAt = now;

    // MediaPipe requires strictly increasing timestamps across calls.
    const timestamp = Math.max(now, this.lastTimestamp + 1);
    this.lastTimestamp = timestamp;

    const { picture, pictureContext, posed, posedContext } = this;
    const { timing } = this.frame;
    const began = performance.now();
    pictureContext.drawImage(video, 0, 0, picture.width, picture.height);
    posedContext.drawImage(picture, 0, 0, posed.width, posed.height);
    this.ticks += 1;
    const captured = performance.now();

    let result;
    try {
      result = landmarker.detectForVideo(posed, timestamp);
      const tracked = performance.now();
      this.readJoints(result, now, timestamp);
      this.readOutline(timestamp);
      const outlined = performance.now();
      timing.capture += (captured - began - timing.capture) * 0.1;
      timing.pose += (tracked - captured - timing.pose) * 0.1;
      timing.outline += (outlined - tracked - timing.outline) * 0.1;
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
      this.setStatus("error");
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
      return;
    }

    this.frame.version += 1;
  };

  private readJoints(result: MP.PoseLandmarkerResult, now: number, timestamp: number): void {
    const screen = result.landmarks?.[0];
    const world = result.worldLandmarks?.[0];
    if (!screen || !world || screen.length < 33 || world.length < 33) {
      this.frame.hasBody = false;
      return;
    }

    this.lastBodyAt = now;
    this.frame.hasBody = true;
    this.frame.sinceBodyMs = 0;

    for (const joint of JOINTS) {
      const index = JOINT[joint];
      const point = screen[index];
      const metres = world[index];
      const reading = this.frame.joints[joint];
      reading.x = this.smooth(`${joint}.x`, point.x, timestamp, false);
      reading.y = this.smooth(`${joint}.y`, point.y, timestamp, false);
      reading.wx = this.smooth(`${joint}.wx`, metres.x, timestamp, true);
      reading.wy = this.smooth(`${joint}.wy`, metres.y, timestamp, true);
      reading.wz = this.smooth(`${joint}.wz`, metres.z, timestamp, true);
      reading.seen = point.visibility ?? 0;
    }
  }
}

function waitForVideoDimensions(video: HTMLVideoElement): Promise<void> {
  if (video.videoWidth > 0) return Promise.resolve();
  return new Promise((resolve) => {
    video.addEventListener("loadeddata", () => resolve(), { once: true });
  });
}
