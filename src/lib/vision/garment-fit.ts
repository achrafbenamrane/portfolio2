import { Euler, Matrix4, Quaternion, Vector2, Vector3 } from "three";

import { BODY_LABEL, type BodyFrame, type BodyOutline, type JointReading } from "./body-sensor";
import { OneEuroFilter } from "./one-euro";

/**
 * Dresses a tracked body.
 *
 * Each frame this works out four transforms, one per bone, that map the shirt's
 * rest pose, in metres, onto the screen, in CSS pixels; and a width for each of seven
 * rows down the torso. Nothing about the person is assumed in advance: scale, shoulder
 * width and the shape of the torso are all measured from this visitor at this
 * distance from their camera.
 *
 * Where the joints only say roughly where someone is, the outline says exactly: each
 * row of the shirt is sized to the body's real edges at that height, and the shirt is
 * then clipped to the outline, so its edge is the body's edge.
 *
 * The shirt is laid out facing the viewer, with its +X arm on screen right. The video
 * is shown mirrored, so the joint that lands on screen right is the visitor's right
 * one. Taking it as the shirt's +X rather than flipping the shirt keeps the print
 * readable, where a true mirror would reverse it: a shopper sees WOLFEXO, not OXEFLOW.
 */

/** The dress form's shoulder joint, from scripts/blender/finish_jersey.py. */
const REST_JOINT_X = 0.178;
const REST_JOINT_Y = 0.628;
/** The top of the shoulder seam, above that joint. */
const REST_SEAM_Y = 0.705;
/** The point of the shirt that goes on the hip joints: a hem falls well below them. */
const REST_HIP_Y = 0.17;
const REST_ARM_ANGLE = (36 * Math.PI) / 180;

/** How far the top of a shoulder sits above MediaPipe's joint, before it is measured. */
const DEFAULT_LIFT = 0.04;
/** The shirt is cut with room in it: slightly wider than joint to joint. */
const EASE = 1.07;
/** Torso length as a multiple of shoulder width, for when the hips are out of
 *  shot, which at a laptop they usually are. */
const TORSO_RATIO = 1.34;
const MIN_SEEN = 0.5;
/** How far down arms are assumed to hang when the elbows are out of shot. */
const IDLE_ARM_DROP = (68 * Math.PI) / 180;

/** Below this share of face in the head, someone has their back turned. Above the
 *  other, they are facing the camera. A three-quarter view sits between the two: it
 *  still shows a cheek, so it says nothing either way. */
const FACE_HIDDEN = 0.12;
const FACE_SHOWN = 0.6;
/** Only near full front or full back is the head worth believing over the joints. */
const FACING_SQUARE = 0.8;
/** Frames the two must disagree for. One bad frame of either can't turn the shirt. */
const DISAGREE_FRAMES = 6;

/** Rows down the torso that are fitted to the outline. */
export const FIT_ROWS = 7;
/** The first row's height on the shirt, and how far down the last one is. */
export const FIT_TOP = 0.62;
export const FIT_SPAN = 0.5;

const ROW_Y = Array.from({ length: FIT_ROWS }, (_, i) => FIT_TOP - (FIT_SPAN * i) / (FIT_ROWS - 1));

/** Columns across the shoulders that are fitted to the outline. */
export const FIT_COLS = 9;
/** The first column's place on the shirt, and the gap to the next. */
export const FIT_LEFT = -0.24;
export const FIT_STEP = 0.06;

const COLUMN_X = Array.from({ length: FIT_COLS }, (_, i) => FIT_LEFT + FIT_STEP * i);

export interface GarmentPose {
  hips: Matrix4;
  chest: Matrix4;
  armRight: Matrix4; // the shirt's +X arm, on screen right
  armLeft: Matrix4;
  /** The neck plug, an invisible cylinder that hides the inside of the collar. */
  neck: Matrix4;
  /** False when the shoulders can't be read, so the last good pose stands. */
  valid: boolean;
}

function createPose(): GarmentPose {
  return {
    hips: new Matrix4(),
    chest: new Matrix4(),
    armRight: new Matrix4(),
    armLeft: new Matrix4(),
    neck: new Matrix4(),
    valid: false,
  };
}

/** How the picture sits in the viewport: `object-fit: cover`, flipped. */
export interface VideoFit {
  viewportWidth: number;
  viewportHeight: number;
  videoWidth: number;
  videoHeight: number;
}

/** The shirt's own shape, measured once from its mesh. */
export interface ShirtProfile {
  /** Width and depth of the torso at each row. */
  halfWidth: Float32Array;
  halfDepth: Float32Array;
  /** Height of the shoulder line at each column. */
  seam: Float32Array;
}

