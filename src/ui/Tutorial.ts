import { TILE, CELL } from '../core/constants';
import { IS_SOLID } from '../data/materials';
import type { Game } from '../Game';
import { esc } from './dom';

type Target = string | (() => [number, number] | null) | null;
interface Step {
  id: string;
  title: string;
  text: (touch: boolean) => string;
  target: (g: Game, touch: boolean) => Target;   // seletor CSS ou ponto no mundo
  done: (g: Game) => boolean;
  manual?: boolean;                                 // concluído pelo botão "Entendi"
}

const MOBILE_KEY: Record<string, string> = { inventory: 'inv', build: 'build', upgrades: 'upgrades', research: 'research', sectors: 'sectors', robots: 'robots', contracts: 'contracts', archive: 'archive', map: 'map' };

/** Botão que abre um painel: lateral no PC, menu ☰ no celular. */
function openBtn(g: Game, touch: boolean, panel: string): string {
  // outro painel aberto por cima: primeiro feche-o
  if (g.ui.panels.id && g.ui.panels.id !== panel) return '.pnl .x';
  if (!touch) return `.side [data-open="${panel}"]`;
  return document.body.classList.contains('mobile-menu-open') ? `#mobile [data-b="${MOBILE_KEY[panel]}"]` : '.mobile-menu-toggle';
}
/** Fluxo de construção de uma peça pelo painel de Construção. */
function buildFlow(g: Game, touch: boolean, cat: string, key: string): Target {
  if (g.build.active && g.build.key === key) return '[data-build-action="confirm"]';
  if (g.ui.panels.id === 'build') {
    if (g.ui.panels.st.buildCat !== cat) return `.tabs [data-arg="buildCat:${cat}"]`;
    return `[data-act="build"][data-arg="${key}"]`;
  }
  return openBtn(g, touch, 'build');
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
  { id: 'move', title: 'Movimento', text: t => t ? 'Arraste o <b>joystick esquerdo</b> para andar.' : 'Use <b>W A S D</b> para andar (Shift corre).',
    target: (g, t) => t ? '#mobile .stick.left .base' : null, done: g => !!g.flags.tutMoved },
  { id: 'mine', title: 'Minerar', text: t => t ? 'Arraste o <b>joystick direito</b> na direção de uma parede e segure: o feixe mina a rocha. Remova 50 kg.' : 'Aponte o mouse para uma parede e <b>segure o botão esquerdo</b>. Remova 50 kg.',
    target: g => () => nearestWall(g), done: g => g.flags.tutorial >= 1 },
  { id: 'deliver', title: 'Entregar a carga', text: t => `Volte ao <b>Centro de Comando</b> (a cápsula laranja) e ${t ? 'toque no botão <b>E</b>' : 'aperte <b>E</b>'} perto dela. A mochila vai para o Estoque Central.`,
    target: (g, t) => t && g.hover?.kind === 'machine' ? '#mobile [data-b="interact"]' : () => commandPos(g), done: g => g.flags.tutorial >= 2 },
  { id: 'oficina', title: 'Construir a Oficina', text: t => `Abra a <b>Construção</b>${t ? ' pelo menu ☰' : ''}, vá na aba <b>Base</b>, toque em <b>POSICIONAR</b> na Oficina, ${t ? 'toque no chão' : 'mova o mouse'} para escolher o local e aperte <b>CONFIRMAR</b>.`,
    target: (g, t) => buildFlow(g, t, 'base', 'oficina'), done: g => g.machines.count('oficina') > 0 },
  { id: 'lab', title: 'Estação de Pesquisa', text: () => 'Do mesmo jeito: Construção → aba <b>Base</b> → <b>Estação de Pesquisa</b> → POSICIONAR → CONFIRMAR.',
    target: (g, t) => buildFlow(g, t, 'base', 'laboratorio'), done: g => g.machines.count('laboratorio') > 0 },
  { id: 'research', title: 'Primeira pesquisa', text: t => `Abra a <b>Pesquisa</b>${t ? ' pelo menu ☰' : ''}, aba <b>Processamento</b>, escolha <b>Refino Mineral</b> e aperte <b>PESQUISAR</b>. A pesquisa roda sozinha.`,
    target: (g, t) => {
      if (g.ui.panels.id !== 'research') return openBtn(g, t, 'research');
      if (g.ui.panels.st.resCat !== 'processamento') return '.tabs [data-arg="resCat:processamento"]';
      if (g.ui.panels.st.resSel !== 'refino') return '[data-arg="resSel:refino"]';
      return '[data-act="research"][data-arg="refino"]';
    }, done: g => !!g.research.active || g.research.has('refino') },
  { id: 'drill', title: 'Perfuradora automática', text: () => 'Toque no slot <b>7</b> da barra (Perfuradora). Gire com <b>GIRAR</b> até a broca apontar para uma parede (de preferência com cristais) e confirme. Ela minera sozinha.',
    target: g => g.build.active && g.build.key === 'perfuradora' ? '[data-build-action="confirm"]' : '.hotbar [data-slot="6"]', done: g => g.machines.countBehavior('drill') > 0 },
  { id: 'storage', title: 'Armazém na base', text: () => 'Slot <b>8</b> (Armazém). Armazéns só podem ficar perto do Centro de Comando (círculo tracejado). Posicione e confirme.',
    target: g => g.build.active && g.build.key === 'armazem' ? '[data-build-action="confirm"]' : '.hotbar [data-slot="7"]', done: g => g.machines.countBehavior('storage') > 0 },
  { id: 'belt', title: 'Ligar com esteira', text: t => `Slot <b>6</b> (Esteira). ${t ? 'Toque' : 'Clique'} ao lado da perfuradora e <b>arraste até o armazém</b>: as setas devem apontar para o armazém. Aperte CONFIRMAR para instalar a linha toda.`,
    target: g => g.build.active && g.build.key === 'esteira' ? (g.build.anchor ? '[data-build-action="confirm"]' : null) : '.hotbar [data-slot="5"]', done: g => g.machines.countBehavior('belt') >= 3 },
  { id: 'scan', title: 'Scanner', text: t => `${t ? 'Toque no botão <b>SCANNER</b>' : 'Aperte <b>F</b> (ou botão direito)'} para revelar minérios próximos. Aponte perfuradoras para eles.`,
    target: (g, t) => t ? '#mobile [data-b="scan"]' : '.hotbar [data-slot="1"]', done: g => (g.sectors.s[g.sectors.current]?.counters.scans ?? 0) > 0 },
  { id: 'next', title: 'Daqui em diante', text: t => `O painel de <b>objetivos</b> mostra a próxima tarefa do setor${t ? ' (toque nele para ver tudo)' : ''}. Contratos dão créditos, e o envio orbital fica em Contratos → Envio Orbital. A ajuda completa está no menu.`,
    target: () => '.objective', done: () => false, manual: true },
];

