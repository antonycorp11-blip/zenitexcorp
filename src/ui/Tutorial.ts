import { siloHelp } from '../systems/SiloHelp';
import { TILE, CELL } from '../core/constants';
import { IS_SOLID } from '../data/materials';
import type { Game } from '../Game';
import { MACHINE, MACHINE_CATS } from '../data/machines';

type Target = string | (() => [number, number] | null) | null;
interface Step {
  title: string;
  text: (touch: boolean, g: Game) => string;
  bp?: string;               // peça do projeto guiado (posição e rotação travadas)
  target: (g: Game, touch: boolean) => Target;
  done: (g: Game) => boolean;
  manual?: boolean;          // avança tocando no cartão de META
}

const MAIN = new Set(['build', 'upgrades', 'inventory', 'missions', 'map']);

/** Botão que leva a uma aba do menu único. */
function openTab(g: Game, tab: string): string {
  const id = g.ui.panels.id;
  if (!id) return '.menu-btn';
  if (!MAIN.has(id)) return '.pnl .x';
  return `[data-act="nav"][data-arg="${tab}"]`;
}
/** Caminho de construção: MENU → CONSTRUIR → aba → POSICIONAR → CONFIRMAR. */
function buildFlow(g: Game, cat: string, key: string): Target {
  if (g.build.active && g.build.key === key) {
    if ((key === 'esteira' || key === 'tubo') && !g.build.anchor) return null;   // primeiro desenhe a linha
    return '[data-build-action="confirm"]';
  }
  // construção pelo botão CONSTRUIR do HUD (canto esquerdo)
  if (g.ui.panels.isOpen()) return '.pnl .x';
  if (!g.ui.quickOpen()) return '.quick-build-btn';
  const ci = MACHINE_CATS.findIndex(c => c.key === cat);
  if (g.ui.quickCat !== ci) return `.quick-build [data-quick="cat"][data-cat="${ci}"]`;
  return `.quick-build [data-quick="item"][data-key="${key}"]`;
}
function commandPos(g: Game): [number, number] | null {
  const c = g.machines.list.find(m => m.def.behavior === 'command');
  return c ? g.machines.centerPx(c) : null;
}
function nearestWall(g: Game): [number, number] | null {
  const p = g.player;
  for (let r = 4; r < 420; r += 4) for (let a = 0; a < 24; a++) {
    const x = p.x + Math.cos(a / 24 * Math.PI * 2) * r, y = p.y + Math.sin(a / 24 * Math.PI * 2) * r;
    if (IS_SOLID[g.world.get(Math.floor(x / CELL), Math.floor(y / CELL))]) return [x, y];
  }
  return null;
}

function machinePos(g: Game, key: string): [number, number] | null {
  const m = g.machines.list.find(x => x.key === key);
  return m ? g.machines.centerPx(m) : null;
}
const analyzed = (g: Game) => (g.sectors.s[1]?.counters.analyzed ?? 0) > 0 || g.planet.layer > 1;

const fed = (g: Game) => (g.sectors.s[g.planet.layer]?.counters.fed ?? 0);
function storagePos(g: Game): [number, number] | null {
  const m = g.machines.list.find(x => x.def.behavior === 'storage');
  return m ? [(m.tx + m.def.w / 2) * TILE, m.ty * TILE - 6] : null;
}

const DIRN = ['a DIREITA', 'BAIXO', 'a ESQUERDA', 'CIMA'];
/** passo de construção guiada: o anel vai em GIRAR enquanto a rotação estiver errada, depois em CONFIRMAR */
function bpTarget(g: Game, cat: string, id: string): Target {
  const it = g.blueprint.item(id);
  if (g.build.active && it && g.build.key === it.key && it.key !== 'esteira' && it.key !== 'tubo' && MACHINE[it.key]?.rotatable && g.build.dir !== it.dir) return '[data-build-action="rotate"]';
  return buildFlow(g, cat, it?.key ?? id);
}
function rotHint(g: Game, id: string): string {
  const it = g.blueprint.item(id);
  if (!g.build.active || !it || g.build.key !== it.key || !MACHINE[it.key]?.rotatable) return '';
  return g.build.dir === it.dir ? '<br><b style="color:#7aff8a">✔ Girado certo: CONFIRMAR</b>' : `<br><b style="color:#ffd04a">↻ GIRAR até a seta ficar ${ARROW[it.dir]}</b>`;
}
const ARROW = ['▶', '▼', '◀', '▲'];
const lineOk = (g: Game) => g.blueprint.checkLine().ok;

