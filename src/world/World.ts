import { CELL, CHUNK, WORLD_W, WORLD_H, WORLD_CW, WORLD_CH, WORLD_TW, WORLD_TH, TILE, TILE_CELLS } from '../core/constants';
import { MAT, IS_SOLID, IS_BLOCKING, IS_LIQUID, IS_LOOSE, matById } from '../data/materials';

const MOBILE = new Uint8Array(256);
for (let i = 0; i < 256; i++) MOBILE[i] = IS_LOOSE[i] || IS_LIQUID[i] ? 1 : 0;
import { WorldGen } from './WorldGen';

/** Chamado quando um grão tenta entrar numa célula ocupada por máquina. true = a máquina absorveu. */
export type GrainSink = (machineId: number, mat: number, aux: number, x: number, y: number) => boolean;

/**
 * Terreno em VISTA LATERAL: grade de células (4 px). Terreno fixo, grãos soltos que caem e escorregam
 * (areia), blocos que só caem, e líquidos que escorrem. Só chunks "acordados" são simulados.
 * `aux` guarda o teor (0..255 = 0..6,375) de cada grão de material bruto e viaja junto com ele.
 */
export class World {
  readonly gen: WorldGen;
  readonly mat = new Uint8Array(WORLD_W * WORLD_H);
  readonly aux = new Uint8Array(WORLD_W * WORLD_H);
  readonly dmg = new Uint8Array(WORLD_W * WORLD_H);
  private readonly stamp = new Uint8Array(WORLD_W * WORLD_H);
  private tick = 1;
  readonly active = new Uint8Array(WORLD_CW * WORLD_CH);
  private nextActive = new Uint8Array(WORLD_CW * WORLD_CH);
  readonly dirty = new Set<number>();
  readonly dirtyRect = new Map<number, [number, number, number, number]>();
  readonly sectorTiles: Uint8Array;
  readonly explored = new Uint8Array(WORLD_TW * WORLD_TH);
  readonly platform = new Uint8Array(WORLD_TW * WORLD_TH);
  readonly occ = new Int32Array(WORLD_TW * WORLD_TH);      // id de máquina
  readonly sectorTileTotal = new Int32Array(13);
  readonly sectorTileExplored = new Int32Array(13);
  regrowQueue: { x: number; y: number; m: number; t: number }[] = [];
  sink: GrainSink | null = null;
  private quiet = false;
  moving = 0;           // grãos que se moveram no último passo (telemetria)

  constructor(seed: number, layer = 1) {
    this.gen = new WorldGen(seed, layer);
    this.gen.generate(this.mat);
    this.sectorTiles = this.gen.buildSectorTiles(WORLD_TW, WORLD_TH);
    this.sectorTileTotal[layer] = this.sectorTiles.length;
    this.active.fill(1);
    // assenta os líquidos em silêncio antes do primeiro quadro
    this.quiet = true;
    for (let k = 0; k < 260; k++) { this.simulate(); if (this.moving < 4) break; }
    this.quiet = false;
    this.active.fill(0);
    this.stamp.fill(0);
  }

  // compatibilidade (o mapa inteiro já é gerado no construtor)
  ensureChunk(_cx: number, _cy: number) {}
  ensureAroundPx(_px: number, _py: number, _r: number) {}

  inside(x: number, y: number) { return x >= 0 && y >= 0 && x < WORLD_W && y < WORLD_H; }
  get(x: number, y: number): number { return x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H ? MAT.EDGE : this.mat[y * WORLD_W + x]; }
  peek(x: number, y: number): number { return this.get(x, y); }
  occAtCell(x: number, y: number): number { return this.occ[(y >> 2) * WORLD_TW + (x >> 2)]; }

  set(x: number, y: number, m: number, aux = 0) {
    if (!this.inside(x, y)) return;
    const i = y * WORLD_W + x;
    if (this.mat[i] === m && this.aux[i] === aux) return;
    this.mat[i] = m; this.aux[i] = aux; this.dmg[i] = 0;
    this.touch(x, y);
  }

