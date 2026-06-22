import { MeshBuilder, TransformNode, Scene, Mesh } from "../bjs";
import { instantiate, AnimController, Slot, hasModel } from "./Assets";
import { addShadowCaster } from "./shadows";
import { toonMat, glowMat, translucentMat, applyToonStyle } from "../entities/models/materials";

// characters: cast + receive shadows, but no heavy outline (looks bad on detailed skinned meshes)
function shadowsOnly(root: TransformNode): void {
  for (const m of root.getChildMeshes(false)) {
    if (m.getTotalVertices() === 0) continue;
    m.receiveShadows = true;
    addShadowCaster(m);
  }
}
import { buildEnemyModel, buildTowerModel } from "../entities/models/ModelFactory";
import type { TowerVisual, EnemyVisual } from "../entities/models/ModelFactory";
import type { EnemyConfig, TowerConfig } from "../config/types";

interface EnemyReg { slot: Slot; height: number; move: string[]; death: string[]; yaw: number; }
interface TowerReg { slot: Slot; height: number; idle: string[]; attack: string[]; death: string[]; yaw: number; }

const DEATH = ["Death"];

// enemy config id -> CC0 Warcraft-flavored monster + clip mapping
const ENEMY: Record<string, EnemyReg> = {
  enemy_normal_01: { slot: "enemy_goblin", height: 1.8, move: ["Walk"], death: DEATH, yaw: Math.PI },
  enemy_fast_01: { slot: "enemy_werewolf", height: 1.6, move: ["Gallop", "Run", "Walk"], death: DEATH, yaw: Math.PI },
  enemy_armor_01: { slot: "enemy_orc", height: 1.9, move: ["Walk"], death: DEATH, yaw: Math.PI },
  enemy_tank_01: { slot: "enemy_ogre", height: 2.7, move: ["Walk"], death: DEATH, yaw: Math.PI },
  enemy_flying_01: { slot: "enemy_bat", height: 1.7, move: ["Flying", "Fast_Flying"], death: DEATH, yaw: Math.PI },
  enemy_magic_01: { slot: "enemy_necromancer", height: 2.0, move: ["Walk"], death: DEATH, yaw: Math.PI },
  enemy_lowvalue_01: { slot: "enemy_spider", height: 1.1, move: ["Spider_Walk", "Walk"], death: ["Spider_Death", "Death"], yaw: Math.PI },
  enemy_thief_01: { slot: "enemy_skeleton", height: 1.8, move: ["Run", "Walk"], death: DEATH, yaw: Math.PI },
  enemy_boss_01: { slot: "enemy_demon", height: 3.4, move: ["Walk"], death: DEATH, yaw: Math.PI },
  enemy_boss_02: { slot: "enemy_dragon", height: 4.4, move: ["Dragon_Flying", "Flying"], death: ["Dragon_Death", "Death"], yaw: Math.PI },
};

// tower model key -> CC0 model + clip mapping
const TOWER: Record<string, TowerReg> = {
  thief: { slot: "tower_rogue", height: 1.9, idle: ["Idle"], attack: ["Punch", "Sword_Slash"], death: DEATH, yaw: Math.PI },
  hero: { slot: "tower_knight", height: 2.2, idle: ["Idle_Sword", "Idle"], attack: ["Sword_Slash", "Punch"], death: DEATH, yaw: Math.PI },
  mage_blood: { slot: "tower_wizard", height: 1.9, idle: ["Idle"], attack: [], death: DEATH, yaw: Math.PI },
  mage_armor: { slot: "tower_wizard", height: 1.9, idle: ["Idle"], attack: [], death: DEATH, yaw: Math.PI },
  mage_slow: { slot: "tower_wizard", height: 1.9, idle: ["Idle"], attack: [], death: DEATH, yaw: Math.PI },
  frost: { slot: "tower_wizard", height: 1.9, idle: ["Idle"], attack: [], death: DEATH, yaw: Math.PI },
  archer: { slot: "tower_archer", height: 1.9, idle: ["Idle"], attack: [], death: DEATH, yaw: Math.PI },
};

