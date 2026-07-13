import { MeshBuilder, Vector3, Mesh, Scene } from "../bjs";
import { glowMat } from "../entities/models/materials";
import { ObjectPool } from "../core/ObjectPool";

const TRAIL = 3; // ghost spheres per projectile
const FRAGS = 5; // shrapnel spheres per impact burst

// per-tower-category projectile shape (all share the sphere pool; only the
// scaling / spin / aim params differ)
interface KindParam {
  sx: number;
  sy: number;
  sz: number;
  durMul: number;
  aim: boolean; // orient the long axis along travel direction
  spin: number; // rad/s tumble (daggers)
}
const KINDS: Record<string, KindParam> = {
  mage: { sx: 1, sy: 1, sz: 1, durMul: 1, aim: false, spin: 0 },
  hero: { sx: 1.1, sy: 1.1, sz: 1.1, durMul: 1, aim: false, spin: 0 },
  frost: { sx: 0.8, sy: 0.8, sz: 1.7, durMul: 0.7, aim: true, spin: 0 }, // fast, ellipsoidal
  archer: { sx: 0.35, sy: 0.35, sz: 2.6, durMul: 0.8, aim: true, spin: 0 }, // long arrow
  thief: { sx: 0.3, sy: 0.72, sz: 0.3, durMul: 0.85, aim: false, spin: 14 }, // tumbling dagger
};

interface Projectile {
  mesh: Mesh;
  ghosts: Mesh[];
  from: Vector3;
  to: Vector3;
  t: number;
  dur: number;
  arc: number;
  k: KindParam;
  ang: number; // current spin angle
}
interface Frag {
  mesh: Mesh;
  vx: number;
  vy: number;
  vz: number;
}
interface Burst {
  mesh: Mesh;
  age: number;
  life: number;
  grow: number;
  frags: Frag[];
}
interface Coin {
  mesh: Mesh;
  from: Vector3;
  age: number;
  life: number;
}

