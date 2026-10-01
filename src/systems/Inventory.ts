import { ITEM } from '../data/items';
import { PACKS, SPECIAL_SLOT_KG } from '../data/equipment';

export type Bag = Record<string, number>;

export function bagAdd(b: Bag, k: string, n: number) { b[k] = (b[k] ?? 0) + n; if (b[k] <= 1e-9) delete b[k]; }
export function bagTotal(b: Bag) { let t = 0; for (const k in b) t += b[k]; return t; }

/** Estoque Central (base) com medição de taxa por item. */
export class Stock {
  items: Bag = {};
  credits = 0;
  private window: { t: number; k: string; n: number }[] = [];
  private now = 0;

  tick(t: number) { this.now = t; if (this.window.length > 4000) this.window.splice(0, 1000); }
  count(k: string) { return this.items[k] ?? 0; }
  add(k: string, n: number, track = true) {
    if (n <= 0) return;
    bagAdd(this.items, k, n);
    if (track) this.window.push({ t: this.now, k, n });
  }
  take(k: string, n: number): number {
    const have = this.count(k);
    const got = Math.min(have, n);
    if (got > 0) bagAdd(this.items, k, -got);
    return got;
  }
  has(cost: Record<string, number>, extra?: Bag) {
    for (const k in cost) if (this.count(k) + (extra?.[k] ?? 0) < cost[k] - 1e-9) return false;
    return true;
  }
  /** Paga primeiro do estoque, completa com a mochila (se fornecida). */
  pay(cost: Record<string, number>, extra?: Bag): boolean {
    if (!this.has(cost, extra)) return false;
    for (const k in cost) {
      let need = cost[k];
      need -= this.take(k, need);
      if (need > 0 && extra) bagAdd(extra, k, -need);
    }
    return true;
  }
  /** kg/min de um item nos últimos 60 s */
  rate(k: string): number {
    let s = 0;
    for (let i = this.window.length - 1; i >= 0; i--) {
      const e = this.window[i];
      if (this.now - e.t > 60) break;
      if (e.k === k) s += e.n;
    }
    return s;
  }
}

/** Mochila do jogador: limite de peso + slots especiais. */
export class Backpack {
  items: Bag = {};
  level = 0;
  get def() { return PACKS[this.level]; }
  weight() { let w = 0; for (const k in this.items) w += (ITEM[k]?.weight ?? 1) * this.items[k]; return w; }
  maxWeight() { return this.def.weight; }
  specialUsed(kind: 'contencao' | 'frio' | 'magnetico') {
    let w = 0;
    for (const k in this.items) if (ITEM[k]?.contain === kind) w += (ITEM[k].weight) * this.items[k];
    return w;
  }
  specialCap(kind: 'contencao' | 'frio' | 'magnetico') { return this.def[kind] * SPECIAL_SLOT_KG; }
  /** Quantas unidades de k cabem. */
  room(k: string): number {
    const d = ITEM[k]; if (!d) return 0;
    let free = (this.maxWeight() - this.weight()) / d.weight;
    if (d.contain) free = Math.min(free, (this.specialCap(d.contain) - this.specialUsed(d.contain)) / d.weight);
    return Math.max(0, free);
  }
  add(k: string, n: number): number {
    const r = Math.min(n, this.room(k));
    if (r > 0) bagAdd(this.items, k, r);
    return r;
  }
  count(k: string) { return this.items[k] ?? 0; }
  take(k: string, n: number) { const g = Math.min(n, this.count(k)); if (g > 0) bagAdd(this.items, k, -g); return g; }
}
