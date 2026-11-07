import city from "@/content/moto-city.json";

import { MAQAM_X, MAQAM_Z, type Ride, type Spot, STAGE_EDGE } from "./ride";

/*
 * The whole city as something you can ride: every street on the map as one network, with its
 * junctions, for traffic and for finding the way; and every building as a ring of walls, for riding
 * into. Both are looked up through a grid, so nothing here costs more with the size of the map.
 *
 * Positions are in game axes: x east, z south.
 */

const CELL = 16;
const ROAD_CELL = 48;
/** Side of a square of the map in the table of road segments. */
const LANE_CELL = 24;
/** Kinds of road, as scripts/moto_network.py numbers them. */
export const HERO = 20;
export const PLAZA_EDGE = 21;

export type Edge = {
  index: number;
  a: number;
  b: number;
  kind: number;
  half: number;
  /** Along the road: x and z of each point, and how far along each one is. */
  points: Float32Array;
  run: Float32Array;
  length: number;
  /** Half the road at each point, where it varies along the way: only on the main road. */
  halves: Float32Array | null;
};

export type Building = { start: number; corners: number; floors: number; central: boolean; seed: number; base: number };

export type Place = { x: number; z: number };

export type Push = { x: number; z: number; hit: boolean };

export class World {
  readonly edges: Edge[] = [];
  /** At each junction, the edges that meet there. */
  readonly nodes: number[][] = [];
  readonly nodeX: Float32Array;
  readonly nodeZ: Float32Array;
  readonly buildings: Building[] = [];
  readonly cornerX: Float32Array;
  readonly cornerZ: Float32Array;
  readonly faces: Uint8Array;

  // Wall segments, and for each grid cell the segments that pass through it.
  private readonly wallA: Float32Array;
  private readonly wallB: Float32Array;
  private readonly wallC: Float32Array;
  private readonly wallD: Float32Array;
  private readonly cellStart: Uint32Array;
  private readonly cellList: Uint32Array;
  private readonly columns: number;
  private readonly rows: number;
  private readonly west: number;
  private readonly top: number;
  private readonly roadGrid = new Map<number, number[]>();
  /** Stretches of road by square of the map: edge and point index, in pairs. */
  private readonly lanes = new Map<number, number[]>();
  /** Posts and trunks: x, z and radius, by square of the map. */
  private readonly posts = new Map<number, number[]>();

