import { RECIPES, RECIPE, type Recipe } from '../data/recipes';
import { ITEM } from '../data/items';
import type { Game } from '../Game';

export interface CraftJob { key: string; t: number; }

export class Crafting {
  queue: CraftJob[] = [];
  constructor(private g: Game) {}

  recipes(): Recipe[] { return RECIPES.filter(r => r.station === 'oficina' && (!r.research || this.g.research.has(r.research))); }

  can(r: Recipe) { return this.g.stock.has(r.in, this.g.pack.items); }

  enqueue(key: string, n = 1): string | null {
    const r = RECIPE[key];
    if (!this.g.machines.count('oficina')) return 'Construa uma Oficina';
    for (let i = 0; i < n; i++) {
      if (!this.g.stock.pay(r.in, this.g.pack.items)) return i ? null : 'Materiais insuficientes';
      this.queue.push({ key, t: 0 });
    }
    return null;
  }

  update(dt: number) {
    if (!this.queue.length) return;
    const shops = this.g.machines.list.filter(m => m.key === 'oficina' && !m.broken).length;
    if (!shops) return;
    const job = this.queue[0];
    job.t += dt * (1 + (shops - 1) * 0.5);
    const r = RECIPE[job.key];
    if (job.t >= r.time) {
      this.queue.shift();
      for (const k in r.out) {
        const consumable = ITEM[k]?.cat === 'consumivel';
        if (consumable) { const got = this.g.pack.add(k, r.out[k]); if (got < r.out[k]) this.g.stock.add(k, r.out[k] - got, false); }
        else this.g.stock.add(k, r.out[k], false);
        this.g.contracts.onCraft(k, r.out[k]);
        this.g.stats.crafted += r.out[k];
      }
      this.g.audio.click();
    }
  }
  serialize() { return this.queue; }
  load(q: CraftJob[]) { this.queue = q ?? []; }
}
