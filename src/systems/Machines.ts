import { LAYER_COUNT } from '../data/sectors';
import { CELL, TILE, TILE_CELLS, WORLD_TILES } from '../core/constants';
import { DIRS } from '../core/math';
import { MACHINE, COMPLEX_LEVELS, TECTONIC_RATE, MANTLE_RATE, COLLECTOR_RATE, type MachineDef } from '../data/machines';
import { MAT, IS_SOLID, IS_LIQUID, matById } from '../data/materials';
import { BRITAVEL_KEYS, ITEM } from '../data/items';
import { REFINE_MAP, RECIPES, RECIPE, type Recipe } from '../data/recipes';
import { SECTORS } from '../data/sectors';
import { type Bag, bagAdd, bagTotal } from './Inventory';
import type { Game } from '../Game';

export const DELIVERY_PAY = 0.5;  // créditos por kg entregue = valor do item × isto
export const LOT = 5;            // kg por lote em esteira
export const BASE_RADIUS = 40;   // tiles: área da base onde armazéns podem ser construídos
const BELT_GAP = 0.5;            // espaçamento mínimo entre lotes
const OUT_CAP = 200;             // kg de saída acumulada antes de travar
const DRILL_DEPTH_MULT = 4;      // cada célula perfurada representa uma pequena coluna de material

export interface BeltLot { k: string; q: number; p: number; }
export interface Machine {
  id: number;
  key: string;
  def: MachineDef;
  tx: number; ty: number; dir: number;
  sector: number;
  cond: number;          // 0..100
  broken: boolean;
  overheat: boolean;
  buried: number;        // 0..1 soterrado
  state: string;
  inb: Bag; out: Bag;
  prog: number;
  level: number;         // complexos: 0..4
  eff: number;           // calibração (complexos/mega): 0.25..1.1
  boost: number;         // calibração opcional de máquinas comuns
  filter?: string;
  recipe?: string;
  belt?: BeltLot[];
  depth: number;         // perfuradoras: camada atual
  exhausted: boolean;
  working: boolean;
  loaders: number;
  charged: boolean;      // canhão
  produced: number;
  rr: number;            // round robin
  t: number;
}

export interface SectorRT {
  gen: number; use: number; ratio: number; demand: number;
  heat: number; cooling: number; stress: number;
  buffer: Bag; bufCap: number;
  linkCap: number; linkFlow: number; linkedTotal: number;
  drillOut: number;
  deepRate: number;  // t/min atual
  fields: Record<string, number>; // redução setorial de perigos
}

export class Machines {
  list: Machine[] = [];
  byId = new Map<number, Machine>();
  nextId = 1;
  shipCap = 0; shipFlow = 0;
  shipList: string[] = [];
  shipped: Bag = {};           // total enviado por item (contratos/quotas)
  private belts: Machine[] = [];
  private acc = 0;

  constructor(private g: Game) {}

  // ---------------- construção ----------------
  canPlace(def: MachineDef, tx: number, ty: number): string | null {
    const w = this.g.world;
    for (let y = 0; y < def.h; y++) for (let x = 0; x < def.w; x++) {
      if (!w.tileFree(tx + x, ty + y, def.onLiquid)) return def.onLiquid ? 'Precisa de líquido ou abismo' : 'Área obstruída';
    }
    const sec = w.sectorAtTile(tx, ty);
    if (!sec) return 'Fora do planeta';
    if (def.behavior === 'storage') {
      const cmd = this.list.find(m => m.def.behavior === 'command');
      if (cmd && Math.hypot(tx - (cmd.tx + 1), ty - (cmd.ty + 1)) > BASE_RADIUS) return `Armazéns só na base (até ${BASE_RADIUS} tiles do Centro de Comando)`;
    }
    if (def.phase9 && !this.g.sectors.certified(sec)) return 'Camada ainda não certificada (fase 8)';
    if (def.sector12 && sec !== LAYER_COUNT) return 'Apenas no Núcleo (última camada)';
    if (def.unique) {
      const k = def.key === 'cortador_planetario' || def.key === 'central_logistica' || def.key === 'comando';
      if (this.list.some(m => m.key === def.key && (k || m.sector === sec))) return 'Limite atingido';
    }
    if (def.key === 'uplink_orbital' && this.count('uplink_orbital') >= 3) return 'Máximo de 3 uplinks';
    if (def.behavior === 'complex' && this.list.filter(m => m.def.behavior === 'complex' && m.sector === sec).length >= 4) return 'Máximo de 4 complexos por setor';
    return null;
  }