  constructor(network: ArrayBuffer, solid: ArrayBuffer, ride: Ride) {
    const [west, south, east, north] = city.bounds;
    this.west = west;
    this.top = -north;

    // ── the network ──
    const floats = new Float32Array(network);
    let at = 1;
    let nodeCount = 0;
    for (let index = 0; index < floats[0]; index++) {
      const a = floats[at];
      const b = floats[at + 1];
      const kind = floats[at + 2];
      const half = floats[at + 3];
      const count = floats[at + 4];
      at += 5;
      const points = new Float32Array(count * 2);
      const run = new Float32Array(count);
      for (let k = 0; k < count; k++) {
        // Written on the map with y north. The game runs z south.
        points[k * 2] = floats[at + k * 2];
        points[k * 2 + 1] = -floats[at + k * 2 + 1];
        if (k > 0) run[k] = run[k - 1] + Math.hypot(points[k * 2] - points[k * 2 - 2], points[k * 2 + 1] - points[k * 2 - 1]);
      }
      at += count * 2;
      const edge: Edge = { index, a, b, kind, half, points, run, length: run[count - 1], halves: null };
      this.edges.push(edge);
      nodeCount = Math.max(nodeCount, a + 1, b + 1);
      // Filed along each stretch, not only at its corners: a long straight has very few points.
      for (let k = 0; k + 1 < count; k++) {
        const ax = points[k * 2];
        const az = points[k * 2 + 1];
        const dx = points[k * 2 + 2] - ax;
        const dz = points[k * 2 + 3] - az;
        const steps = Math.max(Math.ceil(Math.hypot(dx, dz) / (ROAD_CELL / 2)), 1);
        for (let step = 0; step <= steps; step++) {
          const key = this.roadKey(ax + (dx * step) / steps, az + (dz * step) / steps);
          const list = this.roadGrid.get(key);
          if (!list) this.roadGrid.set(key, [index]);
          else if (list[list.length - 1] !== index) list.push(index);
        }
      }
    }
    this.fileLanes(ride);
    this.nodeX = new Float32Array(nodeCount);
    this.nodeZ = new Float32Array(nodeCount);
    for (let index = 0; index < nodeCount; index++) this.nodes.push([]);
    for (const edge of this.edges) {
      this.nodes[edge.a].push(edge.index);
      this.nodes[edge.b].push(edge.index);
      this.nodeX[edge.a] = edge.points[0];
      this.nodeZ[edge.a] = edge.points[1];
      this.nodeX[edge.b] = edge.points[edge.points.length - 2];
      this.nodeZ[edge.b] = edge.points[edge.points.length - 1];
    }

    // ── the buildings ──
    const head = new Int32Array(solid, 0, 2);
    const [count, corners] = head;
    const meta = new Int16Array(solid, 8, count * 4);
    const xy = new Int16Array(solid, 8 + count * 8, corners * 2);
    this.faces = new Uint8Array(solid, 8 + count * 8 + corners * 4, corners);
    this.cornerX = new Float32Array(corners);
    this.cornerZ = new Float32Array(corners);
    for (let index = 0; index < corners; index++) {
      this.cornerX[index] = xy[index * 2] / 4;
      this.cornerZ[index] = xy[index * 2 + 1] / 4;
    }
    let start = 0;
    for (let index = 0; index < count; index++) {
      const n = meta[index * 4];
      const packed = meta[index * 4 + 1];
      this.buildings.push({ start, corners: n, floors: packed & 63, central: (packed & 64) !== 0, seed: meta[index * 4 + 2] / 32767, base: meta[index * 4 + 3] / 10 });
      start += n;
    }

    for (const item of ride.monument) this.addPost(item.x, item.z, item.radius);

    // ── the walls, in a grid ──
    const extra = this.extraWalls(ride);
    const segments = corners + extra.length / 4;
    this.wallA = new Float32Array(segments);
    this.wallB = new Float32Array(segments);
    this.wallC = new Float32Array(segments);
    this.wallD = new Float32Array(segments);
    let total = 0;
    for (const building of this.buildings) {
      for (let k = 0; k < building.corners; k++) {
        const p = building.start + k;
        const q = building.start + ((k + 1) % building.corners);
        this.wallA[total] = this.cornerX[p];
        this.wallB[total] = this.cornerZ[p];
        this.wallC[total] = this.cornerX[q];
        this.wallD[total] = this.cornerZ[q];
        total += 1;
      }
    }
    for (let k = 0; k < extra.length; k += 4) {
      this.wallA[total] = extra[k];
      this.wallB[total] = extra[k + 1];
      this.wallC[total] = extra[k + 2];
      this.wallD[total] = extra[k + 3];
      total += 1;
    }
    this.columns = Math.ceil((east - west) / CELL) + 1;
    this.rows = Math.ceil((north - south) / CELL) + 1;
    const counts = new Uint32Array(this.columns * this.rows + 1);
    const eachCell = (segment: number, visit: (cell: number) => void) => {
      const c0 = this.col(Math.min(this.wallA[segment], this.wallC[segment]));
      const c1 = this.col(Math.max(this.wallA[segment], this.wallC[segment]));
      const r0 = this.row(Math.min(this.wallB[segment], this.wallD[segment]));
      const r1 = this.row(Math.max(this.wallB[segment], this.wallD[segment]));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) visit(r * this.columns + c);
    };
    for (let segment = 0; segment < total; segment++) eachCell(segment, (cell) => (counts[cell + 1] += 1));
    for (let index = 1; index < counts.length; index++) counts[index] += counts[index - 1];
    this.cellStart = counts;
    this.cellList = new Uint32Array(counts[counts.length - 1]);
    const filled = new Uint32Array(this.columns * this.rows);
    for (let segment = 0; segment < total; segment++) {
      eachCell(segment, (cell) => {
        this.cellList[this.cellStart[cell] + filled[cell]] = segment;
        filled[cell] += 1;
      });
    }
  }

  /** The low walls along the ride, its median, and the wall round the esplanade, all open at their junctions. */
  private extraWalls(ride: Ride) {
    const out: number[] = [];
    const spot: Spot = { x: 0, y: 0, z: 0, forwardX: 0, forwardZ: 1, rightX: 1, rightZ: 0, slope: 0 };
    const next: Spot = { ...spot };
    const open = (along: number, side: number) => ride.gaps.some(([at, gapSide, wide]) => (side === 0 || gapSide === side) && Math.abs(at - along) < wide / 2 + 9);
    for (let along = ride.exit; along < ride.length - ride.step; along += ride.step) {
      ride.spot(along, spot);
      ride.spot(along + ride.step, next);
      const width = ride.widthAt(along);
      const add = (across: number) => out.push(spot.x + spot.rightX * across, spot.z + spot.rightZ * across, next.x + next.rightX * across, next.z + next.rightZ * across);
      if (ride.hasWall(along, -1) && !open(along, -1)) add(-20.9 * width);
      if (ride.hasWall(along, 1) && !open(along, 1)) add(20.9 * width);
      if (ride.medianAt(along) > 0.9 && !open(along, 0)) {
        add(-1.05 * width);
        add(1.05 * width);
      }
    }
    // Round the esplanade, leaving the road's way out.
    ride.spot(ride.exit, spot);
    const gapAt = Math.atan2(spot.z - MAQAM_Z, spot.x - MAQAM_X);
    const gapHalf = 15.5 / STAGE_EDGE;
    const steps = 240;
    const radius = STAGE_EDGE + 1.4;
    for (let step = 0; step < steps; step++) {
      const a = gapAt + gapHalf + (step / steps) * (Math.PI * 2 - gapHalf * 2);
      const b = gapAt + gapHalf + ((step + 1) / steps) * (Math.PI * 2 - gapHalf * 2);
      out.push(MAQAM_X + Math.cos(a) * radius, MAQAM_Z + Math.sin(a) * radius, MAQAM_X + Math.cos(b) * radius, MAQAM_Z + Math.sin(b) * radius);
    }
    return out;
  }

  private col(x: number) {
    return Math.min(Math.max(Math.floor((x - this.west) / CELL), 0), this.columns - 1);
  }

  private row(z: number) {
    return Math.min(Math.max(Math.floor((z - this.top) / CELL), 0), this.rows - 1);
  }

  private roadKey(x: number, z: number) {
    return Math.floor(x / ROAD_CELL + 4096) * 8192 + Math.floor(z / ROAD_CELL + 4096);
  }

  private laneKey(x: number, z: number) {
    return (Math.floor(x / LANE_CELL) + 2048) * 4096 + Math.floor(z / LANE_CELL) + 2048;
  }

  /** Files every stretch of road under each square it touches, so finding the road is one lookup. */
  private fileLanes(ride: Ride) {
    for (const edge of this.edges) {
      const { points } = edge;
      const count = points.length / 2;
      if (edge.kind === HERO) {
        // The main road changes width along its length, so an average won't do for a kerb.
        const halves = new Float32Array(count);
        for (let k = 0; k < count; k++) {
          const place = ride.locate(points[k * 2], points[k * 2 + 1], ride.length / 2, ride.count);
          halves[k] = 13.25 * ride.widthAt(place.along);
        }
        edge.halves = halves;
      }
      for (let k = 0; k + 1 < count; k++) {
        const ax = points[k * 2];
        const az = points[k * 2 + 1];
        const dx = points[k * 2 + 2] - ax;
        const dz = points[k * 2 + 3] - az;
        const reach = (edge.halves ? Math.max(edge.halves[k], edge.halves[k + 1]) : edge.half) + 2;
        const steps = Math.max(Math.ceil(Math.hypot(dx, dz) / (LANE_CELL / 2)), 1);
        for (let step = 0; step <= steps; step++) {
          const px = ax + (dx * step) / steps;
          const pz = az + (dz * step) / steps;
          for (let cx = Math.floor((px - reach) / LANE_CELL); cx <= Math.floor((px + reach) / LANE_CELL); cx++) {
            for (let cz = Math.floor((pz - reach) / LANE_CELL); cz <= Math.floor((pz + reach) / LANE_CELL); cz++) {
              const key = (cx + 2048) * 4096 + cz + 2048;
              const list = this.lanes.get(key);
              if (!list) this.lanes.set(key, [edge.index, k]);
              else if (list[list.length - 2] !== edge.index || list[list.length - 1] !== k) list.push(edge.index, k);
            }
          }
        }
      }
    }
  }

  /**
   * Keeps a point on the carriageway, a margin in from the kerb. A point on any street is fine, so
   * junctions are open. A point past the kerb is brought back to it. False means there's no road
   * anywhere near, which only happens if something has moved the bike a long way in one go.
   */
  keepOnRoad(x: number, z: number, margin: number, out: Push) {
    out.x = x;
    out.z = z;
    out.hit = false;
    const list = this.lanes.get(this.laneKey(x, z));
    if (!list) return false;
    let best = -Infinity;
    let nearX = 0;
    let nearZ = 0;
    let room = 0;
    let gap = 0;
    for (let k = 0; k < list.length; k += 2) {
      const edge = this.edges[list[k]];
      const at = list[k + 1];
      const { points, halves } = edge;
      const ax = points[at * 2];
      const az = points[at * 2 + 1];
      const dx = points[at * 2 + 2] - ax;
      const dz = points[at * 2 + 3] - az;
      const t = Math.min(Math.max(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0), 1);
      const cx = ax + dx * t;
      const cz = az + dz * t;
      const distance = Math.hypot(x - cx, z - cz);
      const half = (halves ? halves[at] + (halves[at + 1] - halves[at]) * t : edge.half) - margin;
      if (half - distance > best) {
        best = half - distance;
        nearX = cx;
        nearZ = cz;
        room = half;
        gap = distance;
      }
    }
    if (best >= 0) return true;
    out.x = nearX + ((x - nearX) / (gap || 1)) * room;
    out.z = nearZ + ((z - nearZ) / (gap || 1)) * room;
    out.hit = true;
    return true;
  }

  private postKey(x: number, z: number) {
    return Math.floor(x / CELL + 2048) * 4096 + Math.floor(z / CELL + 2048);
  }

  /** Something small and solid: a lamp post, a palm, a foot of the monument. */
  addPost(x: number, z: number, radius: number) {
    const key = this.postKey(x, z);
    const list = this.posts.get(key);
    if (list) list.push(x, z, radius);
    else this.posts.set(key, [x, z, radius]);
  }

  /** The way out of any post within reach of a point, carried on from where `out` stands. */
  clearPosts(radius: number, out: Push) {
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const list = this.posts.get(this.postKey(out.x + a * CELL, out.z + b * CELL));
        if (!list) continue;
        for (let k = 0; k < list.length; k += 3) {
          const nx = out.x - list[k];
          const nz = out.z - list[k + 1];
          const reach = list[k + 2] + radius;
          const gap = Math.hypot(nx, nz);
          if (gap >= reach || gap < 1e-5) continue;
          out.x = list[k] + (nx / gap) * reach;
          out.z = list[k + 1] + (nz / gap) * reach;
          out.hit = true;
        }
      }
    }
  }

  /** The way out of any wall within reach of a point, written into `out`. */
  clear(x: number, z: number, radius: number, out: Push) {
    out.x = x;
    out.z = z;
    out.hit = false;
    const c0 = this.col(x - radius);
    const c1 = this.col(x + radius);
    const r0 = this.row(z - radius);
    const r1 = this.row(z + radius);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cell = r * this.columns + c;
        for (let k = this.cellStart[cell]; k < this.cellStart[cell + 1]; k++) {
          const s = this.cellList[k];
          const ax = this.wallA[s];
          const az = this.wallB[s];
          const dx = this.wallC[s] - ax;
          const dz = this.wallD[s] - az;
          const size = dx * dx + dz * dz || 1;
          const t = Math.min(Math.max(((out.x - ax) * dx + (out.z - az) * dz) / size, 0), 1);
          const nx = out.x - (ax + dx * t);
          const nz = out.z - (az + dz * t);
          const gap = Math.hypot(nx, nz);
          if (gap >= radius || gap < 1e-5) continue;
          out.x += (nx / gap) * (radius - gap);
          out.z += (nz / gap) * (radius - gap);
          out.hit = true;
        }
      }
    }
  }

  /** Whether the straight line between two points crosses a wall. */
  crosses(x0: number, z0: number, x1: number, z1: number) {
    const c0 = this.col(Math.min(x0, x1));
    const c1 = this.col(Math.max(x0, x1));
    const r0 = this.row(Math.min(z0, z1));
    const r1 = this.row(Math.max(z0, z1));
    const ex = x1 - x0;
    const ez = z1 - z0;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cell = r * this.columns + c;
        for (let k = this.cellStart[cell]; k < this.cellStart[cell + 1]; k++) {
          const s = this.cellList[k];
          const dx = this.wallC[s] - this.wallA[s];
          const dz = this.wallD[s] - this.wallB[s];
          const under = ex * dz - ez * dx;
          if (Math.abs(under) < 1e-9) continue;
          const t = ((this.wallA[s] - x0) * dz - (this.wallB[s] - z0) * dx) / under;
          const u = ((this.wallA[s] - x0) * ez - (this.wallB[s] - z0) * ex) / under;
          if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
        }
      }
    }
    return false;
  }

  /** The streets that run near a point. */
  edgesNear(x: number, z: number, reach: number, visit: (edge: Edge) => void) {
    const seen = new Set<number>();
    const steps = Math.ceil(reach / ROAD_CELL);
    for (let a = -steps; a <= steps; a++) {
      for (let b = -steps; b <= steps; b++) {
        const list = this.roadGrid.get(this.roadKey(x + a * ROAD_CELL, z + b * ROAD_CELL));
        if (!list) continue;
        for (const index of list) {
          if (seen.has(index)) continue;
          seen.add(index);
          visit(this.edges[index]);
        }
      }
    }
  }

  /** Where a distance along a street is, and which way it runs there. */
  pointOn(edge: Edge, along: number, out: { x: number; z: number; forwardX: number; forwardZ: number }) {
    const { points, run } = edge;
    const target = Math.min(Math.max(along, 0), edge.length);
    let low = 0;
    let high = run.length - 1;
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if (run[middle] <= target) low = middle;
      else high = middle;
    }
    const span = run[high] - run[low] || 1;
    const t = (target - run[low]) / span;
    const dx = points[high * 2] - points[low * 2];
    const dz = points[high * 2 + 1] - points[low * 2 + 1];
    const size = Math.hypot(dx, dz) || 1;
    out.x = points[low * 2] + dx * t;
    out.z = points[low * 2 + 1] + dz * t;
    out.forwardX = dx / size;
    out.forwardZ = dz / size;
    return out;
  }

  /** The nearest junction to a point, searching outward until there is one. */
  nearestNode(x: number, z: number) {
    let best = -1;
    let nearest = Infinity;
    for (let reach = 100; best < 0 && reach < 6000; reach *= 2) {
      this.edgesNear(x, z, reach, (edge) => {
        for (const node of [edge.a, edge.b]) {
          const gap = Math.hypot(this.nodeX[node] - x, this.nodeZ[node] - z);
          if (gap < nearest) {
            nearest = gap;
            best = node;
          }
        }
      });
    }
    return best < 0 ? 0 : best;
  }

  /** The way through the streets between two points, as a line of map positions. */
  route(fromX: number, fromZ: number, toX: number, toZ: number): Place[] {
    const start = this.nearestNode(fromX, fromZ);
    const goal = this.nearestNode(toX, toZ);
    const cost = new Float64Array(this.nodes.length).fill(Infinity);
    const came = new Int32Array(this.nodes.length).fill(-1);
    const done = new Uint8Array(this.nodes.length);
    const heap: [number, number][] = [[0, start]];
    cost[start] = 0;
    const guess = (node: number) => Math.hypot(this.nodeX[node] - this.nodeX[goal], this.nodeZ[node] - this.nodeZ[goal]);
    while (heap.length) {
      const [, node] = pop(heap);
      if (done[node]) continue;
      done[node] = 1;
      if (node === goal) break;
      for (const index of this.nodes[node]) {
        const edge = this.edges[index];
        const other = edge.a === node ? edge.b : edge.a;
        // The bigger roads are quicker, so that's the way a rider would really go.
        const pace = edge.kind >= HERO || edge.kind < 3 ? 0.7 : edge.kind < 5 ? 0.85 : 1.1;
        const total = cost[node] + edge.length * pace;
        if (total < cost[other]) {
          cost[other] = total;
          came[other] = index;
          push(heap, [total + guess(other) * 0.7, other]);
        }
      }
    }
    const line: Place[] = [];
    let node = goal;
    while (node !== start && came[node] >= 0) {
      const edge = this.edges[came[node]];
      const forward = edge.b === node;
      const count = edge.points.length / 2;
      for (let k = 0; k < count; k++) {
        const at = forward ? count - 1 - k : k;
        line.push({ x: edge.points[at * 2], z: edge.points[at * 2 + 1] });
      }
      node = forward ? edge.a : edge.b;
    }
    return line.reverse();
  }
}

function push(heap: [number, number][], item: [number, number]) {
  heap.push(item);
  let at = heap.length - 1;
  while (at > 0) {
    const parent = (at - 1) >> 1;
    if (heap[parent][0] <= heap[at][0]) break;
    [heap[parent], heap[at]] = [heap[at], heap[parent]];
    at = parent;
  }
}

function pop(heap: [number, number][]) {
  const top = heap[0];
  const last = heap.pop() as [number, number];
  if (heap.length) {
    heap[0] = last;
    let at = 0;
    for (;;) {
      const left = at * 2 + 1;
      const right = left + 1;
      let small = at;
      if (left < heap.length && heap[left][0] < heap[small][0]) small = left;
      if (right < heap.length && heap[right][0] < heap[small][0]) small = right;
      if (small === at) break;
      [heap[small], heap[at]] = [heap[at], heap[small]];
      at = small;
    }
  }
  return top;
}
