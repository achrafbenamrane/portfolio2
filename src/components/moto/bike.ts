import * as THREE from "three";

import riderPoses from "@/content/moto-rider.json";

import city from "@/content/moto-city.json";

import type { Ground } from "./city";
import { MAQAM_X, MAQAM_Z, type Ride, type Spot, STAGE_EDGE } from "./ride";
import type { Push, World } from "./world";

/*
 * How the Fang rides. It isn't a car with two wheels drawn on: a motorcycle turns by leaning, so
 * the rider asks for a lean, the bike takes time to fall into it, and the lean sets the turn. It
 * takes longer to tip at speed, because the wheels are gyroscopes. All the numbers are the bike's
 * real ones: its power, weight, gearing and drag, so it gets to 100 and to its top speed in about
 * the time a machine like this does.
 */

const GRAVITY = 9.81;
const MASS = 305; // Bike and rider, in kilos.
const POWER = 231000; // 310 horsepower, in watts.
const DRAG_AREA = 0.36;
const AIR = 1.2;
const ROLLING = 0.018;
const WHEELBASE = 1.45;
const FRONT_RADIUS = 0.3;
const REAR_RADIUS = 0.3225;
const MOST_LEAN = 0.95; // About 54 degrees.
const REDLINE = 14000;
const IDLE = 1400;
/** Top speed in each gear, in metres a second. */
const GEARS = [29, 42, 55, 68, 81, 96];
/** Race brakes and sticky tyres, with the ABS holding it right at the limit. */
const BRAKING = 19;
/** The nitrous: how hard it pushes, how long a full bottle lasts, how long it takes to fill, and how fast it can take the bike. */
const NITRO_PUSH = 8.5;
const NITRO_SECONDS = 6;
const NITRO_REFILL = 22;
const NITRO_TOP = 122;
/** The balance point of a cabrage, in radians: the rider holds it there on the throttle. */
const CABRAGE_ANGLE = 0.92;
/** Paddling backward: how fast, and how long the brake has to be held at a stop before it starts. */
const REVERSE_TOP = 4.5;
const REVERSE_WAIT = 0.4;
/** How far from a wall the middle of the bike can get, and how far in from the kerb. */
const BIKE_RADIUS = 0.55;
const KERB_GAP = 0.35;
/** How close to the edge of the map the rider can go. */
const MAP_MARGIN = 90;
/** Off a crest, the bike keeps to the road unless it drops away by more than this in a frame. */
const STICK = 0.1;
const SWINGARM = 0.58;
const STEERING_AXIS = new THREE.Vector3(0, Math.cos(0.4276), -Math.sin(0.4276));
const UP = new THREE.Vector3(0, 1, 0);
const ACROSS = new THREE.Vector3(1, 0, 0);

export type Controls = { steer: number; throttle: number; brake: number; nitro: number; wheelie: number };

export function freshControls(): Controls {
  return { steer: 0, throttle: 0, brake: 0, nitro: 0, wheelie: 0 };
}

type Rig = {
  steering: THREE.Object3D;
  forkLower: THREE.Object3D;
  frontWheel: THREE.Object3D;
  swingarm: THREE.Object3D;
  rearWheel: THREE.Object3D;
};

const damp = (from: number, to: number, rate: number, dt: number) => from + (to - from) * (1 - Math.exp(-rate * dt));

export class Fang {
  /** On the ground, under the bike's middle: position and heading. */
  readonly holder = new THREE.Group();
  /** Tipped over about the line of the tyres. */
  private readonly tipped = new THREE.Group();
  /** Pitched about the rear axle, for wheelies and stoppies. */
  private readonly pitched = new THREE.Group();
  private readonly rig: Rig;
  private readonly model: THREE.Object3D;
  private readonly riderParts: THREE.Mesh[] = [];
  private helmet: THREE.Object3D | null = null;
  private readonly helmetAt = new THREE.Vector3();
  private readonly helmetTurn = new THREE.Quaternion();
  private readonly poseTurn = new THREE.Quaternion();
  private readonly lookInto = new THREE.Quaternion();
  private readonly levelHead = new THREE.Quaternion();
  private tuck = 0;
  private hang = 0;
  /** 1 at a standstill, with a foot on the road and the bike resting on it. */
  private stopped = 1;
  private readonly forkHome: THREE.Vector3;
  private readonly spot: Spot = { x: 0, y: 0, z: 0, forwardX: 0, forwardZ: 1, rightX: 1, rightZ: 0, slope: 0 };

