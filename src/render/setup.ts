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
  ImageProcessingConfiguration,
  CubeTexture,
} from "../bjs";
import { GradientMaterial } from "@babylonjs/materials";
import { setShadowGenerator } from "./shadows";

// One call wires up the whole "premium stylized" look: warm key + cool fill
// lighting, soft shadows, a gradient sky dome, atmospheric fog, and a
// post pipeline (ACES tonemapping + bloom + FXAA + vignette).
export function setupVisuals(scene: Scene, camera: Camera): ShadowGenerator {
  scene.clearColor = new Color4(0.16, 0.13, 0.26, 1);
  scene.ambientColor = new Color3(0.5, 0.5, 0.6);

  // image-based lighting so glb PBR materials render with authored colors
  const base = (import.meta as unknown as { env: { BASE_URL: string } }).env.BASE_URL;
  scene.environmentTexture = CubeTexture.CreateFromPrefilteredData(`${base}assets/env/environment.env`, scene);
  scene.environmentIntensity = 1.15;

  // --- fog for depth (light daylight haze, classic grassy-map look) ---
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.006;
  scene.fogColor = new Color3(0.66, 0.78, 0.9);

  // --- lights ---
  const hemi = new HemisphericLight("hemi", new Vector3(0.1, 1, 0.2), scene);
  hemi.intensity = 0.95;
  hemi.diffuse = new Color3(1.0, 0.98, 0.9); // bright daylight
  hemi.groundColor = new Color3(0.4, 0.5, 0.35); // green grass bounce

  const key = new DirectionalLight("key", new Vector3(-0.55, -1, -0.45), scene);
  key.position = new Vector3(40, 70, 35);
  key.intensity = 1.5;
  key.diffuse = new Color3(1.0, 0.93, 0.78);

  // soft fill from the opposite side so back-lit characters don't go black
  const fill = new DirectionalLight("fill", new Vector3(0.5, -0.4, 0.6), scene);
  fill.intensity = 0.45;
  fill.diffuse = new Color3(0.7, 0.78, 1.0);

  // --- soft shadows ---
  const sg = new ShadowGenerator(1024, key);
  sg.useBlurExponentialShadowMap = true;
  sg.blurKernel = 24;
  sg.depthScale = 50;
  sg.darkness = 0.6;
  sg.bias = 0.0015;
  setShadowGenerator(sg);

  // --- gradient sky dome ---
  const sky = MeshBuilder.CreateSphere("sky", { diameter: 600, segments: 16, sideOrientation: 1 }, scene);
  sky.infiniteDistance = true;
  sky.isPickable = false;
  const skyMat = new GradientMaterial("skyMat", scene);
  skyMat.topColor = Color3.FromHexString("#4f86d8");
  skyMat.bottomColor = Color3.FromHexString("#cfeaff");
  skyMat.offset = 0.4;
  skyMat.smoothness = 1.2;
  skyMat.disableLighting = true;
  skyMat.backFaceCulling = false;
  sky.material = skyMat;
  sky.applyFog = false;

  // --- post-processing pipeline ---
  const pipe = new DefaultRenderingPipeline("pipe", true, scene, [camera]);
  pipe.fxaaEnabled = true;
  pipe.samples = 4;

  // bloom/glow halos disabled (they wash out the models); vignette off too
  pipe.bloomEnabled = false;

  pipe.imageProcessingEnabled = true;
  const ip = pipe.imageProcessing;
  ip.toneMappingEnabled = true;
  ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  ip.exposure = 1.25;
  ip.contrast = 1.05;
  ip.vignetteEnabled = false;

  return sg;
}