// Pooled visual effects: attack tracers (with trails + per-kind shapes),
// impact bursts (with shrapnel), steal-coin pops. Everything reuses meshes
// (no per-frame allocation on the hot path).
export class EffectSystem {
  private projPool: ObjectPool<Mesh>;
  private trailPool: ObjectPool<Mesh>;
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
      onRelease: (m) => {
        m.setEnabled(false);
        m.rotation.set(0, 0, 0);
        m.scaling.setAll(1);
      },
      prefill: 24,
    });
    this.trailPool = new ObjectPool<Mesh>({
      create: () => {
        const m = MeshBuilder.CreateSphere("projTrail", { diameter: 0.32, segments: 5 }, scene);
        m.isPickable = false;
        m.setEnabled(false);
        return m;
      },
      onAcquire: (m) => m.setEnabled(true),
      onRelease: (m) => {
        m.setEnabled(false);
        m.rotation.set(0, 0, 0);
        m.scaling.setAll(1);
      },
      prefill: 48,
    });
    this.burstPool = new ObjectPool<Mesh>({
      create: () => {
        const m = MeshBuilder.CreateSphere("burst", { diameter: 1, segments: 6 }, scene);
        m.isPickable = false;
        m.setEnabled(false);
        return m;
      },
      onAcquire: (m) => m.setEnabled(true),
      onRelease: (m) => {
        m.setEnabled(false);
        m.scaling.setAll(1);
      },
      prefill: 36,
    });
    this.coinPool = new ObjectPool<Mesh>({
      create: () => {
        const m = MeshBuilder.CreateCylinder("coin", { diameter: 0.5, height: 0.12, tessellation: 10 }, scene);
        m.material = glowMat(scene, "#ffcf3a", 1.4);
        m.isPickable = false;
        m.setEnabled(false);
        return m;
      },
      onAcquire: (m) => m.setEnabled(true),
      onRelease: (m) => m.setEnabled(false),
      prefill: 16,
    });
  }

  fireProjectile(from: Vector3, to: Vector3, colorHex: string, arc = 0, kind = "mage"): void {
    const k = KINDS[kind] ?? KINDS.mage;
    const mat = glowMat(this.scene, colorHex, 1.5);
    const mesh = this.projPool.acquire();
    mesh.material = mat;
    mesh.position.copyFrom(from);
    mesh.scaling.set(k.sx, k.sy, k.sz);

    // aim the long axis down the travel direction (arrows / frost bolts)
    if (k.aim) {
      const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
      const yaw = Math.atan2(dx, dz);
      const pitch = -Math.atan2(dy, Math.hypot(dx, dz));
      mesh.rotation.set(pitch, yaw, 0);
    } else {
      mesh.rotation.set(0, 0, 0);
    }

    const ghosts: Mesh[] = [];
    for (let i = 0; i < TRAIL; i++) {
      const g = this.trailPool.acquire();
      g.material = mat;
      g.rotation.copyFrom(mesh.rotation);
      g.position.copyFrom(from);
      ghosts.push(g);
    }

    const dist = Vector3.Distance(from, to);
    this.projectiles.push({
      mesh,
      ghosts,
      from: from.clone(),
      to: to.clone(),
      t: 0,
      dur: Math.max(0.08, dist / 28) * k.durMul,
      arc,
      k,
      ang: 0,
    });
  }

  burst(pos: Vector3, colorHex: string, size = 1.2): void {
    const mat = glowMat(this.scene, colorHex, 1.7);
    const mesh = this.burstPool.acquire();
    mesh.material = mat;
    mesh.position.copyFrom(pos);
    mesh.scaling.setAll(0.2);
    const frags: Frag[] = [];
    const speed = 2.4 * size;
    for (let i = 0; i < FRAGS; i++) {
      const f = this.burstPool.acquire();
      f.material = mat;
      f.position.copyFrom(pos);
      f.scaling.setAll(0.32 * size);
      // random-ish outward direction (biased slightly upward)
      const a = (i / FRAGS) * Math.PI * 2 + Math.random() * 0.8;
      const up = 0.4 + Math.random() * 0.9;
      const horiz = Math.cos(Math.random() * 1.2);
      frags.push({ mesh: f, vx: Math.cos(a) * horiz * speed, vy: up * speed, vz: Math.sin(a) * horiz * speed });
    }
    this.bursts.push({ mesh, age: 0, life: 0.34, grow: size, frags });
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

  private place(p: Projectile, k: number, mesh: Mesh): void {
    const kk = k < 0 ? 0 : k;
    mesh.position.set(
      p.from.x + (p.to.x - p.from.x) * kk,
      p.from.y + (p.to.y - p.from.y) * kk + Math.sin(kk * Math.PI) * p.arc,
      p.from.z + (p.to.z - p.from.z) * kk
    );
  }

  update(dt: number): void {
    // projectiles + trails
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      this.place(p, k, p.mesh);
      if (p.k.spin) {
        p.ang += dt * p.k.spin;
        p.mesh.rotation.y = p.ang;
      }
      // ghosts trail a little behind, shrinking as they go
      for (let j = 0; j < p.ghosts.length; j++) {
        const g = p.ghosts[j];
        this.place(p, k - (j + 1) * 0.045, g);
        const s = 1 - (j + 1) * 0.26;
        g.scaling.set(p.k.sx * s, p.k.sy * s, p.k.sz * s);
        if (p.k.spin) g.rotation.y = p.ang;
      }
      if (k >= 1) {
        this.projPool.release(p.mesh);
        for (const g of p.ghosts) this.trailPool.release(g);
        this.projectiles.splice(i, 1);
      }
    }
    // bursts + shrapnel
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.age += dt;
      const k = b.age / b.life;
      b.mesh.scaling.setAll(0.2 + k * b.grow);
      for (const f of b.frags) {
        f.mesh.position.x += f.vx * dt;
        f.mesh.position.y += f.vy * dt;
        f.mesh.position.z += f.vz * dt;
        f.vy -= 6 * dt; // gravity
        f.mesh.scaling.setAll(Math.max(0.02, (1 - k) * 0.32 * b.grow));
      }
      if (k >= 1) {
        this.burstPool.release(b.mesh);
        for (const f of b.frags) this.burstPool.release(f.mesh);
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
