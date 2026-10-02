import { RESEARCH, RESEARCH_BY_KEY, type ResearchDef } from '../data/research';
import type { Game } from '../Game';
import { HIDDEN_RESEARCH } from '../data/economy';

export class Research {
  done = new Set<string>();
  active: { key: string; t: number } | null = null;
  private effCache: Record<string, number> | null = null;

  constructor(private g: Game) {
    // a rede de energia saiu do jogo: pesquisas de energia ficam concluídas para não travar a árvore
    for (const r of RESEARCH) if (r.cat === 'energia' || HIDDEN_RESEARCH.has(r.key)) this.done.add(r.key);
  }

  has(k: string) { return !k || this.done.has(k); }
  eff(name: string): number {
    if (!this.effCache) {
      this.effCache = {};
      for (const k of this.done) {
        const e = RESEARCH_BY_KEY[k]?.effects;
        if (e) for (const n in e) this.effCache[n] = (this.effCache[n] ?? 0) + e[n];
      }
    }
    return this.effCache[name] ?? 0;
  }

  cost(r: ResearchDef) {
    const disc = r.cat === 'alienigena' || r.key === 'fundidor' || r.key === 'liga_ancestral' || r.key === 'nucleo_alien' ? this.eff('alienDiscount') + Math.min(0.3, this.g.lore.unlocked.size * 0.005 * (this.g.machines.count('centro_arqueologico') ? 1 : 0)) : 0;
    const items: Record<string, number> = {};
    for (const k in r.items) items[k] = Math.ceil(r.items[k] * (1 - disc));
    return { credits: Math.round(r.credits * (1 - disc)), items };
  }

  /** Motivo pelo qual não pode ser pesquisada agora (ou null). */
  blocked(r: ResearchDef): string | null {
    if (this.done.has(r.key)) return 'Concluída';
    for (const q of r.req) if (!this.done.has(q)) return `Requer: ${RESEARCH_BY_KEY[q]?.name ?? q}`;
    if (r.certified && !this.g.sectors.certified(r.certified)) return `Requer chegar à Camada ${r.certified}`;
    if (r.lore && this.g.lore.unlocked.size < r.lore) return `Requer ${r.lore} registros no Arquivo (${this.g.lore.unlocked.size})`;
    return null;
  }

  start(key: string): string | null {
    const r = RESEARCH_BY_KEY[key];
    if (!r) return 'Inexistente';
    const b = this.blocked(r); if (b) return b;
    const c = this.cost(r);
    if (this.g.stock.credits < c.credits) return 'Créditos insuficientes';
    if (!this.g.stock.has(c.items, this.g.pack.items)) return 'Materiais insuficientes';
    this.g.stock.credits -= c.credits;
    this.g.stock.pay(c.items, this.g.pack.items);
    // desbloqueio imediato: sem estação e sem fila de pesquisa
    this.done.add(r.key);
    this.effCache = null;
    this.g.stats.research++;
    this.g.bus.emit('research_done', r);
    return null;
  }

  update(dt: number) {
    if (!this.active) return;
    this.active.t += dt;
    const r = RESEARCH_BY_KEY[this.active.key];
    if (this.active.t >= r.time) {
      this.done.add(r.key);
      this.effCache = null;
      this.active = null;
      this.g.stats.research++;
      this.g.bus.emit('research_done', r);
    }
  }

  grant(key: string) { this.done.add(key); this.effCache = null; }
  list() { return RESEARCH; }
  serialize() { return { done: [...this.done], active: this.active }; }
  load(s: any) { this.done = new Set([...s.done, ...RESEARCH.filter(r => r.cat === 'energia' || HIDDEN_RESEARCH.has(r.key)).map(r => r.key)]); this.active = s.active; this.effCache = null; }
}
