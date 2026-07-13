import {
  Scene,
  Camera,
  Vector3,
  Color3,
  Color4,
  HemisphericLight,
  DirectionalLight,
  ShadowGenerator,
  DefaultRenderingPipeline,
  MeshBuilder,
  Mesh,
  StandardMaterial,
  RawTexture,
  Texture,
  ImageProcessingConfiguration,
  CubeTexture,
} from "../bjs";
import { setShadowGenerator } from "./shadows";

// One call wires up the whole "premium stylized" look: warm key + cool fill
// lighting, soft shadows, a layered sky dome + drifting clouds, atmospheric
// fog, and a post pipeline (ACES tonemapping + restrained bloom + FXAA).
export function setupVisuals(scene: Scene, camera: Camera): ShadowGenerator {
  scene.clearColor = new Color4(0.16, 0.13, 0.26, 1);
  scene.ambientColor = new Color3(0.5, 0.5, 0.6);

  // image-based lighting so glb PBR materials render with authored colors
  const base = (import.meta as unknown as { env: { BASE_URL: string } }).env.BASE_URL;
  scene.environmentTexture = CubeTexture.CreateFromPrefilteredData(`${base}assets/env/environment.env`, scene);
  scene.environmentIntensity = 0.9;

  // --- fog for depth (light haze tinted toward the warm sky horizon) ---
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.004;
  scene.fogColor = new Color3(0.74, 0.82, 0.9);

  // --- lights: strong warm key vs. cool fill for real light/shadow contrast ---
  const hemi = new HemisphericLight("hemi", new Vector3(0.1, 1, 0.2), scene);
  hemi.intensity = 0.7;
  hemi.diffuse = new Color3(1.0, 0.98, 0.9);
  hemi.groundColor = new Color3(0.34, 0.44, 0.3); // green grass bounce

  const key = new DirectionalLight("key", new Vector3(-0.55, -1, -0.45), scene);
  key.position = new Vector3(40, 70, 35);
  key.intensity = 1.6;
  key.diffuse = new Color3(1.0, 0.9, 0.72); // warm sun

  // soft cool fill from the opposite side so back-lit shapes don't go black
  const fill = new DirectionalLight("fill", new Vector3(0.5, -0.4, 0.6), scene);
  fill.intensity = 0.35;
  fill.diffuse = new Color3(0.7, 0.78, 1.0);

  // --- soft shadows ---
  const sg = new ShadowGenerator(1024, key);
  sg.useBlurExponentialShadowMap = true;
  sg.blurKernel = 24;
  sg.depthScale = 50;
  sg.darkness = 0.55;
  sg.bias = 0.0015;
  setShadowGenerator(sg);

  // --- layered sky dome (3-band vertical gradient via emissive RawTexture) ---
  const sky = MeshBuilder.CreateSphere("sky", { diameter: 600, segments: 16, sideOrientation: 1 }, scene);
  sky.infiniteDistance = true;
  sky.isPickable = false;
  const skyMat = new StandardMaterial("skyMat", scene);
  skyMat.disableLighting = true;
  skyMat.backFaceCulling = false;
  skyMat.emissiveTexture = skyGradientTexture(scene);
  skyMat.diffuseColor = new Color3(0, 0, 0);
  sky.material = skyMat;
  sky.applyFog = false;

  buildClouds(scene);

  // --- post-processing pipeline ---
  const pipe = new DefaultRenderingPipeline("pipe", true, scene, [camera]);
  pipe.fxaaEnabled = true;
  pipe.samples = 4;

  // restrained bloom: only bright emissive bits (crystals/portal/runes/bolts)
  // pick up a soft halo; models stay crisp thanks to the high threshold.
  pipe.bloomEnabled = true;
  pipe.bloomThreshold = 0.9;
  pipe.bloomWeight = 0.12;
  pipe.bloomKernel = 32;
  pipe.bloomScale = 0.5;

  pipe.imageProcessingEnabled = true;
  const ip = pipe.imageProcessing;
  ip.toneMappingEnabled = true;
  ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  ip.exposure = 1.05;
  ip.contrast = 1.08;
  ip.vignetteEnabled = false;

  return sg;
}

// Vertical 3-stop gradient (zenith deep blue -> mid sky blue -> warm horizon)
// baked into a tall RawTexture. NullEngine-safe (no canvas/DynamicTexture).
function skyGradientTexture(scene: Scene): RawTexture {
  const h = 256, w = 4;
  const data = new Uint8Array(w * h * 4);
  const zenith = Color3.FromHexString("#3d6fc4");
  const mid = Color3.FromHexString("#7fb2e8");
  const horizon = Color3.FromHexString("#f2e8d0");
  const lerp = (a: Color3, b: Color3, t: number): Color3 =>
    new Color3(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
  for (let y = 0; y < h; y++) {
    // v=0 (top row) is the zenith on a sphere; v=1 (bottom) is the horizon
    const v = y / (h - 1);
    let c: Color3;
    if (v < 0.5) c = lerp(zenith, mid, v / 0.5);
    else c = lerp(mid, horizon, (v - 0.5) / 0.5);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      data[i] = (c.r * 255) | 0;
      data[i + 1] = (c.g * 255) | 0;
      data[i + 2] = (c.b * 255) | 0;
      data[i + 3] = 255;
    }
  }
  const tex = RawTexture.CreateRGBATexture(data, w, h, scene, false, false, Texture.BILINEAR_SAMPLINGMODE);
  tex.wrapU = Texture.CLAMP_ADDRESSMODE;
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  return tex;
}

// A handful of low-poly clouds high above the arena, drifting very slowly so
// they never occlude the top-down play area. Each cloud is a merged clump of
// flattened spheres with a soft white material.
function buildClouds(scene: Scene): void {
  const cloudMat = new StandardMaterial("cloudMat", scene);
  cloudMat.diffuseColor = new Color3(1, 1, 1);
  cloudMat.emissiveColor = new Color3(0.55, 0.6, 0.68); // soft, below bloom threshold
  cloudMat.specularColor = new Color3(0, 0, 0);
  cloudMat.freeze();

  const rng = (() => {
    let s = 1337;
    return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  })();

  const clouds: { mesh: Mesh; speed: number }[] = [];
  const count = 7;
  const spanX = 130, spanZ = 90;
  for (let i = 0; i < count; i++) {
    const puffs: Mesh[] = [];
    const lobes = 4 + ((rng() * 3) | 0);
    for (let j = 0; j < lobes; j++) {
      const r = 3 + rng() * 3;
      const p = MeshBuilder.CreateSphere(`cloudP_${i}_${j}`, { diameter: r * 2, segments: 6 }, scene);
      p.position.set((rng() - 0.5) * 9, (rng() - 0.5) * 1.5, (rng() - 0.5) * 5);
      p.scaling.y = 0.6;
      puffs.push(p);
    }
    const merged = Mesh.MergeMeshes(puffs, true, true) as Mesh;
    merged.name = `cloud_${i}`;
    merged.material = cloudMat;
    merged.isPickable = false;
    merged.applyFog = false;
    merged.receiveShadows = false;
    merged.position.set((rng() - 0.5) * spanX, 34 + rng() * 12, (rng() - 0.5) * spanZ);
    clouds.push({ mesh: merged, speed: 0.25 + rng() * 0.4 });
  }

  const halfX = spanX / 2 + 20;
  scene.registerBeforeRender(() => {
    const dt = scene.getEngine().getDeltaTime() * 0.001;
    for (const c of clouds) {
      c.mesh.position.x += c.speed * dt;
      if (c.mesh.position.x > halfX) c.mesh.position.x = -halfX;
    }
  });
}