  /** marca re-renderização e acorda a simulação ao redor */
  touch(x: number, y: number) {
    const cx = (x / CHUNK) | 0, cy = (y / CHUNK) | 0;
    const k = cy * WORLD_CW + cx;
    const lx = x - cx * CHUNK, ly = y - cy * CHUNK;
    this.markDirty(k, lx - 1, ly - 1, lx + 1, ly + 1);
    if (lx < 1 && cx > 0) this.markDirty(k - 1, CHUNK - 1, ly - 1, CHUNK - 1, ly + 1);
    if (lx > CHUNK - 2 && cx < WORLD_CW - 1) this.markDirty(k + 1, 0, ly - 1, 0, ly + 1);
    if (ly < 1 && cy > 0) this.markDirty(k - WORLD_CW, lx - 1, CHUNK - 1, lx + 1, CHUNK - 1);
    if (ly > CHUNK - 2 && cy < WORLD_CH - 1) this.markDirty(k + WORLD_CW, lx - 1, 0, lx + 1, 0);
    this.wakeChunk(cx, cy);
    if (cy > 0) this.wakeChunk(cx, cy - 1);
    if (lx < 2 && cx > 0) this.wakeChunk(cx - 1, cy);
    if (lx > CHUNK - 3 && cx < WORLD_CW - 1) this.wakeChunk(cx + 1, cy);
  }
  wake(x: number, y: number) { this.wakeChunk((x / CHUNK) | 0, (y / CHUNK) | 0); }
  private wakeChunk(cx: number, cy: number) { if (cx >= 0 && cy >= 0 && cx < WORLD_CW && cy < WORLD_CH) { this.active[cy * WORLD_CW + cx] = 1; this.nextActive[cy * WORLD_CW + cx] = 1; } }

  private markDirty(k: number, x0: number, y0: number, x1: number, y1: number) {
    if (k < 0 || k >= WORLD_CW * WORLD_CH) return;
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(CHUNK - 1, x1); y1 = Math.min(CHUNK - 1, y1);
    if (!this.dirty.has(k)) { this.dirty.add(k); this.dirtyRect.set(k, [x0, y0, x1, y1]); return; }
    const r = this.dirtyRect.get(k);
    if (!r) return;
    r[0] = Math.min(r[0], x0); r[1] = Math.min(r[1], y0); r[2] = Math.max(r[2], x1); r[3] = Math.max(r[3], y1);
  }
  dirtyFull(k: number) { this.dirty.add(k); this.dirtyRect.delete(k); }

  // ---------------- simulação de areia ----------------
  /** Um passo: grãos caem/escorregam, blocos caem, líquidos escorrem. Só chunks acordados. */
  simulate() {
    this.tick = (this.tick % 250) + 1;
    const T = this.tick;
    const mat = this.mat, aux = this.aux, st = this.stamp;
    this.nextActive.fill(0);
    let moved = 0;
    const flip = T & 1;
    for (let cy = WORLD_CH - 1; cy >= 0; cy--) {
      for (let cxi = 0; cxi < WORLD_CW; cxi++) {
        const cx = flip ? cxi : WORLD_CW - 1 - cxi;
        if (!this.active[cy * WORLD_CW + cx]) continue;
        const x0 = cx * CHUNK, y0 = cy * CHUNK;
        let any = false;
        for (let y = y0 + CHUNK - 1; y >= y0; y--) {
          if (y >= WORLD_H - 1) continue;
          for (let xi = 0; xi < CHUNK; xi++) {
            const x = flip ? x0 + xi : x0 + CHUNK - 1 - xi;
            const i = y * WORLD_W + x;
            const m = mat[i];
            if (!MOBILE[m] || st[i] === T) continue;
            const loose = IS_LOOSE[m], liq = IS_LIQUID[m];
            let to = -1;
            const below = i + WORLD_W;
            if (this.canEnter(below, m, x, y + 1)) to = below;
            else if (loose !== 2) {
              const d = (Math.random() < 0.5) ? 1 : -1;
              if (x + d > 0 && x + d < WORLD_W - 1 && this.canEnter(below + d, m, x + d, y + 1) && this.free(i + d)) to = below + d;
              else if (x - d > 0 && x - d < WORLD_W - 1 && this.canEnter(below - d, m, x - d, y + 1) && this.free(i - d)) to = below - d;
              else if (liq) {
                // líquido só escorre de lado se houver um degrau para descer por perto (assim as poças assentam)
                const fl = this.flowDir(x, y, d) || this.flowDir(x, y, -d);
                if (fl) to = i + fl;
              }
            }
            if (to < 0) {
              // grão parado em cima de máquina: a máquina pode puxar (funil)
              if (loose && this.sink) {
                const tid = this.occ[((y + 1) >> 2) * WORLD_TW + (x >> 2)];
                if (tid && this.sink(tid, m, aux[i], x, y + 1)) { mat[i] = MAT.AIR; aux[i] = 0; this.touch(x, y); any = true; moved++; }
              }
              continue;
            }
            // troca (grão afunda em líquido)
            const tm = mat[to], ta = aux[to];
            mat[to] = m; aux[to] = aux[i]; mat[i] = tm; aux[i] = ta;
            st[to] = T; st[i] = T;
            this.dmg[i] = 0;
            const tx = to % WORLD_W, ty = (to / WORLD_W) | 0;
            if (this.quiet) { this.nextActive[((ty / CHUNK) | 0) * WORLD_CW + ((tx / CHUNK) | 0)] = 1; if (cy > 0) this.nextActive[(cy - 1) * WORLD_CW + cx] = 1; }
            else { this.touch(x, y); this.touch(tx, ty); }
            any = true; moved++;
          }
        }
        if (any) this.nextActive[cy * WORLD_CW + cx] = 1;
      }
    }
    this.moving = moved;
    this.active.set(this.nextActive);
  }

