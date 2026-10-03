import './data/economy';
import { CELL, TILE, TILE_CELLS, SIM_DT, WORLD_TW, WORLD_TH, WORLD_W, WORLD_H, LEGACY_WORLD_W, LEGACY_WORLD_H, SURFACE_Y, wrapX, nearestX } from './core/constants';
import { MAT, IS_SOLID, IS_LOOSE } from './data/materials';
import { bus, EventBus } from './core/events';
import { World } from './world/World';
import { Sprites } from './render/Sprites';
import { TerrainRenderer } from './render/TerrainRenderer';
import { Camera } from './render/Camera';
import { Lighting } from './render/Lighting';
import { Particles } from './render/Particles';
import { Renderer } from './render/Renderer';
import { Input } from './input/Input';
import { Audio } from './audio/Audio';
import { Player } from './player/Player';
import { Backpack, Stock } from './systems/Inventory';
import { Machines, DELIVERY_PAY, type Machine } from './systems/Machines';
import { Robots, type Robot } from './systems/Robots';
import { SectorSystem } from './systems/Sectors';
import { PlanetProgress } from './systems/Planet';
import { Research } from './systems/Research';
import { Crafting } from './systems/Crafting';
import { Contracts } from './systems/Contracts';
import { Dialogue } from './systems/Dialogue';
import { Lore, type Artifact } from './systems/Lore';
import { Chests, type Chest } from './systems/Chests';
import { Events, type Anomaly } from './systems/Events';
import { Scanner } from './systems/Scanner';
import { Blueprint } from './systems/Blueprint';
import { Mining } from './systems/Mining';
import { Hazards } from './systems/Hazards';
import { Stats } from './systems/Stats';
import { runOffline } from './systems/Offline';
import { saveSlot, packBytes, unpackBytes } from './systems/Save';
import { cloudSave } from './core/athg';
import { MACHINE, nextDir } from './data/machines';
import { SECTORS, LAYER_COUNT } from './data/sectors';
import { ITEM } from './data/items';
import { RAW_BY_LAYER, separate, KG_PER_UNIT } from './data/composition';
import type { UI } from './ui/UI';
import { SILO_KEYS } from './data/factory';
import { siloPlan, type SiloPlan } from './systems/SiloHelp';
import { METAS } from './data/metas';
import type { LoreDef } from './data/lore';

export type HotSlot = { type: 'tool' | 'item' | 'build'; key: string } | null;
export interface Hover { x: number; y: number; label: string; kind: 'machine' | 'artifact' | 'robot' | 'cargo' | 'anomaly' | 'stabilizer' | 'chest'; ref: any; hold?: number; }

export interface GameOptions { seed: number; contract: number; massMult: number; keepResearch?: string[]; layer?: number; }

export class Game {
  bus: EventBus = bus;
  world: World;
  sprites = new Sprites();
  terrain: TerrainRenderer;
  camera = new Camera();
  lighting = new Lighting();
  fx = new Particles();
  renderer: Renderer;
  input: Input;
  audio = new Audio();
  ui!: UI;
  player: Player;
  pack = new Backpack();
  stock = new Stock();
  machines: Machines;
  robots: Robots;
  sectors: SectorSystem;
  planet: PlanetProgress;
  research: Research;
  crafting: Crafting;
  contracts: Contracts;
  dialogue: Dialogue;
  lore: Lore;
  chests: Chests;
  events: Events;
  scanner: Scanner;
  blueprint!: Blueprint;
  mining: Mining;
  hazards: Hazards;
  stats = new Stats();
  opts: GameOptions;

  time = 0;
  paused = false;
  flags: Record<string, any> = { intro: true, tutorial: 0, cavesDense: true };
  hover: Hover | null = null;
  hold: { t: number; dur: number; label: string; key: string; done: () => void } | null = null;
  build = { active: false, key: null as string | null, dir: 0, reverse: false, deconstruct: false, tx: 0, ty: 0, anchor: null as [number, number] | null, dragging: false };
  hotbar: HotSlot[] = [
    { type: 'tool', key: 'drill' }, { type: 'tool', key: 'scanner' }, { type: 'item', key: 'explosivo' }, { type: 'item', key: 'sinalizador' },
    { type: 'item', key: 'kit_reparo' }, { type: 'build', key: 'esteira' }, { type: 'build', key: 'elevador_grao' }, { type: 'build', key: 'armazem' },
    { type: 'build', key: 'tubo' }, { type: 'item', key: 'medkit' },
  ];
  selected = 0;
  flares: { x: number; y: number; t: number }[] = [];
  final = { stabilizers: [] as { x: number; y: number; done: boolean }[], fired: false };
  private acc = 0;
  private saveT = 0;
  private lastSectorMusic = 1;
  /** volta de uma ausência: aplica na hora o que a fábrica produziu (nunca trava o jogo) */
  beginOffline(savedAt: number) {
    const away = Number.isFinite(savedAt) ? Math.max(0, Math.floor((Date.now() - savedAt) / 1000)) : 0;
    const rep = runOffline(this, away);
    if (rep) this.ui?.showOfflineReport(rep);
  }

  constructor(canvas: HTMLCanvasElement, opts: GameOptions) {
    this.opts = opts;
    this.world = new World(opts.seed + (opts.layer ?? 1) * 7919, opts.layer ?? 1);
    this.terrain = new TerrainRenderer(this.world, this.sprites);
    this.input = new Input(canvas);
    this.renderer = new Renderer(this, canvas);
    this.player = new Player(this);
    this.machines = new Machines(this);
    this.robots = new Robots(this);
    this.sectors = new SectorSystem(this);
    this.planet = new PlanetProgress(this, opts.massMult, opts.layer ?? 1);
    this.research = new Research(this);
    this.crafting = new Crafting(this);
    this.contracts = new Contracts(this);
    this.dialogue = new Dialogue(this);
    this.lore = new Lore(this);
    this.chests = new Chests(this);
    this.events = new Events(this);
    this.scanner = new Scanner(this);
    this.blueprint = new Blueprint(this);
    this.mining = new Mining(this);
    this.hazards = new Hazards(this);
    for (const k of opts.keepResearch ?? []) this.research.grant(k);
    this.wireEvents();
  }

  /** Base inicial: cápsula, gerador e terminal orbital na clareira de pouso. */
  /** Cápsula (Centro de Comando) e terminal no poço de pouso da camada atual. */
  setupBase() {
    // camada nova (depois de descer): a Nave acompanha; a linha é remontada pelo jogador com o reembolso
    this.setupStart(false);
  }


  /** Jogo novo: mapa vazio. O jogador monta a Plataforma Orbital e a cápsula desce sobre ela. */
  /**
   * Jogo novo: a Nave chega em órbita e larga no chão uma LINHA DE EXTRAÇÃO pronta
   * (soprador → tubo → esteira → Ímã/Ressonador → Incinerador). O jogador começa cavando, não montando.
   */
  setupStart(withLine = true) {
    const L = this.world.gen.landing;
    const tx = Math.floor((L.x * CELL) / TILE), gy = Math.floor((SURFACE_Y * CELL) / TILE);
    this.flags.awaitCapsule = false;
    this.blueprint.layout();
    this.placeShip();
    if (withLine) for (const it of this.blueprint.items) {
      if (it.id === 'tuboNave' || it.id === 'ima2' || it.id === 'res2') continue;   // esses o jogador constrói (são as lições)
      if (it.key === 'tubo') { for (const [x, y, d] of this.blueprint.tubePath(it)) this.machines.place('tubo', x, y, d); continue; }
      if (it.tx2 !== undefined) { for (let x = Math.min(it.tx, it.tx2); x <= Math.max(it.tx, it.tx2); x++) this.machines.place(it.key, x, it.ty, it.dir); continue; }
      const m = this.machines.place(it.key, it.tx, it.ty, it.dir);
      if (m) this.fx.dust(...this.machines.centerPx(m), 10);
    }
    this.player.x = (tx + 2.5) * TILE; this.player.y = gy * TILE;
    this.camera.x = this.player.x; this.camera.y = this.player.y;
    this.world.reveal(this.player.x, this.player.y, 26);
  }

  /** a Nave de carga fica em órbita, bem acima da base: é para ela que os minérios precisam subir */
  placeShip() {
    if (this.machines.list.some(m => m.def.behavior === 'ship')) return;
    const L = this.world.gen.landing;
    // centrada sobre a linha de extração: um tubo reto para cima, saindo do Ímã, entra na porta de carga
    const tx = Math.floor((L.x * CELL) / TILE), gy = Math.floor((SURFACE_Y * CELL) / TILE);
    for (const dy of [44, 42, 46, 40, 48]) if (this.machines.place('nave', tx, gy - dy, 0)) return;
  }

