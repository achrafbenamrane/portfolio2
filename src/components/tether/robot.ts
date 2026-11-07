import * as THREE from "three";

import type { Ground } from "./ground";
import type { Intent } from "./intent";
import { Rig, type Side, SIDES } from "./rig";

/*
 * The robot as a body in the world: a heavy thing with momentum, on one-sixth gravity. Its feet
 * are planted and stay planted until the body has moved on far enough to need the next step,
 * so it can walk any way at any speed, over any ground, with no animation to match.
 */

/** A little above the real 1.62, or a jump takes longer than a fight can wait. */
export const GRAVITY = 2.5;

const WALK_SPEED = 2.8;
const RUN_SPEED = 7.4;
const CRAWL_SPEED = 1.0;
const CROUCH_SPEED = 1.5;
const TURN_SPEED = 1.9;
const JUMP_SPEED = 5.6;
const GROUND_GRIP = 8;
const AIR_GRIP = 0.9;

const STANCE_WIDTH = 0.42;
const ANKLE_HEIGHT = 0.46;
const LEG_REACH = 0.86;

/** How close it has to be to fight: inside this it squares up and side-steps. */
const FIGHT_RANGE = 15;
const MAX_HEALTH = 100;
export const PUNCH_REACH = 2.5;
const PUNCH_DAMAGE = 9;
/** What a finishing blow does, in metres a second. */
/** After a stagger it can't be staggered again for this long, or fast punches would lock it up. */
const STAGGER_REST = 1.4;
const LUNGE = 1.8;
const LUNGE_FROM = 4.6;
const KNOCKED_BACK = 5;
const KNOCKED_UP = 2.2;
const BLOCKED_SHARE = 0.18;

const smooth = (edge0: number, edge1: number, value: number) => THREE.MathUtils.smoothstep(value, edge0, edge1);
const damp = THREE.MathUtils.damp;

type Foot = {
  side: Side;
  /** Where the ankle is, in the world. */
  at: THREE.Vector3;
  from: THREE.Vector3;
  to: THREE.Vector3;
  /** 0 to 1 through a step, or below 0 when it's planted. */
  step: number;
  duration: number;
  lift: number;
  pitch: number;
  normal: THREE.Vector3;
};

type Arm = {
  side: Side;
  /** Where the hand is, in the chest's own space. */
  hand: THREE.Vector3;
  velocity: THREE.Vector3;
  /** 0 to 1 through a punch, or below 0 when there isn't one. */
  punch: number;
  landed: boolean;
  grip: number;
};

export type RobotEvents = {
  footfall(at: THREE.Vector3, strength: number, yaw: number, normal: THREE.Vector3): void;
  landed(at: THREE.Vector3, strength: number): void;
  struck(at: THREE.Vector3, strength: number, blocked: boolean): void;
  launched(at: THREE.Vector3): void;
};

const vector = {
  forward: new THREE.Vector3(),
  left: new THREE.Vector3(),
  desired: new THREE.Vector3(),
  home: new THREE.Vector3(),
  target: new THREE.Vector3(),
  hip: new THREE.Vector3(),
  a: new THREE.Vector3(),
  b: new THREE.Vector3(),
  c: new THREE.Vector3(),
  elbow: new THREE.Vector3(),
  up: new THREE.Vector3(0, 1, 0),
};
const turn = {
  yaw: new THREE.Quaternion(),
  tilt: new THREE.Quaternion(),
  pitch: new THREE.Quaternion(),
  foot: new THREE.Quaternion(),
  euler: new THREE.Euler(),
};

export class Robot {
  readonly rig: Rig;
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  health = MAX_HEALTH;
  grounded = true;
  /** 0 standing, 1 flat on the ground. */
  prone = 0;
  crouch = 0;
  blocking = false;
  /** Fighting back from a hit: can't act until it's over. */
  stun = 0;
  /** Blows are divided by this: the operator is a long way off, and gets some help. */
  toughness = 1;
  private staggerWait = 0;
  /** How hard the jets are firing, 0 to 1. */
  thrust = 0;
  /** Something built over the ground, like a ramp, that it's walking on instead. */
  floor: ((x: number, z: number) => number | null) | null = null;
  /** When it's a person's job to steer, this is who they're squaring up to. */
  opponent: Robot | null = null;
  events: RobotEvents | null = null;
  enabled = true;

