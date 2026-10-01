import { TILE } from '../core/constants';
import { SECTORS, type HazardKey, HAZARD_NAMES } from '../data/sectors';
import type { Game } from '../Game';

/** Perigos ambientais no ponto do jogador, considerando máquinas, robôs e traje. */
export class Hazards {
  levels: Partial<Record<HazardKey, number>> = {};   // após mitigação de máquinas
  excess: Partial<Record<HazardKey, number>> = {};   // acima da proteção do traje
  tempC = 20;
  drift: [number, number] = [0, 0];
  slow = false;
  private warnT = 0;
  private t = 0;

  constructor(private g: Game) {}

  /** Nível de um perigo num ponto (0..100). */
  at(px: number, py: number, h: HazardKey): number {
    const g = this.g;
    const s = g.world.sectorAtPx(px, py);
    if (!s) return 0;
    const sd = SECTORS[s - 1];
    let v = sd.hazards[h] ?? 0;
    const rt = g.sectors.rt[s];
    if (h === 'calor') v += rt.stress * 0.8;
    if (v <= 0) return 0;
    v -= rt.fields[h] ?? 0;
    // campos locais
    let local = 0;
    for (const m of g.machines.list) {
      const f = m.def.field;
      if (!f || f.hazard !== h || m.broken || !m.working) continue;
      const [mx, my] = g.machines.centerPx(m);
      const d = Math.hypot(mx - px, my - py) / TILE;
      if (d < (m.def.radius ?? 8)) local = Math.max(local, f.amount * (1 - d / (m.def.radius ?? 8) * 0.4));
    }
    local = Math.max(local, g.robots.hazardField(px, py));
    if (h === 'toxico' || h === 'corrosao') local = Math.max(local, g.robots.hazardField(px, py));
    return Math.max(0, v - local);
  }

  inhibited(px: number, py: number) {
    for (const m of this.g.machines.list) {
      if (m.key !== 'inibidor' || m.broken) continue;
      const [mx, my] = this.g.machines.centerPx(m);
      if (Math.hypot(mx - px, my - py) / TILE < (m.def.radius ?? 14)) return true;
    }
    return false;
  }

  update(dt: number) {
    const g = this.g, p = g.player;
    this.t += dt;
    const s = g.world.sectorAtPx(p.x, p.y);
    const sd = SECTORS[(s || 1) - 1];
    this.levels = {}; this.excess = {};
    let dmg = 0;
    for (const h of Object.keys(sd.hazards) as HazardKey[]) {
      const lv = this.at(p.x, p.y, h);
      this.levels[h] = lv;
      const ex = Math.max(0, lv - p.protection(h));
      if (ex > 0) { this.excess[h] = ex; dmg += ex * 0.07; }
    }
    // temperatura exibida
    const rt = g.sectors.rt[s || 1];
    const cool = (rt.fields.calor ?? 0) + (this.levels.calor !== undefined ? (sd.hazards.calor ?? 0) - (this.levels.calor ?? 0) : 0);
    const warm = (rt.fields.frio ?? 0) + (this.levels.frio !== undefined ? (sd.hazards.frio ?? 0) - (this.levels.frio ?? 0) : 0);
    this.tempC = sd.tempC + rt.stress * 2 - cool * (sd.tempC > 40 ? (sd.tempC - 25) / 60 : 0) + warm * (sd.tempC < 0 ? (25 - sd.tempC) / 60 : 0);
    // gravidade irregular
    const gl = this.levels.gravidade ?? 0;
    const gex = Math.max(0, gl - p.protection('gravidade'));
    if (gex > 0) {
      const a = Math.sin(this.t * 0.4 + p.x * 0.01) * Math.PI * 2;
      this.drift = [Math.cos(a) * gex * 0.9, Math.sin(a) * gex * 0.9];
    } else this.drift = [0, 0];
    this.slow = (this.excess.pressao ?? 0) > 0 || (this.excess.frio ?? 0) > 20;
    if (dmg > 0) {
      p.hurt(dmg * dt, this.dominant() ?? 'ambiente');
      this.warnT -= dt;
      if (this.warnT <= 0) { g.say('hazard_warn', 50); this.warnT = 20; }
    }
  }

  dominant(): string | null {
    let best: HazardKey | null = null, v = 0;
    for (const k of Object.keys(this.levels) as HazardKey[]) if ((this.levels[k] ?? 0) > v) { v = this.levels[k]!; best = k; }
    return best ? HAZARD_NAMES[best] : null;
  }
  dominantKey(): HazardKey | null {
    let best: HazardKey | null = null, v = 0;
    for (const k of Object.keys(this.levels) as HazardKey[]) if ((this.levels[k] ?? 0) > v) { v = this.levels[k]!; best = k; }
    return best;
  }
}
