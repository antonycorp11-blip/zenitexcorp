import { TILE } from '../core/constants';
import { hash2 } from '../core/rng';
import type { MachineDef } from '../data/machines';
import type { RobotKind } from '../data/robots';
import { ROBOT } from '../data/robots';

/**
 * Pixel art em VISTA LATERAL: personagem, máquinas, drones e baús.
 * Tudo é desenhado à mão em código, com contorno escuro, luz vinda de cima à esquerda,
 * 3–4 tons por material e detalhes que dizem o que a máquina faz (funil = entrada, calha = saída).
 */
type C3 = [number, number, number];
const css = (c: readonly number[], a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const sh = (c: readonly number[], k: number): C3 => [Math.max(0, Math.min(255, c[0] * k)), Math.max(0, Math.min(255, c[1] * k)), Math.max(0, Math.min(255, c[2] * k))];

export const P = {
  ink: [14, 15, 20] as C3,
  or: [236, 150, 40] as C3, orL: [255, 204, 102] as C3, orD: [170, 92, 22] as C3, orDD: [110, 56, 16] as C3,
  st: [74, 80, 94] as C3, stL: [128, 136, 152] as C3, stLL: [178, 186, 200] as C3, stD: [44, 48, 58] as C3, stDD: [28, 30, 38] as C3,
  glass: [40, 90, 130] as C3, glassL: [130, 210, 255] as C3,
  red: [230, 60, 50] as C3, green: [90, 230, 110] as C3, cyan: [70, 230, 240] as C3, yellow: [255, 214, 70] as C3,
  rust: [150, 84, 50] as C3, wood: [140, 96, 56] as C3, woodD: [92, 60, 34] as C3,
};

/** Kit de desenho em um canvas com pixels inteiros. */
class Pen {
  constructor(public x: CanvasRenderingContext2D) {}
  r(a: number, b: number, w: number, h: number, c: readonly number[], al = 1) {
    if (w <= 0 || h <= 0) return;
    this.x.fillStyle = css(c, al); this.x.fillRect(Math.round(a), Math.round(b), Math.round(w), Math.round(h));
  }
  px(a: number, b: number, c: readonly number[], al = 1) { this.r(a, b, 1, 1, c, al); }
  /** painel de metal com contorno, luz em cima, sombra embaixo, costuras e rebites */
  panel(a: number, b: number, w: number, h: number, c: readonly number[], o: { seams?: number; rivets?: boolean; ink?: boolean } = {}) {
    if (o.ink !== false) this.r(a - 1, b - 1, w + 2, h + 2, P.ink);
    this.r(a, b, w, h, c);
    this.r(a, b, w, 1, sh(c, 1.35)); this.r(a, b, 1, h, sh(c, 1.18));
    this.r(a, b + h - 1, w, 1, sh(c, 0.6)); this.r(a + w - 1, b + 1, 1, h - 1, sh(c, 0.72));
    if (o.seams) for (let k = o.seams; k < w - 1; k += o.seams) { this.r(a + k, b + 1, 1, h - 2, sh(c, 0.75)); this.r(a + k + 1, b + 1, 1, h - 2, sh(c, 1.12)); }
    if (o.rivets && w > 6 && h > 6) for (const [rx, ry] of [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]]) { this.px(a + rx, b + ry, sh(c, 1.6)); this.px(a + rx + 1, b + ry + 1, sh(c, 0.5)); }
  }
  /** listras de perigo */
  hazard(a: number, b: number, w: number, h: number) {
    this.r(a, b, w, h, P.yellow);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (((i + j) >> 2) % 2 === 0) this.px(a + i, b + j, P.ink);
  }
  window(a: number, b: number, w: number, h: number, glow: readonly number[] = P.glassL) {
    this.r(a - 1, b - 1, w + 2, h + 2, P.ink);
    this.r(a, b, w, h, sh(glow, 0.35));
    this.r(a, b, w, Math.max(1, h >> 1), sh(glow, 0.55));
    this.r(a + 1, b + 1, Math.max(1, w >> 2), 1, sh(glow, 1.1));
    this.px(a + w - 2, b + h - 2, sh(glow, 0.8));
  }
  light(a: number, b: number, c: readonly number[]) { this.r(a - 1, b - 1, 4, 4, P.ink); this.r(a, b, 2, 2, c); this.px(a, b, [255, 255, 235]); }
  /** funil de entrada no topo (trapézio) */
  hopper(a: number, b: number, w: number, h: number, c: readonly number[] = P.st) {
    for (let j = 0; j < h; j++) {
      const inset = Math.round((j / h) * (w * 0.28));
      this.r(a + inset - 1, b + j, w - inset * 2 + 2, 1, P.ink);
      this.r(a + inset, b + j, w - inset * 2, 1, j === 0 ? sh(c, 1.4) : sh(c, 1 - j / h * 0.25));
    }
    this.r(a + 1, b + 1, w - 2, 1, P.stDD);   // boca escura
    for (let k = 3; k < w - 3; k += 3) this.px(a + k, b, P.stLL);   // grade
  }
  /** calha de saída na lateral, embaixo */
  /** calha de saída descendo para fora; `a` é a borda do sprite do lado da saída */
  chute(a: number, b: number, right: boolean, c: readonly number[] = P.or) {
    for (let k = 0; k < 6; k++) {
      const x = right ? a - 5 + k : a + 5 - k;
      this.r(x, b + (k >> 1) - 1, 1, 5, P.ink); this.r(x, b + (k >> 1), 1, 3, k % 2 ? c : sh(c, 0.75)); this.px(x, b + (k >> 1), sh(c, 1.3));
    }
  }
  pipe(a: number, b: number, w: number, h: number, c: readonly number[] = P.stL) {
    this.r(a - 1, b - 1, w + 2, h + 2, P.ink); this.r(a, b, w, h, c);
    if (w > h) { this.r(a, b, w, 1, sh(c, 1.4)); this.r(a, b + h - 1, w, 1, sh(c, 0.6)); for (let k = 4; k < w; k += 8) this.r(a + k, b - 1, 2, h + 2, sh(c, 0.7)); }
    else { this.r(a, b, 1, h, sh(c, 1.4)); this.r(a + w - 1, b, 1, h, sh(c, 0.6)); for (let k = 4; k < h; k += 8) this.r(a - 1, b + k, w + 2, 2, sh(c, 0.7)); }
  }
  /** cilindro vertical (tanque/silo) */
  tank(a: number, b: number, w: number, h: number, c: readonly number[]) {
    this.r(a - 1, b + 1, w + 2, h - 1, P.ink); this.r(a + 1, b - 1, w - 2, 2, P.ink);
    for (let i = 0; i < w; i++) {
      const t = i / (w - 1);
      const k = 0.62 + Math.sin(t * Math.PI * 0.95 + 0.25) * 0.55 - (t > 0.8 ? 0.15 : 0);
      this.r(a + i, b + 1, 1, h - 2, sh(c, k));
    }
    this.r(a + 1, b, w - 2, 2, sh(c, 1.35));       // tampa
    for (let k = 6; k < h - 3; k += 7) this.r(a, b + k, w, 1, sh(c, 0.55)); // cintas
  }
  gear(cx: number, cy: number, r: number, c: readonly number[]) {
    for (let a = 0; a < 8; a++) { const ang = a / 8 * Math.PI * 2; this.r(cx + Math.cos(ang) * (r + 1) - 1, cy + Math.sin(ang) * (r + 1) - 1, 2, 2, c); }
    this.x.fillStyle = css(c); this.x.beginPath(); this.x.arc(cx, cy, r, 0, 7); this.x.fill();
    this.x.fillStyle = css(sh(c, 0.5)); this.x.beginPath(); this.x.arc(cx, cy, r * 0.4, 0, 7); this.x.fill();
  }
  legs(a: number, b: number, w: number, h: number) {
    this.r(a, b, 2, h, P.stD); this.r(a + w - 2, b, 2, h, P.stD);
    for (let k = 1; k < h; k += 3) this.px(a + 1 + (k % 2), b + k, P.stL);
    this.r(a - 1, b + h - 1, 4, 1, P.ink); this.r(a + w - 3, b + h - 1, 4, 1, P.ink);
  }
  /** pequeno logo hexagonal da Zenitex */
  logo(cx: number, cy: number) {
    this.r(cx - 3, cy - 2, 6, 5, P.ink); this.r(cx - 2, cy - 3, 4, 7, P.ink);
    this.r(cx - 2, cy - 2, 4, 5, P.or); this.r(cx - 1, cy - 1, 2, 1, P.ink); this.r(cx - 1, cy + 1, 2, 1, P.ink);
  }
}

