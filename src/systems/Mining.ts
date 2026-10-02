import { CELL, TILE, WORLD_W, WORLD_TW } from '../core/constants';
import { hash2 } from '../core/rng';
import { MAT, IS_SOLID, IS_LOOSE, GRAIN, GRAIN_ITEM, GRAIN_KG, matById } from '../data/materials';
import { DRILLS } from '../data/equipment';
import { ITEM } from '../data/items';
import { rawOf, gradeAt, KG_PER_UNIT, VEIN_GRADE, MAX_GRADE } from '../data/composition';
import type { Machine } from './Machines';
import type { Game } from '../Game';

export interface Drop { x: number; y: number; k: string; q: number; g?: number; vx: number; vy: number; t: number; }

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
    const dx = ax - p.x, dy = ay - (p.y - 12);
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const maxR = Math.min(dr.range, len + 6);
    // marcha do raio
    let hx = p.x, hy = p.y - 12, hit = false, loose = false;
    for (let d = 4; d <= maxR; d += 1) {
      hx = p.x + ux * d; hy = p.y - 12 + uy * d;
      const cx = Math.floor(hx / CELL), cy = Math.floor(hy / CELL);
      const cm = w.get(cx, cy);
      if (IS_SOLID[cm]) { hit = true; break; }
      if (IS_LOOSE[cm]) { loose = true; break; }
      const m = g.machines.at(Math.floor(hx / TILE), Math.floor(hy / TILE));
      if (m && m.buried > 0) { m.buried = Math.max(0, m.buried - dt * 0.35 * dr.power); hit = true; if (m.buried <= 0) g.toast(`${m.def.name} desenterrada`, '#9cff8a'); break; }
    }
    this.hitX = hx; this.hitY = hy; this.hitting = true;
    p.energy = Math.max(0, p.energy - dr.energy * dt * (hit ? 0.25 : 0.05));
    // aspirador do traje: puxa os grãos soltos perto do ponto de impacto para a mochila
    this.vacuum(dt, hx, hy, dr.radius + 3);
    if (!hit || loose) return;
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
    const power = dr.power * 6 * (1 + g.research.eff('mineSpeed')) * dt;
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
      else this.cracks.set(y * WORLD_W + x, g.time);
    }
    // efeitos
    const col = def.top;
    g.fx.debris(hx, hy, col, -ux, -uy, 3);
    g.fx.sparks(hx, hy, [255, 200, 120], 2);
    g.shake(0.6);
    this.sfxT -= dt;
    if (this.sfxT <= 0) { g.audio.tick(def.sound, 0.5); this.sfxT = 0.09; }
  }

  private vacAcc = 0;
  private vacuum(dt: number, hx: number, hy: number, R: number) {
    const g = this.g, w = g.world;
    this.vacAcc += dt * (60 + g.player.drillLevel * 30);
    if (this.vacAcc < 1) return;
    let budget = Math.floor(this.vacAcc); this.vacAcc -= budget;
    const cx = Math.floor(hx / CELL), cy = Math.floor(hy / CELL), r = Math.ceil(R);
    for (let j = r; j >= -r && budget > 0; j--) for (let i = -r; i <= r && budget > 0; i++) {
      if (i * i + j * j > R * R) continue;
      const x = cx + i, y = cy + j, m = w.get(x, y);
      if (!IS_LOOSE[m]) continue;
      const item = GRAIN_ITEM[m]; if (!item) continue;
      const q = item === 'bloco_massa' ? 1 : GRAIN_KG;
      const got = g.pack.add(item, q, w.aux[y * WORLD_W + x] / 40);
      if (got < q - 1e-6) { if (got > 0) g.pack.take(item, got); g.say('pack_full', 90); if (this.hardWarnT <= 0) { g.toast('Mochila cheia: entregue na cápsula [E]', '#ffd04a'); this.hardWarnT = 4; } budget = 0; break; }
      w.set(x, y, MAT.AIR);
      budget--;
      this.collected(item, q, x, y);
    }
  }

  /** um grão chegou à mochila */
  private collected(item: string, q: number, x: number, y: number) {
    const g = this.g;
    g.stats.mined[item] = (g.stats.mined[item] ?? 0) + q;
    if (ITEM[item]?.cat === 'bruto') g.stats.manualKg += q;
    g.contracts.onMine(item, q);
    const md = GRAIN[item] !== undefined ? matById(GRAIN[item]) : null;
    if (md?.glow && ['lumenita_pura', 'nexolita_condensada', 'pyroxis_volatil', 'lumenita_instavel', 'fragmento_nucleo'].includes(item)) {
      const bonus = Math.round(q * (ITEM[item]?.value ?? 10) * 2);
      g.stock.credits += bonus;
      g.fx.text(x * CELL + 2, y * CELL - 10, `+${bonus} ◆ RARO`, [255, 220, 90]);
      g.audio.discover();
    } else if (Math.random() < 0.08) g.fx.pickup(x * CELL + 2, y * CELL + 2, item, q);
    if (!g.flags.firstOre) { g.flags.firstOre = true; g.say('first_ore'); }
  }

  /** Remove uma célula do terreno: material bruto da camada (com o teor da região), raros, regeneração. */
  removeCell(x: number, y: number, cause: 'player' | 'drill' | 'robot' | 'explosive' | 'event', mult: number, machine?: Machine): { item?: string; kg: number; grade?: number } {
    const g = this.g, w = g.world;
    const mat = w.get(x, y);
    const def = matById(mat);
    if (!IS_SOLID[mat] || def.kind === 'edge') return { kg: 0 };
    // jogador e explosivos soltam a célula como grão (cai, amontoa, é aspirado); máquinas recolhem direto
    const toGrain = cause === 'player' || cause === 'explosive' || cause === 'event';
    w.set(x, y, MAT.AIR);
    this.cracks.delete(y * WORLD_W + x);
    // escavar não remove massa do planeta: ela só conta quando é separada ou exportada
    g.planet.dig(mult);
    g.stats.cells++;
    g.lore.onCellRemoved(x, y, cause);
    if (def.regrow) w.regrowQueue.push({ x, y, m: mat, t: g.time + 90 + Math.random() * 120 });
    if (def.rare && def.item) {
      if (toGrain && GRAIN[def.item] !== undefined) { g.planet.addUnits(mult); w.set(x, y, GRAIN[def.item], 40); if (cause === 'player') this.revealRares(x, y); return { item: def.item, kg: GRAIN_KG }; }
      return this.rareCell(x, y, def.item, (def.yieldKg ?? 1) * mult, mult, cause, machine);
    }
    // material bruto da camada: veios visíveis têm teor muito maior
    const item = rawOf(g.planet.layer);
    const kg = KG_PER_UNIT * mult;
    let grade = gradeAt(w.gen.seed, g.planet.layer, x, y) * (def.kind === 'ore' ? VEIN_GRADE : 1);
    if (cause === 'player') grade *= 1 + g.research.eff('oreBonus');
    grade = Math.min(MAX_GRADE, grade);
    if (toGrain) {
      // a célula vira um grão do material bruto da camada, com o teor do lugar
      w.set(x, y, GRAIN[item], Math.min(255, Math.round(grade * 40)));
      if (cause === 'player' && def.kind === 'ore') this.announce(x, y, mat);
    } else if (cause === 'drill' && machine) {
      g.machines.drillYield(machine, item, kg, grade);
    }
    if (cause === 'player') this.revealRares(x, y);
    return { item, kg, grade };
  }

  /** Variantes raras: mineral puro, sem resíduo — recompensa imediata da mineração de precisão. */
  private rareCell(x: number, y: number, item: string, kg: number, mult: number, cause: string, machine?: Machine): { item?: string; kg: number } {
    const g = this.g;
    g.planet.addUnits(mult);
    if (cause === 'player') {
      kg *= 1 + g.research.eff('oreBonus');
      const got = g.pack.add(item, kg);
      g.stats.mined[item] = (g.stats.mined[item] ?? 0) + kg;
      const bonus = Math.round(kg * (ITEM[item]?.value ?? 10) * 2);
      g.stock.credits += bonus;
      g.fx.text(x * CELL + 2, y * CELL - 10, `+${bonus} ◆ RARO`, [255, 220, 90]);
      g.contracts.onMine(item, kg);
      if (got < kg - 0.01) {
        this.spawnDrop(x * CELL + 2, y * CELL + 2, item, kg - got);
        if (ITEM[item].contain && g.pack.specialCap(ITEM[item].contain!) <= 0) g.say('need_containment', 60);
        else g.say('pack_full', 90);
      } else g.fx.pickup(x * CELL + 2, y * CELL + 2, item, kg);
      this.revealRares(x, y);
    } else if (cause === 'drill' && machine) g.machines.drillYield(machine, item, kg);
    else if (cause === 'explosive' || cause === 'event') this.spawnDrop(x * CELL + 2, y * CELL + 2, item, kg);
    return { item, kg };
  }

  private announce(x: number, y: number, mat: number) {
    const key = `${mat}_${x >> 4}_${y >> 4}`;
    if (this.announced.has(key)) return;
    this.announced.add(key);
    const g = this.g;
    g.fx.text(x * CELL + 2, y * CELL - 10, 'VEIO: teor alto', [255, 220, 120]);
  }

  /** revelação de variantes raras ao redor */
  private revealRares(x: number, y: number) {
    const g = this.g, w = g.world;
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

  spawnDrop(px: number, py: number, k: string, q: number, grade?: number) {
    if (q <= 0.01) return;
    // agrupa com drop próximo do mesmo item
    for (const d of this.drops) if (d.k === k && Math.abs(d.x - px) < 10 && Math.abs(d.y - py) < 10) { d.g = ((d.g ?? 1) * d.q + (grade ?? 1) * q) / (d.q + q); d.q += q; return; }
    this.drops.push({ x: px, y: py, k, q, g: grade, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, t: 0 });
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
        const got = g.pack.add(d.k, d.q, d.g);
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
      if (w.get(r.x, r.y) === MAT.AIR && !w.occ[Math.floor(py / TILE) * WORLD_TW + Math.floor(px / TILE)]) {
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
