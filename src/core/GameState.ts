import { bus } from "./Events";
import { Balance, Tech } from "../config";

export type Status =
  | "ready" // before wave 1 / between waves, waiting for player
  | "spawning"
  | "fighting"
  | "won"
  | "lost";

// Central mutable game state + economy. Numbers come from Balance config.
export class GameState {
  gold = Balance.startingGold;
  leaks = 0;
  currentWave = 0; // 0 = not started; 1..totalWaves while playing
  status: Status = "ready";

  techLevels: Record<string, number> = {};

  // per-wave accumulators (reset at wave start)
  waveKillIncome = 0;
  waveStealIncome = 0;
  waveBonusEarned = 0;

  constructor() {
    for (const id of Object.keys(Tech)) this.techLevels[id] = 0;
  }

  // ---- economy ----
  canAfford(amount: number): boolean {
    return this.gold >= amount;
  }

  spend(amount: number): boolean {
    if (this.gold < amount) return false;
    this.gold -= amount;
    bus.emit("goldChanged", { gold: this.gold });
    return true;
  }

  addGold(amount: number): void {
    this.gold += amount;
    bus.emit("goldChanged", { gold: this.gold });
  }

  addKillGold(amount: number): void {
    this.waveKillIncome += amount;
    this.addGold(amount);
  }

  addStealGold(amount: number): void {
    this.waveStealIncome += amount;
    this.addGold(amount);
  }

  addWaveBonus(amount: number): void {
    this.waveBonusEarned += amount;
    this.addGold(amount);
  }

  loseGold(amount: number): void {
    this.gold = Math.max(0, this.gold - amount);
    bus.emit("goldChanged", { gold: this.gold });
  }

  resetWaveStats(): void {
    this.waveKillIncome = 0;
    this.waveStealIncome = 0;
    this.waveBonusEarned = 0;
  }

  // ---- leaks ----
  addLeak(): void {
    this.leaks += 1;
    bus.emit("leaksChanged", { leaks: this.leaks, limit: Balance.leakLimit });
  }

  get isDefeated(): boolean {
    return this.leaks >= Balance.leakLimit;
  }

  // ---- tech-derived global modifiers ----
  private techBonus(id: string): number {
    const cfg = Tech[id];
    if (!cfg) return 0;
    return (this.techLevels[id] ?? 0) * cfg.perLevel;
  }

  get thiefAttackSpeedBonus(): number {
    return this.techBonus("attack_training");
  }
  get stealMultiplierBonus(): number {
    return this.techBonus("steal_skill");
  }
  get armorShredBonus(): number {
    return this.techBonus("armor_research");
  }
  get slowBonus(): number {
    return this.techBonus("frost_enhance");
  }
  get antiAirDamageBonus(): number {
    return this.techBonus("antiair_training");
  }
}
