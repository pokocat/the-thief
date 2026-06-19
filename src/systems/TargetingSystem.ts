import type { Tower } from "../entities/Tower";
import type { Enemy } from "../entities/Enemy";
import type { GameContext } from "../core/Context";

// Selects up to `count` valid targets for a tower, honoring its target mode
// and ground/air attack capability.
export function selectTargets(tower: Tower, ctx: GameContext, count: number): Enemy[] {
  const range2 = tower.cfg.range * tower.cfg.range;
  const canAir = tower.canAttackAir(ctx);
  const canGround = tower.cfg.canAttackGround;
  const candidates: Enemy[] = [];

  for (const e of ctx.enemies.active) {
    if (!e.alive) continue;
    if (e.isFlying ? !canAir : !canGround) continue;
    const dx = e.pos.x - tower.position.x;
    const dz = e.pos.z - tower.position.z;
    if (dx * dx + dz * dz > range2) continue;
    candidates.push(e);
  }
  if (candidates.length <= 1) return candidates;

  const mode = tower.targetMode;
  candidates.sort((a, b) => {
    if (mode === "strongest") return b.hp - a.hp;
    if (mode === "nearest") {
      const da = (a.pos.x - tower.position.x) ** 2 + (a.pos.z - tower.position.z) ** 2;
      const db = (b.pos.x - tower.position.x) ** 2 + (b.pos.z - tower.position.z) ** 2;
      return da - db;
    }
    // "first": furthest along the path (closest to goal)
    return b.dist - a.dist;
  });
  return candidates.slice(0, count);
}
