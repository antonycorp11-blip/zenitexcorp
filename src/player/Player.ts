import { CELL, TILE, WORLD_PX_W, wrapX } from '../core/constants';
import { DRILLS, ENERGY_LEVELS, HEALTH_LEVELS, SUIT_MODULES } from '../data/equipment';
import type { HazardKey } from '../data/sectors';
import { MAT, IS_BLOCKING } from '../data/materials';
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

  vy0 = 0; grounded = false; jet = 0; boost = 0;
  readonly hw = 4; readonly hh = 15;     // meia largura e altura do corpo (px)

  /** Vista lateral: anda, cai, sobe degraus de areia e voa com o jetpack (consome energia). */
  update(dt: number, mx: number, my: number, run: boolean) {
    const g = this.g;
    const inLiquid = g.world.liquidUnder(this.x, this.y - 4) !== 0;
    const speed = 70 * (run ? 1.35 : 1) * (g.hazards.slow ? 0.7 : 1) * (inLiquid ? 0.6 : 1);
    const ax = Math.max(-1, Math.min(1, mx));
    const want = ax * speed + g.hazards.drift[0];
    this.vx += (want - this.vx) * Math.min(1, dt * (this.grounded ? 14 : 6));
    // jetpack: para cima no joystick / W / espaço
    // celular: botão JATO; teclado: W/↑/Espaço
    // celular: JATO liga o VOO LIVRE (joystick move em qualquer direção, sem gastar energia); teclado: segurar W/Espaço
    const flying = g.input.touch && g.input.jetHeld;
    const jetting = flying || (!g.input.touch && (my < -0.35 || g.input.down(' ')));
    if (flying) {
      // voo livre: acelera quanto mais tempo você segura na mesma direção (até ~3× para subir rápido ao espaço)
      const push = Math.hypot(ax, my) > 0.6;
      this.boost = push ? Math.min(1, this.boost + dt * 0.6) : Math.max(0, this.boost - dt * 2);
      const fs = (170 + 330 * this.boost) * (inLiquid ? 0.6 : 1);
      this.vx += (ax * fs - this.vx) * Math.min(1, dt * 8);
      this.vy += (Math.max(-1, Math.min(1, my)) * fs - this.vy) * Math.min(1, dt * 8);
      this.jet = 0.12;
    } else {
      this.vy += (inLiquid ? 260 : 620) * dt;
      if (jetting) {
        this.vy -= 1450 * dt;
        if (this.vy < -150) this.vy = -150;
        this.jet = 0.12;
      } else this.jet = Math.max(0, this.jet - dt);
    }
    if (my > 0.5 && !jetting) this.vy += 300 * dt;    // descer mais rápido
    if (this.vy > 330) this.vy = 330;
    // topo do mapa (bem acima da Nave): não sai do mundo
    if (this.y < 3 * TILE && this.vy < 0) { this.vy = 0; this.y = 3 * TILE; }
    this.moveX(this.vx * dt);
    this.grounded = false;
    this.moveY(this.vy * dt);
    this.moving = Math.abs(ax) > 0.1;
    if (this.moving) {
      this.animT += dt * (run ? 12 : 9);
      this.frame = this.grounded ? 1 + (Math.floor(this.animT) % 4) : 5;
      this.facing = ax > 0 ? 0 : 2;
    } else this.frame = this.grounded ? 0 : 5;
    // mirando com o perfurador, o corpo vira para o alvo
    if (g.mining.hitting) this.facing = g.mining.hitX >= this.x ? 0 : 2;
    else if (g.mining.blowing) this.facing = g.input.worldX >= this.x ? 0 : 2;
    // energia recarrega no chão; muito rápido perto da base
    const nearPower = g.nearPowerSource(this.x, this.y);
    if (this.grounded || nearPower) this.energy = Math.min(this.maxEnergy, this.energy + dt * (nearPower ? 30 : 14));
    if (nearPower) this.hp = Math.min(this.maxHp, this.hp + dt * 4);
    this.invuln -= dt;
    const liq = g.world.liquidUnder(this.x, this.y - 2);
    if (liq) this.hurt((g.world.get(Math.floor(this.x / CELL), Math.floor((this.y - 2) / CELL)) === MAT.WATER ? 0 : 20) * dt, 'líquido');
    g.world.reveal(this.x, this.y, 9 + g.player.scannerLevel);
  }

  /** o corpo colide nesta posição? (terreno, grãos) */
  private hits(px: number, py: number): boolean {
    const w = this.g.world;
    const x0 = Math.floor((px - this.hw) / CELL), x1 = Math.floor((px + this.hw - 0.01) / CELL);
    const y0 = Math.floor((py - this.hh) / CELL), y1 = Math.floor((py - 0.01) / CELL);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (IS_BLOCKING[w.get(x, y)]) return true;
    return false;
  }
  /** topo de máquina sob os pés (plataforma de mão única) */
  private onMachineTop(px: number, oldY: number, newY: number): number | null {
    for (const sx of [px - this.hw + 1, px + this.hw - 1]) {
      const tx = Math.floor(sx / TILE);
      const ty = Math.floor(newY / TILE);
      const m = this.g.machines.at(tx, ty);
      if (!m) continue;
      const top = m.ty * TILE;
      if (oldY <= top + 0.01 && newY >= top) return top;
    }
    return null;
  }

  private moveX(dx: number) {
    if (!dx) return;
    const steps = Math.ceil(Math.abs(dx) / 2);
    const sx = dx / steps;
    for (let i = 0; i < steps; i++) {
      const nx = this.x + sx;
      if (!this.hits(nx, this.y)) {
        this.x = wrapX(nx, WORLD_PX_W);
        if (nx < 0) this.g.camera.x += WORLD_PX_W;
        else if (nx >= WORLD_PX_W) this.g.camera.x -= WORLD_PX_W;
        continue;
      }
      // degrau: sobe até 3 células (pilhas de areia, bordas)
      let climbed = false;
      for (let up = CELL; up <= 10; up += CELL) {
        if (!this.hits(nx, this.y - up) && !this.hits(this.x, this.y - up)) {
          this.x = wrapX(nx, WORLD_PX_W);
          if (nx < 0) this.g.camera.x += WORLD_PX_W;
          else if (nx >= WORLD_PX_W) this.g.camera.x -= WORLD_PX_W;
          this.y -= up; climbed = true; break;
        }
      }
      if (!climbed) { this.vx = 0; return; }
    }
  }

  private moveY(dy: number) {
    if (!dy) return;
    const steps = Math.ceil(Math.abs(dy) / 2);
    const sy = dy / steps;
    for (let i = 0; i < steps; i++) {
      const ny = this.y + sy;
      if (sy > 0) {
        const top = this.onMachineTop(this.x, this.y, ny);
        if (top !== null) { this.y = top; this.vy = 0; this.grounded = true; return; }
      }
      if (!this.hits(this.x, ny)) { this.y = ny; continue; }
      if (sy > 0) this.grounded = true;
      this.vy = 0;
      return;
    }
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
