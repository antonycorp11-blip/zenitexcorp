import { CELL, CHUNK, WORLD_W, WORLD_H, WORLD_CW, WORLD_CH, wrapX } from '../core/constants';
import { hash2 } from '../core/rng';
import { MAT, MATERIALS, IS_SOLID, IS_LOOSE, IS_LIQUID, GRAIN } from '../data/materials';
import { SECTORS } from '../data/sectors';
import type { World } from '../world/World';
import type { Sprites } from './Sprites';

export interface Emitter { x: number; y: number; r: number; c: [number, number, number]; a: number; flicker?: number; }
interface ChunkRender { canvas: HTMLCanvasElement; lights: Emitter[]; used: number; baked?: { hole: HTMLCanvasElement; glow: HTMLCanvasElement } | null; }

/** px de canvas por célula (o chunk é desenhado em alta resolução e reduzido na tela) */
export const RES = 4;
const MAX_CACHE = 70;

type C3 = readonly number[];
const rgb = (c: C3, k = 1, a = 1) => `rgba(${Math.min(255, c[0] * k) | 0},${Math.min(255, c[1] * k) | 0},${Math.min(255, c[2] * k) | 0},${a})`;

/**
 * Terreno ILUSTRADO em HD (vista lateral).
 * Cada chunk vira um desenho vetorial: a máscara de terreno é contornada (marching squares) e preenchida com uma
 * textura pintada da camada; bordas ganham contorno escuro e brilho no topo; minério vira gemas; grãos soltos
 * viram bolinhas de areia; líquidos têm superfície brilhante. Só a área alterada é redesenhada.
 */
export class TerrainRenderer {
  private cache = new Map<number, ChunkRender>();
  private pats = new Map<string, HTMLCanvasElement>();
  private grainSprites = new Map<number, HTMLCanvasElement[]>();
  frame = 0;

  constructor(private world: World, _sprites: Sprites) {}

  private grainSprite(m: number, shade: number, glint: boolean): HTMLCanvasElement {
    let variants = this.grainSprites.get(m);
    if (!variants) { variants = []; this.grainSprites.set(m, variants); }
    const index = shade * 2 + Number(glint);
    if (variants[index]) return variants[index];
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 8;
    const ctx = canvas.getContext('2d')!;
    const c = MATERIALS[m].top, k = 0.82 + (shade + 0.5) / 8 * 0.36;
    ctx.fillStyle = rgb(c, k * 0.7); ctx.beginPath(); ctx.arc(4, 4.4, RES * 0.62, 0, 7); ctx.fill();
    ctx.fillStyle = rgb(c, k); ctx.beginPath(); ctx.arc(3.8, 3.8, RES * 0.5, 0, 7); ctx.fill();
    if (glint) { ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(4 - RES * 0.18, 4 - RES * 0.2, RES * 0.16, 0, 7); ctx.fill(); }
    variants[index] = canvas;
    return canvas;
  }

  invalidate(k: number) { const c = this.cache.get(k); if (c) c.used = -1; }

