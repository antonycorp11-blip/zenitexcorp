import { CHUNK, WORLD_CELLS, TILE_CELLS } from '../core/constants';
import { fbm, ridged, valueNoise, worley } from '../core/noise';
import { hash2, RNG } from '../core/rng';
import { MAT } from '../data/materials';
import { SECTORS, LAYER_COUNT, type SectorDef } from '../data/sectors';

export const SITE = 160;            // grade de sítios de ruína (células)

export interface RuinSite {
  id: number;
  sector: number;
  x0: number; y0: number; w: number; h: number; // retângulo em células
  kind: 'casa' | 'templo' | 'cidade';
  artifacts: { x: number; y: number }[];        // em células
}
export interface LooseArtifact { id: number; x: number; y: number; sector: number; }

/** Raio (células) da clareira de pouso: espaço para a base inteira da camada. */
export const LANDING_R = 58;
/** Raio (células) do piso de concreto da base. */
export const PAD_R = 44;

/** Geração determinística. Tudo é função de (seed, x, y). */
export class WorldGen {
  readonly seed: number;
  readonly ruins: RuinSite[] = [];
  readonly ruinGrid = new Map<number, RuinSite>();
  readonly loose: LooseArtifact[] = [];
  readonly landing: { x: number; y: number };   // células
  readonly coreCenter: { x: number; y: number };

  readonly layer: number;
  readonly R: number;                 // raio do disco da camada (células)

  constructor(seed: number, layer = 1) {
    this.seed = seed;
    this.layer = layer;
    this.sd = SECTORS[layer - 1];
    this.R = this.sd.radius * WORLD_CELLS;
    const c = WORLD_CELLS / 2;
    // pouso no centro (o poço de descida); no Núcleo o Coração ocupa o centro
    this.landing = layer === LAYER_COUNT ? { x: c, y: Math.round(c - this.R * 0.5) } : { x: c, y: c };
    this.coreCenter = { x: c, y: c };
    this.buildSites();
  }
  private sd: SectorDef;

  /** Toda a camada é um único "setor": devolve [camada, camada, ∞]. */
  voronoi(_x: number, _y: number): [number, number, number] { return [this.layer, this.layer, 1e9]; }

  insidePlanet(x: number, y: number): boolean {
    const c = WORLD_CELLS / 2;
    const r = Math.hypot(x - c, y - c);
    return r < this.R * (1 - 0.03 * fbm(x * 0.01, y * 0.01, this.seed + 3, 2));
  }

  private buildSites() {
    const n = Math.floor(WORLD_CELLS / SITE);
    let rid = 0, lid = 0;
    for (let gy = 0; gy < n; gy++) for (let gx = 0; gx < n; gx++) {
      const cx = gx * SITE + SITE / 2, cy = gy * SITE + SITE / 2;
      if (!this.insidePlanet(cx, cy)) continue;
      const [sec] = this.voronoi(cx, cy);
      const sd = SECTORS[sec - 1];
      const h = hash2(gx, gy, this.seed + 77);
      const dl = Math.hypot(cx - this.landing.x, cy - this.landing.y);
      if (dl < 110) continue; // não bloquear a área de pouso
      if (h < sd.ruins * 0.85) {
        const rng = new RNG((this.seed ^ (gx * 7919 + gy * 104729)) >>> 0);
        const big = sd.ruins > 0.5 ? rng.chance(0.55) : rng.chance(0.15);
        const kind: RuinSite['kind'] = sd.ruins > 0.5 && rng.chance(0.5) ? 'cidade' : big ? 'templo' : 'casa';
        const w = kind === 'cidade' ? rng.int(96, 128) : kind === 'templo' ? rng.int(56, 84) : rng.int(28, 44);
        const hh = kind === 'cidade' ? rng.int(80, 120) : kind === 'templo' ? rng.int(52, 76) : rng.int(24, 40);
        const x0 = gx * SITE + rng.int(8, SITE - w - 8), y0 = gy * SITE + rng.int(8, SITE - hh - 8);
        const arts: { x: number; y: number }[] = [];
        const na = kind === 'cidade' ? 3 : kind === 'templo' ? 2 : 1;
        for (let i = 0; i < na; i++) arts.push({ x: x0 + Math.floor(w * (0.3 + 0.4 * rng.next())), y: y0 + Math.floor(hh * (0.3 + 0.4 * rng.next())) });
        const site: RuinSite = { id: rid++, sector: sec, x0, y0, w, h: hh, kind, artifacts: arts };
        this.ruins.push(site);
        this.ruinGrid.set(gy * n + gx, site);
      } else if (h > 0.62) {
        // artefato solto, às vezes enterrado na rocha
        const rng = new RNG((this.seed ^ (gx * 31337 + gy * 7331)) >>> 0);
        this.loose.push({ id: lid++, x: cx + rng.int(-50, 50), y: cy + rng.int(-50, 50), sector: sec });
      }
    }
  }

