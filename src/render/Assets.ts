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
// cloneMeshes: when true, produce real Mesh clones instead of hardware
// InstancedMeshes. Instances share the source material (setting .material on an
// InstancedMesh is a silent no-op), so any model that needs a per-instance
// material (e.g. the recolored wizard variants) must be cloned, not instanced.
export function instantiate(slot: Slot, targetHeight: number, parent: TransformNode, cloneMeshes = false): ModelInstance {
  const c = containers.get(slot);
  if (!c) throw new Error(`asset not preloaded: ${slot}`);
  const entries = c.instantiateModelsToScene((n) => n, false, { doNotInstantiate: cloneMeshes });
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

// Animation state controller: plays one looping/oneshot clip at a time, matched
// tolerantly by name (handles truncated Quaternius clip names like
// "...|Death|CharacterArmature|Dea"), crossfades between clips over ~0.15s using
// animation-group weights, and supports speed scaling (for slow/freeze).
// crossfade is ticked from the existing per-frame update loops (no
// registerBeforeRender) via update(dt).
export class AnimController {
  private current: AnimationGroup | null = null;
  private fromG: AnimationGroup | null = null;
  private fadeT = 0;
  private fadeDur = 0;
  private static readonly FADE = 0.15;
  constructor(private groups: AnimationGroup[]) {}

  // Tolerant, bidirectional match: a clip matches if its (lowercased) name
  // contains the query, or any "|"-delimited segment startsWith/is-a-prefix-of
  // the query. So "death" matches a segment "dea" (truncated) and vice-versa.
  private matches(name: string, sub: string): boolean {
    const n = name.toLowerCase();
    const s = sub.toLowerCase();
    if (n.includes(s)) return true;
    for (const seg of n.split("|")) {
      if (!seg) continue;
      if (seg.startsWith(s) || s.startsWith(seg)) return true;
    }
    return false;
  }

  private find(...subs: string[]): AnimationGroup | null {
    for (const sub of subs) {
      const g = this.groups.find((x) => this.matches(x.name, sub));
      if (g) return g;
    }
    return null;
  }

  has(subs: string[]): boolean {
    return !!this.find(...subs);
  }

  private beginFade(g: AnimationGroup, loop: boolean, speed: number): void {
    // clear any in-flight fade source so we never leave a group half-weighted
    if (this.fromG && this.fromG !== g) this.fromG.stop();
    this.fromG = null;
    const blend = !!this.current && this.current.isPlaying && this.current !== g;
    if (blend) this.fromG = this.current;
    else if (this.current && this.current !== g) this.current.stop();
    g.speedRatio = speed;
    g.stop();
    g.play(loop);
    if (blend) {
      g.setWeightForAllAnimatables(0);
      this.fromG!.setWeightForAllAnimatables(1);
      this.fadeT = 0;
      this.fadeDur = AnimController.FADE;
    } else {
      g.setWeightForAllAnimatables(1);
      this.fadeDur = 0;
    }
    this.current = g;
  }

  // Advance an in-progress crossfade. Cheap no-op when nothing is fading.
  update(dt: number): void {
    if (this.fadeDur <= 0) return;
    this.fadeT += dt;
    const k = Math.min(1, this.fadeT / this.fadeDur);
    if (this.current) this.current.setWeightForAllAnimatables(k);
    if (this.fromG) this.fromG.setWeightForAllAnimatables(1 - k);
    if (k >= 1) {
      if (this.fromG) {
        this.fromG.stop();
        this.fromG = null;
      }
      if (this.current) this.current.setWeightForAllAnimatables(1);
      this.fadeDur = 0;
    }
  }

  // returns true if a matching clip was found and started
  play(subs: string[], loop = true, speed = 1): boolean {
    const g = this.find(...subs);
    if (!g) return false;
    if (g === this.current) {
      g.speedRatio = speed;
      return true;
    }
    this.beginFade(g, loop, speed);
    return true;
  }

  // play a one-shot clip (e.g. attack) then crossfade back to an idle/loop clip
  playOneShot(subs: string[], thenSubs: string[]): void {
    const g = this.find(...subs);
    if (!g) return;
    this.beginFade(g, false, 1);
    g.onAnimationGroupEndObservable.addOnce(() => {
      if (this.current === g) {
        this.play(thenSubs, true);
      }
    });
  }

  setSpeed(speed: number): void {
    if (this.current) this.current.speedRatio = speed;
  }

  stopAll(): void {
    for (const g of this.groups) g.stop();
    this.current = null;
    this.fromG = null;
    this.fadeDur = 0;
  }

  dispose(): void {
    for (const g of this.groups) g.dispose();
  }
}
