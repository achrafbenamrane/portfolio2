import type { BodyReading, HandReading, PuppetFrame } from "@/lib/vision/puppet-sensor";

import { type HandShape, palmOf, rollOf, shapeOf, sizeOf } from "./gestures";
import type { Intent } from "./intent";

/*
 * Turns the operator into commands. The whole game is played through here, from a distance,
 * touching nothing.
 *
 * The hand is a marionette's control bar. Lift and lower it to walk forward and back, move it
 * across to turn, and the further from the rest point, the faster. A flick upward jumps. Close it
 * to punch, keep it closed to cover up, two fingers lays the machine down, one crouches it, and
 * a pinch works anything it's standing next to. In flight the same hand is the stick.
 *
 * Every distance here is measured in hand-widths, not screen widths, so it plays the same at
 * arm's length as it does from across the room.
 */

export type ControlMode = "ground" | "flight";

/** How far from the rest point counts as a full push, in lengths of the operator's palm. */
const FULL_REACH = 2.1;
/** Stillness around the rest point, as a share of a full push. */
const DEAD_ZONE = 0.2;
const RUN_FROM = 0.72;
/** A flick up, in palms a second. */
const JUMP_SPEED = 8;
/** A flick is judged over this long, in seconds: one camera frame is too noisy to trust. */
const FLICK_WINDOW = 0.14;
const JUMP_REST = 0.9;
/** A shape has to last this long to count, so it can't flicker. */
const SHAPE_HOLD = 0.09;
const BLOCK_AFTER = 0.3;
const LIE_DOWN_AFTER = 0.3;
const USE_AFTER = 0.2;
const LINK_SECONDS = 1;

// Stood back, playing with the whole body.
/** How hard the knees are swapping over, in torsos a second: walking, flat out, running. */
const MARCH_FROM = 0.3;
const MARCH_FULL = 1.1;
const MARCH_RUN = 1.5;
const MARCH_RUN_STOPS = 1.15;
/** How far the hips have to drop, in torsos. */
const CROUCH_FROM = 0.3;
const DEEP_CROUCH = 0.55;
const LIE_AFTER = 0.9;
/** A punch: how far the wrists surge forward, in shoulder widths, and how quickly. */
const PUNCH_SURGE = 0.7;
const PUNCH_WINDOW = 0.2;
const PUNCH_REST = 0.3;
/** How high a wrist has to be to be up, in shoulder widths from the shoulders, and how far it climbs. */
const ARM_RAISED = -0.8;
const ARM_CLIMB = 0.8;
/** Wrists this far apart, in shoulder widths, are arms held out as wings. */
const ARMS_OUT = 1.8;

export type HandState = {
  x: number;
  y: number;
  size: number;
  speedY: number;
  shape: HandShape;
  shapeAge: number;
  rawShape: HandShape;
  rawAge: number;
  seen: boolean;
  /** Where the hand has been lately: time and height. */
  trail: { at: number; y: number }[];
};

const fresh = (): HandState => ({ x: 0.5, y: 0.5, size: 0.1, speedY: 0, shape: "unsure", shapeAge: 0, rawShape: "unsure", rawAge: 0, seen: false, trail: [] });

export class Puppeteer {
  /** What's on screen for the operator: what we think they're doing. */
  label = "";
  /** How hard each command is being pushed, for the rest point marker. */
  reachX = 0;
  reachY = 0;
  restX = 0.5;
  restY = 0.52;
  driving = false;
  /** Holding still to set the rest point: 0 to 1, then done. */
  linkShare = 0;
  linked = false;
  readonly left = fresh();
  readonly right = fresh();

  private lastAt = 0;
  private jumpWait = 0;
  private nextPunchRight = false;
  private lieDownDone = false;
  private useDone = false;

  // The body's own rest, for playing stood back from the camera.
  private bodyRest: { hip: number; span: number } | null = null;
  private bodyHip = 0;
  private bodyHipSpeed = 0;
  private stepEnergy = 0;
  private marchPace = 0;
  private lastKnees = 0;
  private armTrail: { at: number; forward: number; height: number }[][] = [[], []];
  private punchWait = 0;
  private deepFor = 0;
  private lying = false;
  private missileDone = false;

