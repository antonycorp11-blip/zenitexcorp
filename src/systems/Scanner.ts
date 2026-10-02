import { CELL, TILE, WORLD_W, WORLD_H, WORLD_PX_W, nearestX, wrapX } from '../core/constants';
import { matById } from '../data/materials';
import { SCANNERS } from '../data/equipment';
import { fmtInt } from '../core/math';
import { ITEM } from '../data/items';
import { rawOf, compOf, gradeAt, gradeLabel, gradeColor, pctRange } from '../data/composition';
import type { Game } from '../Game';

export interface ScanMark { x: number; y: number; mat: number; n: number; t: number; level: number; persistent?: boolean; }
export interface MapMarker { x: number; y: number; label: string; color: string; kind: string; t?: number; }

/** Scanner: revela depósitos, sem nunca revelar tudo. */
export class Scanner {
  marks: ScanMark[] = [];
  rings: { x: number; y: number; r: number; max: number }[] = [];
  mapMarkers: MapMarker[] = [];
  constructor(private g: Game) {}

  pulse() {
    const g = this.g, p = g.player;
    if (p.energy < 8) { g.toast('Energia insuficiente para varredura', '#ff6a3a'); return; }
    p.energy -= 8;
    const lv = p.scannerLevel;
    const R = SCANNERS[lv].radius;
    this.pulseAt(p.x, p.y, R, true);
    g.audio.scan();
    g.sectors.counter(g.sectors.current, 'scans', 1);
    this.geology(p.x, p.y, R * TILE, lv);
    const found = g.chests.reveal(p.x, p.y, R * 16);
    if (found) g.toast(`Scanner: ${found} baú(s) de Khelos por perto (marcados no mapa)`, '#ffd04a');
    if (lv >= 3) this.orbitalSweep();
  }

  /** Retorna o número de aglomerados encontrados */
  pulseAt(px: number, py: number, Rtiles: number, player: boolean): number {
    const g = this.g, w = g.world;
    const lv = player ? g.player.scannerLevel : 2;
    const R = Rtiles * TILE;
    this.rings.push({ x: px, y: py, r: 0, max: R });
    const clusters = new Map<string, ScanMark>();
    const step = 5;
    const cx0 = Math.floor(px / CELL), cy0 = Math.floor(py / CELL);
    const Rc = Math.floor(R / CELL);
    for (let j = -Rc; j <= Rc; j += step) for (let i = -Rc; i <= Rc; i += step) {
      if (i * i + j * j > Rc * Rc) continue;
      // incerteza: amostragem parcial, nível baixo perde mais
      if (Math.random() > 0.55 + lv * 0.12) continue;
      const m = w.get(cx0 + i, cy0 + j);
      const d = matById(m);
      if (d.kind !== 'ore') continue;
      if (lv < 2 && d.rare) continue;
      const key = `${m}_${(cx0 + i) >> 5}_${(cy0 + j) >> 5}`;
      const c = clusters.get(key);
      if (c) { c.n++; c.x = (c.x * (c.n - 1) + (cx0 + i) * CELL) / c.n; c.y = (c.y * (c.n - 1) + (cy0 + j) * CELL) / c.n; }
      else clusters.set(key, { x: (cx0 + i) * CELL, y: (cy0 + j) * CELL, mat: m, n: 1, t: g.time, level: lv });
    }
    for (const c of clusters.values()) this.marks.push(c);
    if (this.marks.length > 300) this.marks.splice(0, this.marks.length - 300);
    if (lv >= 2) {
      for (const a of g.lore.artifacts) if (!a.done && !a.destroyed && Math.hypot(nearestX(a.x, px) - px, a.y - py) < R) { a.seen = true; this.addMarker(a.x, a.y, 'Assinatura ancestral', '#4af0e0', 'artifact'); }
    }
    return clusters.size;
  }

