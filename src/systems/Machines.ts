import { fabVal, SILO_KEYS } from '../data/factory';
import { LAYER_COUNT } from '../data/sectors';
import { CELL, TILE, TILE_CELLS, WORLD_TW, WORLD_TH, WORLD_W } from '../core/constants';
import { DIRS } from '../core/math';
import { MACHINE, COMPLEX_LEVELS, TECTONIC_RATE, MANTLE_RATE, COLLECTOR_RATE, type MachineDef } from '../data/machines';
import { MAT, IS_SOLID, IS_LIQUID, IS_LOOSE, GRAIN, GRAIN_ITEM, GRAIN_KG, matById } from '../data/materials';
import { ITEM } from '../data/items';
import { RAW_BY_LAYER, COMPOSITION, compOf, rawOf, gradeAt, gradeLabel, gradeMix, separate, KG_PER_UNIT, BLOCK_KG, type Grades } from '../data/composition';
import { REFINE_MAP, RECIPES, RECIPE, type Recipe } from '../data/recipes';
import { SECTORS } from '../data/sectors';
import { type Bag, bagAdd, bagTotal } from './Inventory';
import type { Game } from '../Game';

export const DELIVERY_PAY = 0.5;  // créditos por kg entregue = valor do item × isto
export const LOT = 10;           // kg por lote em esteira
export const BASE_RADIUS = 40;   // tiles: área da base onde armazéns podem ser construídos
const BELT_GAP = 0.5;            // espaçamento mínimo entre lotes
const OUT_CAP = 200;             // kg de saída acumulada antes de travar
const IN_CAP = 80;               // kg de entrada das máquinas de processamento
export const SEP_EFF = 0.92;     // eficiência base da separação (o resto vira resíduo, nunca some)
const PROC = new Set(['separator', 'prep', 'compactor']);
const RARE_KEYS = new Set(Object.values(COMPOSITION).map(c => c.rare.k));
const OUTLETS = new Set(['storage', 'link', 'command', 'terminal', 'launchpad', 'separator', 'prep', 'compactor', 'refinery']);
const DRILL_DEPTH_MULT = 4;      // cada célula perfurada representa uma pequena coluna de material

export interface BeltLot { k: string; q: number; p: number; g?: number; }
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
  g: Grades;             // teor médio do material bruto/fragmentado dentro da máquina
  fin: number; fout: number; fres: number;   // processamento: kg/min de entrada, minerais e resíduo (média móvel)
  mix: Bag;              // tudo o que a máquina já separou (para a composição na interface)
  lg?: number;           // perfuradoras: teor do último material
  kr?: number;           // rodízio de itens na saída
  q?: { m: number; a: number; d: number; t?: number }[];   // tubos: grãos em trânsito (d = tiles desde a última pressão)
  scan?: number;         // sopradores: varredura incremental do raio
}

export interface SectorRT {
  gen: number; use: number; ratio: number; demand: number;
  heat: number; cooling: number; stress: number;
  buffer: Bag; bufG: Grades; bufCap: number;
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
  blockCap = 0; blockFlow = 0; // exportação de blocos de massa (kg/min)
  private cmd: Machine | undefined;
  private belts: Machine[] = [];
  private acc = 0;

  constructor(private g: Game) {
    // grãos que caem/andam para dentro de uma máquina: funil
    g.world.sink = (id, mat, aux) => { this.lastAux = aux; return this.sinkGrain(id, mat); };
    g.world.onFed = (_id, mat) => { const k = GRAIN_ITEM[mat]; if (k) g.sectors.counter(g.planet.layer, 'fed', k === 'bloco_massa' ? 100 : GRAIN_KG); };
  }