  /** Takes wherever the hand is now as the middle: what the link-up step asks the operator to do. */
  recentre(x: number, y: number) {
    this.restX = x;
    this.restY = y;
  }

  read(frame: PuppetFrame, intent: Intent, mode: ControlMode, aspect: number) {
    const now = frame.at;
    if (now === this.lastAt) return;
    const dt = Math.min((now - this.lastAt) / 1000, 0.1);
    this.lastAt = now;
    this.jumpWait = Math.max(this.jumpWait - dt, 0);

    if (frame.body) this.readBody(frame.body, intent, mode, dt);
    else this.readHands(frame.hands, intent, mode, dt, aspect);
  }

  private track(state: HandState, hand: HandReading | undefined, dt: number, aspect: number) {
    if (!hand) {
      state.seen = false;
      state.speedY = 0;
      state.trail.length = 0;
      return;
    }
    const palm = palmOf(hand);
    const size = sizeOf(hand, aspect);
    if (state.seen) {
      state.y += (palm.y - state.y) * 0.7;
      state.x += (palm.x - state.x) * 0.7;
      state.size += (size - state.size) * 0.3;
    } else {
      state.x = palm.x;
      state.y = palm.y;
      state.size = size;
      state.speedY = 0;
    }
    state.seen = true;

    // How fast it's rising, in palms a second, over the last moment rather than the last frame.
    const now = this.lastAt / 1000;
    state.trail.push({ at: now, y: palm.y });
    while (state.trail.length > 2 && now - state.trail[0].at > FLICK_WINDOW) state.trail.shift();
    const oldest = state.trail[0];
    const span = now - oldest.at;
    state.speedY = span > FLICK_WINDOW * 0.6 ? (oldest.y - palm.y) / Math.max(state.size, 0.02) / span : 0;

    // A shape only changes once the new one has held for a moment.
    const shape = shapeOf(hand.world);
    if (shape === state.rawShape) state.rawAge += dt;
    else {
      state.rawShape = shape;
      state.rawAge = 0;
    }
    if (state.rawShape !== state.shape && state.rawAge >= SHAPE_HOLD && state.rawShape !== "unsure") {
      state.shape = state.rawShape;
      state.shapeAge = 0;
    } else {
      state.shapeAge += dt;
    }
  }

