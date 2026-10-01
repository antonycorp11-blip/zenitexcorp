import { CELL, WORLD_CELLS } from '../core/constants';
import { RNG } from '../core/rng';
import { IS_SOLID, IS_BLOCKING, matById } from '../data/materials';
import { SECTORS } from '../data/sectors';
import { ITEM } from '../data/items';
import { fmtInt } from '../core/math';
import type { Game } from '../Game';

export interface Chest { id: number; x: number; y: number; cx: number; cy: number; opened: boolean; }

/**
 * Baús de Khelos: cápsulas antigas espalhadas pela camada. Recompensas claras que valem o desvio:
 * créditos, minério, consumíveis ou um prêmio grande. Alguns estão enterrados na rocha.
 */
export class Chests {
  list: Chest[] = [];

  constructor(private g: Game) {
    const w = g.world, gen = w.gen;
    const rng = new RNG((gen.seed ^ 0x5eed) >>> 0);
    const c = WORLD_CELLS / 2, R = gen.R * 0.93;
    const n = 26 + gen.layer * 4;
    for (let i = 0, tries = 0; this.list.length < n && tries < n * 60; tries++) {
      const a = rng.next() * Math.PI * 2, r = Math.sqrt(rng.next()) * R;
      const cx = Math.round(c + Math.cos(a) * r), cy = Math.round(c + Math.sin(a) * r);
      if (Math.hypot(cx - gen.landing.x, cy - gen.landing.y) < 70) continue;
      if (!gen.insidePlanet(cx, cy)) continue;
      // dois terços em cavernas abertas, o resto enterrado
      const buried = rng.next() < 0.33;
      if (!buried && tries % 3 !== 0) {
        w.ensureChunk(cx >> 6, cy >> 6);
        if (IS_BLOCKING[w.get(cx, cy)] || IS_SOLID[w.get(cx, cy + 1)]) continue;
      }
      this.list.push({ id: i++, x: cx * CELL + 2, y: cy * CELL + 2, cx, cy, opened: false });
    }
  }

  visible(ch: Chest) { return !ch.opened && !IS_SOLID[this.g.world.get(ch.cx, ch.cy)]; }

  open(ch: Chest) {
    const g = this.g, L = g.planet.layer, sd = SECTORS[L - 1];
    ch.opened = true;
    g.stats.chests = (g.stats.chests ?? 0) + 1;
    const r = Math.random();
    const mul = Math.pow(2.2, L - 1);
    let title = '', lines: string[] = [];
    if (r < 0.42) {
      const cr = Math.round(150 * mul * (1 + Math.random()));
      g.stock.credits += cr; title = 'Créditos'; lines = [`+${fmtInt(cr)} ◆`];
    } else if (r < 0.8) {
      const ores = sd.ores.filter(o => !matById(o.mat).rare).slice(0, 2);
      title = 'Minério';
      for (const o of ores) {
        const k = matById(o.mat).item!, q = Math.round((60 + Math.random() * 140) * L);
        const got = g.pack.add(k, q); if (got < q) g.stock.add(k, q - got, false);
        lines.push(`+${fmtInt(q)} kg ${ITEM[k].name}`);
      }
    } else if (r < 0.94) {
      title = 'Suprimentos';
      for (const [k, q] of [['explosivo', 3], ['kit_reparo', 2], ['medkit', 2], ['sinalizador', 4]] as [string, number][]) {
        const got = g.pack.add(k, q); if (got < q) g.stock.add(k, q - got, false);
        lines.push(`+${q} ${ITEM[k].name}`);
      }
    } else {
      const cr = Math.round(800 * mul);
      g.stock.credits += cr;
      const bar = L <= 2 ? 'placa_ferronox' : L <= 4 ? 'celula_lumenita' : 'chip_nexolita';
      const q = 20 * L; g.stock.add(bar, q, false);
      title = 'TESOURO'; lines = [`+${fmtInt(cr)} ◆`, `+${q} ${ITEM[bar].name}`];
    }
    g.ui.flashName(`BAÚ DE KHELOS · ${title}`, [255, 215, 110]);
    g.toast(`Baú aberto: ${lines.join(' · ')}`, '#ffd04a');
    g.fx.text(ch.x, ch.y - 12, lines[0], [255, 220, 120]);
    g.fx.sparks(ch.x, ch.y - 4, [255, 220, 120], 20);
    g.audio.discover(title === 'TESOURO');
    g.scanner.mapMarkers = g.scanner.mapMarkers.filter(m => !(m.kind === 'chest' && Math.hypot(m.x - ch.x, m.y - ch.y) < 8));
  }

  /** Scanner: marca baús no alcance. */
  reveal(px: number, py: number, R: number) {
    let n = 0;
    for (const ch of this.list) if (!ch.opened && Math.hypot(ch.x - px, ch.y - py) < R) { this.g.scanner.addMarker(ch.x, ch.y, 'Baú de Khelos', '#ffd04a', 'chest'); n++; }
    return n;
  }

  serialize() { return this.list.filter(c => c.opened).map(c => c.id); }
  load(ids: number[] | undefined) { for (const id of ids ?? []) { const c = this.list[id]; if (c) c.opened = true; } }
}
