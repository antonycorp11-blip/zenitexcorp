import { hash2 } from './rng';

// Value noise suave + fBm + Worley. Usados na geração e na textura do terreno.
const fade = (t: number) => t * t * (3 - 2 * t);

export function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  const u = fade(xf), v = fade(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x: number, y: number, seed: number, oct = 4, lac = 2, gain = 0.5): number {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += valueNoise(x * freq, y * freq, seed + i * 131) * amp;
    norm += amp; amp *= gain; freq *= lac;
  }
  return sum / norm;
}

/** Ridged: produz "veios"/túneis finos em torno de 0.5 */
export function ridged(x: number, y: number, seed: number, oct = 3): number {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    const n = 1 - Math.abs(valueNoise(x * freq, y * freq, seed + i * 71) * 2 - 1);
    sum += n * amp; norm += amp; amp *= 0.5; freq *= 2;
  }
  return sum / norm;
}

/** Worley F1/F2 — dá o aspecto de "pedregulhos arredondados" das paredes. */
export function worley(x: number, y: number, seed: number): [number, number, number] {
  const xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 9, f2 = 9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i, cy = yi + j;
    const px = cx + hash2(cx, cy, seed), py = cy + hash2(cx, cy, seed + 7);
    const dx = px - x, dy = py - y, d = dx * dx + dy * dy;
    if (d < f1) { f2 = f1; f1 = d; id = hash2(cx, cy, seed + 13); } else if (d < f2) f2 = d;
  }
  return [Math.sqrt(f1), Math.sqrt(f2), id];
}

/** Tabela tileável pré-computada para amostragem rápida por pixel na renderização. */
export class NoiseTable {
  readonly size: number;
  readonly data: Float32Array;
  constructor(size: number, fn: (x: number, y: number) => number) {
    this.size = size;
    this.data = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) this.data[y * size + x] = fn(x, y);
  }
  at(x: number, y: number): number {
    const m = this.size - 1;
    return this.data[(y & m) * this.size + (x & m)];
  }
}
