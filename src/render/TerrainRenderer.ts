import { CELL, CHUNK, CHUNK_PX, WORLD_CELLS, WORLD_CHUNKS } from '../core/constants';
import { NoiseTable, valueNoise, worley, fbm } from '../core/noise';
import { hash2 } from '../core/rng';
import { MAT, MATERIALS, IS_SOLID, matById } from '../data/materials';
import { SECTORS } from '../data/sectors';
import type { World } from '../world/World';
import { PAD_R } from '../world/WorldGen';
import { Sprites } from './Sprites';

export interface Emitter { x: number; y: number; r: number; c: [number, number, number]; a: number; flicker?: number; }

interface ChunkRender { canvas: HTMLCanvasElement; lights: Emitter[]; used: number; baked?: { hole: HTMLCanvasElement; glow: HTMLCanvasElement } | null; }

const FACE = 11;        // altura da face frontal das paredes (px)
const PAD_X = 4, PAD_T = 4, PAD_B = FACE + 4;

/**
 * Renderiza chunks do terreno em canvases cacheados, pixel a pixel.
 * O jitter suave nas fronteiras das células esconde a grade interna.
 */
export class TerrainRenderer {
  private cache = new Map<number, ChunkRender>();
  private jx: NoiseTable; private jy: NoiseTable;
  private wF1: NoiseTable; private wEdge: NoiseTable; private wId: NoiseTable;
  private wF1s: NoiseTable; private wIds: NoiseTable;
  private fb: NoiseTable; private fine: NoiseTable;
  private buf: Uint8Array;
  frame = 0;

