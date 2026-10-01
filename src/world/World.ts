import { CELL, CHUNK, WORLD_CELLS, WORLD_CHUNKS, WORLD_TILES, TILE, TILE_CELLS } from '../core/constants';
import { MAT, IS_SOLID, IS_BLOCKING, IS_LIQUID, matById } from '../data/materials';
import { WorldGen } from './WorldGen';

/**
 * Armazena o terreno em células (4 px). Chunks são gerados sob demanda.
 * Só chunks modificados vão para o save (como diferença do gerado).
 */
export class World {
  readonly gen: WorldGen;
  readonly mat = new Uint8Array(WORLD_CELLS * WORLD_CELLS);
  readonly dmg = new Uint8Array(WORLD_CELLS * WORLD_CELLS);    // dano acumulado 0..255
  readonly chunkReady = new Uint8Array(WORLD_CHUNKS * WORLD_CHUNKS);
  readonly modified = new Set<number>();
  readonly dirty = new Set<number>();
  /** retângulo sujo por chunk, em células locais [x0,y0,x1,y1] (ausente = chunk inteiro) */
  readonly dirtyRect = new Map<number, [number, number, number, number]>();
  readonly sectorTiles: Uint8Array;
  readonly explored = new Uint8Array(WORLD_TILES * WORLD_TILES);
  readonly platform = new Uint8Array(WORLD_TILES * WORLD_TILES); // tile caminhável sobre líquido
  readonly occ = new Int32Array(WORLD_TILES * WORLD_TILES);      // id de máquina + 1
  readonly sectorTileTotal = new Int32Array(13);
  readonly sectorTileExplored = new Int32Array(13);
  /** células removidas em setores de regeneração (necrocristais) */
  regrowQueue: { x: number; y: number; m: number; t: number }[] = [];

  constructor(seed: number, layer = 1) {
    this.gen = new WorldGen(seed, layer);
    this.sectorTiles = this.gen.buildSectorTiles(WORLD_TILES);
    for (let i = 0; i < this.sectorTiles.length; i++) this.sectorTileTotal[this.sectorTiles[i]]++;
  }

  ensureChunk(cx: number, cy: number) {
    if (cx < 0 || cy < 0 || cx >= WORLD_CHUNKS || cy >= WORLD_CHUNKS) return;
    const k = cy * WORLD_CHUNKS + cx;
    if (this.chunkReady[k]) return;
    this.gen.generateChunk(cx, cy, this.mat, WORLD_CELLS);
    this.chunkReady[k] = 1;
  }