/** Reads the torso's width and depth off the mesh, ignoring the sleeves. */
export function measureShirt(
  position: ArrayLike<number>,
  skinIndex: ArrayLike<number>,
  skinWeight: ArrayLike<number>,
  count: number,
): ShirtProfile {
  const halfWidth = new Float32Array(FIT_ROWS);
  const halfDepth = new Float32Array(FIT_ROWS);
  const seam = new Float32Array(FIT_COLS);
  const step = FIT_SPAN / (FIT_ROWS - 1);
  for (let v = 0; v < count; v++) {
    const column = Math.round((position[v * 3] - FIT_LEFT) / FIT_STEP);
    if (
      column >= 0 &&
      column < FIT_COLS &&
      Math.abs(position[v * 3] - COLUMN_X[column]) < 0.012 &&
      Math.abs(position[v * 3 + 2]) < 0.06
    ) {
      seam[column] = Math.max(seam[column], position[v * 3 + 1]);
    }

    let sleeve = 0;
    for (let i = 0; i < 4; i++) {
      if (skinIndex[v * 4 + i] >= 2) sleeve += skinWeight[v * 4 + i];
    }
    if (sleeve > 0.12) continue;
    const row = Math.round((FIT_TOP - position[v * 3 + 1]) / step);
    if (row < 0 || row >= FIT_ROWS) continue;
    halfWidth[row] = Math.max(halfWidth[row], Math.abs(position[v * 3]));
    halfDepth[row] = Math.max(halfDepth[row], Math.abs(position[v * 3 + 2]));
  }
  return { halfWidth, halfDepth, seam };
}