  place(key: string, tx: number, ty: number, dir: number, free = false): Machine | null {
    const def = MACHINE[key];
    if (!def) return null;
    if (this.canPlace(def, tx, ty)) return null;
    const m: Machine = {
      id: this.nextId++, key, def, tx, ty, dir: def.rotatable ? dir : 0, sector: this.g.world.sectorAtTile(tx, ty),
      cond: 100, broken: false, overheat: false, buried: 0, state: 'ok', inb: {}, out: {}, prog: 0, level: 0, eff: 1, boost: 1,
      depth: 0, exhausted: false, working: false, loaders: 0, charged: true, produced: 0, rr: 0, t: 0,
    };
    if (def.behavior === 'belt') m.belt = [];
    this.add(m);
    if (def.behavior === 'dronepad') this.g.robots.spawnForPad(m);
    void free;
    return m;
  }

  add(m: Machine) {
    this.list.push(m);
    this.byId.set(m.id, m);
    if (m.belt) this.belts.push(m);
    const w = this.g.world;
    for (let y = 0; y < m.def.h; y++) for (let x = 0; x < m.def.w; x++) {
      const i = (m.ty + y) * WORLD_TILES + m.tx + x;
      if (m.def.behavior === 'platform') w.platform[i] = 1;
      else w.occ[i] = m.id;
    }
  }

  remove(m: Machine) {
    const w = this.g.world;
    for (let y = 0; y < m.def.h; y++) for (let x = 0; x < m.def.w; x++) {
      const i = (m.ty + y) * WORLD_TILES + m.tx + x;
      if (m.def.behavior === 'platform') w.platform[i] = 0;
      else if (w.occ[i] === m.id) w.occ[i] = 0;
    }
    this.list.splice(this.list.indexOf(m), 1);
    this.byId.delete(m.id);
    if (m.def.behavior === 'dronepad') this.g.robots.removeForPad(m);
    if (m.belt) this.belts.splice(this.belts.indexOf(m), 1);
    // devolve conteúdo ao estoque
    for (const k in m.out) this.g.stock.add(k, m.out[k], false);
    for (const k in m.inb) this.g.stock.add(k, m.inb[k], false);
    if (m.belt) for (const l of m.belt) this.g.stock.add(l.k, l.q, false);
  }

  at(tx: number, ty: number): Machine | undefined {
    if (tx < 0 || ty < 0 || tx >= WORLD_TILES || ty >= WORLD_TILES) return undefined;
    const id = this.g.world.occ[ty * WORLD_TILES + tx];
    return id ? this.byId.get(id) : undefined;
  }
  count(key: string, sector?: number) { let n = 0; for (const m of this.list) if (m.key === key && (sector === undefined || m.sector === sector)) n++; return n; }
  countBehavior(b: string, sector?: number) { let n = 0; for (const m of this.list) if (m.def.behavior === b && (sector === undefined || m.sector === sector)) n++; return n; }
  centerPx(m: Machine): [number, number] { return [(m.tx + m.def.w / 2) * TILE, (m.ty + m.def.h / 2) * TILE]; }

  // ---------------- simulação ----------------
  update(dt: number) {
    this.acc += dt;
    const step = 0.1;
    while (this.acc >= step) { this.acc -= step; this.step(step); }
    this.updateBelts(dt);
  }

