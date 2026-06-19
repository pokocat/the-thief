import { Vector3 } from "../bjs";
import type { EnemyConfig } from "../config/types";
import type { EnemyVisual } from "./models/ModelFactory";

let nextEnemyUid = 1;

// A single enemy instance. Pooled and reset on (re)spawn.
export class Enemy {
  uid = 0;
  cfg!: EnemyConfig;
  visual!: EnemyVisual;
  barEl: HTMLElement | null = null;

  alive = false;
  dist = 0; // distance walked along the path
  maxHp = 1;
  hp = 1;
  baseSpeed = 1;
  speedMul = 1;
  rewardMul = 1;

  // status effects (absolute time in seconds)
  slowFactor = 0;
  slowUntil = 0;
  frozenUntil = 0;
  armorShred = 0;
  armorShredUntil = 0;

  // steal bookkeeping: how many times each tower stole from this enemy
  stolenBy = new Map<number, number>();

  readonly pos = new Vector3();

  reset(cfg: EnemyConfig, hpMul: number, speedMul: number, rewardMul: number, visual: EnemyVisual): void {
    this.uid = nextEnemyUid++;
    this.cfg = cfg;
    this.visual = visual;
    this.alive = true;
    this.dist = 0;
    this.maxHp = cfg.maxHp * hpMul;
    this.hp = this.maxHp;
    this.baseSpeed = cfg.speed;
    this.speedMul = speedMul;
    this.rewardMul = rewardMul;
    this.slowFactor = 0;
    this.slowUntil = 0;
    this.frozenUntil = 0;
    this.armorShred = 0;
    this.armorShredUntil = 0;
    this.stolenBy.clear();
    visual.root.setEnabled(true);
  }

  get isFlying(): boolean {
    return this.cfg.isFlying;
  }

  effectiveArmor(time: number): number {
    const shred = time < this.armorShredUntil ? this.armorShred : 0;
    return Math.max(0, this.cfg.armor - shred);
  }

  currentSpeed(time: number): number {
    if (time < this.frozenUntil) return 0;
    const slow = time < this.slowUntil ? this.slowFactor : 0;
    return this.baseSpeed * this.speedMul * (1 - slow);
  }

  applySlow(factor: number, duration: number, time: number): void {
    const dur = duration * (1 - this.cfg.controlResist);
    if (dur <= 0) return;
    // keep the strongest slow currently active
    if (factor >= this.slowFactor || time >= this.slowUntil) {
      this.slowFactor = factor;
    }
    this.slowUntil = Math.max(this.slowUntil, time + dur);
  }

  applyFreeze(duration: number, time: number): void {
    const dur = duration * (1 - this.cfg.controlResist);
    if (dur <= 0) return;
    this.frozenUntil = Math.max(this.frozenUntil, time + dur);
  }

  applyArmorShred(amount: number, duration: number, time: number): void {
    this.armorShred = Math.max(this.armorShred, amount);
    this.armorShredUntil = Math.max(this.armorShredUntil, time + duration);
  }

  get topAnchor(): Vector3 {
    return new Vector3(this.pos.x, this.pos.y + this.visual.topY, this.pos.z);
  }
}
