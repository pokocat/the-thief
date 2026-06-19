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
} from "../bjs";
import { GradientMaterial } from "@babylonjs/materials";
import { setShadowGenerator } from "./shadows";

// One call wires up the whole "premium stylized" look: warm key + cool fill
// lighting, soft shadows, a gradient sky dome, atmospheric fog, and a
// post pipeline (ACES tonemapping + bloom + FXAA + vignette).
export function setupVisuals(scene: Scene, camera: Camera): ShadowGenerator {
  scene.clearColor = new Color4(0.16, 0.13, 0.26, 1);
  scene.ambientColor = new Color3(0.5, 0.5, 0.6);

  // --- fog for depth ---
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.0085;
  scene.fogColor = new Color3(0.42, 0.34, 0.52);

  // --- lights ---
  const hemi = new HemisphericLight("hemi", new Vector3(0.1, 1, 0.2), scene);
  hemi.intensity = 0.65;
  hemi.diffuse = new Color3(1.0, 0.96, 0.85); // warm sky
  hemi.groundColor = new Color3(0.32, 0.28, 0.45); // cool bounce

  const key = new DirectionalLight("key", new Vector3(-0.55, -1, -0.45), scene);
  key.position = new Vector3(40, 70, 35);
  key.intensity = 1.45;
  key.diffuse = new Color3(1.0, 0.93, 0.78);

  // --- soft shadows ---
  const sg = new ShadowGenerator(1024, key);
  sg.useBlurExponentialShadowMap = true;
  sg.blurKernel = 24;
  sg.depthScale = 50;
  sg.darkness = 0.45;
  sg.bias = 0.0015;
  setShadowGenerator(sg);

  // --- gradient sky dome ---
  const sky = MeshBuilder.CreateSphere("sky", { diameter: 600, segments: 16, sideOrientation: 1 }, scene);
  sky.infiniteDistance = true;
  sky.isPickable = false;
  const skyMat = new GradientMaterial("skyMat", scene);
  skyMat.topColor = Color3.FromHexString("#3a2f6e");
  skyMat.bottomColor = Color3.FromHexString("#c79bd6");
  skyMat.offset = 0.35;
  skyMat.smoothness = 1.2;
  skyMat.disableLighting = true;
  skyMat.backFaceCulling = false;
  sky.material = skyMat;
  sky.applyFog = false;

  // --- post-processing pipeline ---
  const pipe = new DefaultRenderingPipeline("pipe", true, scene, [camera]);
  pipe.fxaaEnabled = true;
  pipe.samples = 4;

  pipe.bloomEnabled = true;
  pipe.bloomThreshold = 0.72;
  pipe.bloomWeight = 0.65;
  pipe.bloomKernel = 64;
  pipe.bloomScale = 0.6;

  pipe.imageProcessingEnabled = true;
  const ip = pipe.imageProcessing;
  ip.toneMappingEnabled = true;
  ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  ip.exposure = 1.15;
  ip.contrast = 1.25;
  ip.vignetteEnabled = true;
  ip.vignetteWeight = 2.2;
  ip.vignetteColor = new Color4(0.05, 0.03, 0.1, 1);

  return sg;
}
