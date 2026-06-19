import { Balance } from "../config";
import { bus } from "../core/Events";
import type { Tower } from "../entities/Tower";
import type { Enemy } from "../entities/Enemy";
import type { GameContext } from "../core/Context";

// Core "thief TD" mechanic: steal = (base + wave*perWave) * stealMultiplier *
// enemy.valueMultiplier. Capped to N steals per enemy per tower so economy
// can't explode.
export function trySteal(tower: Tower, enemy: Enemy, ctx: GameContext): void {
  const cap = Balance.maxStealPerEnemyPerTower;
  const already = enemy.stolenBy.get(tower.uid) ?? 0;
  if (already >= cap) return;

  const wave = ctx.state.currentWave;
  const mult = tower.effectiveStealMultiplier(ctx);
  const amount = (Balance.stealBaseFlat + wave * Balance.stealPerWave) * mult * enemy.cfg.valueMultiplier;

  enemy.stolenBy.set(tower.uid, already + 1);
  ctx.state.addStealGold(amount);

  const big = enemy.cfg.tags.includes("boss") || amount >= 100;
  const anchor = enemy.topAnchor;
  ctx.effects.coinPop(anchor, big);
  bus.emit("goldStolen", { amount, big, worldX: anchor.x, worldY: anchor.y, worldZ: anchor.z });
}
