import city from "@/content/moto-city.json";

/*
 * The line through Algiers: real streets, one point every five metres, from the esplanade of Maqam
 * Echahid through the old centre and along the bay to the Great Mosque. Everything on the road is
 * placed by how far along it is and how far to the right of it.
 *
 * The road's centre line is the median along the bay, and the crown of the road in the city, where
 * there's no median and traffic comes both ways down one street.
 */

/** What kind of place each stretch of the ride is. */
export const PLAZA = 0;
export const HILL = 1;
export const CITY = 2;
export const SEA = 3;
export const BAY = 4;
export const MOSQUE = 5;

/** The foot of Maqam Echahid, and how far from it the rider can go before the wall round the esplanade. */
export const MAQAM_X = -1808;
export const MAQAM_Z = 2147;
export const STAGE_EDGE = 219;

/** Something solid to ride round. */
export type Obstacle = { x: number; z: number; radius: number };

/** The monument's three feet, the tower and flame at its heart, and the floods between them. */
function monument() {
  const list: Obstacle[] = [{ x: MAQAM_X, z: MAQAM_Z, radius: 9.6 }];
  for (let frond = 0; frond < 3; frond++) {
    const bearing = ((90 + frond * 120) * Math.PI) / 180;
    list.push({ x: MAQAM_X + Math.cos(bearing) * 33, z: MAQAM_Z - Math.sin(bearing) * 33, radius: 6.4 });
    for (const spread of [-1, 1]) {
      const flood = bearing + Math.PI / 3 + spread * 0.34;
      list.push({ x: MAQAM_X + Math.cos(flood) * 30, z: MAQAM_Z - Math.sin(flood) * 30, radius: 1.5 });
    }
  }
  return list;
}

export type Spot = { x: number; y: number; z: number; forwardX: number; forwardZ: number; rightX: number; rightZ: number; slope: number };

export class Ride {
  readonly step = city.step;
  readonly count: number;
  readonly length: number;
  private readonly points: Float32Array;
  private readonly forward: Float32Array;
  private readonly width: Float32Array;
  private readonly median: Float32Array;
  private readonly zone: Uint8Array;
  /** The side streets: how far along, which side, and how wide. */
  readonly gaps = city.gaps as [number, number, number][];
  /** What stands at the heart of the esplanade. */
  readonly monument = monument();
  /** Where the road leaves the esplanade. */
  readonly exit: number;

  constructor() {
    this.points = Float32Array.from(city.ride);
    this.width = Float32Array.from(city.width);
    this.median = Float32Array.from(city.median);
    this.zone = Uint8Array.from(city.zone);
    this.count = this.points.length / 3;
    this.length = (this.count - 1) * this.step;
    this.exit = city.zone.findIndex((zone) => zone !== PLAZA) * this.step;
    this.forward = new Float32Array(this.count * 2);
    for (let index = 0; index < this.count; index++) {
      const a = Math.max(index - 2, 0) * 3;
      const b = Math.min(index + 2, this.count - 1) * 3;
      const dx = this.points[b] - this.points[a];
      const dz = this.points[b + 2] - this.points[a + 2];
      const size = Math.hypot(dx, dz) || 1;
      this.forward[index * 2] = dx / size;
      this.forward[index * 2 + 1] = dz / size;
    }
  }

  /** How wide the road is here, as a share of its width along the bay. */
  widthAt(along: number) {
    return this.width[Math.min(Math.max(Math.round(along / this.step), 0), this.count - 1)];
  }

  /** One where the bay road's median stands, none where the street has no middle. */
  medianAt(along: number) {
    return this.median[Math.min(Math.max(Math.round(along / this.step), 0), this.count - 1)];
  }

  /** Whether the low wall runs along this side of the road here. */
  hasWall(along: number, side: number) {
    const zone = this.zoneAt(along);
    return (zone === SEA && side < 0) || zone === BAY || zone === MOSQUE || zone === HILL;
  }

  zoneAt(along: number) {
    return this.zone[Math.min(Math.max(Math.round(along / this.step), 0), this.count - 1)];
  }

  /** Where a distance along the road is, and which way the road runs there. */
  spot(along: number, out: Spot) {
    const place = Math.min(Math.max(along / this.step, 0), this.count - 1.001);
    const index = Math.floor(place);
    const t = place - index;
    const a = index * 3;
    const b = a + 3;
    out.x = this.points[a] + (this.points[b] - this.points[a]) * t;
    out.y = this.points[a + 1] + (this.points[b + 1] - this.points[a + 1]) * t;
    out.z = this.points[a + 2] + (this.points[b + 2] - this.points[a + 2]) * t;
    const fx = this.forward[index * 2] + (this.forward[index * 2 + 2] - this.forward[index * 2]) * t;
    const fz = this.forward[index * 2 + 1] + (this.forward[index * 2 + 3] - this.forward[index * 2 + 1]) * t;
    const size = Math.hypot(fx, fz) || 1;
    out.forwardX = fx / size;
    out.forwardZ = fz / size;
    // Forward crossed with up: with y up, right is (-z, x) of forward.
    out.rightX = -out.forwardZ;
    out.rightZ = out.forwardX;
    out.slope = (this.points[b + 1] - this.points[a + 1]) / this.step;
    return out;
  }

  /** How far along and how far to the right a point is, searching near a good guess. */
  locate(x: number, z: number, guess: number, search = 14) {
    const centre = Math.round(guess / this.step);
    let best = centre;
    let nearest = Infinity;
    for (let index = Math.max(centre - search, 0); index <= Math.min(centre + search, this.count - 1); index++) {
      const dx = x - this.points[index * 3];
      const dz = z - this.points[index * 3 + 2];
      const gap = dx * dx + dz * dz;
      if (gap < nearest) {
        nearest = gap;
        best = index;
      }
    }
    const dx = x - this.points[best * 3];
    const dz = z - this.points[best * 3 + 2];
    const fx = this.forward[best * 2];
    const fz = this.forward[best * 2 + 1];
    return { along: best * this.step + dx * fx + dz * fz, across: dx * -fz + dz * fx };
  }
}
