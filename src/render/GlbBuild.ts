import { MeshBuilder, TransformNode, Scene, Mesh } from "../bjs";
import { instantiate, AnimController, Slot, hasModel } from "./Assets";
import { addShadowCaster } from "./shadows";
import { translucentMat } from "../entities/models/materials";
import { tintModel } from "./Tint";
import type { ProceduralAnim } from "./ProceduralAnim";

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
  enemy_normal_01: { slot: "enemy_goblin", height: 1.8, move: ["Walk"], death: DEATH, yaw: 0 },
  enemy_fast_01: { slot: "enemy_werewolf", height: 1.6, move: ["Gallop", "Run", "Walk"], death: DEATH, yaw: 0 },
  enemy_armor_01: { slot: "enemy_orc", height: 1.9, move: ["Walk"], death: DEATH, yaw: 0 },
  enemy_tank_01: { slot: "enemy_ogre", height: 2.7, move: ["Walk"], death: DEATH, yaw: 0 },
  enemy_flying_01: { slot: "enemy_bat", height: 1.7, move: ["Flying", "Fast_Flying"], death: DEATH, yaw: 0 },
  enemy_magic_01: { slot: "enemy_necromancer", height: 2.0, move: ["Walk"], death: DEATH, yaw: 0 },
  enemy_lowvalue_01: { slot: "enemy_spider", height: 1.1, move: ["Spider_Walk", "Walk"], death: ["Spider_Death", "Death"], yaw: 0 },
  enemy_thief_01: { slot: "enemy_skeleton", height: 1.8, move: ["Run", "Walk"], death: ["Death", "Dea"], yaw: 0 },
  enemy_boss_01: { slot: "enemy_demon", height: 3.4, move: ["Walk"], death: DEATH, yaw: 0 },
  enemy_boss_02: { slot: "enemy_dragon", height: 4.4, move: ["Dragon_Flying", "Flying"], death: ["Dragon_Death", "Death"], yaw: 0 },
};

// tower model key -> CC0 model + clip mapping
const TOWER: Record<string, TowerReg> = {
  thief: { slot: "tower_rogue", height: 1.9, idle: ["Idle"], attack: ["Punch", "Sword_Slash"], death: DEATH, yaw: 0 },
  hero: { slot: "tower_knight", height: 2.2, idle: ["Idle_Sword", "Idle"], attack: ["Sword_Slash", "Punch"], death: DEATH, yaw: 0 },
  mage_blood: { slot: "tower_wizard", height: 1.9, idle: ["Idle"], attack: [], death: DEATH, yaw: 0 },
  mage_armor: { slot: "tower_wizard", height: 1.9, idle: ["Idle"], attack: [], death: DEATH, yaw: 0 },
  mage_slow: { slot: "tower_wizard", height: 1.9, idle: ["Idle"], attack: [], death: DEATH, yaw: 0 },
  frost: { slot: "tower_wizard", height: 1.9, idle: ["Idle"], attack: [], death: DEATH, yaw: 0 },
  archer: { slot: "tower_archer", height: 1.9, idle: ["Idle"], attack: [], death: DEATH, yaw: 0 },
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

// Tower visual with an optional procedural animator (for towers whose GLB has
// no skeletal animation — wizard/archer — and every primitive fallback tower).
// The Tower attaches `proc` itself once it knows its uid.
export interface TowerVisualExt extends TowerVisual {
  proc?: ProceduralAnim;
}

export function buildTowerGlb(scene: Scene, cfg: TowerConfig): TowerVisualExt {
  const reg = TOWER[cfg.model] ?? TOWER.thief;
  if (!hasModel(reg.slot)) return buildTowerModel(scene, cfg); // procedural fallback
  const root = new TransformNode(`tower_${cfg.id}`, scene);
  // The scene build-pad (stone ring + rune disc) is the tower's base now, so no
  // per-tower platform mesh and no extra glow ring (it z-fought the pad disc).
  // Feet sit at the root origin; element identity comes from the robe tint.
  const baseTop = 0;

  const head = new TransformNode(`towerHead_${cfg.id}`, scene);
  head.parent = root; head.position.y = baseTop;
  const height = reg.height + (cfg.tier - 1) * 0.12;
  // the 4 wizard variants share tower_wizard.glb and must be recolored per
  // instance, so clone meshes (real Mesh) rather than share via InstancedMesh
  const needsTint = reg.slot === "tower_wizard";
  const inst = instantiate(reg.slot, height, head, needsTint);
  inst.modelRoot.rotation.y = reg.yaw;
  shadowsOnly(inst.modelRoot);
  if (needsTint) {
    // recolor the robe (Atlas_Diffuse) by element color
    tintModel(inst.modelRoot, ["Atlas_Diffuse"], cfg.color, 0.85);
    // the wizard GLB bakes in a flat "Atlas_Unlit" decal plane that renders as
    // an ugly light rectangle on the ground now that the tower sits at y=0 —
    // hide it (real shadows already ground the tower).
    for (const m of inst.modelRoot.getChildMeshes(false)) {
      if (m.material && m.material.name.startsWith("Atlas_Unlit")) m.setEnabled(false);
    }
  }
  const skinned = inst.anims.length > 0;
  const anim = skinned ? new AnimController(inst.anims) : undefined;
  anim?.play(reg.idle, true);
  return { root, head, muzzleHeight: height * 0.7 + baseTop, anim };
}

export function towerAttackClips(model: string): string[] {
  return (TOWER[model] ?? TOWER.thief).attack;
}
export function towerIdleClips(model: string): string[] {
  return (TOWER[model] ?? TOWER.thief).idle;
}