  along = 0;
  across = 6;
  heading = 0;
  speed = 0;
  lean = 0;
  gear = 0;
  rpm = IDLE;
  topSpeed = 0;
  scrape = 0;
  /** How hard the bike is accelerating, in metres a second squared: the camera and the suspension feel it. */
  surge = 0;
  wheelie = 0;
  /** How much is left in the bottle, and how open it is right now, each from 0 to 1. */
  nitro = 1;
  boost = 0;
  /** How long the front wheel has been up on this cabrage, in seconds. */
  cabrage = 0;
  shiftWait = 0;
  shifted = 0;
  /** At the edge of the map. */
  atEdge = false;
  private x = 0;
  private z = 0;
  private fromX = 0;
  private fromZ = 0;
  private height = 0;
  /** Where the bike really is, which is above the ground when it's in the air, and how fast it's rising. */
  private level = 0;
  private rising = 0;
  private slope = 0;
  private searching = 0;
  private readonly push: Push = { x: 0, z: 0, hit: false };
  private spinFront = 0;
  private spinRear = 0;
  private steerAngle = 0;
  private forkDive = 0;
  private squat = 0;
  private bumps = 0;
  private wheelieRate = 0;
  private landed = 0;
  private holdBack = 0;

  constructor(
    model: THREE.Object3D,
    private readonly ride: Ride,
    private readonly world: World,
    private readonly ground: Ground,
  ) {
    this.model = model;
    const find = (name: string) => {
      const item = model.getObjectByName(name);
      if (!item) throw new Error(`The model has no ${name}`);
      return item;
    };
    this.rig = {
      steering: find("Steering"),
      forkLower: find("ForkLower"),
      frontWheel: find("FrontWheel"),
      swingarm: find("Swingarm"),
      rearWheel: find("RearWheel"),
    };
    this.forkHome = this.rig.forkLower.position.clone();
    // Tipping and pitching happen about the ground and the rear axle, not the model's middle.
    this.pitched.position.set(0, REAR_RADIUS, -WHEELBASE / 2);
    model.position.set(0, -REAR_RADIUS, WHEELBASE / 2);
    this.pitched.add(model);
    this.tipped.add(this.pitched);
    this.holder.add(this.tipped);
  }

  /** Sits the rider on it. Their model shares the bike's axes, so they go straight on. */
  mount(rider: THREE.Object3D) {
    this.model.add(rider);
    rider.traverse((item) => {
      if (item instanceof THREE.Mesh && item.morphTargetInfluences) this.riderParts.push(item);
    });
    this.helmet = rider.getObjectByName("Helmet") ?? null;
  }

  /** Fixes something to the bike, in its own axes, so it leans and lifts with it. */
  attach(item: THREE.Object3D) {
    this.model.add(item);
  }

  /** Puts it on the road, stopped. */
  place(along: number, across: number) {
    this.ride.spot(along, this.spot);
    this.along = along;
    this.across = across;
    this.x = this.fromX = this.spot.x + this.spot.rightX * across;
    this.z = this.fromZ = this.spot.z + this.spot.rightZ * across;
    this.heading = Math.atan2(this.spot.forwardX, this.spot.forwardZ);
    this.height = this.level = this.ground.at(this.x, this.z);
    this.rising = 0;
    this.slope = 0;
    this.speed = 0;
    this.lean = 0;
    this.gear = 0;
    this.rpm = IDLE;
    this.topSpeed = 0;
    this.wheelie = 0;
    this.wheelieRate = 0;
    this.landed = 0;
    this.nitro = 1;
    this.boost = 0;
    this.cabrage = 0;
    this.holdBack = 0;
    this.place3d(0);
  }

