import { CELL, TILE, TILE_CELLS, WORLD_TILES } from '../core/constants';
import { ROBOT, type RobotKind } from '../data/robots';
import { IS_SOLID, IS_BLOCKING, IS_LIQUID, matById } from '../data/materials';
import { type Bag, bagAdd, bagTotal } from './Inventory';
import type { Machine } from './Machines';
import type { Game } from '../Game';

export interface Robot {
  id: number;
  kind: RobotKind;
  name: string;
  x: number; y: number;
  sector: number;
  zx: number; zy: number; zr: number;  // zona (px, tiles)
  energy: number; cond: number;
  state: string;
  cargo: Bag;
  path: [number, number][];
  task: string;
  target?: { x: number; y: number; m?: number; cell?: [number, number] };
  stuck: boolean; broken: boolean;
  priority?: string;
  repT: number;
  frame: number;
  thinkT: number;
  workT: number;
}

const WALK_BLOCK = new Set(['belt', 'platform', 'lamp', 'support', 'splitter', 'lift', 'surge', 'pad', 'launchpad']);

export class Robots {
  list: Robot[] = [];
  nextId = 1;
  private acc = 0;

  constructor(private g: Game) {}

  build(kind: RobotKind, at: Machine): Robot | string {
    const def = ROBOT[kind];
    if (!this.g.research.has(def.research)) return 'Pesquisa necessária';
    if (!this.g.stock.pay(def.cost, this.g.pack.items)) return 'Recursos insuficientes';
    const [x, y] = this.g.machines.centerPx(at);
    const firstCarry = kind === 'carry' && !this.list.some(r => r.kind === 'carry');
    const r: Robot = {
      id: this.nextId++, kind, name: firstCarry ? 'KILO' : `${def.name.split(' ')[0]}-${String(this.nextId).padStart(2, '0')}`,
      x, y: y + TILE * 2, sector: at.sector, zx: x, zy: y, zr: 22, energy: 100, cond: 100, state: 'Iniciando', cargo: {},
      path: [], task: 'idle', stuck: false, broken: false, repT: 0, frame: 0, thinkT: 0, workT: 0,
    };
    this.list.push(r);
    this.g.stats.robots++;
    this.g.bus.emit('robot_built', r);
    return r;
  }

  hazardField(px: number, py: number): number {
    let v = 0;
    for (const r of this.list) if (r.kind === 'hazard' && !r.broken && !r.stuck && r.energy > 0) {
      const d = Math.hypot(r.x - px, r.y - py) / TILE;
      if (d < 8) v = Math.max(v, 35);
    }
    return v;
  }

  walkableTile(tx: number, ty: number): boolean {
    const w = this.g.world;
    if (tx < 0 || ty < 0 || tx >= WORLD_TILES || ty >= WORLD_TILES) return false;
    const i = ty * WORLD_TILES + tx;
    const id = w.occ[i];
    if (id) { const m = this.g.machines.byId.get(id); if (m && !WALK_BLOCK.has(m.def.behavior)) return false; }
    const plat = w.platform[i];
    for (let y = 0; y < TILE_CELLS; y += 1) for (let x = 0; x < TILE_CELLS; x += 1) {
      const m = w.get(tx * TILE_CELLS + x, ty * TILE_CELLS + y);
      if (IS_BLOCKING[m] && !(plat && IS_LIQUID[m])) return false;
    }
    return true;
  }

  /** BFS na grade de tiles. goal(tx,ty) define o destino. */
  path(r: Robot, goal: (tx: number, ty: number) => boolean, maxR = 46): [number, number][] | null {
    const sx = Math.floor(r.x / TILE), sy = Math.floor(r.y / TILE);
    const size = maxR * 2 + 1;
    const prev = new Int32Array(size * size).fill(-1);
    const ox = sx - maxR, oy = sy - maxR;
    const q: number[] = [];
    const start = maxR * size + maxR;
    prev[start] = start;
    q.push(start);
    let head = 0;
    while (head < q.length && head < 6000) {
      const cur = q[head++];
      const cx = (cur % size) + ox, cy = Math.floor(cur / size) + oy;
      if (goal(cx, cy)) {
        const out: [number, number][] = [];
        let c = cur;
        while (c !== start) { out.push([(c % size) + ox, Math.floor(c / size) + oy]); c = prev[c]; }
        return out.reverse();
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        const lx = nx - ox, ly = ny - oy;
        if (lx < 0 || ly < 0 || lx >= size || ly >= size) continue;
        const ni = ly * size + lx;
        if (prev[ni] >= 0) continue;
        prev[ni] = cur;
        if (!goal(nx, ny) && !this.walkableTile(nx, ny)) continue;
        q.push(ni);
      }
    }
    return null;
  }

