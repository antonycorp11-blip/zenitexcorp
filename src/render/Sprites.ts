import { TILE } from '../core/constants';
import { hash2 } from '../core/rng';
import { MATERIALS } from '../data/materials';
import { ITEM, type ItemDef } from '../data/items';
import type { MachineDef } from '../data/machines';
import type { RobotKind } from '../data/robots';
import { ROBOT } from '../data/robots';
import type { SpeakerId } from '../data/dialogue';

type C3 = [number, number, number];
const css = (c: readonly number[], a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const shade = (c: readonly number[], k: number): C3 => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];

function cv(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  const x = c.getContext('2d')!;
  x.imageSmoothingEnabled = false;
  return [c, x];
}

export const PAL = {
  orange: [232, 150, 42] as C3, orangeD: [160, 90, 20] as C3, orangeL: [255, 200, 90] as C3,
  dark: [26, 28, 34] as C3, mid: [52, 56, 66] as C3, light: [96, 102, 116] as C3, steel: [140, 146, 160] as C3,
  blue: [80, 180, 255] as C3,
};

/** Fábrica e cache de todos os sprites procedurais. */
export class Sprites {
  private cache = new Map<string, HTMLCanvasElement>();
  private iconUrls = new Map<string, string>();

  private memo(key: string, fn: () => HTMLCanvasElement) {
    let c = this.cache.get(key);
    if (!c) { c = fn(); this.cache.set(key, c); }
    return c;
  }

  // ---------------- CRISTAIS ----------------
  crystal(mat: number, variant: number): HTMLCanvasElement {
    return this.memo(`cr${mat}_${variant}`, () => {
      const def = MATERIALS[mat];
      const base = def.top;
      const isMetal = def.sound === 'metal' && !def.glow;
      const [c, x] = cv(16, 18);
      const n = 3 + variant;
      for (let i = 0; i < n; i++) {
        const h = hash2(mat * 13 + i, variant, 5);
        const cx = 8 + (h - 0.5) * 10;
        const ht = 6 + hash2(i, mat, 9) * (isMetal ? 5 : 10);
        const wd = 2 + hash2(i, variant, 3) * 2.5;
        const lean = (hash2(i, mat + variant, 1) - 0.5) * 4;
        const by = 17 - hash2(i, 2, mat) * 2;
        // faceta escura
        x.fillStyle = css(shade(base, 0.45));
        x.beginPath(); x.moveTo(cx - wd, by); x.lineTo(cx + lean, by - ht); x.lineTo(cx, by); x.closePath(); x.fill();
        // faceta clara
        x.fillStyle = css(shade(base, isMetal ? 0.9 : 1.05));
        x.beginPath(); x.moveTo(cx, by); x.lineTo(cx + lean, by - ht); x.lineTo(cx + wd, by); x.closePath(); x.fill();
        // brilho
        x.fillStyle = css(shade(base, 1.6), 0.9);
        x.fillRect(Math.round(cx + lean * 0.6), Math.round(by - ht + 2), 1, Math.max(1, Math.round(ht * 0.35)));
      }
      return c;
    });
  }

  // ---------------- DECORAÇÃO ----------------
  decor(sector: number, v: number): HTMLCanvasElement | null {
    return this.memo(`dc${sector}_${v}`, () => {
      const [c, x] = cv(14, 16);
      const R = (a: number, b: number, w: number, h: number, col: C3, al = 1) => { x.fillStyle = css(col, al); x.fillRect(a, b, w, h); };
      switch (sector) {
        case 2: case 5: { // cogumelos bioluminescentes
          const cap: C3 = sector === 2 ? [80, 255, 120] : [170, 255, 60];
          const stem: C3 = sector === 2 ? [40, 90, 50] : [70, 60, 40];
          for (let i = 0; i < 2 + (v % 2); i++) {
            const px = 3 + i * 4, hh = 5 + ((v + i) % 3) * 2;
            R(px + 1, 16 - hh, 1, hh, stem);
            R(px - 1, 16 - hh - 2, 5, 2, shade(cap, 0.7)); R(px, 16 - hh - 3, 3, 1, cap); R(px + 1, 16 - hh - 2, 1, 1, [255, 255, 220]);
          }
          break;
        }
        case 3: case 10: case 12: { // brasas
          R(3, 11, 7, 4, [50, 20, 16]); R(4, 10, 5, 1, [70, 30, 22]); R(5, 12, 2, 1, [255, 140, 40]); R(8, 13, 1, 1, [255, 220, 120]);
          break;
        }
        case 4: { // estilhaços de gelo
          x.fillStyle = css([150, 220, 255]); x.beginPath(); x.moveTo(4, 16); x.lineTo(6, 6); x.lineTo(8, 16); x.fill();
          x.fillStyle = css([90, 150, 210]); x.beginPath(); x.moveTo(8, 16); x.lineTo(10, 9); x.lineTo(11, 16); x.fill();
          break;
        }
        case 6: case 11: { // pilar ancestral quebrado
          R(4, 6, 6, 10, [40, 56, 62]); R(4, 6, 6, 2, [70, 92, 100]); R(6, 9, 2, 2, [60, 230, 240]);
          break;
        }
        case 7: { // corais
          R(5, 8, 1, 8, [40, 160, 200]); R(3, 10, 2, 1, [40, 160, 200]); R(6, 9, 3, 1, [60, 200, 230]); R(8, 6, 1, 4, [60, 200, 230]);
          break;
        }
        case 8: { // pedras flutuantes (sombra no chão)
          R(4, 14, 6, 1, [10, 6, 20], 0.6); R(4, 4, 6, 4, [90, 70, 120]); R(5, 3, 4, 1, [130, 100, 170]); R(9, 6, 1, 1, [200, 150, 255]);
          break;
        }
        case 9: { // ossadas cristalinas
          R(3, 12, 8, 2, [190, 190, 180]); R(5, 7, 1, 6, [210, 240, 220]); R(8, 9, 1, 4, [200, 255, 230]);
          break;
        }
        default: { // pedrinhas
          R(3, 12, 4, 3, [90, 60, 44]); R(3, 12, 4, 1, [130, 90, 60]); R(8, 13, 3, 2, [80, 50, 36]);
        }
      }
      return c;
    });
  }

