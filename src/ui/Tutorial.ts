import { TILE, CELL } from '../core/constants';
import { IS_SOLID } from '../data/materials';
import type { Game } from '../Game';

type Target = string | (() => [number, number] | null) | null;
interface Step {
  title: string;
  text: (touch: boolean) => string;
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
    if (key === 'esteira' && !g.build.anchor) return null;   // primeiro desenhe a linha
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

// CAVAR → PROCESSAR À MÃO → VER O QUE EXISTE DENTRO → MOVER MATERIAL (soprar, perfurar, esteira) → AUTOMATIZAR
const STEPS: Step[] = [
  { title: 'Andar e voar', text: t => t ? '<b>Joystick esquerdo</b>: andar. Empurre para <b>cima</b> para voar com o jetpack.' : '<b>A / D</b> anda. <b>W</b> ou <b>Espaço</b> liga o jetpack.',
    target: (_g, t) => t ? '#mobile .stick.left .base' : null, done: g => !!g.flags.tutMoved },
  { title: 'Cavar e aspirar', text: t => (t ? '<b>Joystick direito</b> apontado para o chão, segure.' : 'Mire no chão e <b>segure o botão esquerdo</b>.') + ' O feixe solta a terra em grãos e o aspirador puxa para a mochila. Junte <b>40 kg de Solo K-37</b>.',
    target: g => () => nearestWall(g), done: g => g.stats.manualKg >= 40 || analyzed(g) },
  { title: 'Processar à mão', text: t => `Vá ao <b>Analisador de Matriz</b> (seta) e ${t ? 'toque em <b>E</b>' : 'aperte <b>E</b>'}. Escolha o Solo K-37, <b>INICIAR</b> e dê o <b>PULSO</b> na faixa verde.`,
    target: (g, t) => t && (g.hover?.ref as any)?.key === 'analisador' ? '#mobile [data-b="interact"]' : g.ui.mini.isOpen() ? null : () => machinePos(g, 'analisador'), done: analyzed },
  { title: 'O que existe dentro', text: () => 'Viu? <b>~80% é resíduo</b>. Os minerais (Ferronox, Lumenita) foram para o <b>estoque</b>: é com eles que você constrói. <b>Toque aqui</b> para continuar.',
    target: () => '.hcard.meta', done: () => false, manual: true },
  { title: 'Armazém', text: () => '<b>MENU → CONSTRUIR → Logística → Armazém</b>, perto da cápsula. O <b>funil</b> em cima engole tudo o que cair nele e manda para o estoque.',
    target: g => buildFlow(g, 'logistica', 'armazem'), done: g => g.machines.countBehavior('storage') > 0 },
  { title: 'Soprar', text: t => (t ? 'Toque em <b>SOPRAR</b> e use o <b>joystick direito</b>' : '<b>Segure o botão direito</b> do mouse') + ' mirando o <b>funil do Armazém</b> (seta): a arma joga o material da mochila em arco. Jogue <b>20 kg</b>.',
    target: (g, t) => t && !g.flags.blowMode ? '#mobile [data-b="blow"]' : () => storagePos(g), done: g => fed(g) >= 20 },
  { title: 'Perfuradora', text: () => `<b>CONSTRUIR → Extração → Perfuradora</b>. No chão, com a seta <b>para baixo</b> (GIRAR). Ela cava sozinha e cospe os grãos pela <b>calha</b> da lateral.`,
    target: g => buildFlow(g, 'extracao', 'perfuradora'), done: g => g.machines.countBehavior('drill') > 0 },
  { title: 'Esteira', text: t => `<b>Logística → Esteira</b>. ${t ? 'Toque' : 'Clique'} no chão logo <b>embaixo da calha</b> da perfuradora e <b>arraste até encostar no Armazém</b>. Os grãos caem na esteira, andam e entram nele.`,
    target: g => buildFlow(g, 'logistica', 'esteira'), done: g => g.machines.countBehavior('belt') >= 3 },
  { title: 'Processador', text: () => '<b>Processamento → Processador de Solo</b>, perto da base. Ele puxa o Solo K-37 do estoque (ou do funil) e separa sozinho: minerais de um lado, resíduo do outro.',
    target: g => buildFlow(g, 'processamento', 'processador_solo'), done: g => g.machines.count('processador_solo') > 0 },
  { title: 'Compactador', text: () => '<b>Processamento → Compactador Planetário</b>, perto da base. O resíduo vira <b>blocos</b> e o Terminal Orbital exporta. Sem isso o pátio enche e <b>tudo para</b>.',
    target: g => buildFlow(g, 'processamento', 'compactador'), done: g => g.machines.count('compactador') > 0 },
  { title: 'Scanner', text: t => `${t ? 'Toque em <b>SCANNER</b>' : 'Aperte <b>F</b>'}: ele mostra o <b>teor</b> da região. Perfuradoras em teor ALTO rendem muito mais minerais.`,
    target: (_g, t) => t ? '#mobile [data-b="scan"]' : null, done: g => (g.sectors.s[g.planet.layer]?.counters.scans ?? 0) > 0 },
  { title: 'Sua meta', text: () => 'A barra da <b>CAMADA</b> só sobe com massa <b>REMOVIDA</b>: minerais separados + resíduo exportado em blocos. Buraco fundo? Use o <b>Elevador de Grãos</b> ou o <b>Lançador</b>. <b>Toque aqui</b> para terminar.',
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
    return { n: i + 1, total: STEPS.length, title: st.title.toUpperCase(), text: st.text(this.g.input.touch) + ' <u class="tutskip">pular tutorial</u>', manual: !!st.manual };
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
    if (i !== this.last) { this.last = i; this.sx = g.player.x; this.sy = g.player.y; }
    if (i === 0 && Math.hypot(g.player.x - this.sx, g.player.y - this.sy) > 40) g.flags.tutMoved = true;
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
