import { MeshBuilder, TransformNode, Mesh, Scene, Material } from "../../bjs";
import { toonMat, glowMat, translucentMat, applyToonStyle } from "./materials";
import type { TowerConfig, EnemyConfig } from "../../config/types";

export interface TowerVisual {
  root: TransformNode;
  head: TransformNode; // rotates / lunges toward target
  muzzleHeight: number;
}

export interface EnemyVisual {
  root: TransformNode;
  body: TransformNode; // bobs while walking
  topY: number;
  slowRing: Mesh;
  freezeBox: Mesh;
}

// --- primitive helpers (each takes a shared toon/glow material) ------------
function sphere(s: Scene, p: TransformNode, m: Material, d: number, pos: [number, number, number], segs = 12): Mesh {
  const x = MeshBuilder.CreateSphere("s", { diameter: d, segments: segs }, s);
  x.material = m; x.parent = p; x.position.set(pos[0], pos[1], pos[2]);
  return x;
}
function box(s: Scene, p: TransformNode, m: Material, w: number, h: number, d: number, pos: [number, number, number]): Mesh {
  const x = MeshBuilder.CreateBox("b", { width: w, height: h, depth: d }, s);
  x.material = m; x.parent = p; x.position.set(pos[0], pos[1], pos[2]);
  return x;
}
function cyl(s: Scene, p: TransformNode, m: Material, dTop: number, dBot: number, h: number, pos: [number, number, number], tess = 14): Mesh {
  const x = MeshBuilder.CreateCylinder("c", { diameterTop: dTop, diameterBottom: dBot, height: h, tessellation: tess }, s);
  x.material = m; x.parent = p; x.position.set(pos[0], pos[1], pos[2]);
  return x;
}
function cone(s: Scene, p: TransformNode, m: Material, dBot: number, h: number, pos: [number, number, number], tess = 14): Mesh {
  return cyl(s, p, m, 0, dBot, h, pos, tess);
}
function cap(s: Scene, p: TransformNode, m: Material, radius: number, height: number, pos: [number, number, number]): Mesh {
  const x = MeshBuilder.CreateCapsule("cap", { radius, height, tessellation: 10, subdivisions: 1 }, s);
  x.material = m; x.parent = p; x.position.set(pos[0], pos[1], pos[2]);
  return x;
}

const SKIN = "#d8b486";
const DARK = "#231f38";

// cute big eyes with pupil + highlight
function eyes(s: Scene, p: TransformNode, spacing: number, y: number, fwd: number, scale = 1): void {
  const white = toonMat(s, "#ffffff");
  const dark = toonMat(s, DARK);
  const hi = glowMat(s, "#ffffff", 1.6);
  for (const side of [-1, 1]) {
    sphere(s, p, white, 0.34 * scale, [spacing * side, y, fwd], 10);
    sphere(s, p, dark, 0.2 * scale, [spacing * side, y, fwd + 0.1 * scale], 8);
    sphere(s, p, hi, 0.08 * scale, [spacing * side + 0.05 * scale, y + 0.07 * scale, fwd + 0.18 * scale], 6);
  }
}

function pedestal(s: Scene, root: TransformNode, color: string): void {
  cyl(s, root, toonMat(s, "#544a63"), 1.5, 1.95, 0.45, [0, 0.22, 0]);
  cyl(s, root, toonMat(s, "#6a6080"), 1.55, 1.55, 0.12, [0, 0.46, 0]);
  cyl(s, root, glowMat(s, color, 0.9), 1.25, 1.25, 0.06, [0, 0.54, 0]); // glowing rune disc
  // little corner stones
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const r = sphere(s, root, toonMat(s, "#4b4360"), 0.32, [Math.cos(a) * 0.85, 0.34, Math.sin(a) * 0.85], 5);
    r.scaling.y = 0.7;
  }
}