  /** Gera os ids de material de um chunk inteiro. */
  generateChunk(cxk: number, cyk: number, out: Uint8Array, stride: number) {
    const sx = cxk * CHUNK, sy = cyk * CHUNK;
    const S = this.seed;
    const n = Math.floor(WORLD_CELLS / SITE);
    for (let j = 0; j < CHUNK; j++) {
      const y = sy + j;
      for (let i = 0; i < CHUNK; i++) {
        const x = sx + i;
        const idx = y * stride + x;
        if (!this.insidePlanet(x, y)) { out[idx] = MAT.EDGE; continue; }
        const sec = this.layer;
        const sd = SECTORS[sec - 1];

        // Área de pouso: clareira garantida
        const dl = Math.hypot(x - this.landing.x, y - this.landing.y);
        if (dl < LANDING_R + valueNoise(x * 0.08, y * 0.08, S) * 10) { out[idx] = MAT.AIR; continue; }


        // Ruínas
        const gx = Math.floor(x / SITE), gy = Math.floor(y / SITE);
        const site = this.ruinGrid.get(gy * n + gx);
        if (site && x >= site.x0 && x < site.x0 + site.w && y >= site.y0 && y < site.y0 + site.h) {
          out[idx] = this.ruinCell(site, x - site.x0, y - site.y0);
          continue;
        }

        // Coração planetário: anel de núcleo
        if (sec === LAYER_COUNT) {
          const dc = Math.hypot(x - this.coreCenter.x, y - this.coreCenter.y);
          if (dc < 34) { out[idx] = MAT.AIR; continue; }
          if (dc < 44) { out[idx] = (hash2(x >> 1, y >> 1, S) < 0.6) ? MAT.NUCLEO : MAT.ANCIENT; continue; }
        }

        // Cavernas: câmaras grandes + túneis vermiformes
        const c = fbm(x * 0.011, y * 0.011, S + sec * 13, 4);
        const thr = 0.555 - (sd.openness - 0.36) * 0.6;
        const tun = ridged(x * 0.016, y * 0.016, S + 41, 2);
        const open = c > thr || tun > 0.915;

        if (open) {
          if (sd.liquid) {
            const l = fbm(x * 0.009, y * 0.009, S + 500 + sec, 3);
            if (l < 0.3 + sd.liquid.amount * 0.75 && c > thr + 0.02) { out[idx] = sd.liquid.mat; continue; }
          }
          out[idx] = MAT.AIR;
          continue;
        }

        // Raízes minerais
        if (sd.roots) {
          const rr = ridged(x * 0.03, y * 0.03, S + 61, 2);
          if (rr > 0.94) { out[idx] = MAT.ROOT; continue; }
        }

        // Veios de minério (blobs de Worley)
        const [f1, , id] = worley(x / 9, y / 9, S + 33 + sec);
        if (id < sd.oreDensity * 2.2 && f1 < 0.36 + 0.12 * valueNoise(x * 0.3, y * 0.3, S + 9)) {
          const pickH = hash2(Math.floor(id * 1e6), sec, S + 3);
          out[idx] = this.pickOre(sd, pickH);
          continue;
        }
        out[idx] = sd.rock;
      }
    }
  }

  private pickOre(sd: SectorDef, h: number): number {
    let total = 0;
    for (const o of sd.ores) total += o.weight;
    let r = h * total;
    for (const o of sd.ores) { r -= o.weight; if (r <= 0) return o.mat; }
    return sd.ores[0].mat;
  }

  private ruinCell(site: RuinSite, lx: number, ly: number): number {
    const { w, h } = site;
    const wall = 3;
    const edge = lx < wall || ly < wall || lx >= w - wall || ly >= h - wall;
    const midX = Math.abs(lx - w / 2) < 5, midY = Math.abs(ly - h / 2) < 5;
    if (edge) return (midX || midY) ? MAT.AIR : MAT.ANCIENT; // portas
    if (site.kind === 'cidade') {
      // quarteirões
      const bx = lx % 32, by = ly % 30;
      if ((bx < 3 || by < 3) && !(bx > 12 && bx < 20) && !(by > 12 && by < 18)) return MAT.ANCIENT;
      if (bx > 22 && bx < 28 && by > 20 && by < 26) return MAT.ANCIENT; // casas internas
      return MAT.AIR;
    }
    if (site.kind === 'templo') {
      const dx = lx - w / 2, dy = ly - h / 2;
      const r = Math.hypot(dx, dy);
      const ring = Math.min(w, h) * 0.32;
      if (Math.abs(r - ring) < 1.6 && !(Math.abs(dx) < 4 || Math.abs(dy) < 4)) return MAT.ANCIENT;
      // colunatas
      if ((lx % 12 < 3) && (ly % 12 < 3) && r > ring + 4) return MAT.ANCIENT;
      return MAT.AIR;
    }
    // casa: pilares
    if (lx % 10 < 2 && ly % 10 < 2) return MAT.ANCIENT;
    return MAT.AIR;
  }

  /** Mapa de setores por tile (para consultas rápidas e mapa). */
  buildSectorTiles(tiles: number): Uint8Array {
    const arr = new Uint8Array(tiles * tiles);
    for (let ty = 0; ty < tiles; ty++) for (let tx = 0; tx < tiles; tx++) {
      const x = tx * TILE_CELLS + 2, y = ty * TILE_CELLS + 2;
      arr[ty * tiles + tx] = this.insidePlanet(x, y) ? this.voronoi(x, y)[0] : 0;
    }
    return arr;
  }
}
