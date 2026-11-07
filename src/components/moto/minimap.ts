import city from "@/content/moto-city.json";

import type { Landmark } from "./places";
import { type Edge, HERO, PLAZA_EDGE, type Place, type World } from "./world";

/*
 * The map in the corner of the screen. It turns with the rider, so ahead is always up. The land, the
 * sea and the parks are one small picture; the streets are drawn over it from the network, so they
 * stay sharp at any zoom, with the way to the chosen place picked out along them. Places too far off
 * to show sit round the rim, each on its true bearing.
 */

const SHOWN = 420;
/** Metres of the map from the middle of the dial to its rim, at a stop and flat out. */
const FAST_SHOWN = 800;

export class Minimap {
  private readonly context: CanvasRenderingContext2D;
  private readonly size: number;
  private shown = SHOWN;
  private readonly near: Edge[] = [];
  private lastX = Infinity;
  private lastZ = Infinity;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly land: HTMLImageElement,
    private readonly world: World,
  ) {
    const scale = Math.min(window.devicePixelRatio, 2);
    this.size = canvas.clientWidth * scale;
    canvas.width = canvas.height = this.size;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No 2D canvas");
    this.context = context;
  }

  draw(x: number, z: number, heading: number, speed: number, route: Place[], places: readonly Landmark[], seen: ReadonlySet<number>, target: number) {
    const { context, size } = this;
    const [west, south, east, north] = city.bounds;
    this.shown += (SHOWN + (FAST_SHOWN - SHOWN) * Math.min(speed / 70, 1) - this.shown) * 0.04;
    const half = size / 2;
    const scale = half / this.shown;

    context.clearRect(0, 0, size, size);
    context.save();
    context.beginPath();
    context.arc(half, half, half - 1, 0, Math.PI * 2);
    context.clip();
    context.fillStyle = "#0e1a26";
    context.fillRect(0, 0, size, size);

    context.translate(half, half);
    // Forward is (sin h, cos h) in x and z, and z runs down the map, so this puts it at the top.
    context.rotate(heading + Math.PI);
    context.scale(scale, scale);
    context.translate(-x, -z);

    context.imageSmoothingEnabled = true;
    context.drawImage(this.land, west, -north, east - west, north - south);

    if (Math.hypot(x - this.lastX, z - this.lastZ) > 40) {
      this.lastX = x;
      this.lastZ = z;
      this.near.length = 0;
      this.world.edgesNear(x, z, FAST_SHOWN * 1.25, (edge) => {
        if (edge.kind !== PLAZA_EDGE) this.near.push(edge);
      });
    }
    context.lineCap = "round";
    context.lineJoin = "round";
    this.stroke((edge) => edge.kind >= 6 && edge.kind < HERO, "#4e4f55", 5);
    this.stroke((edge) => edge.kind >= 3 && edge.kind < 6, "#74757c", 8);
    this.stroke((edge) => edge.kind < 3 || edge.kind >= HERO, "#a2a3aa", 12);

    if (route.length > 1) {
      context.beginPath();
      context.moveTo(x, z);
      for (const point of route) context.lineTo(point.x, point.z);
      context.strokeStyle = "#ff5a4f";
      context.lineWidth = 15;
      context.stroke();
    }
    context.restore();

    // The places, drawn upright whatever way the map is turned.
    const angle = heading + Math.PI;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    context.textAlign = "center";
    places.forEach((place, index) => {
      const dx = (place.x - x) * scale;
      const dz = (place.z - z) * scale;
      let px = dx * cos - dz * sin;
      let pz = dx * sin + dz * cos;
      const gap = Math.hypot(px, pz);
      const rim = half - size * 0.06;
      const away = gap > rim;
      if (away) {
        px *= rim / gap;
        pz *= rim / gap;
      }
      const chosen = index === target;
      context.beginPath();
      context.arc(half + px, half + pz, size * (chosen ? 0.04 : 0.024), 0, Math.PI * 2);
      context.fillStyle = seen.has(index) ? "#6f7077" : chosen ? "#ff5a4f" : "#ffffff";
      context.fill();
      context.lineWidth = size * 0.008;
      context.strokeStyle = "#0b0b0d";
      context.stroke();
    });

    // North, on the rim, and the rider in the middle.
    const northX = half - Math.sin(angle) * -(half - size * 0.07);
    const northZ = half + Math.cos(angle) * -(half - size * 0.07);
    context.font = `700 ${Math.round(size * 0.07)}px system-ui, sans-serif`;
    context.textBaseline = "middle";
    context.fillStyle = "#ffffff";
    context.fillText("N", northX, northZ);

    context.translate(half, half);
    context.beginPath();
    context.moveTo(0, -size * 0.055);
    context.lineTo(size * 0.038, size * 0.04);
    context.lineTo(0, size * 0.02);
    context.lineTo(-size * 0.038, size * 0.04);
    context.closePath();
    context.fillStyle = "#ffffff";
    context.fill();
    context.lineWidth = size * 0.008;
    context.strokeStyle = "#0b0b0d";
    context.stroke();
    context.setTransform(1, 0, 0, 1, 0, 0);
  }

  private stroke(which: (edge: Edge) => boolean, colour: string, width: number) {
    const { context } = this;
    context.beginPath();
    for (const edge of this.near) {
      if (!which(edge)) continue;
      const { points } = edge;
      context.moveTo(points[0], points[1]);
      for (let k = 2; k < points.length; k += 2) context.lineTo(points[k], points[k + 1]);
    }
    context.strokeStyle = colour;
    context.lineWidth = width;
    context.stroke();
  }
}