  // ---------------- texturas pintadas (repetíveis) ----------------
  private texture(key: string, base: C3, dark: C3, light: C3, kind: 'soil' | 'rock' | 'back' | 'ruin'): HTMLCanvasElement {
    let c = this.pats.get(key);
    if (c) return c;
    const S = 256;
    c = document.createElement('canvas'); c.width = S; c.height = S;
    const x = c.getContext('2d')!;
    x.fillStyle = rgb(base); x.fillRect(0, 0, S, S);
    const seed = key.length * 31 + key.charCodeAt(0) * 7 + key.charCodeAt(key.length - 1);
    const rnd = (i: number, k: number) => hash2(i, k, seed);
    // manchas grandes e suaves (repetidas nas bordas para emendar sem costura)
    for (let i = 0; i < 26; i++) {
      const px = rnd(i, 1) * S, py = rnd(i, 2) * S, r = 20 + rnd(i, 3) * 46;
      const col = rnd(i, 4) > 0.5 ? dark : light;
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        const g = x.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, r);
        g.addColorStop(0, rgb(col, 1, kind === 'back' ? 0.25 : 0.35)); g.addColorStop(1, rgb(col, 1, 0));
        x.fillStyle = g; x.fillRect(px + ox - r, py + oy - r, r * 2, r * 2);
      }
    }
    if (kind === 'rock' || kind === 'soil') {
      x.strokeStyle = rgb(dark, 1, 0.22); x.lineWidth = 3;
      for (let k = 0; k < 6; k++) {
        const y0 = (k + 0.5) * S / 6;
        x.beginPath();
        for (let px = 0; px <= S; px += 8) x.lineTo(px, y0 + Math.sin((px / S) * Math.PI * 4 + k) * 6);
        x.stroke();
      }
      for (let i = 0; i < (kind === 'soil' ? 70 : 45); i++) {
        const px = rnd(i, 5) * S, py = rnd(i, 6) * S, r = 2 + rnd(i, 7) * (kind === 'soil' ? 5 : 8);
        const stone: C3 = kind === 'soil' ? [118, 108, 98] : light;
        x.fillStyle = rgb(dark, 0.8, 0.5); x.beginPath(); x.ellipse(px + 1, py + 1.5, r, r * 0.75, 0, 0, 7); x.fill();
        x.fillStyle = rgb(stone, 0.95); x.beginPath(); x.ellipse(px, py, r, r * 0.75, 0, 0, 7); x.fill();
        x.fillStyle = rgb(stone, 1.35, 0.8); x.beginPath(); x.ellipse(px - r * 0.3, py - r * 0.3, r * 0.4, r * 0.25, 0, 0, 7); x.fill();
      }
      for (let i = 0; i < 900; i++) { x.fillStyle = rgb(rnd(i, 8) > 0.5 ? dark : light, 1, 0.35); x.fillRect(rnd(i, 9) * S, rnd(i, 10) * S, 1.5, 1.5); }
    } else if (kind === 'ruin') {
      x.strokeStyle = rgb(dark, 0.7, 0.8); x.lineWidth = 3;
      for (let y = 0; y < S; y += 32) { x.beginPath(); x.moveTo(0, y); x.lineTo(S, y); x.stroke(); for (let xx = (y / 32) % 2 ? 0 : 32; xx < S; xx += 64) { x.beginPath(); x.moveTo(xx, y); x.lineTo(xx, y + 32); x.stroke(); } }
      for (let i = 0; i < 14; i++) { x.strokeStyle = 'rgba(80,236,236,0.5)'; x.lineWidth = 2; const px = rnd(i, 11) * S, py = rnd(i, 12) * S; x.beginPath(); x.moveTo(px, py); x.lineTo(px + 8, py); x.lineTo(px + 8, py + 8); x.stroke(); }
    } else {
      x.strokeStyle = rgb(dark, 0.7, 0.35); x.lineWidth = 2;
      for (let i = 0; i < 18; i++) { const px = rnd(i, 13) * S, py = rnd(i, 14) * S; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (rnd(i, 15) - 0.5) * 40, py + rnd(i, 16) * 30); x.lineTo(px + (rnd(i, 17) - 0.5) * 50, py + 20 + rnd(i, 18) * 30); x.stroke(); }
    }
    this.pats.set(key, c);
    return c;
  }

  private layerColors() {
    const sd = SECTORS[this.world.gen.layer - 1];
    const r = MATERIALS[sd.rock];
    const L = this.world.gen.layer;
    const base: C3 = L === 1 ? [150, 96, 60] : [r.top[0] * 1.25, r.top[1] * 1.25, r.top[2] * 1.25];
    const dark: C3 = L === 1 ? [104, 62, 38] : [r.face[0] * 1.2, r.face[1] * 1.2, r.face[2] * 1.2];
    const light: C3 = L === 1 ? [190, 132, 86] : [r.top[0] * 1.7, r.top[1] * 1.7, r.top[2] * 1.7];
    return { base, dark, light, L };
  }

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
      canvas.width = CHUNK * RES; canvas.height = CHUNK * RES;
      const lights: Emitter[] = [];
      this.renderRegion(cx, cy, canvas.getContext('2d')!, 0, 0, CHUNK, CHUNK, lights);
      c = { canvas, lights, used: this.frame, baked: null };
      this.cache.set(k, c);
      this.evict();
    }
    this.world.dirty.delete(k);
    this.world.dirtyRect.delete(k);
    return c;
  }

  /** libera os chunks menos usados (memória no celular) */
  private evict() {
    if (this.cache.size <= MAX_CACHE) return;
    const arr = [...this.cache.entries()].sort((a, b) => a[1].used - b[1].used);
    for (let i = 0; i < arr.length - MAX_CACHE; i++) { this.cache.delete(arr[i][0]); this.world.dirtyFull(arr[i][0]); }
  }

  private renderRegion(cx: number, cy: number, ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, lights: Emitter[] | null) {
    const w = this.world, gen = w.gen, mat = w.mat;
    const ox = cx * CHUNK, oy = cy * CHUNK;
    x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2); x1 = Math.min(CHUNK, x1 + 2); y1 = Math.min(CHUNK, y1 + 2);
    const { base, dark, light, L } = this.layerColors();
    const soil = this.texture('soil' + L, base, dark, light, L === 1 ? 'soil' : 'rock');
    const back = this.texture('back' + L, [base[0] * 0.32, base[1] * 0.32, base[2] * 0.34], [base[0] * 0.18, base[1] * 0.18, base[2] * 0.2], [base[0] * 0.45, base[1] * 0.45, base[2] * 0.46], 'back');
    const ruin = this.texture('ruin', [44, 64, 72], [20, 30, 36], [70, 96, 104], 'ruin');
    const pat = (cnv: HTMLCanvasElement) => { const p = ctx.createPattern(cnv, 'repeat')!; p.setTransform(new DOMMatrix().translate(-ox * RES, -oy * RES)); return p; };
    const at = (lx: number, ly: number) => { const X = ox + lx, Y = oy + ly; return Y < 0 || Y >= WORLD_H ? MAT.EDGE : mat[Y * WORLD_W + wrapX(X, WORLD_W)]; };

    ctx.save();
    ctx.beginPath(); ctx.rect(x0 * RES, y0 * RES, (x1 - x0) * RES, (y1 - y0) * RES); ctx.clip();
    ctx.clearRect(x0 * RES, y0 * RES, (x1 - x0) * RES, (y1 - y0) * RES);

    // 1) parede do fundo (abaixo da linha do chão)
    ctx.fillStyle = pat(back);
    ctx.beginPath();
    for (let lx = x0; lx < x1; lx++) { const sy = gen.surfaceAt(ox + lx) - oy; const top = Math.max(y0, sy + 1); if (top < y1) ctx.rect(lx * RES, top * RES, RES + 0.5, (y1 - top) * RES); }
    ctx.fill();
    for (const r of gen.ruins) {
      const ax = Math.max(x0, r.x0 - ox), ay = Math.max(y0, r.y0 - oy), bx = Math.min(x1, r.x0 + r.w - ox), by = Math.min(y1, r.y0 + r.h - oy);
      if (ax < bx && ay < by) { ctx.fillStyle = pat(ruin); ctx.globalAlpha = 0.55; ctx.fillRect(ax * RES, ay * RES, (bx - ax) * RES, (by - ay) * RES); ctx.globalAlpha = 1; }
    }

    // 2) líquidos (colunas com degradê; superfície brilhante)
    for (let lx = x0; lx < x1; lx++) for (let ly = y0; ly < y1; ly++) {
      const m = at(lx, ly); if (!IS_LIQUID[m]) continue;
      const def = MATERIALS[m];
      let n = 1; while (ly + n < y1 && at(lx, ly + n) === m) n++;
      const surf = at(lx, ly - 1) === MAT.AIR;
      const g = ctx.createLinearGradient(0, ly * RES, 0, (ly + n) * RES + 40);
      if (m === MAT.LAVA) { g.addColorStop(0, 'rgb(255,200,90)'); g.addColorStop(1, 'rgb(200,50,10)'); }
      else { g.addColorStop(0, rgb(def.top, 1.5, 0.85)); g.addColorStop(1, rgb(def.top, 0.7, 0.95)); }
      ctx.fillStyle = g; ctx.fillRect(lx * RES, ly * RES, RES + 0.5, n * RES);
      if (surf) { ctx.fillStyle = m === MAT.LAVA ? 'rgba(255,240,180,0.95)' : 'rgba(220,245,255,0.8)'; ctx.fillRect(lx * RES, ly * RES, RES + 0.5, 1.5); }
      if (lights && m === MAT.LAVA && hash2(ox + lx, oy + ly, 3) > 0.993) lights.push({ x: (ox + lx) * CELL, y: (oy + ly) * CELL, r: 46, c: [255, 110, 30], a: 0.6 });
      ly += n - 1;
    }

    // 3) terreno sólido: contorno suave (marching squares sobre os centros das células)
    const solid = (lx: number, ly: number) => IS_SOLID[at(lx, ly)] === 1;
    const fill = new Path2D(), edge = new Path2D();
    for (let ly = y0 - 1; ly < y1; ly++) for (let lx = x0 - 1; lx < x1; lx++) {
      const a = solid(lx, ly), b = solid(lx + 1, ly), c = solid(lx + 1, ly + 1), d = solid(lx, ly + 1);
      const idx = (a ? 8 : 0) | (b ? 4 : 0) | (c ? 2 : 0) | (d ? 1 : 0);
      if (idx === 0) continue;
      const ax = (lx + 0.5) * RES, ay = (ly + 0.5) * RES, bx = ax + RES, dy = ay + RES;
      const A: [number, number] = [ax, ay], Bp: [number, number] = [bx, ay], C: [number, number] = [bx, dy], D: [number, number] = [ax, dy];
      const T: [number, number] = [ax + RES / 2, ay], R2: [number, number] = [bx, ay + RES / 2], B: [number, number] = [ax + RES / 2, dy], Lf: [number, number] = [ax, ay + RES / 2];
      const poly = (pts: [number, number][]) => { fill.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) fill.lineTo(pts[i][0], pts[i][1]); fill.closePath(); };
      const seg = (p: [number, number], q: [number, number]) => { edge.moveTo(p[0], p[1]); edge.lineTo(q[0], q[1]); };
      switch (idx) {
        case 15: poly([A, Bp, C, D]); break;
        case 1: poly([Lf, B, D]); seg(Lf, B); break;
        case 2: poly([B, R2, C]); seg(B, R2); break;
        case 3: poly([Lf, R2, C, D]); seg(Lf, R2); break;
        case 4: poly([T, Bp, R2]); seg(T, R2); break;
        case 5: poly([Lf, T, Bp, R2, B, D]); seg(Lf, T); seg(R2, B); break;
        case 6: poly([T, Bp, C, B]); seg(T, B); break;
        case 7: poly([Lf, T, Bp, C, D]); seg(Lf, T); break;
        case 8: poly([A, T, Lf]); seg(T, Lf); break;
        case 9: poly([A, T, B, D]); seg(T, B); break;
        case 10: poly([A, T, R2, C, B, Lf]); seg(T, R2); seg(B, Lf); break;
        case 11: poly([A, T, R2, C, D]); seg(T, R2); break;
        case 12: poly([A, Bp, R2, Lf]); seg(R2, Lf); break;
        case 13: poly([A, Bp, R2, B, D]); seg(R2, B); break;
        case 14: poly([A, Bp, C, B, Lf]); seg(B, Lf); break;
      }
    }
    ctx.fillStyle = pat(soil);
    ctx.fill(fill);
    ctx.save();
    ctx.clip(fill);
    for (let ly = y0; ly < y1; ly++) for (let lx = x0; lx < x1; lx++) {
      const m = at(lx, ly); if (!IS_SOLID[m]) continue;
      const def = MATERIALS[m];
      const X = ox + lx, Y = oy + ly;
      if (def.kind === 'ore') { ctx.fillStyle = rgb(def.face, 1.25, 0.55); ctx.fillRect(lx * RES - 1, ly * RES - 1, RES + 2, RES + 2); }
      else if (def.kind === 'edge') { ctx.fillStyle = 'rgba(22,18,24,0.94)'; ctx.fillRect(lx * RES - 1, ly * RES - 1, RES + 2, RES + 2); }
      else if (def.kind === 'ancient') { ctx.fillStyle = pat(ruin); ctx.fillRect(lx * RES - 1, ly * RES - 1, RES + 2, RES + 2); }
      else if (L === 1 && m !== MAT.R1) { ctx.fillStyle = 'rgba(70,60,70,0.35)'; ctx.fillRect(lx * RES, ly * RES, RES, RES); }
      if (def.kind === 'ore' && (X % 3) === 1 && (Y % 3) === 1 && hash2(X, Y, 11) > 0.35) this.gem(ctx, (lx + 0.5) * RES, (ly + 0.5) * RES, def.top, def.face, hash2(X, Y, 12));
      if (lights && def.glow && hash2(X, Y, 13) > 0.996) lights.push({ x: X * CELL, y: Y * CELL, r: 30, c: def.glow as [number, number, number], a: 0.5 });
      const dm = w.dmg[Y * WORLD_W + X];
      if (dm > 30) { ctx.strokeStyle = `rgba(0,0,0,${dm / 255 * 0.7})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(lx * RES, ly * RES + 1); ctx.lineTo(lx * RES + RES, ly * RES + RES - 1); ctx.stroke(); }
    }
    // brilho por dentro das bordas de cima / sombra por dentro das de baixo
    ctx.lineCap = 'round';
    ctx.translate(0, RES * 0.9); ctx.strokeStyle = rgb(light, 1.15, 0.75); ctx.lineWidth = RES * 0.9; ctx.stroke(edge); ctx.translate(0, -RES * 0.9);
    ctx.translate(0, -RES * 1.1); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = RES * 1.4; ctx.stroke(edge); ctx.translate(0, RES * 1.1);
    if (L === 1) {
      // grama: faixa verde por dentro do topo, só perto da superfície
      ctx.save();
      ctx.beginPath();
      for (let lx = x0 - 1; lx <= x1; lx++) { const sy = gen.surfaceAt(ox + lx) - oy; ctx.rect(lx * RES, (sy - 2) * RES, RES + 0.5, 7 * RES); }
      ctx.clip();
      ctx.translate(0, RES * 1.2); ctx.strokeStyle = '#4f9a36'; ctx.lineWidth = RES * 2.6; ctx.stroke(edge);
      ctx.translate(0, -RES * 0.6); ctx.strokeStyle = '#78c24a'; ctx.lineWidth = RES * 1.2; ctx.stroke(edge);
      ctx.restore();
    }
    ctx.restore();
    ctx.strokeStyle = L === 1 ? 'rgba(46,26,14,0.95)' : 'rgba(10,10,14,0.9)'; ctx.lineWidth = RES * 0.55; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.stroke(edge);

    // 4) capim e flores acima da superfície (Terra)
    if (L === 1) {
      for (let lx = x0; lx < x1; lx++) {
        const X = ox + lx, sy = gen.surfaceAt(X) - oy;
        if (sy < y0 - 1 || sy > y1 || !solid(lx, sy) || solid(lx, sy - 1)) continue;
        if (hash2(X, 1, 5) < 0.45) continue;
        const h = (2 + hash2(X, 2, 5) * 4) * RES, bx = (lx + 0.5) * RES, by = sy * RES + RES * 0.6, lean = (hash2(X, 3, 5) - 0.5) * RES * 2;
        ctx.strokeStyle = hash2(X, 4, 5) > 0.5 ? '#5fae3c' : '#86cc52'; ctx.lineWidth = RES * 0.45;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + lean * 0.3, by - h * 0.6, bx + lean, by - h); ctx.stroke();
        if (hash2(X, 6, 5) > 0.95) { ctx.fillStyle = hash2(X, 7, 5) > 0.5 ? '#fff4c8' : '#ffd23f'; ctx.beginPath(); ctx.arc(bx + lean, by - h, RES * 0.7, 0, 7); ctx.fill(); }
      }
    }

    // 5) grãos soltos: bolinhas de areia com brilho
    for (let ly = y0; ly < y1; ly++) for (let lx = x0; lx < x1; lx++) {
      const m = at(lx, ly); if (!IS_LOOSE[m]) continue;
      const X = ox + lx, Y = oy + ly;
      const h = hash2(X, Y, 5);
      if (m === GRAIN.bloco_massa) {
        ctx.fillStyle = '#6e5c4a'; ctx.fillRect(lx * RES, ly * RES, RES, RES);
        ctx.fillStyle = '#a88e70'; ctx.fillRect(lx * RES + 0.6, ly * RES + 0.6, RES - 1.4, RES - 1.4);
        continue;
      }
      const glint = !!MATERIALS[m].glow || h > 0.85 || w.aux[Y * WORLD_W + X] > 70;
      ctx.drawImage(this.grainSprite(m, Math.min(7, (h * 8) | 0), glint), lx * RES - 2, ly * RES - 2);
    }
    ctx.restore();
  }

  /** gema facetada (minério) */
  private gem(ctx: CanvasRenderingContext2D, x: number, y: number, top: C3, face: C3, h: number) {
    const s = RES * (1.6 + h * 1.4);
    ctx.save(); ctx.translate(x, y); ctx.rotate(h * 1.2 - 0.6);
    ctx.fillStyle = rgb(face, 0.8); ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.6, 0); ctx.lineTo(0, s * 0.9); ctx.lineTo(-s * 0.6, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(10,10,16,0.75)'; ctx.lineWidth = 0.9; ctx.stroke();
    ctx.fillStyle = rgb(top, 1.15); ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.6, 0); ctx.lineTo(0, s * 0.2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ctx.moveTo(-s * 0.1, -s * 0.7); ctx.lineTo(s * 0.18, -s * 0.2); ctx.lineTo(-s * 0.05, -s * 0.15); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /** Imagem do planeta amostrada por chunk; o minimapa atualiza só a região visível. */
  private ov: HTMLCanvasElement | null = null;
  private ovImg: ImageData | null = null;
  overview(_now: number, region?: { x: number; y: number; w: number; h: number }): HTMLCanvasElement {
    const S = 2, tile = CHUNK / S;
    if (!this.ov) {
      this.ov = document.createElement('canvas');
      this.ov.width = WORLD_W / S; this.ov.height = WORLD_H / S;
      this.ovImg = this.ov.getContext('2d')!.createImageData(tile, tile);
    }
    const ctx = this.ov.getContext('2d')!, img = this.ovImg!, d = img.data;
    const x0 = region ? Math.max(0, Math.floor(region.x / tile)) : 0;
    const y0 = region ? Math.max(0, Math.floor(region.y / tile)) : 0;
    const x1 = region ? Math.min(WORLD_CW, Math.ceil((region.x + region.w) / tile)) : WORLD_CW;
    const y1 = region ? Math.min(WORLD_CH, Math.ceil((region.y + region.h) / tile)) : WORLD_CH;
    const gen = this.world.gen, mat = this.world.mat, sky = SECTORS[gen.layer - 1].floor;
    for (let cy = y0; cy < y1; cy++) for (let cx = x0; cx < x1; cx++) {
      const index = cy * WORLD_CW + cx;
      if (!this.world.overviewDirty[index]) continue;
      for (let lx = 0; lx < tile; lx++) {
        const wx = cx * CHUNK + lx * S, surface = gen.surfaceAt(wx);
        for (let ly = 0; ly < tile; ly++) {
          const wy = cy * CHUNK + ly * S;
          const m = mat[wy * WORLD_W + wx], o = (ly * tile + lx) * 4;
          let r = 0, g = 0, b = 0;
          if (m === MAT.AIR) {
            const alt = surface - wy;
            if (alt > 0) { const k = Math.min(1, alt / 520); r = 110 * (1 - k) + 4 * k; g = 165 * (1 - k) + 8 * k; b = 220 * (1 - k) + 22 * k; }
            else { r = sky[0] * 0.3; g = sky[1] * 0.3; b = sky[2] * 0.3; }
          } else {
            const def = MATERIALS[m], t = def.top;
            r = t[0]; g = t[1]; b = t[2];
            if (IS_SOLID[m] && def.kind === 'rock') { r *= 0.8; g *= 0.8; b *= 0.8; }
          }
          d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
        }
      }
      ctx.putImageData(img, cx * tile, cy * tile);
      this.world.overviewDirty[index] = 0;
    }
    return this.ov;
  }
}