  private readonly feet: Foot[];
  private readonly arms: Arm[];
  private readonly ground: Ground;
  private windup = 0;
  private sag = 0;
  private sagSpeed = 0;
  private flinch = new THREE.Vector2();
  private flinchSpeed = new THREE.Vector2();
  private twist = 0;
  private crawl = 0;
  private lean = 0;
  private sway = 0;
  private fallen = 0;
  private lastStep: Side = "R";
  private lookYaw = 0;

  constructor(rig: Rig, ground: Ground) {
    this.rig = rig;
    this.ground = ground;
    this.feet = SIDES.map((side) => ({
      side,
      at: new THREE.Vector3(),
      from: new THREE.Vector3(),
      to: new THREE.Vector3(),
      step: -1,
      duration: 0.5,
      lift: 0.3,
      pitch: 0,
      normal: new THREE.Vector3(0, 1, 0),
    }));
    this.arms = SIDES.map((side) => ({
      side,
      hand: new THREE.Vector3((side === "L" ? 1 : -1) * 0.98, -1.26, 0.12),
      velocity: new THREE.Vector3(),
      punch: -1,
      landed: false,
      grip: 0.3,
    }));
  }

  get alive() {
    return this.health > 0;
  }

  private surface(x: number, z: number) {
    return this.floor?.(x, z) ?? this.ground.surfaceAt(x, z);
  }

  get healthShare() {
    return Math.max(this.health / MAX_HEALTH, 0);
  }

  /** Stands it somewhere, with its feet under it. */
  place(x: number, z: number, yaw: number) {
    this.position.set(x, this.ground.surfaceAt(x, z), z);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.grounded = true;
    this.health = MAX_HEALTH;
    this.fallen = 0;
    this.axes();
    for (const foot of this.feet) {
      this.homeFor(foot, 0, foot.at);
      foot.at.y = this.surface(foot.at.x, foot.at.z) + ANKLE_HEIGHT;
      foot.step = -1;
    }
  }

