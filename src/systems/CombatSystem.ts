import type { Enemy } from "../entities/Enemy";
import type { DamageType } from "../config/types";
import type { GameContext } from "../core/Context";

// Applies damage with armor (physical, flat reduction) or magic resist
// (magic, percentage reduction). Returns the damage actually dealt.
export function applyDamage(
  enemy: Enemy,
  amount: number,
  type: DamageType,
  ctx: GameContext
): number {
  if (!enemy.alive) return 0;
  let dmg: number;
  if (type === "physical") {
    dmg = Math.max(1, amount - enemy.effectiveArmor(ctx.time));
  } else {
    dmg = Math.max(1, amount * (1 - enemy.cfg.magicResist));
  }
  enemy.hp -= dmg;
  if (enemy.hp <= 0) {
    ctx.enemies.kill(enemy);
  }
  return dmg;
}