  private flowDir(x: number, y: number, d: number): number {
    for (let k = 1; k <= 6; k++) {
      const nx = x + d * k;
      if (nx <= 0 || nx >= WORLD_W - 1) return 0;
      const j = y * WORLD_W + nx;
      if (this.mat[j] !== MAT.AIR || this.occ[(y >> 2) * WORLD_TW + (nx >> 2)]) return 0;
      if (this.mat[j + WORLD_W] === MAT.AIR) return d;
    }
    return 0;
  }
  private free(i: number) { const m = this.mat[i]; return m === MAT.AIR || IS_LIQUID[m] === 1; }
  /** pode entrar na célula i? (vazia, ou líquido para um grão afundar) */
  private canEnter(i: number, m: number, x: number, y: number): boolean {
    const t = this.mat[i];
    if (t !== MAT.AIR && !(IS_LIQUID[t] && !IS_LIQUID[m])) return false;
    return !this.occ[(y >> 2) * WORLD_TW + (x >> 2)];
  }

  /** Coloca um grão solto na primeira célula livre perto de (x,y). Retorna false se não couber. */
  spawnGrain(x: number, y: number, m: number, aux = 0, exact = false): boolean {
    for (const [dx, dy] of exact ? [[0, 0]] : [[0, 0], [1, 0], [-1, 0], [0, -1], [1, -1], [-1, -1], [2, 0], [-2, 0]]) {
      const nx = x + dx, ny = y + dy;
      if (!this.inside(nx, ny)) continue;
      const t = this.mat[ny * WORLD_W + nx];
      if ((t === MAT.AIR || IS_LIQUID[t]) && !this.occAtCell(nx, ny)) { this.set(nx, ny, m, aux); return true; }
    }
    return false;
  }

  // ---------------- consultas ----------------
  solidAt(x: number, y: number) { return IS_SOLID[this.get(x, y)] === 1; }
  /** corpo sólido para o jogador (terreno, grãos, borda) */
  blockedPx(px: number, py: number): boolean { return IS_BLOCKING[this.get(Math.floor(px / CELL), Math.floor(py / CELL))] === 1; }
  liquidUnder(px: number, py: number): number { const m = this.get(Math.floor(px / CELL), Math.floor(py / CELL)); return IS_LIQUID[m] ? m : 0; }

  damage(x: number, y: number, amount: number): boolean {
    const m = this.get(x, y);
    if (!IS_SOLID[m]) return false;
    const def = matById(m);
    const i = y * WORLD_W + x;
    const v = this.dmg[i] + (amount / Math.max(0.01, def.hardness)) * 255;
    if (v >= 255) return true;
    const f = Math.floor(v);
    this.dmg[i] = f + (Math.random() < v - f ? 1 : 0);
    return false;
  }

  sectorAtPx(px: number, py: number): number { return this.sectorAtTile(Math.floor(px / TILE), Math.floor(py / TILE)); }
  sectorAtTile(tx: number, ty: number): number { return tx < 0 || ty < 0 || tx >= WORLD_TW || ty >= WORLD_TH ? 0 : this.gen.layer; }

