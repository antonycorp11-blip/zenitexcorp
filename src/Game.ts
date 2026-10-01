import { CELL, TILE, SIM_DT, WORLD_TILES } from './core/constants';
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
import { Machines, type Machine } from './systems/Machines';
import { Robots, type Robot } from './systems/Robots';
import { SectorSystem } from './systems/Sectors';
import { PlanetProgress } from './systems/Planet';
import { Research } from './systems/Research';
import { Crafting } from './systems/Crafting';
import { Contracts } from './systems/Contracts';
import { Dialogue } from './systems/Dialogue';
import { Lore, type Artifact } from './systems/Lore';
import { Events, type Anomaly } from './systems/Events';
import { Scanner } from './systems/Scanner';
import { Mining } from './systems/Mining';
import { Hazards } from './systems/Hazards';
import { Stats } from './systems/Stats';
import { saveSlot, packBytes, unpackBytes } from './systems/Save';
import { MACHINE } from './data/machines';
import { SECTORS } from './data/sectors';
import { ITEM } from './data/items';
import type { UI } from './ui/UI';
import type { LoreDef } from './data/lore';

export type HotSlot = { type: 'tool' | 'item' | 'build'; key: string } | null;
export interface Hover { x: number; y: number; label: string; kind: 'machine' | 'artifact' | 'robot' | 'cargo' | 'anomaly' | 'stabilizer'; ref: any; hold?: number; }

