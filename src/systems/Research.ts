import { RESEARCH, RESEARCH_BY_KEY, type ResearchDef } from '../data/research';
import type { Game } from '../Game';

export class Research {
  done = new Set<string>();
  active: { key: string; t: number } | null = null;
  private effCache: Record<string, number> | null = null;

  constructor(private g: Game) {}

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
    if (r.certified && !this.g.sectors.certified(r.certified)) return `Requer Setor ${String(r.certified).padStart(2, '0')} certificado`;
    if (r.lore && this.g.lore.unlocked.size < r.lore) return `Requer ${r.lore} registros no Arquivo (${this.g.lore.unlocked.size})`;
    return null;
  }

  start(key: string): string | null {
    const r = RESEARCH_BY_KEY[key];
    if (!r) return 'Inexistente';
    if (!this.g.machines.count('laboratorio')) return 'Construa uma Estação de Pesquisa';
    if (this.active) return 'Já existe uma pesquisa em andamento';
    const b = this.blocked(r); if (b) return b;
    const c = this.cost(r);
    if (this.g.stock.credits < c.credits) return 'Créditos insuficientes';
    if (!this.g.stock.has(c.items, this.g.pack.items)) return 'Materiais insuficientes';
    this.g.stock.credits -= c.credits;
    this.g.stock.pay(c.items, this.g.pack.items);
    this.active = { key, t: 0 };
    return null;
  }

  update(dt: number) {
    if (!this.active) return;
    const labs = this.g.machines.list.filter(m => m.key === 'laboratorio' && !m.broken && m.working).length;
    if (!labs) return;
    this.active.t += dt * (1 + (labs - 1) * 0.5);
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
  load(s: any) { this.done = new Set(s.done); this.active = s.active; this.effCache = null; }
}
