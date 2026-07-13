import { Color3, TransformNode, PBRMaterial, StandardMaterial } from "../bjs";
import type { Material, Mesh } from "../bjs";

// Recolors GLB variants that share one model (the 4 wizard towers all use
// tower_wizard.glb). GLB instances share their container materials, so we must
// NOT mutate them in place — instead we clone once per (materialName + color)
// and reassign the clone to this instance's meshes. Clones are cached, so N
// towers of the same variant reuse a single tinted material (never per-mesh,
// never per-instance clones on the hot path).

const tintCache = new Map<string, Material>();

function normHex(hex: string): string {
  return hex.startsWith("#") ? hex : `#${hex}`;
}

function tintOne(mat: Material, colorHex: string, strength: number): Material {
  const key = `${mat.name}|${colorHex}|${strength}`;
  const hit = tintCache.get(key);
  if (hit) return hit;
  const color = Color3.FromHexString(normHex(colorHex));
  const clone = mat.clone(`${mat.name}_tint_${colorHex}`)!;
  // The wizard atlas is a white-albedo PBR texture at metallic 0.4, so a plain
  // albedo multiply can't shift a blue-dominant texel toward red/teal and the
  // metallic reflectance washes it out. Drive the hue three ways: set albedo to
  // a white->color blend (tints the texture), add an emissive term (adds the
  // hue independent of lighting), and drop metallic so it reads as a matte robe.
  const alb = Color3.Lerp(Color3.White(), color, strength);
  if (clone instanceof PBRMaterial) {
    clone.albedoColor = clone.albedoColor.multiply(alb);
    clone.emissiveColor = color.scale(0.38);
    clone.metallic = 0;
    clone.roughness = Math.max(0.75, clone.roughness ?? 1);
  } else if (clone instanceof StandardMaterial) {
    clone.diffuseColor = clone.diffuseColor.multiply(alb);
    clone.emissiveColor = color.scale(0.3);
  }
  tintCache.set(key, clone);
  return clone;
}

// Retint the given material slots (by material name) on a model instance.
export function tintModel(root: TransformNode, slotNames: string[], colorHex: string, strength = 0.85): void {
  for (const m of root.getChildMeshes(false) as Mesh[]) {
    const mat = m.material;
    if (!mat) continue;
    if (!slotNames.includes(mat.name)) continue;
    m.material = tintOne(mat, colorHex, strength);
  }
}

export function clearTintCache(): void {
  tintCache.clear();
}
