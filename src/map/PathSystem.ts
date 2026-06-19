import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { MapData, Vec2 } from "../config/types";

// Turns a list of path points into a poly-line the enemies walk along by
// distance. Distance-based movement keeps speed consistent regardless of
// segment length.
export class PathSystem {
  readonly points: Vec2[];
  readonly cumLength: number[]; // cumulative length at each point
  readonly totalLength: number;

  constructor(map: MapData) {
    this.points = map.pathPoints;
    this.cumLength = [0];
    let total = 0;
    for (let i = 1; i < this.points.length; i++) {
      total += this.segLen(this.points[i - 1], this.points[i]);
      this.cumLength.push(total);
    }
    this.totalLength = total;
  }

  private segLen(a: Vec2, b: Vec2): number {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  // Sample world XZ at a given distance along the path. Writes into `out`.
  // Returns the heading angle (radians, around Y) for facing.
  sample(dist: number, out: Vector3, y = 0): number {
    if (dist <= 0) {
      out.set(this.points[0].x, y, this.points[0].z);
      return this.headingAt(0);
    }
    if (dist >= this.totalLength) {
      const last = this.points[this.points.length - 1];
      out.set(last.x, y, last.z);
      return this.headingAt(this.points.length - 2);
    }
    // find segment
    let i = 1;
    while (i < this.cumLength.length && this.cumLength[i] < dist) i++;
    const a = this.points[i - 1];
    const b = this.points[i];
    const segStart = this.cumLength[i - 1];
    const segLen = this.cumLength[i] - segStart;
    const t = segLen > 0 ? (dist - segStart) / segLen : 0;
    out.set(a.x + (b.x - a.x) * t, y, a.z + (b.z - a.z) * t);
    return Math.atan2(b.x - a.x, b.z - a.z);
  }

  private headingAt(segIndex: number): number {
    const a = this.points[Math.max(0, segIndex)];
    const b = this.points[Math.min(this.points.length - 1, segIndex + 1)];
    return Math.atan2(b.x - a.x, b.z - a.z);
  }
}