/** Escala dos sprites: desenhados em alta resolução e reduzidos na tela (visual HD). */
export const SPRITE_K = 4;

/**
 * Caneta VETORIAL (HD ilustrado): mesmas operações da caneta de pixels, mas com cantos arredondados,
 * degradês, vidro com reflexo e contornos finos. Coordenadas lógicas (16 por tile), canvas em SPRITE_K×.
 */
class VPen extends Pen {
  private rr(a: number, b: number, w: number, h: number, r: number) { const x = this.x; x.beginPath(); x.roundRect(a, b, w, h, Math.min(r, w / 2, h / 2)); }
  private grad(a: number, b: number, h: number, c: readonly number[], top = 1.28, bot = 0.68) {
    const g = this.x.createLinearGradient(0, b, 0, b + h);
    g.addColorStop(0, css(sh(c, top))); g.addColorStop(0.45, css(c)); g.addColorStop(1, css(sh(c, bot)));
    return g;
  }
  private outline(w = 0.7) { this.x.strokeStyle = 'rgba(16,18,24,0.95)'; this.x.lineWidth = w; this.x.stroke(); }
  r(a: number, b: number, w: number, h: number, c: readonly number[], al = 1) {
    if (w <= 0 || h <= 0) return;
    this.x.fillStyle = css(c, al); this.x.fillRect(a, b, w, h);
  }
  px(a: number, b: number, c: readonly number[], al = 1) { this.x.fillStyle = css(c, al); this.x.beginPath(); this.x.arc(a + 0.5, b + 0.5, 0.55, 0, 7); this.x.fill(); }
  panel(a: number, b: number, w: number, h: number, c: readonly number[], o: { seams?: number; rivets?: boolean; ink?: boolean } = {}) {
    const x = this.x;
    this.rr(a, b, w, h, 1.6); x.fillStyle = this.grad(a, b, h, c); x.fill(); if (o.ink !== false) this.outline();
    // brilho superior
    this.rr(a + 0.8, b + 0.6, w - 1.6, Math.min(2, h * 0.2), 1); x.fillStyle = 'rgba(255,255,255,0.22)'; x.fill();
    if (o.seams) for (let k = o.seams; k < w - 1; k += o.seams) { x.fillStyle = css(sh(c, 0.7), 0.7); x.fillRect(a + k, b + 1, 0.5, h - 2); x.fillStyle = 'rgba(255,255,255,0.15)'; x.fillRect(a + k + 0.5, b + 1, 0.4, h - 2); }
    if (o.rivets && w > 6 && h > 6) for (const [rx, ry] of [[1.8, 1.8], [w - 1.8, 1.8], [1.8, h - 1.8], [w - 1.8, h - 1.8]]) {
      x.fillStyle = css(sh(c, 0.55)); x.beginPath(); x.arc(a + rx, b + ry + 0.15, 0.7, 0, 7); x.fill();
      x.fillStyle = css(sh(c, 1.5)); x.beginPath(); x.arc(a + rx - 0.1, b + ry - 0.1, 0.45, 0, 7); x.fill();
    }
  }
  hazard(a: number, b: number, w: number, h: number) {
    const x = this.x;
    x.save(); this.rr(a, b, w, h, 0.6); x.clip();
    x.fillStyle = css(P.yellow); x.fillRect(a, b, w, h);
    x.fillStyle = css(P.ink);
    for (let k = -h; k < w + h; k += 4) { x.beginPath(); x.moveTo(a + k, b + h); x.lineTo(a + k + 2, b + h); x.lineTo(a + k + 2 + h, b); x.lineTo(a + k + h, b); x.closePath(); x.fill(); }
    x.restore();
  }
  window(a: number, b: number, w: number, h: number, glow: readonly number[] = P.glassL) {
    const x = this.x;
    this.rr(a, b, w, h, 1.2);
    const g = x.createLinearGradient(a, b, a + w * 0.6, b + h);
    g.addColorStop(0, css(sh(glow, 0.8))); g.addColorStop(1, css(sh(glow, 0.28)));
    x.fillStyle = g; x.fill(); this.outline(0.6);
    // reflexo diagonal
    x.save(); this.rr(a, b, w, h, 1.2); x.clip();
    x.fillStyle = 'rgba(255,255,255,0.35)';
    x.beginPath(); x.moveTo(a + w * 0.15, b); x.lineTo(a + w * 0.4, b); x.lineTo(a + w * 0.1, b + h); x.lineTo(a - w * 0.15, b + h); x.closePath(); x.fill();
    x.restore();
  }
  light(a: number, b: number, c: readonly number[]) {
    const x = this.x, cx = a + 1, cy = b + 1;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, 3);
    g.addColorStop(0, css(c, 0.6)); g.addColorStop(1, css(c, 0));
    x.fillStyle = g; x.fillRect(cx - 3, cy - 3, 6, 6);
    x.beginPath(); x.arc(cx, cy, 1.2, 0, 7); x.fillStyle = css(c); x.fill(); this.outline(0.4);
    x.beginPath(); x.arc(cx - 0.35, cy - 0.35, 0.4, 0, 7); x.fillStyle = 'rgba(255,255,255,0.9)'; x.fill();
  }
  hopper(a: number, b: number, w: number, h: number, c: readonly number[] = P.st) {
    const x = this.x, ins = w * 0.28;
    x.beginPath(); x.moveTo(a, b); x.lineTo(a + w, b); x.lineTo(a + w - ins, b + h); x.lineTo(a + ins, b + h); x.closePath();
    x.fillStyle = this.grad(a, b, h, c, 1.4, 0.7); x.fill(); this.outline(0.6);
    x.fillStyle = 'rgba(10,10,14,0.85)'; x.beginPath(); x.ellipse(a + w / 2, b + 0.6, w / 2 - 0.8, 0.9, 0, 0, 7); x.fill();
  }
  chute(a: number, b: number, right: boolean, c: readonly number[] = P.or) {
    const x = this.x, d = right ? 1 : -1, x0 = right ? a - 5 : a + 5;
    x.beginPath(); x.moveTo(x0, b - 1); x.lineTo(x0 + d * 6, b + 2); x.lineTo(x0 + d * 6, b + 4.5); x.lineTo(x0, b + 2); x.closePath();
    x.fillStyle = this.grad(x0, b - 1, 5, c); x.fill(); this.outline(0.5);
  }
  pipe(a: number, b: number, w: number, h: number, c: readonly number[] = P.stL) {
    const x = this.x;
    const g = w > h ? x.createLinearGradient(0, b, 0, b + h) : x.createLinearGradient(a, 0, a + w, 0);
    g.addColorStop(0, css(sh(c, 0.7))); g.addColorStop(0.35, css(sh(c, 1.35))); g.addColorStop(1, css(sh(c, 0.55)));
    this.rr(a, b, w, h, Math.min(w, h) / 2); x.fillStyle = g; x.fill(); this.outline(0.5);
  }
  tank(a: number, b: number, w: number, h: number, c: readonly number[]) {
    const x = this.x;
    const g = x.createLinearGradient(a, 0, a + w, 0);
    g.addColorStop(0, css(sh(c, 0.62))); g.addColorStop(0.3, css(sh(c, 1.35))); g.addColorStop(0.7, css(c)); g.addColorStop(1, css(sh(c, 0.5)));
    this.rr(a, b, w, h, w * 0.25); x.fillStyle = g; x.fill(); this.outline();
    for (let k = 6; k < h - 3; k += 7) { x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(a + 0.5, b + k, w - 1, 0.7); }
  }
  legs(a: number, b: number, w: number, h: number) {
    for (const lx of [a, a + w - 2]) { this.rr(lx, b, 2, h, 0.6); this.x.fillStyle = this.grad(lx, b, h, P.stD, 1.5, 0.8); this.x.fill(); this.outline(0.4); }
    this.rr(a - 1, b + h - 1, 4, 1.2, 0.5); this.x.fillStyle = css(P.stD); this.x.fill();
    this.rr(a + w - 3, b + h - 1, 4, 1.2, 0.5); this.x.fill();
  }
  logo(cx: number, cy: number) {
    const x = this.x;
    x.beginPath(); for (let i = 0; i < 6; i++) { const ang = i / 6 * Math.PI * 2 - Math.PI / 2; x.lineTo(cx + Math.cos(ang) * 3, cy + Math.sin(ang) * 3); } x.closePath();
    x.fillStyle = css(P.or); x.fill(); this.outline(0.5);
    x.fillStyle = css(P.ink); x.fillRect(cx - 1.2, cy - 1.2, 2.4, 0.6); x.fillRect(cx - 1.2, cy + 0.6, 2.4, 0.6); x.fillRect(cx - 0.3, cy - 1.2, 0.6, 2.4);
  }
}

