import * as THREE from "three";

import { emptyIntent, type Intent } from "./intent";
import type { Robot } from "./robot";

/*
 * The enemy machine's thinking: a small set of moods and a clock. It closes in, circles, throws
 * short combinations, and covers up when it sees a punch coming. It always shows a beat before
 * it swings, because a fight you can read is a fight you can get better at.
 */

type Mood = "closing" | "circling" | "winding" | "covering" | "backing";

/** How close it needs to be to land one. */
const STRIKING_RANGE = 3.1;
/** Seconds its visor flares before a punch, which is the player's warning. */
const TELL = 0.42;

export class Brain {
  readonly intent: Intent = emptyIntent();
  /** 0 to 1: how lit up its visor is, because it's about to swing. */
  tell = 0;
  private mood: Mood = "closing";
  private clock = 0;
  private circling = 1;
  private combo = 0;
  private next: "punchLeft" | "punchRight" = "punchLeft";

  constructor(
    private readonly body: Robot,
    private readonly target: Robot,
  ) {}

  private become(mood: Mood, seconds: number) {
    this.mood = mood;
    this.clock = seconds;
  }

  think(dt: number) {
    const intent = this.intent;
    const { body, target } = this;
    intent.move = 0;
    intent.turn = 0;
    intent.block = false;
    intent.run = false;
    this.tell = Math.max(this.tell - dt * 2.4, 0);
    if (!body.alive || !target.alive) return;

    const gap = Math.hypot(target.position.x - body.position.x, target.position.z - body.position.z);
    this.clock -= dt;

    // Seeing a punch start is a reason to cover up, some of the time.
    if (target.isPunching && gap < 4 && this.mood !== "covering" && this.mood !== "winding" && Math.random() < dt * 5) {
      this.become("covering", 0.5 + Math.random() * 0.3);
    }

    switch (this.mood) {
      case "closing":
        intent.move = 1;
        intent.run = gap > 12;
        if (gap > 15) {
          const facing = Math.atan2(target.position.x - body.position.x, target.position.z - body.position.z);
          intent.turn = -THREE.MathUtils.clamp(Math.atan2(Math.sin(facing - body.yaw), Math.cos(facing - body.yaw)) * 3, -1, 1);
        }
        if (gap < STRIKING_RANGE) this.become("circling", 0.5 + Math.random() * 0.9);
        break;

      case "circling":
        intent.turn = this.circling;
        intent.move = gap > STRIKING_RANGE ? 0.6 : gap < 2.2 ? -0.5 : 0;
        if (this.clock <= 0) {
          if (Math.random() < 0.3) this.circling *= -1;
          this.combo = 1 + Math.floor(Math.random() * 3);
          this.become("winding", TELL);
        }
        break;

      case "winding":
        this.tell = 1;
        intent.move = gap > 2.5 ? 0.8 : 0;
        if (this.clock <= 0) {
          intent[this.next] = true;
          this.next = this.next === "punchLeft" ? "punchRight" : "punchLeft";
          this.combo -= 1;
          if (this.combo > 0) this.become("winding", 0.3);
          else this.become("backing", 0.55 + Math.random() * 0.5);
        }
        break;

      case "covering":
        intent.block = true;
        intent.move = -0.35;
        // Coming out of a guard is the moment to hit back, so hammering at it isn't a way to win.
        if (this.clock <= 0) {
          this.combo = 1 + Math.floor(Math.random() * 2);
          this.become("winding", TELL * 0.7);
        }
        break;

      case "backing":
        intent.move = -0.7;
        intent.turn = this.circling * 0.6;
        if (this.clock <= 0) this.become(gap > STRIKING_RANGE + 1.5 ? "closing" : "circling", 0.6 + Math.random() * 1.1);
        break;
    }
  }
}
