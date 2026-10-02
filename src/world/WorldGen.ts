import { WORLD_W, WORLD_H, TILE_CELLS, SURFACE_Y } from '../core/constants';
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
export const PLATEAU = 70;

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
      const hill = (fbm(x * 0.008, 3.3, seed + 5, 3) - 0.5) * 70 + (fbm(x * 0.03, 7.7, seed + 6, 2) - 0.5) * 12;
      const k = Math.min(1, Math.max(0, (d - PLATEAU) / 50));   // platô plano no centro, morros nas pontas
      this.surface[x] = Math.round(SURFACE_Y + hill * k * k * (3 - 2 * k));
    }
    this.landing = { x: c, y: SURFACE_Y - 1 };
    this.coreCenter = { x: c, y: WORLD_H - 90 };
    this.buildSites();
  }

  voronoi(_x: number, _y: number): [number, number, number] { return [this.layer, this.layer, 1e9]; }
  insidePlanet(x: number, y: number): boolean { return x >= 3 && x < WORLD_W - 3 && y >= 0 && y < WORLD_H - 4; }
  surfaceAt(x: number) { return this.surface[Math.max(0, Math.min(WORLD_W - 1, x | 0))]; }

  private buildSites() {
    const rng = new RNG((this.seed ^ 0x7a11) >>> 0);
    const nRuins = Math.round(2 + this.sd.ruins * 6);
    let rid = 0, lid = 0;
    for (let tries = 0; this.ruins.length < nRuins && tries < 200; tries++) {
      const big = this.sd.ruins > 0.5 && rng.chance(0.4);
      const kind: RuinSite['kind'] = big ? (rng.chance(0.5) ? 'cidade' : 'templo') : rng.chance(0.3) ? 'templo' : 'casa';
      const w = kind === 'cidade' ? rng.int(90, 120) : kind === 'templo' ? rng.int(50, 70) : rng.int(26, 40);
      const h = kind === 'cidade' ? rng.int(40, 56) : kind === 'templo' ? rng.int(34, 46) : rng.int(18, 26);
      const x0 = rng.int(8, WORLD_W - w - 8);
      const y0 = rng.int(SURFACE_Y + 70, WORLD_H - h - 20);
      if (Math.abs(x0 + w / 2 - WORLD_W / 2) < PLATEAU && y0 < SURFACE_Y + 120) continue;
      if (this.ruins.some(r => x0 < r.x0 + r.w + 10 && r.x0 < x0 + w + 10 && y0 < r.y0 + r.h + 10 && r.y0 < y0 + h + 10)) continue;
      const arts: { x: number; y: number }[] = [];
      const na = kind === 'cidade' ? 3 : kind === 'templo' ? 2 : 1;
      for (let i = 0; i < na; i++) arts.push({ x: x0 + Math.floor(w * (0.25 + 0.5 * rng.next())), y: y0 + h - 5 });
      this.ruins.push({ id: rid++, sector: this.layer, x0, y0, w, h, kind, artifacts: arts });
    }
    for (let i = 0; i < 10; i++) this.loose.push({ id: lid++, x: rng.int(20, WORLD_W - 20), y: rng.int(SURFACE_Y + 40, WORLD_H - 30), sector: this.layer });
  }

  /** Gera todo o mapa de uma vez (vista lateral é pequena o bastante). */
  generate(out: Uint8Array) {
    const S = this.seed, sd = this.sd, sec = this.layer;
    for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < WORLD_W; x++) {
      out[y * WORLD_W + x] = this.cell(x, y, S, sd, sec);
    }
    for (const r of this.ruins) for (let y = r.y0; y < r.y0 + r.h; y++) for (let x = r.x0; x < r.x0 + r.w; x++) out[y * WORLD_W + x] = this.ruinCell(r, x - r.x0, y - r.y0);
  }

  private cell(x: number, y: number, S: number, sd: SectorDef, sec: number): number {
    // bordas: rocha inviolável
    const bottom = WORLD_H - 4 - Math.floor(valueNoise(x * 0.1, 0, S) * 4);
    if (x < 3 || x >= WORLD_W - 3 || y >= bottom) return MAT.EDGE;
    const sy = this.surface[x];
    if (y < sy) return MAT.AIR;
    const depth = y - sy;
    // Coração planetário (Núcleo): câmara com anel de núcleo
    if (sec === LAYER_COUNT) {
      const dc = Math.hypot(x - this.coreCenter.x, (y - this.coreCenter.y) * 1.4);
      if (dc < 30) return MAT.AIR;
      if (dc < 38) return hash2(x >> 1, y >> 1, S) < 0.6 ? MAT.NUCLEO : MAT.ANCIENT;
    }
    // sob a base o chão é firme por um bom trecho
    const underBase = Math.abs(x - WORLD_W / 2) < PLATEAU - 6 && depth < 40;
    if (!underBase && depth > 14) {
      // cavernas: câmaras alongadas na horizontal + túneis
      const c = fbm(x * 0.012, y * 0.02, S + sec * 13, 4);
      const thr = 0.6 - (sd.openness - 0.36) * 0.6 - Math.min(0.04, depth * 0.0004);
      const tun = ridged(x * 0.014, y * 0.022, S + 41, 2);
      if (c > thr || tun > 0.93) {
        if (sd.liquid && sd.liquid.mat !== MAT.CHASM) {
          const l = fbm(x * 0.02, y * 0.02, S + 500 + sec, 3);
          if (l < 0.28 + sd.liquid.amount * 0.9 && c > thr + 0.03) return sd.liquid.mat;
        }
        return MAT.AIR;
      }
    }
    // capa de solo solto/raízes perto da superfície da Terra
    if (sd.roots && depth < 60 && ridged(x * 0.03, y * 0.05, S + 61, 2) > 0.95) return MAT.ROOT;
    // veios (manchas ricas)
    const [f1, , id] = worley(x / 9, y / 7, S + 33 + sec);
    if (depth > 4 && id < sd.oreDensity * 2.2 && f1 < 0.36 + 0.12 * valueNoise(x * 0.3, y * 0.3, S + 9)) {
      return this.pickOre(sd, hash2(Math.floor(id * 1e6), sec, S + 3));
    }
    // camada de cima um pouco diferente (estratos)
    if (sec === 1 && depth > 120 + valueNoise(x * 0.02, 1, S) * 30) return MAT.R2;
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
    const wall = 3;
    if (ly >= h - wall) return MAT.ANCIENT;                          // piso
    if (ly < wall) return (Math.abs(lx - w / 2) < 6) ? MAT.AIR : MAT.ANCIENT; // teto com abertura
    if (lx < wall || lx >= w - wall) return (ly > h - 14) ? MAT.AIR : MAT.ANCIENT; // paredes com portas embaixo
    if (site.kind === 'cidade') {
      if (ly % 18 < 2 && !(lx % 30 > 10 && lx % 30 < 18)) return MAT.ANCIENT; // andares
      if (lx % 30 < 2) return MAT.ANCIENT;
      return MAT.AIR;
    }
    if (site.kind === 'templo') {
      if (lx % 12 < 3 && ly > 6) return MAT.ANCIENT; // colunatas
      return MAT.AIR;
    }
    return MAT.AIR;
  }

  buildSectorTiles(tw: number, th: number): Uint8Array { void TILE_CELLS; return new Uint8Array(tw * th).fill(this.layer); }
}