  private readHands(hands: HandReading[], intent: Intent, mode: ControlMode, dt: number, aspect: number) {
    // Which is which goes by where they are on screen, which is all an operator cares about.
    const sorted = [...hands].sort((a, b) => palmOf(a).x - palmOf(b).x);
    const leftHand = sorted.length === 2 ? sorted[0] : sorted.length === 1 && palmOf(sorted[0]).x < 0.5 ? sorted[0] : undefined;
    const rightHand = sorted.length === 2 ? sorted[1] : sorted.length === 1 && palmOf(sorted[0]).x >= 0.5 ? sorted[0] : undefined;
    const wasLeft = this.left.shape;
    const wasRight = this.right.shape;
    this.track(this.left, leftHand, dt, aspect);
    this.track(this.right, rightHand, dt, aspect);

    const left = this.left;
    const right = this.right;
    const both = left.seen && right.seen;
    const lead = both ? left : left.seen ? left : right.seen ? right : null;
    this.driving = !!lead;
    if (!lead) {
      this.label = "";
      return;
    }

    if (mode === "flight") {
      const hand = (lead === left ? leftHand : rightHand) as HandReading;
      this.flyWithHand(lead, hand, both ? (lead === left ? right : left) : null, intent, aspect);
      return;
    }

    // First, one still, open hand: wherever it is becomes the middle of the control space.
    if (!this.linked) {
      const still = lead.shape === "open" && Math.abs(lead.speedY) < 3.5;
      this.linkShare = Math.max(Math.min(this.linkShare + (still ? dt / LINK_SECONDS : -dt), 1), 0);
      if (this.linkShare >= 1) {
        this.recentre(lead.x, lead.y);
        this.linked = true;
      }
      return;
    }

    // Distance from the rest point, in full pushes.
    const scale = Math.max(lead.size, 0.03) * FULL_REACH;
    const reachX = clampUnit((lead.x - this.restX) / (scale / aspect));
    const reachY = clampUnit((this.restY - lead.y) / scale);
    this.reachX = reachX;
    this.reachY = reachY;
    const steering = lead.shape === "open";
    intent.move = steering ? deadZone(reachY) : 0;
    intent.turn = steering ? deadZone(reachX) : 0;
    intent.run = steering && Math.abs(reachY) > RUN_FROM;
    intent.crouch = lead.shape === "one";

    // Flicking up jumps, as long as the hand was out flat and not on its way to something else.
    if (this.jumpWait <= 0 && steering && lead.speedY > JUMP_SPEED) {
      intent.jump = true;
      this.jumpWait = JUMP_REST;
    }

    const closing = (hand: HandState, was: HandShape) => hand.seen && hand.shape === "fist" && was !== "fist";
    if (both) {
      if (closing(left, wasLeft)) intent.punchLeft = true;
      if (closing(right, wasRight)) intent.punchRight = true;
    } else if (closing(lead, lead === left ? wasLeft : wasRight)) {
      if (this.nextPunchRight) intent.punchRight = true;
      else intent.punchLeft = true;
      this.nextPunchRight = !this.nextPunchRight;
    }
    const held = (hand: HandState) => hand.seen && hand.shape === "fist" && hand.shapeAge > BLOCK_AFTER;
    intent.block = both ? held(left) && held(right) : held(lead);

    if (lead.shape === "two" && lead.shapeAge > LIE_DOWN_AFTER) {
      if (!this.lieDownDone) intent.prone = !intent.prone;
      this.lieDownDone = true;
    } else if (lead.shape !== "two") {
      this.lieDownDone = false;
    }

    if (lead.shape === "pinch" && lead.shapeAge > USE_AFTER) {
      if (!this.useDone) intent.use = true;
      this.useDone = true;
    } else if (lead.shape !== "pinch") {
      this.useDone = false;
    }

    this.label = labelFor(lead.shape, intent);
  }

  /**
   * A punch comes at the camera, so it's depth that gives it away, and depth is the noisiest number
   * the model gives: throw one arm and it moves both wrists. So from a guard, a punch is both
   * wrists surging forward while neither climbs, and the arms simply take turns, as they do with a
   * hand. Bringing the hands up is the opposite: a long climb. From low down, it's the one arm
   * coming up on its own.
   */
  private readPunches(p: BodyReading["points"], span: number, shoulder: number, intent: Intent, dt: number) {
    const now = this.lastAt / 1000;
    const width = Math.max(span, 0.02);
    const surge = [0, 0];
    const climb = [0, 0];
    const raised = [false, false];
    for (const [index, [shoulderAt, wristAt]] of [[11, 15], [12, 16]].entries()) {
      const trail = this.armTrail[index];
      const height = (shoulder - p[wristAt].y) / width;
      const raw = (p[shoulderAt].z - p[wristAt].z) / width;
      const forward = trail.length ? trail[trail.length - 1].forward * 0.5 + raw * 0.5 : raw;
      trail.push({ at: now, forward, height });
      while (trail.length > 2 && now - trail[0].at > PUNCH_WINDOW) trail.shift();
      surge[index] = forward - Math.min(...trail.map((step) => step.forward));
      climb[index] = height - Math.min(...trail.map((step) => step.height));
      raised[index] = height > ARM_RAISED;
    }
    this.punchWait = Math.max(this.punchWait - dt, 0);
    if (this.punchWait > 0) return;

    const fromGuard = raised[0] && raised[1] && Math.max(...surge) > PUNCH_SURGE && Math.max(...climb) < ARM_CLIMB * 0.75;
    const leftAlone = raised[0] && climb[0] > ARM_CLIMB && climb[1] < ARM_CLIMB * 0.4;
    const rightAlone = raised[1] && climb[1] > ARM_CLIMB && climb[0] < ARM_CLIMB * 0.4;
    if (!fromGuard && !leftAlone && !rightAlone) return;
    const right = rightAlone || (!leftAlone && this.nextPunchRight);
    if (right) intent.punchRight = true;
    else intent.punchLeft = true;
    this.nextPunchRight = !right;
    this.punchWait = PUNCH_REST;
  }

