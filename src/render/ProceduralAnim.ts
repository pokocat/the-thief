import type { TransformNode } from "../bjs";

// Shortest-angle approach: move `cur` toward `target` by at most maxDelta,
// wrapping around ±π. Used for enemy heading + tower head facing so rotations
// ease instead of snapping. No allocation.
export function approachAngle(cur: number, target: number, maxDelta: number): number {
  let d = target - cur;
  // wrap into [-π, π]
  d = Math.atan2(Math.sin(d), Math.cos(d));
  if (Math.abs(d) <= maxDelta) return target;
  return cur + Math.sign(d) * maxDelta;
}

// Lightweight procedural animator for towers that have no skeletal animation
// (the wizard/archer GLBs, and every primitive fallback tower). Driven by the
// existing Tower.update loop — no registerBeforeRender. Owns the head node's
// bob/sway (idle) and a recoil "punch" (attack). It never touches rotation.y,
// which the Tower reserves for facing the target.
export class ProceduralAnim {
  private phase: number;
  private punchT = -1; // <0 means idle; otherwise seconds since attack()
  private static readonly OUT = 0.15;
  private static readonly BACK = 0.2;

  constructor(private node: TransformNode, private baseY: number, seed: number) {
    // stagger idle phase per tower so a row of towers doesn't bob in lockstep
    this.phase = (seed % 17) * 0.61;
  }

  attack(): void {
    this.punchT = 0;
  }

  update(dt: number, time: number): void {
    const t = time * 2 + this.phase;
    const bob = Math.sin(t) * 0.03;
    const sway = Math.sin(t * 0.55 + this.phase) * 0.02;

    let punch = 0; // 0..1 recoil amount
    if (this.punchT >= 0) {
      this.punchT += dt;
      if (this.punchT < ProceduralAnim.OUT) {
        const k = this.punchT / ProceduralAnim.OUT;
        punch = k * k; // ease-in snap back
      } else if (this.punchT < ProceduralAnim.OUT + ProceduralAnim.BACK) {
        const k = (this.punchT - ProceduralAnim.OUT) / ProceduralAnim.BACK;
        punch = 1 - k * (2 - k); // ease-out return
      } else {
        this.punchT = -1;
      }
    }

    this.node.position.y = this.baseY + bob + punch * 0.04;
    this.node.position.z = -punch * 0.12; // lean/recoil back
    this.node.rotation.x = -punch * 0.32; // tilt back as it casts
    this.node.rotation.z = sway;
  }

  reset(): void {
    this.punchT = -1;
    this.node.position.z = 0;
    this.node.position.y = this.baseY;
    this.node.rotation.x = 0;
    this.node.rotation.z = 0;
  }
}