  private step(dt: number) {
    const g = this.g;
    const rts = g.sectors.rt;
    const wearMult = 1 + g.research.eff('wearMult');
    // reset de agregados
    for (let s = 1; s <= LAYER_COUNT; s++) {
      const r = rts[s];
      r.gen = 0; r.heat = 0; r.cooling = 20; r.bufCap = 0; r.linkCap = 0; r.deepRate = 0; r.fields = {};
      r.use = r.demand; r.demand = 0;
    }
    let shipCap = 0;
    const logBonus = this.count('central_logistica') ? 1.25 : 1;
    // passada 1: geração, capacidade, campos
    for (const m of this.list) {
      const r = rts[m.sector]; if (!r) continue;
      const d = m.def;
      const ok = !m.broken && m.buried <= 0;
      if (d.behavior === 'storage') r.bufCap += d.capacity ?? 0;
      if (d.behavior === 'command') { r.bufCap += 3000; if (ok) r.linkCap += (d.capacity ?? 0) * logBonus; }
      if (d.behavior === 'link') { r.bufCap += 500; if (ok) r.linkCap += (d.capacity ?? 0) * (1 + 0.2 * Math.min(3, m.loaders)) * logBonus * this.condFactor(m); }
      if ((d.behavior === 'terminal' || d.behavior === 'launchpad') && ok) shipCap += (d.capacity ?? 0) * (1 + 0.2 * Math.min(3, m.loaders)) * this.condFactor(m);
      if (d.behavior === 'field' && ok) {
        const f = d.field!;
        r.fields[f.hazard] = Math.min(60, (r.fields[f.hazard] ?? 0) + (f.sectorWide ?? 0));
      }
    }
    this.shipCap = shipCap * (1 + g.research.eff('shipMult'));
    // sem rede de energia: tudo que está construído e inteiro funciona
    for (let s = 1; s <= LAYER_COUNT; s++) { const r = rts[s]; r.ratio = 1; r.gen = 0; r.use = 0; }

    // passada 2: comportamento
    for (const m of this.list) this.behave(m, dt, wearMult);

    for (let s = 1; s <= LAYER_COUNT; s++) rts[s].stress = 0;

    // logística setorial: buffer -> Estoque Central
    for (let s = 1; s <= LAYER_COUNT; s++) {
      const r = rts[s];
      let budget = (r.linkCap / 60) * dt;
      const total = bagTotal(r.buffer);
      let moved = 0;
      if (total > 0 && budget > 0) {
        const frac = Math.min(1, budget / total);
        for (const k of Object.keys(r.buffer)) {
          const n = r.buffer[k] * frac;
          bagAdd(r.buffer, k, -n);
          g.stock.add(k, n);
          // a Zenitex paga pelo minério que chega à base
          g.stock.credits += n * (ITEM[k]?.value ?? 1) * DELIVERY_PAY;
          moved += n;
        }
      }
      r.linkFlow = r.linkFlow * 0.9 + (moved / dt) * 60 * 0.1;
      r.linkedTotal += moved;
      if (moved > 0) { g.sectors.counter(s, 'linked', moved); g.sectors.counter(s, 'delivered', moved); }
    }

    // envio orbital
    let budget = (this.shipCap / 60) * dt, sent = 0;
    for (const k of this.shipList) {
      if (budget <= 0) break;
      const n = g.stock.take(k, budget);
      if (n > 0) { this.ship(k, n); budget -= n; sent += n; }
    }
    this.shipFlow = this.shipFlow * 0.9 + (sent / dt) * 60 * 0.1;
  }

  ship(k: string, n: number) {
    bagAdd(this.shipped, k, n);
    this.g.stock.credits += (ITEM[k]?.value ?? 1) * n;
    this.g.stats.shipped += n;
    this.g.contracts.onShip(k, n);
    this.g.sectors.onShip(k, n);
  }

  private takeFuel(sector: number, item: string, need: number): number {
    const r = this.g.sectors.rt[sector];
    const a = Math.min(need, r.buffer[item] ?? 0);
    if (a > 0) bagAdd(r.buffer, item, -a);
    return a + this.g.stock.take(item, need - a);
  }

  condFactor(m: Machine) { return m.cond > 25 ? 1 : 0.4 + m.cond / 25 * 0.6; }

  private wear(m: Machine, dt: number, mult: number) {
    const w = (m.def.wear ?? 0.3) * mult * dt / 60;
    m.cond = Math.max(0, m.cond - w * 100 / 100);
    if (m.cond <= 0 && !m.broken) {
      m.broken = true;
      this.g.bus.emit('machine_broken', m);
    }
  }

