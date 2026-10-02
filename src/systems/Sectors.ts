import { LAYER_COUNT, SECTORS } from '../data/sectors';
import { METAS, type MetaDef } from '../data/metas';
import { DRILLS } from '../data/equipment';
import { fmtInt } from '../core/math';
import { type Bag } from './Inventory';
import type { SectorRT } from './Machines';
import type { Game } from '../Game';

export interface Objective { text: string; cur: number; max: number; done: boolean; }

export interface SectorSave {
  discovered: boolean;
  phase: number;                    // índice da meta atual (0..3); 3 = todas cumpridas
  counters: Record<string, number>;
  base: Record<string, number>;
  shipBase: Bag;
  auditPassed: boolean;
  visitedT: number;
}

/** Estado de cada camada (buffers da base, contadores) e as metas curtas da camada. */
export class SectorSystem {
  rt: SectorRT[] = [];
  s: SectorSave[] = [];
  current = 1;
  private lastSector = 0;

  constructor(private g: Game) {
    for (let i = 0; i <= LAYER_COUNT; i++) {
      this.rt.push({ gen: 0, use: 0, ratio: 1, demand: 0, heat: 0, cooling: 20, stress: 0, buffer: {}, bufG: {}, bufCap: 0, linkCap: 0, linkFlow: 0, linkedTotal: 0, drillOut: 0, deepRate: 0, fields: {} });
      this.s.push({ discovered: i === 1, phase: 0, counters: {}, base: {}, shipBase: {}, auditPassed: false, visitedT: 0 });
    }
  }

  /** "Camada N alcançada": usada por pesquisas e máquinas que exigem profundidade. */
  certified(s: number) { return this.g.planet.layer >= s; }
  automated(s: number) { return this.g.planet.layer > s || this.g.planet.layerDone(); }
  certifiedCount() { return this.g.planet.layer - 1; }
  counter(s: number, k: string, n: number) { const c = this.s[s].counters; c[k] = (c[k] ?? 0) + n; }
  onShip(_k: string, _n: number) {}
  focus() { return this.g.planet.layer; }

  metas(layer = this.g.planet.layer): MetaDef[] { return METAS[layer] ?? []; }

  private progress(m: MetaDef, layer: number): [number, number] {
    const g = this.g, M = g.machines;
    switch (m.kind) {
      case 'build': return [M.count(m.key), m.count];
      case 'behavior': return [M.countBehavior(m.behavior), m.count];
      case 'deliver': return [this.s[layer].counters.delivered ?? 0, m.kg];
      case 'counter': return [this.s[layer].counters[m.key] ?? 0, m.max];
      case 'drill': return [g.player.drillLevel + 1, m.level];
      case 'layer': return [g.planet.layerFraction(layer) * 100, m.frac * 100];
    }
  }

  /** As metas da camada com o estado de cada uma (as já cumpridas aparecem como feitas). */
  objectives(layer = this.g.planet.layer): Objective[] {
    const st = this.s[layer];
    return this.metas(layer).map((m, i) => {
      const [cur, max] = i < st.phase ? [1, 1] : this.progress(m, layer);
      return { text: m.text, cur: Math.min(cur, max), max, done: i < st.phase || cur >= max };
    });
  }
  /** Meta atual (a primeira não cumprida), ou null. */
  currentMeta(): Objective | null {
    const st = this.s[this.g.planet.layer];
    return this.objectives()[st.phase] ?? null;
  }
  reward(layer: number, i: number) { return Math.round(250 * Math.pow(2.4, layer - 1) * (1 + i * 0.6)); }

  update(dt: number) {
    const g = this.g;
    const L = g.planet.layer;
    const st = this.s[L];
    st.visitedT = g.time;
    if (!st.discovered) { st.discovered = true; g.bus.emit('sector_discovered', L); }
    this.current = L;
    if (L !== this.lastSector) { this.lastSector = L; g.bus.emit('enter_sector', L); }
    // metas: cumpridas em sequência
    if (Math.floor(g.time * 2) !== Math.floor((g.time - dt) * 2)) {
      const list = this.metas(L);
      while (st.phase < list.length) {
        const [cur, max] = this.progress(list[st.phase], L);
        if (cur < max) break;
        const reward = this.reward(L, st.phase);
        g.stock.credits += reward;
        g.ui.banner('META CUMPRIDA', `${list[st.phase].text} · +${fmtInt(reward)} créditos`);
        g.audio.success();
        st.phase++;
        if (st.phase >= list.length) g.dialogue.line('zena', `Metas da ${SECTORS[L - 1].name} cumpridas. Agora é só remover o resto da camada: processe, compacte, exporte.`);
      }
    }
  }

  advance(s: number) { const st = this.s[s]; if (st.phase < this.metas(s).length) st.phase++; }

  /** Perfurador portátil exigido para descer à próxima camada. */
  descendBlock(): string | null {
    const next = SECTORS[this.g.planet.layer];
    if (!next) return null;
    const tier = DRILLS[this.g.player.drillLevel].tier;
    return tier < next.tier ? `Sua classe de perfurador (${tier}) não quebra a ${next.name} (classe ${next.tier}). Melhore o perfurador antes de descer.` : null;
  }

  serialize() { return { s: this.s, buffers: this.rt.map(r => r.buffer), linked: this.rt.map(r => r.linkedTotal) }; }
  load(d: any) {
    if (d.s) this.s = d.s.map((x: SectorSave) => ({ ...x, phase: x.phase ?? 0 }));
    d.buffers?.forEach((b: Bag, i: number) => { if (this.rt[i]) this.rt[i].buffer = b ?? {}; });
    d.linked?.forEach((v: number, i: number) => { if (this.rt[i]) this.rt[i].linkedTotal = v ?? 0; });
  }
}