  /**
   * ANÁLISE GEOLÓGICA: nível 0 = material predominante; 1 = concentração; 2+ = composição aproximada.
   * Também aponta a região de teor mais alto dentro do alcance (para onde levar as perfuradoras).
   */
  geology(px: number, py: number, R: number, lv: number) {
    const g = this.g, L = g.planet.layer, seed = g.world.gen.seed;
    const here = gradeAt(seed, L, wrapX(Math.floor(px / CELL), WORLD_W), Math.floor(py / CELL));
    let best = here, bx = px, by = py;
    for (const rr of [0.5, 1]) for (let a = 0; a < 12; a++) {
      const x = px + Math.cos(a / 12 * Math.PI * 2) * R * rr, y = py + Math.sin(a / 12 * Math.PI * 2) * R * rr;
      const gr = gradeAt(seed, L, wrapX(Math.floor(x / CELL), WORLD_W), Math.floor(y / CELL));
      if (gr > best + 0.05) { best = gr; bx = x; by = y; }
    }
    const raw = ITEM[rawOf(L)]?.name ?? 'Material';
    const comp = compOf(L);
    let html = `<div class="gh">ANÁLISE GEOLÓGICA</div><div class="gm">${raw}</div>`;
    if (lv >= 1) html += `<div class="gr"><span>Concentração mineral</span><b style="color:${gradeColor(here)}">${gradeLabel(here, true)}</b></div>`;
    if (lv >= 2) {
      for (const m of comp.minerals) html += `<div class="gr"><span>${ITEM[m.k]?.name}</span><b>${pctRange(m.frac, here)}</b></div>`;
      html += `<div class="gr"><span>Desconhecido</span><b>&lt;1%</b></div>`;
      html += `<div class="gr"><span>Pureza</span><b style="color:${gradeColor(here)}">${gradeLabel(here, true)}</b></div>`;
    }
    if (lv < 1) html += `<div class="gt">Composição desconhecida. Melhore o scanner para medir a concentração.</div>`;
    if (best > here * 1.15) {
      const ang = Math.atan2(by - py, bx - px);
      const arrow = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'][((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8];
      const dist = Math.round(Math.hypot(bx - px, by - py) / TILE);
      html += `<div class="gt">${arrow} Teor ${lv >= 1 ? gradeLabel(best) : 'maior'} a ~${dist} m${lv >= 1 ? ' (marcado no mapa)' : ''}</div>`;
      if (lv >= 1) this.addMarker(bx, by, `Teor ${gradeLabel(best)}`, gradeColor(best), 'deposit');
      if (best >= 1.9) g.say('rich_vein', 120);
    } else html += `<div class="gt">Você está na melhor região ao alcance.</div>`;
    g.ui.geoCard(html);
  }

  orbitalSweep() {
    const g = this.g;
    const sec = g.sectors.current;
    let added = 0;
    for (let k = 0; k < 400 && added < 6; k++) {
      const x = Math.floor(Math.random() * WORLD_W), y = Math.floor(Math.random() * WORLD_H);
      if (g.world.sectorAtPx(x * CELL, y * CELL) !== sec) continue;
      const d = matById(g.world.get(x, y));
      if (d.kind === 'ore' && (d.rare || Math.random() < 0.15)) { this.addMarker(x * CELL, y * CELL, `Região promissora: ${d.name}`, '#ffd04a', 'deposit'); added++; }
    }
    if (added) g.toast(`Scanner orbital: ${added} regiões promissoras marcadas no mapa.`, '#ffd04a');
  }

  addMarker(x: number, y: number, label: string, color: string, kind: string) {
    x = wrapX(x, WORLD_PX_W);
    if (this.mapMarkers.some(m => Math.hypot(nearestX(m.x, x) - x, m.y - y) < 40 && m.kind === kind)) return;
    this.mapMarkers.push({ x, y, label, color, kind, t: this.g.time });
    if (this.mapMarkers.length > 120) this.mapMarkers.shift();
  }

  update(dt: number) {
    for (const r of this.rings) r.r += dt * 260;
    this.rings = this.rings.filter(r => r.r < r.max);
    this.marks = this.marks.filter(m => this.g.time - m.t < 25);
  }

  label(m: ScanMark): string {
    const d = matById(m.mat);
    if (d.rare) return m.level >= 2 ? `${d.name} · raro (extração manual)` : 'Assinatura rara';
    if (m.level <= 0) return 'Veio';
    if (m.level === 1) return `Veio · teor ${m.n > 6 ? 'MUITO ALTO' : 'ALTO'}`;
    return `Veio de ${d.name} · teor ${m.n > 6 ? 'MUITO ALTO' : 'ALTO'} · ~${fmtInt(m.n * 9 * 2)} kg`;
  }
}
