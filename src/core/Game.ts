import { Engine, Scene } from "../bjs";
import { GameMap } from "../config";
import { PathSystem } from "../map/PathSystem";
import { SceneBuilder } from "../map/SceneBuilder";
import { GameState } from "./GameState";
import { WorldOverlay } from "../ui/WorldOverlay";
import { EffectSystem } from "../systems/EffectSystem";
import { EnemyManager } from "../entities/EnemyManager";
import { TowerManager } from "../entities/TowerManager";
import { CameraController } from "./CameraController";
import { WaveSystem } from "../systems/WaveSystem";
import { UI } from "../ui/UI";
import type { GameContext } from "./Context";

const FIXED_DT = 1 / 60;

export class Game {
  private engine: Engine;
  private scene: Scene;
  private ctx: GameContext;
  private waves: WaveSystem;
  private ui: UI;
  private overlay: WorldOverlay;
  private accumulator = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: false }, true);
    this.scene = new Scene(this.engine);

    const path = new PathSystem(GameMap);
    const builder = new SceneBuilder(this.scene, GameMap, path);
    builder.build();

    const camera = new CameraController(this.scene, canvas, GameMap);
    const state = new GameState();
    this.overlay = new WorldOverlay(this.scene, camera.camera, document.getElementById("ui-root")!);
    const effects = new EffectSystem(this.scene);
    const enemies = new EnemyManager(this.scene, path, state, this.overlay, effects);
    const towers = new TowerManager(this.scene);

    this.ctx = {
      scene: this.scene,
      camera: camera.camera,
      state,
      path,
      enemies,
      towers,
      effects,
      overlay: this.overlay,
      pads: builder.pads,
      time: 0,
    };

    this.waves = new WaveSystem(this.ctx);
    this.ui = new UI(this.ctx, this.waves, camera);

    camera.onTap = (x, y) => this.handleTap(x, y);

    this.waves.beginIntermission();
    this.start();
  }

  private handleTap(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const pick = this.scene.pick(px, py);
    const meta = pick?.pickedMesh?.metadata as { kind?: string; index?: number; uid?: number } | undefined;
    if (meta?.kind === "pad" && meta.index !== undefined) {
      this.ui.selectAt("pad", meta.index);
    } else if (meta?.kind === "tower" && meta.uid !== undefined) {
      this.ui.selectAt("tower", meta.uid);
    } else {
      this.ui.clearSelection();
    }
  }

  private step(dt: number): void {
    this.ctx.time += dt;
    this.waves.update(dt);
    this.ctx.enemies.update(dt, this.ctx.time);
    this.ctx.towers.update(dt, this.ctx);
    this.ctx.effects.update(dt);
  }

  private start(): void {
    this.engine.runRenderLoop(() => {
      const frame = Math.min(0.1, this.engine.getDeltaTime() / 1000);
      this.accumulator += frame;
      let guard = 0;
      while (this.accumulator >= FIXED_DT && guard < 5) {
        this.step(FIXED_DT);
        this.accumulator -= FIXED_DT;
        guard++;
      }
      // per-frame (variable) updates
      this.overlay.update(this.ctx.enemies.active, frame);
      this.ui.tick(frame);
      this.scene.render();
    });
    window.addEventListener("resize", () => this.engine.resize());
  }
}
