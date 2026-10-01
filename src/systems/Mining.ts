import { CELL, TILE, WORLD_CELLS } from '../core/constants';
import { hash2 } from '../core/rng';
import { MAT, IS_SOLID, matById } from '../data/materials';
import { DRILLS } from '../data/equipment';
import { ITEM } from '../data/items';
import { SECTORS } from '../data/sectors';
import type { Machine } from './Machines';
import type { Game } from '../Game';

export interface Drop { x: number; y: number; k: string; q: number; vx: number; vy: number; t: number; }

/** Mineração manual, explosivos e o ponto central de remoção de células. */
export class Mining {
  hitX = 0; hitY = 0; hitting = false; hitMat = 0;
  cracks = new Map<number, number>();   // índice de célula -> tempo
  drops: Drop[] = [];
  private announced = new Set<string>();
  private hardWarnT = 0;
  private sfxT = 0;
  explosives: { x: number; y: number; t: number }[] = [];

  constructor(private g: Game) {}

  get drill() { return DRILLS[this.g.player.drillLevel]; }

  /** Atualiza o feixe do jogador. */
  updatePlayer(dt: number, active: boolean, ax: number, ay: number) {
    const g = this.g, p = g.player, w = g.world;
    this.hitting = false;
    this.hardWarnT -= dt;
    if (!active) return;
    const dr = this.drill;
    if (p.energy <= 0.5) { if (this.hardWarnT <= 0) { g.toast('Energia do traje esgotada', '#ff6a3a'); this.hardWarnT = 3; } return; }
    const dx = ax - p.x, dy = ay - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const maxR = Math.min(dr.range, len + 6);
    // marcha do raio
    let hx = p.x, hy = p.y - 4, hit = false;
    for (let d = 4; d <= maxR; d += 1) {
      hx = p.x + ux * d; hy = p.y - 4 + uy * d;
      const cx = Math.floor(hx / CELL), cy = Math.floor(hy / CELL);
      if (IS_SOLID[w.get(cx, cy)]) { hit = true; break; }
      const m = g.machines.at(Math.floor(hx / TILE), Math.floor(hy / TILE));
      if (m && m.buried > 0) { m.buried = Math.max(0, m.buried - dt * 0.35 * dr.power); hit = true; if (m.buried <= 0) g.toast(`${m.def.name} desenterrada`, '#9cff8a'); break; }
    }
    this.hitX = hx; this.hitY = hy; this.hitting = true;
    p.energy = Math.max(0, p.energy - dr.energy * dt * (hit ? 1 : 0.3));
    if (!hit) return;
    const cx = Math.floor(hx / CELL), cy = Math.floor(hy / CELL);
    const mat = w.get(cx, cy);
    this.hitMat = mat;
    const def = matById(mat);
    if (def.tier > dr.tier) {
      g.fx.sparks(hx, hy, [255, 220, 160], 2);
      if (this.hardWarnT <= 0) {
        g.toast(`${def.name}: exige perfurador classe ${def.tier >= 99 ? '∞' : def.tier}`, '#ff8a3a');
        if (def.kind === 'barrier' || def.tier > dr.tier) g.say('too_hard', 40);
        this.hardWarnT = 4;
      }
      g.audio.tick('metal', 0.3);
      return;
    }
    const power = dr.power * 2.4 * (1 + g.research.eff('mineSpeed')) * dt;
    const R = dr.radius;
    const r0 = Math.ceil(R);
    for (let j = -r0; j <= r0; j++) for (let i = -r0; i <= r0; i++) {
      const d2 = i * i + j * j;
      if (d2 > R * R) continue;
      const x = cx + i, y = cy + j;
      const m2 = w.get(x, y);
      if (!IS_SOLID[m2]) continue;
      if (matById(m2).tier > dr.tier) continue;
      const fall = 1 - Math.sqrt(d2) / (R + 0.6);
      if (w.damage(x, y, power * fall)) this.removeCell(x, y, 'player', 1);
      else this.cracks.set(y * WORLD_CELLS + x, g.time);
    }
    // efeitos
    const col = def.top;
    g.fx.debris(hx, hy, col, -ux, -uy, 3);
    g.fx.sparks(hx, hy, [255, 200, 120], 2);
    g.shake(0.6);
    this.sfxT -= dt;
    if (this.sfxT <= 0) { g.audio.tick(def.sound, 0.5); this.sfxT = 0.09; }
  }