  // ---------------- MÁQUINAS ----------------
  /** Sprite de máquina (inclui altura extra acima da pegada para o volume 3/4). */
  machine(def: MachineDef, dir: number, level = 0): { img: HTMLCanvasElement; oy: number } {
    const key = `m_${def.key}_${def.rotatable ? dir : 0}_${level}`;
    const extra = this.extraHeight(def);
    const img = this.memo(key, () => this.drawMachine(def, def.rotatable ? dir : 0, extra, level));
    return { img, oy: extra };
  }

  private extraHeight(def: MachineDef) {
    switch (def.look) {
      case 'belt': case 'platform': case 'splitter': return 2;
      case 'lamp': case 'support': return 18;
      case 'lift': return 40 + def.w * 6;
      case 'complex': return 46;
      case 'mega': return 56;
      case 'cannon': return 34;
      case 'pad': return 6;
      case 'refinery': case 'reactor': case 'silo': return 28;
      case 'dish': return 30;
      case 'capsule': return 30;
      default: return 14 + def.h * 2;
    }
  }

  private drawMachine(def: MachineDef, dir: number, ex: number, level: number): HTMLCanvasElement {
    const W = def.w * TILE, H = def.h * TILE;
    const [c, x] = cv(W, H + ex);
    const R = (a: number, b: number, w: number, h: number, col: C3, al = 1) => { x.fillStyle = css(col, al); x.fillRect(Math.round(a), Math.round(b), Math.round(w), Math.round(h)); };
    const glow: C3 = def.glow ?? [255, 180, 80];
    const oy = ex; // origem da pegada
    // sombra
    R(1, oy + 2, W - 2, H - 2, [0, 0, 0], 0.35);

    // corpo genérico em caixa 3/4 — estrutura preta, painéis laranja, costuras e rebites
    const box = (bx: number, by: number, bw: number, bh: number, height: number, top: C3, front: C3, panel = true) => {
      const fy = by + bh - height, ty = by - height;
      R(bx - 1, ty - 1, bw + 2, bh + height + 2, [8, 9, 12]);   // contorno
      R(bx, fy, bw, height, front);                                     // frente
      for (let x = 3; x < bw - 1; x += 6) R(bx + x, fy + 2, 1, height - 3, shade(front, 1.35));
      R(bx, fy + height - 3, bw, 1, shade(front, 0.55));
      if (height >= 8) { for (let x = 2; x < bw - 2; x += 4) R(bx + x, fy + 2, 2, 1, PAL.orange); }
      R(bx, ty, bw, bh, top);                                           // topo
      R(bx, ty, bw, 1, shade(top, 1.45)); R(bx, ty, 1, bh, shade(top, 1.25));
      R(bx + bw - 1, ty, 1, bh, shade(top, 0.7));
      if (panel && bw >= 10 && bh >= 10) {
        R(bx + 2, ty + 2, bw - 4, bh - 4, [22, 24, 30]);
        R(bx + 3, ty + 3, bw - 6, bh - 6, PAL.orangeD);
        R(bx + 3, ty + 3, bw - 6, 1, PAL.orange); R(bx + 3, ty + 3, 1, bh - 6, PAL.orange);
        for (let x = 6; x < bw - 6; x += 5) R(bx + x, ty + 5, 2, bh - 10, shade(PAL.orangeD, 0.8));
      }
      for (const [rx, ry] of [[1, 1], [bw - 2, 1], [1, bh - 2], [bw - 2, bh - 2]]) R(bx + rx, ty + ry, 1, 1, PAL.steel);
      R(bx, fy, bw, 1, shade(front, 1.6));
      R(bx, by + bh - 1, bw, 1, [6, 6, 8]);
    };
    const light = (lx: number, ly: number, col: C3 = glow) => { R(lx, ly, 2, 2, col); R(lx, ly, 1, 1, [255, 255, 230]); };
    const stripes = (sx: number, sy: number, sw: number) => { for (let i = 0; i < sw; i += 4) R(sx + i, sy, 2, 2, PAL.orange); for (let i = 2; i < sw; i += 4) R(sx + i, sy, 2, 2, PAL.dark); };

    switch (def.look) {
      case 'platform': {
        R(0, oy, W, H, [70, 60, 50]);
        for (let i = 1; i < W; i += 3) R(i, oy + 1, 1, H - 2, [40, 34, 30]);
        R(0, oy, W, 1, [130, 110, 80]); R(0, oy + H - 2, W, 2, [30, 26, 22]);
        break;
      }
      case 'support': {
        R(W / 2 - 3, oy + H - 6, 6, 4, PAL.dark);
        R(W / 2 - 2, oy - ex + 4, 4, H + ex - 8, PAL.orangeD); R(W / 2 - 2, oy - ex + 4, 1, H + ex - 8, PAL.orange);
        for (let y = oy - ex + 8; y < oy + H - 6; y += 6) R(W / 2 - 2, y, 4, 1, PAL.dark);
        R(W / 2 - 6, oy - ex + 2, 12, 3, PAL.mid);
        if (def.behavior === 'surge') light(W / 2 - 1, oy - ex + 6, [120, 200, 255]);
        break;
      }
      case 'lamp': {
        R(W / 2 - 1, oy - ex + 6, 2, H + ex - 8, PAL.mid);
        R(W / 2 - 3, oy + H - 5, 6, 3, PAL.dark);
        R(W / 2 - 3, oy - ex + 2, 6, 5, PAL.dark); R(W / 2 - 2, oy - ex + 3, 4, 3, [255, 220, 140]);
        break;
      }
      case 'splitter': {
        box(1, oy + 1, W - 2, H - 2, 3, PAL.mid, PAL.dark);
        x.fillStyle = css(PAL.orange); x.translate(W / 2, oy + H / 2 - 3); x.rotate((dir * Math.PI) / 2);
        x.fillRect(-1, -4, 2, 8); x.fillRect(1, -2, 2, 4); x.fillRect(3, -1, 1, 2); x.setTransform(1, 0, 0, 1, 0, 0);
        break;
      }
      case 'drill': {
        box(1, oy + 2, W - 2, H - 3, 12, PAL.mid, PAL.dark);
        stripes(2, oy - 10 + 2, W - 4);
        R(4, oy - 6, W - 8, 8, PAL.orange); R(5, oy - 5, W - 10, 1, PAL.orangeL);
        light(W - 7, oy - 3); light(5, oy + 4, [255, 80, 40]);
        // cabeça de broca apontando para dir
        const [dx, dy] = [[1, 0], [0, 1], [-1, 0], [0, -1]][dir];
        const cx = W / 2 + dx * (W / 2 - 10), cy = oy + H / 2 - 6 + dy * (H / 2 - 9);
        x.fillStyle = css(PAL.steel);
        x.beginPath();
        x.moveTo(cx + dx * 9, cy + dy * 9);
        x.lineTo(cx - dy * 6, cy + dx * 6 - (dy ? 0 : 0));
        x.lineTo(cx + dy * 6, cy - dx * 6);
        x.closePath(); x.fill();
        x.fillStyle = css([200, 205, 215]);
        x.beginPath(); x.moveTo(cx + dx * 9, cy + dy * 9); x.lineTo(cx + dy * 6, cy - dx * 6); x.lineTo(cx, cy); x.closePath(); x.fill();
        x.fillStyle = css(PAL.dark);
        for (let k = 2; k < 8; k += 3) x.fillRect(Math.round(cx + dx * k - dy * (6 - k * 0.6)), Math.round(cy + dy * k - dx * (6 - k * 0.6)), dx ? 1 : Math.max(1, 12 - k * 1.2), dy ? 1 : Math.max(1, 12 - k * 1.2));
        R(cx - dx * 3 - 3, cy - dy * 3 - 3, 6, 6, PAL.orange);
        if (level > 0) R(3, oy - 9, 3, 3, level > 1 ? [255, 80, 200] : [80, 200, 255]);
        break;
      }
      case 'crate': case 'silo': {
        const hh = def.look === 'silo' ? 26 : 12;
        if (def.look === 'silo') {
          for (let i = 0; i < 3; i++) {
            const sx = 3 + i * (W - 6) / 3, sw = (W - 6) / 3 - 2;
            R(sx, oy + H - 4 - hh - 10, sw, hh + 10, PAL.mid); R(sx, oy + H - 4 - hh - 10, 2, hh + 10, PAL.light);
            R(sx, oy + H - hh - 18, sw, 4, PAL.orange); light(sx + sw / 2 - 1, oy + H - hh - 4, [80, 180, 255]);
          }
        } else {
          box(2, oy + 2, W - 4, H - 4, hh, PAL.orangeD, [80, 50, 20]);
          R(4, oy - hh + 4, W - 8, H - 10, PAL.orange); R(6, oy - hh + 6, W - 12, 1, PAL.orangeL);
          R(W / 2 - 1, oy - hh + 2, 2, H - 6, PAL.dark);
          light(4, oy + H - hh + 1, [80, 180, 255]);
        }
        break;
      }
      case 'lift': {
        box(2, oy + 2, W - 4, H - 4, 8, PAL.mid, PAL.dark);
        const tw = Math.max(10, W * 0.45), tx = (W - tw) / 2;
        R(tx, oy - ex + 4, tw, ex + H / 2 - 4, PAL.dark);
        R(tx, oy - ex + 4, 2, ex + H / 2 - 4, PAL.orange); R(tx + tw - 2, oy - ex + 4, 2, ex + H / 2 - 4, PAL.orange);
        for (let y = oy - ex + 8; y < oy + H / 2; y += 5) { R(tx + 2, y, tw - 4, 1, PAL.mid); light(tx + tw / 2 - 1, y + 2, [255, 200, 90]); }
        R(tx - 3, oy - ex + 2, tw + 6, 4, PAL.orangeD); light(tx + 2, oy - ex + 3, [255, 80, 40]);
        R(tx + 3, oy + H / 2 - 12, tw - 6, 8, [40, 120, 180]); // cabine
        break;
      }
      case 'terminal': {
        box(2, oy + 2, W - 4, H - 4, 10, PAL.mid, PAL.dark);
        R(6, oy - 16, W - 12, 12, PAL.dark); R(8, oy - 14, W - 16, 8, [30, 90, 140]); R(9, oy - 13, W - 20, 1, [120, 220, 255]);
        // antena/prato
        x.fillStyle = css(PAL.steel); x.beginPath(); x.ellipse(W - 10, oy - 20, 7, 4, -0.4, 0, Math.PI * 2); x.fill();
        R(W - 11, oy - 18, 2, 10, PAL.mid); light(W - 11, oy - 23, [255, 80, 40]);
        stripes(4, oy + H - 12, W - 8); light(5, oy - 4); light(W - 8, oy - 4, [80, 200, 255]);
        break;
      }
      case 'pad': {
        R(2, oy + 2, W - 4, H - 4, [44, 46, 54]);
        x.strokeStyle = css(PAL.orange); x.lineWidth = 2; x.beginPath(); x.arc(W / 2, oy + H / 2, W * 0.32, 0, Math.PI * 2); x.stroke();
        R(W / 2 - 6, oy + H / 2 - 1, 12, 2, PAL.orange); R(W / 2 - 1, oy + H / 2 - 6, 2, 12, PAL.orange);
        for (const [a, b] of [[4, 4], [W - 7, 4], [4, H - 7], [W - 7, H - 7]]) light(a, oy + b, [80, 200, 255]);
        break;
      }
      case 'complex': case 'mega': {
        const big = def.look === 'mega';
        box(2, oy + 4, W - 4, H - 6, 14, PAL.mid, PAL.dark);
        stripes(4, oy + H - 18, W - 8);
        // torres
        const towers = big ? 3 : 2;
        for (let i = 0; i < towers; i++) {
          const tw = big ? 12 : 10, tx = 6 + i * ((W - 12 - tw) / Math.max(1, towers - 1));
          const th = ex + (i === 1 ? 4 : -6);
          R(tx, oy + 10 - th, tw, th, PAL.dark); R(tx, oy + 10 - th, 2, th, PAL.orange);
          for (let y = oy + 14 - th; y < oy + 8; y += 6) light(tx + tw / 2 - 1, y, glow);
          R(tx - 1, oy + 8 - th, tw + 2, 3, PAL.orangeD);
        }
        // núcleo / poço
        x.fillStyle = css(glow, 0.9); x.beginPath(); x.arc(W / 2, oy + H / 2, big ? 9 : 6, 0, Math.PI * 2); x.fill();
        x.fillStyle = css([255, 255, 220]); x.beginPath(); x.arc(W / 2, oy + H / 2, big ? 4 : 2, 0, Math.PI * 2); x.fill();
        for (let i = 0; i < level; i++) R(6 + i * 5, oy + H - 8, 3, 3, [80 + i * 40, 220, 255]);
        break;
      }
      case 'cannon': {
        box(3, oy + 3, W - 6, H - 6, 10, PAL.mid, PAL.dark);
        x.save(); x.translate(W / 2, oy + H / 2 - 10); x.rotate(-0.7);
        x.fillStyle = css(PAL.dark); x.fillRect(-5, -ex + 6, 10, ex);
        x.fillStyle = css(PAL.orange); x.fillRect(-5, -ex + 6, 2, ex); x.fillRect(-6, -ex + 4, 12, 3);
        x.fillStyle = css(glow); x.fillRect(-2, -ex + 2, 4, 3); x.restore();
        light(5, oy - 4); light(W - 8, oy - 4, glow);
        break;
      }
      case 'crusher': {
        box(1, oy + 2, W - 2, H - 3, 12, PAL.mid, PAL.dark);
        R(4, oy - 12, W - 8, 8, [30, 30, 36]); // funil
        for (let i = 5; i < W - 5; i += 3) R(i, oy - 9, 2, 3, PAL.steel);
        stripes(2, oy + H - 10, W - 4); light(W - 7, oy + 2);
        break;
      }
      case 'refinery': case 'foundry': case 'tank': case 'reactor': case 'generator': {
        box(2, oy + 3, W - 4, H - 5, 8, PAL.mid, PAL.dark);
        const ntank = def.look === 'refinery' ? 2 : 1;
        for (let i = 0; i < ntank; i++) {
          const tr = def.look === 'reactor' ? Math.min(W, H) * 0.3 : def.look === 'generator' ? 6 : Math.min(W, H) * 0.22;
          const tx = ntank === 1 ? W / 2 : W * (0.3 + i * 0.4);
          const th = def.look === 'generator' ? 10 : ex - 4;
          R(tx - tr, oy + H / 2 - th, tr * 2, th, PAL.dark);
          R(tx - tr, oy + H / 2 - th, 2, th, PAL.light);
          x.fillStyle = css(def.look === 'foundry' || def.look === 'reactor' ? glow : PAL.mid);
          x.beginPath(); x.ellipse(tx, oy + H / 2 - th, tr, tr * 0.45, 0, 0, Math.PI * 2); x.fill();
          if (def.look === 'reactor' || def.look === 'foundry') {
            x.fillStyle = css([255, 255, 230], 0.9); x.beginPath(); x.ellipse(tx, oy + H / 2 - th, tr * 0.4, tr * 0.18, 0, 0, Math.PI * 2); x.fill();
          }
          for (let y = oy + H / 2 - th + 4; y < oy + H / 2; y += 6) R(tx - tr, y, tr * 2, 1, PAL.orangeD);
          light(tx - 1, oy + H / 2 - 4, glow);
        }
        if (def.look === 'refinery') { R(W - 8, oy - ex + 2, 4, ex + 4, PAL.dark); R(W - 9, oy - ex + 1, 6, 2, PAL.orange); }
        if (def.look === 'generator') { for (let i = 0; i < 3; i++) R(5 + i * 3, oy + 2, 2, 6, PAL.orange); }
        stripes(4, oy + H - 9, W - 8);
        break;
      }
      case 'capsule': {
        R(4, oy + H - 6, W - 8, 4, PAL.dark);
        x.fillStyle = css(PAL.mid); x.beginPath(); x.ellipse(W / 2, oy + H / 2 - 6, W / 2 - 4, H / 2 + 6, 0, 0, Math.PI * 2); x.fill();
        x.fillStyle = css(PAL.orange); x.beginPath(); x.ellipse(W / 2, oy + H / 2 - 8, W / 2 - 7, H / 2 + 2, 0, Math.PI, Math.PI * 2); x.fill();
        R(W / 2 - 7, oy + H / 2 - 6, 14, 10, [30, 90, 140]); R(W / 2 - 6, oy + H / 2 - 5, 12, 1, [120, 220, 255]);
        R(W / 2 - 1, oy - ex + 2, 2, 12, PAL.steel); light(W / 2 - 1, oy - ex, [255, 80, 40]);
        // emblema
        x.fillStyle = css(PAL.orangeL); x.beginPath(); x.moveTo(W / 2, oy - 14); x.lineTo(W / 2 + 5, oy - 11); x.lineTo(W / 2, oy - 8); x.lineTo(W / 2 - 5, oy - 11); x.fill();
        stripes(6, oy + H - 10, W - 12);
        break;
      }
      case 'bench': case 'lab': case 'robotics': {
        box(2, oy + 3, W - 4, H - 5, def.look === 'lab' ? 14 : 10, PAL.mid, PAL.dark);
        const sc: C3 = def.look === 'robotics' ? [255, 170, 60] : [60, 160, 255];
        R(6, oy - 16, W - 12, 10, [20, 40, 60]); R(7, oy - 15, W - 14, 8, shade(sc, 0.5)); R(8, oy - 14, (W - 16) * 0.6, 1, sc); R(8, oy - 11, (W - 16) * 0.4, 1, sc);
        if (def.look === 'lab') { x.fillStyle = css([90, 200, 255], 0.5); x.beginPath(); x.arc(W / 2, oy - 18, 9, Math.PI, 0); x.fill(); }
        if (def.look === 'robotics') { R(W - 12, oy - 22, 3, 14, PAL.orange); R(W - 18, oy - 22, 8, 3, PAL.orange); }
        stripes(4, oy + H - 10, W - 8); light(5, oy - 3, glow); light(W - 8, oy - 3, [80, 255, 140]);
        break;
      }
      case 'dish': {
        box(3, oy + 4, W - 6, H - 6, 8, PAL.mid, PAL.dark);
        R(W / 2 - 2, oy - 14, 4, 16, PAL.dark);
        x.fillStyle = css(PAL.steel); x.beginPath(); x.ellipse(W / 2, oy - 18, W * 0.38, W * 0.18, -0.25, 0, Math.PI * 2); x.fill();
        x.fillStyle = css(PAL.light); x.beginPath(); x.ellipse(W / 2, oy - 18, W * 0.28, W * 0.12, -0.25, 0, Math.PI * 2); x.fill();
        R(W / 2 - 1, oy - ex + 2, 2, 10, PAL.dark); light(W / 2 - 1, oy - ex + 1, glow);
        break;
      }
      case 'field': case 'pump': {
        box(2, oy + 3, W - 4, H - 5, 10, PAL.mid, PAL.dark);
        x.strokeStyle = css(glow); x.lineWidth = 2; x.beginPath(); x.ellipse(W / 2, oy - 8, W / 2 - 6, 4, 0, 0, Math.PI * 2); x.stroke();
        R(W / 2 - 2, oy - 14, 4, 8, PAL.light); light(W / 2 - 1, oy - 16, glow);
        if (def.look === 'pump') { R(2, oy + H - 8, W - 4, 3, [40, 120, 160]); }
        stripes(4, oy + H - 8, W - 8);
        break;
      }
      default: box(1, oy + 1, W - 2, H - 2, 10, PAL.mid, PAL.dark);
    }
    return c;
  }

