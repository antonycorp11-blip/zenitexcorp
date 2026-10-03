import { WORLD_W, WORLD_H, LEGACY_WORLD_W, TILE_CELLS, SURFACE_Y, wrapX } from '../core/constants';
import { fbm, ridged, valueNoise, worley } from '../core/noise';
import { hash2, RNG } from '../core/rng';
import { MAT } from '../data/materials';
import { SECTORS, LAYER_COUNT, type SectorDef } from '../data/sectors';

export interface RuinSite {
  id: number;
  sector: number;
  x0: number; y0: number; w: number; h: number; // retângulo em células
  kind: 'casa' | 'templo' | 'cidade';
  artifacts: { x: number; y: number }[];        // em células
}
export interface LooseArtifact { id: number; x: number; y: number; sector: number; }

/** Meia-largura (células) do platô plano da base. */
export const PLATEAU = 140;

/**
 * Geração determinística em VISTA LATERAL: um corte vertical da camada.
 * Em cima, céu (na superfície) ou o vazio já escavado (camadas de baixo). O chão tem um platô plano
 * no centro para a base; abaixo, rocha da camada com cavernas, veios ricos, bolsões de líquido e ruínas.
 */
export class WorldGen {
  readonly seed: number;
  readonly ruins: RuinSite[] = [];
  readonly loose: LooseArtifact[] = [];
  readonly landing: { x: number; y: number };   // células (centro do platô, logo acima do chão)
  readonly coreCenter: { x: number; y: number };
  readonly layer: number;
  readonly R = WORLD_W / 2;
  /** altura do chão por coluna (células) */
  readonly surface = new Int16Array(WORLD_W);
  private sd: SectorDef;

  constructor(seed: number, layer = 1) {
    this.seed = seed;
    this.layer = layer;
    this.sd = SECTORS[layer - 1];
    const c = WORLD_W / 2;
    for (let x = 0; x < WORLD_W; x++) {
      const d = Math.abs(x - c);
      // Mistura a mesma faixa de ruído nas duas bordas para fechar a circunferência.
      const t = x / WORLD_W;
      const h1 = fbm(x * 0.004, 3.3, seed + 5, 3) * (1 - t) + fbm((x - WORLD_W) * 0.004, 3.3, seed + 5, 3) * t;
      const h2 = fbm(x * 0.015, 7.7, seed + 6, 2) * (1 - t) + fbm((x - WORLD_W) * 0.015, 7.7, seed + 6, 2) * t;
      const hill = (h1 - 0.5) * 140 + (h2 - 0.5) * 24;
      const k = Math.min(1, Math.max(0, (d - PLATEAU) / 100));   // platô plano no centro, morros nas pontas
      this.surface[x] = Math.round(SURFACE_Y + hill * k * k * (3 - 2 * k));
    }
    this.landing = { x: c, y: SURFACE_Y - 1 };
    this.coreCenter = { x: c, y: WORLD_H - 180 };
    this.buildSites();
  }

  voronoi(_x: number, _y: number): [number, number, number] { return [this.layer, this.layer, 1e9]; }
  insidePlanet(_x: number, y: number): boolean { return y >= 0 && y < WORLD_H - 4; }
  surfaceAt(x: number) { return this.surface[wrapX(x | 0, WORLD_W)]; }

  private buildSites() {
    const rng = new RNG((this.seed ^ 0x7a11) >>> 0);
    const nRuins = Math.round(2 + this.sd.ruins * 6) * 3;
    let rid = 0, lid = 0;
    for (let tries = 0; this.ruins.length < nRuins && tries < 600; tries++) {
      const big = this.sd.ruins > 0.5 && rng.chance(0.4);
      const kind: RuinSite['kind'] = big ? (rng.chance(0.5) ? 'cidade' : 'templo') : rng.chance(0.3) ? 'templo' : 'casa';
      const w = kind === 'cidade' ? rng.int(180, 240) : kind === 'templo' ? rng.int(100, 140) : rng.int(52, 80);
      const h = kind === 'cidade' ? rng.int(80, 112) : kind === 'templo' ? rng.int(68, 92) : rng.int(36, 52);
      const x0 = rng.int(16, WORLD_W - w - 16);
      const y0 = rng.int(SURFACE_Y + 140, WORLD_H - h - 40);
      if (Math.abs(x0 + w / 2 - WORLD_W / 2) < PLATEAU && y0 < SURFACE_Y + 240) continue;
      if (this.ruins.some(r => x0 < r.x0 + r.w + 20 && r.x0 < x0 + w + 20 && y0 < r.y0 + r.h + 20 && r.y0 < y0 + h + 20)) continue;
      const arts: { x: number; y: number }[] = [];
      const na = kind === 'cidade' ? 3 : kind === 'templo' ? 2 : 1;
      for (let i = 0; i < na; i++) arts.push({ x: x0 + Math.floor(w * (0.25 + 0.5 * rng.next())), y: y0 + h - 10 });
      this.ruins.push({ id: rid++, sector: this.layer, x0, y0, w, h, kind, artifacts: arts });
    }
    for (let i = 0; i < 30; i++) this.loose.push({ id: lid++, x: rng.int(40, WORLD_W - 40), y: rng.int(SURFACE_Y + 80, WORLD_H - 60), sector: this.layer });
  }