  get kmh() {
    return Math.abs(this.speed) * 3.6;
  }

  get reversing() {
    return this.speed < -0.02;
  }

  update(dt: number, input: Controls) {
    this.drive(dt, input);
    this.turn(dt, input);
    this.follow(dt);
    this.place3d(dt);
  }

  /** Held on the brake at a stop, it rolls backward, for getting out of a corner. */
  private backUp(dt: number, input: Controls) {
    const want = input.brake > 0.2 ? -REVERSE_TOP * input.brake : 0;
    this.speed = damp(this.speed, want, input.throttle > 0.1 ? 10 : 2.6, dt);
    if (want === 0 && this.speed > -0.06) this.speed = 0;
    this.gear = 0;
    this.rpm = damp(this.rpm, IDLE + 900, 6, dt);
    this.surge = 0;
    this.boost = damp(this.boost, 0, 8, dt);
    this.nitro = Math.min(this.nitro + dt / NITRO_REFILL, 1);
    this.settleFront(dt, false);
  }

  /** The front wheel comes up on a spring, is held at the balance point, and drops back to the road. */
  private settleFront(dt: number, holding: boolean, lift = 0) {
    const v = this.speed;
    const target = holding ? CABRAGE_ANGLE * (1 - Math.min(v / 170, 0.5)) : Math.min(lift, 0.2);
    this.wheelieRate += ((target - this.wheelie) * (holding ? 14 : 20) - this.wheelieRate * (holding ? 5.5 : 5)) * dt;
    this.wheelie += this.wheelieRate * dt;
    if (this.wheelie < 0) {
      this.landed = Math.min(-this.wheelieRate * 0.022, 0.07);
      this.wheelie = 0;
      this.wheelieRate = 0;
    }
    this.cabrage = this.wheelie > 0.28 ? this.cabrage + dt : 0;
  }

  private drive(dt: number, input: Controls) {
    const v = this.speed;
    if (v <= 0.05 && input.brake > 0.5 && input.throttle < 0.1) this.holdBack += dt;
    else if (input.brake < 0.2) this.holdBack = 0;
    if (this.holdBack > REVERSE_WAIT || v < -0.02) {
      this.backUp(dt, input);
      return;
    }
    this.shiftWait = Math.max(this.shiftWait - dt, 0);
    this.shifted = Math.max(this.shifted - dt, 0);

    // The quickshifter: up at the redline, down as it falls off the boil.
    const gearTop = GEARS[this.gear];
    if (v > gearTop * 0.97 && this.gear < GEARS.length - 1 && this.shiftWait <= 0) {
      this.gear += 1;
      this.shiftWait = 0.12;
      this.shifted = 0.09;
    } else if (this.gear > 0 && v < GEARS[this.gear - 1] * 0.74 && this.shiftWait <= 0) {
      this.gear -= 1;
      this.shiftWait = 0.18;
    }
    const target = Math.max((v / GEARS[this.gear]) * REDLINE, IDLE + input.throttle * 2600);
    this.rpm = damp(this.rpm, Math.min(target, REDLINE), 14, dt);

    // A supercharger makes the torque curve climb with the revs, right to the top.
    const band = 0.45 + 0.55 * Math.min(this.rpm / 11000, 1);
    const cut = this.shifted > 0 ? 0.2 : 1;
    let thrust = (POWER * band * input.throttle * cut) / Math.max(v, 7);

    // Traction control: a rear tyre can only give so much, and less the further it's leaned.
    const grip = MASS * GRAVITY * 1.05 * Math.max(Math.cos(this.lean * 1.15), 0.18);
    thrust = Math.min(thrust, grip);
    // The nitro goes in on top of that, for as long as the bottle lasts.
    const boosting = input.nitro > 0.5 && input.throttle > 0.1 && this.nitro > 0 && v > 1;
    this.nitro = boosting ? Math.max(this.nitro - dt / NITRO_SECONDS, 0) : Math.min(this.nitro + dt / NITRO_REFILL, 1);
    this.boost = damp(this.boost, boosting ? 1 : 0, boosting ? 10 : 5, dt);
    if (boosting) thrust += NITRO_PUSH * MASS * Math.max(Math.cos(this.lean), 0.4);
    // The limiter, flat out in top, which only the nitro gets past.
    if ((this.gear === GEARS.length - 1 && v >= GEARS[this.gear] && !boosting) || v >= NITRO_TOP) thrust = 0;

    const drag = 0.5 * AIR * DRAG_AREA * v * v + ROLLING * MASS * GRAVITY;
    const hill = MASS * GRAVITY * this.slope;
    // Leaned over, a tyre has less grip to give to the brakes.
    const brakes = input.brake * BRAKING * MASS * Math.max(Math.cos(this.lean * 1.05), 0.45);
    const engineBrake = input.throttle < 0.05 && v > 2 ? MASS * 1.6 : 0;
    const push = thrust - drag - hill - (v > 0.05 ? brakes + engineBrake : 0);
    const acceleration = push / MASS;
    this.surge = damp(this.surge, acceleration, 8, dt);
    this.speed = Math.max(v + acceleration * dt, 0);
    if (input.throttle < 0.02 && this.speed < 0.2) this.speed = 0;
    this.topSpeed = Math.max(this.topSpeed, this.speed);

    // Hard on the gas in a low gear the front comes up, until the electronics catch it. A cabrage is
    // the rider asking for it: up on the gas, and straight back down on the brake.
    const lifting = this.lean < 0.2 && this.lean > -0.2 ? Math.max(acceleration - 7.5, 0) * 0.05 : 0;
    const holding = input.wheelie > 0.5 && input.brake < 0.1 && Math.abs(this.lean) < 0.4 && this.speed > 2.5 && (input.throttle > 0.1 || this.wheelie > 0.25);
    this.settleFront(dt, holding, lifting);
  }

