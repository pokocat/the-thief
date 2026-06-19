export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

let seed = 0x2f6e2b1;
// Deterministic-ish small PRNG, fine for visuals/effect jitter.
export function rand(): number {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return ((seed >>> 0) % 100000) / 100000;
}

export function randRange(min: number, max: number): number {
  return min + rand() * (max - min);
}
