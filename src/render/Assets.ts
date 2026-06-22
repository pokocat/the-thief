import "@babylonjs/loaders/glTF";
import { Scene, SceneLoader, AssetContainer, TransformNode, AnimationGroup, Vector3 } from "../bjs";

// All CC0 Quaternius models (see ASSETS.md). Served from public/assets/models.
export const MODEL_SLOTS = {
  enemy_goblin: "enemy_goblin.glb",
  enemy_skeleton: "enemy_skeleton.glb",
  enemy_orc: "enemy_orc.glb",
  enemy_ogre: "enemy_ogre.glb",
  enemy_bat: "enemy_bat.glb",
  enemy_necromancer: "enemy_necromancer.glb",
  enemy_spider: "enemy_spider.glb",
  enemy_werewolf: "enemy_werewolf.glb",
  enemy_demon: "enemy_demon.glb",
  enemy_dragon: "enemy_dragon.glb",
  tower_knight: "tower_knight.glb",
  tower_wizard: "tower_wizard.glb",
  tower_archer: "tower_archer.glb",
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
  prop_platform: "prop_platform.glb",
  prop_portal: "prop_portal.glb",
  prop_grass: "prop_grass.glb",
  prop_banner: "prop_banner.glb",
  prop_well: "prop_well.glb",
  prop_lantern: "prop_lantern.glb",
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