  /** cápsula descendo do céu (animação de pouso) */
  capsuleDrop: { tx: number; ty: number; t: number } | null = null;
  static readonly DROP_TIME = 3.2;
  /** procura uma Plataforma Orbital de 6+ peças em linha com espaço livre em cima */
  private findPad(): { tx: number; ty: number; x0: number; x1: number } | null {
    const pads = this.machines.list.filter(m => m.key === 'piso_orbital');
    const set = new Set(pads.map(m => m.tx + ',' + m.ty));
    const cdef = MACHINE.comando;
    for (const m of pads) {
      if (set.has((m.tx - 1) + ',' + m.ty)) continue;           // começo de uma fileira
      let x1 = m.tx; while (set.has((x1 + 1) + ',' + m.ty)) x1++;
      if (x1 - m.tx + 1 < 6) continue;
      for (let cx = x1 - 3; cx >= m.tx; cx--) if (!this.machines.canPlace(cdef, cx, m.ty - 3)) return { tx: cx, ty: m.ty - 3, x0: m.tx, x1 };
    }
    return null;
  }
  private updateCapsule(dt: number) {
    if (!this.flags.awaitCapsule) return;
    if (!this.capsuleDrop) {
      const pad = this.findPad();
      if (!pad) return;
      this.capsuleDrop = { tx: pad.tx, ty: pad.ty, t: 0 };
      this.audio.rumble(); this.dialogue.line('zena', 'Plataforma Orbital confirmada. Liberando a cápsula de comando: afaste-se do piso.');
      return;
    }
    const d = this.capsuleDrop;
    d.t += dt;
    const cx = (d.tx + 1.5) * TILE, by = (d.ty + 3) * TILE;
    if (d.t > Game.DROP_TIME - 0.9) { if (Math.random() < 0.6) this.fx.dust(cx + (Math.random() - 0.5) * 60, by, 2); this.shake(1.5); }
    if (d.t < Game.DROP_TIME) return;
    // pousou: cápsula + carga (Analisador em cima do piso, Terminal no chão ao lado)
    const p = this.player;
    if (p.x > d.tx * TILE - 4 && p.x < (d.tx + 3) * TILE + 4 && p.y > d.ty * TILE && p.y < by + 2) p.x = (d.tx + 3) * TILE + 10;
    this.machines.place('comando', d.tx, d.ty, 0);
    this.capsuleDrop = null; this.flags.awaitCapsule = false;
    this.shake(8); this.fx.dust(cx, by, 30); this.audio.success();
    const pad = { y: d.ty + 3 };
    for (let x = d.tx - 2; x >= d.tx - 8; x--) if (this.machines.place('analisador', x, pad.y - 2, 0)) break;
    if (!this.machines.count('analisador')) this.placeAnalyzer();
    const gy = Math.floor((SURFACE_Y * CELL) / TILE);
    this.blueprint.layout();
    this.toast('Cápsula de comando pousou: base ativa', '#9cff8a');
  }

  /** Analisador de Matriz: a primeira "máquina" de processamento, manual, ao lado da cápsula. */
  placeAnalyzer() {
    if (this.machines.count('analisador')) return;
    const c = this.machines.list.find(m => m.def.behavior === 'command'); if (!c) return;
    const gy = Math.floor((SURFACE_Y * CELL) / TILE);
    for (const dx of [-3, -11, 5, 7]) if (this.machines.place('analisador', c.tx + dx, gy - 2, 0)) return;
  }

  /** Material bruto disponível para o Analisador (mochila + estoque). */
  rawAvailable(): { k: string; q: number; grade: number }[] {
    const out: { k: string; q: number; grade: number }[] = [];
    for (const k of [...RAW_BY_LAYER.filter(Boolean), 'fragmentado']) {
      const a = this.pack.count(k), b = this.stock.count(k);
      if (a + b < 1) continue;
      out.push({ k, q: a + b, grade: (this.pack.grade(k) * a + this.stock.grade(k) * b) / (a + b) });
    }
    return out;
  }
  analyzerCap() { return 100 * this.planet.layer; }

  /** Processamento manual: separa o material e devolve o relatório. */
  analyze(k: string, want: number, eff: number): { kg: number; grade: number; out: Record<string, number>; residue: number; pay: number } | null {
    const room = this.machines.yardRoom();
    want = Math.min(want, this.analyzerCap(), room / 0.8);
    if (want < 1) return null;
    const ga = this.pack.grade(k), gb = this.stock.grade(k);
    const a = this.pack.take(k, want);
    const b = this.stock.take(k, want - a);
    const kg = a + b;
    if (kg <= 0) return null;
    const grade = (ga * a + gb * b) / kg;
    const layer = k === 'fragmentado' ? this.planet.layer : Math.max(1, RAW_BY_LAYER.indexOf(k));
    const res = separate(layer, kg, grade, eff);
    let pay = 0, minerals = 0;
    for (const o in res.out) {
      this.stock.add(o, res.out[o]);
      pay += res.out[o] * (ITEM[o]?.value ?? 1) * DELIVERY_PAY;
      minerals += res.out[o];
      this.contracts.onShip(o, res.out[o]);
    }
    this.stock.add('residuo', res.residue);
    this.stock.credits += pay;
    // minerais vão para o saldo; só saem do planeta quando chegam à Nave
    const L = this.planet.layer;
    this.sectors.counter(L, 'analyzed', kg);
    this.sectors.counter(L, 'separated', minerals);
    this.stats.processed += minerals;
    if (!this.flags.firstAnalysis) { this.flags.firstAnalysis = true; setTimeout(() => this.dialogue.sayAll('first_analysis'), 600); }
    return { kg, grade, out: res.out, residue: res.residue, pay };
  }

  /** mede a massa REAL da camada: cada célula de terra/rocha (e grão solto) do mapa é 1 unidade (2 kg) */
  measureLayer() {
    const L = this.planet.layer;
    if (this.planet.targets[L] > 0) return;
    const m = this.world.mat; let n = 0;
    for (let i = 0; i < m.length; i++) { const v = m[i]; if (v !== MAT.EDGE && (IS_SOLID[v] || IS_LOOSE[v])) n++; }
    this.planet.targets[L] = n + this.planet.units[L];
  }

  setupNew() {
    this.setupStart();
    this.measureLayer();
    this.markLayerStart();
    this.stock.add('ferronox', 270, false); this.stock.add('lumenita', 120, false);   // kit inicial: a primeira fábrica vertical inteira, com folga
    this.pack.add('kit_soprador', 1);   // um soprador extra na mão (o outro já está na linha)
    this.stock.credits = 300;
    this.pack.add('sinalizador', 3); this.pack.add('kit_reparo', 1);
    this.world.reveal(this.player.x, this.player.y, 22);
    for (let i = 0; i < 3; i++) { const c = this.contracts.generate(); if (c) this.contracts.available.push(c); }
  }

  basePos(): [number, number] {
    const c = this.machines.list.find(m => m.def.behavior === 'command');
    if (!c) { const L = this.world.gen.landing; return [(Math.floor((L.x * CELL) / TILE) + 2.5) * TILE, Math.floor((SURFACE_Y * CELL) / TILE) * TILE - 2]; }
    return [(c.tx + 1.5) * TILE, (c.ty + c.def.h) * TILE];
  }

  nearPowerSource(x: number, y: number) {
    for (const m of this.machines.list) {
      const b = m.def.behavior;
      if ((b === 'command' || b === 'generator' || (b === 'reactor' && m.working)) && !m.broken) {
        const [mx, my] = this.machines.centerPx(m);
        if (Math.hypot(nearestX(mx, x) - x, my - y) < 48 + m.def.w * 8) return true;
      }
    }
    return false;
  }

  toast(text: string, color = '#cfe') { this.ui?.toast(text, color); }
  say(pool: string, cooldown = 0) { this.dialogue.say(pool, cooldown); }
  shake(a: number) { this.camera.shakeA = Math.max(this.camera.shakeA, a); }

