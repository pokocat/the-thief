import { Vector3, MeshBuilder, Mesh, Scene } from "../bjs";
import { translucentMat } from "./models/materials";
import { buildTowerGlb, towerAttackClips, towerIdleClips } from "../render/GlbBuild";
import type { TowerVisualExt } from "../render/GlbBuild";
import { ProceduralAnim, approachAngle } from "../render/ProceduralAnim";
import type { TowerConfig, ItemConfig, TargetMode } from "../config/types";
import type { GameContext } from "../core/Context";
import { selectTargets } from "../systems/TargetingSystem";
import { applyDamage } from "../systems/CombatSystem";
import { trySteal } from "../systems/StealSystem";

let nextTowerUid = 1;

export class Tower {
  uid = nextTowerUid++;
  cfg: TowerConfig;
  readonly position: Vector3;
  visual: TowerVisualExt;
  padIndex: number;

  cooldown = 0;
  hitCount = 0;
  auraSpeedBonus = 0; // refreshed each frame by TowerManager
  attackPulse = 0;
  private headBaseY = 0.56;
  private headYaw = 0; // smoothed facing
  private headTargetYaw = 0;
  items: ItemConfig[] = [];
  investedGold = 0;
  private targetModeOverride: TargetMode | null = null;

  private collider: Mesh;
  private rangeRing: Mesh;

  constructor(private scene: Scene, cfg: TowerConfig, position: Vector3, padIndex: number) {
    this.cfg = cfg;
    this.position = position;
    this.padIndex = padIndex;
    this.investedGold = cfg.cost;
    this.visual = buildTowerGlb(scene, cfg);
    this.visual.root.position.copyFrom(position);
    this.headBaseY = this.visual.head.position.y;
    this.ensureProc();

    // invisible pick collider
    this.collider = MeshBuilder.CreateBox(`towerHit_${this.uid}`, { width: 1.8, height: 3, depth: 1.8 }, scene);
    this.collider.position.set(position.x, position.y + 1.3, position.z);
    this.collider.visibility = 0;
    this.collider.metadata = { kind: "tower", uid: this.uid };

    // range ring (shown when selected)
    this.rangeRing = MeshBuilder.CreateTorus(`range_${this.uid}`, { diameter: cfg.range * 2, thickness: 0.12, tessellation: 36 }, scene);
    this.rangeRing.material = translucentMat(scene, "#ffe27a", 0.5, 0.8);
    this.rangeRing.position.set(position.x, 0.2, position.z);
    this.rangeRing.isPickable = false;
    this.rangeRing.setEnabled(false);
  }

  get targetMode(): TargetMode {
    return this.targetModeOverride ?? this.cfg.targetMode;
  }
  cycleTargetMode(): TargetMode {
    const order: TargetMode[] = ["first", "nearest", "strongest"];
    const cur = this.targetMode;
    this.targetModeOverride = order[(order.indexOf(cur) + 1) % order.length];
    return this.targetModeOverride;
  }

  canAttackAir(_ctx: GameContext): boolean {
    return this.cfg.canAttackAir || this.items.some((i) => i.modifiers.canAttackAir);
  }

  private itemAttackSpeed(): number {
    return this.items.reduce((s, i) => s + (i.modifiers.attackSpeed ?? 0), 0);
  }
  private itemStealMult(): number {
    return this.items.reduce((s, i) => s + (i.modifiers.stealMultiplier ?? 0), 0);
  }

  effectiveAttackInterval(ctx: GameContext): number {
    let speedBonus = this.auraSpeedBonus + this.itemAttackSpeed();
    if (this.cfg.category === "thief") speedBonus += ctx.state.thiefAttackSpeedBonus;
    return this.cfg.attackInterval / (1 + speedBonus);
  }

  effectiveDamage(ctx: GameContext, targetIsAir: boolean): number {
    let dmg = this.cfg.damage;
    if (targetIsAir && this.canAttackAir(ctx)) dmg *= 1 + ctx.state.antiAirDamageBonus;
    return dmg;
  }

  effectiveStealMultiplier(ctx: GameContext): number {
    const base = this.cfg.stealMultiplier ?? 0;
    if (base <= 0) return 0;
    return base + ctx.state.stealMultiplierBonus + this.itemStealMult();
  }

  private muzzleWorld(): Vector3 {
    return new Vector3(this.position.x, this.position.y + this.visual.muzzleHeight, this.position.z);
  }

  // towers without skeletal animation (wizard/archer GLB + every primitive
  // fallback) get a procedural animator for idle bob + cast recoil
  private ensureProc(): void {
    if (!this.visual.anim && !this.visual.proc) {
      this.visual.proc = new ProceduralAnim(this.visual.head, this.headBaseY, this.uid);
    }
  }