  /** Coordenadas das ruínas e registros da versão anterior, deslocadas para o centro do anel. */
  legacySites(): { ruins: RuinSite[]; loose: LooseArtifact[] } {
    const rng = new RNG((this.seed ^ 0x7a11) >>> 0);
    const ruins: RuinSite[] = [], loose: LooseArtifact[] = [];
    const offset = (WORLD_W - LEGACY_WORLD_W) / 2;
    const nRuins = Math.round(2 + this.sd.ruins * 6);
    for (let tries = 0; ruins.length < nRuins && tries < 200; tries++) {
      const big = this.sd.ruins > 0.5 && rng.chance(0.4);
      const kind: RuinSite['kind'] = big ? (rng.chance(0.5) ? 'cidade' : 'templo') : rng.chance(0.3) ? 'templo' : 'casa';
      const w = kind === 'cidade' ? rng.int(180, 240) : kind === 'templo' ? rng.int(100, 140) : rng.int(52, 80);
      const h = kind === 'cidade' ? rng.int(80, 112) : kind === 'templo' ? rng.int(68, 92) : rng.int(36, 52);
      const x0 = rng.int(16, LEGACY_WORLD_W - w - 16);
      const y0 = rng.int(SURFACE_Y + 140, WORLD_H - h - 40);
      if (Math.abs(x0 + w / 2 - LEGACY_WORLD_W / 2) < PLATEAU && y0 < SURFACE_Y + 240) continue;
      if (ruins.some(r => x0 + offset < r.x0 + r.w + 20 && r.x0 < x0 + offset + w + 20 && y0 < r.y0 + r.h + 20 && r.y0 < y0 + h + 20)) continue;
      const artifacts: { x: number; y: number }[] = [];
      const na = kind === 'cidade' ? 3 : kind === 'templo' ? 2 : 1;
      for (let i = 0; i < na; i++) artifacts.push({ x: x0 + offset + Math.floor(w * (0.25 + 0.5 * rng.next())), y: y0 + h - 10 });
      ruins.push({ id: ruins.length, sector: this.layer, x0: x0 + offset, y0, w, h, kind, artifacts });
    }
    for (let i = 0; i < 10; i++) loose.push({ id: i, x: offset + rng.int(40, LEGACY_WORLD_W - 40), y: rng.int(SURFACE_Y + 80, WORLD_H - 60), sector: this.layer });
    return { ruins, loose };
  }

