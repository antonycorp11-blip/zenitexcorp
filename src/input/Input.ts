/** Teclado + mouse + entradas virtuais (mobile). */
export class Input {
  keys = new Set<string>();
  private pressedSet = new Set<string>();
  mouseX = 0; mouseY = 0;          // px de tela (CSS)
  mouseMoved = false;
  worldX = 0; worldY = 0;
  primary = false; secondary = false;
  private primaryPressed = false; private secondaryPressed = false;
  wheel = 0;
  // mobile
  touch = false;
  moveX = 0; moveY = 0;
  aimActive = false; aimX = 0; aimY = 0;
  uiCapture = false;               // mouse sobre UI
  placeMode = false;
  placeX = 0; placeY = 0; placeDirty = false;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', e => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (!this.keys.has(k)) this.pressedSet.add(k);
      this.keys.add(k);
      if (k === 'Tab' || k === ' ' || k === 'F1') e.preventDefault();
    });
    window.addEventListener('keyup', e => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; this.keys.delete(k); });
    window.addEventListener('blur', () => { this.keys.clear(); this.primary = this.secondary = false; });
    canvas.addEventListener('mousemove', e => { this.mouseX = e.clientX; this.mouseY = e.clientY; this.mouseMoved = true; });
    canvas.addEventListener('mousedown', e => {
      this.mouseX = e.clientX; this.mouseY = e.clientY; this.mouseMoved = true;
      if (e.button === 0) { this.primary = true; this.primaryPressed = true; }
      if (e.button === 2) { this.secondary = true; this.secondaryPressed = true; }
    });
    window.addEventListener('mouseup', e => { if (e.button === 0) this.primary = false; if (e.button === 2) this.secondary = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  }

  down(k: string) { return this.keys.has(k); }
  pressed(k: string) { return this.pressedSet.has(k); }
  clickPrimary() { return this.primaryPressed; }
  clickSecondary() { return this.secondaryPressed; }
  press(k: string) { this.pressedSet.add(k); }

  axis(): [number, number] {
    if (this.touch && (this.moveX || this.moveY)) return [this.moveX, this.moveY];
    let x = 0, y = 0;
    if (this.down('a') || this.down('ArrowLeft')) x -= 1;
    if (this.down('d') || this.down('ArrowRight')) x += 1;
    if (this.down('w') || this.down('ArrowUp')) y -= 1;
    if (this.down('s') || this.down('ArrowDown')) y += 1;
    return [x, y];
  }

  endFrame() { this.pressedSet.clear(); this.primaryPressed = false; this.secondaryPressed = false; this.wheel = 0; }
}
