import {
  MeshBuilder,
  TransformNode,
  Mesh,
  Scene,
  StandardMaterial,
} from "../../bjs";
import { flatMat, translucentMat } from "./materials";
import type { TowerConfig, EnemyConfig } from "../../config/types";

export interface TowerVisual {
  root: TransformNode;
  head: TransformNode; // rotates / lunges toward target
  muzzleHeight: number;
}

export interface EnemyVisual {
  root: TransformNode;
  body: TransformNode; // bobs while walking
  topY: number; // for healthbar / floating text anchor
  slowRing: Mesh; // cyan ring at feet while slowed
  freezeBox: Mesh; // translucent ice cube while frozen
}

// --- primitive helpers -----------------------------------------------------
function box(
  scene: Scene,
  parent: TransformNode,
  mat: StandardMaterial,
  w: number,
  h: number,
  d: number,
  pos: [number, number, number]
): Mesh {
  const m = MeshBuilder.CreateBox("b", { width: w, height: h, depth: d }, scene);
  m.material = mat;
  m.parent = parent;
  m.position.set(pos[0], pos[1], pos[2]);
  return m;
}
function sphere(
  scene: Scene,
  parent: TransformNode,
  mat: StandardMaterial,
  d: number,
  pos: [number, number, number],
  segs = 8
): Mesh {
  const m = MeshBuilder.CreateSphere("s", { diameter: d, segments: segs }, scene);
  m.material = mat;
  m.parent = parent;
  m.position.set(pos[0], pos[1], pos[2]);
  return m;
}
function cyl(
  scene: Scene,
  parent: TransformNode,
  mat: StandardMaterial,
  dTop: number,
  dBot: number,
  h: number,
  pos: [number, number, number]
): Mesh {
  const m = MeshBuilder.CreateCylinder(
    "c",
    { diameterTop: dTop, diameterBottom: dBot, height: h, tessellation: 10 },
    scene
  );
  m.material = mat;
  m.parent = parent;
  m.position.set(pos[0], pos[1], pos[2]);
  return m;
}

const EYE = "#1c1c2b";
const GOLD = "#ffcc33";

// ===========================================================================
// TOWERS
// ===========================================================================
export function buildTowerModel(scene: Scene, cfg: TowerConfig): TowerVisual {
  const root = new TransformNode(`tower_${cfg.id}`, scene);
  const tierScale = 1 + (cfg.tier - 1) * 0.08;

  // shared pedestal (glowing base pad)
  const baseMat = flatMat(scene, "#403252", 0.15);
  cyl(scene, root, baseMat, 1.6, 1.9, 0.4, [0, 0.2, 0]);
  const padMat = flatMat(scene, cfg.color, 0.5);
  cyl(scene, root, padMat, 1.4, 1.4, 0.12, [0, 0.42, 0]);

  const head = new TransformNode(`towerHead_${cfg.id}`, scene);
  head.parent = root;
  head.position.y = 0.5;

  const mat = flatMat(scene, cfg.color, 0.3);
  let muzzle = 1.6;

  switch (cfg.model) {
    case "thief": {
      // small masked thief on a post: big head, mask band, back sack
      const skin = flatMat(scene, "#caa472", 0.25);
      cyl(scene, head, mat, 0.45, 0.6, 0.9 * tierScale, [0, 0.5, 0]); // body/cloak
      const headMesh = sphere(scene, head, skin, 0.7 * tierScale, [0, 1.15 * tierScale, 0]);
      box(scene, head, flatMat(scene, "#23203a", 0.2), 0.74 * tierScale, 0.2, 0.4, [0, 1.2 * tierScale, 0.18]); // mask
      sphere(scene, head, flatMat(scene, GOLD, 0.4), 0.5, [-0.45, 0.55, -0.2]); // money bag
      headMesh.scaling.z = 0.85;
      muzzle = 1.2 * tierScale;
      break;
    }
    case "mage_blood":
    case "mage_armor":
    case "mage_slow": {
      // robed mage on a rune disc, floating orb
      const robe = mat;
      cyl(scene, root, flatMat(scene, cfg.color, 0.45), 2.0, 2.0, 0.06, [0, 0.46, 0]); // rune ring
      cyl(scene, head, robe, 0.2, 0.85, 1.1 * tierScale, [0, 0.55, 0]); // robe cone
      sphere(scene, head, flatMat(scene, "#e8d8b0", 0.2), 0.5, [0, 1.2 * tierScale, 0]); // head
      cyl(scene, head, flatMat(scene, cfg.color, 0.4), 0.6, 0.05, 0.5, [0, 1.55 * tierScale, 0]); // hat
      sphere(scene, head, flatMat(scene, cfg.color, 0.8), 0.4, [0, 1.0, 0.55]); // orb
      muzzle = 1.3 * tierScale;
      break;
    }
    case "frost": {
      // stacked ice crystals
      cyl(scene, head, mat, 0.1, 0.9, 0.8 * tierScale, [0, 0.4, 0]);
      cyl(scene, head, flatMat(scene, "#cdeefe", 0.5), 0.05, 0.5, 0.7 * tierScale, [0, 1.0 * tierScale, 0]);
      sphere(scene, head, flatMat(scene, "#e8faff", 0.6), 0.45, [0, 1.4 * tierScale, 0], 6);
      muzzle = 1.4 * tierScale;
      break;
    }
    case "archer": {
      // watchtower with roof + little archer
      cyl(scene, head, flatMat(scene, "#9c7a4d", 0.2), 0.9, 1.0, 1.3 * tierScale, [0, 0.65, 0]);
      cyl(scene, head, flatMat(scene, cfg.color, 0.35), 1.3, 0.05, 0.7, [0, 1.6 * tierScale, 0]); // roof
      sphere(scene, head, flatMat(scene, "#d8c39a", 0.2), 0.45, [0, 1.35 * tierScale, 0.1]); // archer head
      muzzle = 1.55 * tierScale;
      break;
    }
    case "hero":
    default: {
      // bigger figure with weapon + ornate base
      const heroScale = tierScale * 1.25;
      cyl(scene, root, flatMat(scene, GOLD, 0.4), 2.3, 2.3, 0.1, [0, 0.46, 0]);
      box(scene, head, mat, 0.9 * heroScale, 1.2 * heroScale, 0.6, [0, 0.7, 0]); // torso
      sphere(scene, head, flatMat(scene, "#e8d8b0", 0.2), 0.7 * heroScale, [0, 1.55 * heroScale, 0]); // head
      box(scene, head, flatMat(scene, "#cfd8e8", 0.3), 0.12, 1.6 * heroScale, 0.12, [0.7 * heroScale, 1.0, 0]); // weapon shaft
      box(scene, head, flatMat(scene, "#aeb8cc", 0.4), 0.6, 0.5, 0.1, [0.7 * heroScale, 1.8 * heroScale, 0]); // blade
      muzzle = 1.7 * heroScale;
      break;
    }
  }

  return { root, head, muzzleHeight: muzzle };
}

