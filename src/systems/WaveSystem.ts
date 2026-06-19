import { Balance, Waves, enemyCfg } from "../config";
import { bus } from "../core/Events";
import type { GameContext } from "../core/Context";
import type { WaveConfig, WaveGroup } from "../config/types";

interface SpawnEvent {
  at: number;
  enemyType: string;
  hpMul: number;
  speedMul: number;
  rewardMul: number;
  extraGold: number;
}

export class WaveSystem {
  private pending: SpawnEvent[] = [];
  private waveElapsed = 0;
  private autoTimer = 0;
  private autoCountingDown = false;

  constructor(private ctx: GameContext) {}

  get currentWave(): number {
    return this.ctx.state.currentWave;
  }
  get totalWaves(): number {
    return Balance.totalWaves;
  }
  get autoStartIn(): number {
    return this.autoCountingDown ? Math.max(0, this.autoTimer) : -1;
  }
  get canStartNow(): boolean {
    return this.ctx.state.status === "ready" && this.currentWave < this.totalWaves;
  }

  // Begin the intermission countdown before the first/next wave.
  beginIntermission(): void {
    if (this.currentWave >= this.totalWaves) return;
    this.autoTimer = Balance.autoStartDelaySec;
    this.autoCountingDown = true;
    this.ctx.state.status = "ready";
  }

  requestStart(): void {
    if (!this.canStartNow) return;
    this.startWave(this.currentWave + 1);
  }

  private buildSchedule(wave: WaveConfig): SpawnEvent[] {
    const groups: WaveGroup[] = wave.groups ?? [
      {
        enemyType: wave.enemyType,
        enemyCount: wave.enemyCount,
        spawnInterval: wave.spawnInterval,
        hpMultiplier: wave.hpMultiplier,
        speedMultiplier: wave.speedMultiplier,
      },
    ];
    const events: SpawnEvent[] = [];
    for (const g of groups) {
      const isBoss = enemyCfg(g.enemyType).tags.includes("boss");
      for (let i = 0; i < g.enemyCount; i++) {
        events.push({
          at: i * g.spawnInterval,
          enemyType: g.enemyType,
          hpMul: g.hpMultiplier,
          speedMul: g.speedMultiplier,
          rewardMul: wave.rewardMultiplier,
          extraGold: isBoss ? wave.bossExtraGold ?? 0 : 0,
        });
      }
    }
    events.sort((a, b) => a.at - b.at);
    return events;
  }

  private startWave(waveId: number): void {
    const wave = Waves[waveId - 1];
    this.ctx.state.currentWave = waveId;
    this.ctx.state.resetWaveStats();
    this.pending = this.buildSchedule(wave);
    this.waveElapsed = 0;
    this.autoCountingDown = false;
    this.ctx.state.status = "spawning";
    bus.emit("waveStart", { waveId, hint: wave.hint });
  }

  private endWave(): void {
    const waveId = this.currentWave;
    const bonus = Balance.waveBonusBase + waveId * Balance.waveBonusPerWave;
    this.ctx.state.addWaveBonus(bonus);
    const isLast = waveId >= this.totalWaves;
    const nextHint = isLast ? "全部波次清除！" : Waves[waveId].hint;

    bus.emit("waveEnd", {
      waveId,
      killIncome: Math.round(this.ctx.state.waveKillIncome),
      stealIncome: Math.round(this.ctx.state.waveStealIncome),
      bonus,
      leaks: this.ctx.state.leaks,
      gold: Math.round(this.ctx.state.gold),
      nextHint,
      isLast,
    });

    if (isLast) {
      this.ctx.state.status = "won";
      bus.emit("gameOver", { won: true, wavesCleared: waveId, leaks: this.ctx.state.leaks });
    } else {
      this.beginIntermission();
    }
  }

  update(dt: number): void {
    const st = this.ctx.state;
    if (st.status === "won" || st.status === "lost") return;

    // defeat check
    if (st.isDefeated) {
      st.status = "lost";
      bus.emit("gameOver", { won: false, wavesCleared: Math.max(0, this.currentWave - 1), leaks: st.leaks });
      return;
    }

    if (this.autoCountingDown) {
      this.autoTimer -= dt;
      if (this.autoTimer <= 0) this.startWave(this.currentWave + 1);
      return;
    }

    if (st.status === "spawning") {
      this.waveElapsed += dt;
      while (
        this.pending.length &&
        this.pending[0].at <= this.waveElapsed &&
        this.ctx.enemies.aliveCount < Balance.maxConcurrentEnemies
      ) {
        const ev = this.pending.shift()!;
        this.ctx.enemies.spawn(enemyCfg(ev.enemyType), ev.hpMul, ev.speedMul, ev.rewardMul, ev.extraGold);
      }
      if (this.pending.length === 0) st.status = "fighting";
    }

    if (st.status === "fighting" && this.ctx.enemies.aliveCount === 0) {
      this.endWave();
    }
  }
}