  // ---------------- PERSONAGEM ----------------
  player(facing: number, frame: number, suitTier = 0): HTMLCanvasElement {
    return this.memo(`pl${facing}_${frame}_${suitTier}`, () => {
      const [c, x] = cv(12, 16);
      const R = (a: number, b: number, w: number, h: number, col: C3) => { x.fillStyle = css(col); x.fillRect(a, b, w, h); };
      const suit: C3 = suitTier >= 3 ? [230, 230, 240] : PAL.orange;
      const suitD = shade(suit, 0.65);
      R(2, 14, 8, 2, [0, 0, 0]); // sombra
      const legL = frame === 1 ? 1 : 0, legR = frame === 2 ? 1 : 0;
      R(3, 11 - legL, 2, 4 + legL, suitD); R(7, 11 - legR, 2, 4 + legR, suitD);
      R(2, 6, 8, 6, suit); R(2, 10, 8, 1, suitD);
      if (facing !== 3) R(2, 7, 8, 1, PAL.dark);
      // mochila
      if (facing === 3) { R(3, 6, 6, 5, PAL.mid); R(4, 7, 4, 1, [80, 180, 255]); }
      else if (facing === 0) R(1, 6, 2, 5, PAL.mid);
      else if (facing === 2) R(9, 6, 2, 5, PAL.mid);
      // capacete
      R(2, 1, 8, 6, suit); R(3, 0, 6, 1, suit);
      if (facing === 1) { R(3, 2, 6, 4, [30, 60, 90]); R(4, 3, 2, 1, [140, 220, 255]); }
      else if (facing === 0) { R(5, 2, 5, 4, [30, 60, 90]); R(7, 3, 2, 1, [140, 220, 255]); }
      else if (facing === 2) { R(2, 2, 5, 4, [30, 60, 90]); R(3, 3, 2, 1, [140, 220, 255]); }
      R(9, 1, 1, 2, [255, 220, 120]); // lanterna
      return c;
    });
  }

