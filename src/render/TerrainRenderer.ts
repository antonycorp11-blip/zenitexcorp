import { CELL, CHUNK, WORLD_W, WORLD_H, WORLD_CW, WORLD_CH } from '../core/constants';
import { NoiseTable } from '../core/noise';
import { hash2 } from '../core/rng';
import { MAT, MATERIALS, IS_SOLID, IS_LOOSE, IS_LIQUID, GRAIN } from '../data/materials';
import { SECTORS } from '../data/sectors';
import type { World } from '../world/World';
import type { Sprites } from './Sprites';

export interface Emitter { x: number; y: number; r: number; c: [number, number, number]; a: number; flicker?: number; }
interface ChunkRender { canvas: HTMLCanvasElement; lights: Emitter[]; used: number; baked?: { hole: HTMLCanvasElement; glow: HTMLCanvasElement } | null; }

/**
 * Terreno em vista lateral, estilo "areia": 1 pixel por célula, ampliado sem suavização.
 * Cada grão tem a sua variação de cor; rocha tem estratos; cavernas mostram a parede do fundo;
 * o topo do terreno exposto ganha luz (e grama na superfície da Terra).
 */
export class TerrainRenderer {
  private cache = new Map<number, ChunkRender>();
  private fb: NoiseTable; private fine: NoiseTable; private strata: NoiseTable;
  frame = 0;

  constructor(private world: World, _sprites: Sprites) {
    const S = 1234, size = 256;
    this.fb = new NoiseTable(size, (x, y) => tileNoise(x, y, size, 0.05, S + 7));
    this.strata = new NoiseTable(size, (x, y) => tileNoise(x, y * 4, size, 0.03, S + 3));
    this.fine = new NoiseTable(size, (x, y) => hash2(x, y, S + 9));
  }

  /** Visão geral do corte da camada (1 px a cada 2 células), refeita no máximo a cada 1,5 s. */
  private ov: HTMLCanvasElement | null = null; private ovT = -1e9;
  overview(now: number): HTMLCanvasElement {
    const S = 2, W = WORLD_W / S, H = WORLD_H / S;
    if (this.ov && now - this.ovT < 1500) return this.ov;
    this.ovT = now;
    const c = this.ov ?? document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d')!, img = ctx.createImageData(W, H), d = img.data;
    const gen = this.world.gen, mat = this.world.mat, sky = SECTORS[gen.layer - 1].floor;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const m = mat[(y * S) * WORLD_W + x * S], o = (y * W + x) * 4;
      let r = 0, g = 0, b = 0;
      if (m === MAT.AIR) { if (y * S < gen.surfaceAt(x * S)) { r = 40; g = 60; b = 90; } else { r = sky[0] * 0.3; g = sky[1] * 0.3; b = sky[2] * 0.3; } }
      else { const t = MATERIALS[m].top; r = t[0]; g = t[1]; b = t[2]; if (IS_SOLID[m] && MATERIALS[m].kind === 'rock') { r *= 0.7; g *= 0.7; b *= 0.7; } }
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this.ov = c;
    return c;
  }

  invalidate(k: number) { const c = this.cache.get(k); if (c) c.used = -1; }

  get(cx: number, cy: number, allowRender: boolean): ChunkRender | null {
    if (cx < 0 || cy < 0 || cx >= WORLD_CW || cy >= WORLD_CH) return null;
    const k = cy * WORLD_CW + cx;
    let c = this.cache.get(k);
    const dirty = this.world.dirty.has(k);
    if (c && !dirty) { c.used = this.frame; return c; }
    if (!allowRender) return c ?? null;
    const rect = this.world.dirtyRect.get(k);
    if (c && rect) {
      this.renderRegion(cx, cy, c.canvas.getContext('2d')!, rect[0], rect[1], rect[2] + 1, rect[3] + 1, null);
      c.used = this.frame;
    } else {
      const canvas = c?.canvas ?? document.createElement('canvas');
      canvas.width = CHUNK; canvas.height = CHUNK;
      const lights: Emitter[] = [];
      this.renderRegion(cx, cy, canvas.getContext('2d')!, 0, 0, CHUNK, CHUNK, lights);
      c = { canvas, lights, used: this.frame, baked: null };
      this.cache.set(k, c);
    }
    this.world.dirty.delete(k);
    this.world.dirtyRect.delete(k);
    return c;
  }