function canvas(w: number, h: number): [HTMLCanvasElement, Pen] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * SPRITE_K)); c.height = Math.max(1, Math.ceil(h * SPRITE_K));
  const x = c.getContext('2d')!; x.imageSmoothingEnabled = true;
  x.scale(SPRITE_K, SPRITE_K);
  return [c, new VPen(x)];
}

/** Altura extra acima da pegada (antenas, chaminés, torres). */
export function sideExtra(def: MachineDef): number {
  switch (def.key) {
    case 'comando': return 22;
    case 'terminal_orbital': return 40;
    case 'refinaria': return 22;
    case 'perfuradora': case 'perfuradora2': case 'perfuradora3': return 18;
    case 'complexo': return 34;
    case 'holofote': return 14;
    case 'analisador': return 8;
    default:
      if (def.cat === 'mega') return 40;
      if (def.behavior === 'separator' || def.behavior === 'prep' || def.behavior === 'compactor' || def.behavior === 'storage') return 7;
      return 4;
  }
}

/** Sprite lateral de uma máquina: pegada W×H tiles + `ex` px acima. dir 0 = direita, 2 = esquerda (1 baixo, 3 cima p/ perfuradoras). */
export function drawSideMachine(def: MachineDef, dir: number, level: number): HTMLCanvasElement {
  const ex = sideExtra(def);
  const W = def.w * TILE, H = def.h * TILE;
  const [c, p] = canvas(W, H + ex);
  const top = ex, bot = ex + H;            // y do topo da pegada e do chão
  const right = dir !== 2;
  const glow = def.glow ?? [255, 180, 80];
  const k = def.key;

  // sombra de contato no chão
  p.r(1, bot - 1, W - 2, 1, [0, 0, 0], 0.5);

  if (k === 'comando') {
    // cápsula de pouso: casco laranja arredondado, janela, pernas, rampa e antena
    const x = p.x, cx = W / 2, cy = top + 22;
    p.legs(4, bot - 10, W - 8, 10);
    p.pipe(cx - 0.8, top - 20, 1.6, 12, P.stL); p.light(cx - 1, top - 23, P.red);
    x.beginPath(); x.ellipse(cx, cy, 20.5, 20.5, 0, Math.PI, 0); x.lineTo(cx + 20.5, cy + 12); x.quadraticCurveTo(cx, cy + 18, cx - 20.5, cy + 12); x.closePath();
    const dg = x.createRadialGradient(cx - 7, cy - 12, 2, cx, cy, 26); dg.addColorStop(0, css(P.orL)); dg.addColorStop(0.55, css(P.or)); dg.addColorStop(1, css(P.orDD));
    x.fillStyle = dg; x.fill(); x.strokeStyle = 'rgba(16,18,24,0.95)'; x.lineWidth = 0.8; x.stroke();
    x.save(); x.clip();
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(cx - 22, cy + 6, 44, 2);
    p.hazard(cx - 18, cy + 9, 36, 3);
    x.restore();
    x.fillStyle = 'rgba(255,255,255,0.28)'; x.beginPath(); x.ellipse(cx - 9, cy - 11, 6, 3, -0.6, 0, 7); x.fill();
    p.window(cx - 6, cy - 9, 12, 9);
    p.logo(cx, cy + 2);
    p.panel(cx - 7, bot - 9, 14, 8, P.stD, { rivets: true });
    x.beginPath(); x.roundRect(cx - 4, bot - 7, 8, 5, 1); const dgl = x.createLinearGradient(0, bot - 7, 0, bot - 2); dgl.addColorStop(0, '#fff2c8'); dgl.addColorStop(1, '#ffae48'); x.fillStyle = dgl; x.fill();
  } else if (k === 'terminal_orbital') {
    // torre de lançamento com foguete de carga
    p.panel(1, bot - 8, W - 2, 8, P.stD, { seams: 8, rivets: true });
    p.hazard(2, bot - 9, W - 4, 2);
    for (let y = top - 38; y < bot - 9; y += 1) { p.px(4, y, P.st); p.px(5, y, P.stD); }
    for (let y = top - 38; y < bot - 9; y += 6) { for (let i = 0; i < 8; i++) p.px(4 + i, y + (i >> 1), P.stL); }
    const rx = W / 2 + 2;
    p.r(rx - 6, top - 30, 12, 50, P.ink);
    p.r(rx - 5, top - 26, 10, 46, [226, 228, 236]); p.r(rx - 5, top - 26, 3, 46, [255, 255, 255]); p.r(rx + 3, top - 26, 2, 46, [170, 172, 184]);
    for (let j = 0; j < 6; j++) p.r(rx - 4 + j, top - 32 + j, 8 - j * 2 + 0, 1, j < 2 ? P.or : [226, 228, 236]);
    p.r(rx - 5, top - 10, 10, 3, P.or); p.r(rx - 5, top + 8, 10, 2, P.orD);
    p.window(rx - 2, top - 18, 4, 3);
    p.r(rx - 8, top + 14, 3, 6, P.st); p.r(rx + 5, top + 14, 3, 6, P.st);
    p.logo(rx, top);
    p.light(W - 6, top - 6, P.red);
  } else if (k === 'analisador') {
    p.panel(1, top + 2, W - 2, H - 2, [72, 88, 110], { rivets: true });
    p.r(4, top + 6, 10, 20, P.ink);
    p.r(5, top + 7, 8, 18, [30, 60, 90]);
    p.r(5, top + 13, 8, 12, [60, 170, 230]); p.r(6, top + 14, 1, 10, [180, 240, 255]);   // cilindro de análise
    for (let j = 0; j < 4; j++) p.px(8 + (j % 2), top + 21 - j * 3, [220, 250, 255]);
    p.window(17, top + 7, 11, 7, [120, 255, 170]);
    p.r(18, top + 9, 2, 3, P.green); p.r(21, top + 10, 2, 2, P.yellow); p.r(24, top + 8, 2, 4, P.cyan);
    p.r(17, top + 18, 11, 3, P.stD); p.light(18, top + 19, P.red); p.light(22, top + 19, P.green); p.light(26, top + 19, P.yellow);
    p.hopper(3, top - 6, 14, 6);
    p.pipe(W - 6, top - 8, 2, 10, P.stL);
    p.r(1, bot - 3, W - 2, 2, P.stD);
  } else if (def.behavior === 'storage') {
    // armazém: caixa reforçada com funil e estêncil
    const big = def.w >= 3;
    if (big) { p.tank(3, top + 2, W - 6, H - 4, [196, 120, 44]); }
    else {
      p.panel(1, top + 3, W - 2, H - 3, P.or, { seams: 5, rivets: true });
      p.r(1, top + 3 + (H >> 1), W - 2, 2, P.orDD);
    }
    p.r(W / 2 - 4, top + 9, 8, 7, P.ink); p.r(W / 2 - 3, top + 10, 6, 1, P.orL); p.r(W / 2 - 3, top + 15, 6, 1, P.orL);
    p.r(W / 2 - 1, top + 11, 2, 4, P.orL);   // "Z"
    p.hopper(3, top - 4, W - 6, 6, P.st);
    p.hazard(2, bot - 3, W - 4, 2);
  } else if (def.behavior === 'drill') {
    // sonda: torre treliçada sobre o motor; a broca/haste é desenhada no mapa
    const col = level === 2 ? [180, 70, 230] as C3 : level === 1 ? [70, 150, 230] as C3 : P.or;
    p.panel(2, top + 10, W - 4, H - 10, P.stD, { seams: 6, rivets: true });
    p.r(4, top + 13, W - 8, 6, col); p.r(4, top + 13, W - 8, 1, sh(col, 1.4));
    p.hazard(3, bot - 4, W - 6, 2);
    // torre
    for (let y = top - 16; y < top + 10; y++) { const inset = Math.round((top + 10 - y) * 0.28); p.px(5 + inset, y, P.stL); p.px(W - 6 - inset, y, P.stL); }
    for (let y = top - 14; y < top + 10; y += 5) { const inset = Math.round((top + 10 - y) * 0.28); p.r(5 + inset, y, W - 10 - inset * 2, 1, P.st); }
    p.r(W / 2 - 3, top - 18, 6, 3, P.ink); p.r(W / 2 - 2, top - 17, 4, 1, col);
    p.light(W / 2 - 1, top - 21, P.red);
    p.gear(W / 2, top + 24, 4, P.stL);
    p.window(6, top + 21, 4, 3, [255, 190, 90]);
    // seta da direção de perfuração
    const ar: Record<number, [number, number]> = { 0: [W - 7, top + 24], 1: [W / 2 - 1, bot - 7], 2: [5, top + 24], 3: [W / 2 - 1, top + 11] };
    const [axp, ayp] = ar[dir] ?? ar[1];
    p.r(axp, ayp, 3, 3, P.yellow);
  } else if (def.outMode === 'sieve') {
    // peneira: moldura com grade inclinada; minerais caem pela grade, resíduo escorrega para o lado da seta
    const x = p.x, heavy = def.key === 'peneira_pesada';
    const fr: C3 = heavy ? [110, 80, 150] : [58, 104, 132];
    p.panel(1, top + 1, W - 2, H - 3, fr, { rivets: true });
    x.save(); x.beginPath(); x.rect(3, top + 3, W - 6, H - 7); x.clip();
    x.fillStyle = 'rgba(10,20,30,0.85)'; x.fillRect(3, top + 3, W - 6, H - 7);
    // grade inclinada (desce para o lado da seta)
    const hi = right ? top + 4 : top + H - 6, lo = right ? top + H - 6 : top + 4;
    x.strokeStyle = css(P.stLL); x.lineWidth = 0.9;
    x.beginPath(); x.moveTo(3, right ? top + 4 : top + H - 7); x.lineTo(W - 3, right ? top + H - 7 : top + 4); x.stroke();
    x.strokeStyle = css(P.stL, 0.8); x.lineWidth = 0.5;
    for (let k = 4; k < W - 4; k += 2) { const t = (k - 3) / (W - 6); const yy = (right ? top + 4 + t * (H - 11) : top + H - 7 - t * (H - 11)); x.beginPath(); x.moveTo(k, yy); x.lineTo(k, yy + 2.2); x.stroke(); }
    void hi; void lo;
    x.restore();
    // bocas: em cima (entrada), embaixo (minerais), lateral (resíduo)
    x.fillStyle = 'rgba(10,10,14,0.9)'; x.fillRect(4, top + 0.5, W - 8, 1.2);
    x.fillStyle = css([90, 170, 255]); x.fillRect(W / 2 - 3, bot - 2, 6, 1.4);
    p.chute(right ? W - 1 : 0, top + 4, right, [150, 120, 96]);
    p.light(right ? 2 : W - 4, top + 3, glow);
  } else if (def.behavior === 'compactor' && def.outMode === 'bottom') {
    // prensa vertical: funil em cima, pistão, bloco saindo por baixo
    const x = p.x;
    p.hopper(1, top - 4, W - 2, 5);
    p.panel(1, top + 1, W - 2, H - 4, P.stD, { rivets: true });
    p.panel(3, top + 4, W - 6, 4, P.or);
    p.pipe(W / 2 - 1.2, top + 8, 2.4, 9, P.stLL);
    p.panel(3, top + 17, W - 6, 3, P.orD);
    x.fillStyle = css([160, 136, 108]); x.beginPath(); x.roundRect(4, bot - 9, W - 8, 5, 0.8); x.fill();
    x.strokeStyle = 'rgba(16,18,24,0.9)'; x.lineWidth = 0.5; x.stroke();
    p.hazard(1, bot - 3, W - 2, 2);
  } else if (def.behavior === 'filter' && def.pick) {
    // Ímã (ferradura vermelha) / Ressonador (anéis de cristal): caixa larga com grade e calha lateral
    const x = p.x, ima = def.key === 'ima';
    p.panel(1, top + 2, W - 2, H - 3, ima ? [70, 74, 86] : [44, 70, 96], { rivets: true });
    x.fillStyle = 'rgba(10,10,14,0.9)'; x.fillRect(3, top + 1, W - 6, 1.4);
    x.strokeStyle = css(P.stL); x.lineWidth = 0.4;
    for (let k = 4; k < W - 3; k += 2.5) { x.beginPath(); x.moveTo(k, bot - 3.2); x.lineTo(k, bot - 1.4); x.stroke(); }
    const cx = right ? W - 9 : 9, cy = top + H / 2 - 1;
    if (ima) {
      x.lineWidth = 3.2; x.lineCap = 'butt';
      x.strokeStyle = css([210, 40, 36]); x.beginPath(); x.arc(cx, cy, 3.6, right ? Math.PI * 0.5 : -Math.PI * 0.5, right ? Math.PI * 1.5 : Math.PI * 0.5, !right); x.stroke();
      x.fillStyle = css([230, 230, 236]); x.fillRect(cx + (right ? 0 : -2.4), cy - 5.2, 2.4, 3.2); x.fillRect(cx + (right ? 0 : -2.4), cy + 2, 2.4, 3.2);
      for (let i = 0; i < 3; i++) p.px(W / 2 - 6 + i * 3, cy - 1 + (i % 2), [170, 172, 196]);
    } else {
      for (let r = 1; r <= 3; r++) { x.strokeStyle = css([120, 220, 255], 1 - r * 0.22); x.lineWidth = 0.7; x.beginPath(); x.ellipse(cx, cy, r * 1.8, r * 1.2, 0, 0, 7); x.stroke(); }
      x.fillStyle = css([140, 230, 255]); x.beginPath(); x.moveTo(cx, cy - 2.4); x.lineTo(cx + 1.4, cy); x.lineTo(cx, cy + 2.4); x.lineTo(cx - 1.4, cy); x.closePath(); x.fill();
    }
    p.chute(right ? W - 1 : 0, top + 3, right, glow);
    p.light(right ? 3 : W - 5, top + 3, glow);
  } else if (def.behavior === 'silo') {
    // silo: cilindro alto com teto cônico, funil em cima e calha de transbordo
    const x = p.x;
    p.hopper(6, top - 4, W - 12, 5);
    x.beginPath(); x.roundRect(2, top + 2, W - 4, H - 4, 3);
    const gr = x.createLinearGradient(2, 0, W - 2, 0); gr.addColorStop(0, css(P.stD)); gr.addColorStop(0.35, css(P.stLL)); gr.addColorStop(1, css(P.st));
    x.fillStyle = gr; x.fill(); x.strokeStyle = 'rgba(16,18,24,0.95)'; x.lineWidth = 0.6; x.stroke();
    x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 0.5; for (let y = top + 8; y < bot - 4; y += 6) { x.beginPath(); x.moveTo(3, y); x.lineTo(W - 3, y); x.stroke(); }
    p.hazard(2, bot - 4, W - 4, 2);
    p.chute(right ? W - 1 : 0, top + 6, right, [255, 176, 74]);
  } else if (def.behavior === 'filter') {
    const x = p.x;
    p.panel(1, top + 2, W - 2, H - 3, [70, 80, 96], { rivets: false });
    x.strokeStyle = css(P.stLL); x.lineWidth = 0.6;
    for (let k = 3; k < W - 2; k += 2) { x.beginPath(); x.moveTo(k, top + 4); x.lineTo(k, top + H - 4); x.stroke(); }
    x.fillStyle = css(P.yellow);
    const ax = right ? W - 3 : 3; x.beginPath(); x.moveTo(ax, top + H / 2); x.lineTo(W / 2, top + 4); x.lineTo(W / 2, top + H - 3); x.closePath(); x.globalAlpha = 0.85; x.fill(); x.globalAlpha = 1;
  } else if (def.key === 'piso_orbital') {
    // piso de liga orbital: chapa grossa com borda de perigo, rebites e luz azul; treliça curta embaixo
    const x = p.x;
    x.fillStyle = css(P.stD); x.fillRect(1.5, top + 6, 1.4, H - 6); x.fillRect(W - 2.9, top + 6, 1.4, H - 6);
    x.strokeStyle = css(P.st); x.lineWidth = 0.9; x.beginPath(); x.moveTo(2.5, top + 6); x.lineTo(W - 2.5, bot - 1); x.moveTo(W - 2.5, top + 6); x.lineTo(2.5, bot - 1); x.stroke();
    x.beginPath(); x.rect(0, top, W, 6);
    const g = x.createLinearGradient(0, top, 0, top + 6); g.addColorStop(0, css(P.stLL)); g.addColorStop(0.5, css(P.stL)); g.addColorStop(1, css(P.stD));
    x.fillStyle = g; x.fill(); x.strokeStyle = 'rgba(16,18,24,0.95)'; x.lineWidth = 0.5; x.stroke();
    p.hazard(0, top + 4, W, 2);
    x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(0, top + 0.4, W, 0.6);
    for (const rx of [2.5, W - 2.5]) { x.fillStyle = css(P.stD); x.beginPath(); x.arc(rx, top + 2.2, 0.7, 0, 7); x.fill(); }
    x.fillStyle = css([90, 200, 255]); x.fillRect(W / 2 - 1, top + 1.6, 2, 1.2);
  } else if (def.behavior === 'scaffold') {
    const x = p.x;
    x.beginPath(); x.roundRect(0.3, top + 0.3, W - 0.6, 4, 0.8);
    const g = x.createLinearGradient(0, top, 0, top + 4); g.addColorStop(0, css(P.stLL)); g.addColorStop(1, css(P.st));
    x.fillStyle = g; x.fill(); x.strokeStyle = 'rgba(16,18,24,0.95)'; x.lineWidth = 0.5; x.stroke();
    x.strokeStyle = css(P.stD); x.lineWidth = 1;
    x.beginPath(); x.moveTo(2, top + 4); x.lineTo(W - 2, bot); x.moveTo(W - 2, top + 4); x.lineTo(2, bot); x.stroke();
    x.fillStyle = css(P.stD); x.fillRect(1, top + 4, 1.4, H - 4); x.fillRect(W - 2.4, top + 4, 1.4, H - 4);
  } else if (def.behavior === 'separator') {
    // peneira vibratória: grade inclinada vista pela janela, calhas dos dois lados (minerais / resíduo)
    const ind = def.key === 'separador_industrial';
    const body: C3 = ind ? [92, 66, 120] : def.key === 'processador_solo' ? [52, 96, 120] : [48, 78, 104];
    p.panel(1, top + 3, W - 2, H - 5, body, { seams: 8, rivets: true });
    const wx = 4, wy = top + 7, ww = W - 8, wh = H - 16;
    p.window(wx, wy, ww, wh, [120, 200, 255]);
    for (let i = 0; i < ww; i++) { const yy = wy + Math.round(wh * 0.25 + (right ? i : ww - i) / ww * wh * 0.5); p.px(wx + i, yy, P.stLL); if (i % 3 === 0) p.px(wx + i, yy + 1, P.stL); }
    for (let i = 0; i < 6; i++) p.px(wx + 3 + ((i * 7) % (ww - 6)), wy + 2 + ((i * 5) % 4), i % 2 ? [90, 160, 255] : [180, 180, 200]);
    if (def.key === 'processador_solo') for (let k2 = 0; k2 < 3; k2++) p.r(2, top + 9 + k2 * 5, W - 4, 1, [120, 230, 255], 0.55);  // anéis de ressonância
    p.hopper(4, top - 4, W - 8, 6);
    p.chute(right ? W - 1 : 0, bot - 10, right, [90, 170, 255]);       // saída: minerais + resíduo
    p.legs(3, bot - 3, W - 6, 3);
    p.light(W - 6, top + 5, glow);
  } else if (def.behavior === 'prep') {
    // triturador / fragmentador / descompressor / desintegrador
    const kk = def.key;
    const body: C3 = kk === 'fragmentador' ? [80, 140, 170] : kk === 'descompressor' ? [110, 80, 150] : kk === 'desintegrador' ? [150, 80, 40] : kk === 'triturador_pesado' ? [120, 52, 40] : [100, 92, 80];
    p.panel(1, top + 3, W - 2, H - 5, body, { seams: 6, rivets: true });
    if (kk === 'descompressor' || kk === 'desintegrador') {
      const cx = W / 2, cy = top + H / 2;
      p.x.fillStyle = css(P.ink); p.x.beginPath(); p.x.arc(cx, cy, H * 0.32 + 1, 0, 7); p.x.fill();
      p.x.fillStyle = css(sh(body, 1.3)); p.x.beginPath(); p.x.arc(cx, cy, H * 0.32, 0, 7); p.x.fill();
      p.x.fillStyle = css(glow); p.x.beginPath(); p.x.arc(cx, cy, H * 0.14, 0, 7); p.x.fill();
      p.px(cx - 1, cy - 2, [255, 255, 240]);
    } else {
      // rolos dentados visíveis
      p.window(4, top + 8, W - 8, H - 18, [255, 160, 80]);
      p.gear(W / 2 - 5, top + 8 + (H - 18) / 2, 4, P.stLL); p.gear(W / 2 + 5, top + 8 + (H - 18) / 2, 4, P.stL);
    }
    p.hopper(4, top - 4, W - 8, 6);
    if (def.outMode === 'bottom') { p.x.fillStyle = 'rgba(10,10,14,0.9)'; p.x.fillRect(W / 2 - 4, bot - 2, 8, 1.6); p.x.fillStyle = css([90, 170, 255]); p.x.fillRect(W / 2 - 3, bot - 1.4, 6, 0.8); }
    else p.chute(right ? W - 1 : 0, bot - 10, right, P.or);
    p.hazard(2, bot - 4, W - 4, 2);
  } else if (def.behavior === 'compactor') {
    // prensa: pórtico com pistão e blocos prontos
    p.panel(1, top + 10, W - 2, H - 10, P.stD, { seams: 6, rivets: true });
    p.r(3, top + 1, 3, 12, P.st); p.r(W - 6, top + 1, 3, 12, P.st);
    p.panel(3, top - 2, W - 6, 4, P.or);
    p.pipe(W / 2 - 2, top + 2, 4, 9, P.stLL);
    p.panel(W / 2 - 7, top + 11, 14, 4, P.orD);
    for (let i = 0; i < 2; i++) { p.r(5 + i * 9, bot - 9, 7, 6, P.ink); p.r(6 + i * 9, bot - 8, 5, 4, [160, 136, 108]); p.r(6 + i * 9, bot - 8, 5, 1, [196, 170, 140]); }
    p.hopper(W - 12, top - 6, 9, 4);
    p.chute(right ? W - 1 : 0, bot - 8, right, [160, 136, 108]);
  } else if (def.behavior === 'refinery') {
    p.panel(2, top + 4, W - 4, H - 4, [96, 60, 44], { seams: 8, rivets: true });
    p.pipe(W - 12, top - 20, 6, 26, [90, 90, 100]);
    p.r(W - 13, top - 22, 8, 3, P.ink);
    p.r(8, top + 18, 18, 12, P.ink); p.r(9, top + 19, 16, 10, [255, 120, 30]); p.r(9, top + 19, 16, 3, [255, 220, 120]);  // boca do forno
    p.hopper(6, top - 2, 16, 6);
    p.chute(right ? W - 1 : 0, bot - 10, right, P.or);
    p.hazard(3, bot - 4, W - 6, 2);
  } else if (def.behavior === 'riser') {
    // elevador de grãos: trilhos com caçambas
    p.r(1, 0, 2, H + ex, P.ink); p.r(W - 3, 0, 2, H + ex, P.ink);
    p.r(2, 0, 1, H + ex, P.stL); p.r(W - 3, 0, 1, H + ex, P.st);
    for (let y = ex + 1; y < H + ex; y += 6) { p.r(4, y, W - 8, 3, P.ink); p.r(5, y, W - 10, 2, P.or); }
    p.r(right ? W - 4 : 1, ex + 1, 3, 2, P.yellow);
  } else if (def.behavior === 'launcher') {
    // base com mola e um cano inclinado para o lado da seta
    p.panel(1, top + 8, W - 2, H - 8, P.stD, { rivets: false });
    p.hazard(2, bot - 3, W - 4, 2);
    const d = right ? 1 : -1, bx = W / 2, by = top + 9;
    for (let k = 0; k < 9; k++) { p.r(bx + d * k - 2, by - k - 2, 5, 5, P.ink); }
    for (let k = 0; k < 9; k++) { p.r(bx + d * k - 1, by - k - 1, 3, 3, k > 6 ? P.orL : P.or); }
    p.r(bx - 3, top + 2, 6, 5, P.stL); p.r(bx - 3, top + 2, 6, 1, P.stLL);
  } else if (def.behavior === 'blower') {
    // soprador portátil: carcaça amarela com ventoinha (boca de aspiração), alça de carregar e bocal na seta
    const x = p.x, cx = W / 2, cy = top + H / 2 + 1;
    p.panel(1, top + 3, W - 2, H - 4, [214, 164, 40], { rivets: true });
    p.hazard(1, bot - 3, W - 2, 2);
    x.fillStyle = css(P.ink); x.beginPath(); x.arc(cx, cy, 4.6, 0, 7); x.fill();
    x.fillStyle = css(P.stD); x.beginPath(); x.arc(cx, cy, 4, 0, 7); x.fill();
    x.strokeStyle = css(P.stLL); x.lineWidth = 0.7;
    for (let i = 0; i < 5; i++) { const a = i * 1.2566; x.beginPath(); x.moveTo(cx, cy); x.quadraticCurveTo(cx + Math.cos(a + 0.6) * 3, cy + Math.sin(a + 0.6) * 3, cx + Math.cos(a) * 3.8, cy + Math.sin(a) * 3.8); x.stroke(); }
    x.fillStyle = css(P.stLL); x.beginPath(); x.arc(cx, cy, 1, 0, 7); x.fill();
    // alça
    x.strokeStyle = css(P.ink); x.lineWidth = 1.6; x.beginPath(); x.moveTo(4, top + 3); x.quadraticCurveTo(cx, top - 4, W - 4, top + 3); x.stroke();
    x.strokeStyle = css(P.stL); x.lineWidth = 0.8; x.stroke();
    // bocal
    const nx = right ? W - 1 : -3;
    p.panel(nx, cy - 2.5, 4, 5, P.stL);
    p.light(right ? 2 : W - 4, top + 4, glow);
  } else if (def.behavior === 'tube') {
    // desenhado no Renderer (liga nos vizinhos)
  } else if (def.behavior === 'link') {
    p.r(1, top, 3, H, P.ink); p.r(W - 4, top, 3, H, P.ink); p.r(2, top, 1, H, P.stL); p.r(W - 3, top, 1, H, P.stL);
    p.panel(5, top + 6, W - 10, H - 10, P.or, { rivets: true });
    for (let y = top + 8; y < bot - 6; y += 4) p.r(6, y, W - 12, 1, P.orDD);
    p.panel(1, top - 2, W - 2, 4, P.stD);
  } else if (def.behavior === 'dronepad') {
    p.panel(1, bot - 6, W - 2, 6, P.stD, { seams: 6 });
    p.r(4, bot - 7, W - 8, 1, P.yellow);
    p.r(W / 2 - 4, bot - 5, 1, 4, P.yellow); p.r(W / 2 + 3, bot - 5, 1, 4, P.yellow); p.r(W / 2 - 4, bot - 3, 8, 1, P.yellow);
    p.pipe(3, top + 2, 2, H - 8, P.stL); p.light(3, top - 1, glow);
    p.panel(W - 10, top + 8, 8, H - 14, [60, 70, 84], { rivets: true }); p.window(W - 8, top + 10, 4, 4, glow);
  } else if (def.behavior === 'field') {
    p.panel(2, top + 8, W - 4, H - 8, [56, 64, 76], { seams: 6, rivets: true });
    p.r(W / 2 - 1, top - 2, 2, 10, P.stL);
    p.x.fillStyle = css(P.ink); p.x.beginPath(); p.x.ellipse(W / 2, top - 2, W / 2 - 3, 4, 0, 0, 7); p.x.fill();
    p.x.fillStyle = css(glow); p.x.beginPath(); p.x.ellipse(W / 2, top - 2, W / 2 - 4, 3, 0, 0, 7); p.x.fill();
    p.window(6, top + 14, W - 12, 5, glow);
  } else if (def.behavior === 'lamp') {
    p.r(W / 2 - 1, top - 10, 2, H + 10, P.stD); p.r(W / 2 - 4, top - 14, 8, 5, P.ink); p.r(W / 2 - 3, top - 13, 6, 3, [255, 230, 160]);
    p.r(W / 2 - 3, bot - 2, 6, 2, P.ink);
  } else if (def.behavior === 'support') {
    p.r(2, top, W - 4, H, P.ink); p.r(3, top, W - 6, H, P.woodD); p.r(4, top, 2, H, P.wood);
    p.r(1, top, W - 2, 3, P.stD); p.r(1, bot - 3, W - 2, 3, P.stD);
  } else if (def.behavior === 'complex') {
    const col = [P.or, [70, 150, 230], [180, 70, 230], [230, 70, 70], [250, 220, 120]][Math.min(4, level)] as C3;
    p.panel(2, top + 8, W - 4, H - 8, P.stD, { seams: 8, rivets: true });
    for (let y = top - 32; y < top + 8; y++) { const inset = Math.round((top + 8 - y) * 0.45); p.px(8 + inset, y, P.stL); p.px(W - 9 - inset, y, P.stL); }
    for (let y = top - 30; y < top + 8; y += 6) { const inset = Math.round((top + 8 - y) * 0.45); p.r(8 + inset, y, W - 16 - inset * 2, 1, P.st); }
    p.panel(6, top + 12, W - 12, 10, col, { seams: 6 });
    p.window(10, top + 28, 14, 8, [255, 190, 90]); p.window(W - 24, top + 28, 14, 8, [255, 190, 90]);
    p.hazard(4, bot - 4, W - 8, 2); p.light(W / 2 - 1, top - 35, P.red);
  } else {
    // genérico (mega e restantes): bloco industrial com faixa da família
    const famCol: Record<string, C3> = { mega: [140, 40, 44], estabilizacao: sh(glow, 0.5), extracao: [180, 140, 30], processamento: [48, 84, 120], base: [130, 136, 150], energia: [30, 110, 100], logistica: P.or, drones: P.or };
    const col = famCol[def.cat] ?? P.or;
    p.panel(2, top + 2, W - 4, H - 2, P.stD, { seams: 8, rivets: true });
    p.panel(5, top + 6, W - 10, Math.max(6, H / 3), col, { seams: 5 });
    if (def.cat === 'mega') {
      p.pipe(W / 2 - 3, top - ex + 4, 6, ex, P.stL);
      p.x.fillStyle = css(glow); p.x.beginPath(); p.x.arc(W / 2, top - ex + 6, 5, 0, 7); p.x.fill();
    }
    p.window(6, bot - 14, Math.min(14, W - 12), 6, glow);
    p.hazard(3, bot - 4, W - 6, 2);
  }
  return c;
}