  robot(kind: RobotKind, frame: number): HTMLCanvasElement {
    return this.memo(`rb${kind}_${frame}`, () => {
      const col = ROBOT[kind].color;
      const [c, x] = cv(12, 12);
      const R = (a: number, b: number, w: number, h: number, cc: C3) => { x.fillStyle = css(cc); x.fillRect(a, b, w, h); };
      R(2, 10, 8, 2, [0, 0, 0]);
      R(1, 8, 3, 3, PAL.dark); R(8, 8, 3, 3, PAL.dark); // esteiras
      R(2, 3 + (frame & 1), 8, 6, col); R(2, 3 + (frame & 1), 8, 1, shade(col, 1.3)); R(2, 8 + (frame & 1), 8, 1, shade(col, 0.6));
      R(4, 4 + (frame & 1), 4, 2, PAL.dark); R(5, 4 + (frame & 1), 2, 1, [140, 230, 255]);
      if (kind === 'miner') R(9, 5, 3, 2, PAL.steel);
      if (kind === 'carry') R(3, 1, 6, 2, PAL.mid);
      if (kind === 'repair') R(0, 4, 2, 3, [80, 200, 255]);
      if (kind === 'scout' || kind === 'survey') R(5, 0, 1, 3, PAL.steel);
      if (kind === 'hazard') R(3, 1, 6, 2, [120, 255, 140]);
      if (kind === 'loader') R(1, 2, 10, 1, PAL.orangeL);
      return c;
    });
  }

