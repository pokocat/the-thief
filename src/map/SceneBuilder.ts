import {
  MeshBuilder,
  Vector3,
  Color3,
  Color4,
  Scene,
  Mesh,
  TransformNode,
  ParticleSystem,
} from "../bjs";
import { flatMat, toonMat, softCircleTexture, bumpyMat, grassMat, emissivePulseMat, waterMat } from "../entities/models/materials";
import { instantiate, Slot } from "../render/Assets";
import { addShadowCaster } from "../render/shadows";
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
    // natural (desaturated) meadow: dual-tone grass diffuse + gentle relief.
    // Fewer repeats + low bump so no visible tiling grid across the ground.
    top.material = grassMat(this.scene, "#4f8a38", 3, 0.28);
    top.receiveShadows = true;
    top.isPickable = false;
    top.freezeWorldMatrix();

    const rim = MeshBuilder.CreateBox("rim", { width: w + 1.4, height: 0.5, depth: d + 1.4 }, this.scene);
    rim.position.set(cx, -0.95, cz);
    rim.material = flatMat(this.scene, "#3f6f2c", 0.12); // darker earthy edge
    rim.isPickable = false;
    rim.freezeWorldMatrix();

    // animated water moat: scrolling ripple normals + bright fresnel rim
    const moat = MeshBuilder.CreateDisc("moat", { radius: Math.max(w, d) * 0.62, tessellation: 48 }, this.scene);
    moat.rotation.x = Math.PI / 2;
    moat.position.set(cx, -1.15, cz);
    const wmat = waterMat(this.scene, "#2e6fa8", 0.82);
    moat.material = wmat;
    moat.isPickable = false;
    moat.freezeWorldMatrix();
    const bump = wmat.bumpTexture as unknown as { uOffset: number; vOffset: number };
    this.scene.registerBeforeRender(() => {
      const dt = this.scene.getEngine().getDeltaTime() * 0.001;
      bump.uOffset += dt * 0.04;
      bump.vOffset += dt * 0.025;
    });

    // floating rock underside
    const under = MeshBuilder.CreateCylinder("under", { diameterTop: Math.max(w, d), diameterBottom: 3, height: 9, tessellation: 7 }, this.scene);
    under.position.set(cx, -5.5, cz);
    // rock underside: flat (not toon) so its big facets don't pick up the toon
    // fresnel rim (which read as orange/pink slabs behind the island). Muted
    // earth-grey so the background recedes behind the meadow.
    under.material = flatMat(this.scene, "#6b5a48", 0.09);
    under.convertToFlatShadedMesh();
    under.isPickable = false;
    under.freezeWorldMatrix();
  }

  private buildPathTiles(): void {
    const total = this.path.totalLength;
    const step = 1.1;
    const out = new Vector3();
    const even: Mesh[] = [];
    const odd: Mesh[] = [];
    let i = 0;
    for (let dist = 0; dist <= total; dist += step) {
      const heading = this.path.sample(dist, out, 0.07);
      const tile = MeshBuilder.CreateBox("path", { width: this.map.pathWidth, height: 0.16, depth: step + 0.12 }, this.scene);
      tile.position.copyFrom(out);
      tile.rotation.y = heading;
      (i % 2 === 0 ? even : odd).push(tile);
      i++;
    }
    // warm stone slabs in two *close* tones (subtle brick↔brick variation, not
    // a zebra crossing). The path still reads as one band against the grass.
    this.mergeTiles(even, "#7d6242");
    this.mergeTiles(odd, "#6f5639");
  }

  private mergeTiles(tiles: Mesh[], hex: string): void {
    if (tiles.length === 0) return;
    const merged = Mesh.MergeMeshes(tiles, true, true);
    if (!merged) return;
    merged.name = `path_${hex}`;
    merged.material = bumpyMat(this.scene, hex, 1, 0.55);
    merged.receiveShadows = true;
    merged.isPickable = false;
    merged.freezeWorldMatrix();
  }

  private buildPads(): void {
    // shared, breathing rune material for all rune rings (one draw state, one
    // pulse loop); base stone is a shared cached toon material.
    const runeMat = emissivePulseMat(this.scene, "#5fe6d6", 0.7);
    const stoneMat = toonMat(this.scene, "#2f3a3d"); // deep slate plate (contrasts grass + bright rune)
    const runes: Mesh[] = [];

    this.map.buildPoints.forEach((p, index) => {
      // stone pedestal — this is the pickable build point; top face at y=0.3 so
      // a placed tower (built at y=0.3) stands flush on it. Metadata must stay.
      const pad = MeshBuilder.CreateCylinder(`pad_${index}`, { diameterTop: 2.0, diameterBottom: 2.2, height: 0.3, tessellation: 16 }, this.scene);
      pad.position.set(p.x, 0.15, p.z);
      pad.material = stoneMat;
      pad.receiveShadows = true;
      pad.metadata = { kind: "pad", index };
      pad.freezeWorldMatrix();
      addShadowCaster(pad);

      // inset glowing rune ring near the rim, so the centre stays clear for a tower
      const rune = MeshBuilder.CreateTorus(`padRune_${index}`, { diameter: 1.55, thickness: 0.13, tessellation: 20 }, this.scene);
      rune.position.set(p.x, 0.31, p.z);
      runes.push(rune);

      this.pads.push({ index, mesh: pad, position: new Vector3(p.x, 0.45, p.z), occupied: false });
    });

    // merge all rune rings into a single static mesh; pulse its emissive only
    const merged = Mesh.MergeMeshes(runes, true, true);
    if (merged) {
      merged.name = "padRunes";
      merged.material = runeMat;
      merged.isPickable = false;
      merged.receiveShadows = false;
      merged.freezeWorldMatrix();
      const baseC = new Color3(0.42, 0.92, 0.85);
      this.scene.registerBeforeRender(() => {
        const t = performance.now() * 0.001;
        const k = 0.62 + Math.sin(t * 1.6) * 0.22; // brighter breathing 0.40..0.84
        runeMat.emissiveColor.copyFromFloats(baseC.r * k, baseC.g * k, baseC.b * k);
      });
    }
  }

  private buildSpawnPortal(): void {
    const sp = this.map.spawn;
    const root = new TransformNode("spawnPortal", this.scene);
    root.position.set(sp.x, 0, sp.z);
    const frame = instantiate("prop_portal", 3.2, root);
    this.styleLandmark(frame.modelRoot);
    // twin counter-rotating soft-glow swirl discs: soft radial alpha keeps them
    // reading as energy (not a flat plate) and stops bloom washing them white;
    // slight ellipse makes the counter-rotation visibly shimmer.
    const outer = MeshBuilder.CreateDisc("portalOuter", { radius: 1.25, tessellation: 28 }, this.scene);
    outer.parent = root; outer.position.set(0, 1.6, 0); outer.rotation.x = Math.PI / 2.1;
    outer.scaling.x = 1.25;
    const om = emissivePulseMat(this.scene, "#8a4fd6", 0.9);
    om.opacityTexture = softCircleTexture(this.scene);
    outer.material = om;
    outer.isPickable = false;
    const inner = MeshBuilder.CreateDisc("portalInner", { radius: 0.8, tessellation: 24 }, this.scene);
    inner.parent = root; inner.position.set(0, 1.63, 0); inner.rotation.x = Math.PI / 2.1;
    inner.scaling.z = 1.3;
    const im = emissivePulseMat(this.scene, "#c9a0ff", 1.05);
    im.opacityTexture = softCircleTexture(this.scene);
    inner.material = im;
    inner.isPickable = false;
    this.scene.registerBeforeRender(() => {
      outer.rotation.y += 0.02;
      inner.rotation.y -= 0.035;
    });
  }

  private buildGoalCrystal(): void {
    const g = this.map.goal;
    const root = new TransformNode("goalCrystal", this.scene);
    root.position.set(g.x, 0, g.z);
    // stone platform base + glowing crystal core
    const base = new TransformNode("goalBase", this.scene);
    base.parent = root;
    const binst = instantiate("prop_platform", 0.8, base);
    this.styleLandmark(binst.modelRoot);
    // soft halo ring around the base for extra presence (soft-edged, not a plate)
    const halo = MeshBuilder.CreateDisc("goalHalo", { radius: 1.7, tessellation: 32 }, this.scene);
    halo.parent = root; halo.rotation.x = Math.PI / 2; halo.position.y = 0.08;
    const haloMat = emissivePulseMat(this.scene, "#46e8d6", 0.6);
    haloMat.opacityTexture = softCircleTexture(this.scene);
    halo.material = haloMat;
    halo.isPickable = false;
    // Procedural low-poly crystal cluster (owned material with real emissive
    // glow + facet lighting). The GLB prop_crystal is an instanced, non-
    // recolourable asset, so we build our own gem for the landmark instead.
    const core = new TransformNode("goalCore", this.scene);
    core.parent = root; core.position.y = 0.85; // platform top
    const coreMat = emissivePulseMat(this.scene, "#3fd8c6", 0.55);
    coreMat.diffuseColor = new Color3(0.14, 0.55, 0.5);
    coreMat.specularColor = new Color3(0.7, 0.9, 0.85);
    coreMat.specularPower = 48;
    coreMat.disableLighting = false; // let facets catch light for a gem read
    const shard = (h: number, w: number, x: number, z: number, ry: number): void => {
      const s = MeshBuilder.CreatePolyhedron("crystalShard", { type: 1, size: w }, this.scene);
      s.scaling.y = h / w;
      s.position.set(x, h, z); // base sits at core origin
      s.rotation.y = ry;
      s.material = coreMat;
      s.isPickable = false;
      s.receiveShadows = true;
      s.parent = core;
      addShadowCaster(s);
    };
    shard(1.5, 0.55, 0, 0, 0);
    shard(0.95, 0.38, 0.5, 0.12, 0.7);
    shard(0.75, 0.3, -0.42, -0.22, 1.2);
    const baseC = new Color3(0.25, 0.85, 0.78);
    this.scene.registerBeforeRender(() => {
      const t = performance.now() * 0.001;
      core.rotation.y = t * 0.5;
      core.position.y = 0.85 + Math.sin(t * 2) * 0.1;
      const k = 0.55 + Math.sin(t * 1.8) * 0.22; // colour breathing (stays saturated)
      coreMat.emissiveColor.copyFromFloats(baseC.r * k, baseC.g * k, baseC.b * k);
    });
  }

  // Landmark props (portal frame, goal base): receive + cast shadows, no
  // cartoon outline (keeps a unified no-outline low-poly look with characters).
  private styleLandmark(root: TransformNode): void {
    for (const m of root.getChildMeshes(false) as Mesh[]) {
      if (!m.material) continue;
      m.receiveShadows = true;
      addShadowCaster(m);
    }
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
    // small ground clutter (grass/mushroom) skips shadow casting to save fill
    if (r < 0.22) this.prop("prop_tree", x, z, randRange(2.8, 4.2), true);
    else if (r < 0.34) this.prop("prop_pine", x, z, randRange(2.4, 3.4), true);
    else if (r < 0.46) this.prop("prop_rock", x, z, randRange(0.5, 1.2), true);
    else if (r < 0.58) this.prop("prop_grass", x, z, randRange(0.4, 0.9), false);
    else if (r < 0.66) this.prop("prop_mushroom", x, z, randRange(0.4, 0.8), false);
    else if (r < 0.74) this.prop("prop_crystal", x, z, randRange(0.9, 1.6), true);
    else if (r < 0.80) this.prop("prop_fence", x, z, 1.0, true);
    else if (r < 0.86) this.prop("prop_well", x, z, 1.6, true);
    else if (r < 0.92) this.prop("prop_lantern", x, z, 1.7, true);
    else if (r < 0.96) this.prop("prop_banner", x, z, 1.8, true);
    else this.torch(x, z);
  }

  // place a CC0 glb prop, scaled + randomly rotated. No outline (unified
  // no-outline low-poly look); static, so world matrices are frozen.
  private prop(slot: Slot, x: number, z: number, height: number, castShadow: boolean): void {
    const t = new TransformNode(slot, this.scene);
    t.position.set(x, 0, z);
    const inst = instantiate(slot, height, t);
    t.rotation.y = randRange(0, 6.28);
    this.styleProp(inst.modelRoot, castShadow);
  }

  private styleProp(root: TransformNode, castShadow: boolean): void {
    for (const m of root.getChildMeshes(false) as Mesh[]) {
      if (!m.material) continue;
      m.receiveShadows = true;
      if (castShadow) addShadowCaster(m);
      m.freezeWorldMatrix();
    }
  }

  private torch(x: number, z: number): void {
    const t = new TransformNode("torch", this.scene);
    t.position.set(x, 0, z);
    const inst = instantiate("prop_torch", 1.8, t);
    this.styleProp(inst.modelRoot, true);
    this.fireParticles(new Vector3(x, 1.7, z));
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