  // ------------------------------------------------------------------
  private wireEvents() {
    const b = this.bus;
    b.on('mass_milestone', (i: number) => { this.say('mass_' + i); if (i >= 6) this.ui.banner('MARCO PLANETÁRIO', `${['0,00001', '0,0001', '0,001', '0,01', '0,1', '1', '5', '10', '25', '50', '75', '90', '99'][i]}% da massa planetária extraída`); });
    b.on('enter_sector', (s: number) => { this.say('enter_' + s, 300); this.ui.sectorTitle(s); });
    b.on('sector_discovered', (s: number) => this.toast(`Nova camada: ${SECTORS[s - 1].name}`, SECTORS[s - 1].accent));
    b.on('machine_broken', (m: Machine) => { this.say('machine_broken', 45); this.scanner.addMarker(...this.machines.centerPx(m), `${m.def.name} quebrada`, '#ff4a3a', 'broken'); });
    b.on('overheat', () => this.say('overheat', 60));
    b.on('drill_exhausted', (m: Machine) => { this.say('drill_exhausted', 60); this.toast(`${m.def.name}: faixa limpa, agora perfurando em profundidade (rende menos).`, '#ffd04a'); });
    b.on('repaired', () => { this.say('repaired', 60); this.scanner.mapMarkers = this.scanner.mapMarkers.filter(x => x.kind !== 'broken' || this.machines.list.some(m => m.broken && Math.hypot(this.machines.centerPx(m)[0] - x.x, this.machines.centerPx(m)[1] - x.y) < 4)); });
    b.on('calibrated', () => this.say('calibrated', 30));
    b.on('complex_drift', () => this.say('complex_drift', 240));
    b.on('robot_built', (r: Robot) => { if (r.name === 'KILO') this.say('robot_built'); else this.dialogue.line('br7', `${r.name} ativado. Ele seguirá as regras literalmente.`); });
    b.on('robot_stuck', (r: Robot) => { this.say('robot_stuck', 60); this.scanner.addMarker(r.x, r.y, `${r.name} preso`, '#ffd27a', 'robot'); });
    b.on('research_done', (r: any) => { this.say('research_done', 30); this.ui.banner('Pesquisa concluída', r.name); this.audio.success(); });
    b.on('lore_unlocked', (l: LoreDef) => {
      this.say('discovery', 120);
      if (l.kind === 'templo') this.ui.templeChoice(l);
      if (this.lore.unlocked.size === 1) this.dialogue.line('sera', 'Dra. Sera Venn, arqueologia. A Zenitex me mandou "catalogar". Eu vou fazer mais do que isso.');
    });
    b.on('sector_certified', (s: number) => this.ui.banner('SETOR CERTIFICADO', `${SECTORS[s - 1].name}: Complexo de Extração Profunda autorizado`));
    b.on('sector_automated', (s: number) => { this.say('complex_built'); this.ui.banner('AUTOMAÇÃO SETORIAL', `${SECTORS[s - 1].name} extraindo a reserva profunda — e gerando novos problemas`); });
    b.on('layer_done', (l: number) => {
      this.audio.success();
      setTimeout(() => this.ui.layerSummary(l), 1800);
      if (l < LAYER_COUNT) {
        this.ui.banner(`${SECTORS[l - 1].name.toUpperCase()} ESGOTADA`, `Desça para a ${SECTORS[l].name} pelo Centro de Comando (botão DESCER)`);
        this.dialogue.line('zena', `Camada ${l} esgotada. O planeta acaba de perder uma casca inteira. Próxima parada: ${SECTORS[l].name}. Sua base será empacotada sem custo.`);
        this.dialogue.line('rocha', 'Lá embaixo é mais duro. Melhora o perfurador antes de descer, se der.');
      }
    });
    b.on('complex_upgraded', (m: Machine) => this.toast(`${m.def.name} atualizado`, '#9cff8a'));
  }

  // ------------------------------------------------------------------
  update(dt: number) {
    if (this.paused) {
      if (this.input.pressed('Escape')) this.ui.closeTop();
      this.input.endFrame();
      return;
    }
    this.time += dt;
    const inp = this.input;
    const cam = this.camera;
    // mundo <-> tela
    const dpr = cam.w / window.innerWidth;
    if (inp.touch && inp.aimActive) {
      const d = Math.hypot(inp.aimX, inp.aimY) || 1;
      inp.worldX = this.player.x + (inp.aimX / d) * 60; inp.worldY = this.player.y - 12 + (inp.aimY / d) * 60;
    } else {
      inp.worldX = cam.left() + (inp.mouseX * dpr) / cam.zoom;
      inp.worldY = cam.top() + (inp.mouseY * dpr) / cam.zoom;
    }
    // DESMONTAR no celular: tocar ou arrastar o dedo sobre as peças remove cada uma
    if (this.build.active && this.build.deconstruct && inp.touch && inp.placeDirty) {
      const tx = Math.floor((cam.left() + inp.placeX * dpr / cam.zoom) / TILE), ty = Math.floor((cam.top() + inp.placeY * dpr / cam.zoom) / TILE);
      this.build.tx = tx; this.build.ty = ty;
      this.dismantleAt(tx, ty);
      inp.placeDirty = false; inp.placeStart = false;
    }
    if (this.build.active && !this.build.deconstruct) {
      const b = this.build, line = this.isLineBuild();
      this.lockGuide();
      if (inp.touch && inp.placeDirty) {
        const tx = Math.floor((cam.left() + inp.placeX * dpr / cam.zoom) / TILE);
        const ty = Math.floor((cam.top() + inp.placeY * dpr / cam.zoom) / TILE);
        // esteira: o toque inicial fixa o começo da linha; arrastar estende até o dedo
        if (line && inp.placeStart) b.anchor = [tx, ty];
        b.tx = tx; b.ty = ty;
        if (!line) this.snapBuild();
        this.lockGuide();
        inp.placeDirty = false; inp.placeStart = false;
      } else if (!inp.touch && !inp.uiCapture) {
        if (line && inp.clickPrimary()) { b.anchor = [Math.floor(inp.worldX / TILE), Math.floor(inp.worldY / TILE)]; b.dragging = true; }
        if (b.dragging && !inp.primary) b.dragging = false;
        if (inp.mouseMoved && (!line || !b.anchor || b.dragging)) { b.tx = Math.floor(inp.worldX / TILE); b.ty = Math.floor(inp.worldY / TILE); if (!line) this.snapBuild(); }
      }
    }
    if (inp.wheel && !inp.uiCapture && !inp.down('Control')) { cam.targetZoom = Math.max(0.25 * dpr, Math.min(4 * dpr, cam.targetZoom - inp.wheel * 0.25 * dpr)); this.flags.userZoom = true; }

    if (!this.flags.intro && !this.flags.ending) this.controls(dt);

    // simulação em passo fixo
    this.acc += dt;
    let n = 0;
    while (this.acc >= SIM_DT && n++ < 5) { this.acc -= SIM_DT; this.sim(SIM_DT); }
    if (n >= 5) this.acc = 0;

    cam.follow(this.player.x, this.player.y - 10, dt);
    this.fx.update(dt);
    this.updateAudio(dt);
    this.saveT += dt;
    if (this.saveT > 60 && !this.flags.intro && !this.flags.ending) { this.saveT = 0; this.save(); }
    inp.endFrame();
  }

  private sim(dt: number) {
    const p = this.player;
    const [mx, my] = this.flags.intro || this.flags.ending || this.ui.modalOpen() ? [0, 0] : this.input.axis();
    p.update(dt, mx, my, this.input.down('Shift'));
    this.world.ensureAroundPx(p.x, p.y, 700);
    // no celular o joystick direito SEMPRE minera; a barra rápida só dispara ações
    const mining = !this.flags.intro && !this.ui.modalOpen() && !this.input.uiCapture && this.input.primary && (this.input.touch || this.hotbar[this.selected]?.key === 'drill') && !this.build.active;
    const blowing = !this.flags.intro && !this.ui.modalOpen() && !this.build.active && (this.input.touch ? !!this.flags.blowMode && this.input.primary : this.input.secondary && !this.input.uiCapture);
    this.mining.updatePlayer(dt, mining && !blowing, this.input.worldX, this.input.worldY);
    this.mining.blow(dt, blowing, this.input.worldX, this.input.worldY);
    this.world.updateFlyers(dt);
    this.mining.update(dt);
    this.machines.update(dt);
    // areia: dois passos por tick (queda rápida)
    this.world.simulate(); this.world.simulate();
    this.robots.update(dt);
    this.sectors.update(dt);
    this.planet.update(this.time);
    this.research.update(dt);
    this.crafting.update(dt);
    this.contracts.update(dt);
    this.dialogue.update(dt);
    this.events.update(dt);
    this.scanner.update(dt);
    this.hazards.update(dt);
    this.stock.tick(this.time);
    for (const f of this.flares) f.t -= dt;
    this.flares = this.flares.filter(f => f.t > 0);
    this.updateCapsule(dt);
    this.tutorial();
    this.finalLogic();
    // ambiente: brasas, bolhas, poeira
    const sec = this.world.sectorAtPx(p.x, p.y);
    if (Math.random() < 0.3 && p.y > (this.world.gen.landing.y + 20) * CELL) {
      const x = p.x + (Math.random() - 0.5) * 500, y = p.y + (Math.random() - 0.5) * 300;
      if ([3, 6, 7].includes(sec)) this.fx.ember(x, y, [255, 120 + Math.random() * 80, 40]);
      else if ([1, 2, 5].includes(sec)) { if (sec !== 1 || Math.random() < 0.3) this.fx.ember(x, y, sec === 2 ? [160, 255, 60] : sec === 5 ? [200, 255, 220] : [80, 255, 140]); }
      else if (sec === 4) this.fx.ember(x, y, [200, 240, 255]);
      else if (sec === 5 && Math.random() < 0.3) this.fx.ember(x, y, [180, 120, 255]);
    }
  }