// CAVAR → PROCESSAR À MÃO → VER O QUE EXISTE → MONTAR A PRIMEIRA INDÚSTRIA PEÇA POR PEÇA (projeto guiado)
const STEPS: Step[] = [
  { title: 'Andar e voar', text: t => t ? '<b>Joystick esquerdo</b> anda.<br>Toque <b>JATO</b>: voo livre (toque de novo para pousar).' : '<b>A / D</b> anda. <b>W</b> ou <b>Espaço</b> voa.',
    target: (g, t) => t ? (g.flags.tutMoved0 ? '#mobile [data-b="jet"]' : '#mobile .stick.left .base') : null, done: g => !!g.flags.tutMoved },
  { title: 'Cave perto do Soprador', text: t => 'A Nave largou uma <b>linha de extração</b> pronta.<br>' + (t ? '<b>Joystick direito</b> no chão perto do Soprador' : '<b>Segure o clique</b> no chão perto do Soprador') + ': ele aspira a terra solta.',
    target: g => () => { const m = g.machines.list.find(x => x.def.behavior === 'blower'); return m ? [(m.tx + 0.5) * TILE, (m.ty + 1.5) * TILE] : null; },
    done: g => g.machines.list.some(m => m.def.behavior === 'belt' && m.state === 'ok') },
  { title: 'Como a linha funciona', text: () => 'A terra sobe pelo tubo, anda na esteira, o <b>Ímã</b> e o <b>Ressonador</b> puxam os minérios e o resto <b>queima</b>.<br><b>Veja a animação.</b>',
    target: () => '.lesson .ok', done: g => !!g.flags.lessonSep },
  { title: 'Saldo e camada', text: (_t, g) => `No topo, seu <b>saldo</b>: Ferronox ${Math.floor(g.upHave('ferronox'))} · Lumenita ${Math.floor(g.upHave('lumenita'))}.<br>A terra <b>queimada</b> sai do planeta e diminui o que <b>falta da camada</b> (cartão à esquerda). Continue cavando.`,
    target: g => () => { const m = g.machines.list.find(x => x.key === 'compactador'); return m ? [(m.tx + 0.5) * TILE, m.ty * TILE] : null; },
    done: g => (g.sectors.s[g.planet.layer]?.counters.burned ?? 0) > 60 },
  { title: 'A Nave em órbita', text: () => 'Os minérios só <b>saem do planeta</b> quando chegam na <b>Nave</b>, lá no alto (voe com <b>JATO</b> para ver).<br>Vamos ligar o Ímã a ela.',
    target: g => g.ui.panels.isOpen() ? '.pnl .x' : '.hcard.meta', done: () => false, manual: true },
  { title: 'Tubo até a Nave', bp: 'tuboNave', text: () => '<b>CONSTRUIR → Logística → Tubo de Vácuo</b>: o caminho já está marcado, de cima do Ímã até a porta de carga.<br><b>CONFIRMAR</b>.',
    target: g => buildFlow(g, 'logistica', 'tubo'), done: g => g.blueprint.placed('tuboNave') },
  { title: 'Primeira entrega', text: (_t, g) => `Cave mais: o Ferronox do Ímã agora sobe pelo tubo até a Nave.<br>Enviado: <b>${Math.floor(g.sectors.s[g.planet.layer]?.counters.shipped ?? 0)} kg</b>.`,
    target: g => () => { const m = g.machines.list.find(x => x.def.behavior === 'blower'); return m ? [(m.tx + 0.5) * TILE, (m.ty + 1.5) * TILE] : null; },
    done: g => (g.sectors.s[g.planet.layer]?.counters.shipped ?? 0) >= 4 },
  { title: 'Melhorias', text: () => 'No <b>MENU → MELHORIAS</b>: alcance do <b>laser</b>, alcance e vazão do <b>soprador</b>, velocidade dos <b>tubos</b>.<br>Pagas com o seu saldo. <b>Toque aqui.</b>',
    target: g => g.ui.panels.isOpen() ? '.pnl .x' : '.hcard.meta', done: () => false, manual: true },
  { title: 'Agora é com você', text: () => 'Pilha acabou? Toque no Soprador → <b>RECOLHER</b> e leve para outro ponto. Monte mais linhas no <b>CONSTRUIR</b>.<br>Esvazie a camada e desça até o núcleo. <b>Toque aqui</b> para terminar.',
    target: g => g.ui.panels.isOpen() ? '.pnl .x' : '.hcard.meta', done: () => false, manual: true },
];