  private behave(m: Machine, dt: number, wearMult: number) {
    const g = this.g;
    const d = m.def;
    const r = g.sectors.rt[m.sector];
    m.t += dt;
    if (m.boost > 1) m.boost = Math.max(1, m.boost - dt / 600 * 0.15);
    const usesPower = d.power < 0;
    if (m.broken) { m.state = 'QUEBRADA — reparo manual'; m.working = false; return; }
    if (m.buried > 0) { m.state = 'Soterrada — remova o entulho'; m.working = false; return; }
    m.overheat = false;
    const want = this.wantsWork(m);
    if (!want) { m.working = false; if (m.state === 'ok' || m.state === 'Trabalhando') m.state = 'Ocioso'; return; }
    const k = this.condFactor(m) * m.boost;
    m.working = true;
    this.wear(m, dt, wearMult);
    m.state = 'Trabalhando';
    void usesPower; void r;

    switch (d.behavior) {
      case 'drill': this.drill(m, dt * k); break;
      case 'pump': this.pump(m, dt * k); break;
      case 'crusher': this.process(m, dt * k, (key) => BRITAVEL_KEYS.includes(key) ? { in: { [key]: 1 }, out: { ['britado_' + key]: 1 } } : null); break;
      case 'refinery': this.process(m, dt * k, (key) => {
        if (REFINE_MAP[key]) return { in: { [key]: 2 }, out: { [REFINE_MAP[key]]: 1 } };
        if (key.startsWith('britado_')) return { in: { [key]: 1 }, out: { [REFINE_MAP[key.slice(8)]]: 1 } };
        return null;
      }); break;
      case 'purifier': this.process(m, dt * k, (key) => { const rc = RECIPES.find(x => x.station === 'purificador' && x.in[key]); return rc ? { in: rc.in, out: rc.out } : null; }); break;
      case 'foundry': this.foundry(m, dt * k); break;
      case 'synth': this.synth(m, dt * k); break;
      case 'complex': case 'tectonic': case 'mantle': case 'collector': this.deep(m, dt, k); break;
      case 'orbital': break;
    }
    if (bagTotal(m.out) > 0) this.pushOut(m);
  }

  levelPower(m: Machine) { return m.def.behavior === 'complex' ? COMPLEX_LEVELS[m.level].power / 60 : 1; }

  private wantsWork(m: Machine): boolean {
    const d = m.def;
    switch (d.behavior) {
      case 'drill': if (bagTotal(m.out) >= OUT_CAP) { m.state = 'Saída cheia'; return false; } return true;
      case 'pump': return !m.exhausted;
      case 'crusher': case 'refinery': case 'purifier': case 'foundry': case 'synth':
        if (bagTotal(m.out) >= OUT_CAP) { m.state = 'Saída cheia'; return false; }
        if (bagTotal(m.inb) <= 0) { m.state = 'Sem insumo'; return false; }
        return true;
      case 'complex': case 'tectonic': case 'mantle': case 'collector':
        return true;
      case 'link': case 'terminal': case 'launchpad': case 'lamp': case 'field': case 'lift': case 'workshop': case 'lab': case 'robotics':
      case 'archaeo': case 'logcenter': case 'orbital': case 'splitter': case 'cannon': case 'cutter':
        return true;
      default: return false;
    }
  }

