/*
 * What the operator wants, whatever they're using to say it. The keyboard, the touch screen,
 * a hand on the webcam and a whole body across the room all fill in this one object, and
 * nothing past it knows or cares which one it was.
 */

export type Intent = {
  /** Forward or back, -1 to 1. */
  move: number;
  /** Turn, or side-step when squared up to an enemy, -1 to 1. Positive is to the right. */
  turn: number;
  /** Past walking pace. */
  run: boolean;
  crouch: boolean;
  /** Stays down until it's asked to get up. */
  prone: boolean;
  block: boolean;
  /** These fire once: whatever reads them clears them. */
  jump: boolean;
  punchLeft: boolean;
  punchRight: boolean;
  use: boolean;

  // In the air. Pitch and roll are -1 to 1, throttle 0 to 1.
  pitch: number;
  roll: number;
  throttle: number;
  fire: boolean;
  missile: boolean;
};

export const emptyIntent = (): Intent => ({
  move: 0,
  turn: 0,
  run: false,
  crouch: false,
  prone: false,
  block: false,
  jump: false,
  punchLeft: false,
  punchRight: false,
  use: false,
  pitch: 0,
  roll: 0,
  throttle: 0.5,
  fire: false,
  missile: false,
});

/** The keyboard, which is also what anyone without a camera plays with. */
export class Keyboard {
  private readonly held = new Set<string>();

  constructor(private readonly intent: Intent) {
    window.addEventListener("keydown", this.down);
    window.addEventListener("keyup", this.up);
    window.addEventListener("blur", this.clear);
  }

  private readonly down = (event: KeyboardEvent) => {
    if (event.repeat) return;
    const code = event.code;
    this.held.add(code);
    const intent = this.intent;
    if (code === "Space") {
      event.preventDefault();
      intent.jump = true;
    }
    if (code === "KeyJ") intent.punchLeft = true;
    if (code === "KeyK") intent.punchRight = true;
    if (code === "KeyE") intent.use = true;
    if (code === "KeyZ") intent.prone = !intent.prone;
    if (code === "KeyF") intent.missile = true;
  };

  private readonly up = (event: KeyboardEvent) => {
    this.held.delete(event.code);
  };

  private readonly clear = () => this.held.clear();

  /** Called once a frame. Anything else driving the same intent runs after it, and wins. */
  read() {
    const held = this.held;
    const intent = this.intent;
    const axis = (plus: string, minus: string, plus2: string, minus2: string) =>
      (held.has(plus) || held.has(plus2) ? 1 : 0) - (held.has(minus) || held.has(minus2) ? 1 : 0);
    intent.move = axis("KeyW", "KeyS", "ArrowUp", "ArrowDown");
    intent.turn = axis("KeyD", "KeyA", "ArrowRight", "ArrowLeft");
    intent.run = held.has("ShiftLeft") || held.has("ShiftRight");
    intent.crouch = held.has("KeyC") || held.has("ControlLeft");
    intent.block = held.has("KeyL");
    intent.pitch = axis("KeyS", "KeyW", "ArrowDown", "ArrowUp");
    intent.roll = axis("KeyD", "KeyA", "ArrowRight", "ArrowLeft");
    if (held.has("KeyR")) intent.throttle = Math.min(intent.throttle + 0.012, 1);
    if (held.has("KeyV")) intent.throttle = Math.max(intent.throttle - 0.012, 0);
    intent.fire = held.has("KeyJ") || held.has("Enter");
  }

  dispose() {
    window.removeEventListener("keydown", this.down);
    window.removeEventListener("keyup", this.up);
    window.removeEventListener("blur", this.clear);
  }
}