// ===========================================================================
// TOWERS
// ===========================================================================
export function buildTowerModel(scene: Scene, cfg: TowerConfig): TowerVisual {
  const root = new TransformNode(`tower_${cfg.id}`, scene);
  const tier = 1 + (cfg.tier - 1) * 0.07;
  pedestal(scene, root, cfg.color);

  const head = new TransformNode(`towerHead_${cfg.id}`, scene);
  head.parent = root;
  head.position.y = 0.56;

  const body = toonMat(scene, cfg.color);
  const skin = toonMat(scene, SKIN);
  let muzzle = 1.6;

  switch (cfg.model) {
    case "thief": {
      cap(scene, head, body, 0.42 * tier, 1.0 * tier, [0, 0.55 * tier, 0]); // cloaked body
      cap(scene, head, body, 0.13, 0.5, [0.42 * tier, 0.55, 0.25]); // arm
      cap(scene, head, body, 0.13, 0.5, [-0.42 * tier, 0.55, 0.25]);
      sphere(scene, head, skin, 0.7 * tier, [0, 1.2 * tier, 0]); // head
      cone(scene, head, body, 0.78 * tier, 0.7 * tier, [0, 1.62 * tier, 0]); // hood
      box(scene, head, toonMat(scene, DARK), 0.8 * tier, 0.22, 0.42, [0, 1.22 * tier, 0.14]); // mask band
      // glowing eye slits
      box(scene, head, glowMat(scene, "#9ff0ff", 1.8), 0.16, 0.06, 0.05, [0.16, 1.24 * tier, 0.4]);
      box(scene, head, glowMat(scene, "#9ff0ff", 1.8), 0.16, 0.06, 0.05, [-0.16, 1.24 * tier, 0.4]);
      sphere(scene, head, glowMat(scene, "#ffcf3a", 0.8), 0.55, [-0.5, 0.6, -0.32]); // money bag
      box(scene, head, toonMat(scene, "#d8dde8"), 0.07, 0.5, 0.12, [0.55, 0.7, 0.35]); // dagger
      box(scene, head, toonMat(scene, "#aeb6c8"), 0.12, 0.18, 0.14, [0.55, 1.0, 0.35]);
      muzzle = 1.35 * tier;
      break;
    }
    case "mage_blood":
    case "mage_armor":
    case "mage_slow": {
      cone(scene, head, body, 0.95, 1.25 * tier, [0, 0.62, 0]); // robe
      sphere(scene, head, skin, 0.5, [0, 1.2 * tier, 0]); // head
      cone(scene, head, body, 0.7, 0.85 * tier, [0, 1.62 * tier, 0]); // wizard hat
      sphere(scene, head, glowMat(scene, cfg.color, 0.6), 0.18, [0, 2.0 * tier, 0]); // hat tip glow
      cap(scene, head, toonMat(scene, "#eef0f5"), 0.18, 0.5, [0, 0.95, 0.32]); // beard
      eyes(scene, head, 0.16, 1.24 * tier, 0.34, 0.7);
      cyl(scene, head, toonMat(scene, "#7a5230"), 0.07, 0.07, 1.7, [0.55, 1.0, 0.1]); // staff
      sphere(scene, head, glowMat(scene, cfg.color, 1.8), 0.42, [0.55, 1.95, 0.1]); // orb
      cyl(scene, root, glowMat(scene, cfg.color, 0.7), 2.1, 2.1, 0.05, [0, 0.5, 0]); // rune ring
      muzzle = 1.95 * tier;
      break;
    }
    case "frost": {
      const ice = toonMat(scene, "#aee6ff");
      cone(scene, head, ice, 0.9, 1.0 * tier, [0, 0.5, 0]);
      const c1 = cone(scene, head, ice, 0.55, 1.1 * tier, [0, 1.15 * tier, 0]); c1.convertToFlatShadedMesh();
      const core = sphere(scene, head, glowMat(scene, "#bfeeff", 1.6), 0.5, [0, 1.2 * tier, 0], 8); core.convertToFlatShadedMesh();
      // orbiting shards
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const sh = cone(scene, head, glowMat(scene, "#e8faff", 1.2), 0.18, 0.7, [Math.cos(a) * 0.9, 1.0, Math.sin(a) * 0.9]);
        sh.convertToFlatShadedMesh(); sh.rotation.z = a;
      }
      eyes(scene, head, 0.15, 1.25 * tier, 0.4, 0.6);
      muzzle = 1.5 * tier;
      break;
    }
    case "archer": {
      cyl(scene, head, toonMat(scene, "#9c7a4d"), 0.85, 1.0, 1.3 * tier, [0, 0.7, 0]); // tower post
      for (let i = 0; i < 3; i++) cyl(scene, head, toonMat(scene, "#7a5e38"), 1.02, 1.02, 0.08, [0, 0.4 + i * 0.45, 0]); // planks
      const roof = cone(scene, head, body, 1.5, 0.8, [0, 1.75 * tier, 0]); roof.convertToFlatShadedMesh();
      sphere(scene, head, glowMat(scene, "#ffe27a", 1.2), 0.16, [0, 2.2 * tier, 0]); // finial
      sphere(scene, head, toonMat(scene, SKIN), 0.42, [0, 1.4 * tier, 0.15]); // archer
      eyes(scene, head, 0.13, 1.42 * tier, 0.42, 0.55);
      const bow = MeshBuilder.CreateTorus("bow", { diameter: 0.7, thickness: 0.07, tessellation: 12 }, scene);
      bow.material = toonMat(scene, "#6a4a28"); bow.parent = head; bow.position.set(0.4, 1.35, 0.3); bow.rotation.y = Math.PI / 2;
      muzzle = 1.6 * tier;
      break;
    }
    case "hero":
    default: {
      const hs = tier * 1.3;
      cyl(scene, root, glowMat(scene, "#ffcf3a", 0.7), 2.3, 2.3, 0.07, [0, 0.5, 0]);
      box(scene, head, toonMat(scene, "#b0b8cc"), 0.95 * hs, 1.2 * hs, 0.6, [0, 0.75, 0]); // armored torso
      sphere(scene, head, toonMat(scene, "#cfd6e6"), 0.45 * hs, [0.6 * hs, 1.2, 0]); // pauldrons
      sphere(scene, head, toonMat(scene, "#cfd6e6"), 0.45 * hs, [-0.6 * hs, 1.2, 0]);
      sphere(scene, head, toonMat(scene, SKIN), 0.6 * hs, [0, 1.7 * hs, 0]); // head
      cyl(scene, head, toonMat(scene, "#c0c8da"), 0.66 * hs, 0.6 * hs, 0.45, [0, 2.0 * hs, 0]); // helmet
      cone(scene, head, glowMat(scene, cfg.color, 1.0), 0.18, 0.5, [0, 2.4 * hs, 0]); // plume
      eyes(scene, head, 0.16, 1.7 * hs, 0.5, 0.7);
      // greatsword
      box(scene, head, toonMat(scene, "#7a5230"), 0.16, 0.5, 0.16, [0.85 * hs, 0.9, 0]); // grip
      box(scene, head, toonMat(scene, "#5a6478"), 0.6, 0.14, 0.14, [0.85 * hs, 1.2, 0]); // crossguard
      box(scene, head, toonMat(scene, "#e6ecf6"), 0.22, 1.7 * hs, 0.1, [0.85 * hs, 2.1, 0]); // blade
      sphere(scene, head, glowMat(scene, cfg.color, 1.6), 0.22, [0.85 * hs, 1.0, 0]); // pommel gem
      muzzle = 1.9 * hs;
      break;
    }
  }

  applyToonStyle(root, 0.05);
  return { root, head, muzzleHeight: muzzle };
}