  constructor(private world: World, private sprites: Sprites) {
    const S = 1234;
    const size = 256;
    // tabelas tileáveis (256 px) para amostragem rápida
    this.jx = new NoiseTable(size, (x, y) => (tileNoise(x, y, size, 0.09, S) - 0.5) * 3.6);
    this.jy = new NoiseTable(size, (x, y) => (tileNoise(x, y, size, 0.09, S + 1) - 0.5) * 3.6);
    const W = 256 / 32; // pedregulhos de ~5 px
    const wf1: number[] = [], we: number[] = [], wi: number[] = [], wf1s: number[] = [], wis: number[] = [];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const [f1, f2, id] = worleyTile(x / W, y / W, 32, S + 3);
      wf1.push(f1); we.push(f2 - f1); wi.push(id);
      const [g1, , gid] = worleyTile(x / 16, y / 16, 16, S + 4);
      wf1s.push(g1); wis.push(gid);
    }
    this.wF1 = fromArr(wf1, size); this.wEdge = fromArr(we, size); this.wId = fromArr(wi, size);
    this.wF1s = fromArr(wf1s, size); this.wIds = fromArr(wis, size);
    this.fb = new NoiseTable(size, (x, y) => tileNoise(x, y, size, 0.035, S + 7));
    this.fine = new NoiseTable(size, (x, y) => hash2(x, y, S + 9));
    this.buf = new Uint8Array((CHUNK_PX + PAD_X * 2) * (CHUNK_PX + PAD_T + PAD_B));
  }

  invalidate(k: number) { const c = this.cache.get(k); if (c) c.used = -1; }

  /** Chunk pronto para desenhar (renderiza se preciso; budget limita re-render por frame). */
  get(cx: number, cy: number, allowRender: boolean): ChunkRender | null {
    if (cx < 0 || cy < 0 || cx >= WORLD_CHUNKS || cy >= WORLD_CHUNKS) return null;
    const k = cy * WORLD_CHUNKS + cx;
    let c = this.cache.get(k);
    const dirty = this.world.dirty.has(k);
    if (c && !dirty) { c.used = this.frame; return c; }
    if (!allowRender) return c ?? null;
    // garante vizinhos gerados (bordas)
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) this.world.ensureChunk(cx + i, cy + j);
    const rect = this.world.dirtyRect.get(k);
    if (c && rect) {
      // re-renderização parcial: só a área alterada (mineração contínua fica barata)
      const ctx = c.canvas.getContext('2d')!;
      this.renderRegion(cx, cy, ctx, rect[0] * CELL, rect[1] * CELL, (rect[2] + 1) * CELL, (rect[3] + 1) * CELL, c.lights);
      c.used = this.frame;
      c.baked = null;
    } else {
      const canvas = c?.canvas ?? document.createElement('canvas');
      canvas.width = CHUNK_PX; canvas.height = CHUNK_PX;
      const lights: Emitter[] = [];
      this.renderRegion(cx, cy, canvas.getContext('2d')!, 0, 0, CHUNK_PX, CHUNK_PX, lights);
      c = { canvas, lights, used: this.frame };
      this.cache.set(k, c);
      if (this.cache.size > 160) this.evict();
    }
    this.world.dirty.delete(k);
    this.world.dirtyRect.delete(k);
    return c;
  }

  private evict() {
    const arr = [...this.cache.entries()].sort((a, b) => a[1].used - b[1].used);
    for (let i = 0; i < 40; i++) this.cache.delete(arr[i][0]);
  }

  private renderRegion(cx: number, cy: number, ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, lights: Emitter[]) {
    const rw = x1 - x0, rh = y1 - y0;
    if (rw <= 0 || rh <= 0) return;
    const img = ctx.createImageData(rw, rh);
    const d = img.data;
    const ox = cx * CHUNK_PX, oy = cy * CHUNK_PX;
    const w = this.world;
    const bw = rw + PAD_X * 2, bh = rh + PAD_T + PAD_B;
    if (this.buf.length < bw * bh) this.buf = new Uint8Array(bw * bh);
    const buf = this.buf;
    // 1) material por pixel com jitter
    for (let by = 0; by < bh; by++) {
      const wy = oy + y0 + by - PAD_T;
      for (let bx = 0; bx < bw; bx++) {
        const wx = ox + x0 + bx - PAD_X;
        const jx = this.jx.at(wx, wy), jy = this.jy.at(wx, wy);
        buf[by * bw + bx] = w.peek(Math.floor((wx + jx) / CELL), Math.floor((wy + jy) / CELL));
      }
    }
    const secId = w.sectorAtPx(ox + CHUNK_PX / 2, oy + CHUNK_PX / 2) || 1;
    // 2) shading por pixel
    for (let py = 0; py < rh; py++) {
      const wy = oy + y0 + py;
      for (let px = 0; px < rw; px++) {
        const wx = ox + x0 + px;
        const bi = (py + PAD_T) * bw + (px + PAD_X);
        const m = buf[bi];
        const o = (py * rw + px) * 4;
        let r: number, g: number, b: number;
        const def = MATERIALS[m];
        if (IS_SOLID[m]) {
          let fd = 0;
          for (let k = 1; k <= FACE; k++) { if (!IS_SOLID[buf[bi + k * bw]]) { fd = k; break; } }
          if (fd) {
            const t = fd / FACE;
            const stripe = this.fine.at(wx, 7) * 0.18 + this.fb.at(wx * 3, wy) * 0.2;
            let sh = 0.55 + 0.35 * t + stripe - 0.1;
            if (fd <= 1) sh *= 0.55;
            if (fd >= FACE - 1) sh *= 1.25;
            [r, g, b] = this.faceColor(def, wx, wy, sh);
          } else {
            [r, g, b] = this.topColor(def, wx, wy);
            const up = !IS_SOLID[buf[bi - bw]] || !IS_SOLID[buf[bi - 2 * bw]];
            const lf = !IS_SOLID[buf[bi - 1]], rt = !IS_SOLID[buf[bi + 1]];
            if (up) { r *= 1.3; g *= 1.3; b *= 1.3; }
            else if (lf || rt) { r *= 0.75; g *= 0.75; b *= 0.75; }
          }
        } else if (m === MAT.AIR) {
          [r, g, b] = this.floorColor(secId, wx, wy);
          let occ = 0;
          if (IS_SOLID[buf[bi - 3 * bw]]) occ += 1.4;
          if (IS_SOLID[buf[bi - 6 * bw]]) occ += 0.6;
          if (IS_SOLID[buf[bi - 3]]) occ += 0.5;
          if (IS_SOLID[buf[bi + 3]]) occ += 0.5;
          if (IS_SOLID[buf[bi + 2 * bw]]) occ += 0.3;
          const f = 1 - Math.min(0.6, occ * 0.16);
          r *= f; g *= f; b *= f;
        } else {
          [r, g, b] = this.liquidColor(m, wx, wy, buf, bi, bw);
        }
        d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, x0, y0);

    // 3) cristais, decoração e emissores das células que tocam a região
    const cx0 = cx * CHUNK, cy0 = cy * CHUNK;
    const ci0 = Math.max(0, Math.floor(x0 / CELL) - 3), ci1 = Math.min(CHUNK - 1, Math.ceil(x1 / CELL) + 3);
    const cj0 = Math.max(0, Math.floor(y0 / CELL) - 2), cj1 = Math.min(CHUNK - 1, Math.ceil(y1 / CELL) + 4);
    if (lights.length) {
      const lx0 = (cx0 + ci0) * CELL, lx1 = (cx0 + ci1 + 1) * CELL, ly0 = (cy0 + cj0) * CELL - 6, ly1 = (cy0 + cj1 + 1) * CELL + 4;
      for (let i = lights.length - 1; i >= 0; i--) { const L = lights[i]; if (L.x >= lx0 && L.x < lx1 && L.y >= ly0 && L.y < ly1) lights.splice(i, 1); }
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0 - 2, rw, rh + 4); ctx.clip();
    const sd = SECTORS[secId - 1];
    for (let j = cj0; j <= cj1; j++) for (let i = ci0; i <= ci1; i++) {
      const x = cx0 + i, y = cy0 + j;
      const m = w.peek(x, y);
      const def = MATERIALS[m];
      const h = hash2(x, y, 911);
      if (def.kind === 'ore') {
        const exposedBelow = !IS_SOLID[w.peek(x, y + 1)] || !IS_SOLID[w.peek(x, y + 2)];
        if (h < (exposedBelow ? 0.33 : 0.11)) {
          const spr = this.sprites.crystal(m, Math.floor(h * 1000) % 3);
          ctx.drawImage(spr, i * CELL - spr.width / 2 + 2, j * CELL - spr.height + 6);
        }
        if (def.glow && h < 0.06) lights.push({ x: x * CELL + 2, y: y * CELL, r: 26 + h * 200, c: def.glow, a: 0.55, flicker: h });
      } else if (m === MAT.AIR) {
        if (h < 0.02 && IS_SOLID[w.peek(x, y - 1)] && this.padDist(x * CELL, y * CELL) > PAD_R * CELL) {
          const deco = this.sprites.decor(secId, Math.floor(h * 10000) % 4);
          if (deco) {
            ctx.drawImage(deco, i * CELL - deco.width / 2 + 2, j * CELL - deco.height + 4);
            if (sd.id === 2 || sd.id === 5 || sd.id === 9) lights.push({ x: x * CELL + 2, y: y * CELL - 4, r: 22, c: sd.id === 9 ? [190, 255, 220] : sd.id === 5 ? [160, 255, 60] : [80, 255, 120], a: 0.5, flicker: h });
            if (sd.id === 3 || sd.id === 10 || sd.id === 12) lights.push({ x: x * CELL + 2, y: y * CELL - 2, r: 16, c: [255, 120, 40], a: 0.5, flicker: h });
          }
        }
      } else if (def.kind === 'liquid' && def.glow) {
        if ((x % 4 === 0) && (y % 4 === 0) && h < 0.55) lights.push({ x: x * CELL + 2, y: y * CELL + 2, r: m === MAT.LAVA ? 34 : 24, c: def.glow, a: m === MAT.LAVA ? 0.5 : 0.28, flicker: h });
      } else if (m === MAT.ANCIENT) {
        if (h < 0.025 && !IS_SOLID[w.peek(x, y + 1)]) lights.push({ x: x * CELL + 2, y: y * CELL, r: 18, c: [60, 230, 240], a: 0.55, flicker: h });
      } else if (m === MAT.R12 || m === MAT.CONT6) {
        if (h < 0.01) lights.push({ x: x * CELL + 2, y: y * CELL, r: 20, c: [255, 100, 30], a: 0.35, flicker: h });
      }
    }
    ctx.restore();
    if (lights.length > 160) lights.length = 160;
  }

  private topColor(def: (typeof MATERIALS)[number], wx: number, wy: number): [number, number, number] {
    const [tr, tg, tb] = def.top;
    const p = def.pattern;
    let s = 1;
    if (p === 'crystal') {
      const f1 = this.wF1s.at(wx * 2, wy * 2), id = this.wIds.at(wx * 2, wy * 2);
      s = 0.75 + id * 0.55 - f1 * 0.25 + (this.fine.at(wx, wy) > 0.97 ? 0.8 : 0);
      return [tr * s, tg * s, tb * s];
    }
    if (p === 'block') {
      // tijolos ancestrais com glifos
      const bx = ((wx + ((wy >> 3) & 1) * 6) % 12 + 12) % 12, by = ((wy % 8) + 8) % 8;
      const mortar = bx === 0 || by === 0;
      s = mortar ? 0.55 : 0.9 + this.fine.at(wx >> 2, wy >> 2) * 0.2;
      const glyph = !mortar && this.fine.at(Math.floor(wx / 12) * 3, Math.floor(wy / 8) * 5) > 0.88 && (bx === 6 || by === 4);
      if (glyph) return [60, 220, 230];
      return [tr * s, tg * s, tb * s];
    }
    if (p === 'basalt') {
      const f1 = this.wF1s.at(wx, wy), id = this.wIds.at(wx, wy);
      const e = this.wEdge.at(wx, wy);
      s = 0.8 + id * 0.35 - f1 * 0.15;
      if (e < 0.06) s *= 0.6;
      return [tr * s, tg * s, tb * s];
    }
    // pedregulhos (cobble/organic/ice/slime/bone/dense/core) com relevo iluminado do noroeste
    const f1 = this.wF1.at(wx, wy), e = this.wEdge.at(wx, wy), id = this.wId.at(wx, wy);
    const bump = this.wF1.at(wx + 1, wy + 1) - this.wF1.at(wx - 1, wy - 1);
    s = 1.05 - f1 * 0.45 + (id - 0.5) * 0.3 + bump * 2.2;
    if (e < 0.08) s *= 0.42;
    else if (e < 0.14) s *= 0.8;
    if (p === 'ice') s = s * 0.8 + this.fb.at(wx * 2, wy) * 0.4;
    if (p === 'organic') s *= 0.85 + this.fb.at(wx * 4, wy * 4) * 0.3;
    if (p === 'slime') s *= 0.8 + this.fb.at(wx * 3, wy * 3) * 0.35;
    if (p === 'dense') s = 0.8 + this.fine.at(wx, wy) * 0.15 + (e < 0.05 ? -0.3 : 0);
    let r = tr * s, g = tg * s, b = tb * s;
    if (p === 'core' && e < 0.05) { r = 255; g = 120 + id * 80; b = 30; }
    if (p === 'bone' && id > 0.85) { r *= 1.25; g *= 1.25; b *= 1.2; }
    return [r, g, b];
  }

  private faceColor(def: (typeof MATERIALS)[number], wx: number, wy: number, sh: number): [number, number, number] {
    const [fr, fg, fb] = def.face;
    if (def.pattern === 'crystal') {
      const v = 0.8 + this.fine.at(wx >> 1, wy >> 2) * 0.5;
      return [Math.min(255, def.top[0] * 0.55 * v * sh * 1.2), Math.min(255, def.top[1] * 0.55 * v * sh * 1.2), Math.min(255, def.top[2] * 0.55 * v * sh * 1.2)];
    }
    if (def.pattern === 'block') {
      const seam = ((wx % 12) + 12) % 12 === 0;
      const s = seam ? sh * 0.6 : sh;
      return [fr * s * 1.2, fg * s * 1.2, fb * s * 1.2];
    }
    // colunas verticais nas faces (como nas referências)
    const col = this.wId.at(wx, 3);
    const s = sh * (0.85 + col * 0.35);
    return [fr * s * 1.15, fg * s * 1.15, fb * s * 1.15];
  }

  /** distância (px) ao centro do poço de pouso */
  private padDist(wx: number, wy: number) {
    const L = this.world.gen.landing;
    return Math.hypot(wx - (L.x * CELL + 2), wy - (L.y * CELL + 2));
  }

  /** Piso de concreto da base: placas com juntas, rebites e faixa de segurança na borda. */
  private padColor(sd: (typeof SECTORS)[number], wx: number, wy: number, d: number): [number, number, number] {
    const R = PAD_R * CELL;
    const n = this.fb.at(wx * 2, wy * 2), f = this.fine.at(wx, wy);
    // concreto levemente tingido pela camada
    let r = 84 + sd.floor[0] * 0.18, g = 84 + sd.floor[1] * 0.18, b = 86 + sd.floor[2] * 0.18;
    const k = 0.9 + n * 0.16 + (f > 0.97 ? 0.08 : f < 0.03 ? -0.08 : 0);
    r *= k; g *= k; b *= k;
    // faixa de segurança amarela/preta
    if (d > R - 9) {
      if (d > R - 2) return [r * 0.55, g * 0.55, b * 0.55];
      const stripe = Math.floor((wx + wy) / 6) % 2 === 0;
      return stripe ? [212 * k, 160 * k, 40 * k] : [34, 32, 30];
    }
    // placas 32 px com juntas e rebites
    const px = ((wx % 32) + 32) % 32, py = ((wy % 32) + 32) % 32;
    if (px === 0 || py === 0) return [r * 0.62, g * 0.62, b * 0.64];
    if (px === 1 || py === 1) { r *= 1.12; g *= 1.12; b *= 1.12; }
    if ((px === 4 || px === 28) && (py === 4 || py === 28)) return [r * 1.35, g * 1.35, b * 1.35];
    // anel pintado ao redor do pouso
    const ring = Math.abs(d - R * 0.42);
    if (ring < 1.5) return [200, 140, 50];
    // marcas de pneu/desgaste
    if (this.wEdge.at(wx * 0.6, wy * 0.6) < 0.05) { r *= 0.85; g *= 0.85; b *= 0.85; }
    return [r, g, b];
  }

  private floorColor(sec: number, wx: number, wy: number): [number, number, number] {
    const sd = SECTORS[sec - 1];
    const pd = this.padDist(wx, wy);
    if (pd < PAD_R * CELL) return this.padColor(sd, wx, wy, pd);
    const n = this.fb.at(wx, wy);
    const t = Math.min(1, Math.max(0, (n - 0.3) * 1.6));
    let r = sd.floor[0] + (sd.floor2[0] - sd.floor[0]) * t;
    let g = sd.floor[1] + (sd.floor2[1] - sd.floor[1]) * t;
    let b = sd.floor[2] + (sd.floor2[2] - sd.floor[2]) * t;
    // cascalho
    const f = this.fine.at(wx, wy);
    if (f > 0.975) { r *= 1.2; g *= 1.18; b *= 1.15; }
    else if (f < 0.03) { r *= 0.75; g *= 0.75; b *= 0.75; }
    // seixos e torrões
    const pf = this.wF1.at(wx * 2 + 91, wy * 2 + 37), pid = this.wId.at(wx * 2 + 91, wy * 2 + 37);
    if (pid > 0.86 && pf < 0.42) { const k = pf < 0.25 ? 1.22 : 0.72; r *= k; g *= k; b *= k; }
    else { const k = 0.94 + this.fb.at(wx * 5, wy * 5) * 0.12; r *= k; g *= k; b *= k; }
    return [r, g, b];
  }

  private liquidColor(m: number, wx: number, wy: number, buf: Uint8Array, bi: number, bw: number): [number, number, number] {
    const n = this.fb.at(wx * 2, wy * 2), f = this.fine.at(wx, wy);
    // borda: margem com a rocha/chão acima
    const shore = buf[bi - 2 * bw] !== m || buf[bi - 2] !== m || buf[bi + 2] !== m;
    if (m === MAT.LAVA) {
      const crust = this.wEdge.at(wx * 0.7, wy * 0.7) < 0.08 ? 0 : 1;
      const v = 0.75 + n * 0.5;
      let r = 255 * v, g = (70 + n * 140) * v, b = 15;
      if (!crust) { r = 255; g = 220; b = 120; }
      if (n < 0.35) { r *= 0.55; g *= 0.4; b = 10; }
      if (shore) { r *= 0.6; g *= 0.4; }
      return [Math.min(255, r), Math.min(255, g), b];
    }
    if (m === MAT.ACID) {
      let r = 90 + n * 80, g = 190 + n * 60, b = 20;
      if (f > 0.985) { r = 220; g = 255; b = 140; }
      if (this.wF1s.at(wx * 2, wy * 2) < 0.1) { r += 60; g = 255; b += 60; }
      if (shore) { r *= 0.6; g *= 0.7; b *= 0.6; }
      return [r, g, b];
    }
    if (m === MAT.WATER) {
      let r = 10 + n * 30, g = 60 + n * 70, b = 100 + n * 90;
      if (f > 0.99 || this.wEdge.at(wx * 0.5, wy * 1.5) < 0.02) { r += 60; g += 90; b += 90; }
      if (shore) { r += 30; g += 60; b += 50; }
      return [r, g, b];
    }
    // abismo: escuridão com névoa azulada
    const depth = shore ? 0.7 : 0.2 + n * 0.25;
    return [8 * depth, 18 * depth, 40 * depth + (f > 0.995 ? 60 : 0)];
  }
}

