// Generic object pool to avoid per-frame allocations (enemies, projectiles,
// effects, floating text all reuse instances).
export class ObjectPool<T> {
  private free: T[] = [];
  private create: () => T;
  private onAcquire?: (item: T) => void;
  private onRelease?: (item: T) => void;

  constructor(opts: {
    create: () => T;
    onAcquire?: (item: T) => void;
    onRelease?: (item: T) => void;
    prefill?: number;
  }) {
    this.create = opts.create;
    this.onAcquire = opts.onAcquire;
    this.onRelease = opts.onRelease;
    for (let i = 0; i < (opts.prefill ?? 0); i++) this.free.push(this.create());
  }

  acquire(): T {
    const item = this.free.pop() ?? this.create();
    this.onAcquire?.(item);
    return item;
  }

  release(item: T): void {
    this.onRelease?.(item);
    this.free.push(item);
  }
}
