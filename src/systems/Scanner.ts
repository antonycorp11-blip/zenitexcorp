import { CELL, TILE } from '../core/constants';
import { matById } from '../data/materials';
import { SCANNERS } from '../data/equipment';
import { fmtInt } from '../core/math';
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
    const n = this.pulseAt(p.x, p.y, R, true);
    g.audio.scan();
    if (n > 0) g.sectors.counter(g.sectors.current, 'scans', 1);
    else g.toast('Nenhum depósito significativo no alcance.', '#9ab');
    if (lv >= 3) this.orbitalSweep();
  }

  /** Retorna o número de aglomerados encontrados */
  pulseAt(px: number, py: number, Rtiles: number, player: boolean): number {
    const g = this.g, w = g.world;
    const lv = player ? g.player.scannerLevel : 2;
    const R = Rtiles * TILE;
    this.rings.push({ x: px, y: py, r: 0, max: R });
    const clusters = new Map<string, ScanMark>();
    const step = 3;
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
      const key = `${m}_${(cx0 + i) >> 4}_${(cy0 + j) >> 4}`;
      const c = clusters.get(key);
      if (c) { c.n++; c.x = (c.x * (c.n - 1) + (cx0 + i) * CELL) / c.n; c.y = (c.y * (c.n - 1) + (cy0 + j) * CELL) / c.n; }
      else clusters.set(key, { x: (cx0 + i) * CELL, y: (cy0 + j) * CELL, mat: m, n: 1, t: g.time, level: lv });
    }
    for (const c of clusters.values()) this.marks.push(c);
    if (this.marks.length > 300) this.marks.splice(0, this.marks.length - 300);
    if (lv >= 2) {
      for (const a of g.lore.artifacts) if (!a.done && !a.destroyed && Math.hypot(a.x - px, a.y - py) < R) { a.seen = true; this.addMarker(a.x, a.y, 'Assinatura ancestral', '#4af0e0', 'artifact'); }
    }
    return clusters.size;
  }

  orbitalSweep() {
    const g = this.g;
    const sec = g.sectors.current;
    let added = 0;
    for (let k = 0; k < 400 && added < 6; k++) {
      const x = Math.floor(Math.random() * 2560), y = Math.floor(Math.random() * 2560);
      if (g.world.sectorAtPx(x * CELL, y * CELL) !== sec) continue;
      const d = matById(g.world.get(x, y));
      if (d.kind === 'ore' && (d.rare || Math.random() < 0.15)) { this.addMarker(x * CELL, y * CELL, `Região promissora: ${d.name}`, '#ffd04a', 'deposit'); added++; }
    }
    if (added) g.toast(`Scanner orbital: ${added} regiões promissoras marcadas no mapa.`, '#ffd04a');
  }

  addMarker(x: number, y: number, label: string, color: string, kind: string) {
    if (this.mapMarkers.some(m => Math.hypot(m.x - x, m.y - y) < 40 && m.kind === kind)) return;
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
    const est = fmtInt(m.n * 9 * (d.yieldKg ?? 1));
    if (m.level <= 0) return 'Minério';
    if (m.level === 1) return `Densidade ${m.n > 6 ? 'alta' : m.n > 2 ? 'média' : 'baixa'} · ~${est} kg`;
    return `${d.name} · ~${est} kg`;
  }
}
