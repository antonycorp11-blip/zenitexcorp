import { CELL, TILE } from '../core/constants';
import { DRILLS, ENERGY_LEVELS, HEALTH_LEVELS, SUIT_MODULES } from '../data/equipment';
import type { HazardKey } from '../data/sectors';
import type { Game } from '../Game';

export class Player {
  x = 0; y = 0; vx = 0; vy = 0;
  facing = 1; frame = 0; animT = 0; moving = false;
  hp = 100; energy = 100;
  drillLevel = 0; scannerLevel = 0; energyLevel = 0; healthLevel = 0;
  suit: Record<string, number> = {};   // módulo -> nível (0 = nenhum)
  invuln = 0;
  lastHurtCause = '';
  cargo: { x: number; y: number; items: Record<string, number> } | null = null;
  deaths = 0;
  readonly r = 3.5;

  constructor(private g: Game) {}

  get maxHp() { return HEALTH_LEVELS[this.healthLevel].max; }
  get maxEnergy() { return ENERGY_LEVELS[this.energyLevel].max; }
  get drill() { return DRILLS[this.drillLevel]; }

  protection(h: HazardKey): number {
    let p = 0;
    for (const m of SUIT_MODULES) {
      const lv = this.suit[m.key] ?? 0;
      if (lv > 0 && m.hazards.includes(h)) p = Math.max(p, m.levels[lv - 1].prot);
    }
    return p;
  }

  update(dt: number, mx: number, my: number, run: boolean) {
    const g = this.g;
    const speed = 72 * (run ? 1.35 : 1) * (g.hazards.slow ? 0.7 : 1);
    let ax = mx, ay = my;
    const l = Math.hypot(ax, ay);
    if (l > 1) { ax /= l; ay /= l; }
    this.moving = l > 0.1;
    const drift = g.hazards.drift;
    this.vx = ax * speed + drift[0];
    this.vy = ay * speed + drift[1];
    this.moveAxis(this.vx * dt, 0);
    this.moveAxis(0, this.vy * dt);
    if (this.moving) {
      this.animT += dt * (run ? 12 : 9);
      this.frame = Math.floor(this.animT) % 4 === 1 ? 1 : Math.floor(this.animT) % 4 === 3 ? 2 : 0;
      if (Math.abs(ax) > Math.abs(ay)) this.facing = ax > 0 ? 0 : 2; else this.facing = ay > 0 ? 1 : 3;
    } else this.frame = 0;
    // energia regenera devagar; rápido perto da base / geradores
    const nearPower = g.nearPowerSource(this.x, this.y);
    this.energy = Math.min(this.maxEnergy, this.energy + dt * (nearPower ? 25 : 2.2));
    if (nearPower) this.hp = Math.min(this.maxHp, this.hp + dt * 4);
    this.invuln -= dt;
    // líquido sob os pés
    const liq = g.world.liquidUnder(this.x, this.y);
    if (liq) this.hurt(20 * dt, 'líquido');
    g.world.reveal(this.x, this.y, 9 + g.player.scannerLevel);
  }

  private moveAxis(dx: number, dy: number) {
    const w = this.g.world;
    const nx = this.x + dx, ny = this.y + dy;
    const r = this.r;
    const pts: [number, number][] = [[nx - r, ny - 1], [nx + r, ny - 1], [nx - r, ny + 2], [nx + r, ny + 2], [nx, ny - 3], [nx, ny + 3]];
    for (const [px, py] of pts) {
      if (w.blockedPx(px, py)) return;
      const m = this.g.machines.at(Math.floor(px / TILE), Math.floor(py / TILE));
      if (m && this.blocksWalk(m.def.behavior)) return;
    }
    this.x = nx; this.y = ny;
  }

  private blocksWalk(b: string) {
    return !(b === 'belt' || b === 'platform' || b === 'lamp' || b === 'support' || b === 'splitter' || b === 'lift' || b === 'surge' || b === 'pad' || b === 'launchpad');
  }

  hurt(n: number, cause: string) {
    if (n <= 0 || this.g.flags.godMode) return;
    this.hp -= n;
    this.lastHurtCause = cause;
    if (n > 3) { this.g.fx.blood(this.x, this.y - 6); this.g.ui.hurtFlash(); }
    if (this.hp <= this.maxHp * 0.25 && this.hp + n > this.maxHp * 0.25) this.g.say('low_health', 30);
    if (this.hp <= 0) this.die();
  }

  die() {
    const g = this.g;
    this.deaths++;
    g.stats.deaths++;
    // a carga fica no local
    const items = { ...g.pack.items };
    if (Object.keys(items).length) {
      this.cargo = { x: this.x, y: this.y, items };
      g.pack.items = {};
      g.toast('Sua carga ficou no local da morte. Recupere-a (marcada no mapa).', '#ffb04a');
    }
    const [bx, by] = g.basePos();
    this.x = bx; this.y = by;
    this.hp = this.maxHp; this.energy = this.maxEnergy;
    this.invuln = 3;
    g.ui.deathFlash(this.lastHurtCause);
    g.say('death');
    g.audio.death();
  }

  serialize() { return { x: this.x, y: this.y, hp: this.hp, energy: this.energy, drillLevel: this.drillLevel, scannerLevel: this.scannerLevel, energyLevel: this.energyLevel, healthLevel: this.healthLevel, suit: this.suit, cargo: this.cargo, deaths: this.deaths }; }
  load(s: any) { Object.assign(this, s); }
}

export const CELL_PX = CELL;