/** Personagem de lado (olhando para a direita; o renderizador espelha). 16×22 lógicos, vetorial. */
export function drawPlayer(frame: number, suitTier: number, jet: boolean): HTMLCanvasElement {
  const [c, p] = canvas(16, 22);
  const x = p.x;
  const suit: C3 = suitTier >= 3 ? [226, 228, 236] : P.or;
  const walk = frame >= 1 && frame <= 4;
  const ph = (frame - 1) % 4;
  const swing = walk ? [0.45, 0, -0.45, 0][ph] : frame === 5 ? 0.3 : 0;
  const bob = walk && (ph === 1 || ph === 3) ? 0.6 : 0;
  const ink = 'rgba(16,18,24,0.95)';
  const grad = (y0: number, h: number, col: readonly number[], t = 1.3, b = 0.7) => { const g = x.createLinearGradient(0, y0, 0, y0 + h); g.addColorStop(0, css(sh(col, t))); g.addColorStop(1, css(sh(col, b))); return g; };
  const shape = (f: () => void, fill: string | CanvasGradient, lw = 0.6) => { x.beginPath(); f(); x.fillStyle = fill; x.fill(); x.strokeStyle = ink; x.lineWidth = lw; x.stroke(); };
  // chama do jetpack
  if (jet) {
    const g = x.createLinearGradient(0, 15, 0, 22);
    g.addColorStop(0, 'rgba(255,250,200,1)'); g.addColorStop(0.4, 'rgba(255,170,60,0.95)'); g.addColorStop(1, 'rgba(255,80,20,0)');
    x.fillStyle = g; x.beginPath(); x.moveTo(1.6, 15.5); x.quadraticCurveTo(3, 23, 4.4, 15.5); x.closePath(); x.fill();
  }
  // mochila / jetpack
  shape(() => x.roundRect(0.8, 7.5 + bob, 4.4, 8.5, 1.4), grad(7.5, 8.5, P.st));
  x.fillStyle = css(P.cyan); x.beginPath(); x.arc(3, 10 + bob, 0.55, 0, 7); x.arc(3, 12.2 + bob, 0.55, 0, 7); x.fill();
  // pernas (pivô no quadril)
  const leg = (hx: number, ang: number, col: readonly number[]) => {
    x.save(); x.translate(hx, 14.6 + bob); x.rotate(ang);
    shape(() => x.roundRect(-1.2, 0, 2.6, 5.4, 1), grad(0, 5.4, col));
    shape(() => x.roundRect(-1.4, 4.6, 3.6, 1.8, 0.8), css(P.stD), 0.5);
    x.restore();
  };
  leg(7, -swing, sh(suit, 0.62)); leg(9.4, swing, sh(suit, 0.85));
  // tronco
  shape(() => x.roundRect(4.4, 7.6 + bob, 8.4, 8, 2.2), grad(7.6, 8, suit));
  x.fillStyle = css(P.stD); x.fillRect(4.8, 12.4 + bob, 7.6, 1.1);
  x.fillStyle = css(P.yellow); x.fillRect(9.8, 12.5 + bob, 1.2, 0.9);
  shape(() => x.roundRect(7.4, 9.2 + bob, 3, 2.2, 0.6), css(P.stD), 0.4);
  x.fillStyle = css(P.green); x.beginPath(); x.arc(8.3, 10.3 + bob, 0.45, 0, 7); x.fill();
  x.fillStyle = css(P.red); x.beginPath(); x.arc(9.5, 10.3 + bob, 0.45, 0, 7); x.fill();
  // capacete
  shape(() => x.arc(9, 4.6 + bob * 0.5, 4.5, 0, 7), (() => { const g = x.createRadialGradient(7.4, 2.6, 0.5, 9, 4.6, 5.2); g.addColorStop(0, css(sh(suit, 1.45))); g.addColorStop(0.6, css(suit)); g.addColorStop(1, css(sh(suit, 0.65))); return g; })());
  // visor espelhado
  x.beginPath(); x.roundRect(9.2, 2.4 + bob * 0.5, 5, 3.8, 1.8);
  const vg = x.createLinearGradient(9, 2.4, 14, 6.2); vg.addColorStop(0, '#5fb4ef'); vg.addColorStop(0.5, '#1d4a78'); vg.addColorStop(1, '#0c2440');
  x.fillStyle = vg; x.fill(); x.strokeStyle = ink; x.lineWidth = 0.5; x.stroke();
  x.fillStyle = 'rgba(255,255,255,0.75)'; x.beginPath(); x.ellipse(10.8, 3.3 + bob * 0.5, 1.1, 0.45, -0.3, 0, 7); x.fill();
  // lanterna
  x.fillStyle = 'rgba(255,240,170,1)'; x.beginPath(); x.arc(6.2, 1.2 + bob * 0.5, 0.7, 0, 7); x.fill();
  return c;
}

