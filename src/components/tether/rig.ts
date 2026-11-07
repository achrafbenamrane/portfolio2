import * as THREE from "three";

/*
 * The robot's body, as joints. There are no animation clips anywhere in this game: every pose
 * is worked out each frame from where the feet are planted and where the hands are going,
 * which is what lets a hand on a webcam drive it directly and lets it stand on uneven ground.
 */

export type Side = "L" | "R";
export const SIDES: readonly Side[] = ["L", "R"];

const down = new THREE.Vector3(0, -1, 0);
const up = new THREE.Vector3(0, 1, 0);

const scratch = {
  matrix: new THREE.Matrix4(),
  inverse: new THREE.Matrix4(),
  basis: new THREE.Matrix4(),
  x: new THREE.Vector3(),
  y: new THREE.Vector3(),
  z: new THREE.Vector3(),
  root: new THREE.Vector3(),
  target: new THREE.Vector3(),
  joint: new THREE.Vector3(),
  pole: new THREE.Vector3(),
  a: new THREE.Vector3(),
  b: new THREE.Vector3(),
  q: new THREE.Quaternion(),
  q2: new THREE.Quaternion(),
};

/** Where a two-bone limb's middle joint goes, and how far it folds, in radians. */
function solveLimb(root: THREE.Vector3, target: THREE.Vector3, upper: number, lower: number, pole: THREE.Vector3, joint: THREE.Vector3) {
  const { a, b } = scratch;
  a.copy(target).sub(root);
  const distance = THREE.MathUtils.clamp(a.length(), Math.abs(upper - lower) + 0.02, upper + lower - 0.004);
  a.normalize();
  const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
  const out = Math.sqrt(Math.max(upper * upper - along * along, 0));
  b.copy(pole).addScaledVector(a, -pole.dot(a)).normalize();
  joint.copy(root).addScaledVector(a, along).addScaledVector(b, out);
  const inside = THREE.MathUtils.clamp((upper * upper + lower * lower - distance * distance) / (2 * upper * lower), -1, 1);
  return Math.PI - Math.acos(inside);
}

/** Turns a limb so it hangs along `way`, with its front towards `front`. */
function aim(node: THREE.Object3D, way: THREE.Vector3, front: THREE.Vector3) {
  const { x, y, z, basis } = scratch;
  y.copy(way).normalize().negate();
  z.copy(front).addScaledVector(y, -front.dot(y)).normalize();
  x.crossVectors(y, z).normalize();
  basis.makeBasis(x, y, z);
  node.quaternion.setFromRotationMatrix(basis);
}

type Piston = { cylinder: THREE.Object3D; rod: THREE.Object3D; cylinderRest: THREE.Vector3; rodRest: THREE.Vector3 };

export class Rig {
  readonly model: THREE.Object3D;
  readonly bones: Record<string, THREE.Object3D> = {};
  readonly thigh: number;
  readonly shin: number;
  readonly upperArm: number;
  readonly foreArm: number;
  /** The pelvis's height above the soles when it's standing straight. */
  readonly pelvisHeight: number;
  private readonly pistons: Piston[] = [];

  constructor(model: THREE.Object3D) {
    this.model = model;
    model.traverse((item) => {
      this.bones[item.name] = item;
    });
    const bone = this.bones;
    this.thigh = bone.ShinL.position.length();
    this.shin = bone.FootL.position.length();
    this.upperArm = bone.UpperArmL.position.length() + bone.ForeArmL.position.length();
    this.foreArm = bone.HandL.position.length();
    this.pelvisHeight = bone.Pelvis.position.y;

    for (const side of SIDES) {
      for (const name of ["Knee", "Ankle", "Elbow"]) {
        const cylinder = bone[`${name}Cyl${side}`];
        const rod = bone[`${name}Rod${side}`];
        if (!cylinder || !rod) continue;
        this.pistons.push({ cylinder, rod, cylinderRest: new THREE.Vector3(), rodRest: new THREE.Vector3() });
      }
    }
    // Each ram's two halves start out pointing at each other: that's the rest they turn from.
    model.updateWorldMatrix(true, true);
    for (const piston of this.pistons) {
      const top = piston.cylinder.getWorldPosition(new THREE.Vector3());
      const bottom = piston.rod.getWorldPosition(new THREE.Vector3());
      piston.cylinderRest.copy(bottom).sub(top).normalize();
      piston.rodRest.copy(top).sub(bottom).normalize();
    }
  }

