import { Tech } from "../config";
import { bus } from "../core/Events";
import type { GameState } from "../core/GameState";

// Tech levels live on GameState and are read live by towers/steal, so any
// upgrade immediately affects already-built towers.
export function techCost(id: string, state: GameState): number | null {
  const cfg = Tech[id];
  const level = state.techLevels[id] ?? 0;
  if (level >= cfg.maxLevel) return null;
  return cfg.costs[level];
}

export function upgradeTech(id: string, state: GameState): boolean {
  const cost = techCost(id, state);
  if (cost === null) return false;
  if (!state.spend(cost)) return false;
  state.techLevels[id] = (state.techLevels[id] ?? 0) + 1;
  bus.emit("techChanged", {});
  return true;
}