  private flyWithHand(lead: HandState, hand: HandReading, other: HandState | null, intent: Intent, aspect: number) {
    const scale = Math.max(lead.size, 0.03) * FULL_REACH;
    intent.roll = clampUnit(rollOf(hand, aspect) / 0.85);
    intent.pitch = deadZone(clampUnit((lead.y - this.restY) / scale));
    // A second hand is the throttle. On its own, the palm's size in the picture is: push to speed up.
    if (other) intent.throttle = clampUnit01(1 - other.y);
    intent.fire = lead.shape === "pinch" || lead.shape === "fist";
    const two = lead.shape === "two";
    if (two && !this.missileDone) intent.missile = true;
    this.missileDone = two;
    this.reachX = intent.roll;
    this.reachY = -intent.pitch;
    this.label = intent.fire ? "Firing" : two ? "Missile" : "Flying";
  }

  private readBody(body: BodyReading, intent: Intent, mode: ControlMode, dt: number) {
    const p = body.points;
    const seen = (index: number) => (p[index].visibility ?? 1) > 0.5;
    if (!seen(11) || !seen(12) || !seen(23) || !seen(24)) {
      this.driving = false;
      this.label = "Step back so the camera can see your whole body";
      return;
    }
    this.driving = true;
    if (!this.linked) {
      this.linkShare = Math.min(this.linkShare + dt / LINK_SECONDS, 1);
      if (this.linkShare >= 1) this.linked = true;
    }
    const hip = (p[23].y + p[24].y) / 2;
    const shoulder = (p[11].y + p[12].y) / 2;
    const span = Math.hypot(p[11].x - p[12].x, p[11].y - p[12].y);
    this.bodyRest ??= { hip, span };
    const rest = this.bodyRest;
    const torso = Math.max(rest.span * 1.6, 0.05);
    const hipDrop = (hip - rest.hip) / torso;
    // Stood still, the rest point creeps to wherever they've settled. A crouch isn't settling.
    if (this.stepEnergy < 0.15 && Math.abs(hipDrop) < 0.12) {
      rest.hip += (hip - rest.hip) * dt * 0.4;
      rest.span += (span - rest.span) * dt * 0.4;
    }

    const nose = p[0];
    // Hands over the head, not wings held high: those are a long way apart.
    const overhead = p[15].y < nose.y && p[16].y < nose.y && Math.abs(p[15].x - p[16].x) < span * 2.2;

    if (mode === "flight") {
      // Arms out like wings: tip them to roll, raise them to climb, lower them to dive. Let them
      // drop to rest, and the ship flies straight.
      const out = Math.abs(p[15].x - p[16].x) / Math.max(span, 0.02) > ARMS_OUT;
      const tilt = Math.atan2(p[16].y - p[15].y, Math.abs(p[16].x - p[15].x) + 0.001);
      const height = ((p[15].y + p[16].y) / 2 - shoulder) / Math.max(span, 0.02);
      intent.roll = out ? clampUnit(tilt / 0.7) : 0;
      intent.pitch = out ? deadZone(clampUnit(-height / 0.8)) : 0;
      intent.fire = Math.hypot(p[15].x - p[16].x, p[15].y - p[16].y) < span * 0.9 && !overhead;
      if (overhead && !this.missileDone) intent.missile = true;
      this.missileDone = overhead;
      this.reachX = intent.roll;
      this.reachY = -intent.pitch;
      this.label = intent.fire ? "Firing" : overhead ? "Missile" : out ? "Flying" : "Arms out to steer";
      return;
    }

    const crouched = hipDrop > CROUCH_FROM;
    // How fast the frames arrive depends on the machine, so everything smoothed here is in seconds.
    const ease = 1 - Math.exp(-dt * 6);

    // Marching on the spot is walking: the harder, the faster. Folding both legs isn't marching.
    const knees = this.lastKnees + (p[25].y - p[26].y - this.lastKnees) * 0.5;
    const swing = crouched ? 0 : Math.abs(knees - this.lastKnees) / torso / Math.max(dt, 0.01);
    this.lastKnees = knees;
    this.stepEnergy += (Math.min(swing, 4) - this.stepEnergy) * ease;
    // Each step is a pulse, so whether they're running is judged over a couple of them.
    this.marchPace += (Math.min(swing, 4) - this.marchPace) * (1 - Math.exp(-dt * 2));
    intent.move = this.stepEnergy > MARCH_FROM ? Math.min(this.stepEnergy / MARCH_FULL, 1) : 0;
    intent.run = intent.move > 0 && this.marchPace > (intent.run ? MARCH_RUN_STOPS : MARCH_RUN);

    const lean = (((p[11].x + p[12].x) / 2 - (p[23].x + p[24].x) / 2) / torso) * -1;
    intent.turn = deadZone(clampUnit(lean / 0.32));

    // A jump takes the hips above where they stand. Getting up from a crouch only gets them back.
    this.bodyHipSpeed += ((this.bodyHip - hip) / torso / Math.max(dt, 0.01) - this.bodyHipSpeed) * (1 - Math.exp(-dt * 30));
    this.bodyHip = hip;
    if (this.jumpWait <= 0 && this.bodyHipSpeed > 1.5 && hipDrop < -0.1) {
      intent.jump = true;
      this.jumpWait = JUMP_REST;
    }

    // Nobody can lie on a floor and stay in shot, so a deep crouch held for a moment counts too.
    const flat = Math.abs(shoulder - hip) < span * 0.7;
    this.deepFor = hipDrop > DEEP_CROUCH ? this.deepFor + dt : 0;
    if (flat || this.deepFor > LIE_AFTER) this.lying = true;
    else if (hipDrop < CROUCH_FROM * 0.5) this.lying = false;
    intent.prone = this.lying;
    intent.crouch = crouched && !this.lying;

    if (overhead) this.punchWait = PUNCH_REST;
    this.readPunches(p, span, shoulder, intent, dt);
    const guarded = (wrist: number) => Math.hypot(p[wrist].x - nose.x, p[wrist].y - nose.y) < span * 1.05;
    intent.block = guarded(15) && guarded(16) && this.punchWait <= 0;

    // Both hands over the head: the "use" signal, seen easily from across a room.
    if (overhead && !this.useDone) intent.use = true;
    this.useDone = overhead;

    const turning = Math.abs(intent.turn) > 0.2;
    this.label = intent.prone ? "Lying down" : intent.block ? "Covering up" : intent.crouch ? "Crouching" : intent.run ? "Running" : intent.move ? "Walking" : turning ? "Turning" : "Standing";
  }
}

function labelFor(shape: HandShape, intent: Intent) {
  if (intent.prone) return "Lying down";
  if (shape === "fist") return intent.block ? "Covering up" : "Punch";
  if (shape === "one") return "Crouching";
  if (shape === "pinch") return "Using";
  if (shape === "two") return "Lying down";
  if (intent.run) return "Running";
  if (intent.move > 0) return "Walking";
  if (intent.move < 0) return "Backing up";
  if (intent.turn) return "Turning";
  return "Standing";
}

const clampUnit = (value: number) => Math.max(-1, Math.min(1, value));
const clampUnit01 = (value: number) => Math.max(0, Math.min(1, value));

function deadZone(value: number) {
  const size = Math.abs(value);
  if (size < DEAD_ZONE) return 0;
  return Math.sign(value) * ((size - DEAD_ZONE) / (1 - DEAD_ZONE));
}