  /** Gera todo o mapa de uma vez (vista lateral é pequena o bastante). */
  generate(out: Uint8Array) {
    const S = this.seed, sd = this.sd, sec = this.layer;
    for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < WORLD_W; x++) {
      out[y * WORLD_W + x] = this.cell(x, y, S, sd, sec);
    }
    for (const r of this.ruins) for (let y = r.y0; y < r.y0 + r.h; y++) for (let x = r.x0; x < r.x0 + r.w; x++) out[y * WORLD_W + x] = this.ruinCell(r, x - r.x0, y - r.y0);
    // líquidos já assentados: em cada coluna, descem até o fundo da cavidade
    for (let x = 0; x < WORLD_W; x++) {
      let floor = -1;   // primeira célula livre acima de algo sólido, de baixo para cima
      for (let y = WORLD_H - 1; y >= 0; y--) {
        const i = y * WORLD_W + x, m = out[i];
        if (m === MAT.AIR) { if (floor < 0) floor = y; continue; }
        if (m === MAT.LAVA || m === MAT.WATER || m === MAT.ACID) {
          if (floor > y) { out[floor * WORLD_W + x] = m; out[i] = MAT.AIR; floor--; } else floor = -1;
          continue;
        }
        floor = -1;
      }
    }
  }

  private cell(x: number, y: number, S: number, sd: SectorDef, sec: number): number {
    const seam = (f: (u: number) => number) => x < WORLD_W - 128 ? f(x) : f(x) * ((WORLD_W - x) / 128) + f(x - WORLD_W) * ((x - (WORLD_W - 128)) / 128);
    // Só o fundo tem rocha inviolável; horizontalmente a camada fecha um anel.
    const bottom = WORLD_H - 6 - Math.floor(seam(u => valueNoise(u * 0.05, 0, S)) * 8);
    if (y >= bottom) return MAT.EDGE;
    const sy = this.surface[x];
    if (y < sy) return MAT.AIR;
    const depth = y - sy;
    // Coração planetário (Núcleo): câmara com anel de núcleo
    if (sec === LAYER_COUNT) {
      const dc = Math.hypot(x - this.coreCenter.x, (y - this.coreCenter.y) * 1.4);
      if (dc < 60) return MAT.AIR;
      if (dc < 76) return hash2(x >> 2, y >> 2, S) < 0.6 ? MAT.NUCLEO : MAT.ANCIENT;
    }
    // sob a base o chão é firme por um bom trecho
    const underBase = Math.abs(x - WORLD_W / 2) < PLATEAU - 12 && depth < 80;
    if (!underBase && depth > 52) {
      // cavernas: câmaras alongadas na horizontal + túneis
      const c = seam(u => fbm(u * 0.006, y * 0.01, S + sec * 13, 4));
      const thr = 0.68 - (sd.openness - 0.36) * 0.4 - Math.min(0.025, depth * 0.0001);
      const tun = seam(u => ridged(u * 0.007, y * 0.011, S + 41, 2));
      if (c > thr || tun > 0.97) {
        if (sd.liquid && sd.liquid.mat !== MAT.CHASM) {
          const l = seam(u => fbm(u * 0.01, y * 0.01, S + 500 + sec, 3));
          if (l < 0.24 + sd.liquid.amount * 0.7 && c > thr + 0.03) return sd.liquid.mat;
        }
        return MAT.AIR;
      }
    }
    // capa de solo solto/raízes perto da superfície da Terra
    if (sd.roots && depth < 120 && seam(u => ridged(u * 0.015, y * 0.025, S + 61, 2)) > 0.95) return MAT.ROOT;
    // veios (manchas ricas)
    const [f1, , id] = worley(x / 18, y / 14, S + 33 + sec);
    if (depth > 8 && id < sd.oreDensity * 2.2 && f1 < 0.36 + 0.12 * valueNoise(x * 0.15, y * 0.15, S + 9)) {
      return this.pickOre(sd, hash2(Math.floor(id * 1e6), sec, S + 3));
    }
    // camada de cima um pouco diferente (estratos)
    if (sec === 1 && depth > 240 + valueNoise(x * 0.01, 1, S) * 60) return MAT.R2;
    return sd.rock;
  }

  private pickOre(sd: SectorDef, h: number): number {
    let total = 0;
    for (const o of sd.ores) total += o.weight;
    let r = h * total;
    for (const o of sd.ores) { r -= o.weight; if (r <= 0) return o.mat; }
    return sd.ores[0].mat;
  }

  /** Ruínas vistas de lado: salões com paredes, pisos e colunas de pedra ancestral. */
  private ruinCell(site: RuinSite, lx: number, ly: number): number {
    const { w, h } = site;
    const wall = 6;
    if (ly >= h - wall) return MAT.ANCIENT;                          // piso
    if (ly < wall) return (Math.abs(lx - w / 2) < 12) ? MAT.AIR : MAT.ANCIENT; // teto com abertura
    if (lx < wall || lx >= w - wall) return (ly > h - 28) ? MAT.AIR : MAT.ANCIENT; // paredes com portas embaixo
    if (site.kind === 'cidade') {
      if (ly % 36 < 4 && !(lx % 60 > 20 && lx % 60 < 36)) return MAT.ANCIENT; // andares
      if (lx % 60 < 4) return MAT.ANCIENT;
      return MAT.AIR;
    }
    if (site.kind === 'templo') {
      if (lx % 24 < 6 && ly > 12) return MAT.ANCIENT; // colunatas
      return MAT.AIR;
    }
    return MAT.AIR;
  }

  buildSectorTiles(tw: number, th: number): Uint8Array { void TILE_CELLS; return new Uint8Array(tw * th).fill(this.layer); }
}
