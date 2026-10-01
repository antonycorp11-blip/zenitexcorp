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
  for (let r = 4; r < 160; r += 4) for (let a = 0; a < 16; a++) {
    const x = p.x + Math.cos(a / 16 * Math.PI * 2) * r, y = p.y + Math.sin(a / 16 * Math.PI * 2) * r;
    if (IS_SOLID[g.world.get(Math.floor(x / CELL), Math.floor(y / CELL))]) return [x, y];
  }
  return null;
}

const STEPS: Step[] = [
  { title: 'Andar', text: t => t ? 'Arraste o <b>joystick esquerdo</b> para andar.' : 'Ande com <b>W A S D</b>.',
    target: (_g, t) => t ? '#mobile .stick.left .base' : null, done: g => !!g.flags.tutMoved },
  { title: 'Minerar', text: t => t ? 'Arraste o <b>joystick direito</b> na direção da rocha (seta) e segure. Junte <b>50 kg</b>.' : 'Mire na rocha (seta) e <b>segure o botão esquerdo</b>. Junte <b>50 kg</b>.',
    target: g => () => nearestWall(g), done: g => g.flags.tutorial >= 1 },
  { title: 'Entregar', text: t => `Volte à cápsula laranja (seta) e ${t ? 'toque em <b>E</b>' : 'aperte <b>E</b>'}: a mochila vira estoque para construir.`,
    target: (g, t) => t && g.hover?.kind === 'machine' ? '#mobile [data-b="interact"]' : () => commandPos(g), done: g => g.flags.tutorial >= 2 },
  { title: 'Perfuradora', text: () => '<b>MENU → CONSTRUIR → Perfuradora → POSICIONAR</b>. Encoste na rocha, use <b>GIRAR</b> até o cone apontar para ela e <b>CONFIRMAR</b>. Ela minera sozinha.',
    target: g => buildFlow(g, 'extracao', 'perfuradora'), done: g => g.machines.countBehavior('drill') > 0 },
  { title: 'Armazém', text: () => '<b>MENU → CONSTRUIR → Logística → Armazém</b>. Ele só pode ficar perto da cápsula (círculo tracejado).',
    target: g => buildFlow(g, 'logistica', 'armazem'), done: g => g.machines.countBehavior('storage') > 0 },
  { title: 'Esteira', text: t => `<b>Logística → Esteira</b>. ${t ? 'Toque' : 'Clique'} ao lado da perfuradora e <b>arraste até o armazém</b>; as setas devem apontar para ele. Depois <b>CONFIRMAR</b>.`,
    target: g => buildFlow(g, 'logistica', 'esteira'), done: g => g.machines.countBehavior('belt') >= 3 },
  { title: 'Melhoria', text: () => '<b>MENU → MELHORIAS → Processamento → Refino Mineral → DESBLOQUEAR</b>. Melhorias liberam máquinas e deixam você mais forte.',
    target: g => {
      if (g.ui.panels.id !== 'upgrades') return openTab(g, 'upgrades');
      if (g.ui.panels.st.upBr !== 'processamento') return '.branches [data-arg="upBr:processamento"]';
      if (g.ui.panels.st.resSel !== 'refino') return '[data-arg="resSel:refino"]';
      return '[data-act="research"][data-arg="refino"]';
    }, done: g => g.research.has('refino') },
  { title: 'Scanner', text: t => `${t ? 'Toque em <b>SCANNER</b>' : 'Aperte <b>F</b>'}: os minérios próximos acendem. Aponte perfuradoras para eles.`,
    target: (_g, t) => t ? '#mobile [data-b="scan"]' : '.hotbar [data-slot="1"]', done: g => (g.sectors.s[g.planet.layer]?.counters.scans ?? 0) > 0 },
  { title: 'Sua meta', text: () => 'A barra da <b>CAMADA</b> (canto superior) é sua meta: tudo que você e as máquinas mineram enche ela. Em 100% você <b>desce</b> para a camada de baixo. <b>Toque aqui</b> para terminar o tutorial.',
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