  /** Puts a foot's ankle at a point in the world, and lays the foot on the ground. */
  plantLeg(side: Side, ankle: THREE.Vector3, footTurn: THREE.Quaternion, toe: number) {
    const bone = this.bones;
    const thigh = bone[`Thigh${side}`];
    const shin = bone[`Shin${side}`];
    const foot = bone[`Foot${side}`];
    const { inverse, root, target, joint, pole, a, q } = scratch;

    bone.Pelvis.updateWorldMatrix(true, false);
    inverse.copy(bone.Pelvis.matrixWorld).invert();
    root.copy(thigh.position);
    target.copy(ankle).applyMatrix4(inverse);
    pole.set(0, 0, 1);
    const fold = solveLimb(root, target, this.thigh, this.shin, pole, joint);
    a.copy(joint).sub(root);
    aim(thigh, a, pole);
    shin.rotation.set(fold, 0, 0);

    shin.updateWorldMatrix(true, false);
    foot.quaternion.copy(q.setFromRotationMatrix(shin.matrixWorld).invert()).multiply(footTurn);
    bone[`Toe${side}`].rotation.x = toe;
  }

  /** Reaches a hand to a point in the world. `elbow` says which way the elbow leans. */
  reachArm(side: Side, hand: THREE.Vector3, elbow: THREE.Vector3, share = 1) {
    const bone = this.bones;
    const shoulder = bone[`Shoulder${side}`];
    const fore = bone[`ForeArm${side}`];
    const { inverse, root, target, joint, pole, a, q, q2 } = scratch;

    bone.Chest.updateWorldMatrix(true, false);
    inverse.copy(bone.Chest.matrixWorld).invert();
    root.copy(shoulder.position);
    target.copy(hand).applyMatrix4(inverse);
    pole.copy(elbow).transformDirection(inverse);
    const fold = solveLimb(root, target, this.upperArm, this.foreArm, pole, joint);
    a.copy(joint).sub(root);
    q.copy(shoulder.quaternion);
    q2.copy(fore.quaternion);
    // Its front is wherever the forearm goes from the elbow. Nearly straight, that's undefined,
    // and the elbow's lean is the better guide.
    scratch.b.copy(target).sub(joint);
    scratch.b.addScaledVector(a, -scratch.b.dot(a) / a.lengthSq());
    if (scratch.b.lengthSq() < 0.004) scratch.b.copy(pole).negate();
    aim(shoulder, a, scratch.b);
    fore.rotation.set(-fold, 0, 0);
    if (share < 1) {
      shoulder.quaternion.slerp(q, 1 - share);
      fore.quaternion.slerp(q2, 1 - share);
    }
  }

  /** Curls a hand: 0 is open, 1 a fist. */
  grip(side: Side, closed: number) {
    const bone = this.bones;
    const inward = side === "L" ? -1 : 1;
    for (let finger = 0; finger < 3; finger++) {
      bone[`Finger${finger}${side}`].rotation.z = inward * closed * 1.25;
      bone[`Tip${finger}${side}`].rotation.z = inward * closed * 1.45;
    }
    bone[`Thumb${side}`].rotation.x = -closed * 0.8;
  }

  /** The rams slide with the joints: each half keeps pointing at the other. */
  aimPistons() {
    const { a, b, target, q, inverse } = scratch;
    this.model.updateWorldMatrix(true, true);
    for (const piston of this.pistons) {
      piston.cylinder.getWorldPosition(a);
      piston.rod.getWorldPosition(b);
      for (const [node, from, to, rest] of [
        [piston.cylinder, a, b, piston.cylinderRest],
        [piston.rod, b, a, piston.rodRest],
      ] as const) {
        const parent = node.parent;
        if (!parent) continue;
        inverse.copy(parent.matrixWorld).invert();
        target.copy(to).sub(from).transformDirection(inverse);
        node.quaternion.copy(q.setFromUnitVectors(rest, target));
      }
    }
  }

  /** Back to standing straight, ready to be posed. */
  reset() {
    for (const name of ["Spine", "Chest", "Neck", "Head"]) this.bones[name].quaternion.identity();
  }
}

export { down, up };
