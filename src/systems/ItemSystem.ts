import { Items } from "../config";
import type { GameContext } from "../core/Context";
import type { Tower } from "../entities/Tower";

export interface BuyResult {
  ok: boolean;
  reason?: string;
}

// Buy an item and auto-equip it to the given hero tower.
export function buyAndEquip(itemId: string, tower: Tower, ctx: GameContext): BuyResult {
  const item = Items[itemId];
  if (!item) return { ok: false, reason: "未知装备" };
  if (tower.cfg.category !== "hero") return { ok: false, reason: "只有英雄塔可装备" };
  const slots = tower.cfg.equipSlots ?? 0;
  if (tower.items.length >= slots) return { ok: false, reason: "装备栏已满" };
  if (!ctx.state.canAfford(item.cost)) return { ok: false, reason: "金币不足" };
  ctx.state.spend(item.cost);
  tower.equip(item);
  return { ok: true };
}