/** Tutorial guiado: fala pelo cartão de META e destaca o botão exato (anel) ou o alvo no mapa (seta). */
export class Tutorial {
  private ring: HTMLElement;
  private arrow: HTMLElement;
  private sx = 0; private sy = 0; private last = -1;

  constructor(private g: Game, _layer: HTMLElement) {
    this.ring = document.createElement('div'); this.ring.className = 'tut-ring';
    this.arrow = document.createElement('div'); this.arrow.className = 'tut-arrow'; this.arrow.textContent = '▼';
    document.body.append(this.ring, this.arrow);
  }

  get active() { return !this.g.flags.tutDone && !this.g.flags.intro && !this.g.flags.ending && !!this.g.flags.briefed; }
  /** peça do projeto guiado do passo atual (ou null) */
  currentBp() {
    if (!this.active) return null;
    const st = STEPS[this.index()];
    return st?.bp ? this.g.blueprint.item(st.bp) ?? null : null;
  }
  /** trava a prévia de construção no lugar do projeto */
  private lockBuild() {
    const g = this.g, it = this.currentBp(), b = g.build;
    if (!it || !b.active || b.key !== it.key) return;
    if (it.key === 'tubo') { b.anchor = [it.tx, it.ty]; b.tx = it.tx2!; b.ty = it.ty2!; return; }
    if (it.key === 'esteira' || (it.key === 'piso_orbital' && it.tx2 !== undefined)) { b.anchor = [it.tx, it.ty]; b.tx = it.tx2!; b.ty = it.ty; return; }
    if (it.key === 'piso_orbital') { b.anchor = [it.tx, it.ty]; b.tx = it.tx; b.ty = it.ty; return; }
    if (it.ty2 !== undefined) { b.anchor = [it.tx, it.ty]; b.tx = it.tx; b.ty = it.ty2; return; }
    const d = MACHINE[it.key];
    b.tx = it.tx + Math.floor((d.w - 1) / 2); b.ty = it.ty + Math.floor((d.h - 1) / 2);
  }

  restart() { this.g.flags.tutDone = false; this.g.flags.tutStep = 0; this.last = -1; }
  skip() { this.g.flags.tutDone = true; }

  private index(): number {
    const g = this.g;
    let i = g.flags.tutStep ?? 0;
    while (i < STEPS.length && !STEPS[i].manual && STEPS[i].done(g)) i++;
    if (i !== (g.flags.tutStep ?? 0)) { g.flags.tutStep = i; g.audio.success(); }
    if (i >= STEPS.length) g.flags.tutDone = true;
    return i;
  }

  /** Passo atual para o cartão de META (ou null se não há tutorial). */
  current(): { n: number; total: number; title: string; text: string; manual: boolean } | null {
    if (!this.active) return null;
    const i = this.index();
    const st = STEPS[i]; if (!st) return null;
    return { n: i + 1, total: STEPS.length, title: st.title.toUpperCase(), text: st.text(this.g.input.touch, this.g) + ' <u class="tutskip">pular tutorial</u>', manual: !!st.manual };
  }
  /** Toque no cartão de META durante o tutorial: avança passos manuais. Retorna true se consumiu o toque. */
  tap(target: HTMLElement): boolean {
    if (!this.active) return false;
    if (target.closest('.tutskip')) { this.skip(); this.g.toast('Tutorial encerrado. Refaça quando quiser em ⚙ → Manual.', '#9ab'); return true; }
    const st = STEPS[this.index()];
    if (st?.manual) { this.g.flags.tutStep = (this.g.flags.tutStep ?? 0) + 1; this.g.audio.success(); return true; }
    return true;
  }

