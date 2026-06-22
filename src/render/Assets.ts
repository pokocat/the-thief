import "@babylonjs/loaders/glTF";
import { Scene, SceneLoader, AssetContainer, TransformNode, AnimationGroup, Vector3, Color3, StandardMaterial } from "../bjs";

// Convert glb PBR materials to StandardMaterial so they light correctly under
// our directional+hemi lights and cast/receive shadows WITHOUT needing an HDR
// environment (PBR metallic surfaces render near-black without IBL). Albedo
// textures/colors are preserved. Done once per container (shared by instances).
function convertMaterials(c: AssetContainer, scene: Scene): void {
  const map = new Map<unknown, StandardMaterial>();
  for (const mesh of c.meshes) {
    const m = mesh.material as unknown as {
      getClassName?: () => string; name?: string;
      albedoTexture?: unknown; albedoColor?: { r: number; g: number; b: number }; backFaceCulling?: boolean;
    } | null;
    if (!m || !(m.getClassName?.() ?? "").includes("PBR")) continue;
    let s = map.get(m);
    if (!s) {
      s = new StandardMaterial((m.name ?? "mat") + "_std", scene);
      const col = m.albedoColor ?? { r: 0.8, g: 0.8, b: 0.8 };
      s.diffuseColor = new Color3(col.r, col.g, col.b);
      if (m.albedoTexture) s.diffuseTexture = m.albedoTexture as never;
      // self-fill proportional to albedo so models stay readable from any angle
      s.emissiveColor = new Color3(col.r * 0.38, col.g * 0.38, col.b * 0.38);
      s.specularColor = new Color3(0.08, 0.08, 0.09);
      s.specularPower = 48;
      if (m.backFaceCulling !== undefined) s.backFaceCulling = m.backFaceCulling;
      map.set(m, s);
      c.materials.push(s);
    }
    mesh.material = s as never;
  }
}

// All CC0 Quaternius models (see ASSETS.md). Served from public/assets/models.
export const MODEL_SLOTS = {
  enemy_goblin: "enemy_goblin.glb",
  enemy_skeleton: "enemy_skeleton.glb",
  enemy_slime: "enemy_slime.glb",
  enemy_orc: "enemy_orc.glb",
  enemy_bat: "enemy_bat.glb",
  enemy_ghost: "enemy_ghost.glb",
  enemy_demon: "enemy_demon.glb",
  enemy_dragon: "enemy_dragon.glb",
  tower_knight: "tower_knight.glb",
  tower_wizard: "tower_wizard.glb",
  tower_archer: "tower_archer.glb",
  tower_barbarian: "tower_barbarian.glb",
  tower_rogue: "tower_rogue.glb",
  prop_pine: "prop_pine.glb",
  prop_tree: "prop_tree.glb",
  prop_rock: "prop_rock.glb",
  prop_crystal: "prop_crystal.glb",
  prop_barrel: "prop_barrel.glb",
  prop_chest: "prop_chest.glb",
  prop_mushroom: "prop_mushroom.glb",
  prop_fence: "prop_fence.glb",
  prop_torch: "prop_torch.glb",
} as const;
export type Slot = keyof typeof MODEL_SLOTS;

const containers = new Map<Slot, AssetContainer>();

export function hasModel(slot: Slot): boolean {
  return containers.has(slot);
}

export async function preloadModels(scene: Scene, onProgress?: (done: number, total: number) => void): Promise<void> {
  const base = (import.meta as unknown as { env: { BASE_URL: string } }).env.BASE_URL;
  const root = `${base}assets/models/`;
  const slots = Object.keys(MODEL_SLOTS) as Slot[];
  let done = 0;
  await Promise.all(
    slots.map(async (slot) => {
      const c = await SceneLoader.LoadAssetContainerAsync(root, MODEL_SLOTS[slot], scene);
      c.meshes.forEach((m) => (m.isPickable = false));
      c.animationGroups.forEach((g) => g.stop());
      convertMaterials(c, scene);
      containers.set(slot, c);
      onProgress?.(++done, slots.length);
    })
  );
}

export interface ModelInstance {
  modelRoot: TransformNode; // the instantiated glb root (scale/offset go here)
  anims: AnimationGroup[];
  height: number; // world height after scaling to targetHeight
}

// Instantiate a slot (clones meshes + skeleton + animation groups), scaled so
// its height == targetHeight and its feet sit at y=0.
export function instantiate(slot: Slot, targetHeight: number, parent: TransformNode): ModelInstance {
  const c = containers.get(slot);
  if (!c) throw new Error(`asset not preloaded: ${slot}`);
  const entries = c.instantiateModelsToScene((n) => n, false, { doNotInstantiate: false });
  const modelRoot = new TransformNode(`model_${slot}`, parent.getScene());
  modelRoot.parent = parent;
  for (const n of entries.rootNodes) n.parent = modelRoot;
  for (const g of entries.animationGroups) g.stop();

  // measure the hierarchy bounds (world) to scale to target height + drop feet to y=0
  modelRoot.computeWorldMatrix(true);
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const m of modelRoot.getChildMeshes(false)) {
    if (m.getTotalVertices() === 0) continue; // skip empties/__root__
    m.computeWorldMatrix(true);
    try {
      // skinned meshes need skeleton applied for a valid bounding box
      (m as unknown as { refreshBoundingInfo: (o: object) => void }).refreshBoundingInfo({ applySkeleton: true });
    } catch {
      /* non-skinned */
    }
    const bb = m.getBoundingInfo().boundingBox;
    min.minimizeInPlace(bb.minimumWorld);
    max.maximizeInPlace(bb.maximumWorld);
  }
  const h = isFinite(max.y - min.y) ? Math.max(0.05, max.y - min.y) : 1;
  const scale = Math.min(20, targetHeight / h);
  modelRoot.scaling.setAll(scale);
  modelRoot.position.y = isFinite(min.y) ? -min.y * scale : 0;
  return { modelRoot, anims: entries.animationGroups, height: targetHeight };
}

// Simple animation state controller: plays one looping/oneshot clip at a time,
// matched by name substring; supports speed (for slow/freeze).
export class AnimController {
  private current: AnimationGroup | null = null;
  constructor(private groups: AnimationGroup[]) {}

  private find(...subs: string[]): AnimationGroup | null {
    for (const sub of subs) {
      const g = this.groups.find((x) => x.name.toLowerCase().includes(sub.toLowerCase()));
      if (g) return g;
    }
    return null;
  }

  play(subs: string[], loop = true, speed = 1): void {
    const g = this.find(...subs);
    if (!g || g === this.current) {
      if (this.current) this.current.speedRatio = speed;
      return;
    }
    if (this.current) this.current.stop();
    g.speedRatio = speed;
    g.play(loop);
    this.current = g;
  }

  // play a one-shot clip (e.g. attack) then return to an idle/loop clip
  playOneShot(subs: string[], thenSubs: string[]): void {
    const g = this.find(...subs);
    if (!g) return;
    if (this.current) this.current.stop();
    g.speedRatio = 1;
    g.play(false);
    this.current = g;
    g.onAnimationGroupEndObservable.addOnce(() => {
      this.current = null;
      this.play(thenSubs, true);
    });
  }

  setSpeed(speed: number): void {
    if (this.current) this.current.speedRatio = speed;
  }

  stopAll(): void {
    for (const g of this.groups) g.stop();
    this.current = null;
  }

  dispose(): void {
    for (const g of this.groups) g.dispose();
  }
}
