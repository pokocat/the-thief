import {
  MeshBuilder,
  Vector3,
  Color4,
  Scene,
  Mesh,
  TransformNode,
  ParticleSystem,
} from "../bjs";
import { flatMat, toonMat, glowMat, translucentMat, applyToonStyle, softCircleTexture, bumpyMat } from "../entities/models/materials";
import { PathSystem } from "./PathSystem";
import type { MapData } from "../config/types";
import { randRange, rand } from "../util/math";

export interface BuildPadRef {
  index: number;
  mesh: Mesh;
  position: Vector3;
  occupied: boolean;
}

export class SceneBuilder {
  pads: BuildPadRef[] = [];

  constructor(private scene: Scene, private map: MapData, private path: PathSystem) {}

  build(): void {
    this.buildIsland();
    this.buildPathTiles();
    this.buildPads();
    this.buildSpawnPortal();
    this.buildGoalCrystal();
    this.scatterDecorations();
    this.fireflies();
  }

  private buildIsland(): void {
    const b = this.map.bounds;
    const w = b.maxX - b.minX + 6;
    const d = b.maxZ - b.minZ + 6;
    const cx = (b.maxX + b.minX) / 2;
    const cz = (b.maxZ + b.minZ) / 2;

    const top = MeshBuilder.CreateBox("islandTop", { width: w, height: 1, depth: d }, this.scene);
    top.position.set(cx, -0.5, cz);
    top.material = bumpyMat(this.scene, "#5fa03e", 14, 0.5);
    top.receiveShadows = true;
    top.isPickable = false;

    const rim = MeshBuilder.CreateBox("rim", { width: w + 1.4, height: 0.5, depth: d + 1.4 }, this.scene);
    rim.position.set(cx, -0.95, cz);
    rim.material = flatMat(this.scene, "#74b84e", 0.14);
    rim.isPickable = false;

    // water moat ring (translucent, glowing edge)
    const moat = MeshBuilder.CreateDisc("moat", { radius: Math.max(w, d) * 0.62, tessellation: 48 }, this.scene);
    moat.rotation.x = Math.PI / 2;
    moat.position.set(cx, -1.15, cz);
    moat.material = translucentMat(this.scene, "#3fb6e8", 0.55, 0.5);
    moat.isPickable = false;

    // floating rock underside
    const under = MeshBuilder.CreateCylinder("under", { diameterTop: Math.max(w, d), diameterBottom: 3, height: 9, tessellation: 7 }, this.scene);
    under.position.set(cx, -5.5, cz);
    under.material = toonMat(this.scene, "#6a5236");
    under.convertToFlatShadedMesh();
    under.isPickable = false;
  }

  private buildPathTiles(): void {
    const total = this.path.totalLength;
    const step = 1.1;
    const out = new Vector3();
    let i = 0;
    for (let dist = 0; dist <= total; dist += step) {
      const heading = this.path.sample(dist, out, 0.07);
      const tile = MeshBuilder.CreateBox("path", { width: this.map.pathWidth, height: 0.16, depth: step + 0.12 }, this.scene);
      tile.position.copyFrom(out);
      tile.rotation.y = heading;
      tile.material = bumpyMat(this.scene, i % 2 === 0 ? "#c2a878" : "#b09668", 1, 0.5);
      tile.receiveShadows = true;
      tile.isPickable = false;
      i++;
    }
  }

  private buildPads(): void {
    this.map.buildPoints.forEach((p, index) => {
      const pad = MeshBuilder.CreateCylinder(`pad_${index}`, { diameterTop: 1.9, diameterBottom: 2.05, height: 0.3, tessellation: 16 }, this.scene);
      pad.position.set(p.x, 0.15, p.z);
      pad.material = toonMat(this.scene, "#3f7fa0");
      pad.receiveShadows = true;
      pad.metadata = { kind: "pad", index };
      const glow = MeshBuilder.CreateCylinder(`padGlow_${index}`, { diameterTop: 1.45, diameterBottom: 1.45, height: 0.06, tessellation: 16 }, this.scene);
      glow.position.set(p.x, 0.32, p.z);
      glow.material = glowMat(this.scene, "#7fe8ff", 0.9);
      glow.isPickable = false;
      glow.parent = pad;
      this.pads.push({ index, mesh: pad, position: new Vector3(p.x, 0.45, p.z), occupied: false });
    });
  }