function statusMeshes(scene: Scene, root: TransformNode, height: number): { slowRing: Mesh; freezeBox: Mesh } {
  const slowRing = MeshBuilder.CreateTorus("slowRing", { diameter: height * 0.85, thickness: 0.16, tessellation: 16 }, scene);
  slowRing.material = translucentMat(scene, "#4fd6ff", 0.7, 0.9);
  slowRing.parent = root; slowRing.position.y = 0.12; slowRing.isPickable = false; slowRing.setEnabled(false);
  const freezeBox = MeshBuilder.CreateBox("freezeBox", { size: 1 }, scene);
  freezeBox.scaling.set(height * 0.7, height * 0.95, height * 0.7);
  freezeBox.material = translucentMat(scene, "#bdeeff", 0.42, 0.7);
  freezeBox.parent = root; freezeBox.position.y = height * 0.5; freezeBox.isPickable = false; freezeBox.setEnabled(false);
  return { slowRing, freezeBox };
}

export function buildEnemyGlb(scene: Scene, cfg: EnemyConfig): EnemyVisual {
  const reg = ENEMY[cfg.id] ?? ENEMY.enemy_normal_01;
  if (!hasModel(reg.slot)) return buildEnemyModel(scene, cfg); // procedural fallback
  const height = reg.height * (cfg.scale / 1.0) * 0.7 + reg.height * 0.3; // gentle scale influence
  const root = new TransformNode(`enemy_${cfg.id}`, scene);
  const body = new TransformNode(`enemyBody_${cfg.id}`, scene);
  body.parent = root;
  const inst = instantiate(reg.slot, height, body);
  inst.modelRoot.rotation.y = reg.yaw;
  shadowsOnly(inst.modelRoot);
  const { slowRing, freezeBox } = statusMeshes(scene, root, height);
  const anim = new AnimController(inst.anims);
  anim.play(reg.move, true);
  return { root, body, topY: height + 0.3, slowRing, freezeBox, limbs: [], anim, moveClips: reg.move, deathClips: reg.death };
}

export function buildTowerGlb(scene: Scene, cfg: TowerConfig): TowerVisual {
  const reg = TOWER[cfg.model] ?? TOWER.thief;
  if (!hasModel(reg.slot)) return buildTowerModel(scene, cfg); // procedural fallback
  const root = new TransformNode(`tower_${cfg.id}`, scene);
  // glb stone platform base (fallback to a simple disc) + colored glow ring
  let baseTop = 0.5;
  if (hasModel("prop_platform")) {
    const pinst = instantiate("prop_platform", 0.5, root);
    applyToonStyle(root, 0.03);
    baseTop = pinst.height;
  } else {
    cyl(scene, root, toonMat(scene, "#544a63"), 1.5, 1.95, 0.45, 0.22);
    applyToonStyle(root, 0.05);
  }
  const ring = cyl(scene, root, glowMat(scene, cfg.color, 0.9), 1.3, 1.3, 0.06, baseTop + 0.02);
  ring.renderOutline = false;

  const head = new TransformNode(`towerHead_${cfg.id}`, scene);
  head.parent = root; head.position.y = baseTop;
  const height = reg.height + (cfg.tier - 1) * 0.12;
  const inst = instantiate(reg.slot, height, head);
  inst.modelRoot.rotation.y = reg.yaw;
  shadowsOnly(inst.modelRoot);
  const anim = new AnimController(inst.anims);
  anim.play(reg.idle, true);
  return { root, head, muzzleHeight: height * 0.7 + baseTop, anim };
}

export function towerAttackClips(model: string): string[] {
  return (TOWER[model] ?? TOWER.thief).attack;
}
export function towerIdleClips(model: string): string[] {
  return (TOWER[model] ?? TOWER.thief).idle;
}

function cyl(s: Scene, p: TransformNode, m: import("../bjs").Material, dTop: number, dBot: number, h: number, y: number): Mesh {
  const x = MeshBuilder.CreateCylinder("c", { diameterTop: dTop, diameterBottom: dBot, height: h, tessellation: 16 }, s);
  x.material = m; x.parent = p; x.position.y = y;
  return x;
}
