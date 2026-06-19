import {
  Color3,
  StandardMaterial,
  Scene,
  DynamicTexture,
  Texture,
  TransformNode,
  Mesh,
} from "../../bjs";
import { CellMaterial } from "@babylonjs/materials";
import { addShadowCaster } from "../../render/shadows";

// Cached materials, keyed so many units share one (fewer draw batches).
const cache = new Map<string, StandardMaterial | CellMaterial>();
const OUTLINE = new Color3(0.06, 0.04, 0.12);

function normalizeHex(hex: string): string {
  return hex.startsWith("#") ? hex : `#${hex}`;
}

// Toon / cel-shaded material — the core of the cartoon look (banded lighting).
export function toonMat(scene: Scene, hex: string): CellMaterial {
  const key = `toon|${hex}`;
  const hit = cache.get(key);
  if (hit) return hit as CellMaterial;
  const m = new CellMaterial(`cell_${hex}`, scene);
  m.diffuseColor = Color3.FromHexString(normalizeHex(hex));
  m.computeHighLevel = true; // smoother multi-band shading
  cache.set(key, m);
  return m;
}

// Standard material that RECEIVES shadows — used for ground/path/big surfaces.
export function flatMat(scene: Scene, hex: string, emissive = 0.18): StandardMaterial {
  const key = `flat|${hex}|${emissive}`;
  const hit = cache.get(key);
  if (hit) return hit as StandardMaterial;
  const c = Color3.FromHexString(normalizeHex(hex));
  const m = new StandardMaterial(`m_${key}`, scene);
  m.diffuseColor = c;
  m.emissiveColor = c.scale(emissive);
  m.specularColor = new Color3(0.04, 0.04, 0.05);
  m.specularPower = 96;
  cache.set(key, m);
  return m;
}

// Bright emissive material for glowing bits (eyes, crystals, coins, flames),
// so the bloom pass picks them up.
export function glowMat(scene: Scene, hex: string, intensity = 1.0): StandardMaterial {
  const key = `glow|${hex}|${intensity}`;
  const hit = cache.get(key);
  if (hit) return hit as StandardMaterial;
  const c = Color3.FromHexString(normalizeHex(hex));
  const m = new StandardMaterial(`glow_${key}`, scene);
  m.diffuseColor = c.scale(0.4);
  m.emissiveColor = c.scale(intensity);
  m.specularColor = new Color3(0, 0, 0);
  cache.set(key, m);
  return m;
}

export function translucentMat(scene: Scene, hex: string, alpha: number, emissive = 0.5): StandardMaterial {
  const key = `t|${hex}|${alpha}|${emissive}`;
  const hit = cache.get(key);
  if (hit) return hit as StandardMaterial;
  const c = Color3.FromHexString(normalizeHex(hex));
  const m = new StandardMaterial(`tm_${key}`, scene);
  m.diffuseColor = c;
  m.emissiveColor = c.scale(emissive);
  m.alpha = alpha;
  m.specularColor = new Color3(0, 0, 0);
  m.backFaceCulling = false;
  cache.set(key, m);
  return m;
}

// Cartoon dark outline + register as shadow caster, applied to a whole model.
export function applyToonStyle(root: TransformNode, outlineWidth = 0.045): void {
  for (const m of root.getChildMeshes(false) as Mesh[]) {
    if (!m.material) continue;
    // skip transparent status meshes (slow ring / freeze cube)
    const mat = m.material as StandardMaterial;
    if (mat.alpha !== undefined && mat.alpha < 1) continue;
    m.renderOutline = true;
    m.outlineColor = OUTLINE;
    m.outlineWidth = outlineWidth;
    addShadowCaster(m);
  }
}

// Soft radial-gradient sprite for particle systems (no external texture file).
let softCircle: Texture | null = null;
export function softCircleTexture(scene: Scene): Texture {
  if (softCircle) return softCircle;
  const size = 64;
  const dt = new DynamicTexture("softCircle", size, scene, false);
  const ctx = dt.getContext() as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.7)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  dt.hasAlpha = true;
  dt.update();
  softCircle = dt;
  return dt;
}

export function clearMaterialCache(): void {
  cache.clear();
}
