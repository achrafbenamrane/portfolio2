import * as THREE from "three";

import type { Intent } from "./intent";

/*
 * Orbit. The Heron is flown like a heavy spacecraft that's been told to pretend it's an aircraft:
 * it points where the stick says, but its speed takes time to swing round after its nose, so it
 * slides through turns. Raiders come at it in runs and break away, the way fighters do, and
 * everything hit comes apart into debris that keeps going, because here nothing stops it.
 */

const SLOWEST = 70;
const FASTEST = 230;
const PITCH_RATE = 1.05;
const ROLL_RATE = 2.1;
const SWING = 1.5;

const BOLT_SPEED = 1300;
const BOLT_LIFE = 1.6;
const GUN_RATE = 0.075;
const MOST_BOLTS = 220;
const RAIDER_HIT = 13;
const SHIP_HIT = 15;
const ROCK_DAMAGE = 16;
const MISSILES = 8;
const MISSILE_SPEED = 420;
const MOST_MISSILES = 6;

const RAIDER_SPEED = 175;
const RAIDER_TURN = 1.25;
const RAIDER_HEALTH = 34;
const SHIP_HEALTH = 100;

export type Target = { x: number; y: number; distance: number; locked: boolean };

type Raider = {
  object: THREE.Object3D;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  health: number;
  /** "run" comes at the ship, "break" flies off to come round again. */
  mood: "run" | "break";
  clock: number;
  gunClock: number;
  away: THREE.Vector3;
  alive: boolean;
};

type Bolt = { at: THREE.Vector3; velocity: THREE.Vector3; life: number; ours: boolean };
type Missile = { at: THREE.Vector3; velocity: THREE.Vector3; target: Raider | null; life: number; mesh: THREE.Object3D };

const forward = new THREE.Vector3();
const scratch = new THREE.Vector3();
const scratch2 = new THREE.Vector3();
const holder = new THREE.Object3D();
const spin = new THREE.Quaternion();
const localX = new THREE.Vector3(1, 0, 0);
const localY = new THREE.Vector3(0, 1, 0);
const localZ = new THREE.Vector3(0, 0, 1);

export type FlightEvents = {
  blast(at: THREE.Vector3, size: number): void;
  hit(at: THREE.Vector3): void;
  shipHit(strength: number): void;
  fired(): void;
};

export class Flight {
  readonly group = new THREE.Group();
  readonly position = new THREE.Vector3(0, 0, 0);
  readonly velocity = new THREE.Vector3(0, 0, 150);
  readonly turn = new THREE.Quaternion();
  health = SHIP_HEALTH;
  missiles = MISSILES;
  wave = 0;
  killed = 0;
  events: FlightEvents | null = null;

  private readonly raiders: Raider[] = [];
  private readonly bolts: Bolt[] = [];
  private readonly boltMesh: THREE.InstancedMesh;
  private readonly enemyBoltMesh: THREE.InstancedMesh;
  private readonly flying: Missile[] = [];
  private readonly rockets: THREE.Object3D[] = [];
  private pitchRate = 0;
  private rollRate = 0;
  private gunClock = 0;
  private side = 1;
  private lastMissileAsk = false;
  private readonly moonAt = new THREE.Vector3(0, -100000, 0);
  private moonRadius = 0;