  private axes() {
    vector.forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    vector.left.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  private homeFor(foot: Foot, lead: number, out: THREE.Vector3) {
    const side = foot.side === "L" ? 1 : -1;
    const prone = this.prone;
    out.copy(this.position)
      .addScaledVector(vector.left, side * (STANCE_WIDTH + prone * 0.14))
      .addScaledVector(vector.forward, -prone * 2.5)
      .addScaledVector(this.velocity, lead);
    return out;
  }

  update(dt: number, intent: Intent) {
    this.axes();
    this.steer(dt, intent);
    this.move(dt);
    this.axes();
    this.stepFeet(dt);
    this.pose(dt, intent);
  }

  private steer(dt: number, intent: Intent) {
    const opponent = this.opponent?.alive ? this.opponent : null;
    const able = this.alive && this.stun <= 0 && this.enabled;
    this.stun = Math.max(this.stun - dt, 0);
    this.staggerWait = Math.max(this.staggerWait - dt, 0);

    const wantsProne = able && intent.prone;
    this.prone = damp(this.prone, wantsProne ? 1 : 0, 3.2, dt);
    this.crouch = damp(this.crouch, able && intent.crouch && !wantsProne ? 1 : 0, 9, dt);
    this.blocking = able && intent.block && this.prone < 0.3;

    let forward = 0;
    let across = 0;
    if (able) {
      const top = this.prone > 0.5 ? CRAWL_SPEED : this.crouch > 0.5 ? CROUCH_SPEED : intent.run ? RUN_SPEED : WALK_SPEED;
      forward = intent.move * top * (this.blocking ? 0.45 : 1) * (intent.move < 0 ? 0.6 : 1);
      if (opponent) {
        const gap = vector.a.copy(opponent.position).sub(this.position);
        gap.y = 0;
        if (gap.length() < FIGHT_RANGE) {
          // Squared up to it: forward and back close the gap, left and right circle it.
          const facing = Math.atan2(gap.x, gap.z);
          this.yaw = dampAngle(this.yaw, facing, 7, dt);
          across = intent.turn * WALK_SPEED * 0.9;
        } else {
          this.yaw -= intent.turn * TURN_SPEED * dt;
        }
      } else {
        this.yaw -= intent.turn * TURN_SPEED * (1 - 0.45 * smooth(3, 6, this.speed)) * dt;
      }
    }

    vector.desired.set(0, 0, 0).addScaledVector(vector.forward, forward).addScaledVector(vector.left, -across);
    const grip = this.grounded ? GROUND_GRIP : AIR_GRIP;
    const change = grip * dt;
    const dx = vector.desired.x - this.velocity.x;
    const dz = vector.desired.z - this.velocity.z;
    const gap = Math.hypot(dx, dz);
    if (gap > 0) {
      const share = Math.min(change / gap, 1);
      this.velocity.x += dx * share;
      this.velocity.z += dz * share;
    }

    if (able && intent.jump && this.grounded && this.windup <= 0 && this.prone < 0.3) this.windup = 0.2;
    intent.jump = false;
    if (able && intent.punchLeft) this.punch(0);
    if (able && intent.punchRight) this.punch(1);
    intent.punchLeft = false;
    intent.punchRight = false;
  }

  get speed() {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  get isPunching() {
    return this.arms.some((arm) => arm.punch >= 0);
  }

  /** Pushes it, as another robot's mass does when they're shoulder to shoulder. */
  shove(x: number, z: number) {
    this.position.x += x;
    this.position.z += z;
  }

  private punch(index: number) {
    const arm = this.arms[index];
    if (arm.punch >= 0 || this.prone > 0.4 || this.blocking) return;
    arm.punch = 0;
    arm.landed = false;
    // The weight goes in behind it. From across a room nobody can judge a gap to the centimetre.
    const foe = this.opponent;
    if (foe?.alive && Math.hypot(foe.position.x - this.position.x, foe.position.z - this.position.z) < LUNGE_FROM) {
      this.velocity.x += Math.sin(this.yaw) * LUNGE;
      this.velocity.z += Math.cos(this.yaw) * LUNGE;
    }
  }

  /** Drops it in from high up, falling, with its jets going: how the enemy arrives. */
  dropIn(x: number, z: number, height: number, yaw: number) {
    this.place(x, z, yaw);
    this.position.y += height;
    this.velocity.y = -9;
    this.grounded = false;
    this.thrust = 1;
  }

  private move(dt: number) {
    if (this.windup > 0) {
      this.windup -= dt;
      if (this.windup <= 0 && this.grounded) {
        this.velocity.y = JUMP_SPEED;
        this.grounded = false;
        this.thrust = 1;
        this.events?.launched(this.position);
        for (const foot of this.feet) foot.step = -1;
      }
    }

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    const surface = this.surface(this.position.x, this.position.z);
    if (this.grounded) {
      this.position.y = damp(this.position.y, surface, 18, dt);
    } else {
      this.velocity.y -= GRAVITY * dt;
      this.position.y += this.velocity.y * dt;
      this.thrust = damp(this.thrust, this.velocity.y > 2 ? 1 : 0, 4, dt);
      if (this.position.y <= surface && this.velocity.y <= 0) {
        const hit = -this.velocity.y;
        this.position.y = surface;
        this.velocity.y = 0;
        this.grounded = true;
        this.sagSpeed -= hit * 0.34;
        for (const foot of this.feet) {
          this.homeFor(foot, 0.05, foot.at);
          foot.at.y = this.surface(foot.at.x, foot.at.z) + ANKLE_HEIGHT;
          foot.step = -1;
        }
        this.events?.landed(this.position, hit);
      }
    }
    if (this.grounded) this.thrust = damp(this.thrust, 0, 6, dt);
  }

  private stepFeet(dt: number) {
    const speed = this.speed;
    const running = smooth(3.2, 6.4, speed);
    const stepTime = THREE.MathUtils.lerp(0.5, 0.34, running);

    if (!this.grounded) {
      // Legs in the air: gathered up on the way, and reaching down for the landing.
      const reach = smooth(-1, -4, this.velocity.y);
      for (const foot of this.feet) {
        const side = foot.side === "L" ? 1 : -1;
        const kick = side * 0.34 * (1 - reach);
        vector.target
          .copy(this.position)
          .addScaledVector(vector.left, side * STANCE_WIDTH)
          .addScaledVector(vector.forward, kick);
        vector.target.y += ANKLE_HEIGHT + THREE.MathUtils.lerp(0.65 - kick * 0.8, 0.12, reach);
        foot.at.lerp(vector.target, 1 - Math.exp(-dt * 9));
        foot.pitch = damp(foot.pitch, 0.25 * reach - 0.3 * (1 - reach), 8, dt);
      }
      return;
    }

    for (const foot of this.feet) {
      if (foot.step < 0) continue;
      foot.step = Math.min(foot.step + dt / foot.duration, 1);
      const t = foot.step;
      // Keep aiming at where the body will be, until the foot's nearly down.
      if (t < 0.72) {
        this.homeFor(foot, foot.duration * (1 - t) + foot.duration * 0.42, foot.to);
        foot.to.y = this.surface(foot.to.x, foot.to.z) + ANKLE_HEIGHT;
      }
      const eased = t * t * (3 - 2 * t);
      foot.at.lerpVectors(foot.from, foot.to, eased);
      foot.at.y += Math.sin(t * Math.PI) * foot.lift;
      foot.pitch = t < 0.5 ? -0.6 * Math.sin(t * Math.PI * 2) : 0.42 * Math.sin((t - 0.5) * Math.PI * 2);
      if (t >= 1) {
        foot.step = -1;
        foot.at.copy(foot.to);
        foot.pitch = 0;
        this.ground.normalAt(foot.at.x, foot.at.z, foot.normal);
        this.events?.footfall(foot.at, 0.4 + speed * 0.12, this.yaw, foot.normal);
      }
    }

    // Who needs to move: whichever planted foot has been left furthest behind.
    const swinging = this.feet.find((foot) => foot.step >= 0);
    const free = !swinging || swinging.step > THREE.MathUtils.lerp(0.97, 0.62, running);
    if (!free) return;
    const allowed = THREE.MathUtils.lerp(0.34, LEG_REACH, smooth(0.2, 4, speed));
    let worst: Foot | null = null;
    let worstGap = allowed;
    for (const foot of this.feet) {
      if (foot.step >= 0) continue;
      this.homeFor(foot, 0, vector.home);
      const gap = Math.hypot(foot.at.x - vector.home.x, foot.at.z - vector.home.z);
      const biased = foot.side === this.lastStep ? gap * 0.8 : gap;
      if (biased > worstGap) {
        worstGap = biased;
        worst = foot;
      }
    }
    if (worst) {
      worst.from.copy(worst.at);
      worst.step = 0;
      worst.duration = stepTime * (speed < 0.5 ? 1.15 : 1);
      worst.lift = 0.14 + 0.1 * Math.min(speed, 3) + running * 0.42;
      this.homeFor(worst, stepTime * 1.42, worst.to);
      worst.to.y = this.surface(worst.to.x, worst.to.z) + ANKLE_HEIGHT;
      this.lastStep = worst.side;
    }
  }

  private pose(dt: number, intent: Intent) {
    const rig = this.rig;
    const bone = rig.bones;
    const speed = this.speed;
    const running = smooth(3.2, 6.4, speed);
    const forwardSpeed = this.velocity.dot(vector.forward);
    const dead = !this.alive;
    this.fallen = damp(this.fallen, dead ? 1 : 0, 2.2, dt);

    rig.model.position.copy(this.position);
    rig.model.rotation.set(0, this.yaw, 0);

    // The knees take the weight of a landing, and it comes back up like a suspension.
    this.sagSpeed += (-this.sag * 48 - this.sagSpeed * 7.5) * dt;
    this.sag += this.sagSpeed * dt;

    let swing = 0;
    let lifted = 0;
    for (const foot of this.feet) {
      if (foot.step >= 0) {
        lifted += Math.sin(foot.step * Math.PI);
        swing += foot.side === "L" ? 1 : -1;
      }
    }
    this.sway = damp(this.sway, swing * 0.07 * (1 - running), 7, dt);

    const standing = rig.pelvisHeight - 0.13 - running * 0.1;
    const charge = this.windup > 0 ? 0.34 : 0;
    const prone = this.prone + this.fallen * (1 - this.prone);
    let height = standing - this.crouch * 0.74 - charge + this.sag + lifted * (0.04 + running * 0.14);
    if (!this.grounded) height = standing + 0.05;
    height = THREE.MathUtils.lerp(height, 0.86, prone);

    this.lean = damp(this.lean, (forwardSpeed / RUN_SPEED) * 0.26, 5, dt);
    const stoop = this.crouch * 0.42 + charge * 0.6;
    const pitch = THREE.MathUtils.lerp(this.lean + stoop, 1.44, prone);

    bone.Pelvis.position.set(this.sway, height, -prone * 0.2);
    turn.euler.set(pitch, 0, this.sway * 0.6);
    bone.Pelvis.quaternion.setFromEuler(turn.euler);

    // Being hit rocks the top of the body, and it swings back on a spring.
    this.flinchSpeed.x += (-this.flinch.x * 70 - this.flinchSpeed.x * 9) * dt;
    this.flinchSpeed.y += (-this.flinch.y * 70 - this.flinchSpeed.y * 9) * dt;
    this.flinch.addScaledVector(this.flinchSpeed, dt);

    const punching = this.arms.find((arm) => arm.punch >= 0);
    let twistGoal = 0;
    if (punching) {
      const t = punching.punch;
      twistGoal = (punching.side === "L" ? -1 : 1) * (t < 0.24 ? -0.34 : t < 0.6 ? 0.6 : 0.2);
    }
    twistGoal += swing * 0.1 * (1 - this.prone);
    this.twist = damp(this.twist, twistGoal, 15, dt);

    turn.euler.set(-this.lean * 0.3 - stoop * 0.3 + this.flinch.x * 0.5, this.twist * 0.5, this.flinch.y * 0.5);
    bone.Spine.quaternion.setFromEuler(turn.euler);
    turn.euler.set(this.flinch.x * 0.5 + stoop * 0.4, this.twist * 0.6, this.flinch.y * 0.5);
    bone.Chest.quaternion.setFromEuler(turn.euler);

    this.lookAhead(dt, prone);
    rig.model.updateWorldMatrix(true, false);
    bone.Pelvis.updateWorldMatrix(true, false);

    // Feet: each one laid on the ground it's standing on, or pointed along a step.
    turn.yaw.setFromAxisAngle(vector.up, this.yaw);
    for (const foot of this.feet) {
      this.ground.normalAt(foot.at.x, foot.at.z, foot.normal);
      turn.tilt.setFromUnitVectors(vector.up, foot.normal);
      const planted = foot.step < 0 && this.grounded;
      turn.foot.copy(planted ? turn.tilt : turn.pitch.identity());
      turn.foot.multiply(turn.yaw);
      const toes = THREE.MathUtils.lerp(foot.pitch, -1.08, prone);
      turn.pitch.setFromAxisAngle(vector.left.set(1, 0, 0), toes);
      turn.foot.multiply(turn.pitch);
      this.axes();

      vector.target.copy(foot.at);
      if (prone > 0.001) {
        // Lying down, the legs trail out behind the body, with the toes dug in.
        const side = foot.side === "L" ? 1 : -1;
        const crawl = Math.sin(this.crawl + (side > 0 ? 0 : Math.PI)) * 0.22;
        vector.b
          .copy(this.position)
          .addScaledVector(vector.left, side * 0.5)
          .addScaledVector(vector.forward, -3.05 + crawl);
        vector.b.y = this.ground.surfaceAt(vector.b.x, vector.b.z) + 0.34;
        vector.target.lerp(vector.b, prone);
      }
      rig.plantLeg(foot.side, vector.target, turn.foot, foot.step >= 0 ? Math.max(foot.pitch, 0) * 0.9 : 0);
    }

    this.crawl += Math.min(speed, 1.2) * dt * 3.4;

    this.poseArms(dt, intent, prone, swing, running);
    rig.aimPistons();
  }

  private lookAhead(dt: number, prone: number) {
    const bone = this.rig.bones;
    let goal = 0;
    const opponent = this.opponent;
    if (opponent) {
      const gap = vector.a.copy(opponent.position).sub(this.position);
      goal = THREE.MathUtils.clamp(wrapAngle(Math.atan2(gap.x, gap.z) - this.yaw), -0.9, 0.9);
    }
    this.lookYaw = damp(this.lookYaw, goal - this.twist * 0.8, 6, dt);
    turn.euler.set(-prone * 1.0, this.lookYaw * 0.4, 0);
    bone.Neck.quaternion.setFromEuler(turn.euler);
    turn.euler.set(-prone * 0.3, this.lookYaw * 0.6, 0);
    bone.Head.quaternion.setFromEuler(turn.euler);
  }

  private poseArms(dt: number, intent: Intent, prone: number, swing: number, running: number) {
    const rig = this.rig;
    const bone = rig.bones;
    bone.Chest.updateWorldMatrix(true, false);
    const chest = bone.Chest.matrixWorld;

    for (const arm of this.arms) {
      const side = arm.side === "L" ? 1 : -1;
      const guard = this.blocking || !!this.opponent?.alive;
      // The opposite foot's step swings this arm, as it does a person's.
      const foot = this.feet[arm.side === "L" ? 1 : 0];
      const stride = foot.step >= 0 ? Math.sin(foot.step * Math.PI) : -0.35;
      const swingShare = Math.min(this.speed / 3, 1) * (guard ? 0.2 : 1);

      // Chest space: x is its left, y up from the chest's base, z forward.
      if (this.blocking) {
        vector.target.set(side * 0.3, 0.92, 1.02);
      } else if (guard) {
        vector.target.set(side * 0.62, 0.54 + stride * 0.05, 0.9 + stride * 0.06 * swingShare);
      } else {
        vector.target.set(side * (1.02 + running * 0.05), -1.1 + running * 0.42, 0.14 + stride * 0.62 * swingShare + running * 0.3);
      }

      let stiffness = 90;
      if (arm.punch >= 0) {
        arm.punch += dt / 0.46;
        const t = arm.punch;
        if (t < 0.24) {
          vector.target.set(side * 0.74, 0.52, 0.1);
          stiffness = 180;
        } else if (t < 0.6) {
          vector.target.set(side * 0.2, 0.76, 2.42);
          stiffness = 620;
          if (t < 0.34) this.velocity.addScaledVector(vector.forward, dt * 6);
          if (!arm.landed) this.tryLanding(arm);
        } else if (t >= 1) {
          arm.punch = -1;
        }
      }

      if (prone > 0.01) {
        const crawl = Math.sin(this.crawl + (side > 0 ? Math.PI : 0)) * 0.34;
        vector.b.set(side * 0.86, 0.52, 0.52 + crawl);
        vector.target.lerp(vector.b, prone);
      }

      // A heavy arm on a spring: it gets there, it doesn't just appear there.
      vector.a.copy(vector.target).sub(arm.hand).multiplyScalar(stiffness);
      vector.a.addScaledVector(arm.velocity, -2 * Math.sqrt(stiffness));
      arm.velocity.addScaledVector(vector.a, dt);
      arm.hand.addScaledVector(arm.velocity, dt);

      vector.b.copy(arm.hand).applyMatrix4(chest);
      vector.elbow.set(side * 0.55, -1, -0.5).transformDirection(chest);
      rig.reachArm(arm.side, vector.b, vector.elbow);

      const gripGoal = arm.punch >= 0 || this.blocking ? 1 : guard ? 0.8 : 0.28;
      arm.grip = damp(arm.grip, gripGoal, 16, dt);
      rig.grip(arm.side, arm.grip);
      bone[`Hand${arm.side}`].rotation.set(-0.2, 0, 0);
    }
  }

  /** Whether a fist has reached the other robot, and what it does when it does. */
  private tryLanding(arm: Arm) {
    const other = this.opponent;
    if (!other?.alive) return;
    const fist = this.rig.bones[`Hand${arm.side}`].getWorldPosition(vector.c);
    const body = vector.a.copy(other.position);
    body.y += 2.6;
    const gap = body.distanceTo(fist);
    if (gap > PUNCH_REACH * 0.74) return;
    arm.landed = true;
    other.takeHit(this, PUNCH_DAMAGE + Math.random() * 4, fist);
  }

  takeHit(from: Robot, amount: number, at: THREE.Vector3) {
    const facing = vector.b.copy(from.position).sub(this.position);
    facing.y = 0;
    facing.normalize();
    const fromFront = facing.dot(vector.forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw))) > 0.2;
    const blocked = this.blocking && fromFront;
    const damage = (amount * (blocked ? BLOCKED_SHARE : 1)) / this.toughness;
    this.health -= damage;
    const shove = blocked ? 0.5 : 2.1;
    this.velocity.addScaledVector(facing, -shove);
    this.flinchSpeed.x -= blocked ? 1 : 6;
    this.flinchSpeed.y += (Math.random() - 0.5) * 6;
    if (!blocked && this.staggerWait <= 0) {
      this.stun = Math.max(this.stun, 0.34);
      this.staggerWait = STAGGER_REST;
    }
    // The last blow doesn't just stop it. There's not much gravity here to argue.
    if (!this.alive) {
      this.velocity.addScaledVector(facing, -KNOCKED_BACK);
      this.velocity.y = KNOCKED_UP;
      this.grounded = false;
    }
    this.events?.struck(at, amount, blocked);
  }

  dispose() {
    this.events = null;
  }
}

function wrapAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function dampAngle(from: number, to: number, speed: number, dt: number) {
  return from + wrapAngle(to - from) * (1 - Math.exp(-speed * dt));
}
