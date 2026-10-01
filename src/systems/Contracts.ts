import { CONTRACT_TEMPLATES, type ContractKind } from '../data/contracts';
import { ITEM, itemName } from '../data/items';
import { RNG } from '../core/rng';
import type { Game } from '../Game';

export interface Contract {
  id: number;
  kind: ContractKind;
  title: string;
  flavor: string;
  item?: string;
  target: number;
  progress: number;
  reward: number;
  deadline: number;   // segundos totais
  left: number;
  accepted: boolean;
  base?: number;
}

const RARES = ['lumenita_pura', 'lumenita_instavel', 'pyroxis_volatil', 'verdanio_vivo', 'nexolita_condensada', 'ferronox_denso'];
const CRAFTABLE = ['componente', 'pecas', 'motor', 'bateria', 'broca', 'sensor', 'filtro', 'circuito', 'explosivo', 'kit_reparo'];

export class Contracts {
  available: Contract[] = [];
  active: Contract[] = [];
  nextId = 1;
  private rng = new RNG(Date.now() & 0xffff);
  private refreshT = 0;
  completed = 0;

  constructor(private g: Game) {}

  private scale() { return Math.pow(2.1, this.g.sectors.certifiedCount()) * (1 + this.g.planet.fraction() * 40); }

  generate(): Contract | null {
    const g = this.g;
    const known = Object.keys(g.stock.items).filter(k => ITEM[k] && (ITEM[k].cat === 'minerio' || ITEM[k].cat === 'refinado' || ITEM[k].cat === 'liga'));
    if (!known.length) known.push('lumenita', 'ferronox');
    for (let tries = 0; tries < 10; tries++) {
      const t = this.rng.pick(CONTRACT_TEMPLATES);
      const sc = this.scale();
      let item: string | undefined, target = 0;
      switch (t.kind) {
        case 'ship': item = this.rng.pick(known); target = Math.round((ITEM[item].cat === 'minerio' ? 300 : 40) * sc / Math.max(1, ITEM[item].value / 3)); break;
        case 'mine': item = this.rng.pick(known.filter(k => ITEM[k].cat === 'minerio' && !ITEM[k].contain)); if (!item) continue; target = Math.round(60 * Math.sqrt(sc)); break;
        case 'craft': { const opts = CRAFTABLE.filter(k => g.crafting.recipes().some(r => r.out[k])); if (!opts.length) continue; item = this.rng.pick(opts); target = Math.max(2, Math.round(3 * Math.sqrt(sc))); break; }
        case 'rare': { const opts = RARES.filter(k => (g.stats.mined[k] ?? 0) > 0 || g.stats.rares > 0); if (!opts.length) continue; item = this.rng.pick(opts); target = Math.round(10 + 5 * Math.sqrt(sc)); break; }
        case 'ruin': if (g.lore.unlocked.size < 1) continue; target = 1 + Math.floor(this.rng.next() * 2); break;
        case 'rate': if (!g.sectors.certifiedCount()) continue; target = Math.round(Math.max(500, g.planet.rate() * 1.4) / 100) * 100; break;
        case 'explore': target = 3; break;
      }
      const reward = Math.round(t.baseReward * 180 * sc / 10) * 10;
      const c: Contract = {
        id: this.nextId++, kind: t.kind,
        title: t.title.replace('{item}', item ? itemName(item) : ''),
        flavor: this.rng.pick(t.flavor), item, target, progress: 0, reward,
        deadline: t.minutes * 60, left: t.minutes * 60, accepted: false,
      };
      return c;
    }
    return null;
  }

  accept(id: number): string | null {
    const c = this.available.find(x => x.id === id);
    if (!c) return 'Contrato indisponível';
    if (this.active.length >= 3) return 'Máximo de 3 contratos ativos';
    this.available.splice(this.available.indexOf(c), 1);
    c.accepted = true;
    if (c.kind === 'explore') c.base = this.g.world.exploredFrac(this.g.sectors.current) * 100;
    if (c.kind === 'ruin') c.base = this.g.lore.unlocked.size;
    this.active.push(c);
    return null;
  }

  onShip(k: string, n: number) { for (const c of this.active) if (c.kind === 'ship' && c.item === k) c.progress += n; }
  onMine(k: string, n: number) { for (const c of this.active) if ((c.kind === 'mine' || c.kind === 'rare') && c.item === k) c.progress += n; }
  onCraft(k: string, n: number) { for (const c of this.active) if (c.kind === 'craft' && c.item === k) c.progress += n; }

  update(dt: number) {
    const g = this.g;
    this.refreshT -= dt;
    if (this.available.length < 4 && this.refreshT <= 0) {
      const c = this.generate(); if (c) this.available.push(c);
      this.refreshT = 40;
    }
    for (let i = this.active.length - 1; i >= 0; i--) {
      const c = this.active[i];
      c.left -= dt;
      if (c.kind === 'ruin') c.progress = g.lore.unlocked.size - (c.base ?? 0);
      if (c.kind === 'rate') c.progress = Math.max(c.progress, g.planet.rate());
      if (c.kind === 'explore') c.progress = g.world.exploredFrac(g.sectors.current) * 100 - (c.base ?? 0);
      if (c.progress >= c.target) {
        this.active.splice(i, 1);
        g.stock.credits += c.reward;
        this.completed++;
        g.stats.contracts++;
        g.ui.banner('Contrato concluído: ' + c.title, `+${c.reward.toLocaleString('pt-BR')} créditos`);
        g.say('contract_done', 30);
        g.audio.success();
      } else if (c.left <= 0) {
        this.active.splice(i, 1);
        g.toast(`Contrato expirado: ${c.title}. A Zenitex registrou sua "oportunidade de melhoria".`, '#ff6a3a');
      }
    }
  }

  serialize() { return { available: this.available, active: this.active, nextId: this.nextId, completed: this.completed }; }
  load(s: any) { Object.assign(this, s); }
}