// ===========================================================================
// ENEMIES
// ===========================================================================
export function buildEnemyModel(scene: Scene, cfg: EnemyConfig): EnemyVisual {
  const root = new TransformNode(`enemy_${cfg.id}`, scene);
  const body = new TransformNode(`enemyBody_${cfg.id}`, scene);
  body.parent = root;
  const mat = flatMat(scene, cfg.color, 0.3);
  const s = cfg.scale;
  let topY = 1.6 * s;

  switch (cfg.model) {
    case "runner": {
      box(scene, body, mat, 0.5 * s, 0.7 * s, 0.4 * s, [0, 0.95 * s, 0]); // thin body
      sphere(scene, body, mat, 0.7 * s, [0, 1.5 * s, 0]); // big head
      eyes(scene, body, 0.85 * s, 1.55 * s, 0.3 * s);
      legs(scene, body, mat, 1.0 * s, 0.42 * s); // long legs
      topY = 1.95 * s;
      break;
    }
    case "barrel": {
      cyl(scene, body, flatMat(scene, "#7d8a93", 0.2), 0.95 * s, 1.0 * s, 1.2 * s, [0, 0.85 * s, 0]); // iron drum
      for (let i = 0; i < 3; i++)
        cyl(scene, body, flatMat(scene, "#5a6670", 0.3), 1.04 * s, 1.04 * s, 0.08, [0, (0.5 + i * 0.4) * s, 0]); // hoops
      sphere(scene, body, mat, 0.5 * s, [0, 1.6 * s, 0]); // tiny head
      eyes(scene, body, 0.6 * s, 1.62 * s, 0.28 * s);
      topY = 2.0 * s;
      break;
    }
    case "blob": {
      const belly = sphere(scene, body, mat, 1.5 * s, [0, 0.9 * s, 0]);
      belly.scaling.y = 0.8;
      sphere(scene, body, mat, 0.6 * s, [0, 1.6 * s, 0]); // head
      eyes(scene, body, 0.85 * s, 1.65 * s, 0.26 * s);
      topY = 2.1 * s;
      break;
    }
    case "balloon": {
      const ball = sphere(scene, body, mat, 1.3 * s, [0, 1.3 * s, 0], 10);
      ball.scaling.y = 1.15;
      cyl(scene, body, flatMat(scene, "#6d4c2f", 0.2), 0.5 * s, 0.6 * s, 0.4 * s, [0, 0.45 * s, 0]); // basket
      sphere(scene, body, flatMat(scene, "#caa472", 0.2), 0.45 * s, [0, 0.75 * s, 0]); // pilot
      eyes(scene, body, 0.55 * s, 0.78 * s, 0.22 * s);
      topY = 2.4 * s;
      break;
    }
    case "rune": {
      const core = sphere(scene, body, mat, 0.9 * s, [0, 1.1 * s, 0], 6);
      core.scaling.y = 1.3;
      cyl(scene, body, flatMat(scene, "#e0b3ff", 0.6), 1.6 * s, 1.6 * s, 0.05, [0, 1.1 * s, 0]); // magic ring
      eyes(scene, body, 0.55 * s, 1.2 * s, 0.32 * s);
      topY = 1.9 * s;
      break;
    }
    case "bagthief": {
      box(scene, body, mat, 0.6 * s, 0.8 * s, 0.45 * s, [0, 0.95 * s, 0]);
      sphere(scene, body, flatMat(scene, "#caa472", 0.2), 0.65 * s, [0, 1.55 * s, 0]); // head
      box(scene, body, flatMat(scene, "#23203a", 0.2), 0.68 * s, 0.18, 0.36, [0, 1.6 * s, 0.26]); // mask
      sphere(scene, body, flatMat(scene, GOLD, 0.45), 0.8 * s, [0, 1.1 * s, -0.5 * s]); // huge sack
      legs(scene, body, mat, 0.55 * s, 0.34 * s);
      topY = 2.0 * s;
      break;
    }
    case "boss": {
      const torso = sphere(scene, body, mat, 1.7 * s, [0, 1.5 * s, 0]);
      torso.scaling.y = 1.2;
      sphere(scene, body, flatMat(scene, "#caa472", 0.2), 1.0 * s, [0, 2.6 * s, 0]); // head
      eyes(scene, body, 1.2 * s, 2.7 * s, 0.42 * s);
      // crown
      const crown = new TransformNode("crown", scene);
      crown.parent = body;
      crown.position.y = 3.15 * s;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        cyl(scene, crown, flatMat(scene, GOLD, 0.5), 0.02, 0.16 * s, 0.4 * s, [
          Math.cos(a) * 0.55 * s,
          0.1 * s,
          Math.sin(a) * 0.55 * s,
        ]);
      }
      sphere(scene, body, flatMat(scene, GOLD, 0.45), 1.1 * s, [0, 1.2 * s, -0.9 * s]); // loot sack
      topY = 3.6 * s;
      break;
    }
    case "goblin":
    default: {
      box(scene, body, mat, 0.6 * s, 0.6 * s, 0.45 * s, [0, 0.8 * s, 0]); // body
      sphere(scene, body, mat, 0.8 * s, [0, 1.35 * s, 0]); // big head
      // ears
      cyl(scene, body, mat, 0.02, 0.18 * s, 0.5 * s, [0.45 * s, 1.45 * s, 0]);
      cyl(scene, body, mat, 0.02, 0.18 * s, 0.5 * s, [-0.45 * s, 1.45 * s, 0]);
      eyes(scene, body, 0.85 * s, 1.4 * s, 0.3 * s);
      legs(scene, body, mat, 0.5 * s, 0.32 * s);
      topY = 1.85 * s;
      break;
    }
  }

  // status indicators (disabled by default, toggled by EnemyManager)
  const slowRing = MeshBuilder.CreateTorus("slowRing", { diameter: 1.4 * s, thickness: 0.18, tessellation: 12 }, scene);
  slowRing.material = translucentMat(scene, "#4fd6ff", 0.7, 0.8);
  slowRing.parent = root;
  slowRing.position.y = 0.12;
  slowRing.isPickable = false;
  slowRing.setEnabled(false);

  const freezeBox = MeshBuilder.CreateBox("freezeBox", { size: 1.0 }, scene);
  freezeBox.scaling.set(1.5 * s, topY * 0.95, 1.5 * s);
  freezeBox.material = translucentMat(scene, "#bdeeff", 0.4, 0.6);
  freezeBox.parent = root;
  freezeBox.position.y = topY * 0.5;
  freezeBox.isPickable = false;
  freezeBox.setEnabled(false);

  return { root, body, topY, slowRing, freezeBox };
}

function eyes(scene: Scene, parent: TransformNode, headW: number, y: number, fwd: number): void {
  const em = flatMat(scene, EYE, 0.0);
  sphere(scene, parent, em, 0.18, [headW * 0.18, y, fwd], 6);
  sphere(scene, parent, em, 0.18, [-headW * 0.18, y, fwd], 6);
}

function legs(scene: Scene, parent: TransformNode, mat: StandardMaterial, len: number, spread: number): void {
  box(scene, parent, mat, 0.18, len, 0.18, [spread, len / 2, 0]);
  box(scene, parent, mat, 0.18, len, 0.18, [-spread, len / 2, 0]);
}

export const ModelColors = { GOLD, EYE };
