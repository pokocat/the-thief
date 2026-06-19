import { Vector3, Matrix, Scene, Camera } from "../bjs";
import { bus } from "../core/Events";
import { ObjectPool } from "../core/ObjectPool";
import type { Enemy } from "../entities/Enemy";

interface FloatText {
  el: HTMLElement;
  world: Vector3;
  age: number;
  life: number;
}

// HTML overlay for health bars and floating text, projected from world to
// screen each frame. All elements are pooled.
export class WorldOverlay {
  private barPool: ObjectPool<HTMLElement>;
  private textPool: ObjectPool<HTMLElement>;
  private texts: FloatText[] = [];

  constructor(private scene: Scene, private camera: Camera, private container: HTMLElement) {
    this.barPool = new ObjectPool<HTMLElement>({
      create: () => {
        const wrap = document.createElement("div");
        wrap.className = "hpbar";
        const fill = document.createElement("div");
        fill.className = "hpbar-fill";
        wrap.appendChild(fill);
        this.container.appendChild(wrap);
        wrap.style.display = "none";
        return wrap;
      },
      onAcquire: (el) => (el.style.display = "block"),
      onRelease: (el) => (el.style.display = "none"),
    });
    this.textPool = new ObjectPool<HTMLElement>({
      create: () => {
        const el = document.createElement("div");
        el.className = "floattext";
        this.container.appendChild(el);
        el.style.display = "none";
        return el;
      },
      onAcquire: (el) => (el.style.display = "block"),
      onRelease: (el) => (el.style.display = "none"),
    });

    bus.on("enemyKilled", (p) => {
      this.spawnText(`+${Math.round(p.goldReward)}`, new Vector3(p.worldX, p.worldY, p.worldZ), "kill", false);
    });
    bus.on("goldStolen", (p) => {
      this.spawnText(`偷 +${Math.round(p.amount)}`, new Vector3(p.worldX, p.worldY, p.worldZ), "steal", p.big);
    });
  }

  acquireBar(): HTMLElement {
    return this.barPool.acquire();
  }
  releaseBar(el: HTMLElement): void {
    this.barPool.release(el);
  }

  spawnText(text: string, world: Vector3, kind: "kill" | "steal" | "loss", big: boolean): void {
    const el = this.textPool.acquire();
    el.textContent = text;
    el.className = `floattext ${kind}${big ? " big" : ""}`;
    this.texts.push({ el, world: world.clone(), age: 0, life: big ? 1.6 : 1.1 });
  }

  private project(world: Vector3, out: { x: number; y: number; behind: boolean }): void {
    const engine = this.scene.getEngine();
    const w = engine.getRenderWidth();
    const h = engine.getRenderHeight();
    const p = Vector3.Project(
      world,
      Matrix.Identity(),
      this.scene.getTransformMatrix(),
      this.camera.viewport.toGlobal(w, h)
    );
    out.x = p.x;
    out.y = p.y;
    out.behind = p.z < 0 || p.z > 1;
  }

  update(enemies: Enemy[], dt: number): void {
    const tmp = { x: 0, y: 0, behind: false };
    // health bars
    for (const e of enemies) {
      if (!e.barEl) continue;
      this.project(e.topAnchor, tmp);
      if (tmp.behind) {
        e.barEl.style.display = "none";
        continue;
      }
      e.barEl.style.display = "block";
      e.barEl.style.transform = `translate(-50%,-50%) translate(${tmp.x}px, ${tmp.y}px)`;
      const fill = e.barEl.firstChild as HTMLElement;
      const ratio = Math.max(0, e.hp / e.maxHp);
      fill.style.width = `${ratio * 100}%`;
      fill.style.background = ratio > 0.5 ? "#5fd35f" : ratio > 0.25 ? "#e8c23a" : "#e8553a";
    }
    // floating text
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.age += dt;
      if (t.age >= t.life) {
        this.textPool.release(t.el);
        this.texts.splice(i, 1);
        continue;
      }
      const k = t.age / t.life;
      const rise = new Vector3(t.world.x, t.world.y + k * 2.2, t.world.z);
      this.project(rise, tmp);
      if (tmp.behind) {
        t.el.style.display = "none";
        continue;
      }
      t.el.style.display = "block";
      t.el.style.opacity = `${1 - k}`;
      t.el.style.transform = `translate(-50%,-50%) translate(${tmp.x}px, ${tmp.y}px)`;
    }
  }
}