  private turn(dt: number, input: Controls) {
    const v = this.speed;
    // Upright at a crawl, and slower to tip the faster it goes.
    // On one wheel there's far less to lean on.
    // The full lean comes in early, or a town street's corners would be too tight to get round.
    const reach = MOST_LEAN * Math.min(Math.abs(v) / 12, 1) * (1 - Math.min(this.wheelie / 0.6, 0.7));
    const quickness = 4.4 / (1 + (v / 52) ** 2);
    this.lean = damp(this.lean, input.steer * reach, quickness, dt);

    const turning = v > 3 ? (GRAVITY * Math.tan(this.lean)) / v : (input.steer * 0.6 * v) / WHEELBASE;
    this.heading -= turning * dt;
    this.steerAngle = damp(this.steerAngle, Math.max(Math.min((WHEELBASE * turning) / Math.max(v, 3) + input.steer * 0.05, 0.5), -0.5), 12, dt);

    this.x += Math.sin(this.heading) * v * dt;
    this.z += Math.cos(this.heading) * v * dt;
  }

  /**
   * Nothing keeps the bike to a road: it goes where it's pointed, and it's what's solid that stops
   * it. The move is walked in short steps, so even flat out it can't pass through a wall.
   */
  private follow(dt: number) {
    const { world, ground, push } = this;
    const [west, south, east, north] = city.bounds;
    const moveX = this.x - this.fromX;
    const moveZ = this.z - this.fromZ;
    const steps = Math.max(Math.ceil(Math.hypot(moveX, moveZ) / 0.4), 1);
    let x = this.fromX;
    let z = this.fromZ;
    let pushX = 0;
    let pushZ = 0;
    this.atEdge = false;
    for (let step = 0; step < steps; step++) {
      const wantX = x + moveX / steps;
      const wantZ = z + moveZ / steps;
      world.clear(wantX, wantZ, BIKE_RADIUS, push);
      world.clearPosts(BIKE_RADIUS, push);
      let nextX = push.x;
      let nextZ = push.z;
      // The edge of the map comes first, so the kerb has the last word on where the bike ends up.
      const boundX = Math.min(Math.max(nextX, west + MAP_MARGIN), east - MAP_MARGIN);
      const boundZ = Math.min(Math.max(nextZ, -north + MAP_MARGIN), -south - MAP_MARGIN);
      if (boundX !== nextX || boundZ !== nextZ) this.atEdge = true;
      nextX = boundX;
      nextZ = boundZ;
      // Roads are for riding on. The kerb stops it as a wall would, whatever's past it: a pavement,
      // a square, a bank. Only the esplanade, which the rider can roam, has no road to keep to.
      if (Math.hypot(nextX - MAQAM_X, nextZ - MAQAM_Z) >= STAGE_EDGE) {
        if (world.keepOnRoad(nextX, nextZ, KERB_GAP, push)) {
          nextX = push.x;
          nextZ = push.z;
        } else {
          nextX = x;
          nextZ = z;
        }
      }
      pushX += nextX - wantX;
      pushZ += nextZ - wantZ;
      x = nextX;
      z = nextZ;
    }
    this.x = this.fromX = x;
    this.z = this.fromZ = z;

    this.scrape = Math.max(this.scrape - dt * 3, 0);
    const size = Math.hypot(pushX, pushZ);
    if (size > 0.002) this.strike(pushX / size, pushZ / size, dt);

    // Where it stands, from the one surface everything stands on.
    const reach = 1.2;
    const forwardX = Math.sin(this.heading) * reach;
    const forwardZ = Math.cos(this.heading) * reach;
    this.height = ground.at(x, z);
    this.slope = (ground.at(x + forwardX, z + forwardZ) - ground.at(x - forwardX, z - forwardZ)) / (reach * 2);
    // It stays on the ground until the ground drops away from it: then it flies, and falls.
    if (this.level - this.height > STICK || this.rising < -0.5) {
      this.rising -= GRAVITY * 1.5 * dt;
      this.level += this.rising * dt;
      if (this.level <= this.height) {
        this.landed = Math.min(-this.rising * 0.012, 0.07);
        this.level = this.height;
        this.rising = 0;
      }
    } else {
      this.rising = dt > 0 ? (this.height - this.level) / dt : 0;
      this.level = this.height;
    }

    // Which part of the main road it's near, if any, for the kerbs and for the lights.
    this.searching = (this.searching + 1) % 20;
    const place = this.searching === 0 ? this.ride.locate(x, z, this.ride.length / 2, this.ride.count) : this.ride.locate(x, z, this.along);
    this.along = Math.min(Math.max(place.along, 0), this.ride.length);
    this.across = place.across;
  }

