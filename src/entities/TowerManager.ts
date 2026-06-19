import { Vector3, Scene } from "../bjs";
import { Tower } from "./Tower";
import { Balance, towerCfg } from "../config";
import type { TowerConfig } from "../config/types";
import type { BuildPadRef } from "../map/SceneBuilder";
import type { GameContext } from "../core/Context";

export class TowerManager {
  towers: Tower[] = [];

  constructor(private scene: Scene) {}

  build(cfg: TowerConfig, pad: BuildPadRef): Tower {
    const pos = new Vector3(pad.position.x, 0.3, pad.position.z);
    const tower = new Tower(this.scene, cfg, pos, pad.index);
    pad.occupied = true;
    this.towers.push(tower);
    return tower;
  }

  byUid(uid: number): Tower | undefined {
    return this.towers.find((t) => t.uid === uid);
  }

  canUpgrade(tower: Tower): TowerConfig | null {
    return tower.cfg.upgradeTo ? towerCfg(tower.cfg.upgradeTo) : null;
  }

  upgrade(tower: Tower, ctx: GameContext): boolean {
    const next = this.canUpgrade(tower);
    if (!next) return false;
    if (!ctx.state.spend(next.cost)) return false;
    tower.upgrade(next);
    return true;
  }

  sell(tower: Tower, pads: BuildPadRef[], ctx: GameContext): void {
    const refund = Math.floor(tower.investedGold * Balance.sellRefundRatio);
    ctx.state.addGold(refund);
    const pad = pads[tower.padIndex];
    if (pad) pad.occupied = false;
    tower.dispose();
    const idx = this.towers.indexOf(tower);
    if (idx >= 0) this.towers.splice(idx, 1);
  }

  update(dt: number, ctx: GameContext): void {
    // recompute attack-speed auras (bloodmage), then tick towers
    const auras = this.towers.filter((t) => t.cfg.specialEffect?.type === "aura_attackspeed");
    for (const t of this.towers) {
      let bonus = 0;
      for (const a of auras) {
        if (a === t) continue;
        const eff = a.cfg.specialEffect!;
        const r = eff.radius ?? 3;
        const dx = a.position.x - t.position.x;
        const dz = a.position.z - t.position.z;
        if (dx * dx + dz * dz <= r * r) bonus = Math.max(bonus, eff.value ?? 0);
      }
      t.auraSpeedBonus = bonus;
    }
    for (const t of this.towers) t.update(dt, ctx);
  }

  clearAll(pads: BuildPadRef[]): void {
    for (const t of this.towers.slice()) t.dispose();
    this.towers.length = 0;
    for (const p of pads) p.occupied = false;
  }
}
