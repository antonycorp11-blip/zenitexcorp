import { siloHelp } from '../systems/SiloHelp';
import { TILE, CELL } from '../core/constants';
import { IS_SOLID } from '../data/materials';
import type { Game } from '../Game';
import { MACHINE } from '../data/machines';

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
  if (g.ui.panels.id !== 'build') return openTab(g, 'build');
  if (g.ui.panels.st.buildCat !== cat) return `.tabs [data-arg="buildCat:${cat}"]`;
  return `[data-act="build"][data-arg="${key}"]`;
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
  { title: 'Andar e voar', text: t => t ? '<b>Joystick esquerdo</b> anda.<br>Toque <b>JATO</b>: voo livre pelo mapa (toque de novo para pousar).' : '<b>A / D</b> anda. <b>W</b> ou <b>Espaço</b> voa.',
    target: (g, t) => t ? (g.flags.tutMoved0 ? '#mobile [data-b="jet"]' : '#mobile .stick.left .base') : null, done: g => !!g.flags.tutMoved },
  { title: 'Plataforma Orbital', bp: 'piso', text: () => 'Tudo começa pelo <b>piso</b>: ele se sustenta sozinho, até sem terra.<br><b>Construir → Base → Plataforma Orbital</b> na faixa verde e <b>CONFIRMAR</b>.',
    target: g => buildFlow(g, 'base', 'piso_orbital'), done: g => g.blueprint.placed('piso') || !g.flags.awaitCapsule },
  { title: 'Pouso da cápsula', text: () => 'Plataforma pronta! A <b>cápsula de comando</b> está descendo.<br>Fique longe do piso.',
    target: g => () => { const it = g.blueprint.item('piso'); return it ? [(it.tx2! - 1) * TILE, (it.ty - 4) * TILE] : null; }, done: g => !g.flags.awaitCapsule },
  { title: 'Cavar', text: t => (t ? '<b>Joystick direito</b> no chão e segure.' : 'Mire no chão e <b>segure o clique</b>.') + '<br>O laser solta a terra e o aspirador guarda. Junte <b>40 kg</b>.',
    target: g => () => nearestWall(g), done: g => g.stats.manualKg >= 40 || analyzed(g) },
  { title: 'Analisar à mão', text: t => `Vá ao <b>Analisador</b> (seta) e ${t ? '<b>toque no lado direito</b>' : 'aperte <b>E</b>'}.<br>Escolha o Solo, <b>INICIAR</b> e dê o <b>PULSO</b> no verde.`,
    target: (g, t) => t && (g.hover?.ref as any)?.key === 'analisador' ? '#mobile .stick.right .base' : g.ui.mini.isOpen() ? null : () => machinePos(g, 'analisador'), done: analyzed },
  { title: 'O que existe dentro', text: () => '<b>80% é resíduo</b>, o resto é mineral.<br>Agora a fábrica: você cava, um <b>Soprador</b> aspira as pilhas e manda por <b>tubo</b>.<br><b>Toque aqui</b> para começar.',
    target: () => '.hcard.meta', done: () => false, manual: true },
  { title: 'Linha 1/11 · Esteira', bp: 'esteira', text: () => '<b>Logística → Esteira</b> na faixa verde, andando para a <b>esquerda ◀</b>.<br>É por ela que a terra vai passar.',
    target: g => buildFlow(g, 'logistica', 'esteira'), done: g => g.blueprint.placed('esteira') },
  { title: 'Linha 2/11 · Prensa', bp: 'compactador', text: () => '<b>Processamento → Prensa</b> no fim da esteira.<br>O que sobrar da terra vira <b>bloco</b> e é exportado.',
    target: g => bpTarget(g, 'processamento', 'compactador'), done: g => g.blueprint.placed('compactador') },
  { title: 'Linha 3/11 · Soprador', bp: 'soprador', text: (_t, g) => `<b>Extração → Soprador</b> no quadrado verde (${g.pack.count('kit_soprador')} na mão), bocal <b>◀</b>.<br>Ele aspira as pilhas que você cavar.` + rotHint(g, 'soprador'),
    target: g => bpTarget(g, 'extracao', 'soprador'), done: g => g.blueprint.placed('soprador') },
  { title: 'Linha 4/11 · Tubo de Vácuo', bp: 'tuboFeed', text: () => '<b>Logística → Tubo de Vácuo</b>: do Soprador, sobe e solta a terra <b>em cima da esteira</b>.<br><b>CONFIRMAR</b>.',
    target: g => buildFlow(g, 'logistica', 'tubo'), done: g => g.blueprint.placed('tuboFeed') },
  { title: 'Teste a linha', text: (t) => '<b>Cave perto do Soprador</b> (' + (t ? 'joystick direito' : 'clique') + ').<br>Veja a terra subir pelo tubo, andar na esteira e entrar na Prensa.',
    target: g => () => { const m = g.machines.list.find(x => x.def.behavior === 'blower'); return m ? [(m.tx + 0.5) * TILE, (m.ty + 1.5) * TILE] : null; },
    done: g => g.machines.list.some(m => m.def.behavior === 'belt' && m.state === 'ok') },
  { title: 'Como extrair', text: () => 'A terra tem <b>Ferronox</b> (metal prateado) e <b>Lumenita</b> (cristal azul).<br>Extratores <b>por cima da esteira</b> puxam cada um. <b>Veja a animação.</b>',
    target: () => '.lesson .ok', done: g => !!g.flags.lessonSep },
  { title: 'Linha 5/11 · Ímã', bp: 'ima', text: () => '<b>Processamento → Ímã Extrator</b> <b>por cima da esteira</b>, com 1 espaço livre.<br>Ele puxa o <b>metal</b> da terra que passa embaixo.',
    target: g => bpTarget(g, 'processamento', 'ima'), done: g => g.blueprint.placed('ima') },
  { title: 'Linha 6/11 · Coletor', bp: 'armazem', text: () => '<b>Logística → Coletor</b> no quadrado verde.<br>Ele recebe o que sobra dos silos e manda para o <b>estoque</b> (para construir).',
    target: g => bpTarget(g, 'logistica', 'armazem'), done: g => g.blueprint.placed('armazem') },
  { title: 'Linha 7/11 · Silo do Ferronox', bp: 'siloFe', text: (_t, g) => '<b>Logística → Silo</b> à esquerda do Coletor.<br>Guarda o Ferronox: <b>melhorias são pagas com silos</b>.' + rotHint(g, 'siloFe'),
    target: g => bpTarget(g, 'logistica', 'siloFe'), done: g => g.blueprint.placed('siloFe') },
  { title: 'Linha 8/11 · Tubo do Ímã', bp: 'tuboFe', text: () => '<b>Logística → Tubo de Vácuo</b>, de <b>cima do Ímã</b> até <b>em cima do Silo</b>.<br>Tubo encostado no extrator = é por ali que sai o que ele puxa.',
    target: g => buildFlow(g, 'logistica', 'tubo'), done: g => g.blueprint.placed('tuboFe') },
  { title: 'Linha 9/11 · Ressonador', bp: 'ressonador', text: () => '<b>Processamento → Ressonador Extrator</b> por cima da esteira, depois do Ímã.<br>Ele puxa os <b>cristais</b>.',
    target: g => bpTarget(g, 'processamento', 'ressonador'), done: g => g.blueprint.placed('ressonador') },
  { title: 'Linha 10/11 · Silo da Lumenita', bp: 'siloLu', text: (_t, g) => '<b>Logística → Silo</b> à direita do Coletor.' + rotHint(g, 'siloLu'),
    target: g => bpTarget(g, 'logistica', 'siloLu'), done: g => g.blueprint.placed('siloLu') },
  { title: 'Linha 11/11 · Tubo do Ressonador', bp: 'tuboLu', text: () => '<b>Logística → Tubo de Vácuo</b>, do lado do Ressonador até em cima do Silo da Lumenita.<br><b>CONFIRMAR</b>.',
    target: g => buildFlow(g, 'logistica', 'tubo'), done: g => g.blueprint.placed('tuboLu') },
  { title: 'Silos enchendo', text: (_t, g) => `Ferronox <b>${Math.floor(g.machines.siloCount('ferronox'))}/20 kg</b> · Lumenita <b>${Math.floor(g.machines.siloCount('lumenita'))}/10 kg</b>.<br>Continue cavando perto do Soprador e veja cada mineral indo para o seu silo.`,
    target: g => () => { const m = g.machines.list.find(x => x.key === 'ima'); return m ? [(m.tx + 1) * TILE, m.ty * TILE] : null; },
    done: g => g.machines.siloCount('ferronox') >= 20 && g.machines.siloCount('lumenita') >= 10 },
  { title: 'Melhorias', text: () => 'Toque <b>✚ MELHORIAS</b> (no topo): <b>Laser</b> (alcance e força), <b>Soprador</b> (alcance e vazão), <b>Tubos</b> e <b>Silos</b>.<br>São pagas com o que está nos <b>silos</b>. <b>Toque aqui.</b>',
    target: () => '.up-btn', done: () => false, manual: true },
  { title: 'Mais frentes', text: () => 'Pilha acabou? Toque no Soprador → <b>RECOLHER</b> e leve para outro ponto.<br>O <b>Tubo de Vácuo</b> aspira grãos próximos e leva para qualquer distância.<br><b>Toque aqui.</b>',
    target: () => '.hcard.meta', done: () => false, manual: true },
  { title: 'Scanner', text: t => `${t ? 'Toque <b>SCANNER</b>' : 'Aperte <b>F</b>'}: mostra o <b>teor</b> da região.<br>Cave onde o teor é ALTO.`,
    target: (_g, t) => t ? '#mobile [data-b="scan"]' : null, done: g => (g.sectors.s[g.planet.layer]?.counters.scans ?? 0) > 0 },
  { title: 'Pronto', text: () => 'Você cava → soprador → tubo → esteira → extratores → silos / coletor → prensa → terminal.<br>A barra da <b>CAMADA</b> sobe com a massa removida.<br><b>Toque aqui</b> para terminar.',
    target: () => '.hcard.layer', done: () => false, manual: true },
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
    if (st.title === 'Como extrair' && !g.flags.lessonSep && !g.ui.modalOpen()) g.ui.showLesson();
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