  artifact(kind: number): HTMLCanvasElement {
    return this.memo(`art${kind}`, () => {
      const [c, x] = cv(12, 16);
      const R = (a: number, b: number, w: number, h: number, cc: C3, al = 1) => { x.fillStyle = css(cc, al); x.fillRect(a, b, w, h); };
      R(1, 13, 10, 3, [0, 0, 0], 0.5);
      R(2, 2, 8, 12, [40, 56, 64]); R(2, 2, 8, 1, [80, 110, 120]); R(3, 3, 6, 10, [28, 40, 48]);
      R(4, 5, 4, 1, [60, 230, 240]); R(5, 7, 2, 3, [60, 230, 240]); R(4, 11, 4, 1, [60, 230, 240]);
      if (kind % 2) R(3, 8, 1, 1, [200, 255, 255]);
      return c;
    });
  }

  // ---------------- ITENS ----------------
  item(key: string, size: number): HTMLCanvasElement {
    return this.memo(`it${key}_${size}`, () => {
      const def = ITEM[key];
      const [c, x] = cv(size, size);
      if (!def) return c;
      drawItemIcon(x, def, size);
      return c;
    });
  }
  itemUrl(key: string): string {
    let u = this.iconUrls.get(key);
    if (!u) { u = this.item(key, 32).toDataURL(); this.iconUrls.set(key, u); }
    return u;
  }
  machineUrl(def: MachineDef): string {
    const k = 'M' + def.key;
    let u = this.iconUrls.get(k);
    if (!u) {
      const { img } = this.machine(def, 0);
      const s = 40;
      const [c, x] = cv(s, s);
      const k2 = Math.min(s / img.width, s / img.height);
      x.drawImage(img, (s - img.width * k2) / 2, (s - img.height * k2) / 2, img.width * k2, img.height * k2);
      u = c.toDataURL(); this.iconUrls.set(k, u);
    }
    return u;
  }
  robotUrl(kind: RobotKind): string {
    const k = 'R' + kind;
    let u = this.iconUrls.get(k);
    if (!u) {
      const [c, x] = cv(36, 36);
      x.drawImage(this.robot(kind, 0), 0, 0, 36, 36);
      u = c.toDataURL(); this.iconUrls.set(k, u);
    }
    return u;
  }

