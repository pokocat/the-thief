// Central config access. All JSON is imported once and exposed as typed records.
import towersJson from "./towers.json";
import enemiesJson from "./enemies.json";
import wavesJson from "./waves.json";
import techJson from "./tech.json";
import itemsJson from "./items.json";
import mapJson from "./map.json";
import balanceJson from "./balance.json";

import type {
  TowerConfig,
  EnemyConfig,
  WaveConfig,
  TechConfig,
  ItemConfig,
  MapData,
  BalanceConfig,
} from "./types";

export const Towers = towersJson as unknown as Record<string, TowerConfig>;
export const Enemies = enemiesJson as unknown as Record<string, EnemyConfig>;
export const Waves = (wavesJson as unknown as { waves: WaveConfig[] }).waves;
export const Tech = techJson as unknown as Record<string, TechConfig>;
export const Items = itemsJson as unknown as Record<string, ItemConfig>;
export const GameMap = mapJson as unknown as MapData;
export const Balance = balanceJson as unknown as BalanceConfig;

export function towerCfg(id: string): TowerConfig {
  const t = Towers[id];
  if (!t) throw new Error(`Unknown tower id: ${id}`);
  return t;
}

export function enemyCfg(id: string): EnemyConfig {
  const e = Enemies[id];
  if (!e) throw new Error(`Unknown enemy id: ${id}`);
  return e;
}

export const buildableTowers: TowerConfig[] = Object.values(Towers).filter(
  (t) => t.buildable
);
