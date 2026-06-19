import { ArcRotateCamera, Vector3, Scene } from "../bjs";
import type { MapData } from "../config/types";

// Fixed iso/3-quarter view for the MVP. Rotation is locked (architecture
// keeps alpha/beta so free-rotate can be enabled later); zoom + pan + reset
// are supported via wheel / drag / pinch. Distinguishes tap (for picking)
// from drag (for panning).
export class CameraController {
  readonly camera: ArcRotateCamera;
  onTap: ((clientX: number, clientY: number) => void) | null = null;

  private readonly def = { alpha: -Math.PI / 2 - 0.66, beta: 0.82, radius: 42 };
  private readonly minR = 18;
  private readonly maxR = 64;

  private shakeTime = 0;
  private shakeMag = 0;
  private dragging = false;
  private moved = 0;
  private lastX = 0;
  private lastY = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;

  constructor(scene: Scene, private canvas: HTMLCanvasElement, private map: MapData) {
    const target = new Vector3(0, 0.5, -1);
    this.camera = new ArcRotateCamera("cam", this.def.alpha, this.def.beta, this.def.radius, target, scene);
    this.camera.fov = 0.62;
    this.camera.minZ = 0.5;
    this.camera.maxZ = 300;
    // lock rotation; we drive zoom/pan ourselves
    this.camera.lowerAlphaLimit = this.camera.upperAlphaLimit = this.def.alpha;
    this.camera.lowerBetaLimit = this.camera.upperBetaLimit = this.def.beta;
    this.camera.lowerRadiusLimit = this.minR;
    this.camera.upperRadiusLimit = this.maxR;
    this.attach();

    // screen-shake via projection offset (doesn't disturb pan/zoom state)
    scene.onBeforeRenderObservable.add(() => {
      if (this.shakeTime > 0) {
        const dt = scene.getEngine().getDeltaTime() / 1000;
        this.shakeTime -= dt;
        const k = Math.max(0, this.shakeTime) * this.shakeMag;
        this.camera.targetScreenOffset.set((Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
        if (this.shakeTime <= 0) this.camera.targetScreenOffset.set(0, 0);
      }
    });
  }

  shake(magnitude = 0.6, duration = 0.5): void {
    this.shakeTime = duration;
    this.shakeMag = magnitude / duration;
  }

  reset(): void {
    this.camera.alpha = this.def.alpha;
    this.camera.beta = this.def.beta;
    this.camera.radius = this.def.radius;
    this.camera.setTarget(new Vector3(0, 0.5, -1));
  }

  private attach(): void {
    const c = this.canvas;
    c.addEventListener("pointerdown", (e) => {
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) {
        this.dragging = true;
        this.moved = 0;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      } else if (this.pointers.size === 2) {
        this.pinchDist = this.currentPinch();
      }
    });

    c.addEventListener("pointermove", (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size >= 2) {
        const d = this.currentPinch();
        if (this.pinchDist > 0) {
          const delta = this.pinchDist - d;
          this.zoom(delta * 0.05);
        }
        this.pinchDist = d;
        this.dragging = false;
        return;
      }
      if (this.dragging) {
        const dx = e.clientX - this.lastX;
        const dy = e.clientY - this.lastY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this.moved += Math.abs(dx) + Math.abs(dy);
        this.pan(dx, dy);
      }
    });

    const up = (e: PointerEvent) => {
      const wasTap = this.dragging && this.moved < 8;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinchDist = 0;
      if (this.pointers.size === 0) this.dragging = false;
      if (wasTap && this.onTap) this.onTap(e.clientX, e.clientY);
    };
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);

    c.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.zoom(e.deltaY * 0.02);
      },
      { passive: false }
    );
  }

  private currentPinch(): number {
    const pts = [...this.pointers.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  private zoom(delta: number): void {
    this.camera.radius = Math.min(this.maxR, Math.max(this.minR, this.camera.radius + delta));
  }

  private pan(dx: number, dy: number): void {
    const a = this.camera.alpha;
    const scale = this.camera.radius * 0.0016;
    // ground-plane right/forward vectors derived from azimuth
    const right = { x: Math.cos(a), z: -Math.sin(a) };
    const fwd = { x: Math.sin(a), z: Math.cos(a) };
    const t = this.camera.target;
    let nx = t.x - (right.x * dx + fwd.x * dy) * scale;
    let nz = t.z - (right.z * dx + fwd.z * dy) * scale;
    const b = this.map.bounds;
    nx = Math.min(b.maxX + 4, Math.max(b.minX - 4, nx));
    nz = Math.min(b.maxZ + 4, Math.max(b.minZ - 4, nz));
    this.camera.setTarget(new Vector3(nx, t.y, nz));
  }
}
