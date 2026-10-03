import { IS_LOOSE } from '../data/materials';
import type { Game } from '../Game';

const STEP = 0.1;
const CHECK_EVERY = 30;

/** Recupera a produção da fábrica enquanto o jogo esteve fechado ou oculto. */
export class OfflineProgress {
  remaining: number;
  total: number;
  elapsed = 0;
  loose = 0;
  initialLoose = 0;
  reason: 'time' | 'empty' | 'stalled' = 'time';
  done = false;
  private checkIn = CHECK_EVERY;
  private idleFor = 0;
  private signature = '';
  private startUnits: number;

  constructor(private g: Game, seconds: number) {
    this.remaining = this.total = seconds;
    this.initialLoose = this.loose = this.countLoose();
    this.startUnits = g.planet.units[g.planet.layer];
    this.signature = this.progressSignature();
  }

  addSeconds(seconds: number) { this.remaining += seconds; this.total += seconds; this.done = false; }
  gainedUnits() { return Math.max(0, this.g.planet.units[this.g.planet.layer] - this.startUnits); }

  /** Um pequeno orçamento por quadro mantém a interface responsiva mesmo após ausências longas. */
  advance(budgetMs = 12) {
    const limit = performance.now() + budgetMs;
    let steps = 0;
    while (this.remaining > 0.000001 && steps++ < 120 && performance.now() < limit) {
      this.g.time += STEP;
      this.g.world.updateFlyers(STEP);
      this.g.machines.update(STEP);
      // Queda e avalanches usam o mesmo simulador do jogo, sem o jogador minerar sozinho.
      for (let i = 0; i < 6; i++) this.g.world.simulate();
      this.g.robots.update(STEP);
      this.g.sectors.update(STEP);
      this.g.planet.update(this.g.time);
      this.g.research.update(STEP);
      this.g.crafting.update(STEP);
      this.g.contracts.update(STEP);
      this.g.stock.tick(this.g.time);
      this.remaining = Math.max(0, this.remaining - STEP);
      this.elapsed += STEP;
      this.checkIn -= STEP;
      if (this.checkIn <= 0) {
        this.checkIn = CHECK_EVERY;
        this.loose = this.countLoose();
        const signature = this.progressSignature();
        this.idleFor = signature === this.signature ? this.idleFor + CHECK_EVERY : 0;
        this.signature = signature;
        if (!this.loose && !this.hasPendingWork()) { this.reason = 'empty'; this.done = true; break; }
        if (this.idleFor >= 120) { this.reason = 'stalled'; this.done = true; break; }
      }
    }
    if (this.remaining <= 0.000001 && !this.done) { this.reason = 'time'; this.done = true; }
    return this.done;
  }

  private countLoose() {
    let n = 0;
    for (const m of this.g.world.mat) if (IS_LOOSE[m]) n++;
    return n;
  }

  private hasPendingWork() {
    if (this.g.world.flyers.length) return true;
    if (this.g.robots.list.some(r => r.kind === 'miner' && !r.broken)) return true;
    return this.g.machines.list.some(m => {
      if (m.q?.length || m.belt?.length || Object.values(m.inb).some(n => n > 0) || Object.values(m.out).some(n => n > 0)) return true;
      return !m.broken && !m.exhausted && ['drill', 'pump', 'complex', 'tectonic', 'mantle', 'collector'].includes(m.def.behavior);
    });
  }

  private progressSignature() {
    const produced = this.g.machines.list.reduce((n, m) => n + m.produced, 0);
    const stock = Object.values(this.g.stock.items).reduce((n, q) => n + q, 0);
    return `${this.loose}|${Math.floor(produced * 10)}|${Math.floor(stock * 10)}|${Math.floor(this.g.planet.units[this.g.planet.layer] * 10)}|${Math.floor(this.g.stats.shipped * 10)}`;
  }
}