/** Tutorial guiado: caixa de instruções + anel pulsante no botão certo ou seta no mundo. */
export class Tutorial {
  private box: HTMLElement;
  private ring: HTMLElement;
  private arrow: HTMLElement;
  private lastStep = -1;
  private startX = 0; private startY = 0;

  constructor(private g: Game, layer: HTMLElement) {
    this.box = document.createElement('div'); this.box.className = 'tut-box ui-block';
    this.ring = document.createElement('div'); this.ring.className = 'tut-ring';
    this.arrow = document.createElement('div'); this.arrow.className = 'tut-arrow'; this.arrow.textContent = '▼';
    document.body.append(this.ring, this.arrow);
    document.body.appendChild(this.box); void layer;
    this.box.addEventListener('click', e => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-tut]')?.dataset.tut;
      if (a === 'skip') { this.g.flags.tutDone = true; this.g.toast('Tutorial pulado. Reative em Menu → Ajuda.', '#9ab'); }
      if (a === 'ok') this.advance();
    });
  }

  get active() { return !this.g.flags.tutDone && !this.g.flags.intro && !this.g.flags.ending; }
  restart() { this.g.flags.tutDone = false; this.g.flags.tutStep = 0; this.lastStep = -1; }
  private advance() { this.g.flags.tutStep = (this.g.flags.tutStep ?? 0) + 1; this.g.audio.success(); }

  update() {
    const g = this.g, touch = g.input.touch;
    const hide = () => { this.box.style.display = 'none'; this.ring.style.display = 'none'; this.arrow.style.display = 'none'; document.body.classList.remove('tut-on'); };
    if (!this.active) return hide();
    let i = g.flags.tutStep ?? 0;
    // passos já cumpridos (saves antigos, ou feitos antes da hora) são pulados
    while (i < STEPS.length && !STEPS[i].manual && STEPS[i].done(g)) i++;
    if (i >= STEPS.length) { g.flags.tutDone = true; return hide(); }
    if (i !== g.flags.tutStep) { if (g.flags.tutStep !== undefined) g.audio.success(); g.flags.tutStep = i; }
    const st = STEPS[i];
    if (i !== this.lastStep) {
      this.lastStep = i;
      if (st.id === 'move') { this.startX = g.player.x; this.startY = g.player.y; }
      this.box.innerHTML = `<div class="tut-h"><span>TUTORIAL ${i + 1}/${STEPS.length}</span><b>${esc(st.title)}</b><button data-tut="skip">Pular</button></div><div class="tut-t">${st.text(touch)}</div>${st.manual ? '<button class="btn orange tut-ok" data-tut="ok">ENTENDI</button>' : ''}`;
    }
    if (st.id === 'move' && Math.hypot(g.player.x - this.startX, g.player.y - this.startY) > 40) g.flags.tutMoved = true;
    document.body.classList.add('tut-on');
    // painéis cobrem o jogo: a caixa sobe para não tampar o alvo
    this.box.style.display = 'block';
    this.box.classList.toggle('over-panel', g.ui.modalOpen() || document.body.classList.contains('mobile-menu-open'));
    const tg = st.target(g, touch);
    this.ring.style.display = 'none'; this.arrow.style.display = 'none';
    if (typeof tg === 'string') {
      const el = Array.from(document.querySelectorAll<HTMLElement>(tg)).find(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
      if (!el) return;
      const r = el.getBoundingClientRect();
      Object.assign(this.ring.style, { display: 'block', left: r.left - 6 + 'px', top: r.top - 6 + 'px', width: r.width + 12 + 'px', height: r.height + 12 + 'px' });
      el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    } else if (typeof tg === 'function') {
      const p = tg(); if (!p) return;
      const cam = g.camera, dpr = cam.w / innerWidth;
      let sx = (p[0] - cam.left()) * cam.zoom / dpr, sy = (p[1] - TILE - cam.top()) * cam.zoom / dpr;
      const m = 40, off = sx < m || sy < m || sx > innerWidth - m || sy > innerHeight - m;
      sx = Math.max(m, Math.min(innerWidth - m, sx)); sy = Math.max(m, Math.min(innerHeight - m, sy));
      const ang = off ? Math.atan2(sy - innerHeight / 2, sx - innerWidth / 2) * 180 / Math.PI - 90 : 0;
      Object.assign(this.arrow.style, { display: 'block', left: sx + 'px', top: sy + 'px', transform: `translate(-50%,-100%) rotate(${ang}deg)` });
    }
  }
}