  // ---- perfuradora: limpa a região à frente; depois perfura para baixo ----
  private drill(m: Machine, dt: number) {
    const w = this.g.world;
    const d = m.def;
    const sp = d.speed ?? 1;
    if (m.exhausted) {
      // região à frente já limpa: segue perfurando em profundidade, com rendimento menor e contínuo
      m.prog += dt * sp * 0.35;
      while (m.prog >= 1) {
        m.prog -= 1;
        const sd = SECTORS[m.sector - 1];
        const common = sd.ores.filter(o => !matById(o.mat).rare);
        let tw = 0; for (const o of common) tw += o.weight;
        let r = Math.random() * tw;
        for (const o of common) { r -= o.weight; if (r <= 0) { this.drillYield(m, matById(o.mat).item!, 3 * DRILL_DEPTH_MULT / 4); break; } }
        this.g.planet.addUnits(DRILL_DEPTH_MULT * 0.5);
      }
      m.state = 'Perfurando em profundidade';
      return;
    }
    const [dx, dy] = DIRS[m.dir];
    const range = d.key === 'perfuradora' ? 28 : d.key === 'perfuradora2' ? 40 : 56;
    const width = d.w * TILE_CELLS + 4;
    const cx0 = m.tx * TILE_CELLS + (dx > 0 ? d.w * TILE_CELLS : dx < 0 ? -1 : 0);
    const cy0 = m.ty * TILE_CELLS + (dy > 0 ? d.h * TILE_CELLS : dy < 0 ? -1 : 0);
    // cabeça de corte larga: trabalha até 4 células da camada ao mesmo tempo
    const power = sp * 0.09 * dt;
    while (m.depth < range) {
      let hits = 0, name = '';
      for (let i = 0; i < width && hits < 4; i++) {
        const off = i - 2;
        const x = dx !== 0 ? cx0 + dx * m.depth : cx0 + off;
        const y = dy !== 0 ? cy0 + dy * m.depth : cy0 + off;
        const mat = w.get(x, y);
        if (!IS_SOLID[mat]) continue;
        const md = matById(mat);
        if (md.tier > (d.tier ?? 1) || md.kind === 'edge') continue;
        hits++; name = md.name;
        if (w.damage(x, y, power)) this.g.mining.removeCell(x, y, 'drill', DRILL_DEPTH_MULT, m);
      }
      if (hits) { m.state = 'Perfurando ' + name; return; }
      m.depth++;
    }
    m.exhausted = true;
    this.g.bus.emit('drill_exhausted', m);
  }

  /** chamada pela mineração quando uma perfuradora remove uma célula */
  drillYield(m: Machine, item: string | undefined, kg: number) {
    if (item) { bagAdd(m.out, item, kg); m.produced += kg; this.g.sectors.counter(m.sector, 'drillOut', kg); }
  }

