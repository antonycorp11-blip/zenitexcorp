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
  return g.build.dir === it.dir ? ' <b style="color:#7aff8a">✔ Girada certo — CONFIRMAR.</b>' : ` <b style="color:#ffd04a">↻ Toque GIRAR até a seta apontar para ${DIRN[it.dir]} (agora: ${DIRN[g.build.dir]}).</b>`;
}
const lineOk = (g: Game) => g.blueprint.checkLine().ok;

// CAVAR → PROCESSAR À MÃO → VER O QUE EXISTE → MONTAR A PRIMEIRA INDÚSTRIA PEÇA POR PEÇA (projeto guiado)
const STEPS: Step[] = [
  { title: 'Andar e voar', text: t => t ? '<b>Joystick esquerdo</b>: andar. Segure o botão <b>JATO</b> para voar.' : '<b>A / D</b> anda. <b>W</b> ou <b>Espaço</b> liga o jetpack.',
    target: (g, t) => t ? (g.flags.tutMoved0 ? '#mobile [data-b="jet"]' : '#mobile .stick.left .base') : null, done: g => !!g.flags.tutMoved },
  { title: 'Cavar e aspirar', text: t => (t ? '<b>Joystick direito</b> apontado para o chão, segure.' : 'Mire no chão e <b>segure o botão esquerdo</b>.') + ' O feixe solta a terra em grãos e o <b>aspirador</b> da arma puxa e guarda. Junte <b>40 kg de Solo K-37</b>.',
    target: g => () => nearestWall(g), done: g => g.stats.manualKg >= 40 || analyzed(g) },
  { title: 'Processar à mão', text: t => `Vá até o <b>Analisador de Matriz</b> (seta) e ${t ? '<b>toque rápido no lado direito</b> da tela (USAR)' : 'aperte <b>E</b>'}. Escolha o Solo K-37, <b>INICIAR</b> e dê o <b>PULSO</b> na faixa verde.`,
    target: (g, t) => t && (g.hover?.ref as any)?.key === 'analisador' ? '#mobile .stick.right .base' : g.ui.mini.isOpen() ? null : () => machinePos(g, 'analisador'), done: analyzed },
  { title: 'O que existe dentro', text: () => 'Viu? <b>~80% é resíduo</b> e o resto são minerais, que foram para o <b>estoque</b> (é com eles que você constrói). Aqui não existe broca: <b>quem cava é você</b>. Os <b>Sopradores</b> aspiram as pilhas que você deixa e mandam por <b>tubos</b> até a fábrica. Vamos montar a primeira. <b>Toque aqui.</b>',
    target: () => '.hcard.meta', done: () => false, manual: true },
  { title: 'Fábrica 1/5 · Coletor', bp: 'armazem', text: (_t, g) => 'A fábrica é <b>vertical</b>: o material cai pela peneira e se separa por gravidade. Primeiro o <b>Coletor</b> no quadrado verde: <b>Construir → Logística → Coletor</b>. Tudo que cair dentro dele vai para o estoque.' + rotHint(g, 'armazem'),
    target: g => bpTarget(g, 'logistica', 'armazem'), done: g => g.blueprint.placed('armazem') },
  { title: 'Soprar no funil', text: t => (t ? 'Teste: toque em <b>SOPRAR</b> e arraste o <b>lado direito</b>' : 'Teste: <b>segure o botão direito</b> do mouse') + ' mirando o <b>funil do Coletor</b>. Sai o que está no aspirador (vazio, ele sopra a terra solta ao seu redor). Jogue <b>20 kg</b> e desligue o SOPRAR.',
    target: (g, t) => t && !g.flags.blowMode ? '#mobile [data-b="blow"]' : () => storagePos(g), done: g => fed(g) >= 20 },
  { title: 'Fábrica 2/5 · Peneira', bp: 'peneira', text: (_t, g) => '<b>Processamento → Peneira</b>, <b>em cima do Coletor</b>. Os <b>minerais passam pela grade</b> e caem no Coletor; o <b>resíduo escorrega</b> para o lado da seta. Seta para a <b>ESQUERDA</b>.' + rotHint(g, 'peneira'),
    target: g => bpTarget(g, 'processamento', 'peneira'), done: g => g.blueprint.placed('peneira') },
  { title: 'Fábrica 3/5 · Prensa', bp: 'compactador', text: () => '<b>Processamento → Prensa</b>, no lado esquerdo, <b>embaixo da borda</b> por onde o resíduo escorrega. O resíduo vira <b>bloco</b>, vai para a base e o Terminal exporta.',
    target: g => bpTarget(g, 'processamento', 'compactador'), done: g => g.blueprint.placed('compactador') },
  { title: 'Fábrica 4/5 · Soprador', bp: 'soprador', text: (_t, g) => `Você tem <b>${g.pack.count('kit_soprador')} Sopradores Automáticos</b> na mão. <b>Extração → Soprador</b> no quadrado verde, com o <b>bocal ◀</b> virado para a fábrica. Ele aspira sozinho os grãos soltos no círculo azul.` + rotHint(g, 'soprador'),
    target: g => bpTarget(g, 'extracao', 'soprador'), done: g => g.blueprint.placed('soprador') },
  { title: 'Fábrica 5/5 · Tubo', bp: 'tubo', text: () => '<b>Logística → Tubo Pneumático</b>: o caminho já está traçado — do <b>bocal do soprador</b> (1), <b>sobe</b> e vai até <b>em cima da Peneira</b> (2). Cada peça aponta para a próxima. <b>CONFIRMAR</b>.',
    target: g => buildFlow(g, 'logistica', 'tubo'), done: g => g.blueprint.placed('tubo') },
  { title: 'Cave perto dele', text: (t, g) => { const r = g.blueprint.checkLine(); if (!r.ok) return '✖ <b>' + r.msg + '</b> Toque na peça para <b>GIRAR</b> ou <b>DESMONTAR</b>.'; return 'Agora <b>cave o chão perto do Soprador</b> (' + (t ? 'joystick direito' : 'botão esquerdo') + '). Os grãos que você solta ficam em <b>pilhas</b> e ele aspira, manda pelo tubo e a peneira separa. Separe <b>15 kg</b>.'; },
    target: g => () => { const m = g.machines.list.find(x => x.def.behavior === 'blower'); return m ? [(m.tx + 0.5) * TILE, (m.ty + 1.5) * TILE] : null; },
    done: g => g.blueprint.checkLine().ok && (g.sectors.s[g.planet.layer]?.counters.separated ?? 0) > 15 },
  { title: 'Mais frentes', text: () => 'Pilha acabou? <b>Toque no Soprador → RECOLHER</b> e leve para outra frente, ou use o <b>segundo soprador</b> em outro ponto e puxe outro tubo até a peneira. Para limpar a camada você vai precisar de <b>muitos sopradores</b> e tubos longos: a cada <b>14 tubos</b> ponha um <b>Reforçador</b> ou a pressão acaba. <b>Toque aqui.</b>',
    target: () => '.hcard.meta', done: () => false, manual: true },
  { title: 'Scanner', text: t => `${t ? 'Toque em <b>SCANNER</b>' : 'Aperte <b>F</b>'}: ele mostra o <b>teor</b> da região. Cavar em teor ALTO rende muito mais minerais.`,
    target: (_g, t) => t ? '#mobile [data-b="scan"]' : null, done: g => (g.sectors.s[g.planet.layer]?.counters.scans ?? 0) > 0 },
  { title: 'Sua fábrica', text: () => 'Pronto: <b>você cava → soprador → tubo → peneira → coletor + prensa → terminal</b>. Para crescer: mais sopradores ligados ao mesmo tubo, outra peneira, <b>Filtro</b> para separar por tipo. A barra da <b>CAMADA</b> sobe com massa removida. <b>Toque aqui</b> para terminar.',
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
    if (it.key === 'esteira') { b.anchor = [it.tx, it.ty]; b.tx = it.tx2!; b.ty = it.ty; return; }
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
    if (!this.active) return;
    const i = this.index();
    const st = STEPS[i]; if (!st) return;
    this.lockBuild();
    if (i !== this.last) { this.last = i; this.sx = g.player.x; this.sy = g.player.y; }
    if (i === 0) { const dx = Math.abs(g.player.x - this.sx), dy = this.sy - g.player.y; if (dx > 40) g.flags.tutMoved0 = true; if (dx > 40 && (dy > 24 || !g.input.touch)) g.flags.tutMoved = true; }
    const tg = st.target(g, touch);
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
