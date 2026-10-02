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

function canvas(w: number, h: number): [HTMLCanvasElement, Pen] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  const x = c.getContext('2d')!; x.imageSmoothingEnabled = false;
  return [c, new Pen(x)];
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
    p.legs(4, bot - 10, W - 8, 10);
    p.r(1, bot - 3, 10, 2, P.ink); p.r(W - 11, bot - 3, 10, 2, P.ink);
    const cx = W / 2, cy = top + 22;
    for (let j = -20; j <= 16; j++) {
      const half = Math.round(Math.sqrt(Math.max(0, 1 - (j / 21) ** 2)) * 20);
      p.r(cx - half - 1, cy + j, half * 2 + 2, 1, P.ink);
      for (let i = -half; i < half; i++) {
        const t = (i + half) / (half * 2 || 1);
        const kk = 0.7 + Math.sin(t * Math.PI) * 0.45 - (j / 30);
        p.px(cx + i, cy + j, sh(P.or, kk));
      }
    }
    p.r(cx - 20, cy + 6, 40, 2, P.orDD); p.r(cx - 20, cy - 6, 40, 1, P.orL);
    p.hazard(cx - 16, cy + 10, 32, 3);
    p.window(cx - 6, cy - 9, 12, 9);
    p.logo(cx, cy + 2);
    p.pipe(cx - 1, top - 20, 2, 12, P.stL); p.light(cx - 1, top - 23, P.red);
    p.panel(cx - 7, bot - 9, 14, 8, P.stD, { rivets: true });
    p.r(cx - 4, bot - 7, 8, 5, [255, 190, 90]); p.r(cx - 4, bot - 7, 8, 1, [255, 240, 200]);   // porta acesa
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
    p.chute(right ? W - 1 : 0, bot - 10, right, [90, 170, 255]);       // minerais
    p.chute(right ? 0 : W - 1, bot - 10, !right, [130, 110, 96]);      // resíduo
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
    p.chute(right ? W - 1 : 0, bot - 10, right, P.or);
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

/** Personagem de lado (olhando para a direita; o renderizador espelha). 16×22 px, contorno automático. */
export function drawPlayer(frame: number, suitTier: number, jet: boolean): HTMLCanvasElement {
  const W = 16, H = 22;
  const [c, p] = canvas(W, H);
  const suit: C3 = suitTier >= 3 ? [226, 228, 236] : P.or;
  const suitD = sh(suit, 0.68), suitL = sh(suit, 1.25), suitDD = sh(suit, 0.48);
  const walk = frame >= 1 && frame <= 4;
  const ph = (frame - 1) % 4;
  const step = walk ? [1, 0, -1, 0][ph] : frame === 5 ? 1 : 0;
  const bob = walk && (ph === 0 || ph === 2) ? 1 : 0;
  const map: (C3 | null)[] = new Array(W * H).fill(null);
  const set = (x: number, y: number, col: C3) => { if (x >= 0 && y >= 0 && x < W && y < H) map[y * W + x] = col; };
  const rect = (x: number, y: number, w: number, h: number, col: C3) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, col); };
  // jetpack
  rect(1, 8 + bob, 4, 8, P.stD); rect(1, 8 + bob, 1, 8, P.st); set(2, 10 + bob, P.cyan); set(2, 12 + bob, P.cyan);
  rect(2, 16 + bob, 2, 1, P.stDD);
  // pernas (trás mais escura) e botas
  const leg = (x: number, off: number, col: C3) => { rect(x + off, 15 + bob, 2, 5 - bob, col); rect(x + off - (off < 0 ? 0 : 0), 20, 3, 2, P.stD); set(x + off + 2, 21, P.stDD); };
  leg(6, -step, suitDD); leg(9, step, suitD);
  // tronco
  rect(5, 8 + bob, 8, 8, suit); rect(5, 8 + bob, 8, 1, suitL); rect(5, 9 + bob, 1, 6, suitL); rect(12, 9 + bob, 1, 6, suitD);
  rect(5, 13 + bob, 8, 1, P.stD); set(10, 13 + bob, P.yellow);
  rect(8, 10 + bob, 3, 2, P.stD); set(8, 10 + bob, P.green); set(10, 11 + bob, P.red);
  // capacete arredondado
  const hy = bob;
  rect(6, 0 + hy, 6, 1, suit); rect(5, 1 + hy, 8, 1, suit); rect(4, 2 + hy, 10, 5, suit); rect(5, 7 + hy, 8, 1, suit);
  rect(6, 0 + hy, 4, 1, suitL); rect(5, 1 + hy, 3, 1, suitL); set(4, 3 + hy, suitL); set(4, 4 + hy, suitL);
  rect(5, 7 + hy, 8, 1, suitD);
  // visor
  rect(9, 2 + hy, 5, 4, [24, 54, 86]); rect(9, 2 + hy, 4, 1, [44, 96, 140]); set(10, 3 + hy, [190, 236, 255]); set(11, 3 + hy, [140, 210, 250]); set(13, 5 + hy, [70, 140, 200]);
  set(5, 0 + hy, [255, 236, 150]);   // lanterna
  // pinta e contorno automático
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (map[y * W + x]) continue;
    const n = (x > 0 && map[y * W + x - 1]) || (x < W - 1 && map[y * W + x + 1]) || (y > 0 && map[(y - 1) * W + x]) || (y < H - 1 && map[(y + 1) * W + x]);
    if (n) p.px(x, y, P.ink);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const col = map[y * W + x]; if (col) p.px(x, y, col); }
  if (jet) { p.r(2, 17 + bob, 2, 2, [255, 230, 140]); p.r(1, 19 + bob, 4, 1, [255, 150, 50]); p.px(2, 20 + bob, [255, 90, 30]); }
  return c;
}

