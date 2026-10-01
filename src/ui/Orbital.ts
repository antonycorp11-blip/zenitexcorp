import { WORLD_TILES } from '../core/constants';
import { fbm, valueNoise } from '../core/noise';
import { SECTORS } from '../data/sectors';
import type { Game } from '../Game';

const N = 200;

/** Renderiza o planeta visto da órbita, com destruição progressiva por setor. */
export function renderPlanet(g: Game, size: number, fracOverride?: number, time = 0): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d')!;
  const img = x.createImageData(N, N);
  const d = img.data;
  const total = fracOverride ?? g.planet.fraction();
  const secFrac = (s: number) => fracOverride !== undefined ? fracOverride : g.planet.sectorFraction(s);
  // fragmentação global
  const frag = Math.max(0, (total - 0.7) / 0.3);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const o = (j * N + i) * 4;
    let u = i / N, v = j / N;
    // deslocamento de fragmentos (desloca para dentro: amostra de posição "de origem")
    if (frag > 0) {
      const cell = Math.floor(fbm(u * 3, v * 3, 77, 2) * 8);
      const a = cell * 0.9;
      u -= Math.cos(a) * frag * 0.07 * (Math.hypot(u - 0.5, v - 0.5) * 2);
      v -= Math.sin(a) * frag * 0.07 * (Math.hypot(u - 0.5, v - 0.5) * 2);
    }
    const r = Math.hypot(u - 0.5, v - 0.5);
    if (r > 0.485) { d[o + 3] = 0; continue; }
    const tx = Math.floor(u * WORLD_TILES), ty = Math.floor(v * WORLD_TILES);
    const s = g.world.sectorTiles[Math.max(0, Math.min(WORLD_TILES - 1, ty)) * WORLD_TILES + Math.max(0, Math.min(WORLD_TILES - 1, tx))] || 1;
    const sd = SECTORS[s - 1];
    const n = fbm(u * 9, v * 9, 5, 4);
    const dep = secFrac(s);
    const hole = fbm(u * 6 + 3, v * 6, 11, 3);
    // remoção
    // o núcleo incandescente resiste até o fim
    const coreR = 0.06 + 0.06 * Math.min(1, total * 1.1);
    const removed = hole < dep * 0.72 - 0.1 || total >= 0.9999;
    if (removed && r < coreR && total < 0.9999) {
      const k = 1 - r / coreR;
      d[o] = 255; d[o + 1] = 120 + 120 * k; d[o + 2] = 40 + 120 * k * k; d[o + 3] = 255; continue;
    }
    if (removed) { d[o + 3] = 0; continue; }
    const crater = hole < dep * 1.05;
    const ac = hex(sd.accent);
    // base rochosa terrosa (cor do chão do setor), cristais do setor apenas em manchas
    const base = sd.floor;
    const cob = valueNoise(u * 90, v * 90, 8);
    let cr = base[0] * (0.55 + n * 0.7) * (0.85 + cob * 0.3), cg = base[1] * (0.55 + n * 0.7) * (0.85 + cob * 0.3), cb = base[2] * (0.55 + n * 0.7) * (0.85 + cob * 0.3);
    const cry = valueNoise(u * 26, v * 26, 3 + s) * fbm(u * 7, v * 7, 21 + s, 2);
    if (cry > 0.42) { const k = Math.min(1, (cry - 0.42) * 6); cr = cr * (1 - k) + ac[0] * k; cg = cg * (1 - k) + ac[1] * k; cb = cb * (1 - k) + ac[2] * k; }
    if (crater) { cr *= 0.45; cg *= 0.4; cb *= 0.4; if (hole > dep * 1.2) { cr += 80; cg += 40; } }
    // borda iluminada / magma exposto
    if (hole < dep * 0.72 - 0.06) { cr = 255; cg = 120 + n * 60; cb = 40; }
    // sombreamento esférico
    const lx = (u - 0.5) / 0.485, ly = (v - 0.5) / 0.485;
    const z = Math.sqrt(Math.max(0, 1 - lx * lx - ly * ly));
    const light = Math.max(0.12, (-lx * 0.5 - ly * 0.4 + z * 0.75));
    d[o] = cr * light; d[o + 1] = cg * light; d[o + 2] = cb * light; d[o + 3] = 255;
  }
  const t = document.createElement('canvas'); t.width = t.height = N;
  t.getContext('2d')!.putImageData(img, 0, 0);
  x.imageSmoothingEnabled = false;
  // atmosfera
  if (total < 0.95) {
    const gr = x.createRadialGradient(size / 2, size / 2, size * 0.46, size / 2, size / 2, size * 0.53);
    gr.addColorStop(0, 'rgba(255,140,80,0.25)'); gr.addColorStop(1, 'rgba(255,140,80,0)');
    x.fillStyle = gr; x.fillRect(0, 0, size, size);
  }
  x.drawImage(t, 0, 0, size, size);
  // detritos orbitais
  const debris = Math.floor(total * 160);
  for (let i = 0; i < debris; i++) {
    const a = i * 2.39996 + time * 0.02 * (1 + (i % 5) * 0.1), rr = size * (0.5 + (i % 7) * 0.02 + total * 0.05);
    const px = size / 2 + Math.cos(a) * rr * (0.8 + (i % 3) * 0.1), py = size / 2 + Math.sin(a) * rr * 0.9;
    x.fillStyle = i % 4 ? '#6a4a3a' : '#ff8a4a';
    x.fillRect(px, py, 1 + (i % 3), 1 + (i % 2));
  }
  return c;
}

function hex(h: string): [number, number, number] { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
