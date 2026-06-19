import { MeshBuilder, Vector3, Mesh, Scene } from "../bjs";
import { flatMat } from "../entities/models/materials";
import { ObjectPool } from "../core/ObjectPool";

interface Projectile {
  mesh: Mesh;
  from: Vector3;
  to: Vector3;
  t: number;
  dur: number;
  arc: number;
}
interface Burst {
  mesh: Mesh;
  age: number;
  life: number;
  grow: number;
}
interface Coin {
  mesh: Mesh;
  from: Vector3;
  age: number;
  life: number;
}

// Pooled visual effects: attack tracers, anti-air arcs, impact bursts,
// steal-coin pops. Everything reuses meshes (no per-frame allocation).
export class EffectSystem {
  private projPool: ObjectPool<Mesh>;
  private burstPool: ObjectPool<Mesh>;
  private coinPool: ObjectPool<Mesh>;
  private projectiles: Projectile[] = [];
  private bursts: Burst[] = [];
  private coins: Coin[] = [];

  constructor(private scene: Scene) {
    this.projPool = new ObjectPool<Mesh>({
      create: () => {
        const m = MeshBuilder.CreateSphere("proj", { diameter: 0.32, segments: 6 }, scene);
        m.isPickable = false;
        m.setEnabled(false);
        return m;
      },
      onAcquire: (m) => m.setEnabled(true),
      onRelease: (m) => m.setEnabled(false),
      prefill: 24,
    });
    this.burstPool = new ObjectPool<Mesh>({
      create: () => {
        const m = MeshBuilder.CreateSphere("burst", { diameter: 1, segments: 6 }, scene);
        m.isPickable = false;
        m.setEnabled(false);
        return m;
      },
      onAcquire: (m) => m.setEnabled(true),
      onRelease: (m) => m.setEnabled(false),
      prefill: 12,
    });
    this.coinPool = new ObjectPool<Mesh>({
      create: () => {
        const m = MeshBuilder.CreateCylinder("coin", { diameter: 0.5, height: 0.12, tessellation: 10 }, scene);
        m.material = flatMat(scene, "#ffcc33", 0.7);
        m.isPickable = false;
        m.setEnabled(false);
        return m;
      },
      onAcquire: (m) => m.setEnabled(true),
      onRelease: (m) => m.setEnabled(false),
      prefill: 16,
    });
  }

  fireProjectile(from: Vector3, to: Vector3, colorHex: string, arc = 0): void {
    const mesh = this.projPool.acquire();
    mesh.material = flatMat(this.scene, colorHex, 0.8);
    mesh.position.copyFrom(from);
    const dist = Vector3.Distance(from, to);
    this.projectiles.push({
      mesh,
      from: from.clone(),
      to: to.clone(),
      t: 0,
      dur: Math.max(0.08, dist / 28),
      arc,
    });
  }

  burst(pos: Vector3, colorHex: string, size = 1.2): void {
    const mesh = this.burstPool.acquire();
    mesh.material = flatMat(this.scene, colorHex, 0.9);
    mesh.position.copyFrom(pos);
    mesh.scaling.setAll(0.2);
    this.bursts.push({ mesh, age: 0, life: 0.28, grow: size });
  }

  coinPop(pos: Vector3, big: boolean): void {
    const n = big ? 5 : 2;
    for (let i = 0; i < n; i++) {
      const mesh = this.coinPool.acquire();
      mesh.position.set(pos.x + (Math.random() - 0.5) * 0.6, pos.y, pos.z + (Math.random() - 0.5) * 0.6);
      mesh.scaling.setAll(big ? 1.4 : 1);
      this.coins.push({ mesh, from: mesh.position.clone(), age: 0, life: 0.7 });
    }
  }

  update(dt: number): void {
    // projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      p.mesh.position.set(
        p.from.x + (p.to.x - p.from.x) * k,
        p.from.y + (p.to.y - p.from.y) * k + Math.sin(k * Math.PI) * p.arc,
        p.from.z + (p.to.z - p.from.z) * k
      );
      if (k >= 1) {
        this.projPool.release(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
    // bursts
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.age += dt;
      const k = b.age / b.life;
      b.mesh.scaling.setAll(0.2 + k * b.grow);
      if (k >= 1) {
        this.burstPool.release(b.mesh);
        this.bursts.splice(i, 1);
      }
    }
    // coins
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.age += dt;
      const k = c.age / c.life;
      c.mesh.position.y = c.from.y + k * 2.5;
      c.mesh.rotation.x += dt * 12;
      c.mesh.scaling.setAll((1 - k) * (c.mesh.scaling.x > 1 ? 1.4 : 1) + 0.05);
      if (k >= 1) {
        this.coinPool.release(c.mesh);
        this.coins.splice(i, 1);
      }
    }
  }
}
