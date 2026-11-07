import type { BodyReading, HandReading } from "@/lib/vision/puppet-sensor";

import { BONES, TIPS } from "./gestures";

/*
 * The tether: lines from the operator's real fingers to the machine's real joints. It's only a
 * picture, but it's the picture the whole game is built on, so the lines behave like something
 * physical: they sag when there's slack, draw straight when the robot pulls away, and shiver
 * when it lands a hit.
 */

export type Anchor = { x: number; y: number };

const STRING = "255, 180, 174";
const LIMBS: ReadonlyArray<readonly [number, number]> = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28],
];
/** The body's joints that carry a string: wrists, ankles and the head. */
const BODY_ENDS = [15, 16, 27, 28, 0];

export class Strings {
  private readonly context: CanvasRenderingContext2D;
  private width = 1;
  private height = 1;
  private time = 0;
  /** Set when something violent happens: it decays on its own. */
  shiver = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No 2D canvas");
    this.context = context;
    this.resize();
  }

  resize() {
    const ratio = Math.min(window.devicePixelRatio, 1.5);
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    this.canvas.width = this.width * ratio;
    this.canvas.height = this.height * ratio;
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  clear() {
    this.context.clearRect(0, 0, this.width, this.height);
  }

  /** From the raw picture to the screen: mirrored, and filling it, as a mirror would. */
  private place(x: number, y: number, aspect: number) {
    const screen = this.width / this.height;
    const scale = screen > aspect ? this.width : this.height * aspect;
    return {
      x: this.width / 2 + (0.5 - x) * scale,
      y: this.height / 2 + (y - 0.5) * (scale / aspect),
    };
  }

  private line(from: Anchor, to: Anchor, slack: number, index: number) {
    const context = this.context;
    const gap = Math.hypot(to.x - from.x, to.y - from.y);
    const sag = slack * gap * 0.16 + 12;
    const shake = this.shiver * Math.sin(this.time * 70 + index * 2.1) * 9;
    const midX = (from.x + to.x) / 2 + shake;
    const midY = (from.y + to.y) / 2 + sag + Math.sin(this.time * 2 + index) * 2.5;
    for (const [width, alpha] of [[5, 0.14], [1.4, 0.95]] as const) {
      context.strokeStyle = `rgba(${STRING}, ${alpha})`;
      context.lineWidth = width;
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.quadraticCurveTo(midX, midY, to.x, to.y);
      context.stroke();
    }
  }

  private node(at: Anchor, radius: number) {
    const context = this.context;
    context.fillStyle = "rgba(255, 255, 255, 0.95)";
    context.beginPath();
    context.arc(at.x, at.y, radius, 0, Math.PI * 2);
    context.fill();
  }

  /** Both hands' bones, and a string from each fingertip to a joint on the machine. */
  drawHands(hands: HandReading[], anchors: Anchor[], aspect: number, slack: number, dt: number) {
    this.time += dt;
    this.shiver = Math.max(this.shiver - dt * 2.6, 0);
    const context = this.context;
    let string = 0;
    for (const hand of hands) {
      const points = hand.points.map((point) => this.place(point.x, point.y, aspect));
      context.strokeStyle = "rgba(255, 255, 255, 0.32)";
      context.lineWidth = 1.2;
      context.beginPath();
      for (const [a, b] of BONES) {
        context.moveTo(points[a].x, points[a].y);
        context.lineTo(points[b].x, points[b].y);
      }
      context.stroke();
      for (const [index, tip] of TIPS.entries()) {
        const anchor = anchors[(index + string) % anchors.length];
        if (anchor) this.line(points[tip], anchor, slack, index + string);
        this.node(points[tip], 3.6);
      }
      string += 2;
    }
    for (const anchor of anchors) this.node(anchor, 2.4);
  }

  /** Brackets round every raider, and a mark for where the guns are pointing. */
  drawFlight(targets: { x: number; y: number; distance: number; locked: boolean }[], aim: Anchor) {
    const context = this.context;
    const middleX = aim.x;
    const middleY = aim.y;
    context.strokeStyle = "rgba(255, 255, 255, 0.7)";
    context.lineWidth = 1.4;
    context.beginPath();
    context.arc(middleX, middleY, 16, 0, Math.PI * 2);
    for (const [x, y] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      context.moveTo(middleX + x * 16, middleY + y * 16);
      context.lineTo(middleX + x * 26, middleY + y * 26);
    }
    context.stroke();

    context.font = "500 12px var(--font-mono), monospace";
    context.textAlign = "center";
    for (const target of targets) {
      const size = Math.max(11, 34 - target.distance / 60);
      context.strokeStyle = target.locked ? "rgba(255, 92, 92, 1)" : "rgba(255, 180, 174, 0.85)";
      context.lineWidth = target.locked ? 2 : 1.3;
      context.beginPath();
      for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const cornerX = target.x + x * size;
        const cornerY = target.y + y * size;
        context.moveTo(cornerX, cornerY - y * size * 0.4);
        context.lineTo(cornerX, cornerY);
        context.lineTo(cornerX - x * size * 0.4, cornerY);
      }
      context.stroke();
      context.fillStyle = "rgba(255, 200, 196, 0.9)";
      context.fillText(`${Math.round(target.distance)} m`, target.x, target.y + size + 15);
    }
  }

  /** The operator's whole outline, for playing stood back. */
  drawBody(body: BodyReading, anchors: Anchor[], aspect: number, slack: number, dt: number) {
    this.time += dt;
    this.shiver = Math.max(this.shiver - dt * 2.6, 0);
    const context = this.context;
    const points = body.points.map((point) => this.place(point.x, point.y, aspect));
    context.strokeStyle = "rgba(255, 255, 255, 0.34)";
    context.lineWidth = 1.6;
    context.beginPath();
    for (const [a, b] of LIMBS) {
      context.moveTo(points[a].x, points[a].y);
      context.lineTo(points[b].x, points[b].y);
    }
    context.stroke();
    for (const [index, joint] of BODY_ENDS.entries()) {
      const anchor = anchors[index % anchors.length];
      if (anchor) this.line(points[joint], anchor, slack, index);
      this.node(points[joint], 4);
    }
    for (const anchor of anchors) this.node(anchor, 2.4);
  }
}