  update(dt: number) {
    for (const r of this.list) this.move(r, dt);
    this.acc += dt;
    if (this.acc < 0.2) return;
    const step = this.acc; this.acc = 0;
    for (const m of this.g.machines.list) m.loaders = 0;
    for (const r of this.list) this.think(r, step);
  }

  private move(r: Robot, dt: number) {
    if (!r.path.length || r.stuck || r.broken || r.energy <= 0) return;
    const def = ROBOT[r.kind];
    const [tx, ty] = r.path[0];
    const px = tx * TILE + TILE / 2, py = ty * TILE + TILE / 2;
    const dx = px - r.x, dy = py - r.y, d = Math.hypot(dx, dy);
    const sp = def.speed * dt * (1 + this.g.research.eff('robotSpeed'));
    if (d <= sp) { r.x = px; r.y = py; r.path.shift(); }
    else { r.x += (dx / d) * sp; r.y += (dy / d) * sp; }
    r.frame += dt * 8;
  }

  private think(r: Robot, dt: number) {
    const g = this.g;
    const def = ROBOT[r.kind];
    if (r.broken) { r.state = 'QUEBRADO — reparo manual'; return; }
    if (r.stuck) { r.state = 'PRESO — resgate manual'; return; }
    r.energy = Math.max(0, r.energy - def.energyUse * (1 + g.research.eff('robotEnergy')) * dt / 60);
    r.cond = Math.max(0, r.cond - def.wear * (1 + g.research.eff('robotWear')) * dt / 60);
    if (r.cond <= 0) { r.broken = true; g.bus.emit('robot_broken', r); return; }
    if (r.energy <= 0) { r.state = 'Sem energia — recarregue (E)'; r.path = []; return; }
    r.sector = g.world.sectorAtPx(r.zx, r.zy) || r.sector;
    // recarga: centro robótico próximo
    const rc = this.nearest(r, m => m.def.behavior === 'robotics' && !m.broken, 50);
    if (r.energy < 18 && rc) {
      const [mx, my] = g.machines.centerPx(rc);
      if (Math.hypot(mx - r.x, my - r.y) < TILE * 3) { r.energy = Math.min(100, r.energy + 30 * dt); r.state = 'Recarregando'; r.path = []; return; }
      if (!r.path.length) this.goNear(r, rc);
      r.state = 'Indo recarregar';
      return;
    }
    // robôs ocasionalmente ficam presos — sempre exigem resgate manual
    if (Math.random() < 0.0003 * dt * (r.kind === 'miner' ? 1.5 : 1) / Math.max(1, Math.sqrt(this.list.length / 4))) {
      r.stuck = true; g.bus.emit('robot_stuck', r); return;
    }
    r.thinkT -= dt;
    switch (r.kind) {
      case 'scout': return this.scout(r);
      case 'miner': return this.miner(r, dt);
      case 'carry': return this.carry(r);
      case 'repair': return this.repairBot(r, dt);
      case 'survey': return this.survey(r, dt);
      case 'hazard': if (!r.path.length && Math.hypot(r.x - r.zx, r.y - r.zy) > TILE * 2) this.goTo(r, r.zx, r.zy); r.state = 'Campo de mitigação ativo'; return;
      case 'loader': return this.loader(r);
    }
  }

  private inZone(r: Robot, tx: number, ty: number) { return Math.hypot(tx * TILE - r.zx, ty * TILE - r.zy) / TILE <= r.zr; }

  private nearest(r: Robot, f: (m: Machine) => boolean, maxTiles = 999): Machine | undefined {
    let best: Machine | undefined, bd = 1e9;
    for (const m of this.g.machines.list) {
      if (!f(m)) continue;
      const [mx, my] = this.g.machines.centerPx(m);
      const d = Math.hypot(mx - r.x, my - r.y);
      if (d < bd && d / TILE <= maxTiles) { bd = d; best = m; }
    }
    return best;
  }

  private adjacentTo(m: Machine, tx: number, ty: number) {
    return tx >= m.tx - 1 && tx <= m.tx + m.def.w && ty >= m.ty - 1 && ty <= m.ty + m.def.h && !(tx >= m.tx && tx < m.tx + m.def.w && ty >= m.ty && ty < m.ty + m.def.h);
  }
  private goNear(r: Robot, m: Machine) { const p = this.path(r, (x, y) => this.adjacentTo(m, x, y)); if (p) r.path = p; else r.state = 'Sem rota'; return !!p; }
  private goTo(r: Robot, px: number, py: number) { const gx = Math.floor(px / TILE), gy = Math.floor(py / TILE); const p = this.path(r, (x, y) => Math.abs(x - gx) <= 1 && Math.abs(y - gy) <= 1); if (p) r.path = p; return !!p; }
  private near(r: Robot, m: Machine) { const tx = Math.floor(r.x / TILE), ty = Math.floor(r.y / TILE); return this.adjacentTo(m, tx, ty) || (tx >= m.tx && tx < m.tx + m.def.w && ty >= m.ty && ty < m.ty + m.def.h); }

