import type { PizzaPiece, ToppingId } from "@/content/pizza";
import { PIZZA_MAP, PIZZA_SHEET } from "@/content/pizza";

/** Where the camera is: the restaurant's views, the bench, or inside the oven. */
export type PizzaView = "room" | "table" | "book" | "meet" | "build" | "chef" | "oven" | "served";

/** Where a thrown piece is headed, and when it lands. */
export type FallingPiece = PizzaPiece & { startedAt: number; lands: number };

const FALL_SECONDS = 0.34;

/**
 * The line between the page and the 3D scene. The panels are React and the pizza changes
 * in a render loop, so both sides hold this one object: a topping dropped from the page
 * must not cost a React render.
 */
export class PizzaBridge {
  /** How far each step has gone, 0..1. The scene eases towards these. */
  sauce = 0;
  cheese = 0;
  heat = 0;

  /** Everything lying on the pizza, in the order it landed. */
  pieces: PizzaPiece[] = [];
  falling: FallingPiece[] = [];
  /** The layer is redrawn from `pieces`, because a piece was taken away. */
  stale = false;

  /** Set while the oven is working: seconds it takes, and who to tell how far along it is. */
  baking: { seconds: number; report: (share: number) => void } | null = null;

  /** Asks for a frame. Set by the scene. */
  kick: () => void = () => {};
  /** Turns a point on the screen into metres on the pizza, or null if it misses. Set by the scene. */
  pointOnPizza: (clientX: number, clientY: number) => { x: number; y: number } | null = () => null;

  /** Throws one piece at a spot. It lands a moment later. */
  drop(topping: ToppingId, x: number, y: number, delay = 0): void {
    const startedAt = performance.now() / 1000 + delay;
    this.falling.push({
      topping,
      variant: Math.floor(Math.random() * PIZZA_SHEET.variants),
      x,
      y,
      turn: Math.random() * Math.PI * 2,
      startedAt,
      lands: startedAt + FALL_SECONDS,
    });
    this.kick();
  }

  /** A cook's handful: spread out over the pizza, away from what's already there. */
  portion(topping: ToppingId, count: number): void {
    const reach = PIZZA_SHEET.reach[topping];
    const taken = [...this.pieces, ...this.falling].map((piece) => ({
      x: piece.x,
      y: piece.y,
      gap: PIZZA_SHEET.reach[piece.topping] * 0.62,
    }));
    const limit = PIZZA_MAP.landingRadius - reach * 0.55;
    for (let number = 0; number < count; number++) {
      let best = { x: 0, y: 0 };
      let bestRoom = -Infinity;
      // Best of a few random spots: even enough to look laid out, not enough to look placed.
      for (let attempt = 0; attempt < 14; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = limit * Math.sqrt(Math.random());
        const x = Math.cos(angle) * distance;
        const y = Math.sin(angle) * distance;
        let room = Infinity;
        for (const other of taken) {
          room = Math.min(room, Math.hypot(x - other.x, y - other.y) - other.gap - reach * 0.62);
        }
        if (room > bestRoom) {
          bestRoom = room;
          best = { x, y };
        }
      }
      taken.push({ ...best, gap: reach * 0.62 });
      this.drop(topping, best.x, best.y, number * 0.055);
    }
  }

  remove(topping: ToppingId): void {
    this.pieces = this.pieces.filter((piece) => piece.topping !== topping);
    this.falling = this.falling.filter((piece) => piece.topping !== topping);
    this.stale = true;
    this.kick();
  }

  ladle(): void {
    this.sauce = 1;
    this.kick();
  }

  sprinkle(): void {
    this.cheese = 1;
    this.kick();
  }

  bake(seconds: number, report: (share: number) => void): void {
    this.heat = 0;
    this.baking = { seconds, report };
    this.kick();
  }

  reset(): void {
    this.pieces = [];
    this.falling = [];
    this.sauce = 0;
    this.cheese = 0;
    this.heat = 0;
    this.baking = null;
    this.stale = true;
    this.kick();
  }
}
