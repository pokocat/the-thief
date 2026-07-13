import { Vector3, Scene, Color3, Mesh, TransformNode } from "../bjs";
import { Enemy } from "./Enemy";
import type { EnemyVisual } from "./models/ModelFactory";
import { buildEnemyGlb } from "../render/GlbBuild";
import { approachAngle } from "../render/ProceduralAnim";
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
  fallback: boolean; // true when the model has no death clip -> sink+shrink
}

const HIT_WHITE = new Color3(1, 1, 1);
const FLASH_TIME = 0.09;
const SQUASH_TIME = 0.12;

export class EnemyManager {
  active: Enemy[] = [];
  private dying: Dying[] = [];
  private enemyPool: ObjectPool<Enemy>;
  private visualPools = new Map<string, EnemyVisual[]>();
  private extraGold = new Map<number, number>(); // enemy uid -> boss extra gold
  // cached renderable meshes per visual root (avoids getChildMeshes() per hit)
  private meshCache = new WeakMap<TransformNode, Mesh[]>();

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

  // renderable body meshes (excludes the translucent status indicators), cached
  private meshesOf(v: EnemyVisual): Mesh[] {
    let list = this.meshCache.get(v.root);
    if (!list) {
      list = v.root
        .getChildMeshes(false)
        .filter((m) => m.getTotalVertices() > 0 && m !== v.slowRing && m !== v.freezeBox) as Mesh[];
      this.meshCache.set(v.root, list);
    }
    return list;
  }

  // Called by Tower on a landed hit: white overlay flash + squash pop. Uses
  // renderOverlay (zero material clones) reset when the enemy is recycled.
  onHit(enemy: Enemy): void {
    if (!enemy.alive) return;
    enemy.hitFlash = FLASH_TIME;
    enemy.squashT = SQUASH_TIME;
    for (const m of this.meshesOf(enemy.visual)) {
      m.renderOverlay = true;
      m.overlayColor = HIT_WHITE;
      m.overlayAlpha = 0.55;
    }
  }

  private clearOverlay(v: EnemyVisual): void {
    for (const m of this.meshesOf(v)) m.renderOverlay = false;
  }

  private releaseVisual(cfg: EnemyConfig, v: EnemyVisual): void {
    v.root.setEnabled(false);
    v.root.scaling.setAll(1);
    v.root.rotation.z = 0;
    v.slowRing.setEnabled(false);
    v.freezeBox.setEnabled(false);
    v.body.position.y = 0;
    this.clearOverlay(v);
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
    const heading = this.path.sample(0, e.pos, y);
    visual.root.position.copyFrom(e.pos);
    e.yaw = heading; // snap facing on spawn (no startup spin)
    visual.root.rotation.y = heading;
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
    this.clearOverlay(enemy.visual); // don't leave a white corpse mid-flash
    enemy.hitFlash = 0;
    enemy.squashT = 0;
    enemy.visual.root.scaling.setAll(1);
    // play the death clip if the model has one; otherwise fall back to a short
    // sink+shrink so the enemy doesn't vanish instantly.
    const hasDeath = enemy.visual.anim
      ? enemy.visual.anim.play(enemy.visual.deathClips ?? ["Death"], false)
      : false;
    this.dying.push({ enemy, age: 0, life: hasDeath ? 1.0 : 0.4, fallback: !hasDeath });
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
      // ease facing toward heading (~10 rad/s) instead of snapping
      e.yaw = approachAngle(e.yaw, heading, dt * 10);
      v.root.rotation.y = e.yaw;

      // skeletal animation: pause while frozen, otherwise play at normal speed
      v.anim?.setSpeed(time < e.frozenUntil ? 0 : 1);
      v.anim?.update(dt); // advance any in-progress crossfade
      // (procedural fallback for any non-glb visuals with limbs)
      if (v.limbs.length && speed > 0.01) {
        const gait = time * 9 + e.uid;
        v.body.position.y = Math.abs(Math.sin(gait)) * 0.1;
        for (const L of v.limbs) L.pivot.rotation.x = Math.sin(gait + L.phase) * L.amp;
      }

      // hit feedback: white overlay flash then squash-recover
      if (e.hitFlash > 0) {
        e.hitFlash -= dt;
        if (e.hitFlash <= 0) this.clearOverlay(v);
      }
      if (e.squashT > 0) {
        e.squashT -= dt;
        const k = Math.max(0, e.squashT) / SQUASH_TIME; // 1 -> 0
        v.root.scaling.setAll(e.squashT > 0 ? 0.92 + (1 - k) * 0.08 : 1);
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
      v.anim?.update(dt); // crossfade into the death clip
      if (d.fallback) {
        // no death clip: sink + shrink across the whole (short) duration
        v.root.scaling.setAll(Math.max(0.01, 1 - k));
        v.root.position.y = d.enemy.pos.y - k * 0.5;
      } else if (k > 0.7) {
        // let the death clip play; shrink+sink only in the last 30%
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