  constructor(
    private ship: THREE.Object3D,
    private readonly raiderModel: THREE.Object3D,
  ) {
    const shape = new THREE.BoxGeometry(0.18, 0.18, 24);
    this.boltMesh = new THREE.InstancedMesh(shape, new THREE.MeshBasicMaterial({ color: new THREE.Color(14, 7, 1.8) }), MOST_BOLTS);
    this.enemyBoltMesh = new THREE.InstancedMesh(shape, new THREE.MeshBasicMaterial({ color: new THREE.Color(12, 1.2, 0.8) }), MOST_BOLTS);
    this.boltMesh.frustumCulled = false;
    this.enemyBoltMesh.frustumCulled = false;
    this.group.add(this.boltMesh, this.enemyBoltMesh, ship);
    for (let index = 0; index < MOST_MISSILES; index++) {
      const rocket = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 3, 8).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5, 4) }));
      rocket.visible = false;
      this.group.add(rocket);
      this.rockets.push(rocket);
    }
  }

  /** Puts it in orbit, pointing along a heading, over a Moon it mustn't fly into. */
  startAt(yaw: number, moon: THREE.Vector3, radius: number) {
    this.moonAt.copy(moon);
    this.moonRadius = radius;
    this.position.set(0, 0, 0);
    this.turn.setFromAxisAngle(localY, yaw);
    this.velocity.set(0, 0, 150).applyQuaternion(this.turn);
  }

  /** Takes over the ship that just left the ground. */
  adoptShip(ship: THREE.Object3D) {
    this.ship = ship;
    ship.rotation.set(0, 0, 0);
    this.group.add(ship);
  }

  get alive() {
    return this.health > 0;
  }

  get standing() {
    return this.raiders.filter((raider) => raider.alive).length;
  }

  /** Starts a wave: raiders come in from ahead, spread out. */
  spawnWave(count: number) {
    this.wave += 1;
    forward.set(0, 0, 1).applyQuaternion(this.turn);
    for (let index = 0; index < count; index++) {
      const object = this.raiderModel.clone(true);
      this.group.add(object);
      const position = this.position.clone().addScaledVector(forward, 2200 + index * 200);
      position.x += (Math.random() - 0.5) * 1400;
      position.y += (Math.random() - 0.5) * 700;
      this.raiders.push({
        object,
        position,
        velocity: forward.clone().multiplyScalar(-RAIDER_SPEED),
        health: RAIDER_HEALTH,
        mood: "run",
        clock: 4 + Math.random() * 3,
        gunClock: Math.random(),
        away: new THREE.Vector3(),
        alive: true,
      });
    }
  }

  update(dt: number, intent: Intent) {
    this.fly(dt, intent);
    this.shoot(dt, intent);
    for (const raider of this.raiders) if (raider.alive) this.steerRaider(raider, dt);
    this.moveBolts(dt);
    this.moveMissiles(dt);
  }

  private fly(dt: number, intent: Intent) {
    const ease = 1 - Math.exp(-dt * 5);
    this.pitchRate += (intent.pitch * PITCH_RATE - this.pitchRate) * ease;
    this.rollRate += (intent.roll * ROLL_RATE - this.rollRate) * ease;

    // Nose up about its own left, roll about its own nose: all in the ship's own frame.
    this.turn.multiply(spin.setFromAxisAngle(localX, -this.pitchRate * dt));
    this.turn.multiply(spin.setFromAxisAngle(localZ, this.rollRate * dt));
    // A banked ship slides round into the turn a little, as a plane does.
    const bank = scratch.set(1, 0, 0).applyQuaternion(this.turn).y;
    this.turn.multiply(spin.setFromAxisAngle(localY, bank * 0.28 * dt));
    this.turn.normalize();

    forward.set(0, 0, 1).applyQuaternion(this.turn);
    const speed = THREE.MathUtils.lerp(SLOWEST, FASTEST, intent.throttle);
    scratch.copy(forward).multiplyScalar(speed);
    this.velocity.lerp(scratch, 1 - Math.exp(-dt * SWING));
    this.position.addScaledVector(this.velocity, dt);

    // The ground is a hard limit: it eases the ship away rather than ending the mission.
    const height = this.position.distanceTo(this.moonAt) - this.moonRadius;
    if (height < 160) {
      scratch.copy(this.position).sub(this.moonAt).normalize();
      this.position.addScaledVector(scratch, (160 - height) * Math.min(dt * 6, 1));
    }
    this.ship.position.copy(this.position);
    this.ship.quaternion.copy(this.turn);
  }

  private shoot(dt: number, intent: Intent) {
    this.gunClock -= dt;
    if (intent.fire && this.gunClock <= 0 && this.alive) {
      this.gunClock = GUN_RATE;
      this.side *= -1;
      forward.set(0, 0, 1).applyQuaternion(this.turn);
      // A little help from the gun's own tracking: it leans towards whatever's nearly lined up.
      const best = this.lineUp(0.09);
      const way = scratch2.copy(forward);
      if (best) {
        const lead = best.position.distanceTo(this.position) / BOLT_SPEED;
        way.copy(best.position).addScaledVector(best.velocity, lead).sub(this.position).normalize();
      }
      const at = scratch.set(1.5 * this.side, -2.2, 13).applyQuaternion(this.turn).add(this.position);
      this.bolts.push({ at: at.clone(), velocity: way.clone().multiplyScalar(BOLT_SPEED).add(this.velocity), life: BOLT_LIFE, ours: true });
      this.events?.fired();
    }

    const asked = intent.missile;
    intent.missile = false;
    if (asked && !this.lastMissileAsk && this.missiles > 0) {
      const target = this.lineUp(0.42);
      const rocket = this.rockets.find((item) => !item.visible);
      if (rocket) {
        this.missiles -= 1;
        rocket.visible = true;
        const at = scratch.set(6 * this.side, -1, 2).applyQuaternion(this.turn).add(this.position);
        this.flying.push({ at: at.clone(), velocity: this.velocity.clone(), target, life: 8, mesh: rocket });
      }
    }
    this.lastMissileAsk = asked;
  }

  /** The raider closest to the nose, inside a cone, in radians. */
  private lineUp(cone: number) {
    forward.set(0, 0, 1).applyQuaternion(this.turn);
    let best: Raider | null = null;
    let bestOff = cone;
    for (const raider of this.raiders) {
      if (!raider.alive) continue;
      const off = scratch.copy(raider.position).sub(this.position).normalize().angleTo(forward);
      if (off < bestOff) {
        bestOff = off;
        best = raider;
      }
    }
    return best;
  }

  private steerRaider(raider: Raider, dt: number) {
    raider.clock -= dt;
    const gap = raider.position.distanceTo(this.position);
    if (raider.mood === "run" && (gap < 260 || raider.clock <= 0)) {
      raider.mood = "break";
      raider.clock = 3 + Math.random() * 3;
      raider.away.randomDirection().multiplyScalar(1300).add(this.position);
    } else if (raider.mood === "break" && raider.clock <= 0) {
      raider.mood = "run";
      raider.clock = 6 + Math.random() * 4;
    }

    const aim = raider.mood === "run" ? scratch.copy(this.position).addScaledVector(this.velocity, gap / 500) : scratch.copy(raider.away);
    aim.sub(raider.position).normalize();
    const heading = scratch2.copy(raider.velocity).normalize();
    heading.lerp(aim, Math.min(RAIDER_TURN * dt, 1)).normalize();
    raider.velocity.copy(heading).multiplyScalar(RAIDER_SPEED);
    raider.position.addScaledVector(raider.velocity, dt);
    raider.object.position.copy(raider.position);
    holder.position.copy(raider.position);
    holder.lookAt(scratch.copy(raider.position).add(heading));
    raider.object.quaternion.copy(holder.quaternion);

    raider.gunClock -= dt;
    if (raider.mood === "run" && gap < 1100 && raider.gunClock <= 0 && this.alive) {
      const off = scratch.copy(this.position).sub(raider.position).normalize().angleTo(heading);
      if (off < 0.16) {
        raider.gunClock = 0.42 + Math.random() * 0.5;
        scratch2.copy(this.position).addScaledVector(this.velocity, gap / BOLT_SPEED).sub(raider.position).normalize();
        scratch2.x += (Math.random() - 0.5) * 0.05;
        scratch2.y += (Math.random() - 0.5) * 0.05;
        this.bolts.push({ at: raider.position.clone(), velocity: scratch2.clone().multiplyScalar(BOLT_SPEED * 0.72), life: 1.8, ours: false });
      }
    }
  }

  private moveBolts(dt: number) {
    let ours = 0;
    let theirs = 0;
    for (let index = this.bolts.length - 1; index >= 0; index--) {
      const bolt = this.bolts[index];
      bolt.life -= dt;
      bolt.at.addScaledVector(bolt.velocity, dt);
      let spent = bolt.life <= 0;
      if (bolt.ours) {
        for (const raider of this.raiders) {
          if (raider.alive && raider.position.distanceToSquared(bolt.at) < RAIDER_HIT * RAIDER_HIT) {
            this.damage(raider, 9, bolt.at);
            spent = true;
            break;
          }
        }
      } else if (this.position.distanceToSquared(bolt.at) < SHIP_HIT * SHIP_HIT) {
        this.health -= 4;
        this.events?.shipHit(4);
        spent = true;
      }
      if (spent) {
        this.bolts.splice(index, 1);
        continue;
      }
      holder.position.copy(bolt.at);
      holder.lookAt(scratch.copy(bolt.at).add(bolt.velocity));
      holder.updateMatrix();
      if (bolt.ours && ours < MOST_BOLTS) this.boltMesh.setMatrixAt(ours++, holder.matrix);
      else if (!bolt.ours && theirs < MOST_BOLTS) this.enemyBoltMesh.setMatrixAt(theirs++, holder.matrix);
    }
    this.boltMesh.count = ours;
    this.enemyBoltMesh.count = theirs;
    this.boltMesh.instanceMatrix.needsUpdate = true;
    this.enemyBoltMesh.instanceMatrix.needsUpdate = true;
  }

  private moveMissiles(dt: number) {
    for (let index = this.flying.length - 1; index >= 0; index--) {
      const missile = this.flying[index];
      missile.life -= dt;
      const target = missile.target?.alive ? missile.target : null;
      const heading = scratch.copy(missile.velocity).normalize();
      if (target) {
        scratch2.copy(target.position).sub(missile.at).normalize();
        heading.lerp(scratch2, Math.min(dt * 5, 1)).normalize();
      }
      missile.velocity.copy(heading).multiplyScalar(MISSILE_SPEED + this.velocity.length());
      missile.at.addScaledVector(missile.velocity, dt);
      missile.mesh.position.copy(missile.at);
      missile.mesh.lookAt(scratch2.copy(missile.at).add(heading));
      const struck = target && target.position.distanceToSquared(missile.at) < 22 * 22;
      if (struck) this.damage(target, 100, missile.at);
      if (struck || missile.life <= 0) {
        missile.mesh.visible = false;
        this.flying.splice(index, 1);
      }
    }
  }

  /** Flying into rubble costs a good deal more than a stray bolt does. */
  struckRock(at: THREE.Vector3) {
    this.health -= ROCK_DAMAGE;
    this.events?.shipHit(ROCK_DAMAGE);
    this.events?.blast(at, 1);
  }

  private damage(raider: Raider, amount: number, at: THREE.Vector3) {
    raider.health -= amount;
    this.events?.hit(at);
    if (raider.health > 0) return;
    raider.alive = false;
    raider.object.visible = false;
    this.killed += 1;
    this.events?.blast(raider.position, 1);
  }

  /** Where each raider is on the screen, for the brackets round it. */
  targets(camera: THREE.Camera, width: number, height: number) {
    const found: Target[] = [];
    const locked = this.lineUp(0.42);
    for (const raider of this.raiders) {
      if (!raider.alive) continue;
      scratch.copy(raider.position).project(camera);
      if (scratch.z > 1) continue;
      found.push({
        x: (scratch.x * 0.5 + 0.5) * width,
        y: (0.5 - scratch.y * 0.5) * height,
        distance: raider.position.distanceTo(this.position),
        locked: raider === locked,
      });
    }
    return found;
  }

  reset() {
    this.position.set(0, 0, 0);
    this.velocity.set(0, 0, 150);
    this.turn.identity();
    this.health = SHIP_HEALTH;
    this.missiles = MISSILES;
    this.wave = 0;
    this.killed = 0;
    this.bolts.length = 0;
    for (const raider of this.raiders) this.group.remove(raider.object);
    this.raiders.length = 0;
  }
}