  /** A glancing touch turns the bike along what it's hit. A square hit loses most of the speed. */
  private strike(outX: number, outZ: number, dt: number) {
    const way = this.speed >= 0 ? 1 : -1;
    const forwardX = Math.sin(this.heading);
    const forwardZ = Math.cos(this.heading);
    const into = -(forwardX * outX + forwardZ * outZ) * way;
    if (into <= 0) return;
    this.speed *= Math.max(1 - into * 2.2 * Math.min(dt * 20, 1), 0.2);
    this.scrape = 1;
    if (way < 0) return;
    const along = forwardX * -outZ + forwardZ * outX >= 0 ? 1 : -1;
    const slide = Math.atan2(-outZ * along, outX * along);
    const off = Math.atan2(Math.sin(slide - this.heading), Math.cos(slide - this.heading));
    this.heading += off * Math.min(dt * 16, 1);
  }

  /** Something's been hit: most of the speed goes, and the bike's pushed out of the way. */
  knock(awayX: number, awayZ: number) {
    this.speed *= 0.42;
    this.scrape = 1;
    this.x += awayX * 1.6;
    this.z += awayZ * 1.6;
  }

  /** Where it is, for the map and the camera. */
  get spotX() {
    return this.x;
  }

  get spotZ() {
    return this.z;
  }

