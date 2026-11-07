export type MuseumView = "door" | "hall" | "frame";

/**
 * The line between the DOM and the 3D scene: the panels are React, the view moves in a
 * render loop, and a mouse move must not cost a React render. Both sides hold this one
 * object and read and write its fields directly.
 */
export class MuseumBridge {
  /** Where the visitor's head is, as the scene should treat it. -1..1, and how far
   *  they are leaning in. Fed by the webcam, or by the mouse without one. */
  readonly head = { x: 0, y: 0, lean: 0 };

  /** Whether the frame in view has been opened out. The scene eases towards it. */
  spread = 0;

  /** Asks for a frame. Set by the scene, which draws on demand. */
  kick: () => void = () => {};

  look(x: number, y: number, lean = this.head.lean): void {
    this.head.x = x;
    this.head.y = y;
    this.head.lean = lean;
    this.kick();
  }

  setOpen(open: boolean): void {
    this.spread = open ? 1 : 0;
    this.kick();
  }
}
