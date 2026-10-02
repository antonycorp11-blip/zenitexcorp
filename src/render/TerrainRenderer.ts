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

  private renderRegion(cx: number, cy: number, ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, lights: Emitter[] | null) {
    const rw = x1 - x0, rh = y1 - y0;
    if (rw <= 0 || rh <= 0) return;
    const img = ctx.createImageData(rw, rh);
    const d = img.data;
    const w = this.world, gen = w.gen, mat = w.mat;
    const sd = SECTORS[gen.layer - 1];
    const back = shade(sd.floor, 0.2), backRuin: [number, number, number] = [26, 44, 50];
    for (let py = 0; py < rh; py++) {
      const y = cy * CHUNK + y0 + py;
      for (let px = 0; px < rw; px++) {
        const x = cx * CHUNK + x0 + px;
        const i = y * WORLD_W + x;
        const m = mat[i];
        const o = (py * rw + px) * 4;
        const f = this.fine.at(x, y), n = this.fb.at(x, y);
        let r = 0, g = 0, b = 0, a = 255;
        if (m === MAT.AIR) {
          if (y < gen.surfaceAt(x)) { a = 0; }
          else {
            // parede do fundo da caverna
            const inRuin = gen.ruins.some(s => x >= s.x0 && x < s.x0 + s.w && y >= s.y0 && y < s.y0 + s.h);
            const base = inRuin ? backRuin : back;
            const k = 0.75 + n * 0.35 + (f > 0.93 ? 0.12 : 0);
            r = base[0] * k; g = base[1] * k; b = base[2] * k;
            if (inRuin && ((x % 8 === 0) || (y % 6 === 0))) { r *= 0.8; g *= 0.8; b *= 0.8; }
          }
        } else if (IS_LOOSE[m]) {
          const def = MATERIALS[m];
          const k = 0.78 + f * 0.36;
          [r, g, b] = def.top; r *= k; g *= k; b *= k;
          if (m === GRAIN.bloco_massa) { const e = x % 3 === 0 || y % 3 === 0; if (e) { r *= 0.7; g *= 0.7; b *= 0.7; } else { r = 160 + f * 30; g = 136 + f * 24; b = 108; } }
          else if (def.glow && f > 0.8) { r = Math.min(255, r * 1.3); g = Math.min(255, g * 1.3); b = Math.min(255, b * 1.3); }
          else if (w.aux[i] > 70 && f < 0.1) { r *= 1.25; g *= 1.15; b *= 0.9; } // grão de teor alto: brilho de minério
        } else if (IS_LIQUID[m]) {
          const def = MATERIALS[m];
          const surf = !IS_LIQUID[mat[i - WORLD_W]] && mat[i - WORLD_W] === MAT.AIR;
          const k = 0.8 + n * 0.3;
          [r, g, b] = def.top; r *= k; g *= k; b *= k;
          if (surf) { r = Math.min(255, r * 1.5 + 30); g = Math.min(255, g * 1.4 + 30); b = Math.min(255, b * 1.3 + 30); }
          if (m === MAT.LAVA && f > 0.9) { r = 255; g = 220; b = 120; }
          if (lights && m === MAT.LAVA && f > 0.985) lights.push({ x: x * CELL + 2, y: y * CELL + 2, r: 40, c: [255, 100, 30], a: 0.6, flicker: f });
        } else {
          const def = MATERIALS[m];
          const k = 0.82 + n * 0.22 + (f - 0.5) * 0.12;
          if (def.kind === 'ore') {
            [r, g, b] = f > 0.55 ? def.top : def.face;
            r *= k; g *= k; b *= k;
            if (f > 0.93) { r = Math.min(255, r * 1.5); g = Math.min(255, g * 1.5); b = Math.min(255, b * 1.5); }
            if (lights && def.glow && f > 0.992) lights.push({ x: x * CELL + 2, y: y * CELL + 2, r: 22 + f * 20, c: def.glow, a: 0.5, flicker: f });
          } else if (def.kind === 'edge') {
            r = 18 + f * 10; g = 14 + f * 8; b = 16 + f * 10;
          } else if (def.kind === 'ancient') {
            [r, g, b] = def.top;
            const seam = x % 6 === 0 || y % 4 === 0;
            const kk = seam ? 0.7 : k;
            r *= kk; g *= kk; b *= kk;
            if (!seam && f > 0.97) { r = 70; g = 230; b = 230; if (lights && f > 0.995) lights.push({ x: x * CELL + 2, y: y * CELL + 2, r: 26, c: [60, 220, 230], a: 0.5, flicker: f }); }
          } else {
            // rocha com estratos horizontais
            const st = this.strata.at(x, y);
            const base = st > 0.62 ? def.face : def.top;
            const kk = k * (0.9 + st * 0.2);
            r = base[0] * kk * 1.25; g = base[1] * kk * 1.25; b = base[2] * kk * 1.25;
            if (f > 0.97) { r *= 1.25; g *= 1.25; b *= 1.25; } else if (f < 0.04) { r *= 0.7; g *= 0.7; b *= 0.7; }
            // pedrinhas 2x2 e torrões
            const peb = hash2(x >> 1, y >> 1, 77);
            if (peb > 0.95) { r *= 1.22; g *= 1.2; b *= 1.18; } else if (peb < 0.05) { r *= 0.72; g *= 0.72; b *= 0.74; }
          }
          // luz no topo exposto, sombra embaixo
          const up = mat[i - WORLD_W], dn = mat[i + WORLD_W];
          if (y > 0 && !IS_SOLID[up] && !IS_LOOSE[up]) {
            if (gen.layer === 1 && y <= gen.surfaceAt(x) + 1 && def.kind === 'rock') { r = 86 + f * 30; g = 130 + f * 40; b = 54 + f * 10; } // grama
            else { r *= 1.35; g *= 1.35; b *= 1.35; }
          } else if (y > 1 && !IS_SOLID[mat[i - 2 * WORLD_W]] && !IS_LOOSE[mat[i - 2 * WORLD_W]]) { r *= 1.15; g *= 1.15; b *= 1.15; }
          if (y < WORLD_H - 1 && !IS_SOLID[dn] && !IS_LOOSE[dn]) { r *= 0.6; g *= 0.6; b *= 0.6; }
          const dm = w.dmg[i];
          if (dm > 20) { const kd = 1 - dm / 255 * 0.45; r *= kd; g *= kd; b *= kd; }
        }
        d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = a;
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