  private deliver(r: Robot): boolean {
    const st = this.nearest(r, m => (m.def.behavior === 'storage' || m.def.behavior === 'link' || m.def.behavior === 'command') && m.sector === r.sector && !m.broken, 80);
    if (!st) { r.state = 'Sem armazém no setor'; return false; }
    if (this.near(r, st)) {
      for (const k of Object.keys(r.cargo)) {
        if (!this.g.machines.accept(st, k, r.cargo[k])) { r.state = 'Armazém cheio'; return false; }
        delete r.cargo[k];
      }
      r.state = 'Carga entregue';
      if (r.name === 'KILO' && Math.random() < 0.08) this.g.say('kilo_banter', 120);
      return true;
    }
    if (!r.path.length) this.goNear(r, st);
    r.state = 'Entregando carga';
    return false;
  }

  private scout(r: Robot) {
    const g = this.g;
    g.world.reveal(r.x, r.y, 6);
    if (r.path.length) { r.state = 'Explorando'; return; }
    const p = this.path(r, (x, y) => this.inZone(r, x, y) && !g.world.explored[y * WORLD_TILES + x] && this.walkableTile(x, y), Math.min(46, r.zr + 6));
    if (p) { r.path = p; r.state = 'Explorando'; }
    else { r.state = 'Zona explorada'; if (Math.hypot(r.x - r.zx, r.y - r.zy) > TILE * 3) this.goTo(r, r.zx, r.zy); }
  }

  private miner(r: Robot, dt: number) {
    const g = this.g, w = g.world;
    const def = ROBOT[r.kind];
    if (bagTotal(r.cargo) >= def.capacity) { this.deliver(r); return; }
    if (r.path.length) return;
    // minerando alvo adjacente
    if (r.target?.cell) {
      const [cx, cy] = r.target.cell;
      const m = w.get(cx, cy);
      const md = matById(m);
      if (!IS_SOLID[m] || !md.item) { r.target = undefined; return; }
      if (Math.hypot(cx * CELL - r.x, cy * CELL - r.y) > TILE * 1.6) { r.target = undefined; return; }
      r.state = 'Extraindo ' + md.name;
      if (w.damage(cx, cy, 0.5 * dt)) {
        const res = g.mining.removeCell(cx, cy, 'robot', 1);
        if (res.item) { bagAdd(r.cargo, res.item, res.kg); g.sectors.counter(r.sector, 'drillOut', res.kg); }
        r.target = undefined;
      }
      g.fx.sparks(cx * CELL + 2, cy * CELL + 2, [255, 200, 120], 1);
      return;
    }
    if (r.thinkT > 0) return;
    r.thinkT = 1;
    // procura minério comum exposto na zona
    let found: [number, number] | null = null;
    const p = this.path(r, (tx, ty) => {
      if (!this.inZone(r, tx, ty) || !this.walkableTile(tx, ty)) return false;
      for (let a = -1; a <= TILE_CELLS; a++) for (const [cx, cy] of [[tx * TILE_CELLS + a, ty * TILE_CELLS - 1], [tx * TILE_CELLS + a, ty * TILE_CELLS + TILE_CELLS], [tx * TILE_CELLS - 1, ty * TILE_CELLS + a], [tx * TILE_CELLS + TILE_CELLS, ty * TILE_CELLS + a]]) {
        const md = matById(w.get(cx, cy));
        if (md.kind === 'ore' && !md.rare && md.tier <= 3 && (!r.priority || md.item === r.priority)) { found = [cx, cy]; return true; }
      }
      return false;
    }, Math.min(46, r.zr + 4));
    if (p && found) { r.path = p; r.target = { x: 0, y: 0, cell: found }; r.state = 'Indo ao veio'; }
    else { r.state = 'Sem minério comum exposto'; if (bagTotal(r.cargo) > 0) this.deliver(r); }
  }

