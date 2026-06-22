import { ArcRotateCamera, Vector3, Scene } from "../bjs";
import type { MapData } from "../config/types";

// 3/4 iso-ish view. Controls:
//   one finger / left-drag  -> rotate (orbit)
//   two fingers / pinch     -> zoom + pan
//   mouse wheel             -> zoom
//   tap (no drag)           -> pick (forwarded to onTap)
// Architecture supports any angle; a reset button restores the default view.
export class CameraController {
  readonly camera: ArcRotateCamera;
  onTap: ((clientX: number, clientY: number) => void) | null = null;

  private readonly def = { alpha: -Math.PI / 2 - 0.66, beta: 0.82, radius: 42 };
  private readonly minR = 14;
  private readonly maxR = 70;

  private shakeTime = 0;
  private shakeMag = 0;
  private dragging = false;
  private moved = 0;
  private lastX = 0;
  private lastY = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  private lastMid: { x: number; y: number } | null = null;

  constructor(scene: Scene, private canvas: HTMLCanvasElement, private map: MapData) {
    const target = new Vector3(0, 0.5, -1);
    this.camera = new ArcRotateCamera("cam", this.def.alpha, this.def.beta, this.def.radius, target, scene);
    this.camera.fov = 0.62;
    this.camera.minZ = 0.5;
    this.camera.maxZ = 300;
    // free horizontal rotation; clamp vertical so you can't flip under the map
    this.camera.lowerBetaLimit = 0.2;
    this.camera.upperBetaLimit = 1.35;
    this.camera.lowerRadiusLimit = this.minR;
    this.camera.upperRadiusLimit = this.maxR;
    this.attach();

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
        this.lastMid = this.currentMid();
        this.dragging = false;
      }
    });

    c.addEventListener("pointermove", (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.pointers.size >= 2) {
        // pinch zoom
        const d = this.currentPinch();
        if (this.pinchDist > 0) this.zoom((this.pinchDist - d) * 0.06);
        this.pinchDist = d;
        // two-finger pan (midpoint delta)
        const mid = this.currentMid();
        if (this.lastMid) this.pan(mid.x - this.lastMid.x, mid.y - this.lastMid.y);
        this.lastMid = mid;
        return;
      }

      if (this.dragging) {
        const dx = e.clientX - this.lastX;
        const dy = e.clientY - this.lastY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this.moved += Math.abs(dx) + Math.abs(dy);
        this.rotate(dx, dy);
      }
    });

    const up = (e: PointerEvent) => {
      const wasTap = this.dragging && this.moved < 8 && this.pointers.size === 1;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) {
        this.pinchDist = 0;
        this.lastMid = null;
      }
      if (this.pointers.size === 0) this.dragging = false;
      if (wasTap && this.onTap) this.onTap(e.clientX, e.clientY);
    };
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);

    c.addEventListener("wheel", (e) => { e.preventDefault(); this.zoom(e.deltaY * 0.02); }, { passive: false });
  }

  private currentPinch(): number {
    const pts = [...this.pointers.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }
  private currentMid(): { x: number; y: number } {
    const pts = [...this.pointers.values()];
    return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  }

  private rotate(dx: number, dy: number): void {
    this.camera.alpha -= dx * 0.005;
    this.camera.beta -= dy * 0.005;
  }

  private zoom(delta: number): void {
    this.camera.radius = Math.min(this.maxR, Math.max(this.minR, this.camera.radius + delta));
  }

  // grab-and-drag: the world follows the fingers (not reversed)
  private pan(dx: number, dy: number): void {
    const a = this.camera.alpha;
    const scale = this.camera.radius * 0.0016;
    const right = { x: Math.cos(a), z: -Math.sin(a) };
    const fwd = { x: Math.sin(a), z: Math.cos(a) };
    const t = this.camera.target;
    let nx = t.x + (right.x * dx + fwd.x * dy) * scale;
    let nz = t.z + (right.z * dx + fwd.z * dy) * scale;
    const b = this.map.bounds;
    nx = Math.min(b.maxX + 6, Math.max(b.minX - 6, nx));
    nz = Math.min(b.maxZ + 6, Math.max(b.minZ - 6, nz));
    this.camera.setTarget(new Vector3(nx, t.y, nz));
  }
}
