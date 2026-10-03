import { PLANET_MASS_T } from '../core/constants';
import { SECTORS, LAYER_COUNT } from '../data/sectors';
import type { Game } from '../Game';

export const FINAL_LOCK = 0.99;   // a extração para em 99%: o resto é a operação final manual
const MILESTONES = [1e-7, 1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99];

/**
 * MASSA PLANETÁRIA por camadas. Cada camada tem uma meta em "unidades de extração"
 * (uma célula minerada à mão = 1 unidade; máquinas rendem várias por segundo).
 * Esgotar a camada atual libera a descida para a próxima: o planeta encolhe.
 */
export class PlanetProgress {
  total = PLANET_MASS_T;
  layer = 1;                                    // camada atual
  units: number[] = new Array(LAYER_COUNT + 1).fill(0);   // massa REMOVIDA do planeta (separada ou exportada)
  dug: number[] = new Array(LAYER_COUNT + 1).fill(0);     // massa ESCAVADA (ainda pode estar na base como bruto/resíduo)
  milestone = 0;
  /** meta REAL de cada camada (unidades = células de terra do mapa da camada); 0 = ainda não medida */
  targets: number[] = new Array(LAYER_COUNT + 1).fill(0);
  target(l = this.layer) { return this.targets[l] > 0 ? this.targets[l] : SECTORS[l - 1].target; }
  finalDone = false;
  private history: { t: number; v: number }[] = [];

  constructor(private g: Game, massMult = 1, layer = 1) {
    this.total = PLANET_MASS_T * massMult;
    this.layer = layer;
    // camadas acima da atual já foram esgotadas
    for (let i = 1; i < layer; i++) { this.units[i] = this.target(i); this.dug[i] = this.target(i); }
  }

  get def() { return SECTORS[this.layer - 1]; }
  /** fração 0..1 da camada atual */
  layerFraction(l = this.layer) { return Math.min(1, this.units[l] / this.target(l)); }
  layerDone() { return this.units[this.layer] >= this.target() - 1e-6; }
  sectorFraction(s: number) { return this.layerFraction(s); }
  /** toneladas por unidade nesta camada */
  tPerUnit(l = this.layer) { const d = SECTORS[l - 1]; return (d.share * this.total) / this.target(l); }

  fraction() {
    if (this.finalDone) return 1;
    let f = 0;
    for (let i = 1; i <= LAYER_COUNT; i++) f += SECTORS[i - 1].share * this.layerFraction(i);
    return Math.min(FINAL_LOCK, f);
  }
  extracted() { return this.fraction() * this.total; }

  /** Massa escavada (não move a barra: ela só conta quando sai do planeta). */
  dig(n: number) { if (n > 0) this.dug[this.layer] += n; }
  dugFraction(l = this.layer) { return Math.min(1, this.dug[l] / this.target(l)); }

  /** Adiciona unidades de extração à camada atual (respeita a meta e a trava final). */
  addUnits(n: number): number {
    if (this.finalDone || n <= 0) return 0;
    const d = this.def;
    let room = this.target() - this.units[this.layer];
    if (this.layer === LAYER_COUNT) {
      // no Núcleo, só até a trava de 99% do planeta
      const lockUnits = ((FINAL_LOCK - (1 - d.share)) / d.share) * this.target();
      room = Math.min(room, lockUnits - this.units[this.layer]);
    }
    const got = Math.max(0, Math.min(n, room));
    this.units[this.layer] += got;
    if (got > 0 && this.layerDone() && !this.g.flags['layerDone' + this.layer]) {
      this.g.flags['layerDone' + this.layer] = true;
      this.g.bus.emit('layer_done', this.layer);
    }
    return got;
  }
  /** compatibilidade: massa de terreno em toneladas -> unidades */
  addTerrain(t: number) { this.addUnits(t / this.tPerUnit()); }
  /** extração por máquinas (complexos etc.) — em unidades */
  extractDeep(_sector: number, _layer: 'crust' | 'mantle', u: number): number { return this.addUnits(u); }
  cannonHit(_s: number, u: number) { return this.addUnits(u); }

  update(time: number) {
    const f = this.fraction();
    while (this.milestone < MILESTONES.length && f >= MILESTONES[this.milestone]) {
      this.g.bus.emit('mass_milestone', this.milestone);
      this.milestone++;
    }
    if (!this.history.length || time - this.history[this.history.length - 1].t >= 5) {
      this.history.push({ t: time, v: this.units[this.layer] });
      if (this.history.length > 40) this.history.shift();
    }
  }

  /** unidades/min recentes na camada atual */
  rateUnits(): number {
    const h = this.history;
    if (h.length < 2) return 0;
    const a = h[Math.max(0, h.length - 13)], b = h[h.length - 1];
    return b.t > a.t ? ((b.v - a.v) / (b.t - a.t)) * 60 : 0;
  }
  /** t/min recentes (para contratos e HUD) */
  rate(): number { return this.rateUnits() * this.tPerUnit(); }

  serialize() { return { layer: this.layer, units: this.units, dug: this.dug, milestone: this.milestone, finalDone: this.finalDone, total: this.total, targets: this.targets }; }
  load(s: any) {
    if (s.units) { this.units = s.units; this.dug = s.dug ?? s.units.slice(); this.milestone = s.milestone ?? 0; this.finalDone = !!s.finalDone; }
    if (Array.isArray(s.targets)) this.targets = s.targets;
  }
}