  // ---------------- RETRATOS ----------------
  portraitUrl(id: SpeakerId): string {
    const k = 'P' + id;
    let u = this.iconUrls.get(k);
    if (!u) { u = drawPortrait(id).toDataURL(); this.iconUrls.set(k, u); }
    return u;
  }
}

function drawItemIcon(x: CanvasRenderingContext2D, def: ItemDef, s: number) {
  const k = s / 16;
  const R = (a: number, b: number, w: number, h: number, col: readonly number[], al = 1) => { x.fillStyle = css(col, al); x.fillRect(Math.round(a * k), Math.round(b * k), Math.ceil(w * k), Math.ceil(h * k)); };
  const c = def.color, c2 = def.color2 ?? shade(c, 0.5);
  const poly = (pts: number[], col: readonly number[]) => { x.fillStyle = css(col); x.beginPath(); x.moveTo(pts[0] * k, pts[1] * k); for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i] * k, pts[i + 1] * k); x.closePath(); x.fill(); };
  switch (def.icon) {
    case 'crystal':
      poly([3, 14, 5, 5, 7, 14], shade(c, 0.55)); poly([5, 14, 5, 5, 8, 14], c);
      poly([7, 15, 9, 1, 11, 15], shade(c, 0.6)); poly([9, 15, 9, 1, 12, 15], shade(c, 1.15));
      poly([11, 14, 13, 7, 14, 14], c); R(9, 4, 1, 4, shade(c, 1.7)); break;
    case 'cluster':
      poly([2, 14, 4, 6, 9, 5, 8, 14], c2); poly([6, 14, 8, 3, 13, 5, 14, 14], c); poly([8, 3, 13, 5, 11, 8], shade(c, 1.3)); R(10, 6, 2, 1, [255, 255, 255], 0.7); break;
    case 'gravel':
      for (let i = 0; i < 7; i++) { const a = 2 + (i * 5) % 11, b = 7 + (i * 3) % 7; R(a, b, 3, 2, i % 2 ? c : shade(c, 0.6)); } break;
    case 'ingot':
      poly([2, 11, 5, 6, 14, 6, 12, 11], shade(c, 1.2)); R(2, 11, 10, 3, c2); poly([12, 11, 14, 6, 14, 9, 12, 14], shade(c2, 0.7)); break;
    case 'plate':
      poly([1, 9, 6, 5, 15, 7, 10, 11], shade(c, 1.15)); poly([1, 9, 10, 11, 10, 13, 1, 11], shade(c, 0.6)); poly([10, 11, 15, 7, 15, 9, 10, 13], shade(c, 0.45)); break;
    case 'cell':
      R(5, 2, 6, 13, [40, 44, 52]); R(6, 4, 4, 10, c); R(6, 4, 1, 10, shade(c, 1.5)); R(6, 1, 4, 2, [150, 150, 160]); if (def.color2) R(6, 8, 4, 2, def.color2); break;
    case 'orb':
      x.fillStyle = css(c2); x.beginPath(); x.arc(8 * k, 8.5 * k, 5.5 * k, 0, 7); x.fill();
      x.fillStyle = css(c); x.beginPath(); x.arc(8 * k, 8 * k, 4.5 * k, 0, 7); x.fill(); R(6, 5, 2, 2, [255, 255, 255], 0.8); break;
    case 'chip':
      R(3, 3, 10, 10, [30, 34, 40]); R(5, 5, 6, 6, c); R(6, 6, 2, 2, shade(c, 1.6));
      for (let i = 4; i < 13; i += 3) { R(i, 1, 1, 2, [200, 200, 200]); R(i, 13, 1, 2, [200, 200, 200]); R(1, i, 2, 1, [200, 200, 200]); R(13, i, 2, 1, [200, 200, 200]); } break;
    case 'gear':
      x.fillStyle = css(c); x.beginPath(); for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, r = i % 2 ? 6.5 : 4.8; x.lineTo((8 + Math.cos(a) * r) * k, (8 + Math.sin(a) * r) * k); } x.fill();
      x.fillStyle = css(c2); x.beginPath(); x.arc(8 * k, 8 * k, 2 * k, 0, 7); x.fill(); break;
    case 'canister':
      R(4, 3, 8, 12, [50, 54, 62]); R(5, 5, 6, 8, c); R(5, 5, 1, 8, shade(c, 1.5)); R(5, 2, 6, 2, [150, 150, 160]); break;
    case 'core':
      x.fillStyle = css(c2, 0.6); x.beginPath(); x.arc(8 * k, 8 * k, 7 * k, 0, 7); x.fill();
      x.fillStyle = css(c); x.beginPath(); x.arc(8 * k, 8 * k, 4.5 * k, 0, 7); x.fill(); R(7, 7, 2, 2, [255, 255, 255]); break;
    case 'charge':
      R(3, 5, 4, 9, c); R(7, 4, 4, 10, shade(c, 0.85)); R(3, 5, 1, 9, shade(c, 1.4)); R(4, 3, 7, 2, c2); R(10, 1, 1, 3, [220, 220, 220]); break;
    case 'kit':
      R(2, 5, 12, 9, c); R(2, 5, 12, 1, shade(c, 1.3)); R(6, 3, 4, 2, [60, 60, 70]); R(7, 7, 2, 5, [255, 255, 255]); R(5, 9, 6, 1, [255, 255, 255]); break;
    case 'module':
      R(3, 3, 10, 10, [40, 44, 52]); R(4, 4, 8, 8, c); for (let i = 5; i < 12; i += 2) R(i, 5, 1, 6, shade(c, 0.6)); break;
    case 'lamp':
      R(6, 2, 4, 2, [60, 60, 70]); R(5, 4, 6, 8, c); R(6, 5, 4, 5, [255, 240, 180]); R(6, 12, 4, 2, [60, 60, 70]); break;
    case 'fiber':
      for (let i = 0; i < 4; i++) { x.strokeStyle = css(i % 2 ? c : shade(c, 0.6)); x.lineWidth = k; x.beginPath(); x.moveTo((3 + i * 2) * k, 14 * k); x.quadraticCurveTo(8 * k, 2 * k, (12 - i) * k, 3 * k); x.stroke(); } break;
  }
}