/** Braço com a ferramenta (cano do perfurador + bocal do aspirador). Origem no ombro, apontando para +x. */
export function drawArm(level: number): HTMLCanvasElement {
  const [c, p] = canvas(14, 6);
  const x = p.x;
  const BEAM: C3[] = [[255, 170, 60], [255, 220, 70], [80, 220, 255], [90, 255, 160], [200, 110, 255], [255, 250, 210]];
  const col = BEAM[Math.min(5, level)];
  x.beginPath(); x.roundRect(0, 1.6, 5.4, 2.6, 1.2); x.fillStyle = css(P.orD); x.fill(); x.strokeStyle = 'rgba(16,18,24,0.95)'; x.lineWidth = 0.5; x.stroke();
  const g = x.createLinearGradient(0, 0.6, 0, 5.2); g.addColorStop(0, css(P.stLL)); g.addColorStop(0.5, css(P.stL)); g.addColorStop(1, css(P.stD));
  x.beginPath(); x.roundRect(4.2, 0.6, 8.2, 4.6, 1.4); x.fillStyle = g; x.fill(); x.stroke();
  x.beginPath(); x.roundRect(11.6, 1.4, 2.2, 3, 0.8); x.fillStyle = css(P.stD); x.fill(); x.stroke();
  x.fillStyle = css(col); x.beginPath(); x.arc(12.9, 2.9, 0.8, 0, 7); x.fill();
  x.fillStyle = css(col, 0.9); x.fillRect(6, 2.4, 4, 0.9);
  return c;
}