  // ------------------------------------------------------------------
  private controls(dt: number) {
    const inp = this.input, ui = this.ui;
    if (inp.pressed('Escape')) { if (this.build.active) this.exitBuild(); else if (ui.closeTop()) { /* */ } else ui.toggleMenu(); }
    if (ui.modalOpen()) { this.hover = null; this.hold = null; return; }
    for (let i = 0; i < 10; i++) if (inp.pressed(String((i + 1) % 10))) this.selectSlot(i);
    if (inp.wheel && inp.down('Control')) this.selectSlot((this.selected + (inp.wheel > 0 ? 1 : 9)) % 10);
    if (inp.pressed('Tab')) ui.open(ui.panels.lastTab);
    if (inp.pressed('i')) ui.open('inventory');
    if (inp.pressed('m')) ui.open('map');
    if (inp.pressed('b')) ui.open('build');
    if (inp.pressed('k')) ui.open('research');
    if (inp.pressed('g')) ui.open('sectors');
    if (inp.pressed('j')) ui.open('contracts');
    if (inp.pressed('l')) ui.open('archive');
    if (inp.pressed('y')) ui.open('robots');
    if (inp.pressed('u')) ui.open('upgrades');
    if (inp.pressed('h') || inp.pressed('F1')) ui.open('help');
    if (inp.pressed('f')) this.scanner.pulse();
    if (inp.pressed('x')) this.startDismantle();
    if (inp.pressed('r')) this.rotateBuild();
    if (inp.pressed('q') && this.build.active) this.exitBuild();
    if (inp.pressed(' ')) this.dialogue.skip();

    // construção
    if (this.build.active) {
      if (inp.clickSecondary()) this.exitBuild();
      else if (this.build.deconstruct && inp.clickPrimary() && !inp.uiCapture) this.buildAction();
      else if (!this.build.deconstruct && inp.pressed('Enter')) this.confirmBuild();
      this.hover = null; this.hold = null;
      return;
    }
    // ferramentas
    const slot = this.hotbar[this.selected];
    if (slot && !inp.uiCapture) {
      if (slot.key === 'scanner' && inp.clickPrimary()) this.scanner.pulse();
      if (slot.type === 'item' && inp.clickPrimary()) this.useItem(slot.key);
    }
    this.updateHover();
    // interação
    const h = this.hover;
    if (h && inp.pressed('e')) this.interact(h);
    if (this.hold) {
      if (!inp.down('e') && !(inp.touch && this.flags.touchHold)) this.hold = null;
      else {
        this.hold.t += dt;
        if (this.hold.t >= this.hold.dur) { const d = this.hold.done; this.hold = null; this.flags.touchHold = false; d(); }
      }
    }
  }

  /** Toque na barra rápida (celular): ação imediata, sem trocar a ferramenta de mineração. */
  tapSlot(i: number) {
    const s = this.hotbar[i];
    if (!s) return;
    if (s.type === 'build') { this.selectSlot(i); return; }
    this.selected = Math.max(0, this.hotbar.findIndex(x => x?.key === 'drill'));
    if (s.key === 'scanner') { this.scanner.pulse(); return; }
    if (s.type === 'item') {
      // mira: a última direção do joystick direito, ou à frente do personagem
      const p = this.player, inp = this.input;
      if (Math.hypot(inp.worldX - p.x, inp.worldY - p.y) < 24) {
        const D = [[1, 0], [0, 1], [-1, 0], [0, -1]][p.facing];
        inp.worldX = p.x + D[0] * 60; inp.worldY = p.y + D[1] * 60;
      }
      this.useItem(s.key);
    }
    this.audio.click();
  }

  selectSlot(i: number) {
    this.selected = i;
    const s = this.hotbar[i];
    if (s?.type === 'build') { if (this.canBuildKey(s.key)) this.startBuild(s.key); else this.toast('Ainda não desbloqueado', '#ff8a3a'); }
    else this.exitBuild();
    this.audio.click();
  }
  // ---- melhorias: minerais saem dos SILOS; o resto (barras, peças) do estoque ----
  // um saldo só: estoque + silos (melhorias tiram primeiro dos silos)
  upHave(k: string) { return this.stock.count(k) + this.pack.count(k) + (SILO_KEYS.has(k) ? this.machines.siloCount(k) : 0); }
  upHas(cost: Record<string, number>) { for (const k in cost) if (this.upHave(k) < cost[k] - 1e-6) return false; return true; }
  upPay(cost: Record<string, number>) {
    if (!this.upHas(cost)) return false;
    const rest: Record<string, number> = {};
    for (const k in cost) { let need = cost[k]; if (SILO_KEYS.has(k)) { const fromSilo = Math.min(need, this.machines.siloCount(k)); this.machines.siloTake(k, fromSilo); need -= fromSilo; } if (need > 0) rest[k] = need; }
    return this.stock.pay(rest, this.pack.items);
  }

  /** prévia de construção: se o tile apontado não serve (no ar ou dentro do chão), encaixa no chão mais próximo logo acima/abaixo */
  /** construindo a peça que o guia pede: a prévia fica travada no quadrado verde */
  private lockGuide() {
    const it = this.guide()?.item, b = this.build;
    if (!it || !b.active || b.key !== it.key || this.ui.tutorial.currentBp()) return;
    const d = MACHINE[it.key];
    b.tx = it.tx + Math.floor((d.w - 1) / 2); b.ty = it.ty + Math.floor((d.h - 1) / 2);
  }
  private snapBuild() {
    const b = this.build, def = b.key ? MACHINE[b.key] : null;
    if (!def || this.ui.tutorial.currentBp()) return;
    const ox = b.tx - Math.floor((def.w - 1) / 2), oy = b.ty - Math.floor((def.h - 1) / 2);
    if (!this.machines.canPlace(def, ox, oy)) return;
    for (const dy of [1, -1, 2, -2, 3, 4]) if (!this.machines.canPlace(def, ox, oy + dy)) { b.ty += dy; return; }
  }

  /** guia de montagem fora do tutorial (metas de silo): peça marcada no mapa e peça a desmontar */
  private guideT = -1; private guideV: SiloPlan | null = null;
  guide(): SiloPlan | null {
    if (this.time - this.guideT < 0.3 && this.guideT >= 0) return this.guideV;
    this.guideT = this.time;
    const L = this.planet.layer, md = METAS[L]?.[this.sectors.s[L]?.phase ?? 0];
    this.guideV = !this.ui.tutorial.active && md?.kind === 'silo' && this.machines.siloCount(md.key) < md.kg ? siloPlan(this, md.key) : null;
    return this.guideV;
  }