  reveal(px: number, py: number, radiusTiles: number): number {
    const cx = Math.floor(px / TILE), cy = Math.floor(py / TILE);
    const r2 = radiusTiles * radiusTiles;
    let newly = 0;
    for (let y = cy - radiusTiles; y <= cy + radiusTiles; y++) {
      if (y < 0 || y >= WORLD_TH) continue;
      for (let x = cx - radiusTiles; x <= cx + radiusTiles; x++) {
        if (x < 0 || x >= WORLD_TW) continue;
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy > r2) continue;
        const i = y * WORLD_TW + x;
        if (!this.explored[i]) { this.explored[i] = 1; this.sectorTileExplored[this.gen.layer]++; newly++; }
      }
    }
    return newly;
  }
  exploredFrac(sector: number) { const t = this.sectorTileTotal[sector]; return t ? this.sectorTileExplored[sector] / t : 0; }

  /** Tile livre para construir: sem terreno fixo, sem máquina (grãos e líquido são empurrados/apagados). */
  tileFree(tx: number, ty: number, _onLiquid = false): boolean {
    if (tx < 0 || ty < 0 || tx >= WORLD_TW || ty >= WORLD_TH) return false;
    if (this.occ[ty * WORLD_TW + tx]) return false;
    for (let y = 0; y < TILE_CELLS; y++) for (let x = 0; x < TILE_CELLS; x++) {
      if (IS_SOLID[this.get(tx * TILE_CELLS + x, ty * TILE_CELLS + y)]) return false;
    }
    return true;
  }
  /** apoio: há terreno/grão/máquina logo abaixo do tile? */
  tileSupported(tx: number, ty: number): boolean {
    const y = (ty + 1) * TILE_CELLS;
    if (ty + 1 < WORLD_TH && this.occ[(ty + 1) * WORLD_TW + tx]) return true;
    for (let x = 0; x < TILE_CELLS; x++) if (IS_BLOCKING[this.get(tx * TILE_CELLS + x, y)]) return true;
    return false;
  }
  tileHasLiquid(tx: number, ty: number): boolean {
    for (let y = 0; y < TILE_CELLS; y++) for (let x = 0; x < TILE_CELLS; x++) if (IS_LIQUID[this.get(tx * TILE_CELLS + x, ty * TILE_CELLS + y)]) return true;
    return false;
  }
  /** apaga grãos/líquidos dentro de um tile (ao construir em cima) — devolve os grãos removidos */
  clearTile(tx: number, ty: number): { m: number; a: number }[] {
    const out: { m: number; a: number }[] = [];
    for (let y = 0; y < TILE_CELLS; y++) for (let x = 0; x < TILE_CELLS; x++) {
      const cx = tx * TILE_CELLS + x, cy = ty * TILE_CELLS + y, i = cy * WORLD_W + cx;
      const m = this.mat[i];
      if (IS_LOOSE[m]) out.push({ m, a: this.aux[i] });
      if (IS_LOOSE[m] || IS_LIQUID[m]) this.set(cx, cy, MAT.AIR);
    }
    return out;
  }

  // ---------------- save (RLE do mapa inteiro) ----------------
  serializeChunks(): Record<string, string> { return { mat: rle(this.mat), aux: rle(this.aux) }; }
  loadChunks(data: Record<string, string>) {
    if (!data?.mat) return;
    unrle(data.mat, this.mat);
    if (data.aux) unrle(data.aux, this.aux);
    for (let k = 0; k < WORLD_CW * WORLD_CH; k++) this.dirtyFull(k);
    this.active.fill(1);
  }
}

function rle(a: Uint8Array): string {
  let s = '';
  let prev = a[0], run = 0;
  const parts: string[] = [];
  for (let i = 0; i <= a.length; i++) {
    const v = i < a.length ? a[i] : -1;
    if (v === prev && run < 255) { run++; continue; }
    s += String.fromCharCode(prev, run);
    if (s.length > 8192) { parts.push(s); s = ''; }
    prev = v; run = 1;
  }
  parts.push(s);
  return btoa(parts.join(''));
}
function unrle(b: string, out: Uint8Array) {
  const s = atob(b);
  let p = 0;
  for (let i = 0; i < s.length; i += 2) { const v = s.charCodeAt(i), run = s.charCodeAt(i + 1); out.fill(v, p, p + run); p += run; }
}