  ensureAroundPx(px: number, py: number, radiusPx: number) {
    const c0x = Math.floor((px - radiusPx) / (CHUNK * CELL)), c1x = Math.floor((px + radiusPx) / (CHUNK * CELL));
    const c0y = Math.floor((py - radiusPx) / (CHUNK * CELL)), c1y = Math.floor((py + radiusPx) / (CHUNK * CELL));
    for (let y = c0y; y <= c1y; y++) for (let x = c0x; x <= c1x; x++) this.ensureChunk(x, y);
  }

  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= WORLD_CELLS || y >= WORLD_CELLS) return MAT.EDGE;
    const k = (y >> 6) * WORLD_CHUNKS + (x >> 6);
    if (!this.chunkReady[k]) this.ensureChunk(x >> 6, y >> 6);
    return this.mat[y * WORLD_CELLS + x];
  }

  /** Versão sem geração (para renderização de bordas já geradas) */
  peek(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= WORLD_CELLS || y >= WORLD_CELLS) return MAT.EDGE;
    return this.mat[y * WORLD_CELLS + x];
  }

  set(x: number, y: number, m: number) {
    if (x < 0 || y < 0 || x >= WORLD_CELLS || y >= WORLD_CELLS) return;
    this.get(x, y);
    const i = y * WORLD_CELLS + x;
    if (this.mat[i] === m) return;
    this.mat[i] = m;
    this.dmg[i] = 0;
    const cx = x >> 6, cy = y >> 6;
    const k = cy * WORLD_CHUNKS + cx;
    this.modified.add(k);
    const lx = x & 63, ly = y & 63;
    this.markDirty(k, lx - 2, ly - 4, lx + 2, ly + 2);
    // vizinhos: bordas e faces 3/4 dependem das células ao redor
    if (lx < 2) this.markDirty(k - 1, 60, ly - 4, 63, ly + 2);
    if (lx > 61) this.markDirty(k + 1, 0, ly - 4, 3, ly + 2);
    if (ly < 5) this.markDirty(k - WORLD_CHUNKS, lx - 2, 58, lx + 2, 63);
    if (ly > 61) this.markDirty(k + WORLD_CHUNKS, lx - 2, 0, lx + 2, 3);
  }

  private markDirty(k: number, x0: number, y0: number, x1: number, y1: number) {
    if (k < 0 || k >= WORLD_CHUNKS * WORLD_CHUNKS) return;
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(63, x1); y1 = Math.min(63, y1);
    if (!this.dirty.has(k)) { this.dirty.add(k); this.dirtyRect.set(k, [x0, y0, x1, y1]); return; }
    const r = this.dirtyRect.get(k);
    if (!r) return; // já marcado como inteiro
    r[0] = Math.min(r[0], x0); r[1] = Math.min(r[1], y0); r[2] = Math.max(r[2], x1); r[3] = Math.max(r[3], y1);
  }

  /** marca o chunk inteiro para re-renderização */
  dirtyFull(k: number) { this.dirty.add(k); this.dirtyRect.delete(k); }

  solidAt(x: number, y: number) { return IS_SOLID[this.get(x, y)] === 1; }

  /** Caminhável em px de mundo (considera plataformas sobre líquidos). */
  blockedPx(px: number, py: number): boolean {
    const x = Math.floor(px / CELL), y = Math.floor(py / CELL);
    const m = this.get(x, y);
    if (!IS_BLOCKING[m]) return false;
    if (IS_LIQUID[m]) {
      const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
      if (this.platform[ty * WORLD_TILES + tx]) return false;
    }
    return true;
  }

  liquidUnder(px: number, py: number): number {
    const m = this.get(Math.floor(px / CELL), Math.floor(py / CELL));
    if (!IS_LIQUID[m]) return 0;
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    return this.platform[ty * WORLD_TILES + tx] ? 0 : m;
  }

  /** Aplica dano de mineração. Retorna true se a célula foi removida. */
  damage(x: number, y: number, amount: number): boolean {
    const m = this.get(x, y);
    if (!IS_SOLID[m]) return false;
    const def = matById(m);
    const i = y * WORLD_CELLS + x;
    const add = (amount / Math.max(0.01, def.hardness)) * 255;
    const v = this.dmg[i] + add;
    if (v >= 255) return true;
    // arredondamento estocástico: incrementos < 1 não se perdem no Uint8
    const f = Math.floor(v);
    this.dmg[i] = f + (Math.random() < v - f ? 1 : 0);
    return false;
  }

  sectorAtPx(px: number, py: number): number {
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    if (tx < 0 || ty < 0 || tx >= WORLD_TILES || ty >= WORLD_TILES) return 0;
    return this.sectorTiles[ty * WORLD_TILES + tx];
  }
  sectorAtTile(tx: number, ty: number): number {
    if (tx < 0 || ty < 0 || tx >= WORLD_TILES || ty >= WORLD_TILES) return 0;
    return this.sectorTiles[ty * WORLD_TILES + tx];
  }

  reveal(px: number, py: number, radiusTiles: number): number {
    const cx = Math.floor(px / TILE), cy = Math.floor(py / TILE);
    const r2 = radiusTiles * radiusTiles;
    let newly = 0;
    for (let y = cy - radiusTiles; y <= cy + radiusTiles; y++) {
      if (y < 0 || y >= WORLD_TILES) continue;
      for (let x = cx - radiusTiles; x <= cx + radiusTiles; x++) {
        if (x < 0 || x >= WORLD_TILES) continue;
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy > r2) continue;
        const i = y * WORLD_TILES + x;
        if (!this.explored[i]) { this.explored[i] = 1; this.sectorTileExplored[this.sectorTiles[i]]++; newly++; }
      }
    }
    return newly;
  }

  exploredFrac(sector: number) {
    const t = this.sectorTileTotal[sector];
    return t ? this.sectorTileExplored[sector] / t : 0;
  }

  /** Um tile está livre para construção se todas as suas células forem chão. */
  tileFree(tx: number, ty: number, onLiquid = false): boolean {
    if (tx < 0 || ty < 0 || tx >= WORLD_TILES || ty >= WORLD_TILES) return false;
    const i = ty * WORLD_TILES + tx;
    if (this.occ[i]) return false;
    let liquid = 0;
    for (let y = 0; y < TILE_CELLS; y++) for (let x = 0; x < TILE_CELLS; x++) {
      const m = this.get(tx * TILE_CELLS + x, ty * TILE_CELLS + y);
      if (IS_SOLID[m]) return false;
      if (IS_LIQUID[m]) liquid++;
    }
    if (onLiquid) return liquid > 0 && !this.platform[i];
    return liquid === 0 || this.platform[i] === 1;
  }

  tileHasLiquid(tx: number, ty: number): boolean {
    for (let y = 0; y < TILE_CELLS; y++) for (let x = 0; x < TILE_CELLS; x++)
      if (IS_LIQUID[this.get(tx * TILE_CELLS + x, ty * TILE_CELLS + y)]) return true;
    return false;
  }

  // ---------- Save ----------
  serializeChunks(): Record<number, string> {
    const out: Record<number, string> = {};
    for (const k of this.modified) {
      const cx = k % WORLD_CHUNKS, cy = Math.floor(k / WORLD_CHUNKS);
      const arr: number[] = [];
      let prev = -1, run = 0;
      for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) {
        const v = this.mat[(cy * CHUNK + y) * WORLD_CELLS + cx * CHUNK + x];
        if (v === prev && run < 255) run++;
        else { if (prev >= 0) arr.push(prev, run); prev = v; run = 1; }
      }
      arr.push(prev, run);
      let s = '';
      for (const v of arr) s += String.fromCharCode(v);
      out[k] = btoa(s);
    }
    return out;
  }

  loadChunks(data: Record<string, string>) {
    for (const key of Object.keys(data)) {
      const k = Number(key);
      const cx = k % WORLD_CHUNKS, cy = Math.floor(k / WORLD_CHUNKS);
      this.ensureChunk(cx, cy);
      const s = atob(data[key]);
      let p = 0;
      for (let i = 0; i < s.length; i += 2) {
        const v = s.charCodeAt(i), run = s.charCodeAt(i + 1);
        for (let r = 0; r < run; r++, p++) {
          const x = p % CHUNK, y = Math.floor(p / CHUNK);
          this.mat[(cy * CHUNK + y) * WORLD_CELLS + cx * CHUNK + x] = v;
        }
      }
      this.modified.add(k);
      this.dirtyFull(k);
    }
  }
}
