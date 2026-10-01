import type { Input } from './Input';

/**
 * Layout horizontal para toque: joystick esquerdo (mover), joystick direito (mirar e usar),
 * ações principais ao alcance do polegar e menu dedicado para os painéis.
 */
export class MobileControls {
  root: HTMLDivElement;
  private leftId: number | null = null; private rightId: number | null = null;
  private lc = { x: 0, y: 0 }; private rc = { x: 0, y: 0 };
  private lk: HTMLDivElement; private rk: HTMLDivElement;
  private lb: HTMLDivElement; private rb: HTMLDivElement;

  constructor(private input: Input, onButton: (id: string) => void) {
    this.root = document.createElement('div');
    this.root.id = 'mobile';
    this.root.innerHTML = `
      <div class="stick left"><div class="base"></div><div class="knob"></div></div>
      <div class="stick right"><div class="base"></div><div class="knob"></div><span>MIRAR / USAR</span></div>
      <button class="mobile-menu-toggle" aria-label="Abrir menu">☰</button>
      <div class="mobile-actions">
        <button data-b="interact" aria-label="Interagir">E<small>INTERAGIR</small></button>
        <button data-b="scan" aria-label="Scanner">◎<small>SCANNER</small></button>
      </div>
      <div class="mobile-menu-panel">
        <div class="mobile-menu-title">MENU ZENITEX <button class="mobile-menu-close" aria-label="Fechar menu">✕</button></div>
        <div class="mobile-menu-grid">
          <button data-b="inv">▤ Inventário</button><button data-b="build">⚒ Construção</button>
          <button data-b="upgrades">✚ Melhorias</button><button data-b="research">⚗ Pesquisa</button>
          <button data-b="sectors">◈ Setores</button><button data-b="robots">⚙ Robôs</button>
          <button data-b="contracts">☰ Contratos</button><button data-b="archive">▣ Arquivo</button>
          <button data-b="map">⌖ Mapa</button><button data-b="tool2">✦ Ferramenta</button>
          <button data-b="hud">◫ Recolher HUD</button><button data-b="help">? Ajuda</button>
        </div>
      </div>`;
    document.body.appendChild(this.root);
    this.lb = this.root.querySelector('.left .base')!; this.lk = this.root.querySelector('.left .knob')!;
    this.rb = this.root.querySelector('.right .base')!; this.rk = this.root.querySelector('.right .knob')!;
    const closeMenu = () => { this.root.classList.remove('menu-open'); document.body.classList.remove('mobile-menu-open'); };
    this.root.querySelector('.mobile-menu-toggle')!.addEventListener('click', () => {
      const open = this.root.classList.toggle('menu-open');
      document.body.classList.toggle('mobile-menu-open', open);
    });
    this.root.querySelector('.mobile-menu-close')!.addEventListener('click', closeMenu);
    this.root.querySelectorAll<HTMLButtonElement>('[data-b]').forEach(b => b.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      closeMenu(); onButton(b.dataset.b!);
    }));
    const canvas = document.getElementById('game')!;
    const movePlacement = (t: Touch) => { input.placeX = t.clientX; input.placeY = t.clientY; input.placeDirty = true; };
    const start = (e: TouchEvent) => {
      if (input.placeMode) { for (const t of Array.from(e.changedTouches)) movePlacement(t); e.preventDefault(); return; }
      for (const t of Array.from(e.changedTouches)) {
        const left = t.clientX < window.innerWidth * 0.45;
        if (left && this.leftId === null) { this.leftId = t.identifier; this.lc = { x: t.clientX, y: t.clientY }; this.show(this.lb, this.lk, t.clientX, t.clientY); }
        else if (!left && this.rightId === null) { this.rightId = t.identifier; this.rc = { x: t.clientX, y: t.clientY }; this.show(this.rb, this.rk, t.clientX, t.clientY); input.aimActive = true; input.primary = false; }
      }
      e.preventDefault();
    };
    const move = (e: TouchEvent) => {
      if (input.placeMode) { for (const t of Array.from(e.changedTouches)) movePlacement(t); e.preventDefault(); return; }
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.leftId) {
          const [x, y] = this.clamp(t.clientX - this.lc.x, t.clientY - this.lc.y);
          input.moveX = x / 50; input.moveY = y / 50;
          this.lk.style.transform = `translate(${x}px,${y}px)`;
        }
        if (t.identifier === this.rightId) {
          const [x, y] = this.clamp(t.clientX - this.rc.x, t.clientY - this.rc.y);
          input.aimX = x; input.aimY = y;
          input.primary = Math.hypot(x, y) > 14;
          this.rk.style.transform = `translate(${x}px,${y}px)`;
        }
      }
      e.preventDefault();
    };
    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.leftId) { this.leftId = null; input.moveX = input.moveY = 0; this.hide(this.lb, this.lk); }
        if (t.identifier === this.rightId) { this.rightId = null; input.primary = false; input.aimActive = false; this.hide(this.rb, this.rk); }
      }
    };
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end); canvas.addEventListener('touchcancel', end);
  }
  private clamp(x: number, y: number): [number, number] { const d = Math.hypot(x, y), m = 50; return d > m ? [x / d * m, y / d * m] : [x, y]; }
  private show(b: HTMLDivElement, k: HTMLDivElement, x: number, y: number) {
    for (const el of [b, k]) { el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.opacity = '1'; }
    k.style.transform = 'translate(0,0)';
  }
  private hide(b: HTMLDivElement, k: HTMLDivElement) { b.style.opacity = '0.25'; k.style.opacity = '0.25'; k.style.transform = 'translate(0,0)'; }
}