  /** Remove uma célula do terreno: massa, itens, descobertas e regeneração. */
  removeCell(x: number, y: number, cause: 'player' | 'drill' | 'robot' | 'explosive' | 'event', mult: number, machine?: Machine): { item?: string; kg: number } {
    const g = this.g, w = g.world;
    const mat = w.get(x, y);
    const def = matById(mat);
    if (!IS_SOLID[mat] || def.kind === 'edge') return { kg: 0 };
    w.set(x, y, MAT.AIR);
    this.cracks.delete(y * WORLD_CELLS + x);
    // cada célula vale 1 unidade da meta da camada (máquinas valem `mult`)
    g.planet.addUnits(mult);
    if (cause === 'player') g.stats.manualKg += def.massT * 1000;
    g.stats.cells++;
    g.lore.onCellRemoved(x, y, cause);
    if (def.regrow) w.regrowQueue.push({ x, y, m: mat, t: g.time + 90 + Math.random() * 120 });
    let kg = 0;
    let item = def.item;
    // perfuradoras atravessam uma coluna inteira: rocha estéril ainda rende traços do minério do setor
    if (!item && cause === 'drill' && def.kind === 'rock') {
      const sd = SECTORS[(w.sectorAtPx(x * CELL, y * CELL) || 1) - 1];
      const common = sd.ores.filter(o => !matById(o.mat).rare);
      let tw = 0; for (const o of common) tw += o.weight;
      let r = Math.random() * tw;
      for (const o of common) { r -= o.weight; if (r <= 0) { item = matById(o.mat).item; break; } }
      if (item) { g.machines.drillYield(machine!, item, 1.5 * mult); }
      return { item, kg: 1.5 * mult };
    }
    if (item) {
      kg = (def.yieldKg ?? 1) * mult;
      if (cause === 'player') {
        kg *= 1 + g.research.eff('oreBonus');
        const got = g.pack.add(item, kg);
        g.stats.mined[item] = (g.stats.mined[item] ?? 0) + kg;
        if (def.rare) {
          // veio raro: recompensa imediata e visível
          const bonus = Math.round(kg * (ITEM[item]?.value ?? 10) * 2);
          g.stock.credits += bonus;
          g.fx.text(x * CELL + 2, y * CELL - 10, `+${bonus} ◆ RARO`, [255, 220, 90]);
        }
        g.contracts.onMine(item, kg);
        if (got < kg - 0.01) {
          this.spawnDrop(x * CELL + 2, y * CELL + 2, item, kg - got);
          if (ITEM[item].contain && g.pack.specialCap(ITEM[item].contain!) <= 0) g.say('need_containment', 60);
          else g.say('pack_full', 90);
        } else g.fx.pickup(x * CELL + 2, y * CELL + 2, item, kg);
        if (!g.flags.firstOre) { g.flags.firstOre = true; g.say('first_ore'); }
      } else if (cause === 'drill' && machine) {
        g.machines.drillYield(machine, item, kg);
      } else if (cause === 'explosive' || cause === 'event') {
        this.spawnDrop(x * CELL + 2, y * CELL + 2, item, kg * 0.7);
      }
    }
    // revelação de variantes raras ao redor
    if (cause === 'player') {
      for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nm = w.get(x + i, y + j);
        const nd = matById(nm);
        if (nd.rare || nd.regrow) {
          const key = `${nm}_${(x + i) >> 4}_${(y + j) >> 4}`;
          if (!this.announced.has(key)) {
            this.announced.add(key);
            g.ui.flashName(nd.name, nd.glow ?? nd.top);
            g.audio.discover();
            if (nd.rare) g.say('rare_found', 30);
            g.stats.rares++;
          }
        }
      }
    }
    return { item, kg };
  }

  spawnDrop(px: number, py: number, k: string, q: number) {
    if (q <= 0.01) return;
    // agrupa com drop próximo do mesmo item
    for (const d of this.drops) if (d.k === k && Math.abs(d.x - px) < 10 && Math.abs(d.y - py) < 10) { d.q += q; return; }
    this.drops.push({ x: px, y: py, k, q, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, t: 0 });
  }

  throwExplosive(tx: number, ty: number) {
    const g = this.g, p = g.player;
    if (g.pack.count('explosivo') < 1) { g.toast('Sem cargas explosivas', '#ff6a3a'); return; }
    g.pack.take('explosivo', 1);
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1;
    const r = Math.min(d, 90);
    this.explosives.push({ x: p.x + (dx / d) * r, y: p.y + (dy / d) * r, t: 2.2 });
    g.audio.click();
  }

  update(dt: number) {
    const g = this.g, p = g.player, w = g.world;
    // explosivos
    for (let i = this.explosives.length - 1; i >= 0; i--) {
      const e = this.explosives[i];
      e.t -= dt;
      if (e.t <= 0) { this.explosives.splice(i, 1); this.detonate(e.x, e.y); }
    }
    // drops: magnetismo até o jogador
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t += dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.vx *= 0.9; d.vy *= 0.9;
      const dx = p.x - d.x, dy = p.y - d.y, dist = Math.hypot(dx, dy);
      if (dist < 40 && d.t > 0.4 && g.pack.room(d.k) > 0.5) { d.vx += (dx / dist) * 300 * dt; d.vy += (dy / dist) * 300 * dt; }
      if (dist < 8) {
        const got = g.pack.add(d.k, d.q);
        if (got > 0) { g.fx.pickup(d.x, d.y, d.k, got); d.q -= got; }
        if (d.q <= 0.01) this.drops.splice(i, 1);
      }
    }
    // rachaduras somem
    for (const [k, t] of this.cracks) if (g.time - t > 3) { this.cracks.delete(k); w.dmg[k] = 0; }
    // regeneração de necrocristais
    const q = w.regrowQueue;
    for (let i = q.length - 1; i >= 0; i--) {
      const r = q[i];
      if (g.time < r.t) continue;
      q.splice(i, 1);
      const px = r.x * CELL, py = r.y * CELL;
      if (g.hazards.inhibited(px, py)) continue;
      if (Math.hypot(px - p.x, py - p.y) < 20) { r.t = g.time + 20; q.push(r); continue; }
      if (w.get(r.x, r.y) === MAT.AIR && !w.occ[Math.floor(py / TILE) * (WORLD_CELLS / 4) + Math.floor(px / TILE)]) {
        w.set(r.x, r.y, r.m);
        g.stats.regrown++;
      }
    }
  }

  detonate(x: number, y: number) {
    const g = this.g, w = g.world;
    const R = 5 * (1 + g.research.eff('blastRadius'));
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    for (let j = -Math.ceil(R); j <= R; j++) for (let i = -Math.ceil(R); i <= R; i++) {
      const d = Math.hypot(i, j) + hash2(cx + i, cy + j, 4) * 1.4;
      if (d > R) continue;
      const m = w.get(cx + i, cy + j);
      const def = matById(m);
      if (IS_SOLID[m] && def.tier <= Math.max(3, g.player.drillLevel + 2) && def.kind !== 'edge') this.removeCell(cx + i, cy + j, 'explosive', 1);
    }
    g.fx.explosion(x, y);
    g.shake(8);
    g.audio.boom();
    g.say('explosive', 25);
    g.stats.explosions++;
    // dano a máquinas e jogador
    for (const m of g.machines.list) {
      const [mx, my] = g.machines.centerPx(m);
      if (Math.hypot(mx - x, my - y) < R * CELL + 16) { m.cond = Math.max(0, m.cond - 35); if (m.cond <= 0 && !m.broken) { m.broken = true; g.bus.emit('machine_broken', m); } }
    }
    const pd = Math.hypot(g.player.x - x, g.player.y - y);
    if (pd < R * CELL + 10) g.player.hurt(40 * (1 - pd / (R * CELL + 10)), 'explosão');
    if (Math.random() < 0.25) g.events.caveIn(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 60, false);
  }
}