// ===========================================================================
// ENEMIES
// ===========================================================================
export function buildEnemyModel(scene: Scene, cfg: EnemyConfig): EnemyVisual {
  const root = new TransformNode(`enemy_${cfg.id}`, scene);
  const body = new TransformNode(`enemyBody_${cfg.id}`, scene);
  body.parent = root;
  const m = toonMat(scene, cfg.color);
  const s = cfg.scale;
  let topY = 1.7 * s;

  switch (cfg.model) {
    case "runner": {
      cap(scene, body, m, 0.28 * s, 0.7 * s, [0, 1.1 * s, 0]); // slim torso
      sphere(scene, body, m, 0.66 * s, [0, 1.6 * s, 0]); // head
      box(scene, body, toonMat(scene, "#3df6ff"), 0.7 * s, 0.22 * s, 0.1, [0, 1.62 * s, 0.3 * s]); // goggles band
      sphere(scene, body, glowMat(scene, "#3df6ff", 1.4), 0.2 * s, [0.18 * s, 1.62 * s, 0.34 * s], 8);
      sphere(scene, body, glowMat(scene, "#3df6ff", 1.4), 0.2 * s, [-0.18 * s, 1.62 * s, 0.34 * s], 8);
      cap(scene, body, m, 0.1 * s, 0.9 * s, [0.22 * s, 0.5 * s, 0]); // long legs
      cap(scene, body, m, 0.1 * s, 0.9 * s, [-0.22 * s, 0.5 * s, 0]);
      cap(scene, body, m, 0.09 * s, 0.6 * s, [0.4 * s, 1.1 * s, -0.1]); // arms back
      cap(scene, body, m, 0.09 * s, 0.6 * s, [-0.4 * s, 1.1 * s, -0.1]);
      topY = 2.0 * s;
      break;
    }
    case "barrel": {
      const drum = cyl(scene, body, toonMat(scene, "#8b97a2"), 0.95 * s, 1.0 * s, 1.3 * s, [0, 0.95 * s, 0]);
      for (let i = 0; i < 3; i++) cyl(scene, body, toonMat(scene, "#566069"), 1.05 * s, 1.05 * s, 0.1, [0, (0.55 + i * 0.42) * s, 0]); // hoops
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; sphere(scene, body, glowMat(scene, "#cdd6df", 0.4), 0.12 * s, [Math.cos(a) * 0.5 * s, 0.95 * s, Math.sin(a) * 0.5 * s], 5); } // rivets
      sphere(scene, body, m, 0.5 * s, [0, 1.75 * s, 0]); // head poking out
      eyes(scene, body, 0.16 * s, 1.78 * s, 0.28 * s, s * 0.8);
      box(scene, body, toonMat(scene, DARK), 0.5 * s, 0.06, 0.05, [0, 1.95 * s, 0.28 * s]); // angry brow
      box(scene, body, m, 0.22 * s, 0.3 * s, 0.22 * s, [0.35 * s, 0.2 * s, 0]); // feet
      box(scene, body, m, 0.22 * s, 0.3 * s, 0.22 * s, [-0.35 * s, 0.2 * s, 0]);
      drum.convertToFlatShadedMesh();
      topY = 2.2 * s;
      break;
    }
    case "blob": {
      const belly = sphere(scene, body, m, 1.7 * s, [0, 0.95 * s, 0], 14); belly.scaling.y = 0.85;
      sphere(scene, body, m, 0.7 * s, [0, 1.75 * s, 0]); // head
      eyes(scene, body, 0.22 * s, 1.8 * s, 0.3 * s, s);
      box(scene, body, toonMat(scene, "#2a1a1a"), 0.5 * s, 0.16 * s, 0.1, [0, 1.5 * s, 0.55 * s]); // wide mouth
      cap(scene, body, m, 0.16 * s, 0.4 * s, [0.85 * s, 0.7 * s, 0]); // stubby arms
      cap(scene, body, m, 0.16 * s, 0.4 * s, [-0.85 * s, 0.7 * s, 0]);
      topY = 2.3 * s;
      break;
    }
    case "balloon": {
      const ball = sphere(scene, body, m, 1.5 * s, [0, 1.6 * s, 0], 16); ball.scaling.y = 1.2;
      sphere(scene, body, glowMat(scene, cfg.color, 0.5), 0.35 * s, [0, 2.55 * s, 0], 8); // glossy top
      cyl(scene, body, toonMat(scene, "#7a5230"), 0.5 * s, 0.6 * s, 0.45 * s, [0, 0.5 * s, 0]); // basket
      for (const sx of [-1, 1]) cyl(scene, body, toonMat(scene, "#caa063"), 0.03, 0.03, 1.0 * s, [sx * 0.35 * s, 1.0 * s, 0]); // ropes
      sphere(scene, body, toonMat(scene, SKIN), 0.42 * s, [0, 0.85 * s, 0]); // pilot
      eyes(scene, body, 0.13 * s, 0.88 * s, 0.3 * s, s * 0.6);
      cyl(scene, body, glowMat(scene, "#ff5a5a", 0.8), 0.0, 0.4 * s, 0.3 * s, [0, 1.15 * s, 0]); // propeller-cap
      topY = 2.7 * s;
      break;
    }
    case "rune": {
      cone(scene, body, m, 0.9 * s, 1.4 * s, [0, 1.0 * s, 0]); // floating robe
      sphere(scene, body, toonMat(scene, "#120e22"), 0.55 * s, [0, 1.6 * s, 0]); // dark hood void
      sphere(scene, body, glowMat(scene, "#d0a0ff", 1.8), 0.16 * s, [0.16 * s, 1.62 * s, 0.32 * s], 6); // glowing eyes
      sphere(scene, body, glowMat(scene, "#d0a0ff", 1.8), 0.16 * s, [-0.16 * s, 1.62 * s, 0.32 * s], 6);
      const ring = MeshBuilder.CreateTorus("rring", { diameter: 1.8 * s, thickness: 0.08, tessellation: 20 }, scene);
      ring.material = glowMat(scene, "#c98aff", 1.4); ring.parent = body; ring.position.y = 1.0 * s; ring.rotation.x = 0.4;
      topY = 2.0 * s;
      break;
    }
    case "bagthief": {
      cap(scene, body, m, 0.35 * s, 0.8 * s, [0, 1.0 * s, 0]);
      sphere(scene, body, toonMat(scene, SKIN), 0.6 * s, [0, 1.6 * s, 0]); // head
      box(scene, body, toonMat(scene, DARK), 0.66 * s, 0.2, 0.05, [0, 1.62 * s, 0.3 * s]); // mask
      sphere(scene, body, glowMat(scene, "#fff2a8", 1.6), 0.1 * s, [0.16 * s, 1.6 * s, 0.34 * s], 6);
      sphere(scene, body, glowMat(scene, "#fff2a8", 1.6), 0.1 * s, [-0.16 * s, 1.6 * s, 0.34 * s], 6);
      const sack = sphere(scene, body, glowMat(scene, "#ffcf3a", 0.7), 1.0 * s, [0, 1.2 * s, -0.6 * s], 12); sack.scaling.z = 0.9;
      cyl(scene, body, toonMat(scene, "#caa063"), 0.06, 0.06, 0.5 * s, [0, 1.85 * s, -0.6 * s]); // sack tie
      cap(scene, body, m, 0.12 * s, 0.5 * s, [0.2 * s, 0.4 * s, 0]); cap(scene, body, m, 0.12 * s, 0.5 * s, [-0.2 * s, 0.4 * s, 0]);
      topY = 2.1 * s;
      break;
    }
    case "boss": {
      const torso = sphere(scene, body, m, 1.9 * s, [0, 1.5 * s, 0], 16); torso.scaling.y = 1.15;
      sphere(scene, body, m, 1.0 * s, [0, 2.7 * s, 0]); // head
      eyes(scene, body, 0.3 * s, 2.8 * s, 0.45 * s, s * 1.1);
      box(scene, body, toonMat(scene, "#2a1010"), 0.7 * s, 0.2 * s, 0.1, [0, 2.4 * s, 0.55 * s]); // grin
      for (const fx of [-0.18, 0.18]) cone(scene, body, toonMat(scene, "#fff"), 0.12 * s, 0.22 * s, [fx * s, 2.32 * s, 0.55 * s]); // fangs
      // spiky shoulders
      for (const sx of [-1, 1]) { sphere(scene, body, toonMat(scene, "#7a2010"), 0.7 * s, [sx * 1.2 * s, 1.9 * s, 0], 8); cone(scene, body, toonMat(scene, "#caa"), 0.25 * s, 0.6 * s, [sx * 1.2 * s, 2.4 * s, 0]); }
      // crown
      const crown = new TransformNode("crown", scene); crown.parent = body; crown.position.y = 3.35 * s;
      cyl(scene, crown, glowMat(scene, "#ffcf3a", 0.8), 1.0 * s, 1.0 * s, 0.2 * s, [0, 0, 0]);
      for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; cone(scene, crown, glowMat(scene, "#ffd84a", 0.9), 0.16 * s, 0.4 * s, [Math.cos(a) * 0.5 * s, 0.25 * s, Math.sin(a) * 0.5 * s]); }
      sphere(scene, body, glowMat(scene, "#ffcf3a", 0.6), 1.2 * s, [0, 1.3 * s, -0.95 * s], 12); // loot sack
      cap(scene, body, m, 0.4 * s, 1.0 * s, [1.7 * s, 0.9 * s, 0]); // club arm
      sphere(scene, body, toonMat(scene, "#6a3520"), 0.7 * s, [2.1 * s, 1.5 * s, 0], 8); // club head
      topY = 4.0 * s;
      break;
    }
    case "goblin":
    default: {
      const belly = sphere(scene, body, m, 0.95 * s, [0, 0.85 * s, 0], 12); belly.scaling.y = 0.9;
      sphere(scene, body, m, 0.85 * s, [0, 1.5 * s, 0]); // big head
      // big ears
      for (const sx of [-1, 1]) { const ear = cone(scene, body, m, 0.22 * s, 0.6 * s, [sx * 0.5 * s, 1.6 * s, 0]); ear.rotation.z = sx * 1.1; }
      cone(scene, body, m, 0.2 * s, 0.45 * s, [0, 1.42 * s, 0.42 * s]); // big nose
      eyes(scene, body, 0.26 * s, 1.55 * s, 0.36 * s, s);
      box(scene, body, toonMat(scene, "#2a1a1a"), 0.4 * s, 0.1 * s, 0.08, [0, 1.25 * s, 0.42 * s]); // mouth
      cone(scene, body, toonMat(scene, "#fff"), 0.07 * s, 0.16 * s, [0.1 * s, 1.3 * s, 0.45 * s]); // snaggle tooth
      box(scene, body, toonMat(scene, "#7a4a28"), 0.6 * s, 0.4 * s, 0.5 * s, [0, 0.45 * s, 0]); // loincloth
      cap(scene, body, m, 0.13 * s, 0.45 * s, [0.32 * s, 0.3 * s, 0]); cap(scene, body, m, 0.13 * s, 0.45 * s, [-0.32 * s, 0.3 * s, 0]); // legs
      cap(scene, body, m, 0.11 * s, 0.4 * s, [0.5 * s, 0.85 * s, 0]); cap(scene, body, m, 0.11 * s, 0.4 * s, [-0.5 * s, 0.85 * s, 0]); // arms
      topY = 2.0 * s;
      break;
    }
  }

  // status indicators (excluded from outline/shadow by translucency)
  const slowRing = MeshBuilder.CreateTorus("slowRing", { diameter: 1.5 * s, thickness: 0.18, tessellation: 16 }, scene);
  slowRing.material = translucentMat(scene, "#4fd6ff", 0.7, 0.9);
  slowRing.parent = root; slowRing.position.y = 0.12; slowRing.isPickable = false; slowRing.setEnabled(false);

  const freezeBox = MeshBuilder.CreateBox("freezeBox", { size: 1 }, scene);
  freezeBox.scaling.set(1.6 * s, topY * 0.95, 1.6 * s);
  freezeBox.material = translucentMat(scene, "#bdeeff", 0.42, 0.7);
  freezeBox.parent = root; freezeBox.position.y = topY * 0.5; freezeBox.isPickable = false; freezeBox.setEnabled(false);

  applyToonStyle(root, 0.04 * s);
  return { root, body, topY, slowRing, freezeBox };
}

export const ModelColors = { GOLD: "#ffcf3a" };
