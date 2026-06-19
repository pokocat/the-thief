import { Color3, StandardMaterial, Scene } from "../../bjs";

// Cached flat-cartoon materials, keyed by color + emissive level, so many
// units share the same material (fewer state changes / draw batches).
const cache = new Map<string, StandardMaterial>();

export function flatMat(scene: Scene, hex: string, emissive = 0.25): StandardMaterial {
  const key = `${hex}|${emissive}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = Color3.FromHexString(normalizeHex(hex));
  const m = new StandardMaterial(`m_${key}`, scene);
  m.diffuseColor = c;
  m.emissiveColor = c.scale(emissive);
  m.specularColor = new Color3(0.1, 0.1, 0.1);
  m.specularPower = 64;
  cache.set(key, m);
  return m;
}

function normalizeHex(hex: string): string {
  return hex.startsWith("#") ? hex : `#${hex}`;
}

export function translucentMat(scene: Scene, hex: string, alpha: number, emissive = 0.5): StandardMaterial {
  const key = `t|${hex}|${alpha}|${emissive}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = Color3.FromHexString(normalizeHex(hex));
  const m = new StandardMaterial(`tm_${key}`, scene);
  m.diffuseColor = c;
  m.emissiveColor = c.scale(emissive);
  m.alpha = alpha;
  m.specularColor = new Color3(0, 0, 0);
  cache.set(key, m);
  return m;
}

export function clearMaterialCache(): void {
  cache.clear();
}
