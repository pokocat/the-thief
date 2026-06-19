import type { Scene, Camera } from "../bjs";
import type { GameState } from "./GameState";
import type { PathSystem } from "../map/PathSystem";
import type { EnemyManager } from "../entities/EnemyManager";
import type { TowerManager } from "../entities/TowerManager";
import type { EffectSystem } from "../systems/EffectSystem";
import type { WorldOverlay } from "../ui/WorldOverlay";
import type { BuildPadRef } from "../map/SceneBuilder";

// Shared references handed to every system. `time` is the accumulated game
// time in seconds (advanced by Game each frame; used for status-effect timers).
export interface GameContext {
  scene: Scene;
  camera: Camera;
  state: GameState;
  path: PathSystem;
  enemies: EnemyManager;
  towers: TowerManager;
  effects: EffectSystem;
  overlay: WorldOverlay;
  pads: BuildPadRef[];
  time: number;
}