  private buildSpawnPortal(): void {
    const sp = this.map.spawn;
    const root = new TransformNode("spawnPortal", this.scene);
    root.position.set(sp.x, 0, sp.z);
    // stone arch
    for (const sx of [-1, 1]) cyl(this.scene, root, toonMat(this.scene, "#6b6076"), 0.5, 0.6, 3.0, [sx * 1.4, 1.5, 0]);
    const top = MeshBuilder.CreateTorus("portalArch", { diameter: 3, thickness: 0.5, tessellation: 18 }, this.scene);
    top.parent = root; top.position.y = 1.6; top.rotation.x = Math.PI / 2.1;
    top.material = toonMat(this.scene, "#6b6076");
    const swirl = MeshBuilder.CreateDisc("portalInner", { radius: 1.3, tessellation: 24 }, this.scene);
    swirl.parent = root; swirl.position.set(0, 1.5, -0.1); swirl.rotation.x = Math.PI / 2.1;
    swirl.material = glowMat(this.scene, "#b06cff", 1.4);
    swirl.isPickable = false;
    this.scene.registerBeforeRender(() => (swirl.rotation.y += 0.03));
    applyToonStyle(root, 0.05);
  }

  private buildGoalCrystal(): void {
    const g = this.map.goal;
    const root = new TransformNode("goalCrystal", this.scene);
    root.position.set(g.x, 0, g.z);
    const base = MeshBuilder.CreateCylinder("goalBase", { diameterTop: 2.0, diameterBottom: 2.8, height: 0.7, tessellation: 8 }, this.scene);
    base.parent = root; base.position.y = 0.35; base.material = toonMat(this.scene, "#445074");
    const crystal = MeshBuilder.CreateCylinder("goalCrystalMesh", { diameterTop: 0, diameterBottom: 1.3, height: 3.0, tessellation: 6 }, this.scene);
    crystal.parent = root; crystal.position.y = 2.2; crystal.material = glowMat(this.scene, "#46e8d6", 1.4);
    crystal.convertToFlatShadedMesh();
    // orbiting shards
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const sh = MeshBuilder.CreateCylinder("shard", { diameterTop: 0, diameterBottom: 0.4, height: 1.0, tessellation: 5 }, this.scene);
      sh.parent = root; sh.position.set(Math.cos(a) * 1.6, 1.4, Math.sin(a) * 1.6); sh.material = glowMat(this.scene, "#7ff0e2", 1.2); sh.convertToFlatShadedMesh();
    }
    this.scene.registerBeforeRender(() => {
      const t = performance.now() * 0.001;
      crystal.rotation.y = t * 0.6;
      crystal.position.y = 2.2 + Math.sin(t * 2) * 0.12;
    });
    applyToonStyle(root, 0.05);
  }

  private scatterDecorations(): void {
    const b = this.map.bounds;
    const out = new Vector3();
    const onPath = (x: number, z: number): boolean => {
      const total = this.path.totalLength;
      for (let dd = 0; dd <= total; dd += 1.5) {
        this.path.sample(dd, out);
        if ((out.x - x) ** 2 + (out.z - z) ** 2 < 6.5) return true;
      }
      return false;
    };
    const nearPad = (x: number, z: number) => this.map.buildPoints.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 5);

    let placed = 0, tries = 0;
    while (placed < 60 && tries < 600) {
      tries++;
      const x = randRange(b.minX, b.maxX);
      const z = randRange(b.minZ, b.maxZ);
      if (onPath(x, z) || nearPad(x, z)) continue;
      this.placeDecoration(x, z);
      placed++;
    }
  }

  private placeDecoration(x: number, z: number): void {
    const r = rand();
    if (r < 0.38) this.tree(x, z);
    else if (r < 0.56) this.rock(x, z);
    else if (r < 0.72) this.grass(x, z);
    else if (r < 0.82) this.mushroom(x, z);
    else if (r < 0.9) this.crystal(x, z);
    else this.torch(x, z);
  }

  private tree(x: number, z: number): void {
    const t = new TransformNode("tree", this.scene);
    t.position.set(x, 0, z);
    const sc = randRange(0.9, 1.6);
    cyl(this.scene, t, toonMat(this.scene, "#7a5230"), 0.32, 0.46, 1.3 * sc, [0, 0.65 * sc, 0]);
    for (let i = 0; i < 3; i++) {
      const leaf = MeshBuilder.CreateSphere("leaf", { diameter: (1.9 - i * 0.4) * sc, segments: 8 }, this.scene);
      leaf.parent = t; leaf.position.y = (1.5 + i * 0.7) * sc;
      leaf.material = toonMat(this.scene, i % 2 ? "#3aa050" : "#2f8a42");
    }
    t.rotation.y = randRange(0, 6.28);
    applyToonStyle(t, 0.05);
  }

  private rock(x: number, z: number): void {
    const t = new TransformNode("rock", this.scene);
    t.position.set(x, 0, z);
    const sc = randRange(0.6, 1.3);
    const rk = MeshBuilder.CreateSphere("rock", { diameter: sc, segments: 4 }, this.scene);
    rk.parent = t; rk.position.y = sc * 0.32; rk.scaling.y = 0.7; rk.material = toonMat(this.scene, "#8c8c98"); rk.convertToFlatShadedMesh();
    applyToonStyle(t, 0.04);
  }

  private grass(x: number, z: number): void {
    const t = new TransformNode("grass", this.scene);
    t.position.set(x, 0, z);
    for (let i = 0; i < 4; i++) {
      const blade = MeshBuilder.CreateCylinder("g", { diameterTop: 0, diameterBottom: 0.14, height: randRange(0.5, 0.9), tessellation: 4 }, this.scene);
      blade.parent = t; blade.position.set(randRange(-0.3, 0.3), 0.3, randRange(-0.3, 0.3)); blade.rotation.z = randRange(-0.2, 0.2);
      blade.material = toonMat(this.scene, "#6fc24a");
    }
    applyToonStyle(t, 0.03);
  }

  private mushroom(x: number, z: number): void {
    const t = new TransformNode("mush", this.scene);
    t.position.set(x, 0, z);
    const sc = randRange(0.5, 1.0);
    cyl(this.scene, t, toonMat(this.scene, "#efe6d2"), 0.18 * sc, 0.22 * sc, 0.5 * sc, [0, 0.25 * sc, 0]);
    const cap = MeshBuilder.CreateSphere("cap", { diameter: 0.7 * sc, segments: 8 }, this.scene);
    cap.parent = t; cap.position.y = 0.5 * sc; cap.scaling.y = 0.6; cap.material = toonMat(this.scene, rand() > 0.5 ? "#e0533f" : "#d24fb0");
    applyToonStyle(t, 0.04);
  }

  private crystal(x: number, z: number): void {
    const t = new TransformNode("crystalDeco", this.scene);
    t.position.set(x, 0, z);
    const col = rand() > 0.5 ? "#7fd0ff" : "#c98aff";
    for (let i = 0; i < 3; i++) {
      const c = MeshBuilder.CreateCylinder("cr", { diameterTop: 0, diameterBottom: randRange(0.2, 0.35), height: randRange(0.8, 1.5), tessellation: 5 }, this.scene);
      c.parent = t; c.position.set(randRange(-0.25, 0.25), 0.4, randRange(-0.25, 0.25)); c.rotation.z = randRange(-0.3, 0.3);
      c.material = glowMat(this.scene, col, 1.0); c.convertToFlatShadedMesh();
    }
    applyToonStyle(t, 0.04);
  }

  private torch(x: number, z: number): void {
    const t = new TransformNode("torch", this.scene);
    t.position.set(x, 0, z);
    cyl(this.scene, t, toonMat(this.scene, "#5a3f28"), 0.16, 0.22, 1.7, [0, 0.85, 0]);
    const bowl = MeshBuilder.CreateCylinder("bowl", { diameterTop: 0.5, diameterBottom: 0.3, height: 0.3, tessellation: 8 }, this.scene);
    bowl.parent = t; bowl.position.y = 1.75; bowl.material = toonMat(this.scene, "#3a3340");
    applyToonStyle(t, 0.04);
    this.fireParticles(new Vector3(x, 1.95, z));
  }

  private fireParticles(pos: Vector3): void {
    const ps = new ParticleSystem("fire", 40, this.scene);
    ps.particleTexture = softCircleTexture(this.scene);
    ps.emitter = pos;
    ps.minEmitBox = new Vector3(-0.12, 0, -0.12);
    ps.maxEmitBox = new Vector3(0.12, 0.1, 0.12);
    ps.color1 = new Color4(1, 0.8, 0.2, 1);
    ps.color2 = new Color4(1, 0.4, 0.1, 1);
    ps.colorDead = new Color4(0.6, 0.1, 0.0, 0);
    ps.minSize = 0.25; ps.maxSize = 0.6;
    ps.minLifeTime = 0.25; ps.maxLifeTime = 0.5;
    ps.emitRate = 50;
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.gravity = new Vector3(0, 3, 0);
    ps.direction1 = new Vector3(-0.3, 1, -0.3);
    ps.direction2 = new Vector3(0.3, 1.5, 0.3);
    ps.minEmitPower = 0.4; ps.maxEmitPower = 0.9;
    ps.updateSpeed = 0.02;
    ps.start();
  }

  private fireflies(): void {
    const b = this.map.bounds;
    const ps = new ParticleSystem("fireflies", 120, this.scene);
    ps.particleTexture = softCircleTexture(this.scene);
    ps.emitter = new Vector3((b.minX + b.maxX) / 2, 1.5, (b.minZ + b.maxZ) / 2);
    ps.minEmitBox = new Vector3(b.minX, 0.5, b.minZ);
    ps.maxEmitBox = new Vector3(b.maxX, 4, b.maxZ);
    ps.color1 = new Color4(1, 0.95, 0.5, 1);
    ps.color2 = new Color4(0.7, 1, 0.6, 1);
    ps.colorDead = new Color4(1, 1, 0.6, 0);
    ps.minSize = 0.08; ps.maxSize = 0.2;
    ps.minLifeTime = 2.5; ps.maxLifeTime = 5;
    ps.emitRate = 30;
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.gravity = new Vector3(0, 0.05, 0);
    ps.direction1 = new Vector3(-0.3, 0.1, -0.3);
    ps.direction2 = new Vector3(0.3, 0.2, 0.3);
    ps.minEmitPower = 0.1; ps.maxEmitPower = 0.4;
    ps.updateSpeed = 0.015;
    ps.start();
  }
}

// local cylinder helper (SceneBuilder-scoped, mirrors ModelFactory's)
function cyl(s: Scene, p: TransformNode, m: import("../bjs").Material, dTop: number, dBot: number, h: number, pos: [number, number, number]): Mesh {
  const x = MeshBuilder.CreateCylinder("c", { diameterTop: dTop, diameterBottom: dBot, height: h, tessellation: 12 }, s);
  x.material = m; x.parent = p; x.position.set(pos[0], pos[1], pos[2]);
  return x;
}
