import { KITS, type KitSlug } from "@/content/store";

export type StoreView =
  | { name: "overview" }
  | { name: "wall" }
  | { name: "shirt"; slug: KitSlug }
  | { name: "mirror" };

export type ShirtAngle = "front" | "back" | "crest" | "collar";

/** Where each named angle puts the shirt: yaw, pitch, and a zoom of 0..1. */
const ANGLES: Record<ShirtAngle, { yaw: number; pitch: number; zoom: number; lift: number; shift: number }> = {
  front: { yaw: 0, pitch: 0, zoom: 0, lift: 0, shift: 0 },
  back: { yaw: Math.PI, pitch: 0, zoom: 0, lift: 0, shift: 0 },
  crest: { yaw: -0.26, pitch: 0.04, zoom: 1, lift: -0.15, shift: -0.1 },
  collar: { yaw: 0, pitch: 0.42, zoom: 0.85, lift: -0.28, shift: 0 },
};

/**
 * The line between the DOM and the 3D scene. The panels are React, the shirt turns
 * in a render loop, and a drag or a hover must not cost a React render. Both sides
 * hold this one object and read and write its fields directly.
 */
export class StoreBridge {
  /** Which shirt the rail view is centred on, as a position along the wall. */
  wallFocus = 1;

  /** The turned shirt's goals. The scene eases towards them. */
  yaw = 0;
  pitch = 0;
  zoom = 0;
  lift = 0;
  shift = 0;

  hovered: KitSlug | null = null;

  /** Labels pinned to the scene, moved by the scene on each frame. */
  readonly pins = new Map<string, HTMLElement>();

  /** Asks for a frame. Set by the scene, which draws on demand. */
  kick: () => void = () => {};

  stepWall(by: number): void {
    const next = Math.round(this.wallFocus) + by;
    this.wallFocus = Math.max(0, Math.min(KITS.length - 1, next));
    this.kick();
  }

  showAngle(angle: ShirtAngle): void {
    const goal = ANGLES[angle];
    // Take the short way round to the new yaw.
    const turns = Math.round((this.yaw - goal.yaw) / (2 * Math.PI));
    this.yaw = goal.yaw + turns * 2 * Math.PI;
    this.pitch = goal.pitch;
    this.zoom = goal.zoom;
    this.lift = goal.lift;
    this.shift = goal.shift;
    this.kick();
  }

  resetShirt(): void {
    this.yaw = 0;
    this.pitch = 0;
    this.zoom = 0;
    this.lift = 0;
    this.shift = 0;
  }
}