function smoothstep(low: number, high: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

/** The nearest equivalent of `angle` to `near`, so a turn never jumps by a full circle. */
function unwrap(angle: number, near: number): number {
  return angle + 2 * Math.PI * Math.round((near - angle) / (2 * Math.PI));
}

interface Filters {
  scale: OneEuroFilter;
  width: OneEuroFilter;
  turn: OneEuroFilter;
  twist: OneEuroFilter;
  roll: OneEuroFilter;
  pitch: OneEuroFilter;
  lift: OneEuroFilter;
  rows: OneEuroFilter[];
  shifts: OneEuroFilter[];
  seams: OneEuroFilter[];
}

function createFilters(): Filters {
  const filter = (minCutoff: number, beta: number) => new OneEuroFilter({ minCutoff, beta, dCutoff: 1 });
  return {
    // Log of scale: walking towards the camera should feel the same at any distance.
    scale: filter(0.9, 0.6),
    width: filter(0.25, 0.05),
    turn: filter(1.3, 0.9),
    twist: filter(1.0, 0.4),
    roll: filter(1.6, 0.8),
    pitch: filter(0.8, 0.3),
    lift: filter(0.5, 0.2),
    rows: Array.from({ length: FIT_ROWS }, () => filter(1.3, 1.2)),
    shifts: Array.from({ length: FIT_ROWS }, () => filter(1.3, 1.2)),
    seams: Array.from({ length: FIT_COLS }, () => filter(1.3, 1.2)),
  };
}

export class GarmentFitter {
  readonly pose = createPose();
  /** Per row: x is the width multiplier, y a sideways shift in metres. */
  readonly rows = Array.from({ length: FIT_ROWS }, () => new Vector2(1, 0));
  /** Per column across the shoulders: how far the seam moves up, in metres. */
  readonly seam = new Float32Array(FIT_COLS);
  /** The current turn, radians, unbounded: two full turns reads 4π. */
  yaw = 0;
  /** Pixels per metre at the body's distance. */
  scale = 1;
  /** How far the body has moved since the outline was read, 0..1 of the picture. */
  readonly drift = new Vector2();
  /** What the last frame was worked out from, for tuning. */
  readonly debug = {
    face: 0.5,
    swapped: 0,
    raw: 0,
    span: 0,
    depth: 0,
    across: 0,
    width: 0,
    nose: 0,
    earR: 0,
    earL: 0,
    lift: 0,
    order: 0,
  };

  private filters = createFilters();
  private video: VideoFit = { viewportWidth: 1, viewportHeight: 1, videoWidth: 1, videoHeight: 1 };
  private cover = { width: 1, height: 1 };
  private started = false;
  /** How much of the head is face, from the outline, 0..1. Negative until known. */
  private face = -1;
  /** True when the tracker has someone's left and right the wrong way round. */
  private swapped = false;
  private disagreed = 0;

  // Reused between frames: this runs inside the render loop.
  private readonly shoulderR = new Vector3();
  private readonly shoulderL = new Vector3();
  private readonly hipsMiddle = new Vector3();
  private readonly worldR = new Vector3();
  private readonly worldL = new Vector3();
  private readonly worldMiddle = new Vector3();
  private readonly worldHips = new Vector3();
  private readonly middle = new Vector3();
  private readonly anchor = new Vector3();
  private readonly rest = new Vector3();
  private readonly point = new Vector3();
  private readonly rotation = new Matrix4();
  private readonly hipRotation = new Matrix4();
  private readonly quaternion = new Quaternion();
  private readonly swing = new Quaternion();
  private readonly euler = new Euler(0, 0, 0, "ZXY");
  private readonly direction = new Vector3();
  private readonly restDirection = new Vector3();

  reset(): void {
    this.filters = createFilters();
    this.started = false;
    this.yaw = 0;
    this.face = -1;
    this.swapped = false;
    this.disagreed = 0;
    this.relax();
  }

  /** The shirt as it was cut, for when there is no body to fit it to. */
  relax(): void {
    for (const row of this.rows) row.set(1, 0);
    this.seam.fill(0);
  }

  private toScreen(joint: JointReading, out: Vector3): Vector3 {
    const { viewportWidth: w, viewportHeight: h } = this.video;
    const x = (w - this.cover.width) / 2 + (1 - joint.x) * this.cover.width;
    const y = (h - this.cover.height) / 2 + joint.y * this.cover.height;
    // Screen px with the origin mid-viewport and y up, as the orthographic camera has it.
    return out.set(x - w / 2, h / 2 - y, 0);
  }

  /** MediaPipe's world axes, turned to match the mirrored picture. */
  private toWorld(joint: JointReading, out: Vector3): Vector3 {
    return out.set(-joint.wx, -joint.wy, -joint.wz);
  }

  /**
   * Pixels per metre, from every joint in view at once.
   *
   * Taken from one span, like the shoulders, this falls apart as the visitor turns
   * side-on and that span shrinks to nothing. Fitted across the whole body, the
   * height of the torso holds it steady through a full turn.
   */
  private measureScale(body: BodyFrame): number | null {
    const names = [
      "leftShoulder",
      "rightShoulder",
      "leftHip",
      "rightHip",
      "leftElbow",
      "rightElbow",
      "nose",
      "leftEar",
      "rightEar",
    ] as const;
    let weightSum = 0;
    let sx = 0;
    let sy = 0;
    let wx = 0;
    let wy = 0;
    const screen = this.point;
    const world = this.direction;
    for (const name of names) {
      const joint = body.joints[name];
      if (joint.seen < MIN_SEEN) continue;
      this.toScreen(joint, screen);
      this.toWorld(joint, world);
      weightSum += joint.seen;
      sx += screen.x * joint.seen;
      sy += screen.y * joint.seen;
      wx += world.x * joint.seen;
      wy += world.y * joint.seen;
    }
    if (weightSum < 1.5) return null;
    sx /= weightSum;
    sy /= weightSum;
    wx /= weightSum;
    wy /= weightSum;

    let top = 0;
    let bottom = 0;
    for (const name of names) {
      const joint = body.joints[name];
      if (joint.seen < MIN_SEEN) continue;
      this.toScreen(joint, screen);
      this.toWorld(joint, world);
      const dx = world.x - wx;
      const dy = world.y - wy;
      top += joint.seen * ((screen.x - sx) * dx + (screen.y - sy) * dy);
      bottom += joint.seen * (dx * dx + dy * dy);
    }
    return bottom > 0.004 ? top / bottom : null;
  }

  /**
   * The turn, as three.js's rotation about Y.
   *
   * Two readings, each good where the other is poor. MediaPipe's depth says which way
   * the shoulders are turned and is the only signal near facing the camera, but it is
   * noisy. How narrow the shoulders look against their known width is precise once
   * someone has turned, and useless before that, because a cosine is flat at zero.
   */
  private measureTurn(depth: number, across: number, span: number, width: number): number {
    const fromDepth = Math.atan2(-depth, across);
    const ratio = Math.min(1, span / Math.max(width, 0.001));
    const fromWidth = Math.acos(ratio);
    const facingAway = Math.abs(fromDepth) > Math.PI / 2;
    const folded = facingAway ? Math.PI - Math.abs(fromDepth) : Math.abs(fromDepth);
    const trust = smoothstep(0.3, 0.85, fromWidth);
    const size = folded + (fromWidth - folded) * trust;
    const signed = Math.sign(fromDepth || 1) * (facingAway ? Math.PI - size : size);
    return unwrap(signed, this.yaw);
  }

  /**
   * Whether someone is facing the camera, from what the outline sees of their head.
   *
   * The pose model can't be asked: it reports a nose as seen from behind, and when it
   * finds a person who already has their back turned, it labels them as if they were
   * facing it, left and right reversed. A face is a much plainer signal. Skin where
   * the head is means front; hair and no skin means back.
   */
  private readFace(body: BodyFrame, pixelsPerMetre: number): void {
    const { outline, joints } = body;
    if (outline.version === 0) return;

    const { nose, leftEar, rightEar } = joints;
    this.toScreen(leftEar, this.point);
    let x = this.point.x;
    let y = this.point.y;
    this.toScreen(rightEar, this.point);
    x = (x + this.point.x) / 2;
    y = (y + this.point.y) / 2;
    this.toScreen(nose, this.point);
    x = (x + this.point.x) / 2;
    y = (y + this.point.y) / 2;

    const radius = pixelsPerMetre * 0.11;
    const step = radius / 7;
    let face = 0;
    let hair = 0;
    for (let dy = -radius; dy <= radius; dy += step) {
      for (let dx = -radius; dx <= radius; dx += step) {
        const label = this.labelAt(outline, x + dx, y + dy);
        if (label === BODY_LABEL.face) face += 1;
        else if (label === BODY_LABEL.hair) hair += 1;
      }
    }
    if (face + hair < 12) return;
    const share = face / (face + hair);
    this.face = this.face < 0 ? share : this.face + (share - this.face) * 0.2;
  }

  /**
   * Whether the joints' idea of front and back has been wrong for long enough to act.
   *
   * Through a turn the pose model keeps left and right correctly, so this stays out of
   * the way. Its one failure is finding somebody who already has their back turned:
   * then it labels them as if they faced it. So sides are only ever swapped on the
   * evidence of hair where it claims a face, and swapped back when a face returns,
   * which also keeps a bald head from the back from ever reading as a front.
   */
  private checkFacing(cosine: number): boolean {
    if (this.face < 0) return false;
    const wrong = this.swapped
      ? this.face > FACE_SHOWN && cosine < -FACING_SQUARE
      : this.face < FACE_HIDDEN && cosine > FACING_SQUARE;
    this.disagreed = wrong ? this.disagreed + 1 : 0;
    if (this.disagreed < DISAGREE_FRAMES) return false;
    this.disagreed = 0;
    return true;
  }

  update(body: BodyFrame, video: VideoFit, profile: ShirtProfile, time: number): void {
    const pose = this.pose;
    pose.valid = false;

    this.video = video;
    const fit = Math.max(
      video.viewportWidth / video.videoWidth,
      video.viewportHeight / video.videoHeight,
    );
    this.cover.width = video.videoWidth * fit;
    this.cover.height = video.videoHeight * fit;

    if (!body.hasBody) return;
    if (Math.max(body.joints.rightShoulder.seen, body.joints.leftShoulder.seen) < MIN_SEEN) return;

    const measured = this.measureScale(body);
    if (measured === null || measured <= 0) return;
    const f = this.filters;
    const pixelsPerMetre = Math.exp(f.scale.filter(Math.log(measured), time));
    this.scale = pixelsPerMetre;

    const { leftShoulder, rightShoulder } = body.joints;
    this.drift.set(
      (leftShoulder.x + rightShoulder.x) / 2 - body.outline.heldAt.x,
      (leftShoulder.y + rightShoulder.y) / 2 - body.outline.heldAt.y,
    );
    this.readFace(body, pixelsPerMetre);

    const joints = this.swapped ? swapSides(body.joints) : body.joints;
    // Screen right is the visitor's right, because the video is mirrored.
    const right = joints.rightShoulder;
    const left = joints.leftShoulder;

    this.toScreen(right, this.shoulderR);
    this.toScreen(left, this.shoulderL);
    this.toWorld(right, this.worldR);
    this.toWorld(left, this.worldL);
    this.middle.addVectors(this.shoulderR, this.shoulderL).multiplyScalar(0.5);
    this.worldMiddle.addVectors(this.worldR, this.worldL).multiplyScalar(0.5);

    const span3d = this.worldR.distanceTo(this.worldL);
    const width = f.width.filter(span3d, time);

    // The turn, from the shoulder line as the camera sees it.
    const across = this.worldR.x - this.worldL.x;
    const depth = this.worldR.z - this.worldL.z;
    const screenSpan = Math.hypot(
      this.shoulderR.x - this.shoulderL.x,
      this.shoulderR.y - this.shoulderL.y,
    );
    const raw = this.measureTurn(depth, across, screenSpan / pixelsPerMetre, width);

    if (this.checkFacing(Math.cos(raw))) {
      // Left and right are reversed. Start over from the other side, at once: the
      // shirt shouldn't be seen spinning round to correct itself.
      this.swapped = !this.swapped;
      this.started = false;
      this.update(body, video, profile, time);
      return;
    }

    if (!this.started) {
      f.turn.reset();
      this.yaw = raw;
      this.started = true;
    }
    this.yaw = f.turn.filter(raw, time);
    const yaw = this.yaw;

    const debug = this.debug;
    debug.face = this.face;
    debug.swapped = this.swapped ? 1 : 0;
    debug.raw = raw;
    debug.span = screenSpan / pixelsPerMetre;
    debug.depth = depth;
    debug.across = across;
    debug.width = width;
    debug.nose = joints.nose.seen;
    debug.earR = joints.rightEar.seen;
    debug.earL = joints.leftEar.seen;
    debug.order = this.shoulderR.x - this.shoulderL.x;

    // Lean: which way the torso runs on screen, and how far it tips towards the camera.
    // Hips below the picture don't count: the model still reports them, confidently,
    // from nothing but the shoulders, and they would tilt the whole shirt.
    const hipsSeen =
      joints.rightHip.seen >= MIN_SEEN &&
      joints.leftHip.seen >= MIN_SEEN &&
      Math.max(joints.rightHip.y, joints.leftHip.y) < 0.97;
    let torso = width * TORSO_RATIO;
    let torsoRoll = 0;
    let pitchRaw = 0;
    if (hipsSeen) {
      this.toScreen(joints.rightHip, this.point);
      this.toScreen(joints.leftHip, this.direction);
      this.hipsMiddle.addVectors(this.point, this.direction).multiplyScalar(0.5);
      torsoRoll = Math.atan2(-(this.middle.x - this.hipsMiddle.x), this.middle.y - this.hipsMiddle.y);
      this.toWorld(joints.rightHip, this.point);
      this.toWorld(joints.leftHip, this.direction);
      this.worldHips.addVectors(this.point, this.direction).multiplyScalar(0.5);
      this.direction.subVectors(this.worldMiddle, this.worldHips);
      torso = this.direction.length();
      pitchRaw = Math.atan2(this.direction.z, this.direction.y);
    }

    // The shoulders say how the chest is tilted, for as long as they face the camera
    // enough to be read. A slope, so it holds whichever shoulder is on the right.
    const across2d = this.shoulderR.x - this.shoulderL.x;
    const tilt = Math.abs(across2d) > 8 ? Math.atan((this.shoulderR.y - this.shoulderL.y) / across2d) : 0;
    const square = smoothstep(0.4, 0.75, Math.abs(Math.cos(yaw)));
    const roll = f.roll.filter(torsoRoll + (tilt - torsoRoll) * square, time);
    const pitch = f.pitch.filter(Math.max(-0.4, Math.min(0.4, pitchRaw)), time);

    this.euler.set(pitch, yaw, roll);
    this.rotation.makeRotationFromEuler(this.euler);

    // How high the shoulders really are, from the outline.
    const outline = body.outline.version > 0 ? body.outline : null;
    const upX = -Math.sin(roll);
    const upY = Math.cos(roll);
    let lift = DEFAULT_LIFT;
    if (outline && Math.abs(Math.cos(yaw)) > 0.6) {
      const reachUp = pixelsPerMetre * 0.16;
      const a = this.reach(outline, this.shoulderR.x, this.shoulderR.y, upX, upY, reachUp);
      const b = this.reach(outline, this.shoulderL.x, this.shoulderL.y, upX, upY, reachUp);
      if (a >= 0 && b >= 0) lift = Math.min(0.12, Math.max(0.01, (a + b) / 2 / pixelsPerMetre));
    }
    lift = f.lift.filter(lift, time);
    debug.lift = lift;

    const scaleX = (pixelsPerMetre * width * EASE) / (2 * REST_JOINT_X);
    const scaleY = (pixelsPerMetre * (torso + lift)) / (REST_SEAM_Y - REST_HIP_Y);
    const scaleZ = (scaleX + scaleY) / 2;

    this.anchor.set(this.middle.x + upX * lift * pixelsPerMetre, this.middle.y + upY * lift * pixelsPerMetre, 0);
    this.placeTorso(pose.chest, this.rotation, scaleX, scaleY, scaleZ, REST_SEAM_Y, this.anchor);

    if (hipsSeen) {
      // The hem follows the hips' own turn, within reason.
      this.toWorld(joints.rightHip, this.point);
      this.toWorld(joints.leftHip, this.direction);
      this.point.sub(this.direction);
      const hipTurn = Math.atan2(-this.point.z, this.point.x);
      const shoulderTurn = Math.atan2(-depth, across);
      let twist = hipTurn - shoulderTurn;
      twist = Math.atan2(Math.sin(twist), Math.cos(twist));
      twist = f.twist.filter(Math.max(-0.5, Math.min(0.5, twist)), time);
      this.euler.set(pitch, yaw + twist, torsoRoll);
      this.hipRotation.makeRotationFromEuler(this.euler);
      this.placeTorso(pose.hips, this.hipRotation, scaleX, scaleY, scaleZ, REST_HIP_Y, this.hipsMiddle);
    } else {
      pose.hips.copy(pose.chest);
    }

    const armScale = (scaleX + scaleY) / 2;
    this.placeArm(pose.armRight, 1, this.shoulderR, this.worldR, joints.rightElbow, armScale, pixelsPerMetre);
    this.placeArm(pose.armLeft, -1, this.shoulderL, this.worldL, joints.leftElbow, armScale, pixelsPerMetre);

    pose.neck.copy(pose.chest);
    pose.valid = true;

    if (outline) {
      this.fitRows(joints, outline, profile, scaleX, scaleZ, pixelsPerMetre, roll, yaw, time);
      this.fitShoulders(outline, profile, scaleY, pixelsPerMetre, roll, yaw, time);
    }
  }

  /**
   * Lays the shoulder line along the body's. People's shoulders slope in all sorts of
   * ways, and the cut of the shirt only fits one. At each column this finds the top
   * of the body and moves the seam there, so no shoulder pokes out above the shirt.
   */
  private fitShoulders(
    outline: BodyOutline,
    profile: ShirtProfile,
    scaleY: number,
    pixelsPerMetre: number,
    roll: number,
    yaw: number,
    time: number,
  ): void {
    const upX = -Math.sin(roll);
    const upY = Math.cos(roll);
    const facing = smoothstep(0.45, 0.75, Math.abs(Math.cos(yaw)));
    const step = this.cover.width * outline.crop.width / outline.width;

    const top = this.rows[0];
    for (let c = 0; c < FIT_COLS; c++) {
      const x = COLUMN_X[c];
      // The middle columns are in the neck, which runs straight up into the head.
      if (Math.abs(x) < 0.1) continue;

      // Where this part of the seam lands once the top row has widened the shirt.
      const widened = smoothstep(0.1, 0.17, Math.abs(x));
      const placed = x + (x * (top.x - 1) + top.y) * widened;
      const at = this.rest.set(placed, profile.seam[c], 0).applyMatrix4(this.pose.chest);
      const onBody = this.labelAt(outline, at.x, at.y);
      let moved = 0;
      if (onBody >= 0 && isBody(onBody)) {
        moved = Math.max(0, this.reach(outline, at.x, at.y, upX, upY, pixelsPerMetre * 0.08));
      } else {
        // The seam is in the air: come down to the body.
        const limit = pixelsPerMetre * 0.07;
        for (let d = step; d <= limit; d += step) {
          const label = this.labelAt(outline, at.x - upX * d, at.y - upY * d);
          if (label >= 0 && isBody(label)) {
            moved = -d;
            break;
          }
        }
      }
      // A centimetre over, as with the rows: the outline trims it, and it means no
      // sliver of the visitor's own shirt along the top of the shoulder.
      const metres = Math.max(-0.05, Math.min(0.08, moved / scaleY + 0.012)) * facing;
      this.seam[c] = this.filters.seams[c].filter(metres, time);
    }

    // The neck columns follow their neighbours, fading out at the middle.
    const middle = (FIT_COLS - 1) / 2;
    this.seam[middle - 1] = this.seam[middle - 2] * 0.6;
    this.seam[middle + 1] = this.seam[middle + 2] * 0.6;
    this.seam[middle] = (this.seam[middle - 1] + this.seam[middle + 1]) * 0.4;
  }

  private placeTorso(
    out: Matrix4,
    rotation: Matrix4,
    sx: number,
    sy: number,
    sz: number,
    restY: number,
    anchor: Vector3,
  ): void {
    out.copy(rotation);
    out.scale(this.point.set(sx, sy, sz));
    const shifted = this.rest.set(0, restY, 0).applyMatrix4(out);
    out.setPosition(anchor.x - shifted.x, anchor.y - shifted.y, anchor.z - shifted.z);
  }

  private placeArm(
    out: Matrix4,
    side: 1 | -1,
    screenShoulder: Vector3,
    worldShoulder: Vector3,
    elbow: JointReading,
    scale: number,
    pixelsPerMetre: number,
  ): void {
    // The sleeve's rest direction, carried round with the body.
    const rest = this.restDirection
      .set(side * Math.cos(REST_ARM_ANGLE), -Math.sin(REST_ARM_ANGLE), 0)
      .applyMatrix4(this.rotation);

    const direction = this.direction;
    if (elbow.seen >= MIN_SEEN) {
      direction.copy(this.toWorld(elbow, this.point)).sub(worldShoulder).normalize();
    } else {
      direction
        .set(side * Math.cos(IDLE_ARM_DROP), -Math.sin(IDLE_ARM_DROP), 0)
        .applyMatrix4(this.rotation);
    }

    this.swing.setFromUnitVectors(rest, direction);
    this.quaternion.setFromRotationMatrix(this.rotation).premultiply(this.swing);
    out.makeRotationFromQuaternion(this.quaternion);
    out.scale(this.point.set(scale, scale, scale));

    const joint = this.rest.set(side * REST_JOINT_X, REST_JOINT_Y, 0).applyMatrix4(out);
    const depth = (worldShoulder.z - this.worldMiddle.z) * pixelsPerMetre;
    out.setPosition(screenShoulder.x - joint.x, screenShoulder.y - joint.y, depth - joint.z);
  }

  /** Outline pixel under a point on the screen, or -1 off the picture. */
  private labelAt(outline: BodyOutline, x: number, y: number): number {
    const { viewportWidth: w, viewportHeight: h } = this.video;
    const { crop } = outline;
    const u = 1 - (x + w / 2 - (w - this.cover.width) / 2) / this.cover.width;
    const v = (h / 2 - y - (h - this.cover.height) / 2) / this.cover.height;
    if (u < 0 || u >= 1 || v < 0 || v >= 1) return -1;
    const cu = (u - this.drift.x - crop.x) / crop.width;
    const cv = (v - this.drift.y - crop.y) / crop.height;
    if (cu < 0 || cu >= 1 || cv < 0 || cv >= 1) return BODY_LABEL.background;
    return outline.labels[Math.floor(cv * outline.height) * outline.width + Math.floor(cu * outline.width)];
  }

  /**
   * How far the body continues from a point in a direction, in screen px. Negative
   * when the point isn't on the body at all, or runs off the picture.
   */
  private reach(
    outline: BodyOutline,
    x: number,
    y: number,
    dx: number,
    dy: number,
    limit: number,
  ): number {
    const step = (this.cover.width * outline.crop.width) / outline.width;
    const start = this.labelAt(outline, x, y);
    if (start < 0 || !isBody(start)) return -1;
    let misses = 0;
    let travelled = 0;
    for (let d = step; d <= limit; d += step) {
      const label = this.labelAt(outline, x + dx * d, y + dy * d);
      if (label < 0) return -1;
      if (isBody(label)) {
        misses = 0;
        travelled = d;
      } else if (++misses > 1) {
        break;
      }
    }
    return travelled;
  }

  /** Where an arm crosses a row, as a distance along it. Null if it doesn't. */
  private armCrossing(
    shoulder: JointReading,
    elbow: JointReading,
    wrist: JointReading,
    cx: number,
    cy: number,
    ex: number,
    ey: number,
  ): number | null {
    const points = [shoulder, elbow, wrist];
    for (let i = 0; i < 2; i++) {
      if (points[i].seen < 0.4 || points[i + 1].seen < 0.4) continue;
      this.toScreen(points[i], this.point);
      const ax = this.point.x - cx;
      const ay = this.point.y - cy;
      this.toScreen(points[i + 1], this.point);
      const bx = this.point.x - cx;
      const by = this.point.y - cy;
      // Height of each end above the row, and distance along it.
      const heightA = -ey * ax + ex * ay;
      const heightB = -ey * bx + ex * by;
      if (heightA === heightB || heightA * heightB > 0) continue;
      const t = heightA / (heightA - heightB);
      const alongA = ax * ex + ay * ey;
      const alongB = bx * ex + by * ey;
      return alongA + (alongB - alongA) * t;
    }
    return null;
  }

  /** Sizes each row of the shirt to the body's real edges at that height. */
  private fitRows(
    joints: BodyFrame["joints"],
    outline: BodyOutline,
    profile: ShirtProfile,
    scaleX: number,
    scaleZ: number,
    pixelsPerMetre: number,
    roll: number,
    yaw: number,
    time: number,
  ): void {
    const ex = Math.cos(roll);
    const ey = Math.sin(roll);
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const armRadius = 0.05 * pixelsPerMetre;
    const targets = new Float32Array(FIT_ROWS).fill(-1);
    const shifts = new Float32Array(FIT_ROWS);

    for (let i = 0; i < FIT_ROWS; i++) {
      const y = ROW_Y[i];
      const chestShare = smoothstep(0.12, 0.42, y);
      const onChest = this.rest.set(0, y, 0).applyMatrix4(this.pose.chest);
      const onHips = this.anchor.set(0, y, 0).applyMatrix4(this.pose.hips);
      const cx = onHips.x + (onChest.x - onHips.x) * chestShare;
      const cy = onHips.y + (onChest.y - onHips.y) * chestShare;

      const expected = Math.hypot(profile.halfWidth[i] * scaleX * cos, profile.halfDepth[i] * scaleZ * sin);
      if (expected < 1) continue;

      // Past 1.35 of the shirt's own width this is an arm or a bag, not the torso.
      const limit = expected * 1.35;
      let toRight = this.reach(outline, cx, cy, ex, ey, limit);
      let toLeft = this.reach(outline, cx, cy, -ex, -ey, limit);
      if (toRight < 0 || toLeft < 0) continue;

      // An arm resting against the side reads as more torso. Stop short of it. Only
      // while facing the camera: side-on, the arm is in front of the body, not beside it.
      if (y < 0.47 && Math.abs(cos) > 0.75) {
        const armR = this.armCrossing(joints.rightShoulder, joints.rightElbow, joints.rightWrist, cx, cy, ex, ey);
        const armL = this.armCrossing(joints.leftShoulder, joints.leftElbow, joints.leftWrist, cx, cy, ex, ey);
        for (const arm of [armR, armL]) {
          if (arm === null) continue;
          const inner = Math.abs(arm) - armRadius;
          if (inner < expected * 0.55) continue;
          if (arm > 0) toRight = Math.min(toRight, inner);
          else toLeft = Math.min(toLeft, inner);
        }
      }

      targets[i] = (toRight + toLeft) / 2;
      shifts[i] = (toRight - toLeft) / 2;
    }

    // Rows off the bottom of the picture take the last row that could be read.
    let last = -1;
    for (let i = 0; i < FIT_ROWS; i++) if (targets[i] >= 0) last = i;
    if (last < 0) return;
    const first = targets.findIndex((value) => value >= 0);
    for (let i = 0; i < FIT_ROWS; i++) {
      if (targets[i] >= 0) continue;
      const from = i < first ? first : Math.min(i, last) === last ? last : i - 1;
      targets[i] = targets[from];
      shifts[i] = shifts[from];
    }

    // A torso has no corners: one bad row must not put a kink in the cloth.
    const ease = (values: Float32Array) => {
      const copy = values.slice();
      for (let i = 0; i < FIT_ROWS; i++) {
        const above = copy[Math.max(0, i - 1)];
        const below = copy[Math.min(FIT_ROWS - 1, i + 1)];
        values[i] = (above + copy[i] * 2 + below) / 4;
      }
    };
    ease(targets);
    ease(shifts);

    for (let i = 0; i < FIT_ROWS; i++) {
      const expected = Math.hypot(profile.halfWidth[i] * scaleX * cos, profile.halfDepth[i] * scaleZ * sin);
      // Cut a little wide on purpose. The outline trims it to the body's exact edge,
      // but nothing can add cloth where it comes up short.
      const wide = targets[i] * 1.02 + pixelsPerMetre * 0.018;
      const scale = Math.min(1.5, Math.max(0.55, wide / expected));
      // A sideways shift of the shirt turns with it, and fades to nothing side-on.
      const facing = Math.abs(cos) < 0.35 ? 0.35 * Math.sign(cos || 1) : cos;
      const shift = Math.max(-0.06, Math.min(0.06, shifts[i] / (scaleX * facing)));
      this.rows[i].set(
        this.filters.rows[i].filter(scale, time),
        this.filters.shifts[i].filter(shift, time),
      );
    }
  }
}

function swapSides(joints: BodyFrame["joints"]): BodyFrame["joints"] {
  return {
    ...joints,
    leftEar: joints.rightEar,
    rightEar: joints.leftEar,
    leftShoulder: joints.rightShoulder,
    rightShoulder: joints.leftShoulder,
    leftElbow: joints.rightElbow,
    rightElbow: joints.leftElbow,
    leftWrist: joints.rightWrist,
    rightWrist: joints.leftWrist,
    leftIndex: joints.rightIndex,
    rightIndex: joints.leftIndex,
    leftHip: joints.rightHip,
    rightHip: joints.leftHip,
  };
}

function isBody(label: number): boolean {
  return (
    label === BODY_LABEL.skin || label === BODY_LABEL.clothes || label === BODY_LABEL.other
  );
}

/**
 * Turns the outline into what the shirt's shader reads, four bytes a pixel. Red is
 * where the shirt may draw on the near side of the body. Blue is where the far side
 * may: the lining seen through the neck hole.
 *
 * Background, hair and face are off limits to both, so the shirt ends exactly where
 * the body does and long hair falls in front of it. Skin is allowed on the near side,
 * since a sleeve goes over a bare arm, except for a hand or forearm held in front of
 * the chest, which the outline alone can't tell from the arm it should cover. The far
 * side keeps off skin altogether: that is what puts the visitor's neck in front of the
 * back of the collar, and it covers their own collar with the shirt's lining.
 */
export function paintBodyMask(
  body: BodyFrame,
  target: Uint8Array,
  pixelsPerMetre: number,
  video: VideoFit,
): void {
  const { outline, joints } = body;
  const { labels, width, crop } = outline;
  for (let i = 0, j = 0; i < labels.length; i++, j += 4) {
    const label = labels[i];
    target[j] = isBody(label) ? 255 : 0;
    target[j + 2] = label === BODY_LABEL.clothes || label === BODY_LABEL.other ? 255 : 0;
    target[j + 3] = 255;
  }

  const fit = Math.max(
    video.viewportWidth / video.videoWidth,
    video.viewportHeight / video.videoHeight,
  );
  const pixelsPerMask = (video.videoWidth * fit * crop.width) / width;
  const chestDepth = (joints.leftShoulder.wz + joints.rightShoulder.wz) / 2;

  for (const [elbow, wrist, index] of [
    [joints.rightElbow, joints.rightWrist, joints.rightIndex],
    [joints.leftElbow, joints.leftWrist, joints.leftIndex],
  ]) {
    // MediaPipe's z runs away from the camera, so nearer is smaller.
    if (wrist.seen < 0.5 || chestDepth - wrist.wz < 0.08) continue;
    const forearm = (0.05 * pixelsPerMetre) / pixelsPerMask;
    const hand = (0.065 * pixelsPerMetre) / pixelsPerMask;
    carve(target, outline, elbow, wrist, forearm);
    carve(target, outline, wrist, index, hand);
  }
}

/** Clears a capsule between two joints, in outline pixels. */
function carve(
  target: Uint8Array,
  outline: BodyOutline,
  a: JointReading,
  b: JointReading,
  radius: number,
): void {
  const { width, height, crop } = outline;
  const ax = ((a.x - crop.x) / crop.width) * width;
  const ay = ((a.y - crop.y) / crop.height) * height;
  const bx = ((b.x - crop.x) / crop.width) * width;
  const by = ((b.y - crop.y) / crop.height) * height;
  const left = Math.max(0, Math.floor(Math.min(ax, bx) - radius));
  const right = Math.min(width - 1, Math.ceil(Math.max(ax, bx) + radius));
  const top = Math.max(0, Math.floor(Math.min(ay, by) - radius));
  const bottom = Math.min(height - 1, Math.ceil(Math.max(ay, by) + radius));
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy || 1;
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length));
      const px = ax + dx * t - x;
      const py = ay + dy * t - y;
      if (px * px + py * py <= radius * radius) {
        const at = (y * width + x) * 4;
        target[at] = 0;
        target[at + 2] = 0;
      }
    }
  }
}

/** The shirt standing in the glass, turning, for when there is no one to dress. */
export function idlePose(pose: GarmentPose, width: number, height: number, turn: number): void {
  // Sized to the shorter side, and sat a little high to clear the kit picker.
  const scale = Math.min(height * 0.92, width * 1.05);
  const centre = 0.41;
  // A wide screen has the camera's card on the right; a phone has it below.
  const aside = width >= 768 ? -width * 0.17 : 0;
  const raised = width >= 768 ? height * 0.03 : height * 0.2;
  pose.chest.makeTranslation(aside, raised, 0);
  pose.chest.multiply(new Matrix4().makeRotationY(turn));
  pose.chest.scale(new Vector3(scale, scale, scale));
  pose.chest.multiply(new Matrix4().makeTranslation(0, -centre, 0));
  pose.hips.copy(pose.chest);
  pose.armRight.copy(pose.chest);
  pose.armLeft.copy(pose.chest);
  pose.neck.copy(pose.chest);
  pose.valid = true;
}