export interface GameOptions { seed: number; contract: number; massMult: number; keepResearch?: string[]; }

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
  events: Events;
  scanner: Scanner;
  mining: Mining;
  hazards: Hazards;
  stats = new Stats();
  opts: GameOptions;

  time = 0;
  paused = false;
  flags: Record<string, any> = { intro: true, tutorial: 0 };
  hover: Hover | null = null;
  hold: { t: number; dur: number; label: string; key: string; done: () => void } | null = null;
  build = { active: false, key: null as string | null, dir: 0, deconstruct: false, tx: 0, ty: 0 };
  hotbar: HotSlot[] = [
    { type: 'tool', key: 'drill' }, { type: 'tool', key: 'scanner' }, { type: 'item', key: 'explosivo' }, { type: 'item', key: 'sinalizador' },
    { type: 'item', key: 'kit_reparo' }, { type: 'build', key: 'esteira' }, { type: 'build', key: 'perfuradora' }, { type: 'build', key: 'armazem' },
    { type: 'build', key: 'holofote' }, { type: 'item', key: 'medkit' },
  ];
  selected = 0;
  flares: { x: number; y: number; t: number }[] = [];
  final = { stabilizers: [] as { x: number; y: number; done: boolean }[], fired: false };
  private acc = 0;
  private saveT = 0;
  private lastSectorMusic = 1;

  constructor(canvas: HTMLCanvasElement, opts: GameOptions) {
    this.opts = opts;
    this.world = new World(opts.seed);
    this.terrain = new TerrainRenderer(this.world, this.sprites);
    this.input = new Input(canvas);
    this.renderer = new Renderer(this, canvas);
    this.player = new Player(this);
    this.machines = new Machines(this);
    this.robots = new Robots(this);
    this.sectors = new SectorSystem(this);
    this.planet = new PlanetProgress(this, opts.massMult);
    this.research = new Research(this);
    this.crafting = new Crafting(this);
    this.contracts = new Contracts(this);
    this.dialogue = new Dialogue(this);
    this.lore = new Lore(this);
    this.events = new Events(this);
    this.scanner = new Scanner(this);
    this.mining = new Mining(this);
    this.hazards = new Hazards(this);
    for (const k of opts.keepResearch ?? []) this.research.grant(k);
    this.wireEvents();
  }

  /** Base inicial: cápsula, gerador e terminal orbital na clareira de pouso. */
  setupNew() {
    const L = this.world.gen.landing;
    const tx = Math.floor((L.x * CELL) / TILE), ty = Math.floor((L.y * CELL) / TILE);
    this.world.ensureAroundPx(L.x * CELL, L.y * CELL, 400);
    this.machines.place('comando', tx - 1, ty - 1, 0);
    this.machines.place('gerador', tx + 3, ty - 1, 0);
    this.machines.place('terminal_orbital', tx - 5, ty - 2, 0);
    this.player.x = (tx + 0.5) * TILE; this.player.y = (ty + 3) * TILE;
    this.camera.x = this.player.x; this.camera.y = this.player.y;
    this.stock.add('ferronox', 20, false); this.stock.add('lumenita', 10, false);
    this.stock.credits = 120;
    this.pack.add('sinalizador', 3); this.pack.add('kit_reparo', 1);
    this.world.reveal(this.player.x, this.player.y, 14);
    for (let i = 0; i < 3; i++) { const c = this.contracts.generate(); if (c) this.contracts.available.push(c); }
  }

  basePos(): [number, number] {
    const c = this.machines.list.find(m => m.def.behavior === 'command');
    if (!c) return [this.player.x, this.player.y];
    return [(c.tx + 1.5) * TILE, (c.ty + 3.6) * TILE];
  }

  nearPowerSource(x: number, y: number) {
    for (const m of this.machines.list) {
      const b = m.def.behavior;
      if ((b === 'command' || b === 'generator' || (b === 'reactor' && m.working)) && !m.broken) {
        const [mx, my] = this.machines.centerPx(m);
        if (Math.hypot(mx - x, my - y) < 48 + m.def.w * 8) return true;
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
    b.on('sector_discovered', (s: number) => this.toast(`Novo setor descoberto: ${SECTORS[s - 1].name}`, SECTORS[s - 1].accent));
    b.on('machine_broken', (m: Machine) => { this.say('machine_broken', 45); this.scanner.addMarker(...this.machines.centerPx(m), `${m.def.name} quebrada`, '#ff4a3a', 'broken'); });
    b.on('overheat', () => this.say('overheat', 60));
    b.on('drill_exhausted', (m: Machine) => { this.say('drill_exhausted', 60); this.toast(`${m.def.name}: veio esgotado. Realoque-a.`, '#ffd04a'); });
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
      inp.worldX = this.player.x + (inp.aimX / d) * 60; inp.worldY = this.player.y - 4 + (inp.aimY / d) * 60;
    } else {
      inp.worldX = cam.left() + (inp.mouseX * dpr) / cam.zoom;
      inp.worldY = cam.top() + (inp.mouseY * dpr) / cam.zoom;
    }
    if (this.build.active && !this.build.deconstruct) {
      if (inp.touch && inp.placeDirty) {
        this.build.tx = Math.floor((cam.left() + inp.placeX * dpr / cam.zoom) / TILE);
        this.build.ty = Math.floor((cam.top() + inp.placeY * dpr / cam.zoom) / TILE);
        inp.placeDirty = false;
      } else if (!inp.touch && inp.mouseMoved && !inp.uiCapture) {
        this.build.tx = Math.floor(inp.worldX / TILE);
        this.build.ty = Math.floor(inp.worldY / TILE);
      }
    }
    if (inp.wheel && !inp.uiCapture && !inp.down('Control')) { cam.targetZoom = Math.max(1, Math.min(4, cam.targetZoom - inp.wheel * 0.25)); this.flags.userZoom = true; }

    if (!this.flags.intro && !this.flags.ending) this.controls(dt);

    // simulação em passo fixo
    this.acc += dt;
    let n = 0;
    while (this.acc >= SIM_DT && n++ < 5) { this.acc -= SIM_DT; this.sim(SIM_DT); }
    if (n >= 5) this.acc = 0;

    cam.follow(this.player.x, this.player.y - 6, dt);
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
    const mining = !this.flags.intro && !this.ui.modalOpen() && !this.input.uiCapture && this.input.primary && this.hotbar[this.selected]?.key === 'drill' && !this.build.active;
    this.mining.updatePlayer(dt, mining, this.input.worldX, this.input.worldY);
    this.mining.update(dt);
    this.machines.update(dt);
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
    this.tutorial();
    this.finalLogic();
    // ambiente: brasas, bolhas, poeira
    const sec = this.world.sectorAtPx(p.x, p.y);
    if (Math.random() < 0.3) {
      const x = p.x + (Math.random() - 0.5) * 500, y = p.y + (Math.random() - 0.5) * 300;
      if ([3, 10, 12].includes(sec)) this.fx.ember(x, y, [255, 120 + Math.random() * 80, 40]);
      else if ([2, 5, 9].includes(sec)) this.fx.ember(x, y, sec === 5 ? [160, 255, 60] : sec === 9 ? [200, 255, 220] : [80, 255, 140]);
      else if (sec === 4) this.fx.ember(x, y, [200, 240, 255]);
      else if (sec === 8 && Math.random() < 0.5) this.fx.ember(x, y, [180, 120, 255]);
    }
  }

  // ------------------------------------------------------------------
  private controls(dt: number) {
    const inp = this.input, ui = this.ui;
    if (inp.pressed('Escape')) { if (this.build.active) this.exitBuild(); else if (ui.closeTop()) { /* */ } else ui.toggleMenu(); }
    if (ui.modalOpen()) { this.hover = null; this.hold = null; return; }
    for (let i = 0; i < 10; i++) if (inp.pressed(String((i + 1) % 10))) this.selectSlot(i);
    if (inp.wheel && inp.down('Control')) this.selectSlot((this.selected + (inp.wheel > 0 ? 1 : 9)) % 10);
    if (inp.pressed('Tab')) ui.open('inventory');
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
    if (inp.pressed('x')) { this.exitBuild(); this.build.active = true; this.build.deconstruct = true; }
    if (inp.pressed('r')) this.build.dir = (this.build.dir + 1) % 4;
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
      if (slot.key === 'drill' && inp.clickSecondary()) this.scanner.pulse();
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

  selectSlot(i: number) {
    this.selected = i;
    const s = this.hotbar[i];
    if (s?.type === 'build') { if (this.canBuildKey(s.key)) this.startBuild(s.key); else this.toast('Ainda não desbloqueado', '#ff8a3a'); }
    else this.exitBuild();
    this.audio.click();
  }
  canBuildKey(k: string) { const d = MACHINE[k]; return !!d && (!d.research || this.research.has(d.research)) && d.behavior !== 'command'; }
  startBuild(k: string) {
    const [tx, ty] = this.freeSpotFor(k);
    this.build = { active: true, key: k, dir: this.build.dir, deconstruct: false, tx, ty };
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
    this.build.active = false; this.build.deconstruct = false; this.build.key = null; this.input.placeMode = false; }
  confirmBuild() { if (this.build.active && !this.build.deconstruct && !this.ui.modalOpen()) this.buildAction(); }

  private buildAction() {
    const inp = this.input;
    const tx = this.build.deconstruct ? Math.floor(inp.worldX / TILE) : this.build.tx;
    const ty = this.build.deconstruct ? Math.floor(inp.worldY / TILE) : this.build.ty;
    if (this.build.deconstruct) {
      if (!inp.clickPrimary()) return;
      const m = this.machines.at(tx, ty) ?? this.machines.list.find(x => x.def.behavior === 'platform' && x.tx === tx && x.ty === ty);
      if (!m) return;
      if (m.def.behavior === 'command') { this.toast('O Centro de Comando é propriedade da Zenitex.', '#ff8a3a'); return; }
      for (const k in m.def.cost) this.stock.add(k, Math.floor(m.def.cost[k] * 0.75), false);
      this.machines.remove(m);
      this.audio.click();
      this.fx.dust(...this.machines.centerPx(m), 8);
      return;
    }
    const def = MACHINE[this.build.key!];
    if (!def) return;
    const ox = tx - Math.floor((def.w - 1) / 2), oy = ty - Math.floor((def.h - 1) / 2);
    const err = this.machines.canPlace(def, ox, oy);
    if (err) { this.toast(err, '#ff8a3a'); this.audio.error(); return; }
    if (Math.hypot((ox + def.w / 2) * TILE - this.player.x, (oy + def.h / 2) * TILE - this.player.y) > 260) { this.toast('Muito longe para construir', '#ff8a3a'); this.audio.error(); return; }
    if (!this.stock.pay(def.cost, this.pack.items)) { this.toast('Recursos insuficientes (Estoque Central + mochila)', '#ff8a3a'); this.audio.error(); return; }
    const m = this.machines.place(def.key, ox, oy, this.build.dir);
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
    if (this.pack.count(k) < 1) { this.toast(`Sem ${ITEM[k]?.name ?? k} na mochila`, '#ff8a3a'); return; }
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
      const d = Math.min(Math.hypot(x - p.x, y - p.y), Math.hypot(x - this.input.worldX, y - this.input.worldY) + 10) - extra;
      if (d < bd && Math.hypot(x - p.x, y - p.y) < 34 + extra) { bd = d; best = { x, y, ...h }; }
    };
    for (const a of this.events.anomalies) consider(a.x, a.y, { label: '[E] Estabilizar anomalia (segure)', kind: 'anomaly', ref: a });
    for (const a of this.lore.artifacts) if (this.lore.visible(a) && Math.abs(a.x - p.x) < 60 && Math.abs(a.y - p.y) < 60) consider(a.x, a.y, { label: '[E] Catalogar registro (segure)', kind: 'artifact', ref: a });
    if (p.cargo) consider(p.cargo.x, p.cargo.y, { label: '[E] Recuperar carga', kind: 'cargo', ref: p.cargo });
    for (const r of this.robots.list) {
      if (Math.abs(r.x - p.x) > 50 || Math.abs(r.y - p.y) > 50) continue;
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
        this.ui.openMachine(m);
      }
    }
    this.flags.touchHold = this.input.touch;
  }

  depositPack() {
    let n = 0;
    for (const k of Object.keys(this.pack.items)) {
      const c = ITEM[k]?.cat;
      if (c === 'consumivel') continue;
      const q = this.pack.take(k, this.pack.count(k));
      this.stock.add(k, q); n += q;
    }
    if (n > 0) {
      this.toast(`Depositado no Estoque Central: ${Math.round(n)} kg`, '#9cff8a');
      this.audio.success();
      if (this.flags.tutorial === 1) { this.flags.tutorial = 2; this.flags.firstDeliver = this.time; this.say('t_first_deliver'); this.ui.flashMass(); }
    }
  }

  private tutorial() {
    const t = this.flags.tutorial;
    if (this.flags.intro) return;
    if (t === 0 && this.planet.terrain >= 0.05) { this.flags.tutorial = 1; this.toast('50 kg removidos! Volte ao Centro de Comando e entregue a carga [E].', '#ffd04a'); }
    if (t === 2 && this.machines.count('oficina')) { this.flags.tutorial = 3; this.audio.success(); }
    if (t === 3 && this.machines.count('laboratorio')) { this.flags.tutorial = 4; this.audio.success(); this.dialogue.line('zena', 'Infraestrutura mínima concluída. A partir de agora, siga a saga de automação do setor (G) e os contratos (J).'); }
    if (t === 2 && !this.flags.saidWorkshop && this.time - (this.flags.firstDeliver ?? 0) > 8) { this.flags.saidWorkshop = true; this.say('t_build_workshop'); }
  }

  tutorialObjectives(): { text: string; done: boolean; cur?: string }[] | null {
    const t = this.flags.tutorial;
    if (t >= 4) return null;
    const kg = Math.min(50, this.planet.terrain * 1000);
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
    let near = 0;
    for (const m of this.machines.list) if (m.working && Math.abs(m.tx * TILE - p.x) < 300 && Math.abs(m.ty * TILE - p.y) < 300) near++;
    a.machinesHum(near);
    const s = this.world.sectorAtPx(p.x, p.y) || this.lastSectorMusic;
    this.lastSectorMusic = s;
    const nearBase = this.machines.list.some(m => m.def.behavior === 'command' && Math.hypot((m.tx + 1.5) * TILE - p.x, (m.ty + 1.5) * TILE - p.y) < 200);
    const danger = Object.keys(this.hazards.excess).length > 0;
    const mood = this.flags.finalSeq ? 'nucleo' : danger ? 'tenso' : near > 8 || nearBase ? 'industrial' : SECTORS[s - 1].music;
    a.updateMusic(dt, mood, !!this.ui?.discoveryOpen());
  }

  // ---------------- save ----------------
  serialize() {
    return {
      v: 1, opts: this.opts, time: this.time, flags: this.flags, selected: this.selected, hotbar: this.hotbar,
      chunks: this.world.serializeChunks(), explored: packBytes(this.world.explored),
      regrow: this.world.regrowQueue,
      player: this.player.serialize(), pack: { items: this.pack.items, level: this.pack.level },
      stock: { items: this.stock.items, credits: this.stock.credits },
      machines: this.machines.serialize(), robots: this.robots.serialize(), sectors: this.sectors.serialize(),
      planet: this.planet.serialize(), research: this.research.serialize(), crafting: this.crafting.serialize(),
      contracts: this.contracts.serialize(), lore: this.lore.serialize(), events: this.events.serialize(), stats: this.stats.serialize(),
      markers: this.scanner.mapMarkers, final: this.final, flares: this.flares, drops: this.mining.drops,
    };
  }

  load(s: any) {
    this.time = s.time; this.flags = s.flags; this.selected = s.selected ?? 0; if (s.hotbar) this.hotbar = s.hotbar;
    this.world.loadChunks(s.chunks);
    unpackBytes(s.explored, this.world.explored);
    for (let i = 0; i < this.world.explored.length; i++) if (this.world.explored[i]) this.world.sectorTileExplored[this.world.sectorTiles[i]]++;
    this.world.regrowQueue = s.regrow ?? [];
    this.player.load(s.player); this.pack.items = s.pack.items; this.pack.level = s.pack.level;
    this.stock.items = s.stock.items; this.stock.credits = s.stock.credits;
    this.machines.load(s.machines); this.robots.load(s.robots); this.sectors.load(s.sectors);
    this.planet.load(s.planet); this.research.load(s.research); this.crafting.load(s.crafting);
    this.contracts.load(s.contracts); this.lore.load(s.lore); this.events.load(s.events); this.stats.load(s.stats);
    this.scanner.mapMarkers = s.markers ?? []; this.final = s.final ?? this.final; this.flares = s.flares ?? []; this.mining.drops = s.drops ?? [];
    this.flags.intro = false; this.flags.ending = false;
    this.camera.x = this.player.x; this.camera.y = this.player.y;
  }

  async save() {
    const ok = await saveSlot('slot1', this.serialize());
    if (ok) this.ui?.savedIndicator();
  }
}

export { WORLD_TILES };