/** Drone voador (4 hélices em movimento). */
export function drawDrone(kind: RobotKind, frame: number): HTMLCanvasElement {
  const col = ROBOT[kind].color as C3;
  const [c, p] = canvas(16, 12);
  const x = p.x;
  const ink = 'rgba(16,18,24,0.95)';
  x.fillStyle = 'rgba(210,220,230,0.55)';
  for (const bx of [3, 13]) { x.beginPath(); x.ellipse(bx, 1.6, frame % 2 ? 3.2 : 2.2, 0.6, 0, 0, 7); x.fill(); }
  x.strokeStyle = css(P.stL); x.lineWidth = 0.6; x.beginPath(); x.moveTo(3, 2); x.lineTo(3, 4.5); x.moveTo(13, 2); x.lineTo(13, 4.5); x.stroke();
  const g = x.createLinearGradient(0, 4, 0, 10); g.addColorStop(0, css(sh(col, 1.35))); g.addColorStop(1, css(sh(col, 0.65)));
  x.beginPath(); x.roundRect(2.5, 4, 11, 6, 2.4); x.fillStyle = g; x.fill(); x.strokeStyle = ink; x.lineWidth = 0.6; x.stroke();
  x.beginPath(); x.roundRect(8.6, 5.4, 3.6, 2.6, 1.1); x.fillStyle = '#163452'; x.fill(); x.stroke();
  x.fillStyle = 'rgba(160,230,255,0.9)'; x.beginPath(); x.arc(9.8, 6.3, 0.6, 0, 7); x.fill();
  if (kind === 'miner') { x.fillStyle = css(P.stL); x.beginPath(); x.moveTo(13.5, 7); x.lineTo(16, 8); x.lineTo(13.5, 9); x.closePath(); x.fill(); }
  if (kind === 'carry') { x.beginPath(); x.roundRect(5, 10, 6, 2, 0.6); x.fillStyle = css(P.or); x.fill(); x.stroke(); }
  if (kind === 'scout' || kind === 'survey') { x.strokeStyle = css(P.stL); x.beginPath(); x.moveTo(7, 4); x.lineTo(7, 1); x.stroke(); x.fillStyle = css(P.red); x.beginPath(); x.arc(7, 0.8, 0.6, 0, 7); x.fill(); }
  return c;
}

