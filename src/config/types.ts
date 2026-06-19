// Strongly-typed shapes for the JSON config. Logic never hard-codes numbers;
// it reads everything from these configs.

export type TargetMode = "first" | "nearest" | "strongest";
export type DamageType = "physical" | "magic";
export type TowerCategory = "thief" | "mage" | "frost" | "archer" | "hero";

export interface SpecialEffect {
  type: "aura_attackspeed" | "armor_shred" | "slow" | "frost" | "multishot";
  value?: number;
  radius?: number;
  duration?: number;
  // frost
  slow?: number;
  slowDuration?: number;
  freezeChance?: number;
  freezeDuration?: number;
  // multishot
  targets?: number;
  antiAir?: boolean;
}

export interface TowerConfig {
  id: string;
  name: string;
  category: TowerCategory;
  model: string;
  tier: number;
  cost: number;
  damage: number;
  damageType: DamageType;
  attackInterval: number;
  range: number;
  canAttackGround: boolean;
  canAttackAir: boolean;
  targetMode: TargetMode;
  stealEveryHits?: number;
  stealMultiplier?: number;
  specialEffect?: SpecialEffect;
  equipSlots?: number;
  upgradeTo: string | null;
  desc: string;
  color: string;
  buildable: boolean;
}

export interface EnemyConfig {
  id: string;
  name: string;
  model: string;
  maxHp: number;
  armor: number;
  magicResist: number;
  speed: number;
  goldReward: number;
  valueMultiplier: number;
  isFlying: boolean;
  controlResist: number;
  scale: number;
  color: string;
  goldStealOnLeak?: number;
  tags: string[];
}

export interface WaveGroup {
  enemyType: string;
  enemyCount: number;
  spawnInterval: number;
  hpMultiplier: number;
  speedMultiplier: number;
}

export interface WaveConfig {
  waveId: number;
  enemyType: string;
  enemyCount: number;
  spawnInterval: number;
  hpMultiplier: number;
  speedMultiplier: number;
  rewardMultiplier: number;
  bossExtraGold?: number;
  tags: string[];
  hint: string;
  groups?: WaveGroup[];
}

export interface TechConfig {
  id: string;
  name: string;
  maxLevel: number;
  perLevel: number;
  unit: string;
  effect: string;
  costs: number[];
  desc: string;
}

export interface ItemConfig {
  id: string;
  name: string;
  cost: number;
  icon: string;
  modifiers: {
    stealMultiplier?: number;
    attackSpeed?: number;
    armorShredOnHit?: number;
    armorShredDuration?: number;
    slowOnHit?: number;
    slowDuration?: number;
    canAttackAir?: boolean;
  };
  desc: string;
}

export interface Vec2 {
  x: number;
  z: number;
}

export interface MapData {
  name: string;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  spawn: Vec2;
  goal: Vec2;
  pathPoints: Vec2[];
  pathWidth: number;
  buildPoints: Vec2[];
}

export interface BalanceConfig {
  startingGold: number;
  totalWaves: number;
  leakLimit: number;
  waveBonusBase: number;
  waveBonusPerWave: number;
  stealBaseFlat: number;
  stealPerWave: number;
  maxStealPerEnemyPerTower: number;
  sellRefundRatio: number;
  autoStartDelaySec: number;
  maxConcurrentEnemies: number;
  enemySpeedScale: number;
  flyingHeight: number;
  notes: string;
}