  canBuildKey(k: string) { const d = MACHINE[k]; return !!d && (!d.research || this.research.has(d.research)) && d.behavior !== 'command' && d.behavior !== 'ship'; }
  startBuild(k: string) {
    const [tx, ty] = this.freeSpotFor(k);
    this.build = { active: true, key: k, dir: this.build.dir, reverse: false, deconstruct: false, tx, ty, anchor: null, dragging: false };
    this.input.placeMode = true;
    this.input.placeDirty = false;
    this.input.mouseMoved = false;
  }
  /** Local livre mais próximo do jogador para a prévia (evita nascer sobre máquinas ou rocha). */
  private freeSpotFor(k: string): [number, number] {
    const def = MACHINE[k];
    const px = Math.floor(this.player.x / TILE), py = Math.floor(this.player.y / TILE);
    if (!def) return [px + 2, py];
    const hw = Math.floor((def.w - 1) / 2), hh = Math.floor((def.h - 1) / 2);
    // vista lateral: primeiro tenta no chão em que o jogador está, para os lados
    const foot = Math.floor((this.player.y - 1) / TILE);
    for (let k = 1; k <= 14; k++) for (const sgn of [1, -1]) {
      const ox = px + sgn * k - (sgn < 0 ? def.w - 1 : 0), oy = foot - def.h + 1;
      if (px >= ox - 1 && px <= ox + def.w) continue;
      if (!this.machines.canPlace(def, ox, oy)) return [ox + hw, oy + hh];
    }
    for (let r = 1; r <= 12; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = px + dx, ty = py + dy, ox = tx - hw, oy = ty - hh;
        // não cobrir nem encostar no jogador (evita prendê-lo)
        if (px >= ox - 1 && px <= ox + def.w && py >= oy - 1 && py <= oy + def.h) continue;
        if (!this.machines.canPlace(def, ox, oy)) return [tx, ty];
      }
    }
    return [px + 2, py];
  }
  exitBuild() {
    // volta para o perfurador: senão o slot de construção continua ativo e nada minera
    if (this.hotbar[this.selected]?.type === 'build') this.selected = 0;
    this.build.active = false; this.build.deconstruct = false; this.build.key = null; this.build.anchor = null; this.build.dragging = false; this.input.placeMode = false; }
  rotateBuild() {
    const def = MACHINE[this.build.key ?? ''];
    this.build.dir = nextDir(def, this.build.dir);
    if (def?.behavior === 'belt' && this.build.anchor) this.build.reverse = !this.build.reverse;
  }
  isLineBuild() { const d = this.build.key ? MACHINE[this.build.key] : null; return !!d && (d.behavior === 'belt' || d.behavior === 'riser' || d.behavior === 'scaffold' || d.behavior === 'tube'); }

  /**
   * Linha de peças arrastando: esteira = horizontal (anda no sentido do arrasto);
   * Elevador de Grãos = coluna vertical (a seta da saída no topo vem do GIRAR); Plataforma = horizontal ou vertical.
   */
  beltPath(): [number, number, number][] {
    const b = this.build;
    const def = b.key ? MACHINE[b.key] : null;
    if (!b.anchor) return [[wrapX(b.tx, WORLD_TW), b.ty, def?.behavior === 'tube' ? b.dir : b.dir === 2 ? 2 : 0]];
    const [ax, ay] = b.anchor;
    const out: [number, number, number][] = [];
    if (def?.behavior === 'tube') {
      // tubo: caminho em L (primeiro na vertical, depois na horizontal); cada peça aponta para a próxima
      const pts: [number, number][] = [[ax, ay]];
      let x = ax, y = ay;
      while (y !== b.ty && pts.length < 120) { y += Math.sign(b.ty - y); pts.push([x, y]); }
      let dx = b.tx - x;
      if (dx > WORLD_TW / 2) dx -= WORLD_TW;
      if (dx < -WORLD_TW / 2) dx += WORLD_TW;
      for (let n = 0; n < Math.abs(dx) && pts.length < 120; n++) { x += Math.sign(dx); pts.push([wrapX(x, WORLD_TW), y]); }
      const dirOf = (dx: number, dy: number) => { if (dx > WORLD_TW / 2) dx -= WORLD_TW; if (dx < -WORLD_TW / 2) dx += WORLD_TW; return dx > 0 ? 0 : dy > 0 ? 1 : dx < 0 ? 2 : 3; };
      for (let i = 0; i < pts.length; i++) {
        const [px, py] = pts[i];
        const [nx, ny] = i < pts.length - 1 ? pts[i + 1] : pts.length > 1 ? [px * 2 - pts[i - 1][0], py * 2 - pts[i - 1][1]] : [px + (b.dir === 2 ? -1 : 1), py];
        out.push([px, py, pts.length === 1 ? b.dir : dirOf(nx - px, ny - py)]);
      }
      return out;
    }
    const vertical = def?.behavior === 'riser' || (def?.behavior === 'scaffold' && Math.abs(b.ty - ay) > Math.abs(b.tx - ax));
    if (vertical) {
      const step = b.ty >= ay ? 1 : -1;
      for (let y = ay; ; y += step) { out.push([ax, y, b.dir === 2 ? 2 : 0]); if (y === b.ty || out.length >= 60) break; }
      return out;
    }
    let delta = b.tx - ax;
    if (delta > WORLD_TW / 2) delta -= WORLD_TW;
    if (delta < -WORLD_TW / 2) delta += WORLD_TW;
    const dir = delta > 0 ? 0 : delta < 0 ? 2 : (b.dir === 2 ? 2 : 0);
    const beltDir = b.reverse && delta !== 0 ? (dir + 2) % 4 : dir;
    const step = delta >= 0 ? 1 : -1;
    for (let n = 0; n <= Math.abs(delta) && out.length < 120; n++) out.push([wrapX(ax + n * step, WORLD_TW), ay, def?.behavior === 'belt' ? beltDir : (b.dir === 2 ? 2 : 0)]);
    return out;
  }

  private placeBeltLine() {
    const def = MACHINE[this.build.key!];
    let placed = 0, turned = 0, blocked = 0, poor = false, joined = false;
    for (const [tx, ty, dir] of this.beltPath()) {
      const ex = this.machines.at(tx, ty);
      // RAMAL: um tubo novo que chega num tubo existente se liga nele (sem girar a linha principal)
      if (def.behavior === 'tube' && ex && ex.def.behavior === 'tube' && placed > 0) { joined = true; break; }
      if (def.behavior === 'tube' && ex && ex.def.behavior === 'tube') continue;   // nunca gira um tubo que já existe
      if (ex && ex.key === def.key) { if (def.rotatable && ex.dir !== dir) { ex.dir = dir; turned++; } continue; } // reaproveita peça existente
      if (this.machines.canPlace(def, tx, ty)) { blocked++; continue; }
      if (!this.stock.pay(def.cost, this.pack.items)) { poor = true; break; }
      if (this.machines.place(def.key, tx, ty, dir)) { placed++; this.stats.built++; }
    }
    if (placed || turned) { this.audio.click(); this.toast(`${placed} ${def.behavior === 'tube' ? 'tubo(s)' : def.behavior === 'scaffold' ? 'peça(s) de piso' : def.behavior === 'riser' ? 'peça(s) de elevador' : 'esteira(s)'} instalada(s)${turned ? `, ${turned} girada(s)` : ''}`, '#9cff8a'); }
    if (joined) this.toast('Ramal ligado ao tubo principal', '#9cff8a');
    if (blocked) this.toast(`${blocked} trecho(s) obstruído(s) foram pulados`, '#ffd04a');
    if (poor) { this.toast('Recursos acabaram no meio da linha', '#ff8a3a'); this.audio.error(); }
    // linha instalada: volta ao perfurador (ficar preso no modo construção parecia travamento)
    if (placed || turned) this.exitBuild(); else this.build.anchor = null;
  }

  confirmBuild() {
    if (!this.build.active || this.build.deconstruct || this.ui.modalOpen()) return;
    // projeto guiado: não deixa confirmar girado errado
    const bp = this.ui.tutorial.currentBp() ?? this.guide()?.item ?? null;
    const def = this.build.key ? MACHINE[this.build.key] : null;
    if (bp && def && bp.key === def.key && def.rotatable && def.behavior !== 'belt' && def.behavior !== 'tube' && this.build.dir !== bp.dir) {
      this.toast(`Gire primeiro: a seta tem que apontar para ${['a DIREITA', 'BAIXO', 'a ESQUERDA', 'CIMA'][bp.dir]} (botão GIRAR)`, '#ffd04a'); this.audio.error(); return;
    }
    this.buildAction();
  }

  /** desmonta a peça neste tile (esteiras e tubos inclusive): devolve o custo inteiro */
  dismantleAt(tx: number, ty: number): boolean {
    const m = this.machines.at(tx, ty) ?? this.machines.list.find(x => x.def.behavior === 'platform' && x.tx === tx && x.ty === ty);
    if (!m) return false;
    if (m.def.behavior === 'command' || m.def.behavior === 'analyzer' || m.def.behavior === 'ship') { this.toast(`${m.def.name}: não pode ser desmontada.`, '#ff8a3a'); return false; }
    if (m.key === 'soprador') this.pack.add('kit_soprador', 1);
    else for (const k in m.def.cost) this.stock.add(k, m.def.cost[k], false);
    this.machines.remove(m);
    this.audio.click();
    this.fx.dust(...this.machines.centerPx(m), 8);
    return true;
  }
  startDismantle() { this.exitBuild(); this.build.active = true; this.build.deconstruct = true; this.input.placeMode = true; this.input.placeDirty = false; }

  private buildAction() {
    const inp = this.input;
    const tx = this.build.deconstruct ? Math.floor(inp.worldX / TILE) : this.build.tx;
    const ty = this.build.deconstruct ? Math.floor(inp.worldY / TILE) : this.build.ty;
    if (this.build.deconstruct) {
      if (!inp.clickPrimary()) return;
      this.dismantleAt(tx, ty);
      return;
    }
    const def = MACHINE[this.build.key!];
    if (!def) return;
    if (this.isLineBuild()) { this.placeBeltLine(); return; }
    const ox = tx - Math.floor((def.w - 1) / 2), oy = ty - Math.floor((def.h - 1) / 2);
    const err = this.machines.canPlace(def, ox, oy);
    if (err) { this.toast(err, '#ff8a3a'); this.audio.error(); return; }
    if (Math.hypot(nearestX((ox + def.w / 2) * TILE, this.player.x) - this.player.x, (oy + def.h / 2) * TILE - this.player.y) > 260) { this.toast('Muito longe para construir', '#ff8a3a'); this.audio.error(); return; }
    const useKit = def.key === 'soprador' && this.pack.count('kit_soprador') >= 1;
    if (useKit) this.pack.take('kit_soprador', 1);
    else if (!this.stock.pay(def.cost, this.pack.items)) { this.toast('Recursos insuficientes (Estoque Central + aspirador)', '#ff8a3a'); this.audio.error(); return; }
    const m = this.machines.place(def.key, ox, oy, this.build.dir);
    if (!m && useKit) this.pack.add('kit_soprador', 1);
    if (m) {
      this.stats.built++;
      this.audio.click();
      this.fx.dust(...this.machines.centerPx(m), 6);
      if (!this.flags['built_' + def.key]) {
        this.flags['built_' + def.key] = true;
        if (this.stats.built === 1) this.say('build_first');
        if (def.behavior === 'drill') this.say('t_build_drill');
        if (def.behavior === 'complex') this.say('complex_built');
        if (def.behavior === 'lab') this.say('t_lab');
      }
      this.exitBuild();
    }
  }

  private useItem(k: string) {
    const p = this.player, inp = this.input;
    if (this.pack.count(k) < 1) { this.toast(`Sem ${ITEM[k]?.name ?? k} no equipamento`, '#ff8a3a'); return; }
    switch (k) {
      case 'explosivo': this.mining.throwExplosive(inp.worldX, inp.worldY); break;
      case 'sinalizador': this.pack.take(k, 1); this.flares.push({ x: inp.worldX, y: inp.worldY, t: 240 }); this.scanner.addMarker(inp.worldX, inp.worldY, 'Sinalizador', '#ffb04a', 'flare'); break;
      case 'medkit': this.pack.take(k, 1); p.hp = Math.min(p.maxHp, p.hp + 60); this.toast('+60 de vida', '#9cff8a'); break;
      case 'kit_reparo': {
        const h = this.hover;
        if (h?.kind === 'machine') { const m = h.ref as Machine; if (m.cond < 100 || m.broken) { this.machines.repair(m); this.toast(`${m.def.name} reparada`, '#9cff8a'); } }
        else this.toast('Mire em uma máquina danificada', '#ff8a3a');
        break;
      }
      case 'plataforma_kit': {
        const tx = Math.floor(inp.worldX / TILE), ty = Math.floor(inp.worldY / TILE);
        if (this.machines.canPlace(MACHINE.plataforma, tx, ty)) { this.toast('Só sobre líquidos ou abismos', '#ff8a3a'); return; }
        this.pack.take(k, 1); this.machines.place('plataforma', tx, ty, 0);
        break;
      }
    }
  }

  private updateHover() {
    const p = this.player;
    let best: Hover | null = null, bd = 30;
    const consider = (x: number, y: number, h: Omit<Hover, 'x' | 'y'>, extra = 0) => {
      const screenX = nearestX(x, this.input.worldX);
      const nearX = nearestX(x, p.x);
      const d = Math.min(Math.hypot(nearX - p.x, y - p.y), Math.hypot(screenX - this.input.worldX, y - this.input.worldY) + 10) - extra;
      if (d < bd && Math.hypot(nearX - p.x, y - p.y) < 34 + extra) { bd = d; best = { x: screenX, y, ...h }; }
    };
    for (const a of this.events.anomalies) consider(a.x, a.y, { label: '[E] Estabilizar anomalia (segure)', kind: 'anomaly', ref: a });
    for (const a of this.lore.artifacts) if (this.lore.visible(a) && Math.abs(nearestX(a.x, p.x) - p.x) < 60 && Math.abs(a.y - p.y) < 60) consider(a.x, a.y, { label: '[E] Catalogar registro (segure)', kind: 'artifact', ref: a });
    for (const c of this.chests.list) if (Math.abs(nearestX(c.x, p.x) - p.x) < 60 && Math.abs(c.y - p.y) < 60 && this.chests.visible(c)) consider(c.x, c.y, { label: '[E] Abrir baú de Khelos', kind: 'chest', ref: c });
    if (p.cargo) consider(p.cargo.x, p.cargo.y, { label: '[E] Recuperar carga', kind: 'cargo', ref: p.cargo });
    for (const r of this.robots.list) {
      if (Math.abs(nearestX(r.x, p.x) - p.x) > 50 || Math.abs(r.y - p.y) > 50) continue;
      const lbl = r.stuck ? `[E] Resgatar ${r.name}` : r.broken ? `[E] Reparar ${r.name}` : r.energy < 99 ? `[E] Recarregar ${r.name}` : '';
      if (lbl) consider(r.x, r.y, { label: lbl, kind: 'robot', ref: r });
    }
    for (const s of this.final.stabilizers) if (!s.done) consider(s.x, s.y, { label: '[E] Ajustar estabilizador do núcleo', kind: 'stabilizer', ref: s }, 8);
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    const seen = new Set<Machine>();
    for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
      const m = this.machines.at(tx + i, ty + j);
      if (!m || seen.has(m) || m.def.behavior === 'belt') continue;
      seen.add(m);
      const [cx, cy] = this.machines.centerPx(m);
      const lbl = m.broken ? `[E] Reparar ${m.def.name} (segure)` : m.overheat ? `[E] Calibrar ${m.def.name}` : `[E] ${m.def.name}`;
      consider(cx, cy, { label: lbl, kind: 'machine', ref: m }, m.def.w * 6);
    }
    this.hover = best;
  }

  private interact(h: Hover) {
    const g = this;
    switch (h.kind) {
      case 'artifact': this.hold = { t: 0, dur: 1.6, label: 'Catalogando…', key: 'art', done: () => this.lore.catalog(h.ref as Artifact) }; break;
      case 'chest': this.hold = { t: 0, dur: 0.7, label: 'Abrindo…', key: 'chest', done: () => this.chests.open(h.ref as Chest) }; break;
      case 'anomaly': this.hold = { t: 0, dur: 2.5, label: 'Estabilizando…', key: 'an', done: () => this.events.resolveAnomaly(h.ref as Anomaly) }; break;
      case 'cargo': {
        const c = this.player.cargo!;
        for (const k in c.items) { const got = this.pack.add(k, c.items[k]); c.items[k] -= got; if (c.items[k] > 0.01) this.stock.add(k, c.items[k], false); }
        this.player.cargo = null; this.toast('Carga recuperada', '#9cff8a'); break;
      }
      case 'robot': { const msg = this.robots.manual(h.ref as Robot); if (msg) this.toast(msg, '#9cff8a'); break; }
      case 'stabilizer': this.ui.calibrate(null, 'final', (q) => { (h.ref as any).done = true; this.say('final_seal'); this.audio.success(); void q; }); break;
      case 'machine': {
        const m = h.ref as Machine;
        if (m.broken) { this.hold = { t: 0, dur: 2.2, label: 'Reparando…', key: 'rep', done: () => { if (g.machines.repair(m)) g.toast(`${m.def.name} reparada`, '#9cff8a'); else g.toast('Precisa de Peças de Reposição, Kit de Reparo ou 20 Ferronox', '#ff8a3a'); } }; return; }
        if (m.overheat) { this.ui.calibrate(m, 'normal'); return; }
        if (m.def.behavior === 'command' || m.def.behavior === 'storage' || m.def.behavior === 'link') this.depositPack();
        if (m.def.behavior === 'analyzer') { this.ui.mini.analyzer(); break; }
        this.ui.openMachine(m);
      }
    }
    this.flags.touchHold = this.input.touch;
  }

  depositPack() {
    let n = 0, pay = 0;
    for (const k of Object.keys(this.pack.items)) {
      const c = ITEM[k]?.cat;
      if (c === 'consumivel') continue;
      const gr = this.pack.grade(k);
      const q = this.pack.take(k, this.pack.count(k));
      this.stock.add(k, q, true, gr); n += q;
      pay += q * (ITEM[k]?.value ?? 1) * DELIVERY_PAY;
      this.contracts.onShip(k, q);
    }
    if (n > 0) {
      this.stock.credits += pay;
      this.sectors.counter(this.planet.layer, 'delivered', n);
      this.toast(`Entregue: ${Math.round(n)} kg · +${Math.round(pay)} ◆ créditos`, '#9cff8a');
      this.audio.success();
      if (this.flags.tutorial === 1) { this.flags.tutorial = 2; this.flags.firstDeliver = this.time; this.say('t_first_deliver'); this.ui.flashMass(); }
    }
  }

  private tutorial() {
    const t = this.flags.tutorial;
    if (this.flags.intro) return;
    if (t === 0 && this.stats.manualKg >= 50) { this.flags.tutorial = 1; }
    if (t === 2 && this.machines.count('oficina')) { this.flags.tutorial = 3; this.audio.success(); }
    if (t === 3 && this.machines.count('laboratorio')) { this.flags.tutorial = 4; this.audio.success(); this.dialogue.line('zena', 'Infraestrutura mínima concluída. A partir de agora, siga a saga de automação do setor (G) e os contratos (J).'); }
    if (t === 2 && !this.flags.saidWorkshop && this.time - (this.flags.firstDeliver ?? 0) > 8) { this.flags.saidWorkshop = true; this.say('t_build_workshop'); }
  }

  tutorialObjectives(): { text: string; done: boolean; cur?: string }[] | null {
    const t = this.flags.tutorial;
    if (t >= 4) return null;
    const kg = Math.min(50, this.stats.manualKg);
    return [
      { text: 'Remova 50 kg de material', done: t >= 1, cur: `${Math.floor(kg)} / 50 kg` },
      { text: 'Entregue a carga no Centro de Comando [E]', done: t >= 2 },
      { text: 'Construa uma Oficina [B]', done: t >= 3 },
      { text: 'Construa uma Estação de Pesquisa', done: t >= 4 },
    ];
  }

  // ---------------- sequência final ----------------
  private finalLogic() {
    const f = this.planet.fraction();
    if (!this.flags.finalReady && f >= 0.99 - 1e-9) {
      this.flags.finalReady = true;
      this.say('final_start');
      this.ui.banner('ÚLTIMO 1%', 'Extração automática suspensa. Construa e opere o Cortador Planetário no Coração.');
      this.audio.alarm();
    }
    if (this.flags.finalSeq) {
      if (Math.random() < 0.02) { this.shake(3); this.audio.rumble(); }
      if (Math.random() < 0.004) this.audio.alarm();
      if (this.final.stabilizers.every(s => s.done) && !this.flags.finalArmed) {
        this.flags.finalArmed = true;
        this.say('final_fire');
        this.ui.banner('ESTABILIZADORES AJUSTADOS', 'Volte ao Cortador Planetário e dispare.');
      }
    }
  }

  startFinal(cutter: Machine) {
    if (!this.flags.finalReady) { this.toast('A massa planetária ainda não chegou a 99%.', '#ff8a3a'); return; }
    if (this.flags.finalSeq) return;
    this.flags.finalSeq = true;
    const c = this.world.gen.coreCenter;
    this.final.stabilizers = [0, 1, 2, 3].map(i => {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      return { x: c.x * CELL + Math.cos(a) * 30 * CELL, y: c.y * CELL + Math.sin(a) * 30 * CELL, done: false };
    });
    for (const s of this.final.stabilizers) { this.scanner.addMarker(s.x, s.y, 'Estabilizador do núcleo', '#ffb04a', 'stab'); this.world.reveal(s.x, s.y, 4); }
    this.ui.banner('DESMONTAGEM FINAL', 'Ajuste manualmente os 4 estabilizadores ao redor do núcleo.');
    void cutter;
  }

  fireCutter() {
    if (!this.flags.finalArmed || this.final.fired) return;
    this.final.fired = true;
    this.planet.finalDone = true;
    this.flags.ending = true;
    this.audio.boom();
    this.save();
    this.ui.ending();
  }

  // ---------------- áudio contínuo ----------------
  private updateAudio(dt: number) {
    const a = this.audio;
    a.setDrilling(this.mining.hitting, 1);
    const p = this.player;
    a.grainFall(this.world.motionNear(p.x, p.y));
    let near = 0;
    for (const m of this.machines.list) if (m.working && Math.abs(nearestX(m.tx * TILE, p.x) - p.x) < 300 && Math.abs(m.ty * TILE - p.y) < 300) near++;
    a.machinesHum(near);
    const s = this.world.sectorAtPx(p.x, p.y) || this.lastSectorMusic;
    this.lastSectorMusic = s;
    const nearBase = this.machines.list.some(m => m.def.behavior === 'command' && Math.hypot(nearestX((m.tx + 1.5) * TILE, p.x) - p.x, (m.ty + 1.5) * TILE - p.y) < 200);
    const danger = Object.keys(this.hazards.excess).length > 0;
    const mood = this.flags.finalSeq ? 'nucleo' : danger ? 'tenso' : near > 8 || nearBase ? 'industrial' : SECTORS[s - 1].music;
    a.updateMusic(dt, mood, !!this.ui?.discoveryOpen());
  }

  // ---------------- save ----------------
  serialize() {
    return {
      v: 5, savedAt: Date.now(), opts: this.opts, time: this.time, flags: this.flags, selected: this.selected, hotbar: this.hotbar,
      chunks: this.world.serializeChunks(), explored: packBytes(this.world.explored),
      regrow: this.world.regrowQueue,
      player: this.player.serialize(), pack: { items: this.pack.items, level: this.pack.level, g: this.pack.g },
      stock: { items: this.stock.items, credits: this.stock.credits, g: this.stock.g },
      machines: this.machines.serialize(), robots: this.robots.serialize(), sectors: this.sectors.serialize(),
      planet: this.planet.serialize(), research: this.research.serialize(), crafting: this.crafting.serialize(),
      contracts: this.contracts.serialize(), lore: this.lore.serialize(), chests: this.chests.serialize(), events: this.events.serialize(), stats: this.stats.serialize(),
      markers: this.scanner.mapMarkers, final: this.final, flares: this.flares, drops: this.mining.drops,
    };
  }

  load(s: any) {
    const legacy = s.v === 3;
    // até o v4 o mundo não tinha o céu alto: tudo desce para o fundo do mapa novo
    const fromW = legacy ? LEGACY_WORLD_W : WORLD_W, fromH = (s.v ?? 0) < 5 ? LEGACY_WORLD_H : WORLD_H;
    if (fromH !== WORLD_H) {
      const cells = WORLD_H - fromH, py = cells * CELL, ty = py / TILE;
      const sh = (o: any) => { if (o && typeof o.y === 'number') o.y += py; };
      sh(s.player); sh(s.player?.cargo);
      for (const m of s.machines?.list ?? []) m.ty += ty;
      for (const r of s.robots?.list ?? []) { sh(r); if (typeof r.zy === 'number') r.zy += py; }
      for (const a of s.events?.anomalies ?? []) sh(a);
      for (const a of s.markers ?? []) sh(a);
      for (const a of s.flares ?? []) sh(a);
      for (const a of s.drops ?? []) sh(a);
      for (const a of s.final?.stabilizers ?? []) sh(a);
      for (const a of s.regrow ?? []) a.y += cells;
    }
    if (legacy) {
      const cells = (WORLD_W - LEGACY_WORLD_W) / 2, px = cells * CELL, tiles = cells * CELL / TILE;
      const shiftPx = (o: any) => { if (o && typeof o.x === 'number') o.x += px; };
      shiftPx(s.player); shiftPx(s.player?.cargo);
      for (const m of s.machines?.list ?? []) m.tx += tiles;
      for (const r of s.robots?.list ?? []) { shiftPx(r); if (typeof r.zx === 'number') r.zx += px; shiftPx(r.target); }
      for (const a of s.events?.anomalies ?? []) shiftPx(a);
      for (const a of s.markers ?? []) shiftPx(a);
      for (const a of s.flares ?? []) shiftPx(a);
      for (const a of s.drops ?? []) shiftPx(a);
      for (const a of s.final?.stabilizers ?? []) shiftPx(a);
      for (const a of s.regrow ?? []) a.x += cells;
    }
    this.time = s.time; this.flags = s.flags; this.selected = s.selected ?? 0; if (s.hotbar) this.hotbar = s.hotbar;
    // Saves antigos conservam áreas exploradas. Nas áreas ainda ocultas, aplica a nova geração de cavernas.
    const denseTerrain = !legacy && !this.flags.cavesDense && s.chunks?.mat ? new Uint8Array(this.world.mat) : null;
    this.world.loadChunks(s.chunks, fromW, fromH);
    if (legacy) {
      const gen = this.world.gen, old = gen.legacySites(), left = (WORLD_W - LEGACY_WORLD_W) / 2, right = left + LEGACY_WORLD_W;
      const outerRuins = gen.ruins.filter(r => r.x0 + r.w <= left || r.x0 >= right);
      const outerLoose = gen.loose.filter(a => a.x < left || a.x >= right);
      gen.ruins.splice(0, gen.ruins.length, ...old.ruins, ...outerRuins);
      gen.loose.splice(0, gen.loose.length, ...old.loose, ...outerLoose);
      this.lore = new Lore(this, old);
      this.chests.migrateLegacy();
    }
    if (s.explored) {
      if (fromW !== WORLD_W || fromH !== WORLD_H) {
        const oldTw = fromW * CELL / TILE, oldTh = fromH * CELL / TILE, offset = (WORLD_TW - oldTw) / 2, offTy = WORLD_TH - oldTh;
        const old = new Uint8Array(oldTw * oldTh);
        unpackBytes(s.explored, old);
        for (let y = 0; y < oldTh; y++) this.world.explored.set(old.subarray(y * oldTw, (y + 1) * oldTw), (y + offTy) * WORLD_TW + offset);
      } else unpackBytes(s.explored, this.world.explored);
    }
    for (let i = 0; i < this.world.explored.length; i++) if (this.world.explored[i]) this.world.sectorTileExplored[this.world.sectorTiles[i]]++;
    this.world.regrowQueue = s.regrow ?? [];
    this.player.load(s.player); this.player.x = wrapX(this.player.x, WORLD_W * CELL); this.pack.items = s.pack.items; this.pack.level = s.pack.level; this.pack.g = s.pack.g ?? {};
    this.stock.items = s.stock.items; this.stock.credits = s.stock.credits; this.stock.g = s.stock.g ?? {};
    this.machines.load(s.machines); this.robots.load(s.robots); this.sectors.load(s.sectors);
    if (denseTerrain) {
      const px = Math.floor(s.player.x / TILE), py = Math.floor(s.player.y / TILE);
      const aroundMachines = new Uint8Array(WORLD_TW * WORLD_TH);
      for (const m of this.machines.list) for (let y = -2; y < m.def.h + 2; y++) for (let x = -2; x < m.def.w + 2; x++) {
        const ty = m.ty + y;
        if (ty >= 0 && ty < WORLD_TH) aroundMachines[ty * WORLD_TW + wrapX(m.tx + x, WORLD_TW)] = 1;
      }
      for (let ty = 0; ty < WORLD_TH; ty++) for (let tx = 0; tx < WORLD_TW; tx++) {
        const tile = ty * WORLD_TW + tx;
        if (this.world.explored[tile] || aroundMachines[tile] || Math.hypot(tx - px, ty - py) < 16) continue;
        for (let cy = 0; cy < TILE_CELLS; cy++) for (let cx = 0; cx < TILE_CELLS; cx++) {
          const i = (ty * TILE_CELLS + cy) * WORLD_W + tx * TILE_CELLS + cx;
          if (this.world.mat[i] === MAT.AIR && IS_SOLID[denseTerrain[i]]) this.world.mat[i] = denseTerrain[i];
        }
      }
    }
    this.flags.cavesDense = true;
    this.planet.load(s.planet); this.research.load(s.research); this.crafting.load(s.crafting);
    this.contracts.load(s.contracts); this.lore.load(s.lore); this.chests.load(s.chests); this.events.load(s.events); this.stats.load(s.stats);
    this.scanner.mapMarkers = s.markers ?? []; this.final = s.final ?? this.final; this.flares = s.flares ?? []; this.mining.drops = s.drops ?? [];
    this.flags.intro = false; this.flags.ending = false;
    // camada nova (acabou de descer): monta a cápsula no poço central
    // camada nova (acabou de descer, mapa vazio): a Nave chega e o jogador desce embaixo dela
    if (!this.machines.list.length) this.setupBase();
    this.placeShip();
    this.measureLayer();
    // saves antigos marcavam a camada como esgotada com a meta de 16 t: desfaz se ainda não acabou de verdade
    if (!this.planet.layerDone()) delete this.flags['layerDone' + this.planet.layer];
    this.blueprint.layout();
    this.camera.x = this.player.x; this.camera.y = this.player.y;
  }

  /** Marca o início da camada atual (para o resumo e o recorde). */
  markLayerStart() { this.flags.layerStart = { t: this.time, cells: this.stats.cells, chests: this.stats.chests, built: this.stats.built, lore: this.lore.unlocked.size }; }

  canDescend() { return this.planet.layerDone() && this.planet.layer < LAYER_COUNT; }
  descendBlocked() { return this.sectors.descendBlock(); }

  /** Desce para a próxima camada: empacota a base (100% de reembolso) e gera o mapa de baixo. */
  async descend() {
    if (!this.canDescend()) return;
    const block = this.descendBlocked();
    if (block) { this.toast(block, '#ff8a3a'); this.audio.error(); return; }
    const s: any = this.serialize();
    const next = this.planet.layer + 1;
    // reembolso integral de todas as construções e do conteúdo delas
    for (const m of this.machines.list) {
      if (m.def.behavior !== 'command' && m.def.behavior !== 'analyzer' && m.def.behavior !== 'terminal' || this.machines.list.filter(x => x.def.behavior === 'terminal').indexOf(m) > 0) for (const k in m.def.cost) this.stock.add(k, m.def.cost[k], false);
      for (const k in m.out) this.stock.add(k, m.out[k], false, m.g[k]);
      for (const k in m.inb) this.stock.add(k, m.inb[k], false, m.g[k]);
      if (m.belt) for (const l of m.belt) this.stock.add(l.k, l.q, false, l.g);
      if (m.def.behavior === 'compactor' && m.prog > 0) this.stock.add('residuo', m.prog, false);
    }
    for (const r of this.sectors.rt) for (const k in r.buffer) this.stock.add(k, r.buffer[k], false);
    for (const r of this.robots.list) for (const k in r.cargo) this.stock.add(k, r.cargo[k], false);
    const packed = this.machines.list.length - 1;
    s.stock = { items: this.stock.items, credits: this.stock.credits, g: this.stock.g };
    s.opts = { ...this.opts, layer: next };
    s.planet = { ...this.planet.serialize(), layer: next };
    s.chunks = {}; s.explored = ''; s.regrow = [];
    s.machines = { nextId: this.machines.nextId, shipList: this.machines.shipList, shipped: this.machines.shipped, list: [] };
    s.robots = { nextId: this.robots.nextId, list: [] };
    s.sectors.buffers = [];
    s.markers = []; s.flares = []; s.drops = [];
    s.player = { ...s.player, cargo: null };
    s.events = { anomalies: [] };
    s.lore = { ...s.lore, arts: [] };
    s.chests = [];
    s.flags = { ...s.flags, justDescended: next, packed };
    this.leaving = true;
    await saveSlot('slot1', s);
    location.reload();
  }

  leaving = false;   // durante descida/NG+: nenhum autosave pode sobrescrever o save preparado
  async save() {
    if (this.leaving) return;
    const s = this.serialize();
    const ok = await saveSlot('slot1', s);
    cloudSave(s);
    if (ok) this.ui?.savedIndicator();
  }
}

export { WORLD_TW };