  private pump(m: Machine, dt: number) {
    m.prog += dt * 3;
    const w = this.g.world;
    const [cx, cy] = this.centerPx(m);
    const R = (m.def.radius ?? 6) * TILE_CELLS;
    const ccx = Math.floor(cx / CELL), ccy = Math.floor(cy / CELL);
    while (m.prog >= 1) {
      m.prog -= 1;
      let best = -1, bx = 0, by = 0;
      for (let a = 0; a < 40; a++) {
        const x = ccx + Math.floor((Math.random() * 2 - 1) * R), y = ccy + Math.floor((Math.random() * 2 - 1) * R);
        const mat = w.get(x, y);
        if (IS_LIQUID[mat] && mat !== MAT.CHASM) { const dd = Math.hypot(x - ccx, y - ccy); if (best < 0 || dd < best) { best = dd; bx = x; by = y; } }
      }
      if (best < 0) { m.t += 1; if (m.t > 60) { m.exhausted = true; m.state = 'Área drenada'; } return; }
      m.t = 0;
      const mat = w.get(bx, by);
      // drena a poça vizinha também
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const mm = w.get(bx + i, by + j);
        if (mm === mat) w.set(bx + i, by + j, mat === MAT.LAVA ? MAT.RUBBLE : MAT.AIR);
      }
      if (mat === MAT.ACID) bagAdd(m.out, 'solvex', 4);
    }
  }

  private process(m: Machine, dt: number, rec: (key: string) => { in: Record<string, number>; out: Record<string, number> } | null) {
    m.prog += dt * (m.def.speed ?? 1);
    let guard = 0;
    while (m.prog >= 1 && guard++ < 20) {
      let done = false;
      for (const key of Object.keys(m.inb)) {
        const rc = rec(key); if (!rc) { delete m.inb[key]; continue; }
        const need = rc.in[key];
        if ((m.inb[key] ?? 0) >= need) {
          bagAdd(m.inb, key, -need);
          for (const o in rc.out) { bagAdd(m.out, o, rc.out[o]); m.produced += rc.out[o]; this.g.stats.processed += rc.out[o]; }
          m.prog -= need;
          done = true; break;
        }
      }
      if (!done) { m.prog = Math.min(m.prog, 1); break; }
    }
  }

  private foundry(m: Machine, dt: number) {
    m.prog += dt * (m.def.speed ?? 1);
    const recs = RECIPES.filter(r => r.station === 'fundidor' && (!r.research || this.g.research.has(r.research)));
    let guard = 0;
    while (m.prog >= 1 && guard++ < 10) {
      const rc = recs.find(r => Object.keys(r.in).every(k => (m.inb[k] ?? 0) >= r.in[k]));
      if (!rc) { m.state = 'Aguardando par complementar'; m.prog = Math.min(m.prog, 1); return; }
      for (const k in rc.in) bagAdd(m.inb, k, -rc.in[k]);
      for (const o in rc.out) { bagAdd(m.out, o, rc.out[o]); m.produced += rc.out[o]; this.g.stats.processed += rc.out[o]; }
      m.prog -= rc.time;
    }
  }

  private synth(m: Machine, dt: number) {
    const rc = m.recipe ? RECIPE[m.recipe] : undefined;
    if (!rc) { m.state = 'Configure uma receita (E)'; return; }
    if (!Object.keys(rc.in).every(k => (m.inb[k] ?? 0) >= rc.in[k])) { m.state = 'Aguardando insumos'; return; }
    m.prog += dt * (m.def.speed ?? 1);
    if (m.prog >= rc.time) {
      m.prog = 0;
      for (const k in rc.in) bagAdd(m.inb, k, -rc.in[k]);
      for (const o in rc.out) { bagAdd(m.out, o, rc.out[o]); m.produced += rc.out[o]; }
    }
  }

  /** Extração profunda (abstrata) a partir da reserva setorial */
  private deep(m: Machine, dt: number, k: number) {
    const g = this.g;
    const d = m.def;
    // deriva de calibração: o motivo de visitas manuais periódicas
    const drift = d.behavior === 'collector' ? 0.05 : 0.018;
    m.eff = Math.max(0.25, m.eff - drift * dt / 60);
    if (m.eff < 0.6 && m.t % 60 < dt) g.bus.emit('complex_drift', m);
    let rate = 0, layer: 'crust' | 'mantle' = 'crust';
    if (d.behavior === 'complex') rate = COMPLEX_LEVELS[m.level].rate;
    else if (d.behavior === 'tectonic') { rate = TECTONIC_RATE; layer = 'mantle'; }
    else if (d.behavior === 'mantle') { rate = MANTLE_RATE; layer = 'mantle'; }
    else if (d.behavior === 'collector') { if (g.planet.fraction() < 0.5) { m.state = 'Aguardando fragmentação (50%)'; return; } rate = COLLECTOR_RATE; layer = 'mantle'; }
    if (layer === 'mantle') rate *= 1 + 0.5 * Math.min(3, this.count('uplink_orbital'));
    const t = rate * Math.min(1.1, m.eff) * k * dt / 60;
    const got = g.planet.extractDeep(m.sector, layer, t);
    if (got <= 0) { m.state = layer === 'crust' ? 'Camada esgotada' : 'Reserva esgotada'; return; }
    g.sectors.rt[m.sector].deepRate += (got / dt) * 60;
    // minério associado entra no buffer do setor
    const sd = SECTORS[m.sector - 1];
    const kg = got * 3;
    const r = g.sectors.rt[m.sector];
    const room = r.bufCap - bagTotal(r.buffer);
    if (room > 0) {
      let tw = 0; for (const o of sd.ores) tw += o.weight;
      for (const o of sd.ores) {
        const item = matById(o.mat).item!;
        const n = Math.min(room, kg) * (o.weight / tw);
        bagAdd(r.buffer, item, n);
      }
    }
    m.produced += got;
  }

  // ---- entrada/saída ----
  /** Uma máquina aceita um lote? Retorna true se consumiu. */
  accept(m: Machine, k: string, q: number): boolean {
    if (m.broken || m.buried > 0) return false;
    const d = m.def;
    const r = this.g.sectors.rt[m.sector];
    switch (d.behavior) {
      case 'storage': case 'link': case 'command': {
        if (bagTotal(r.buffer) + q > r.bufCap) return false;
        bagAdd(r.buffer, k, q); return true;
      }
      case 'terminal': case 'launchpad': {
        this.ship(k, q); return true;
      }
      case 'crusher': if (!BRITAVEL_KEYS.includes(k)) return false; break;
      case 'refinery': if (!REFINE_MAP[k] && !k.startsWith('britado_')) return false; break;
      case 'purifier': if (!RECIPES.some(x => x.station === 'purificador' && x.in[k])) return false; break;
      case 'foundry': if (!RECIPES.some(x => x.station === 'fundidor' && x.in[k])) return false; break;
      case 'synth': { const rc = m.recipe ? RECIPE[m.recipe] : undefined; if (!rc || !rc.in[k] || (m.inb[k] ?? 0) > rc.in[k] * 6) return false; break; }
      case 'reactor': if (d.fuel?.item !== k) return false; bagAdd(r.buffer, k, q); return true;
      case 'splitter': if (bagTotal(m.inb) > 0) return false; break;
      default: return false;
    }
    if (bagTotal(m.inb) + q > 40) return false;
    bagAdd(m.inb, k, q);
    return true;
  }

  /** Empurra saída para esteiras adjacentes que saem da máquina, ou direto para armazéns encostados. */
  private pushOut(m: Machine) {
    const d = m.def;
    const per: [number, number][] = [];
    for (let x = 0; x < d.w; x++) { per.push([m.tx + x, m.ty - 1]); per.push([m.tx + x, m.ty + d.h]); }
    for (let y = 0; y < d.h; y++) { per.push([m.tx - 1, m.ty + y]); per.push([m.tx + d.w, m.ty + y]); }
    const n = per.length;
    for (let i = 0; i < n; i++) {
      const [tx, ty] = per[(m.rr + i) % n];
      const o = this.at(tx, ty);
      if (!o || o === m) continue;
      const key = Object.keys(m.out)[0];
      if (!key) return;
      const q = Math.min(LOT, m.out[key]);
      if (o.belt) {
        const [bx, by] = DIRS[o.dir];
        if (this.at(tx + bx, ty + by) === m) continue; // esteira apontando para dentro
        if (o.belt.length && o.belt[0].p < BELT_GAP) continue;
        o.belt.unshift({ k: key, q, p: 0 });
        bagAdd(m.out, key, -q);
        m.rr = (m.rr + i + 1) % n;
        return;
      }
      if ((o.def.behavior === 'storage' || o.def.behavior === 'link' || o.def.behavior === 'command') && this.accept(o, key, q)) {
        bagAdd(m.out, key, -q);
        return;
      }
    }
  }

  private updateBelts(dt: number) {
    for (const b of this.belts) {
      const lots = b.belt!;
      if (!lots.length) continue;
      const sp = (b.def.speed ?? 1) * dt * (b.broken ? 0 : 1);
      // do fim para o começo
      for (let i = lots.length - 1; i >= 0; i--) {
        const l = lots[i];
        const limit = i === lots.length - 1 ? 1 : lots[i + 1].p - BELT_GAP;
        l.p = Math.min(l.p + sp, Math.max(l.p, limit));
      }
      const last = lots[lots.length - 1];
      if (last.p >= 1) {
        const [dx, dy] = DIRS[b.dir];
        const nt = this.at(b.tx + dx, b.ty + dy);
        if (!nt) { b.state = 'Sem destino'; continue; }
        if (nt.belt) {
          if (!nt.belt.length || nt.belt[0].p >= BELT_GAP) { lots.pop(); last.p = 0; nt.belt.unshift(last); b.state = 'ok'; }
          else b.state = 'Fila';
        } else if (nt.def.behavior === 'splitter') {
          if (this.accept(nt, last.k, last.q)) { lots.pop(); this.splitOut(nt); }
        } else if (this.accept(nt, last.k, last.q)) { lots.pop(); b.state = 'ok'; }
        else b.state = 'Travada: destino recusa ' + (ITEM[last.k]?.name ?? last.k);
      }
    }
    for (const m of this.list) if (m.def.behavior === 'splitter' && bagTotal(m.inb) > 0) this.splitOut(m);
  }

  private splitOut(m: Machine) {
    const key = Object.keys(m.inb)[0]; if (!key) return;
    const q = m.inb[key];
    const fwd = m.dir, left = (m.dir + 3) % 4, right = (m.dir + 1) % 4;
    const order = m.filter ? (key === m.filter ? [fwd] : (m.rr++ % 2 ? [left, right] : [right, left])) : [[fwd, left, right], [left, right, fwd], [right, fwd, left]][m.rr++ % 3];
    for (const dir of order) {
      const [dx, dy] = DIRS[dir];
      const o = this.at(m.tx + dx, m.ty + dy);
      if (!o) continue;
      if (o.belt) {
        if (o.belt.length && o.belt[0].p < BELT_GAP) continue;
        o.belt.unshift({ k: key, q, p: 0 }); delete m.inb[key]; return;
      }
      if (this.accept(o, key, q)) { delete m.inb[key]; return; }
    }
  }

  // ---- ações manuais ----
  repairCost(m: Machine): Record<string, number> {
    if (this.g.stock.count('pecas') >= 2 || this.g.pack.count('kit_reparo') < 1) return m.broken ? { pecas: 2 } : { pecas: 1 };
    return { kit_reparo: 1 };
  }

  repair(m: Machine): boolean {
    const g = this.g;
    if (g.pack.count('kit_reparo') >= 1) g.pack.take('kit_reparo', 1);
    else {
      const cost = m.broken ? { pecas: 2 } : { pecas: 1 };
      if (!g.stock.has(cost)) {
        // reparo improvisado com Ferronox bruto no início do jogo
        if (!g.stock.pay({ ferronox: m.broken ? 20 : 8 }, g.pack.items)) return false;
      } else g.stock.pay(cost);
    }
    m.cond = 100; m.broken = false;
    g.stats.repairs++;
    g.bus.emit('repaired', m);
    return true;
  }

  calibrated(m: Machine, quality: number) {
    m.overheat = false;
    if (['complex', 'tectonic', 'mantle', 'collector'].includes(m.def.behavior)) m.eff = Math.min(1.1, 0.85 + quality * 0.25);
    else m.boost = 1 + 0.15 * quality;
    this.g.sectors.counter(m.sector, 'calibrations', 1);
    this.g.stats.calibrations++;
    this.g.bus.emit('calibrated', m);
  }

  upgradeComplex(m: Machine): string | null {
    const next = COMPLEX_LEVELS[m.level + 1];
    if (!next) return 'Nível máximo';
    if (next.research && !this.g.research.has(next.research)) return 'Pesquisa necessária';
    if (!this.g.stock.pay(next.cost, this.g.pack.items)) return 'Recursos insuficientes';
    m.level++;
    this.g.bus.emit('complex_upgraded', m);
    return null;
  }

  // ---- save ----
  serialize() {
    return {
      nextId: this.nextId, shipList: this.shipList, shipped: this.shipped,
      list: this.list.map(m => ({ id: m.id, key: m.key, tx: m.tx, ty: m.ty, dir: m.dir, cond: m.cond, broken: m.broken, overheat: m.overheat, buried: m.buried, inb: m.inb, out: m.out, level: m.level, eff: m.eff, filter: m.filter, recipe: m.recipe, belt: m.belt, depth: m.depth, exhausted: m.exhausted, charged: m.charged, produced: m.produced })),
    };
  }
  load(s: any) {
    this.nextId = s.nextId; this.shipList = s.shipList; this.shipped = s.shipped ?? {};
    for (const o of s.list) {
      const def = MACHINE[o.key]; if (!def) continue;
      const m: Machine = { ...o, def, sector: this.g.world.sectorAtTile(o.tx, o.ty), state: 'ok', prog: 0, boost: 1, working: false, loaders: 0, rr: 0, t: 0 } as Machine;
      if (def.behavior === 'belt' && !m.belt) m.belt = [];
      this.add(m);
    }
  }
}

export type { Recipe };
