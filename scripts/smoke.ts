// Headless gameplay smoke test using Babylon's NullEngine (no GPU/DOM).
// Exercises the full loop: build towers -> auto-run 30 waves -> verify steal,
// kills, leaks, and a win/lose outcome with no runtime exceptions.
import { NullEngine, Scene } from "@babylonjs/core";
import { GameMap, towerCfg } from "../src/config";
import { PathSystem } from "../src/map/PathSystem";
import { GameState } from "../src/core/GameState";
import { EffectSystem } from "../src/systems/EffectSystem";
import { EnemyManager } from "../src/entities/EnemyManager";
import { TowerManager } from "../src/entities/TowerManager";
import { WaveSystem } from "../src/systems/WaveSystem";
import { bus } from "../src/core/Events";
import type { GameContext } from "../src/core/Context";
import type { BuildPadRef } from "../src/map/SceneBuilder";

const engine = new NullEngine();
const scene = new Scene(engine);
const path = new PathSystem(GameMap);
const state = new GameState();

// minimal overlay stub (EnemyManager only needs these methods)
const overlay = {
  acquireBar: () => ({ style: {}, firstChild: { style: {} } }),
  releaseBar: () => {},
  spawnText: () => {},
  update: () => {},
} as any;

const effects = new EffectSystem(scene);
const enemies = new EnemyManager(scene, path, state, overlay, effects);
const towers = new TowerManager(scene);

// build synthetic pad refs from map build points
const { Vector3 } = await import("@babylonjs/core");
const pads: BuildPadRef[] = GameMap.buildPoints.map((p, index) => ({
  index,
  mesh: null as any,
  position: new Vector3(p.x, 0.45, p.z),
  occupied: false,
}));

const ctx: GameContext = {
  scene,
  camera: null as any,
  state,
  path,
  enemies,
  towers,
  effects,
  overlay,
  pads,
  time: 0,
};
const waves = new WaveSystem(ctx);

// counters
let kills = 0;
let stolen = 0;
let stealEvents = 0;
let waveStarts = 0;
let waveEnds = 0;
let over: { won: boolean; wavesCleared: number; leaks: number } | null = null;
bus.on("enemyKilled", () => kills++);
bus.on("goldStolen", (p) => {
  stolen += p.amount;
  stealEvents++;
});
bus.on("waveStart", () => waveStarts++);
bus.on("waveEnd", () => waveEnds++);
bus.on("gameOver", (p) => (over = p));

// strong loadout: fill every pad with end-tier towers (bypass cost) so we win.
// MODE=lose builds nothing, so enemies leak and the defeat path triggers.
const loseMode = process.env.MODE === "lose";
if (!loseMode) {
  const loadout = ["thief_05", "archer_03", "frost_03", "thief_05", "hero_02"];
  pads.forEach((pad, i) => towers.build(towerCfg(loadout[i % loadout.length]), pad));
}

waves.beginIntermission();

const DT = 1 / 60;
let steps = 0;
const MAX_STEPS = 30 * 60 * 80; // generous budget
while (!over && steps < MAX_STEPS) {
  if (waves.canStartNow) waves.requestStart(); // skip the intermission countdown
  ctx.time += DT;
  waves.update(DT);
  enemies.update(DT, ctx.time);
  towers.update(DT, ctx);
  effects.update(DT);
  steps++;
}

const result = over as { won: boolean; wavesCleared: number; leaks: number } | null;
console.log("=== Heist TD headless smoke ===");
console.log("steps simulated :", steps);
console.log("wave starts     :", waveStarts);
console.log("wave ends       :", waveEnds);
console.log("kills           :", kills);
console.log("steal events    :", stealEvents);
console.log("gold stolen     :", Math.round(stolen));
console.log("final wave      :", state.currentWave, "/", waves.totalWaves);
console.log("leaks           :", state.leaks);
console.log("gold            :", Math.round(state.gold));
console.log("game over       :", result);

const ok = loseMode
  ? result !== null && result.won === false && state.leaks >= 20
  : result !== null &&
    result.won === true &&
    waveStarts === 30 &&
    kills > 100 &&
    stealEvents > 0 &&
    state.currentWave === 30;
console.log(ok ? "\nSMOKE PASS ✅" : "\nSMOKE FAIL ❌");
process.exit(ok ? 0 : 1);
