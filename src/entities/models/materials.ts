import {
  Color3,
  StandardMaterial,
  Scene,
  DynamicTexture,
  Texture,
  TransformNode,
  Mesh,
} from "../../bjs";
import { CustomMaterial } from "@babylonjs/materials";
import { addShadowCaster } from "../../render/shadows";

const cache = new Map<string, StandardMaterial | CustomMaterial>();
const OUTLINE = new Color3(0.05, 0.03, 0.1);

function normalizeHex(hex: string): string {
  return hex.startsWith("#") ? hex : `#${hex}`;
}

// Toon material: a StandardMaterial (so it receives shadows + fog) with
// injected GLSL that posterizes the lit color into bands and adds a fresnel
// rim light — a hand-drawn cartoon look that real shadows still fall onto.
export function toonMat(scene: Scene, hex: string): CustomMaterial {
  const key = `toon|${hex}`;
  const hit = cache.get(key);
  if (hit) return hit as CustomMaterial;
  const c = Color3.FromHexString(normalizeHex(hex));
  const m = new CustomMaterial(`toon_${hex}`, scene);
  m.diffuseColor = c;
  m.emissiveColor = c.scale(0.14); // ambient fill so shadowed side isn't black
  m.specularColor = new Color3(0.05, 0.05, 0.06);
  m.specularPower = 128;
  m.Fragment_Before_FragColor(`
    // --- toon banding ---
    float bands = 4.0;
    color.rgb = floor(color.rgb * bands + 0.5) / bands;
    // --- fresnel rim light ---
    vec3 V = normalize(vEyePosition.xyz - vPositionW);
    float rim = pow(1.0 - clamp(dot(normalize(vNormalW), V), 0.0, 1.0), 3.0);
    color.rgb += rim * vec3(0.22, 0.22, 0.28);
  `);
  cache.set(key, m);
  return m;
}

// Standard material that RECEIVES shadows — ground/path/big surfaces.
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

// Ground/terrain material with a procedural noise normal map for surface relief.
export function bumpyMat(scene: Scene, hex: string, repeat = 8, strength = 0.6): StandardMaterial {
  const key = `bump|${hex}|${repeat}|${strength}`;
  const hit = cache.get(key);
  if (hit) return hit as StandardMaterial;
  const m = flatMat(scene, hex, 0.14);
  const clone = m.clone(`bumpc_${key}`)!;
  const nrm = noiseNormalTexture(scene);
  nrm.uScale = repeat;
  nrm.vScale = repeat;
  clone.bumpTexture = nrm;
  clone.bumpTexture.level = strength;
  cache.set(key, clone);
  return clone;
}

// Bright emissive material for glowing bits (bloom picks these up).
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

// Cartoon dark outline + receive/cast shadows, applied to a whole model.
export function applyToonStyle(root: TransformNode, outlineWidth = 0.045): void {
  for (const m of root.getChildMeshes(false) as Mesh[]) {
    if (!m.material) continue;
    const mat = m.material as StandardMaterial;
    if (mat.alpha !== undefined && mat.alpha < 1) continue; // skip status meshes
    m.renderOutline = true;
    m.outlineColor = OUTLINE;
    m.outlineWidth = outlineWidth;
    m.receiveShadows = true;
    addShadowCaster(m);
  }
}

// --- procedural textures (no external files) -------------------------------
let noiseNrm: Texture | null = null;
function noiseNormalTexture(scene: Scene): Texture {
  if (noiseNrm) return noiseNrm;
  const size = 128;
  const dt = new DynamicTexture("noiseNrm", size, scene, false);
  const ctx = dt.getContext() as CanvasRenderingContext2D;
  const img = ctx.createImageData(size, size);
  // value-noise heightfield -> normal map
  const h = (x: number, y: number): number => {
    const xi = (x + size) % size, yi = (y + size) % size;
    let v = 0;
    v += Math.sin(xi * 0.20) * Math.cos(yi * 0.18);
    v += Math.sin(xi * 0.07 + 1.3) * Math.cos(yi * 0.09 + 0.5) * 1.5;
    v += (Math.sin(xi * 0.9) * Math.cos(yi * 0.8)) * 0.25;
    return v;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = h(x + 1, y) - h(x - 1, y);
      const dy = h(x, y + 1) - h(x, y - 1);
      const nx = -dx, ny = -dy, nz = 2.0;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      img.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  dt.update();
  dt.wrapU = Texture.WRAP_ADDRESSMODE;
  dt.wrapV = Texture.WRAP_ADDRESSMODE;
  noiseNrm = dt;
  return dt;
}

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