/** Braço com a ferramenta (cano do perfurador + bocal do aspirador). Origem no ombro, apontando para +x. */
export function drawArm(level: number): HTMLCanvasElement {
  const [c, p] = canvas(14, 6);
  const BEAM: C3[] = [[255, 170, 60], [255, 220, 70], [80, 220, 255], [90, 255, 160], [200, 110, 255], [255, 250, 210]];
  const col = BEAM[Math.min(5, level)];
  p.r(0, 1, 5, 3, P.ink); p.r(1, 2, 3, 1, P.orD);                 // braço
  p.r(4, 0, 9, 5, P.ink); p.r(5, 1, 7, 3, P.stL); p.r(5, 1, 7, 1, P.stLL); p.r(5, 3, 7, 1, P.stD);
  p.r(12, 1, 2, 3, P.ink); p.px(12, 2, col);                       // bocal
  p.px(7, 2, col);
  return c;
}

/** Drone voador (4 hélices borradas). */
export function drawDrone(kind: RobotKind, frame: number): HTMLCanvasElement {
  const col = ROBOT[kind].color as C3;
  const [c, p] = canvas(16, 12);
  const blade = frame % 2 ? 5 : 3;
  p.r(1, 2, 14, 1, P.ink); p.r(8 - blade - 4, 1, blade, 1, [200, 210, 220], 0.7); p.r(8 + 4, 1, blade, 1, [200, 210, 220], 0.7);
  p.r(3, 2, 1, 2, P.st); p.r(12, 2, 1, 2, P.st);
  p.r(3, 4, 10, 6, P.ink); p.r(4, 5, 8, 4, col); p.r(4, 5, 8, 1, sh(col, 1.35)); p.r(4, 8, 8, 1, sh(col, 0.6));
  p.r(9, 6, 3, 2, P.ink); p.px(10, 6, P.glassL);
  if (kind === 'miner') { p.r(12, 7, 3, 2, P.stL); p.px(15, 8, [255, 200, 120]); }
  if (kind === 'carry') { p.r(5, 10, 6, 2, P.ink); p.r(6, 10, 4, 1, P.or); }
  if (kind === 'repair') p.px(5, 6, P.cyan);
  if (kind === 'scout' || kind === 'survey') { p.r(7, 0, 1, 2, P.stL); p.px(7, 0, P.red); }
  return c;
}

/** Baú de Khelos: cápsula de pedra com runas acesas. */
export function drawChest(): HTMLCanvasElement {
  const [c, p] = canvas(16, 14);
  p.r(1, 12, 14, 2, [0, 0, 0], 0.45);
  p.r(1, 4, 14, 9, P.ink);
  p.r(2, 5, 12, 7, [62, 80, 88]); p.r(2, 5, 12, 1, [100, 128, 138]); p.r(2, 11, 12, 1, [36, 46, 52]);
  p.r(2, 1, 12, 4, P.ink); p.r(3, 2, 10, 2, [80, 104, 112]); p.r(3, 2, 10, 1, [130, 160, 170]);
  p.r(7, 4, 2, 5, [60, 230, 240]); p.px(7, 4, [210, 255, 255]);
  p.px(4, 7, [60, 230, 240]); p.px(11, 7, [60, 230, 240]); p.px(4, 9, [40, 160, 170]); p.px(11, 9, [40, 160, 170]);
  void hash2;
  return c;
}