  /** 5 tons por material: 0 mais escuro … 4 mais claro */
  private pals = new Map<number, [number, number, number][]>();
  private pal(m: number): [number, number, number][] {
    let p = this.pals.get(m);
    if (p) return p;
    const d = MATERIALS[m];
    const t = d.top, f = d.face;
    const mix = (k: number, a: number): [number, number, number] => [
      Math.min(255, (f[0] + (t[0] - f[0]) * a) * k), Math.min(255, (f[1] + (t[1] - f[1]) * a) * k), Math.min(255, (f[2] + (t[2] - f[2]) * a) * k)];
    p = d.kind === 'rock' || d.kind === 'barrier' ? [mix(0.6, 0.2), mix(0.92, 0.55), mix(1.02, 0.75), mix(1.14, 0.9), mix(1.42, 1)]
      : [mix(0.55, 0), mix(0.8, 0.4), mix(1, 0.85), mix(1.2, 1), mix(1.55, 1)];
    this.pals.set(m, p);
    return p;
  }

  private renderRegion(cx: number, cy: number, ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, lights: Emitter[] | null) {
    const rw = x1 - x0, rh = y1 - y0;
    if (rw <= 0 || rh <= 0) return;
    const img = ctx.createImageData(rw, rh);
    const d = img.data;
    const w = this.world, gen = w.gen, mat = w.mat;
    const sd = SECTORS[gen.layer - 1];
    const rockPal = this.pal(sd.rock);
    const L1 = gen.layer === 1;
    const ruins = gen.ruins;
    const solidish = (m: number) => IS_SOLID[m] === 1 || IS_LOOSE[m] !== 0;
    for (let py = 0; py < rh; py++) {
      const y = cy * CHUNK + y0 + py;
      for (let px = 0; px < rw; px++) {
        const x = cx * CHUNK + x0 + px;
        const i = y * WORLD_W + x;
        const m = mat[i];
        const o = (py * rw + px) * 4;
        const f = this.fine.at(x, y), n = this.fb.at(x, y);
        let c: readonly number[] = [0, 0, 0];
        let a = 255;
        if (m === MAT.AIR) {
          const sy = gen.surfaceAt(x);
          if (y < sy) {
            // grama brotando acima do chão da superfície
            const below = mat[i + WORLD_W];
            if (L1 && (y === sy - 1 || y === sy - 2) && IS_SOLID[below] && MATERIALS[below].kind === 'rock' && y >= sy - 2) {
              const hgt = hash2(x, 3, 91);
              if ((y === sy - 1 && hgt < 0.55) || (y === sy - 2 && hgt < 0.18 && IS_SOLID[mat[i + 2 * WORLD_W]])) { c = hgt < 0.25 ? [120, 200, 70] : [84, 160, 56]; }
              else a = 0;
            } else a = 0;
          } else {
            // parede do fundo: rocha escura em blocos, com rachaduras
            const inRuin = ruins.length && ruins.some(r => x >= r.x0 && x < r.x0 + r.w && y >= r.y0 && y < r.y0 + r.h);
            if (inRuin) {
              const seam = x % 8 === 0 || y % 6 === 0;
              c = seam ? [16, 26, 30] : (f > 0.5 ? [30, 48, 54] : [26, 42, 48]);
              if (!seam && f > 0.985) c = [50, 150, 160];
            } else {
              const row = Math.floor(y / 5), off = (row & 1) * 4;
              const seam = (x + off) % 9 === 0 || y % 5 === 0;
              const t = n > 0.55 ? 1 : 0;
              const base = rockPal[t];
              const k = seam ? 0.22 : 0.34 + f * 0.06;
              c = [base[0] * k, base[1] * k, base[2] * k];
              // raízes penduradas logo abaixo da superfície da Terra
              if (L1 && y < sy + 26 && hash2(x, 0, 17) < 0.06 && y - sy < 8 + hash2(x, 1, 17) * 14) c = [70, 52, 34];
            }
          }
        } else if (IS_LOOSE[m]) {
          const pal = this.pal(m);
          const h = hash2(x, y, 5);
          const def = MATERIALS[m];
          if (m === GRAIN.bloco_massa) {
            const e = x % 3 === 0 || y % 3 === 0;
            c = e ? [84, 70, 58] : (h > 0.5 ? [170, 146, 116] : [154, 130, 102]);
          } else {
            c = h < 0.25 ? pal[1] : h < 0.7 ? pal[2] : h < 0.95 ? pal[3] : pal[4];
            if (def.glow && h > 0.9) c = [Math.min(255, pal[4][0] + 40), Math.min(255, pal[4][1] + 40), Math.min(255, pal[4][2] + 40)];
            else if (w.aux[i] > 70 && h < 0.08) c = [255, 210, 120];   // pinta de minério em grão de teor alto
            // sombra de contato: grão com vazio embaixo fica mais claro (borda da pilha)
            if (!solidish(mat[i + WORLD_W])) c = pal[3];
          }
        } else if (IS_LIQUID[m]) {
          const pal = this.pal(m);
          let depth = 0;
          for (let k = 1; k <= 8; k++) { if (mat[i - k * WORLD_W] !== m) break; depth++; }
          const surf = depth === 0 && mat[i - WORLD_W] === MAT.AIR;
          c = surf ? pal[4] : depth < 2 ? pal[3] : depth < 5 ? pal[2] : pal[1];
          if (m === MAT.LAVA) { if (f > 0.93) c = [255, 236, 150]; else if (n < 0.3 && !surf) c = [140, 40, 16]; }
          else if (f > 0.985) c = pal[4];
          if (lights && m === MAT.LAVA && f > 0.985) lights.push({ x: x * CELL + 2, y: y * CELL + 2, r: 40, c: [255, 100, 30], a: 0.6, flicker: f });
        } else {
          const def = MATERIALS[m];
          const pal = this.pal(m);
          const up = mat[i - WORLD_W], dn = y < WORLD_H - 1 ? mat[i + WORLD_W] : m;
          const openUp = y > 0 && !solidish(up), openDn = !solidish(dn);
          const openL = !solidish(mat[i - 1]), openR = !solidish(mat[i + 1]);
          if (def.kind === 'ore') {
            // cristais facetados com brilho
            const facet = ((x - y) & 3) === 0 ? 4 : ((x + 2 * y) % 5 === 0) ? 1 : (n > 0.5 ? 3 : 2);
            c = pal[facet];
            if (f > 0.975) c = [255, 255, 255];
            if (openDn) c = pal[0];
            if (lights && def.glow && f > 0.992) lights.push({ x: x * CELL + 2, y: y * CELL + 2, r: 22 + f * 20, c: def.glow, a: 0.5, flicker: f });
          } else if (def.kind === 'edge') {
            const v = (x + (y >> 1)) % 7 === 0 ? 10 : 0;
            c = [22 + f * 8 + v, 18 + f * 6 + v, 22 + f * 8 + v];
          } else if (def.kind === 'ancient') {
            const seam = x % 6 === 0 || y % 4 === 0;
            c = seam ? pal[0] : (f > 0.5 ? pal[2] : pal[1]);
            if (!seam && f > 0.975) { c = [80, 236, 236]; if (lights && f > 0.995) lights.push({ x: x * CELL + 2, y: y * CELL + 2, r: 26, c: [60, 220, 230], a: 0.5, flicker: f }); }
            if (openUp) c = pal[3];
          } else {
            // rocha: estratos pontilhados + pedrinhas + bordas definidas
            const st = this.strata.at(x, y);
            let t = st > 0.62 ? 1 : n > 0.62 ? 3 : 2;
            const peb = hash2(x >> 1, y >> 1, 77);
            if (f > 0.992) t = 4;
            c = pal[t];
            // pedrinhas: 2x2 cinzentas na terra, escuras nas rochas
            if (peb > 0.975) c = L1 ? ((x & 1) ? [120, 116, 110] : [96, 92, 88]) : pal[3];
            else if (peb < 0.02) c = pal[0];
            if (openUp) {
              if (L1 && y <= gen.surfaceAt(x) + 1 && def.kind === 'rock') c = f > 0.4 ? [104, 178, 66] : [86, 152, 54];   // grama
              else c = pal[4];
            } else if (y > 1 && !solidish(mat[i - 2 * WORLD_W])) {
              c = L1 && y <= gen.surfaceAt(x) + 3 && def.kind === 'rock' ? [66, 116, 44] : pal[3];
            } else if (L1 && y <= gen.surfaceAt(x) + 4 && def.kind === 'rock' && hash2(x, y, 4) < 0.35) c = [74, 92, 42];
            if (openDn) c = pal[0];
            else if (openL || openR) c = pal[1];
          }
          const dm = w.dmg[i];
          if (dm > 30) { const kd = 1 - dm / 255 * 0.5; c = [c[0] * kd, c[1] * kd, c[2] * kd]; }
        }
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = a;
      }
    }
    ctx.putImageData(img, x0, y0);
  }
}

function shade(c: readonly number[], k: number): [number, number, number] { return [c[0] * k, c[1] * k, c[2] * k]; }

/** value noise tileável no período `size` */
function tileNoise(x: number, y: number, size: number, freq: number, seed: number) {
  const p = Math.max(1, Math.round(size * freq));
  const fx = (x / size) * p, fy = (y / size) * p;
  const xi = Math.floor(fx), yi = Math.floor(fy);
  const xf = fx - xi, yf = fy - yi;
  const h = (a: number, b: number) => hash2(((a % p) + p) % p, ((b % p) + p) % p, seed);
  const s = (t: number) => t * t * (3 - 2 * t);
  const u = s(xf), v = s(yf);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), dd = h(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + dd) * u * v;
}
