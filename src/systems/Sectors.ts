import { LAYER_COUNT } from '../data/sectors';
import { SECTORS, sectorById } from '../data/sectors';
import { MACHINE } from '../data/machines';
import { itemName } from '../data/items';
import { fmtInt } from '../core/math';
import { type Bag, bagAdd } from './Inventory';
import type { SectorRT } from './Machines';
import type { Game } from '../Game';

/** A saga de automação de cada setor: 9 fases. */
export const PHASES = [
  'Reconhecimento', 'Infraestrutura', 'Extração Experimental', 'Estabilização', 'Logística',
  'Quota Corporativa', 'Calibração Manual', 'Certificação', 'Automação da Camada',
];

export interface Objective { text: string; cur: number; max: number; done: boolean; }

export interface SectorSave {
  discovered: boolean;
  phase: number;            // 0..9 (9 = automatizado)
  counters: Record<string, number>;
  base: Record<string, number>;   // contadores no início da fase
  shipBase: Bag;
  auditPassed: boolean;
  visitedT: number;
}

export class SectorSystem {
  rt: SectorRT[] = [];
  s: SectorSave[] = [];
  current = 1;
  private lastSector = 0;

  constructor(private g: Game) {
    for (let i = 0; i <= LAYER_COUNT; i++) {
      this.rt.push({ gen: 0, use: 0, ratio: 1, demand: 0, heat: 0, cooling: 20, stress: 0, buffer: {}, bufCap: 0, linkCap: 0, linkFlow: 0, linkedTotal: 0, drillOut: 0, deepRate: 0, fields: {} });
      this.s.push({ discovered: i === 1, phase: 0, counters: {}, base: {}, shipBase: {}, auditPassed: false, visitedT: 0 });
    }
  }

  certified(s: number) { return this.s[s].phase >= 8; }
  automated(s: number) { return this.s[s].phase >= 9; }
  certifiedCount() { let n = 0; for (let i = 1; i <= LAYER_COUNT; i++) if (this.certified(i)) n++; return n; }

  counter(s: number, k: string, n: number) { const c = this.s[s].counters; c[k] = (c[k] ?? 0) + n; }
  private since(s: number, k: string) { return (this.s[s].counters[k] ?? 0) - (this.s[s].base[k] ?? 0); }

  onShip(k: string, n: number) { void k; void n; }

  /** Objetivos da fase atual de um setor. */
  objectives(sec: number): Objective[] {
    const g = this.g, st = this.s[sec], sd = sectorById(sec);
    const M = g.machines;
    const o = (text: string, cur: number, max: number): Objective => ({ text, cur: Math.min(cur, max), max, done: cur >= max });
    switch (st.phase) {
      case 0: return [
        o(`Explorar 2% da camada`, Math.floor(g.world.exploredFrac(sec) * 1000) / 10, 2),
        o('Escanear depósitos minerais', st.counters.scans ?? 0, 3),
      ];
      case 1: return [
        o('Construir gerador de energia', M.list.filter(m => m.sector === sec && (m.def.behavior === 'generator' || m.def.behavior === 'reactor')).length + (sec === 1 ? 0 : 0), 1),
        o('Construir armazém', M.countBehavior('storage', sec), 1),
        o('Construir Elevador de Carga', M.countBehavior('link', sec), 1),
      ];
      case 2: return [
        o('Instalar perfuradora', M.countBehavior('drill', sec), 1),
        o('Instalar esteiras', M.countBehavior('belt', sec), 5),
        o('Produzir minério via perfuradora (kg)', this.since(sec, 'drillOut'), 200),
        o('Construir uma estação de drone', M.countBehavior('dronepad', sec), 1),
      ];
      case 3: return sd.stabilize.map(x => o(`Instalar ${MACHINE[x.machine].name}`, M.count(x.machine, sec), x.count));
      case 4: return [o('Transferir carga ao Estoque Central (kg)', this.since(sec, 'linked'), sd.logisticsKg)];
      case 5: return Object.entries(sd.quota).map(([k, n]) => o(`Enviar ${itemName(k)} à Zenitex (J → Envio Orbital)`, (g.machines.shipped[k] ?? 0) - (st.shipBase[k] ?? 0), n));
      case 6: return [o('Calibrar instalações manualmente', this.since(sec, 'calibrations'), 3)];
      case 7: {
        const ms = M.list.filter(m => m.sector === sec && m.def.power !== 0);
        const bad = ms.filter(m => m.broken || m.cond < 50 || m.overheat).length;
        return [
          o('Nenhuma máquina abaixo de 50% de condição', bad === 0 ? 1 : 0, 1),
          o('Formulário de auditoria Z-77 (Centro de Comando)', st.auditPassed ? 1 : 0, 1),
        ];
      }
      case 8: return [o('Construir Complexo de Extração Profunda', M.countBehavior('complex', sec), 1)];
      default: return [];
    }
  }

  update(dt: number) {
    const g = this.g;
    const sec = g.world.sectorAtPx(g.player.x, g.player.y);
    if (sec) {
      this.current = sec;
      const st = this.s[sec];
      st.visitedT = g.time;
      if (!st.discovered) { st.discovered = true; g.bus.emit('sector_discovered', sec); }
      if (sec !== this.lastSector) { this.lastSector = sec; g.bus.emit('enter_sector', sec); }
    }
    // avanço de fases (checagem leve)
    if (Math.floor(g.time * 2) !== Math.floor((g.time - dt) * 2)) {
      for (let s = 1; s <= LAYER_COUNT; s++) {
        const st = this.s[s];
        if (!st.discovered || st.phase >= 9) continue;
        const obj = this.objectives(s);
        if (obj.length && obj.every(x => x.done)) this.advance(s);
      }
    }
  }

  advance(s: number) {
    const g = this.g, st = this.s[s];
    const finished = st.phase;
    st.phase++;
    st.base = { ...st.counters };
    st.shipBase = { ...g.machines.shipped };
    const reward = Math.round(150 * Math.pow(1.9, s - 1) * (1 + finished * 0.35));
    g.stock.credits += reward;
    g.ui.banner(`${sectorById(s).code} — ${PHASES[finished]} concluída`, `+${fmtInt(reward)} créditos · Próxima: ${PHASES[st.phase] ?? 'Camada automatizada'}`);
    g.audio.success();
    if (finished === 5) g.say('quota_done');
    if (st.phase === 8) { g.say('certified'); g.bus.emit('sector_certified', s); }
    if (st.phase === 9) g.bus.emit('sector_automated', s);
  }

  /** Setor em foco no HUD: o atual se ativo, senão o mais avançado não automatizado. */
  focus(): number {
    if (this.s[this.current]?.discovered && this.s[this.current].phase < 9) return this.current;
    for (let s = 1; s <= LAYER_COUNT; s++) if (this.s[s].discovered && this.s[s].phase < 9) return s;
    return this.current;
  }

  serialize() { return { s: this.s, buffers: this.rt.map(r => r.buffer), linked: this.rt.map(r => r.linkedTotal) }; }
  load(d: any) {
    this.s = d.s;
    d.buffers?.forEach((b: Bag, i: number) => { this.rt[i].buffer = b ?? {}; });
    d.linked?.forEach((v: number, i: number) => { this.rt[i].linkedTotal = v ?? 0; });
  }
}

export { SECTORS, bagAdd };