  update(dt: number, ctx: GameContext): void {
    // per-frame: ease facing, tick procedural + skeletal animation (crossfade)
    this.headYaw = approachAngle(this.headYaw, this.headTargetYaw, dt * 10);
    this.visual.head.rotation.y = this.headYaw;
    this.visual.proc?.update(dt, ctx.time);
    this.visual.anim?.update(dt);
    this.attackPulse = Math.max(0, this.attackPulse - dt * 4);

    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    if (ctx.state.status !== "fighting" && ctx.state.status !== "spawning") return;

    const multishot = this.cfg.specialEffect?.type === "multishot" ? this.cfg.specialEffect.targets ?? 1 : 1;
    const targets = selectTargets(this, ctx, multishot);
    if (targets.length === 0) return;

    this.cooldown = this.effectiveAttackInterval(ctx);
    this.attackPulse = 1;
    this.hitCount += 1;

    // face primary target (eased each frame toward this)
    const primary = targets[0];
    this.headTargetYaw = Math.atan2(primary.pos.x - this.position.x, primary.pos.z - this.position.z);

    const muzzle = this.muzzleWorld();
    // attack animation: skeletal one-shot, else procedural recoil + muzzle flash
    const atk = towerAttackClips(this.cfg.model);
    if (atk.length && this.visual.anim) {
      this.visual.anim.playOneShot(atk, towerIdleClips(this.cfg.model));
    } else if (this.visual.proc) {
      this.visual.proc.attack();
      ctx.effects.burst(muzzle, this.cfg.color, 0.55);
    }

    const doSteal = (this.cfg.stealEveryHits ?? 0) > 0 && this.hitCount % (this.cfg.stealEveryHits as number) === 0;

    targets.forEach((target, idx) => {
      const arc = target.isFlying ? 1.2 : 0.4;
      ctx.effects.fireProjectile(muzzle, target.topAnchor, this.cfg.color, arc, this.cfg.category);
      const dmg = this.effectiveDamage(ctx, target.isFlying);
      applyDamage(target, dmg, this.cfg.damageType, ctx);
      if (target.alive) {
        this.applyOnHit(target, ctx);
        ctx.enemies.onHit(target); // white-flash + squash feedback
      }
      // steal from the primary target only
      if (idx === 0 && doSteal && target.alive) trySteal(this, target, ctx);
    });
  }

  private applyOnHit(target: import("./Enemy").Enemy, ctx: GameContext): void {
    const eff = this.cfg.specialEffect;
    const t = ctx.time;
    if (eff) {
      if (eff.type === "armor_shred") {
        target.applyArmorShred((eff.value ?? 0) + ctx.state.armorShredBonus, eff.duration ?? 4, t);
        ctx.effects.burst(target.topAnchor, "#b15ee8", 1.0);
      } else if (eff.type === "slow") {
        target.applySlow((eff.value ?? 0) + ctx.state.slowBonus, eff.duration ?? 2, t);
      } else if (eff.type === "frost") {
        target.applySlow((eff.slow ?? 0) + ctx.state.slowBonus, eff.slowDuration ?? 1.5, t);
        if ((eff.freezeChance ?? 0) > 0 && Math.random() < (eff.freezeChance as number)) {
          target.applyFreeze(eff.freezeDuration ?? 1, t);
          ctx.effects.burst(target.topAnchor, "#bdeeff", 1.4);
        }
      }
    }
    // item on-hit effects
    for (const it of this.items) {
      if (it.modifiers.armorShredOnHit) {
        target.applyArmorShred(it.modifiers.armorShredOnHit, it.modifiers.armorShredDuration ?? 4, t);
      }
      if (it.modifiers.slowOnHit) {
        target.applySlow(it.modifiers.slowOnHit + ctx.state.slowBonus, it.modifiers.slowDuration ?? 1.5, t);
      }
    }
  }

  upgrade(newCfg: TowerConfig): void {
    this.investedGold += newCfg.cost;
    this.cfg = newCfg;
    // rebuild visual
    this.visual.root.dispose();
    this.visual = buildTowerGlb(this.scene, newCfg);
    this.visual.root.position.copyFrom(this.position);
    this.headBaseY = this.visual.head.position.y;
    this.ensureProc();
    this.rangeRing.dispose();
    this.rangeRing = MeshBuilder.CreateTorus(`range_${this.uid}`, { diameter: newCfg.range * 2, thickness: 0.12, tessellation: 36 }, this.scene);
    this.rangeRing.material = translucentMat(this.scene, "#ffe27a", 0.5, 0.8);
    this.rangeRing.position.set(this.position.x, 0.2, this.position.z);
    this.rangeRing.isPickable = false;
    this.rangeRing.setEnabled(false);
  }

  equip(item: ItemConfig): boolean {
    const slots = this.cfg.equipSlots ?? 0;
    if (this.items.length >= slots) return false;
    this.items.push(item);
    this.investedGold += item.cost;
    return true;
  }

  setSelected(sel: boolean): void {
    this.rangeRing.setEnabled(sel);
  }

  dispose(): void {
    this.visual.root.dispose();
    this.collider.dispose();
    this.rangeRing.dispose();
  }
}
