import {
  MeshBuilder,
  Vector3,
  Color3,
  Color4,
  HemisphericLight,
  DirectionalLight,
  Scene,
  Mesh,
  TransformNode,
} from "../bjs";
import { flatMat } from "../entities/models/materials";
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
    this.scene.clearColor = new Color4(0.09, 0.07, 0.16, 1);
    this.scene.ambientColor = new Color3(0.4, 0.4, 0.5);
    this.setupLights();
    this.buildIsland();
    this.buildPathTiles();
    this.buildPads();
    this.buildSpawnPortal();
    this.buildGoalCrystal();
    this.scatterDecorations();
  }

  private setupLights(): void {
    const hemi = new HemisphericLight("hemi", new Vector3(0.2, 1, 0.1), this.scene);
    hemi.intensity = 0.85;
    hemi.groundColor = new Color3(0.25, 0.2, 0.35);
    const dir = new DirectionalLight("dir", new Vector3(-0.4, -1, -0.6), this.scene);
    dir.intensity = 0.6;
  }

  private buildIsland(): void {
    const b = this.map.bounds;
    const w = b.maxX - b.minX + 6;
    const d = b.maxZ - b.minZ + 6;
    const cx = (b.maxX + b.minX) / 2;
    const cz = (b.maxZ + b.minZ) / 2;

    const top = MeshBuilder.CreateBox("islandTop", { width: w, height: 1, depth: d }, this.scene);
    top.position.set(cx, -0.5, cz);
    top.material = flatMat(this.scene, "#4a7a3a", 0.18);
    top.isPickable = false;

    // grass rim (slightly brighter edge)
    const rim = MeshBuilder.CreateBox("rim", { width: w + 1.2, height: 0.5, depth: d + 1.2 }, this.scene);
    rim.position.set(cx, -0.9, cz);
    rim.material = flatMat(this.scene, "#5e9648", 0.2);
    rim.isPickable = false;

    // floating rock underside
    const under = MeshBuilder.CreateCylinder(
      "under",
      { diameterTop: Math.max(w, d), diameterBottom: 3, height: 7, tessellation: 7 },
      this.scene
    );
    under.position.set(cx, -4.5, cz);
    under.material = flatMat(this.scene, "#5a4632", 0.12);
    under.isPickable = false;
  }

  private buildPathTiles(): void {
    const total = this.path.totalLength;
    const step = 1.1;
    const out = new Vector3();
    let i = 0;
    for (let dist = 0; dist <= total; dist += step) {
      const heading = this.path.sample(dist, out, 0.06);
      const tile = MeshBuilder.CreateBox(
        "path",
        { width: this.map.pathWidth, height: 0.12, depth: step + 0.15 },
        this.scene
      );
      tile.position.copyFrom(out);
      tile.rotation.y = heading;
      tile.material = flatMat(this.scene, i % 2 === 0 ? "#b9a07a" : "#a8906a", 0.12);
      tile.isPickable = false;
      i++;
    }
  }

  private buildPads(): void {
    this.map.buildPoints.forEach((p, index) => {
      const pad = MeshBuilder.CreateCylinder(
        `pad_${index}`,
        { diameterTop: 1.9, diameterBottom: 2.0, height: 0.3, tessellation: 12 },
        this.scene
      );
      pad.position.set(p.x, 0.15, p.z);
      pad.material = flatMat(this.scene, "#3da0c8", 0.45);
      pad.metadata = { kind: "pad", index };
      const glow = MeshBuilder.CreateCylinder(
        `padGlow_${index}`,
        { diameterTop: 1.4, diameterBottom: 1.4, height: 0.05, tessellation: 12 },
        this.scene
      );
      glow.position.set(p.x, 0.31, p.z);
      glow.material = flatMat(this.scene, "#9fe8ff", 0.7);
      glow.isPickable = false;
      glow.parent = pad;
      this.pads.push({ index, mesh: pad, position: new Vector3(p.x, 0.45, p.z), occupied: false });
    });
  }

  private buildSpawnPortal(): void {
    const s = this.map.spawn;
    const root = new TransformNode("spawnPortal", this.scene);
    root.position.set(s.x, 0, s.z);
    const ring = MeshBuilder.CreateTorus("portalRing", { diameter: 3, thickness: 0.5, tessellation: 16 }, this.scene);
    ring.parent = root;
    ring.position.y = 1.4;
    ring.rotation.x = Math.PI / 2.2;
    ring.material = flatMat(this.scene, "#8a3df0", 0.6);
    ring.isPickable = false;
    const inner = MeshBuilder.CreateDisc("portalInner", { radius: 1.2, tessellation: 16 }, this.scene);
    inner.parent = root;
    inner.position.y = 1.4;
    inner.position.z = -0.1;
    inner.rotation.x = Math.PI / 2.2;
    inner.material = flatMat(this.scene, "#1c0b33", 0.5);
    inner.isPickable = false;
  }

  private buildGoalCrystal(): void {
    const g = this.map.goal;
    const root = new TransformNode("goalCrystal", this.scene);
    root.position.set(g.x, 0, g.z);
    const base = MeshBuilder.CreateCylinder("goalBase", { diameterTop: 2.2, diameterBottom: 2.8, height: 0.6, tessellation: 8 }, this.scene);
    base.parent = root;
    base.position.y = 0.3;
    base.material = flatMat(this.scene, "#3a4a6a", 0.2);
    base.isPickable = false;
    const crystal = MeshBuilder.CreateCylinder("goalCrystalMesh", { diameterTop: 0, diameterBottom: 1.2, height: 2.6, tessellation: 6 }, this.scene);
    crystal.parent = root;
    crystal.position.y = 1.9;
    crystal.material = flatMat(this.scene, "#46e0d0", 0.7);
    crystal.isPickable = false;
    // store reference for pulse animation via metadata
    root.metadata = { crystal };
  }

  private scatterDecorations(): void {
    const b = this.map.bounds;
    const isOnPath = (x: number, z: number): boolean => {
      const out = new Vector3();
      const total = this.path.totalLength;
      for (let d = 0; d <= total; d += 1.5) {
        this.path.sample(d, out);
        const dx = out.x - x;
        const dz = out.z - z;
        if (dx * dx + dz * dz < 6.5) return true;
      }
      return false;
    };
    const nearPad = (x: number, z: number): boolean =>
      this.map.buildPoints.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 5);

    let placed = 0;
    let tries = 0;
    while (placed < 46 && tries < 400) {
      tries++;
      const x = randRange(b.minX, b.maxX);
      const z = randRange(b.minZ, b.maxZ);
      if (isOnPath(x, z) || nearPad(x, z)) continue;
      this.placeDecoration(x, z);
      placed++;
    }
  }

  private placeDecoration(x: number, z: number): void {
    const r = rand();
    if (r < 0.45) this.tree(x, z);
    else if (r < 0.7) this.rock(x, z);
    else if (r < 0.88) this.grass(x, z);
    else if (r < 0.95) this.torch(x, z);
    else this.chest(x, z);
  }

  private tree(x: number, z: number): void {
    const t = new TransformNode("tree", this.scene);
    t.position.set(x, 0, z);
    const trunk = MeshBuilder.CreateCylinder("trunk", { diameterTop: 0.3, diameterBottom: 0.4, height: 1.2, tessellation: 6 }, this.scene);
    trunk.parent = t;
    trunk.position.y = 0.6;
    trunk.material = flatMat(this.scene, "#6d4c2f", 0.15);
    trunk.isPickable = false;
    const sc = randRange(0.9, 1.5);
    for (let i = 0; i < 2; i++) {
      const leaf = MeshBuilder.CreateCylinder("leaf", { diameterTop: 0, diameterBottom: 1.8 * sc, height: 1.6 * sc, tessellation: 7 }, this.scene);
      leaf.parent = t;
      leaf.position.y = 1.4 + i * 0.9 * sc;
      leaf.material = flatMat(this.scene, i === 0 ? "#2f7d3a" : "#3a9648", 0.2);
      leaf.isPickable = false;
    }
  }

  private rock(x: number, z: number): void {
    const s = randRange(0.5, 1.2);
    const rk = MeshBuilder.CreateSphere("rock", { diameter: s, segments: 4 }, this.scene);
    rk.position.set(x, s * 0.35, z);
    rk.scaling.y = 0.7;
    rk.material = flatMat(this.scene, "#8a8a96", 0.12);
    rk.isPickable = false;
  }

  private grass(x: number, z: number): void {
    for (let i = 0; i < 3; i++) {
      const blade = MeshBuilder.CreateCylinder("grass", { diameterTop: 0, diameterBottom: 0.12, height: randRange(0.4, 0.8), tessellation: 4 }, this.scene);
      blade.position.set(x + randRange(-0.3, 0.3), 0.25, z + randRange(-0.3, 0.3));
      blade.material = flatMat(this.scene, "#6abe4a", 0.25);
      blade.isPickable = false;
    }
  }

  private torch(x: number, z: number): void {
    const post = MeshBuilder.CreateCylinder("torch", { diameterTop: 0.15, diameterBottom: 0.2, height: 1.6, tessellation: 6 }, this.scene);
    post.position.set(x, 0.8, z);
    post.material = flatMat(this.scene, "#5a3f28", 0.15);
    post.isPickable = false;
    const flame = MeshBuilder.CreateSphere("flame", { diameter: 0.5, segments: 6 }, this.scene);
    flame.position.set(x, 1.75, z);
    flame.scaling.y = 1.4;
    flame.material = flatMat(this.scene, "#ff9a2a", 0.9);
    flame.isPickable = false;
  }

  private chest(x: number, z: number): void {
    const t = new TransformNode("chest", this.scene);
    t.position.set(x, 0, z);
    const base = MeshBuilder.CreateBox("chestBase", { width: 1, height: 0.6, depth: 0.7 }, this.scene);
    base.parent = t;
    base.position.y = 0.3;
    base.material = flatMat(this.scene, "#7a4f23", 0.15);
    base.isPickable = false;
    const lid = MeshBuilder.CreateBox("chestLid", { width: 1.02, height: 0.25, depth: 0.72 }, this.scene);
    lid.parent = t;
    lid.position.y = 0.7;
    lid.material = flatMat(this.scene, "#caa233", 0.4);
    lid.isPickable = false;
  }
}
