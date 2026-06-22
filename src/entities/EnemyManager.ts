import { Vector3, Scene } from "../bjs";
import { Enemy } from "./Enemy";
import type { EnemyVisual } from "./models/ModelFactory";
import { buildEnemyGlb } from "../render/GlbBuild";
import { ObjectPool } from "../core/ObjectPool";
import { PathSystem } from "../map/PathSystem";
import { GameState } from "../core/GameState";
import { WorldOverlay } from "../ui/WorldOverlay";
import { EffectSystem } from "../systems/EffectSystem";
import { bus } from "../core/Events";
import { Balance } from "../config";
import type { EnemyConfig } from "../config/types";

interface Dying {
  enemy: Enemy;
  age: number;
  life: number;
}

export class EnemyManager {
  active: Enemy[] = [];
  private dying: Dying[] = [];
  private enemyPool: ObjectPool<Enemy>;
  private visualPools = new Map<string, EnemyVisual[]>();
  private extraGold = new Map<number, number>(); // enemy uid -> boss extra gold

  constructor(
    private scene: Scene,
    private path: PathSystem,
    private state: GameState,
    private overlay: WorldOverlay,
    private effects: EffectSystem
  ) {
    this.enemyPool = new ObjectPool<Enemy>({ create: () => new Enemy() });
  }

  private getVisual(cfg: EnemyConfig): EnemyVisual {
    const pool = this.visualPools.get(cfg.id);
    if (pool && pool.length) return pool.pop()!;
    return buildEnemyGlb(this.scene, cfg);
  }

  private releaseVisual(cfg: EnemyConfig, v: EnemyVisual): void {
    v.root.setEnabled(false);
    v.root.scaling.setAll(1);
    v.root.rotation.z = 0;
    v.slowRing.setEnabled(false);
    v.freezeBox.setEnabled(false);
    v.body.position.y = 0;
    v.anim?.stopAll();
    let pool = this.visualPools.get(cfg.id);
    if (!pool) {
      pool = [];
      this.visualPools.set(cfg.id, pool);
    }
    pool.push(v);
  }

  spawn(cfg: EnemyConfig, hpMul: number, speedMul: number, rewardMul: number, extraGold: number): Enemy {
    const visual = this.getVisual(cfg);
    const e = this.enemyPool.acquire();
    e.reset(cfg, hpMul, speedMul, rewardMul, visual);
    if (extraGold) this.extraGold.set(e.uid, extraGold);
    if (cfg.tags.includes("boss")) bus.emit("bossSpawn", { name: cfg.name });
    e.barEl = this.overlay.acquireBar();
    const y = cfg.isFlying ? Balance.flyingHeight : 0;
    this.path.sample(0, e.pos, y);
    visual.root.position.copyFrom(e.pos);
    visual.anim?.play(visual.moveClips ?? [], true);
    this.active.push(e);
    return e;
  }

  kill(enemy: Enemy): void {
    if (!enemy.alive) return;
    enemy.alive = false;
    const idx = this.active.indexOf(enemy);
    if (idx >= 0) this.active.splice(idx, 1);

    let reward = enemy.cfg.goldReward * enemy.rewardMul;
    const extra = this.extraGold.get(enemy.uid);
    if (extra) {
      reward += extra;
      this.extraGold.delete(enemy.uid);
    }
    this.state.addKillGold(reward);
    const a = enemy.topAnchor;
    bus.emit("enemyKilled", { goldReward: reward, worldX: a.x, worldY: a.y, worldZ: a.z });
    this.effects.burst(new Vector3(enemy.pos.x, enemy.pos.y + 0.8, enemy.pos.z), "#dddddd", 1.4);

    if (enemy.barEl) {
      this.overlay.releaseBar(enemy.barEl);
      enemy.barEl = null;
    }
    enemy.visual.slowRing.setEnabled(false);
    enemy.visual.freezeBox.setEnabled(false);
    enemy.visual.anim?.play(enemy.visual.deathClips ?? ["Death"], false);
    this.dying.push({ enemy, age: 0, life: 1.0 });
  }

  private reachGoal(enemy: Enemy): void {
    enemy.alive = false;
    const idx = this.active.indexOf(enemy);
    if (idx >= 0) this.active.splice(idx, 1);
    this.state.addLeak();
    if (enemy.cfg.goldStealOnLeak) {
      this.state.loseGold(enemy.cfg.goldStealOnLeak);
      const a = enemy.topAnchor;
      this.overlay.spawnText(`-${enemy.cfg.goldStealOnLeak}`, a, "loss", true);
    }
    this.recycle(enemy);
  }

  private recycle(enemy: Enemy): void {
    if (enemy.barEl) {
      this.overlay.releaseBar(enemy.barEl);
      enemy.barEl = null;
    }
    this.releaseVisual(enemy.cfg, enemy.visual);
    this.extraGold.delete(enemy.uid);
    this.enemyPool.release(enemy);
  }

  update(dt: number, time: number): void {
    const scale = Balance.enemySpeedScale;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      const speed = e.currentSpeed(time);
      e.dist += speed * scale * dt;

      const y = e.isFlying ? Balance.flyingHeight : 0;
      const heading = this.path.sample(e.dist, e.pos, y);
      const v = e.visual;
      v.root.position.copyFrom(e.pos);
      v.root.rotation.y = heading;

      // skeletal animation: pause while frozen, otherwise play at normal speed
      v.anim?.setSpeed(time < e.frozenUntil ? 0 : 1);
      // (procedural fallback for any non-glb visuals with limbs)
      if (v.limbs.length && speed > 0.01) {
        const gait = time * 9 + e.uid;
        v.body.position.y = Math.abs(Math.sin(gait)) * 0.1;
        for (const L of v.limbs) L.pivot.rotation.x = Math.sin(gait + L.phase) * L.amp;
      }
      // status visuals
      v.slowRing.setEnabled(time < e.slowUntil && time >= e.frozenUntil);
      v.freezeBox.setEnabled(time < e.frozenUntil);

      if (e.dist >= this.path.totalLength) this.reachGoal(e);
    }

    // death animation + recycle
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i];
      d.age += dt;
      const k = d.age / d.life;
      const v = d.enemy.visual;
      // let the death clip play; shrink+sink only in the last 30%
      if (k > 0.7) {
        const f = (k - 0.7) / 0.3;
        v.root.scaling.setAll(Math.max(0.01, 1 - f));
        v.root.position.y = d.enemy.pos.y - f * 0.4;
      }
      if (k >= 1) {
        v.root.scaling.setAll(1);
        v.root.position.y = d.enemy.pos.y;
        this.recycle(d.enemy);
        this.dying.splice(i, 1);
      }
    }
  }

  get aliveCount(): number {
    return this.active.length;
  }

  clearAll(): void {
    for (const e of this.active.slice()) this.recycle(e);
    this.active.length = 0;
    for (const d of this.dying.slice()) {
      d.enemy.visual.root.scaling.setAll(1);
      this.recycle(d.enemy);
    }
    this.dying.length = 0;
  }
}