  // ---------------- construção ----------------
  canPlace(def: MachineDef, tx: number, ty: number): string | null {
    const w = this.g.world;
    for (let y = 0; y < def.h; y++) for (let x = 0; x < def.w; x++) {
      if (!w.tileFree(tx + x, ty + y, def.onLiquid)) return def.onLiquid ? 'Precisa de líquido ou abismo' : 'Área obstruída';
    }
    const sec = w.sectorAtTile(tx, ty);
    if (!sec) return 'Fora do planeta';
    // vista lateral: construções precisam de apoio (esteiras e elevadores podem ficar suspensos)
    if (!['belt', 'riser', 'lamp', 'support', 'scaffold', 'filter', 'launcher', 'tube', 'extractor'].includes(def.behavior)) {
      let sup = false;
      for (let x = 0; x < def.w && !sup; x++) sup = w.tileSupported(tx + x, ty + def.h - 1);
      if (!sup && def.behavior === 'drill') sup = true;
      if (!sup) return 'Precisa de chão embaixo';
    }
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
      g: {}, fin: 0, fout: 0, fres: 0, mix: {},
    };
    if (def.behavior === 'belt') m.belt = [];
    // construir em cima de grãos soltos: eles vão para o estoque
    for (let y = 0; y < def.h; y++) for (let x = 0; x < def.w; x++) for (const gr of this.g.world.clearTile(tx + x, ty + y)) {
      const k = GRAIN_ITEM[gr.m]; if (k) this.g.stock.add(k, k === 'bloco_massa' ? 1 : GRAIN_KG, false, gr.a / 40);
    }
    // fundação: no chão irregular, preenche o vão embaixo da máquina com o terreno de baixo (fica assentada, sem flutuar)
    if (!['belt', 'riser', 'lamp', 'support', 'scaffold', 'filter', 'launcher', 'tube', 'platform', 'extractor'].includes(def.behavior)) {
      const w = this.g.world, y0 = (ty + def.h) * TILE_CELLS;
      if (!this.at(tx, ty + def.h)) for (let x = tx * TILE_CELLS; x < (tx + def.w) * TILE_CELLS; x++) {
        let d = 0; while (d < TILE_CELLS && !IS_SOLID[w.get(x, y0 + d)]) d++;
        if (d >= TILE_CELLS) continue;
        const mat = w.get(x, y0 + d);
        for (let k = 0; k < d; k++) if (w.get(x, y0 + k) === MAT.AIR) w.set(x, y0 + k, mat);
      }
    }
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
      const i = (m.ty + y) * WORLD_TW + m.tx + x;
      if (m.def.behavior === 'platform') w.platform[i] = 1;
      else w.occ[i] = m.id;
    }
  }

  remove(m: Machine) {
    const w = this.g.world;
    for (let y = 0; y < m.def.h; y++) for (let x = 0; x < m.def.w; x++) {
      const i = (m.ty + y) * WORLD_TW + m.tx + x;
      if (m.def.behavior === 'platform') w.platform[i] = 0;
      else if (w.occ[i] === m.id) w.occ[i] = 0;
    }
    this.list.splice(this.list.indexOf(m), 1);
    this.byId.delete(m.id);
    // o que estava apoiado em cima volta a cair
    for (let x = 0; x < m.def.w * TILE_CELLS; x++) w.touch(m.tx * TILE_CELLS + x, m.ty * TILE_CELLS - 1);
    if (m.def.behavior === 'dronepad') this.g.robots.removeForPad(m);
    if (m.belt) this.belts.splice(this.belts.indexOf(m), 1);
    // devolve conteúdo ao estoque
    for (const k in m.out) this.g.stock.add(k, m.out[k], false, m.g[k]);
    for (const k in m.inb) this.g.stock.add(k, m.inb[k], false, m.g[k]);
    if (m.belt) for (const l of m.belt) this.g.stock.add(l.k, l.q, false, l.g);
    if (m.def.behavior === 'compactor' && m.prog > 0) this.g.stock.add('residuo', m.prog, false);
  }

  // ---------------- pátio de resíduo e base ----------------
  /** kg de resíduo que a base aguenta antes de travar a linha. */
  yardCap() { return 2000 + 1000 * this.countBehavior('storage'); }
  yardUsed() { let u = this.g.stock.count('residuo'); for (const r of this.g.sectors.rt) u += r.buffer.residuo ?? 0; return u; }
  yardRoom() { return Math.max(0, this.yardCap() - this.yardUsed()); }
  /** A Zenitex não compra material sem processar: só blocos e minerais saem pelo terminal. */
  shippable(k: string) { const c = ITEM[k]?.cat; return k === 'bloco_massa' || (c !== 'bruto' && c !== 'residuo'); }
  atBase(m: Machine) {
    const c = this.cmd; if (!c) return false;
    return Math.hypot(m.tx + m.def.w / 2 - (c.tx + 1.5), m.ty + m.def.h / 2 - (c.ty + 1.5)) <= BASE_RADIUS;
  }
  /** material que esta máquina processa, do mais aproveitado para o menos */
  inputs(m: Machine): string[] {
    if (m.def.behavior === 'compactor') return ['residuo'];
    const t = m.def.takes ?? {};
    return Object.keys(t).sort((a, b) => t[b] - t[a]);
  }

  at(tx: number, ty: number): Machine | undefined {
    if (tx < 0 || ty < 0 || tx >= WORLD_TW || ty >= WORLD_TH) return undefined;
    const id = this.g.world.occ[ty * WORLD_TW + tx];
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
    this.updateTubes(dt);
    this.updateRisers();
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
    let shipCap = 0, blockCap = 0;
    this.cmd = this.list.find(m => m.def.behavior === 'command');
    const logBonus = this.count('central_logistica') ? 1.25 : 1;
    // passada 1: geração, capacidade, campos
    for (const m of this.list) {
      const r = rts[m.sector]; if (!r) continue;
      const d = m.def;
      const ok = !m.broken && m.buried <= 0;
      if (d.behavior === 'storage') r.bufCap += d.capacity ?? 0;
      if (d.behavior === 'command') { r.bufCap += 3000; if (ok) r.linkCap += (d.capacity ?? 0) * logBonus; }
      if (d.behavior === 'link') { r.bufCap += 500; if (ok) r.linkCap += (d.capacity ?? 0) * (1 + 0.2 * Math.min(3, m.loaders)) * logBonus * this.condFactor(m); }
      if ((d.behavior === 'terminal' || d.behavior === 'launchpad') && ok) {
        const f = (1 + 0.2 * Math.min(3, m.loaders)) * this.condFactor(m);
        shipCap += (d.capacity ?? 0) * f;
        blockCap += (d.behavior === 'terminal' ? 3000 : 30000) * f;
      }
      if (d.behavior === 'field' && ok) {
        const f = d.field!;
        r.fields[f.hazard] = Math.min(60, (r.fields[f.hazard] ?? 0) + (f.sectorWide ?? 0));
      }
    }
    this.shipCap = shipCap * (1 + g.research.eff('shipMult'));
    this.blockCap = blockCap * (1 + g.research.eff('shipMult'));
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
          g.stock.add(k, n, true, r.bufG[k]);
          // a Zenitex paga pelo minério que chega à base
          g.stock.credits += n * (ITEM[k]?.value ?? 1) * DELIVERY_PAY;
          g.contracts.onShip(k, n);
          moved += n;
        }
      }
      r.linkFlow = r.linkFlow * 0.9 + (moved / dt) * 60 * 0.1;
      r.linkedTotal += moved;
      if (moved > 0) { g.sectors.counter(s, 'linked', moved); g.sectors.counter(s, 'delivered', moved); }
    }

    // exportação de blocos de massa planetária: é assim que o resíduo deixa o planeta
    const blocks = g.stock.take('bloco_massa', (this.blockCap / 60) * dt / BLOCK_KG);
    if (blocks > 0) this.ship('bloco_massa', blocks);
    this.blockFlow = this.blockFlow * 0.95 + (blocks * BLOCK_KG / dt) * 60 * 0.05;

    // envio orbital
    let budget = (this.shipCap / 60) * dt, sent = 0;
    for (const k of this.shipList) {
      if (budget <= 0) break;
      if (!this.shippable(k)) continue;
      const n = g.stock.take(k, budget);
      if (n > 0) { this.ship(k, n); budget -= n; sent += n; }
    }
    this.shipFlow = this.shipFlow * 0.9 + (sent / dt) * 60 * 0.1;
    if (this.yardUsed() >= this.yardCap() * 0.98) g.say('yard_full', 150);
  }

  ship(k: string, n: number) {
    bagAdd(this.shipped, k, n);
    if (k === 'bloco_massa') {
      this.g.planet.addUnits(n * BLOCK_KG / KG_PER_UNIT);
      this.g.sectors.counter(this.g.planet.layer, 'exported', n * BLOCK_KG);
      if (!this.g.flags.firstBlock) { this.g.flags.firstBlock = true; this.g.say('first_block'); }
    }
    this.g.stock.credits += (ITEM[k]?.value ?? 1) * n;
    this.g.stats.shipped += n;
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
    const proc = PROC.has(d.behavior);
    if (proc) {
      m.fin *= 0.97; m.fout *= 0.97; m.fres *= 0.97;
      if (d.behavior === 'compactor') this.fromBase(m);   // só o compactador puxa o resíduo do pátio da base
    }
    // a saída anda mesmo com a máquina parada (senão ela nunca destrava)
    // compactador na base entrega os blocos direto no estoque (o Terminal exporta); fora da base, pela calha
    if (bagTotal(m.out) > 0) { if (d.behavior === 'compactor') this.toBase(m); if (bagTotal(m.out) > 0) this.pushOut(m); }
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
      case 'blower': this.blowerRun(m, dt * k); break;
      case 'extractor': this.extractorRun(m, dt * k); break;
      case 'separator': this.separateRun(m, dt * k); break;
      case 'prep': this.prepRun(m, dt * k); break;
      case 'compactor': this.compactRun(m, dt * k); break;
      case 'refinery': this.process(m, dt * k, (key) => REFINE_MAP[key] ? { in: { [key]: 2 }, out: { [REFINE_MAP[key]]: 1 } } : null); break;
      case 'purifier': this.process(m, dt * k, (key) => { const rc = RECIPES.find(x => x.station === 'purificador' && x.in[key]); return rc ? { in: rc.in, out: rc.out } : null; }); break;
      case 'foundry': this.foundry(m, dt * k); break;
      case 'synth': this.synth(m, dt * k); break;
      case 'complex': case 'tectonic': case 'mantle': case 'collector': this.deep(m, dt, k); break;
      case 'orbital': break;
    }
    if (bagTotal(m.out) > 0) { if (d.behavior === 'compactor') this.toBase(m); if (bagTotal(m.out) > 0) this.pushOut(m); }
  }

  levelPower(m: Machine) { return m.def.behavior === 'complex' ? COMPLEX_LEVELS[m.level].power / 60 : 1; }

  private wantsWork(m: Machine): boolean {
    const d = m.def;
    switch (d.behavior) {
      case 'drill': if (bagTotal(m.out) >= OUT_CAP) { m.state = 'Saída cheia: sem esteira livre'; return false; } return true;
      case 'pump': return !m.exhausted;
      case 'crusher': case 'refinery': case 'purifier': case 'foundry': case 'synth':
        if (bagTotal(m.out) >= OUT_CAP) { m.state = 'Saída cheia'; return false; }
        if (bagTotal(m.inb) <= 0) { m.state = 'Sem insumo'; return false; }
        return true;
      case 'separator': case 'prep': case 'compactor':
        if (bagTotal(m.out) >= OUT_CAP) { m.state = this.clogMsg(m); return false; }
        if (bagTotal(m.inb) <= 0) { m.state = 'Sem material: ' + this.inputs(m).slice(0, 2).map(k => ITEM[k]?.name ?? k).join(' ou '); return false; }
        return true;
      case 'complex':
        if (bagTotal(m.out) >= OUT_CAP * 20) { m.state = 'Saída cheia: ligue esteiras ao complexo'; return false; }
        return true;
      case 'tectonic': case 'mantle': case 'collector':
        return true;
      case 'belt': case 'riser': case 'launcher': return true;
      case 'tube': return !!m.q?.length;
      case 'extractor': return true;
      case 'silo': { const t = bagTotal(m.inb); const k = m.filter ?? Object.keys(m.inb).find(x => (m.inb[x] ?? 0) > 0 && !RARE_KEYS.has(x)) ?? Object.keys(m.inb).find(x => (m.inb[x] ?? 0) > 0); if (!m.state.startsWith('Transb') || t < this.siloCap() - GRAIN_KG) m.state = t > 0 ? `${ITEM[k!]?.name ?? k} · ${Math.round(t)}/${this.siloCap()} kg` : k ? `Vazio · reservado p/ ${ITEM[k]?.name ?? k}` : 'Vazio · aceita o 1º mineral que cair'; return false; }
      case 'blower': if (bagTotal(m.out) >= OUT_CAP) { m.state = 'Saída cheia: ligue um tubo no lado da seta'; return false; } return true;
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
        const u = DRILL_DEPTH_MULT * 0.5;
        this.g.planet.dig(u);
        this.drillYield(m, rawOf(this.g.planet.layer), u * KG_PER_UNIT, this.gradeHere(m));
      }
      m.state = `Perfurando em profundidade · teor ${gradeLabel(m.lg ?? 1)}`;
      return;
    }
    const [dx, dy] = DIRS[m.dir];
    const range = d.key === 'perfuradora' ? 56 : d.key === 'perfuradora2' ? 80 : 112;
    const width = d.w * TILE_CELLS + 4;
    const cx0 = m.tx * TILE_CELLS + (dx > 0 ? d.w * TILE_CELLS : dx < 0 ? -1 : 0);
    const cy0 = m.ty * TILE_CELLS + (dy > 0 ? d.h * TILE_CELLS : dy < 0 ? -1 : 0);
    // cabeça de corte larga: trabalha até 4 células da camada ao mesmo tempo
    const power = sp * 0.09 * dt;
    while (m.depth < range) {
      let hits = 0, name = '';
      for (let i = 0; i < width && hits < 6; i++) {
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
      if (hits) { m.state = `Perfurando ${name} · teor ${gradeLabel(m.lg ?? 1)}`; return; }
      m.depth++;
    }
    m.exhausted = true;
    this.g.bus.emit('drill_exhausted', m);
  }

  /** chamada pela mineração quando uma perfuradora remove uma célula */
  drillYield(m: Machine, item: string | undefined, kg: number, grade?: number) {
    if (!item) return;
    if (grade !== undefined) { gradeMix(m.g, m.out[item] ?? 0, item, kg, grade); m.lg = (m.lg ?? grade) * 0.9 + grade * 0.1; }
    bagAdd(m.out, item, kg); m.produced += kg; this.g.sectors.counter(m.sector, 'drillOut', kg);
  }
  gradeHere(m: Machine) {
    const [px, py] = this.centerPx(m);
    return gradeAt(this.g.world.gen.seed, this.g.planet.layer, Math.floor(px / CELL), Math.floor(py / CELL));
  }

  // ---- cadeia da massa planetária ----
  private rate(m: Machine) { return (m.def.capacity ?? 600) / 60; }   // kg/s
  private flow(m: Machine, field: 'fin' | 'fout' | 'fres', kg: number, dt: number) { m[field] += (kg / Math.max(dt, 1e-3)) * 60 * 0.03; }

  /** separação: bruto/fragmentado → minerais + resíduo (minerais saem do planeta aqui) */
  private separateRun(m: Machine, dt: number) {
    const g = this.g;
    let budget = this.rate(m) * dt;
    for (const key of Object.keys(m.inb)) {
      if (budget <= 0) break;
      const f = m.def.takes?.[key];
      if (f === undefined) { g.stock.add(key, m.inb[key], false, m.g[key]); delete m.inb[key]; continue; }
      const q = Math.min(budget, m.inb[key]);
      const layer = key === 'fragmentado' ? g.planet.layer : Math.max(1, RAW_BY_LAYER.indexOf(key));
      const res = separate(layer, q, m.g[key] ?? 1, SEP_EFF * f);
      bagAdd(m.inb, key, -q); budget -= q;
      let minerals = 0;
      for (const k in res.out) { bagAdd(m.out, k, res.out[k]); bagAdd(m.mix, k, res.out[k]); minerals += res.out[k]; }
      bagAdd(m.out, 'residuo', res.residue); bagAdd(m.mix, 'residuo', res.residue);
      this.flow(m, 'fin', q, dt); this.flow(m, 'fout', minerals, dt); this.flow(m, 'fres', res.residue, dt);
      m.produced += minerals;
      g.stats.processed += minerals;
      g.planet.addUnits(minerals / KG_PER_UNIT);
      g.sectors.counter(g.planet.layer, 'processed', q);
      g.sectors.counter(g.planet.layer, 'separated', minerals);
    }
    m.state = `Separando · ${Math.round(m.fin)} kg/min`;
  }

  /** preparo: bruto → fragmentado (a máquina errada danifica o conteúdo, e isso aparece como eficiência) */
  private prepRun(m: Machine, dt: number) {
    let budget = this.rate(m) * dt;
    for (const key of Object.keys(m.inb)) {
      if (budget <= 0) break;
      const f = m.def.takes?.[key];
      if (f === undefined) { this.g.stock.add(key, m.inb[key], false, m.g[key]); delete m.inb[key]; continue; }
      const q = Math.min(budget, m.inb[key]);
      gradeMix(m.g, m.out.fragmentado ?? 0, 'fragmentado', q, (m.g[key] ?? 1) * f);
      bagAdd(m.inb, key, -q); bagAdd(m.out, 'fragmentado', q); bagAdd(m.mix, key, q);
      budget -= q;
      this.flow(m, 'fin', q, dt); this.flow(m, 'fout', q, dt);
      m.produced += q;
      if (f < 1) this.g.say('crystal_damage', 240);
      m.state = f < 1 ? `Danificando ${ITEM[key]?.name ?? key} (−${Math.round((1 - f) * 100)}%)` : 'Fragmentando';
    }
  }

  /** compactação: resíduo → blocos de 100 kg */
  private compactRun(m: Machine, dt: number) {
    const q = Math.min(this.rate(m) * dt, m.inb.residuo ?? 0);
    if (q <= 0) return;
    bagAdd(m.inb, 'residuo', -q);
    m.prog += q;
    while (m.prog >= BLOCK_KG) { m.prog -= BLOCK_KG; bagAdd(m.out, 'bloco_massa', 1); m.produced += 1; }
    this.flow(m, 'fin', q, dt); this.flow(m, 'fres', q, dt);
    m.state = `Compactando · ${Math.round(m.fin)} kg/min`;
  }

  /** máquinas de processamento na base puxam o próprio insumo do estoque */
  private fromBase(m: Machine) {
    if (!this.atBase(m)) return;
    const room = IN_CAP - bagTotal(m.inb);
    if (room < LOT) return;
    const st = this.g.stock;
    for (const k of this.inputs(m)) {
      if (st.count(k) < 0.5) continue;
      const gr = st.grade(k);
      const n = st.take(k, room);
      gradeMix(m.g, m.inb[k] ?? 0, k, n, gr);
      bagAdd(m.inb, k, n);
      return;
    }
  }

  /** ...e entregam a saída direto no estoque (o resíduo só cabe se houver pátio) */
  private toBase(m: Machine) {
    if (!this.atBase(m)) return;
    const g = this.g;
    for (const k of Object.keys(m.out)) {
      let q = m.out[k];
      if (k === 'residuo') q = Math.min(q, this.yardRoom());
      if (q <= 0) continue;
      bagAdd(m.out, k, -q);
      g.stock.add(k, q, true, m.g[k]);
      if (k !== 'residuo' && k !== 'bloco_massa') {
        g.stock.credits += q * (ITEM[k]?.value ?? 1) * DELIVERY_PAY;
        g.contracts.onShip(k, q);
        g.sectors.counter(g.planet.layer, 'delivered', q);
      }
    }
  }

  private clogMsg(m: Machine): string {
    const k = Object.keys(m.out).sort((a, b) => m.out[b] - m.out[a])[0];
    if (k === 'residuo') return this.atBase(m) ? 'Travada: pátio de resíduo cheio — compacte e exporte' : 'Travada: resíduo sem destino';
    return `Saída cheia: ${ITEM[k]?.name ?? k} sem destino`;
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
    if (d.behavior === 'complex') {
      // o complexo escava em escala industrial: o material bruto ainda precisa ser processado
      if (g.planet.layerDone()) { m.state = 'Camada esgotada'; return; }
      const u = COMPLEX_LEVELS[m.level].rate * Math.min(1.1, m.eff) * k * dt / 60;
      g.planet.dig(u);
      this.drillYield(m, rawOf(g.planet.layer), u * KG_PER_UNIT, this.gradeHere(m));
      g.sectors.rt[m.sector].deepRate += (u / dt) * 60;
      m.state = `Escavando · ${Math.round(COMPLEX_LEVELS[m.level].rate * KG_PER_UNIT * Math.min(1.1, m.eff))} kg/min de bruto`;
      return;
    }
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
  accept(m: Machine, k: string, q: number, grade?: number): boolean {
    if (m.broken || m.buried > 0) return false;
    const d = m.def;
    const r = this.g.sectors.rt[m.sector];
    switch (d.behavior) {
      case 'storage': case 'link': case 'command': {
        if (k === 'residuo' && this.yardRoom() < q) return false;
        if (bagTotal(r.buffer) + q > r.bufCap) return false;
        gradeMix(r.bufG, r.buffer[k] ?? 0, k, q, grade);
        bagAdd(r.buffer, k, q); return true;
      }
      case 'terminal': case 'launchpad': {
        if (!this.shippable(k)) return false;
        this.ship(k, q); return true;
      }
      case 'separator': case 'prep': case 'compactor': {
        if (d.behavior === 'compactor' ? !(k === 'residuo' || k === 'bruto_sm' || k === 'bruto_sc' || k === 'fragmentado' || RAW_BY_LAYER.includes(k) || SILO_KEYS.has(k)) : d.takes?.[k] === undefined) return false;
        if (d.behavior === 'compactor' && k !== 'residuo') k = 'residuo';
        if (bagTotal(m.inb) + q > IN_CAP) return false;
        gradeMix(m.g, m.inb[k] ?? 0, k, q, grade);
        bagAdd(m.inb, k, q); return true;
      }
      case 'refinery': if (!REFINE_MAP[k]) return false; break;
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

  /**
   * Saída física: a máquina cospe grãos pela lateral (porta). O Separador solta minerais por um lado
   * e resíduo pelo outro. Itens sem forma de grão (barras) só passam para armazéns encostados.
   */
  private pushOut(m: Machine) {
    const d = m.def, w = this.g.world;
    const per = Math.max(2, Math.ceil(((d.capacity ?? 600) / 60) * 0.1 / GRAIN_KG) + 1);
    let n = 0;
    for (const key of Object.keys(m.out)) {
      const gm = GRAIN[key];
      if (gm === undefined) { this.pushAdjacent(m, key); continue; }
      const unit = key === 'bloco_massa' ? 1 : GRAIN_KG;
      const ports = this.ports(m, key);
      const aux = Math.min(255, Math.round((m.g[key] ?? 1) * 40));
      while ((m.out[key] ?? 0) >= unit - 1e-6 && n < per) {
        let ok = false;
        for (const [x, y] of ports) {
          // saída caindo direto em outra máquina (peças empilhadas): entra nela
          const occ = w.occAtCell(x, y);
          if (occ && occ !== m.id) { this.lastAux = aux; if (this.sinkGrain(occ, gm)) { ok = true; break; } continue; }
          if (w.spawnGrain(x, y, gm, aux, true)) { ok = true; break; }
        }
        if (!ok) { if (!m.state.startsWith('Saída')) m.state = 'Saída bloqueada: limpe a frente da porta'; break; }
        bagAdd(m.out, key, -unit); n++;
      }
    }
  }

  /** células de saída: lateral (calha da seta), por baixo, ou peneira (minerais por baixo, resíduo pela lateral) */
  private ports(m: Machine, key: string): [number, number][] {
    const d = m.def;
    const down = d.outMode === 'bottom' || (d.outMode === 'sieve' && key !== 'residuo');
    if (down) {
      // grade de baixo: espalha pela largura (como peneira)
      const y = (m.ty + d.h) * TILE_CELLS, out: [number, number][] = [];
      const x0 = m.tx * TILE_CELLS + 1, x1 = (m.tx + d.w) * TILE_CELLS - 2;
      const start = Math.floor(Math.random() * (x1 - x0 + 1));
      for (let k = 0; k <= x1 - x0; k++) out.push([x0 + ((start + k) % (x1 - x0 + 1)), y]);
      return out;
    }
    let side: number; // 0 = direita, 2 = esquerda
    if (d.behavior === 'drill' || d.behavior === 'complex') side = m.dir === 0 ? 2 : m.dir === 2 ? 0 : 2;
    else side = m.dir === 2 ? 2 : 0;
    const x = side === 0 ? (m.tx + d.w) * TILE_CELLS : m.tx * TILE_CELLS - 1;
    // peneira: o resíduo escorrega pela borda de cima; o resto sai de baixo para cima pela lateral
    const out: [number, number][] = [];
    if (d.outMode === 'sieve') { for (let y = m.ty * TILE_CELLS; y < (m.ty + d.h) * TILE_CELLS; y++) out.push([x, y]); return out; }
    for (let y = (m.ty + d.h) * TILE_CELLS - 1; y >= m.ty * TILE_CELLS - 1; y--) out.push([x, y]);
    return out;
  }

  /** itens sem grão (barras, peças) só passam para armazéns/máquinas encostados */
  private pushAdjacent(m: Machine, key: string) {
    const d = m.def;
    const per: [number, number][] = [];
    for (let x = 0; x < d.w; x++) { per.push([m.tx + x, m.ty - 1]); per.push([m.tx + x, m.ty + d.h]); }
    for (let y = 0; y < d.h; y++) { per.push([m.tx - 1, m.ty + y]); per.push([m.tx + d.w, m.ty + y]); }
    for (const [tx, ty] of per) {
      const o = this.at(tx, ty);
      if (!o || o === m || !OUTLETS.has(o.def.behavior)) continue;
      const q = Math.min(LOT, m.out[key]);
      if (this.accept(o, key, q, m.g[key])) { bagAdd(m.out, key, -q); return; }
    }
  }

  /** um grão tenta entrar na máquina `id` (caindo em cima ou empurrado por esteira) */
  sinkGrain(id: number, mat: number): boolean {
    const m = this.byId.get(id);
    const k = GRAIN_ITEM[mat];
    if (!m || !k) return false;
    const b = m.def.behavior;
    if (b === 'belt' || b === 'scaffold' || b === 'blower') return false;
    if (b === 'tube') {
      const q = m.q ?? (m.q = []);
      if (q.length >= this.tubeCap(m)) return false;
      q.push({ m: mat, a: this.lastAux, d: this.lastDist });
      this.lastDist = 0;
      return true;
    }
    if (b === 'riser') return this.riserTake(m, mat);
    if (b === 'filter') {
      // Filtro: o tipo escolhido passa por baixo, o resto desvia. Ímã/Ressonador: os do grupo são puxados para o lado da seta, o resto cai.
      const w = this.g.world, d = m.def;
      const side = d.pick ? d.pick.includes(k) : !(m.filter && k === m.filter);
      const tries: [number, number][] = [];
      if (!side) { const y = (m.ty + d.h) * TILE_CELLS; for (let i = 0; i < d.w * TILE_CELLS - 2; i++) tries.push([m.tx * TILE_CELLS + 1 + ((i * 5 + m.produced) % (d.w * TILE_CELLS - 2)), y]); }
      else { const x = m.dir === 2 ? m.tx * TILE_CELLS - 1 : (m.tx + d.w) * TILE_CELLS; for (let y = m.ty * TILE_CELLS; y < (m.ty + d.h) * TILE_CELLS; y++) tries.push([x, y]); }
      if (this.dropAt(m, tries, mat)) { m.produced += GRAIN_KG; m.state = d.pick ? (side ? 'Separando ' + (ITEM[k]?.name ?? k) : 'Deixando passar') : side ? 'Desviando' : 'Passando ' + (ITEM[k]?.name ?? k); return true; }
      m.state = 'Travado: saída bloqueada';
      return false;
    }
    if (b === 'silo') {
      if (!SILO_KEYS.has(k)) return this.siloOverflow(m, mat);
      // raros (Lumenita Pura, etc.) entram como extra em qualquer silo; o tipo do silo é o do 1º mineral comum
      if (!RARE_KEYS.has(k)) {
        const lock = m.filter ?? (Object.keys(m.inb).find(x => (m.inb[x] ?? 0) > 0 && !RARE_KEYS.has(x)));
        if (lock && lock !== k) return this.siloOverflow(m, mat);
      }
      if (bagTotal(m.inb) + GRAIN_KG > this.siloCap()) return this.siloOverflow(m, mat);
      gradeMix(m.g, m.inb[k] ?? 0, k, GRAIN_KG, this.lastAux / 40);
      bagAdd(m.inb, k, GRAIN_KG);
      return true;
    }
    if (b === 'launcher') {
      if (m.loaders > 14 || m.broken) return false;
      const d = m.dir === 2 ? -1 : 1;
      const ok = this.g.world.launch((m.tx + 0.5) * TILE + d * 6, m.ty * TILE - 2, d * (120 + Math.random() * 30), -210 - Math.random() * 20, mat, this.lastAux);
      if (ok) { m.loaders++; m.produced += GRAIN_KG; m.state = 'Arremessando'; }
      return ok;
    }
    const q = k === 'bloco_massa' ? 1 : GRAIN_KG;
    return this.accept(m, k, q, this.lastAux / 40);
  }
  lastAux = 40;
  /** tenta soltar o grão numa das células (ou dentro da máquina encostada) */
  private dropAt(m: Machine, tries: [number, number][], mat: number): boolean {
    const w = this.g.world;
    for (const [x, y] of tries) {
      const occ = w.occAtCell(x, y);
      if (occ && occ !== m.id) { if (this.sinkGrain(occ, mat)) return true; continue; }
      if (w.spawnGrain(x, y, mat, this.lastAux, true)) return true;
    }
    return false;
  }
  /** silo cheio ou grão de outro tipo: transborda pelo lado da seta */
  private siloOverflow(m: Machine, mat: number): boolean {
    const d = m.def, x = m.dir === 2 ? m.tx * TILE_CELLS - 1 : (m.tx + d.w) * TILE_CELLS, tries: [number, number][] = [];
    for (let y = m.ty * TILE_CELLS; y < (m.ty + d.h) * TILE_CELLS; y++) tries.push([x, y]);
    const ok = this.dropAt(m, tries, mat);
    m.state = ok ? 'Transbordando pelo lado ' + (m.dir === 2 ? '◀' : '▶') : 'Cheio e sem saída: libere o lado da seta';
    return ok;
  }
  siloCap() { return fabVal(this.g.flags, 'silo'); }
  /** total guardado em silos de um mineral */
  siloCount(k: string) { let n = 0; for (const m of this.list) if (m.def.behavior === 'silo') n += m.inb[k] ?? 0; return n; }
  siloTake(k: string, q: number) {
    for (const m of this.list) { if (q <= 0) break; if (m.def.behavior !== 'silo') continue; const a = Math.min(q, m.inb[k] ?? 0); if (a > 0) { bagAdd(m.inb, k, -a); q -= a; } }
  }
  lastDist = 0;

  // ---- esteiras: empurram os grãos apoiados em cima ----
  private updateBelts(dt: number) {
    const w = this.g.world;
    for (const b of this.belts) {
      if (b.broken) continue;
      b.prog += dt * (b.def.speed ?? 1) * TILE_CELLS * 1.5;
      if (b.prog < 1) continue;
      b.prog -= Math.floor(b.prog);
      const d = b.dir === 2 ? -1 : 1;
      const y = b.ty * TILE_CELLS - 1;
      if (y < 0) continue;
      let moved = 0, stuck = false;
      for (let k = 0; k < TILE_CELLS; k++) {
        const x = d > 0 ? b.tx * TILE_CELLS + TILE_CELLS - 1 - k : b.tx * TILE_CELLS + k;
        const i = y * WORLD_W + x;
        const m = w.mat[i];
        if (!IS_LOOSE[m]) continue;
        const nx = x + d, ni = i + d;
        const occ = w.occAtCell(nx, y);
        if (occ && occ !== b.id) {
          const o = this.byId.get(occ);
          if (o && o.def.behavior !== 'belt') {
            this.lastAux = w.aux[i];
            if (this.sinkGrain(occ, m)) { w.set(x, y, MAT.AIR); moved++; continue; }
            stuck = true; continue;
          }
        }
        const t = w.mat[ni];
        if (t === MAT.AIR || IS_LIQUID[t]) { const a = w.aux[i]; w.set(x, y, t); w.set(nx, y, m, a); moved++; }
        else stuck = true;
      }
      b.state = stuck && !moved ? 'Travada: a ponta não tem para onde ir' : moved ? 'ok' : 'Vazia';
    }
  }

  // ---- soprador automático: aspira pilhas soltas no raio e sopra para o tubo (ou no ar) ----
  private blowerRun(m: Machine, dt: number) {
    const w = this.g.world;
    const R = fabVal(this.g.flags, 'alcance') * TILE_CELLS;
    const cx = Math.floor((m.tx + 0.5) * TILE_CELLS), cy = Math.floor((m.ty + 0.5) * TILE_CELLS);
    m.prog = Math.min(20, (m.prog ?? 0) + fabVal(this.g.flags, 'vazao') / 60 * dt / GRAIN_KG);
    let budget = Math.floor(m.prog);
    m.prog -= budget;
    // varredura incremental do quadrado do raio (barata mesmo com muitos sopradores)
    const side = R * 2 + 1, total = side * side;
    let s = m.scan ?? 0, got = 0;
    for (let n = 0; n < 900 && budget > 0; n++) {
      s = (s + 7919) % total;
      const x = cx - R + (s % side), y = cy - R + Math.floor(s / side);
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > R * R || y < m.ty * TILE_CELLS) continue;   // só do nível dele para baixo (não rouba da fábrica)
      const mat = w.get(x, y);
      if (!IS_LOOSE[mat]) continue;
      const k = GRAIN_ITEM[mat]; if (!k) continue;
      const q = k === 'bloco_massa' ? 1 : GRAIN_KG;
      gradeMix(m.g, m.out[k] ?? 0, k, q, w.aux[y * WORLD_W + x] / 40);
      bagAdd(m.out, k, q);
      w.set(x, y, MAT.AIR);
      budget--; got += q;
      // rastro visual do grão sendo puxado
      if (Math.random() < 0.15) this.g.fx.ember(x * CELL, y * CELL, [180, 220, 255]);
    }
    m.scan = s;
    m.fin *= 0.97;
    this.flow(m, 'fin', got, dt);
    m.state = m.fin > 1 ? `Aspirando · ${Math.round(m.fin)} kg/min` : 'Sem pilhas no alcance: cave perto dele';
    // sem tubo encostado: sopra no ar para o lado da seta
    const d = m.dir === 2 ? -1 : 1;
    const nb = this.at(m.tx + d, m.ty);
    if (!nb || nb.def.behavior !== 'tube') {
      for (const k of Object.keys(m.out)) {
        let n = 0;
        while ((m.out[k] ?? 0) >= GRAIN_KG && n++ < 3) {
          if (!w.launch((m.tx + 0.5) * TILE + d * 9, m.ty * TILE + 4, d * (140 + Math.random() * 30), -150 - Math.random() * 30, GRAIN[k], Math.round((m.g[k] ?? 1) * 40))) break;
          bagAdd(m.out, k, -GRAIN_KG);
        }
      }
    }
  }

  // ---- tubos pneumáticos: pacotes andam de tubo em tubo; pressão acaba após 14 tiles sem reforçador ----
  private tubeAcc = 0;
  private tubeTick = 0;
  private updateTubes(dt: number) {
    this.tubeAcc += dt * 10;
    while (this.tubeAcc >= 1) {
      this.tubeAcc -= 1;
      const tick = ++this.tubeTick;
      const pmax = fabVal(this.g.flags, 'pressao');
      for (const t of this.list) {
        if (t.def.behavior !== 'tube' || !t.q || !t.q.length) continue;
        if (t.broken) { t.state = 'QUEBRADO'; continue; }
        const rate = t.key === 'tubo_gigante' ? 3 : 1;
        for (let r = 0; r < rate && t.q.length; r++) if (!this.tubeStep(t, tick, pmax)) break;
      }
    }
  }
  /** capacidade de cada tubo (pacotes em trânsito) */
  tubeCap(t: Machine) { return t.key === 'tubo_gigante' ? 12 : 4; }
  /** move o pacote da frente de um tubo; false = travou */
  private tubeStep(t: Machine, tick: number, pmax: number): boolean {
    const p = t.q![0];
    if (p.t === tick) return false;          // já andou neste passo (um tile por passo)
    const booster = t.key === 'reforcador', limit = t.key === 'tubo_gigante' ? pmax * 3 : pmax;
    if (!booster && p.d >= limit) { t.state = 'Sem pressão: ponha um Reforçador aqui'; return false; }
    const [dx, dy] = DIRS[t.dir];
    const n = this.at(t.tx + dx, t.ty + dy);
    if (n && n.def.behavior === 'tube') {
      const nq = n.q ?? (n.q = []);
      if (nq.length >= this.tubeCap(n)) { t.state = 'Fila'; return false; }
      t.q!.shift();
      // o gigante conta 1/3 de pressão por tile
      const step = n.key === 'tubo_gigante' ? 1 / 3 : 1;
      nq.push({ m: p.m, a: p.a, d: n.key === 'reforcador' ? 0 : (booster ? 0 : p.d) + step, t: tick });
      t.state = 'ok';
      return true;
    }
    const w = this.g.world;
    const drop = (x: number, y: number) => { if (w.spawnGrain(Math.floor(x), Math.floor(y), p.m, p.a, true)) { t.q!.shift(); t.state = 'ok'; return true; } t.state = 'Boca bloqueada'; return false; };
    if (n && (n.def.behavior === 'belt' || n.def.behavior === 'scaffold' || n.def.behavior === 'platform')) {
      // boca apontando para uma esteira/piso: o grão é largado EM CIMA dela
      return drop((n.tx + 0.5) * TILE_CELLS, n.ty * TILE_CELLS - 1);
    }
    if (n) {
      // saída encostada numa máquina: entra pelo funil/lateral dela
      this.lastAux = p.a;
      if (this.sinkGrain(n.id, p.m)) { t.q!.shift(); t.state = 'ok'; return true; }
      t.state = 'Destino recusa: ' + (ITEM[GRAIN_ITEM[p.m]]?.name ?? ''); return false;
    }
    // boca do tubo em cima de um funil: cai direto dentro da máquina de baixo
    const below = dy === 0 ? this.at(t.tx + dx, t.ty + 1) : undefined;
    if (below && !['tube', 'belt', 'scaffold', 'platform'].includes(below.def.behavior)) {
      this.lastAux = p.a;
      if (this.sinkGrain(below.id, p.m)) { t.q!.shift(); t.state = 'ok'; return true; }
      t.state = `${below.def.name} cheia: esperando`; return false;
    }
    // boca do tubo: o grão sai no ar, no meio do tile seguinte
    return drop((t.tx + 0.5 + dx) * TILE_CELLS, (t.ty + 0.5 + dy) * TILE_CELLS);
  }

  // ---- extratores (Ímã / Ressonador) por cima da esteira: puxam o metal / os cristais da terra que passa embaixo ----
  private extractorRun(m: Machine, dt: number) {
    const w = this.g.world, d = m.def, L = this.g.planet.layer, comp = compOf(L);
    const magnet = d.key === 'ima';
    const mine = comp.minerals.filter((x: { k: string }) => d.pick!.includes(x.k));
    const rareOk = d.pick!.includes(comp.rare.k);
    const x0 = m.tx * TILE_CELLS, x1 = (m.tx + d.w) * TILE_CELLS, y0 = (m.ty + d.h) * TILE_CELLS, y1 = y0 + TILE_CELLS * 2;
    let budget = bagTotal(m.out) >= OUT_CAP ? 0 : Math.max(1, Math.round(60 * dt * 6)), got = 0, seen = 0;   // cheio (sem tubo): deixa a terra passar
    const raw = RAW_BY_LAYER[L], done = magnet ? 'bruto_sm' : 'bruto_sc', other = magnet ? 'bruto_sc' : 'bruto_sm';
    for (let y = y0; y < y1 && budget > 0; y++) for (let x = x0; x < x1 && budget > 0; x++) {
      const mat = w.get(x, y);
      if (!IS_LOOSE[mat]) continue;
      const k = GRAIN_ITEM[mat];
      if (k !== raw && k !== 'fragmentado' && k !== other) continue;
      seen++; budget--;
      const grade = w.aux[y * WORLD_W + x] / 40 || 1;
      // chance do grão inteiro ser do mineral (fração em massa × teor); a terra que sobra muda de cor
      let p = 0; for (const mm of mine) p += mm.frac * grade;
      if (k === other) p /= Math.max(0.3, 1 - (comp.minerals.filter((x: { k: string }) => !d.pick!.includes(x.k)).reduce((a: number, b: { frac: number }) => a + b.frac, 0) * grade));
      const pr = rareOk ? comp.rare.frac * grade : 0;
      const r = Math.random();
      if (r < p + pr) {
        let kk = comp.rare.k;
        if (r < p) { const base = k === other ? p : 1; let acc = 0; for (const mm of mine) { acc += mm.frac * grade * (k === other ? p / Math.max(1e-9, mine.reduce((a2, b2) => a2 + b2.frac * grade, 0)) : base); if (r < acc) { kk = mm.k; break; } } if (kk === comp.rare.k) kk = mine[mine.length - 1]?.k ?? kk; }
        bagAdd(m.out, kk, GRAIN_KG); m.g[kk] = grade;
        w.set(x, y, MAT.AIR); got += GRAIN_KG;
        this.g.sectors.counter(L, 'separated', GRAIN_KG);
        if (Math.random() < 0.5) this.g.fx.ember(x * CELL, y * CELL, magnet ? [230, 236, 250] : [90, 180, 255]);
      } else {
        w.set(x, y, GRAIN[k === other ? 'residuo' : done], w.aux[y * WORLD_W + x]);
      }
    }
    m.fin *= 0.97; this.flow(m, 'fin', got, dt);
    // o que puxou vai para o Tubo de Vácuo encostado (qualquer lado); sem tubo, empilha em cima
    const tubes: Machine[] = [];
    for (let i = -1; i <= d.w; i++) for (const [tx, ty] of [[m.tx + i, m.ty - 1], [m.tx + i, m.ty + d.h]] as [number, number][]) { const o = this.at(tx, ty); if (o && o.def.behavior === 'tube' && !tubes.includes(o)) tubes.push(o); }
    for (const tx of [m.tx - 1, m.tx + d.w]) { const o = this.at(tx, m.ty); if (o && o.def.behavior === 'tube' && !tubes.includes(o)) tubes.push(o); }
    let out = 0;
    for (const k of Object.keys(m.out)) {
      while ((m.out[k] ?? 0) >= GRAIN_KG - 1e-6 && out < 6) {
        let ok = false;
        for (const t of tubes) { this.lastAux = Math.round((m.g[k] ?? 1) * 40); this.lastDist = 0; if (this.sinkGrain(t.id, GRAIN[k])) { ok = true; break; } }
        if (!ok) break;
        bagAdd(m.out, k, -GRAIN_KG); out++;
      }
    }
    const name = magnet ? 'metal' : 'cristais';
    m.state = bagTotal(m.out) >= OUT_CAP ? 'Saída cheia: ligue um Tubo de Vácuo nele' : !tubes.length ? `Ligue um Tubo de Vácuo encostado nele (${Math.round(bagTotal(m.out))} kg esperando)` : got > 0 ? `Puxando ${name}` : seen ? 'Terra passando' : 'Esperando terra na esteira embaixo';
  }

  // ---- elevador de grãos: coluna vertical que leva grãos até o topo e solta para o lado ----
  private riserTake(m: Machine, mat: number): boolean {
    let top = m;
    for (let guard = 0; guard < 80; guard++) { const up = this.at(top.tx, top.ty - 1); if (!up || up.def.behavior !== 'riser') break; top = up; }
    const x = top.dir === 2 ? top.tx * TILE_CELLS - 1 : (top.tx + 1) * TILE_CELLS, y = top.ty * TILE_CELLS;
    top.prog = (top.prog ?? 0);
    if (top.loaders > 20) return false;           // vazão por passo
    if (!this.g.world.spawnGrain(x, y, mat, this.lastAux)) { top.state = 'Saída do topo bloqueada'; return false; }
    top.loaders++; top.produced += GRAIN_KG; top.state = 'Elevando';
    return true;
  }
  private updateRisers() { for (const m of this.list) if (m.def.behavior === 'riser' || m.def.behavior === 'launcher') m.loaders = 0; }

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
      list: this.list.map(m => ({ id: m.id, key: m.key, tx: m.tx, ty: m.ty, dir: m.dir, cond: m.cond, broken: m.broken, overheat: m.overheat, buried: m.buried, inb: m.inb, out: m.out, level: m.level, eff: m.eff, filter: m.filter, recipe: m.recipe, belt: m.belt, depth: m.depth, exhausted: m.exhausted, charged: m.charged, produced: m.produced, g: m.g, mix: m.mix, lg: m.lg, prog: m.def.behavior === 'compactor' ? m.prog : 0 })),
    };
  }
  load(s: any) {
    this.nextId = s.nextId; this.shipList = s.shipList; this.shipped = s.shipped ?? {};
    for (const o of s.list) {
      const def = MACHINE[o.key]; if (!def) continue;
      const m: Machine = { ...o, def, sector: this.g.world.sectorAtTile(o.tx, o.ty), state: 'ok', prog: o.prog ?? 0, boost: 1, working: false, loaders: 0, rr: 0, t: 0, g: o.g ?? {}, mix: o.mix ?? {}, fin: 0, fout: 0, fres: 0 } as Machine;
      if (def.behavior === 'belt' && !m.belt) m.belt = [];
      this.add(m);
    }
  }
}

export type { Recipe };