function drawPortrait(id: SpeakerId): HTMLCanvasElement {
  const [c, x] = cv(64, 64);
  const R = (a: number, b: number, w: number, h: number, col: readonly number[], al = 1) => { x.fillStyle = css(col, al); x.fillRect(a, b, w, h); };
  const g = x.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, '#0d1a2a'); g.addColorStop(1, '#05080e');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  switch (id) {
    case 'zena': {
      x.fillStyle = 'rgba(70,170,255,0.25)'; x.beginPath(); x.arc(32, 30, 24, 0, 7); x.fill();
      R(20, 14, 24, 30, [40, 120, 220]); R(22, 12, 20, 4, [60, 150, 240]); R(18, 20, 4, 18, [30, 100, 200]); R(42, 20, 4, 18, [30, 100, 200]);
      R(24, 26, 6, 3, [180, 240, 255]); R(34, 26, 6, 3, [180, 240, 255]); R(28, 36, 8, 2, [140, 220, 255]);
      for (let y = 10; y < 56; y += 3) R(10, y, 44, 1, [120, 200, 255], 0.12);
      R(14, 46, 36, 14, [20, 70, 150]); break;
    }
    case 'rocha': {
      R(12, 8, 40, 40, [232, 150, 42]); R(10, 16, 4, 24, [160, 90, 20]); R(50, 16, 4, 24, [160, 90, 20]);
      R(18, 18, 28, 22, [30, 50, 70]); R(22, 22, 20, 16, [180, 130, 100]); R(25, 27, 4, 2, [40, 30, 30]); R(35, 27, 4, 2, [40, 30, 30]);
      R(26, 33, 12, 2, [110, 70, 60]); R(22, 35, 20, 4, [90, 80, 80]); R(19, 19, 6, 2, [140, 220, 255], 0.6);
      R(10, 48, 44, 16, [200, 120, 30]); R(28, 50, 8, 6, [40, 40, 50]); break;
    }
    case 'br7': {
      R(14, 12, 36, 32, [70, 76, 90]); R(14, 12, 36, 4, [110, 116, 130]); R(18, 20, 28, 12, [20, 24, 30]);
      R(21, 23, 8, 6, [80, 200, 255]); R(35, 23, 8, 6, [80, 200, 255]); R(23, 24, 3, 2, [220, 250, 255]); R(37, 24, 3, 2, [220, 250, 255]);
      R(24, 36, 16, 3, [232, 150, 42]); R(30, 6, 4, 6, [110, 116, 130]); R(30, 4, 4, 2, [255, 80, 40]);
      R(10, 46, 44, 18, [232, 150, 42]); R(10, 46, 44, 2, [255, 200, 90]); break;
    }
    case 'varren': {
      R(10, 46, 44, 18, [30, 32, 40]); R(28, 46, 8, 14, [220, 220, 230]); R(30, 48, 4, 12, [200, 140, 30]);
      R(20, 14, 24, 30, [200, 150, 120]); R(18, 10, 28, 8, [80, 70, 70]); R(18, 10, 4, 14, [80, 70, 70]); R(42, 10, 4, 14, [80, 70, 70]);
      R(24, 24, 5, 2, [40, 30, 30]); R(35, 24, 5, 2, [40, 30, 30]); R(22, 34, 20, 8, [120, 110, 110]); R(27, 36, 10, 2, [240, 230, 220]);
      R(46, 50, 6, 6, [232, 150, 42]); break;
    }
    case 'sera': {
      R(12, 10, 40, 38, [40, 140, 140]); R(18, 16, 28, 26, [30, 50, 60]); R(22, 20, 20, 20, [190, 140, 110]);
      R(22, 18, 20, 5, [60, 30, 20]); R(20, 18, 3, 16, [60, 30, 20]); R(41, 18, 3, 16, [60, 30, 20]);
      R(26, 27, 4, 2, [30, 30, 40]); R(34, 27, 4, 2, [30, 30, 40]); R(28, 34, 8, 1, [140, 80, 70]);
      R(10, 48, 44, 16, [30, 110, 110]); R(30, 52, 4, 4, [60, 240, 230]); break;
    }
    case 'kilo': {
      R(16, 18, 32, 28, [255, 200, 80]); R(16, 18, 32, 4, [255, 230, 140]); R(20, 24, 24, 12, [30, 34, 40]);
      R(24, 27, 5, 5, [140, 230, 255]); R(35, 27, 5, 5, [140, 230, 255]); R(28, 38, 8, 2, [120, 80, 20]);
      R(30, 10, 4, 8, [80, 80, 90]); R(28, 8, 8, 3, [255, 120, 60]); R(12, 46, 40, 10, [60, 60, 70]); break;
    }
    case 'zenitex': {
      x.fillStyle = css([232, 150, 42]); x.beginPath();
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 - Math.PI / 2; x.lineTo(32 + Math.cos(a) * 22, 32 + Math.sin(a) * 22); } x.fill();
      x.fillStyle = '#0d1a2a'; x.beginPath();
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 - Math.PI / 2; x.lineTo(32 + Math.cos(a) * 14, 32 + Math.sin(a) * 14); } x.fill();
      R(24, 26, 16, 4, [255, 200, 90]); R(24, 34, 16, 4, [255, 200, 90]); R(30, 26, 4, 12, [255, 200, 90]); break;
    }
    default: R(16, 16, 32, 32, [100, 110, 120]);
  }
  x.strokeStyle = 'rgba(120,200,255,0.5)'; x.strokeRect(0.5, 0.5, 63, 63);
  return c;
}