function fromArr(a: number[], size: number) { const t = new NoiseTable(size, () => 0); t.data.set(a); return t; }

/** value noise tileável no período `size` */
function tileNoise(x: number, y: number, size: number, freq: number, seed: number) {
  const p = Math.round(size * freq);
  const fx = (x / size) * p, fy = (y / size) * p;
  const xi = Math.floor(fx), yi = Math.floor(fy);
  const xf = fx - xi, yf = fy - yi;
  const h = (a: number, b: number) => hash2(((a % p) + p) % p, ((b % p) + p) % p, seed);
  const s = (t: number) => t * t * (3 - 2 * t);
  const u = s(xf), v = s(yf);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), dd = h(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + dd) * u * v;
}

/** Worley tileável no período `period` (em células de Worley) */
function worleyTile(x: number, y: number, period: number, seed: number): [number, number, number] {
  const xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 9, f2 = 9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i, cy = yi + j;
    const wx = ((cx % period) + period) % period, wy = ((cy % period) + period) % period;
    const px = cx + hash2(wx, wy, seed), py = cy + hash2(wx, wy, seed + 7);
    const dx = px - x, dy = py - y, d = Math.sqrt(dx * dx + dy * dy);
    if (d < f1) { f2 = f1; f1 = d; id = hash2(wx, wy, seed + 13); } else if (d < f2) f2 = d;
  }
  return [f1, f2, id];
}

// evita avisos de import não usado em builds estritos
void valueNoise; void worley; void fbm; void matById; void WORLD_CELLS;