/** Baú de Khelos: cápsula de pedra com runas acesas. */
export function drawChest(): HTMLCanvasElement {
  const [c, p] = canvas(16, 14);
  const x = p.x;
  const ink = 'rgba(16,18,24,0.95)';
  const g = x.createLinearGradient(0, 2, 0, 13); g.addColorStop(0, '#7f9aa4'); g.addColorStop(1, '#2c3c44');
  x.beginPath(); x.roundRect(1.5, 4.5, 13, 8.5, 1.6); x.fillStyle = g; x.fill(); x.strokeStyle = ink; x.lineWidth = 0.6; x.stroke();
  x.beginPath(); x.roundRect(1, 1.6, 14, 3.6, 1.6); x.fillStyle = '#93b0ba'; x.fill(); x.stroke();
  const rg = x.createRadialGradient(8, 7.5, 0, 8, 7.5, 4); rg.addColorStop(0, 'rgba(120,255,255,0.95)'); rg.addColorStop(1, 'rgba(60,220,230,0)');
  x.fillStyle = rg; x.fillRect(4, 3.5, 8, 8);
  x.fillStyle = '#a0ffff'; x.fillRect(7.4, 4, 1.2, 5);
  x.fillStyle = 'rgba(60,230,240,0.85)'; x.fillRect(3.4, 7, 1, 1); x.fillRect(11.6, 7, 1, 1);
  void hash2;
  return c;
}
