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

  /** exposição à luz: quanto ar há ao redor (0 = enterrado, 1 = borda aberta) e se a luz vem de cima */
  private expo(mat: Uint8Array, x: number, y: number): [number, number] {
    let open = 0, up = 0;
    const D = [1, 2, 3, 5];
    for (let k = 0; k < 4; k++) {
      const d = D[k], wgt = 1 - k * 0.2;
      if (y - d >= 0 && !this.solidish(mat[(y - d) * WORLD_W + x])) { open += wgt; up += wgt; }
      if (y + d < WORLD_H && !this.solidish(mat[(y + d) * WORLD_W + x])) open += wgt * 0.6;
      if (x - d >= 0 && !this.solidish(mat[y * WORLD_W + x - d])) open += wgt * 0.8;
      if (x + d < WORLD_W && !this.solidish(mat[y * WORLD_W + x + d])) open += wgt * 0.8;
    }
    return [Math.min(1, open / 3.2), Math.min(1, up / 2.4)];
  }
  private solidish(m: number) { return IS_SOLID[m] === 1 || IS_LOOSE[m] !== 0; }

  private renderRegion(cx: number, cy: number, ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, lights: Emitter[] | null) {
    const rw = x1 - x0, rh = y1 - y0;
    if (rw <= 0 || rh <= 0) return;
    const img = ctx.createImageData(rw, rh);
    const d = img.data;
    const w = this.world, gen = w.gen, mat = w.mat;
    const sd = SECTORS[gen.layer - 1];
    const rockDef = MATERIALS[sd.rock];
    const L1 = gen.layer === 1;
    const ruins = gen.ruins;
    const lerp = (a: readonly number[], b: readonly number[], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    for (let py = 0; py < rh; py++) {
      const y = cy * CHUNK + y0 + py;
      for (let px = 0; px < rw; px++) {
        const x = cx * CHUNK + x0 + px;
        const i = y * WORLD_W + x;
        const m = mat[i];
        const o = (py * rw + px) * 4;
        const f = this.fine.at(x, y), n = this.fb.at(x >> 1, y >> 1), n2 = this.fb.at(x * 2, y * 2);
        let r = 0, g = 0, b = 0, a = 255;
        if (m === MAT.AIR) {
          const sy = gen.surfaceAt(x);
          if (y < sy) {
            // capim de alturas variadas (e algumas flores) acima do chão da superfície
            const below = mat[i + WORLD_W];
            const hgt = 1 + Math.floor(hash2(x, 3, 91) * 4.5) * (hash2(x >> 1, 4, 91) > 0.35 ? 1 : 0);
            const base = (() => { for (let k = 1; k <= 5; k++) { const mm = mat[i + k * WORLD_W]; if (mm !== MAT.AIR) return k; } return 9; })();
            const gm = mat[i + base * WORLD_W];
            if (L1 && base <= hgt && IS_SOLID[gm] && MATERIALS[gm].kind === 'rock' && y + base <= sy + 1) {
              const t = base / Math.max(1, hgt);
              [r, g, b] = lerp([70, 128, 44], [150, 206, 92], t);
              if (base === hgt && hash2(x, 9, 13) > 0.94) [r, g, b] = hash2(x, 8, 13) > 0.5 ? [250, 240, 200] : [255, 210, 70];
            } else a = 0;
            void below;
          } else {
            // parede do fundo: rocha escura com sombra das paredes (oclusão)
            const inRuin = ruins.length && ruins.some(rr => x >= rr.x0 && x < rr.x0 + rr.w && y >= rr.y0 && y < rr.y0 + rr.h);
            let near = 0;
            for (const dd of [1, 2, 3, 5]) {
              if (this.solidish(mat[i - dd])) near++; if (this.solidish(mat[i + dd])) near++;
              if (y - dd >= 0 && this.solidish(mat[i - dd * WORLD_W])) near += 1.4; if (y + dd < WORLD_H && this.solidish(mat[i + dd * WORLD_W])) near += 0.6;
            }
            const occ = 1 - Math.min(0.55, near * 0.045);
            if (inRuin) {
              const seam = x % 12 === 0 || y % 8 === 0;
              const k = (seam ? 0.6 : 0.85 + n2 * 0.25) * occ;
              r = 30 * k; g = 48 * k; b = 54 * k;
              if (!seam && f > 0.985) { r = 50; g = 150; b = 160; }
            } else {
              const base = lerp(rockDef.face, rockDef.top, 0.3 + n * 0.4);
              const crack = this.strata.at(x >> 1, y) > 0.7 && f > 0.6 ? 0.8 : 1;
              const k = (0.3 + n2 * 0.08 + f * 0.03) * occ * crack;
              r = base[0] * k; g = base[1] * k; b = base[2] * k;
              if (L1 && y < sy + 52 && hash2(x >> 1, 0, 17) < 0.06 && y - sy < 16 + hash2(x >> 1, 1, 17) * 28) { r = 60 * occ; g = 44 * occ; b = 30 * occ; }
            }
          }
        } else if (IS_LOOSE[m]) {
          const def = MATERIALS[m];
          const h = hash2(x, y, 5);
          if (m === GRAIN.bloco_massa) {
            const e = x % 3 === 0 || y % 3 === 0;
            [r, g, b] = e ? [84, 70, 58] : [154 + h * 20, 130 + h * 18, 102 + h * 12];
          } else {
            const k = 0.78 + h * 0.34 + (n2 - 0.5) * 0.12;
            [r, g, b] = def.top; r *= k; g *= k; b *= k;
            if (def.glow && h > 0.88) { r = Math.min(255, r * 1.35 + 30); g = Math.min(255, g * 1.35 + 30); b = Math.min(255, b * 1.35 + 30); }
            else if (w.aux[i] > 70 && h < 0.07) { r = 240; g = 200; b = 110; }
            // pilhas: topo exposto mais claro, base sombreada
            if (!this.solidish(mat[i - WORLD_W])) { r *= 1.15; g *= 1.15; b *= 1.15; }
            if (this.solidish(mat[i + WORLD_W]) && this.solidish(mat[i - WORLD_W]) && this.solidish(mat[i - 2 * WORLD_W])) { r *= 0.86; g *= 0.86; b *= 0.86; }
          }
        } else if (IS_LIQUID[m]) {
          const def = MATERIALS[m];
          let depth = 0;
          for (let k = 1; k <= 12; k++) { if (mat[i - k * WORLD_W] !== m) break; depth++; }
          const surf = depth === 0 && mat[i - WORLD_W] === MAT.AIR;
          if (m === MAT.LAVA) {
            const k = 0.85 + n2 * 0.4;
            r = 255; g = Math.min(255, 70 + n * 150) * k; b = 20 + f * 20;
            if (n < 0.33 && !surf) { r = 120; g = 30; b = 12; }
            if (surf || f > 0.96) { r = 255; g = 230; b = 150; }
          } else {
            // líquido translúcido: mistura com a parede do fundo, mais denso no fundo
            const back = lerp(rockDef.face, rockDef.top, 0.4).map(v => v * 0.3);
            const tint = def.top;
            const t = Math.min(0.88, 0.45 + depth * 0.04);
            [r, g, b] = lerp(back, tint, t);
            const ripple = Math.sin(x * 0.35 + y * 0.6) > 0.94 ? 1.25 : 1;
            r *= ripple; g *= ripple; b *= ripple;
            if (surf) { r = Math.min(255, tint[0] * 1.6 + 60); g = Math.min(255, tint[1] * 1.5 + 60); b = Math.min(255, tint[2] * 1.4 + 60); }
          }
          if (lights && m === MAT.LAVA && f > 0.995) lights.push({ x: x * CELL + 2, y: y * CELL + 2, r: 40, c: [255, 100, 30], a: 0.6, flicker: f });
        } else {
          const def = MATERIALS[m];
          const [ex, up] = this.expo(mat, x, y);
          if (def.kind === 'ore') {
            // cristal: facetas, brilho especular e interior escuro
            const facet = ((x - y) & 3) === 0 ? 1.35 : ((x + 2 * y) % 5 === 0) ? 0.7 : 0.95 + n2 * 0.15;
            [r, g, b] = lerp(def.face, def.top, 0.35 + n2 * 0.5);
            r *= facet; g *= facet; b *= facet;
            if (f > 0.975) { r = 255; g = 255; b = 255; }
            if (lights && def.glow && f > 0.997) lights.push({ x: x * CELL + 2, y: y * CELL + 2, r: 22 + f * 20, c: def.glow, a: 0.5, flicker: f });
          } else if (def.kind === 'edge') {
            const v = (x + (y >> 1)) % 9 === 0 ? 8 : 0;
            r = 24 + f * 8 + v; g = 20 + f * 6 + v; b = 24 + f * 8 + v;
          } else if (def.kind === 'ancient') {
            const seam = x % 12 === 0 || y % 8 === 0;
            [r, g, b] = lerp(def.face, def.top, seam ? 0 : 0.5 + n2 * 0.4);
            if (!seam && f > 0.985) { r = 80; g = 236; b = 236; if (lights && f > 0.998) lights.push({ x: x * CELL + 2, y: y * CELL + 2, r: 26, c: [60, 220, 230], a: 0.5, flicker: f }); }
          } else {
            // rocha/terra: estratos contínuos, manchas, pedras com volume
            const st = this.strata.at(x >> 1, y >> 1);
            [r, g, b] = lerp(def.face, def.top, 0.35 + st * 0.45 + (n - 0.5) * 0.3);
            const k = 1.18 + (n2 - 0.5) * 0.16 + (f - 0.5) * 0.08;
            r *= k; g *= k; b *= k;
            // pedras: blocos 3x3 com luz em cima/esquerda e sombra embaixo/direita
            const sx = x / 3 | 0, syy = y / 3 | 0;
            const lx0 = x - sx * 3, ly0 = y - syy * 3;
            if (hash2(sx, syy, 77) > 0.965 && !((lx0 === 0 || lx0 === 2) && (ly0 === 0 || ly0 === 2))) {
              const lx = lx0, ly = ly0;
              const stone = L1 ? [104, 98, 92] : [def.top[0] * 1.15, def.top[1] * 1.15, def.top[2] * 1.15];
              const sh2 = ly === 0 || lx === 0 ? 1.25 : ly === 2 || lx === 2 ? 0.7 : 1;
              r = stone[0] * sh2; g = stone[1] * sh2; b = stone[2] * sh2;
            }
            // terra úmida/escura mais embaixo na superfície; grama e raízes no topo
            if (L1) {
              const dep = y - gen.surfaceAt(x);
              if (dep >= 0 && dep < 3 && up > 0.5) { [r, g, b] = lerp([58, 104, 38], [96, 158, 60], f); }
              else if (dep >= 0 && dep < 6 && hash2(x, y, 4) < 0.25 + (6 - dep) * 0.05) { r = r * 0.7 + 18; g = g * 0.7 + 34; b = b * 0.7 + 10; }
            }
          }
          // volume: interior escuro, bordas e topo iluminados
          const light = def.kind === 'ore' ? 0.85 + ex * 0.25 : 0.74 + ex * 0.3 + up * 0.16;
          r *= light; g *= light; b *= light;
          const dn = y < WORLD_H - 1 ? mat[i + WORLD_W] : m;
          if (!this.solidish(dn)) { r *= 0.62; g *= 0.62; b *= 0.62; }
          const dm = w.dmg[i];
          if (dm > 30) { const kd = 1 - dm / 255 * 0.5; r *= kd; g *= kd; b *= kd; }
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
