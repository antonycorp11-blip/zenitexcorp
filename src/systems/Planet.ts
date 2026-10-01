import { PLANET_MASS_T } from '../core/constants';
import { SECTORS } from '../data/sectors';
import type { Game } from '../Game';

export const FINAL_LOCK = 0.99;   // extração automática para em 99%
const MILESTONES = [1e-7, 1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99];

/** MASSA PLANETÁRIA EXTRAÍDA — o número mais importante do jogo. */
export class PlanetProgress {
  total = PLANET_MASS_T;
  terrain = 0;                       // t removidas do terreno explorável
  crust: number[] = new Array(13).fill(0);   // t extraídas por setor
  mantle: number[] = new Array(13).fill(0);
  crustMax: number[] = new Array(13).fill(0);
  mantleMax: number[] = new Array(13).fill(0);
  milestone = 0;
  finalDone = false;
  bonus = 0;                         // canhão / operações finais
  private history: { t: number; v: number }[] = [];

  constructor(private g: Game, massMult = 1) {
    this.total = PLANET_MASS_T * massMult;
    for (const s of SECTORS) {
      let r = s.reserve * this.total;
      if (s.id === 12) r -= this.total * (1 - FINAL_LOCK); // o núcleo final é reservado para o fim
      this.crustMax[s.id] = r * 0.65;
      this.mantleMax[s.id] = r * 0.35;
    }
  }

  extracted() {
    let e = this.terrain + this.bonus;
    for (let s = 1; s <= 12; s++) e += this.crust[s] + this.mantle[s];
    return this.finalDone ? this.total : Math.min(this.total, e);
  }
  fraction() { return this.extracted() / this.total; }
  sectorFraction(s: number) { return (this.crust[s] + this.mantle[s]) / Math.max(1, this.crustMax[s] + this.mantleMax[s]); }

  addTerrain(t: number) { this.terrain += t; }

  extractDeep(sector: number, layer: 'crust' | 'mantle', t: number): number {
    if (this.finalDone) return 0;
    const lockRoom = this.total * FINAL_LOCK - this.extracted();
    if (lockRoom <= 0) return 0;
    const arr = layer === 'crust' ? this.crust : this.mantle;
    const max = layer === 'crust' ? this.crustMax : this.mantleMax;
    const got = Math.max(0, Math.min(t, max[sector] - arr[sector], lockRoom));
    arr[sector] += got;
    return got;
  }

  /** Disparo do Canhão de Matéria: arranca parte do setor (crosta, depois manto). */
  cannonHit(sector: number, t: number) {
    let rem = t;
    rem -= this.extractDeep(sector, 'crust', rem);
    rem -= this.extractDeep(sector, 'mantle', rem);
    return t - rem;
  }

  update(time: number) {
    const f = this.fraction();
    while (this.milestone < MILESTONES.length && f >= MILESTONES[this.milestone]) {
      this.g.bus.emit('mass_milestone', this.milestone);
      this.milestone++;
    }
    if (!this.history.length || time - this.history[this.history.length - 1].t >= 5) {
      this.history.push({ t: time, v: this.extracted() });
      if (this.history.length > 40) this.history.shift();
    }
  }

  /** t/min médio recente */
  rate(): number {
    const h = this.history;
    if (h.length < 2) return 0;
    const a = h[Math.max(0, h.length - 13)], b = h[h.length - 1];
    return b.t > a.t ? ((b.v - a.v) / (b.t - a.t)) * 60 : 0;
  }

  serialize() { return { terrain: this.terrain, crust: this.crust, mantle: this.mantle, milestone: this.milestone, finalDone: this.finalDone, bonus: this.bonus, total: this.total }; }
  load(s: any) { Object.assign(this, { terrain: s.terrain, crust: s.crust, mantle: s.mantle, milestone: s.milestone, finalDone: s.finalDone, bonus: s.bonus ?? 0 }); }
}