  update() {
    const g = this.g, touch = g.input.touch;
    this.ring.style.display = 'none'; this.arrow.style.display = 'none';
    document.body.classList.toggle('tut-on', this.active);
    if (!this.active) {
      // fora do tutorial o cartão de objetivo também foge da base e do que o guia marca
      const cam = g.camera, dpr = cam.w / innerWidth, scrX = (wx: number) => (wx - cam.left()) * cam.zoom / dpr;
      const gd = g.guide(), it = gd?.item, rm = gd?.remove;
      const fx = it ? scrX((it.tx + MACHINE[it.key].w / 2) * TILE) : rm ? scrX((rm.tx + rm.def.w / 2) * TILE) : null;
      const c = g.machines.list.find(m => m.def.behavior === 'command'), cx = c ? scrX((c.tx + 1.5) * TILE) : null;
      document.body.classList.toggle('tut-r', ((fx !== null && fx < innerWidth * 0.42) || (cx !== null && cx > 0 && cx < innerWidth * 0.42)) && !(fx !== null && fx > innerWidth * 0.6));
      return;
    }
    const i = this.index();
    const st = STEPS[i]; if (!st) return;
    this.lockBuild();
    if (st.title === 'Como a linha funciona' && !g.flags.lessonSep && !g.ui.modalOpen()) g.ui.showLesson();
    if (i !== this.last) { this.last = i; this.sx = g.player.x; this.sy = g.player.y; }
    if (i === 0) { const dx = Math.abs(g.player.x - this.sx), dy = this.sy - g.player.y; if (dx > 40) g.flags.tutMoved0 = true; if (dx > 40 && (dy > 24 || !g.input.touch)) g.flags.tutMoved = true; }
    const tg = st.target(g, touch);
    // o cartão fica do lado oposto ao ponto de interesse (peça do projeto ou alvo no mapa)
    const cam = g.camera, dpr = cam.w / innerWidth, scrX = (wx: number) => (wx - cam.left()) * cam.zoom / dpr;
    let fx: number | null = null;
    const bp = this.currentBp();
    if (bp) { const d = MACHINE[bp.key]; fx = scrX(((bp.tx + (bp.tx2 ?? bp.tx + d.w - 1)) / 2 + 0.5) * TILE); }
    else if (typeof tg === 'function') { const p = tg(); if (p) fx = scrX(p[0]); }
    const c = g.machines.list.find(m => m.def.behavior === 'command'), cx = c ? scrX((c.tx + 1.5) * TILE) : null;
    const leftBusy = (fx !== null && fx < innerWidth * 0.42) || (cx !== null && cx > 0 && cx < innerWidth * 0.42);
    const rightBusy = fx !== null && fx > innerWidth * 0.6;
    document.body.classList.toggle('tut-r', leftBusy && !rightBusy);
    if (typeof tg === 'string') {
      const el = Array.from(document.querySelectorAll<HTMLElement>(tg)).find(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
      if (!el) return;
      // com um painel aberto, só destaca o que está dentro dele
      if (g.ui.modalOpen() && !el.closest('.modal-layer, .mg-layer')) return;
      el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      const r = el.getBoundingClientRect();
      Object.assign(this.ring.style, { display: 'block', left: r.left - 5 + 'px', top: r.top - 5 + 'px', width: r.width + 10 + 'px', height: r.height + 10 + 'px' });
    } else if (typeof tg === 'function') {
      if (g.ui.modalOpen()) return;
      const p = tg(); if (!p) return;
      const cam = g.camera, dpr = cam.w / innerWidth;
      let x = (p[0] - cam.left()) * cam.zoom / dpr, y = (p[1] - TILE - cam.top()) * cam.zoom / dpr;
      const m = 44, off = x < m || y < m || x > innerWidth - m || y > innerHeight - m;
      x = Math.max(m, Math.min(innerWidth - m, x)); y = Math.max(m, Math.min(innerHeight - m, y));
      const ang = off ? Math.atan2(y - innerHeight / 2, x - innerWidth / 2) * 180 / Math.PI - 90 : 0;
      Object.assign(this.arrow.style, { display: 'block', left: x + 'px', top: y + 'px', transform: `translate(-50%,-100%) rotate(${ang}deg)` });
    }
  }
}