  private carry(r: Robot) {
    const g = this.g;
    const cap = ROBOT[r.kind].capacity;
    if (bagTotal(r.cargo) >= cap * 0.95) { this.deliver(r); return; }
    if (r.path.length) return;
    if (r.target?.m) {
      const m = g.machines.byId.get(r.target.m);
      if (m && this.near(r, m)) {
        for (const k of Object.keys(m.out)) {
          const room = cap - bagTotal(r.cargo);
          if (room <= 0) break;
          const n = Math.min(room, m.out[k]);
          bagAdd(m.out, k, -n); bagAdd(r.cargo, k, n);
        }
        r.target = undefined;
        if (bagTotal(r.cargo) > 0) this.deliver(r);
        return;
      }
      r.target = undefined;
    }
    // drops no chão
    for (const d of g.mining.drops) {
      if (Math.hypot(d.x - r.x, d.y - r.y) < 10) { const n = Math.min(cap - bagTotal(r.cargo), d.q); bagAdd(r.cargo, d.k, n); d.q -= n; }
    }
    g.mining.drops = g.mining.drops.filter(d => d.q > 0.01);
    if (r.thinkT > 0) return;
    r.thinkT = 1.5;
    const src = this.nearest(r, m => m.sector === r.sector && bagTotal(m.out) >= 15 && m.def.behavior !== 'storage' && this.inZone(r, m.tx, m.ty), r.zr + 10);
    if (src && this.goNear(r, src)) { r.target = { x: 0, y: 0, m: src.id }; r.state = 'Coletando produção'; return; }
    const drop = g.mining.drops.find(d => Math.hypot(d.x - r.zx, d.y - r.zy) / TILE < r.zr);
    if (drop && this.goTo(r, drop.x, drop.y)) { r.state = 'Recolhendo fragmentos'; return; }
    if (bagTotal(r.cargo) > 0) { this.deliver(r); return; }
    r.state = 'Aguardando produção';
  }

  private repairBot(r: Robot, dt: number) {
    const g = this.g;
    if (r.path.length) return;
    if (r.target?.m) {
      const m = g.machines.byId.get(r.target.m);
      if (m && !m.broken && m.cond < 99 && this.near(r, m)) {
        r.repT += dt * 6;
        if (r.repT >= 50) { if (!g.stock.pay({ pecas: 1 })) { r.state = 'Sem Peças de Reposição no estoque'; return; } r.repT = 0; }
        m.cond = Math.min(100, m.cond + 6 * dt);
        r.state = `Reparando ${m.def.name}`;
        g.fx.sparks(r.x + 4, r.y - 4, [120, 200, 255], 1);
        return;
      }
      r.target = undefined;
    }
    if (r.thinkT > 0) return;
    r.thinkT = 2;
    const m = this.nearest(r, x => x.sector === r.sector && !x.broken && x.cond < 60 && this.inZone(r, x.tx, x.ty), r.zr + 10);
    if (m && this.goNear(r, m)) { r.target = { x: 0, y: 0, m: m.id }; r.state = 'Indo reparar'; return; }
    r.state = 'Monitorando';
  }

  private survey(r: Robot, dt: number) {
    const g = this.g;
    r.workT += dt;
    if (r.workT > 6) { r.workT = 0; const n = g.scanner.pulseAt(r.x, r.y, 10, false); if (n) g.sectors.counter(r.sector, 'scans', 1); }
    if (r.path.length) { r.state = 'Varredura'; return; }
    const a = Math.random() * Math.PI * 2, d = Math.random() * r.zr * TILE;
    if (!this.goTo(r, r.zx + Math.cos(a) * d, r.zy + Math.sin(a) * d)) r.state = 'Rota bloqueada';
  }

  private loader(r: Robot) {
    const t = this.nearest(r, m => ['link', 'terminal', 'launchpad'].includes(m.def.behavior) && this.inZone(r, m.tx, m.ty), r.zr + 10);
    if (!t) { r.state = 'Nenhum elevador/terminal na zona'; return; }
    if (this.near(r, t)) { t.loaders++; r.state = `Operando ${t.def.name}`; return; }
    if (!r.path.length) this.goNear(r, t);
    r.state = 'Indo operar';
  }

  /** Ação manual do jogador sobre um robô. */
  manual(r: Robot): string {
    const g = this.g;
    if (r.stuck) { r.stuck = false; g.stats.rescues++; g.say('repaired', 20); return `${r.name} resgatado`; }
    if (r.broken) {
      if (!g.stock.pay({ pecas: 2 }, g.pack.items) && !g.pack.take('kit_reparo', 1)) return 'Precisa de 2 Peças ou 1 Kit de Reparo';
      r.broken = false; r.cond = 100; return `${r.name} reparado`;
    }
    if (r.energy < 99) { r.energy = 100; return `${r.name} recarregado`; }
    return '';
  }

  serialize() { return { nextId: this.nextId, list: this.list.map(r => ({ ...r, path: [], target: undefined })) }; }
  load(s: any) { this.nextId = s.nextId; this.list = s.list; }
}
void IS_SOLID;