  private place3d(dt: number) {
    const v = this.speed;
    this.holder.position.set(this.x, this.level, this.z);
    this.holder.rotation.y = this.heading;
    const slow = Math.abs(v) < 1.6;
    this.stopped = damp(this.stopped, slow ? 1 : 0, slow ? 5 : 8, dt);
    this.tipped.rotation.z = this.lean - this.stopped * 0.075;
    // A round tyre rolls toward its shoulder as it leans, and the whole bike comes down a little.
    this.tipped.position.y = -0.09 * (1 - Math.cos(this.lean));
    this.tipped.rotation.x = -Math.atan(this.slope);
    this.pitched.rotation.x = -this.wheelie;

    this.spinFront += (v / FRONT_RADIUS) * dt;
    this.spinRear += (v / REAR_RADIUS) * dt;
    this.rig.frontWheel.rotation.x = this.spinFront;
    this.rig.rearWheel.rotation.x = this.spinRear;
    this.rig.steering.quaternion.setFromAxisAngle(STEERING_AXIS, -this.steerAngle);

    // Braking dives the forks, power squats the shock, and the road never stops moving them a little.
    this.bumps += v * dt;
    const road = Math.sin(this.bumps * 3.1) * Math.sin(this.bumps * 1.3) * Math.min(v / 40, 1) * 0.005;
    this.forkDive = damp(this.forkDive, Math.min(Math.max(-this.surge * 0.0062, -0.012), 0.1), 11, dt) + this.landed;
    this.landed = 0;
    this.squat = damp(this.squat, Math.min(Math.max(this.surge * 0.0035, -0.01), 0.03), 9, dt);
    this.rig.forkLower.position.copy(this.forkHome).addScaledVector(STEERING_AXIS, this.forkDive + road);
    const armAngle = this.squat * 1.4 + road * 0.8;
    this.rig.swingarm.rotation.x = armAngle;
    // The wheels stay on the road: it's the body that moves, down over each end.
    const rearDrop = Math.sin(armAngle) * SWINGARM;
    this.pitched.position.y = REAR_RADIUS - rearDrop;
    this.pitched.rotation.x += (this.forkDive + rearDrop) / WHEELBASE;
    this.poseRider(dt);
  }

  /** Down behind the screen at speed, and off the inside of the seat in a corner, looking through it. */
  private poseRider(dt: number) {
    if (this.riderParts.length === 0) return;
    const v = this.speed;
    const fast = Math.min(Math.max((v - 30) / 26, 0), 1);
    const corner = Math.min(Math.abs(this.lean) / 0.62, 1);
    // On the back wheel, the rider's weight goes forward over the tank.
    this.tuck = damp(this.tuck, Math.max(fast * (1 - corner), Math.min(this.wheelie * 1.1, 0.85)), 4, dt);
    this.hang = damp(this.hang, Math.max(Math.min(this.lean / 0.62, 1), -1), 5, dt);
    const right = Math.max(this.hang, 0);
    const left = Math.max(-this.hang, 0);
    const shares: Record<string, number> = { tuck: this.tuck, left, right, stop: this.stopped };
    for (const part of this.riderParts) {
      if (!part.morphTargetInfluences || !part.morphTargetDictionary) continue;
      for (const [name, slot] of Object.entries(part.morphTargetDictionary)) part.morphTargetInfluences[slot] = shares[name] ?? 0;
    }

    const helmet = this.helmet;
    if (!helmet) return;
    const heads = riderPoses.heads as Record<string, { at: number[]; turn: number[] }>;
    const sit = heads.sit;
    this.helmetAt.fromArray(sit.at);
    this.helmetTurn.fromArray(sit.turn);
    for (const [name, share] of Object.entries(shares)) {
      if (share <= 0) continue;
      const pose = heads[name];
      this.helmetAt.x += (pose.at[0] - sit.at[0]) * share;
      this.helmetAt.y += (pose.at[1] - sit.at[1]) * share;
      this.helmetAt.z += (pose.at[2] - sit.at[2]) * share;
      this.helmetTurn.slerp(this.poseTurn.fromArray(pose.turn), share);
    }
    helmet.position.copy(this.helmetAt);
    this.lookInto.setFromAxisAngle(UP, -this.hang * 0.32);
    // A rider keeps their eyes level, whatever the bike's doing under them.
    this.levelHead.setFromAxisAngle(ACROSS, this.wheelie * 0.72);
    helmet.quaternion.copy(this.lookInto).multiply(this.levelHead).multiply(this.helmetTurn);
  }
}
