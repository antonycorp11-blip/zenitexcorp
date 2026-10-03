import { TILE } from '../core/constants';
import { hash2 } from '../core/rng';
import { MATERIALS } from '../data/materials';
import { ITEM, type ItemDef } from '../data/items';
import type { MachineDef } from '../data/machines';
import type { RobotKind } from '../data/robots';
import { ROBOT } from '../data/robots';
import type { SpeakerId } from '../data/dialogue';
import { drawSideMachine, sideExtra, drawPlayer, drawArm, drawDrone, drawChest } from './SideSprites';

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
    const img = this.memo(key, () => drawSideMachine(def, def.rotatable ? dir : 0, level));
    return { img, oy: sideExtra(def) };
  }

  // ---------------- PERSONAGEM ----------------
  /** personagem de lado (olhando à direita); frame 0 parado, 1–4 andando, 5 no ar */
  player(_facing: number, frame: number, suitTier = 0, jet = false): HTMLCanvasElement {
    return this.memo(`pl${frame}_${suitTier}_${jet ? 1 : 0}`, () => drawPlayer(frame, suitTier, jet));
  }
  arm(level: number): HTMLCanvasElement { return this.memo(`arm${level}`, () => drawArm(level)); }

  robot(kind: RobotKind, frame: number): HTMLCanvasElement { return this.memo(`rb${kind}_${frame}`, () => drawDrone(kind, frame)); }

  chest(): HTMLCanvasElement { return this.memo('chest', () => drawChest()); }

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
      const s = 80;
      const [c, x] = cv(s, s);
      if (def.leaky) {
        // Esteira Vazada: grade de aço com fogo por baixo e calhas
        x.fillStyle = '#ff7a28'; x.globalAlpha = 0.55; x.fillRect(8, 26, 64, 22); x.globalAlpha = 1;
        x.fillStyle = '#3c4048'; x.fillRect(6, 22, 68, 5);
        x.fillStyle = '#b4bcc6'; for (let k = 10; k < 70; k += 9) x.fillRect(k, 27, 4, 18);
        x.fillStyle = '#20232a'; x.fillRect(6, 45, 68, 7);
        x.fillStyle = '#e8b030'; for (let k = 6; k < 74; k += 12) x.fillRect(k, 45, 6, 7);
        x.fillStyle = '#5a606a';
        for (const cx of [24, 56]) { x.beginPath(); x.moveTo(cx - 11, 52); x.lineTo(cx + 11, 52); x.lineTo(cx + 4, 66); x.lineTo(cx - 4, 66); x.closePath(); x.fill(); }
        x.fillStyle = '#ffae3c'; x.fillRect(21, 66, 6, 9); x.fillRect(53, 66, 6, 9);
      } else if (def.behavior === 'tube') {
        const giant = def.key === 'tubo_gigante', booster = def.key === 'reforcador';
        const rad = giant ? 17 : 13;
        x.fillStyle = '#111b25'; x.fillRect(9, 40 - rad, 62, rad * 2);
        x.fillStyle = '#556b7a'; x.fillRect(12, 43 - rad, 56, rad * 2 - 6);
        x.fillStyle = '#123b52'; x.fillRect(15, 34, 50, 12);
        x.fillStyle = '#79dce9'; x.fillRect(15, 35, 50, 3);
        for (const end of [12, 61]) {
          x.fillStyle = '#15232b'; x.fillRect(end, 25, 7, 30);
          x.fillStyle = booster ? '#e7a65a' : '#b2c4ce'; x.fillRect(end + 1, 27, 2, 26);
        }
        x.fillStyle = booster ? '#b86c2b' : '#243d4b';
        x.beginPath(); x.arc(40, 40, giant ? 20 : 17, 0, Math.PI * 2); x.fill();
        x.strokeStyle = booster ? '#ffd08a' : '#8cecff'; x.lineWidth = 3; x.stroke();
        x.fillStyle = '#071c29'; x.beginPath(); x.arc(40, 40, giant ? 12 : 10, 0, Math.PI * 2); x.fill();
        x.fillStyle = booster ? '#ffd088' : '#91edff';
        x.beginPath(); x.moveTo(35, 35); x.lineTo(46, 40); x.lineTo(35, 45); x.closePath(); x.fill();
        x.strokeStyle = '#bdf4ff'; x.lineWidth = 2;
        for (let i = 0; i < 3; i++) { const y = 30 + i * 10; x.beginPath(); x.moveTo(3, y - 3); x.quadraticCurveTo(8, y - 5, 11, y); x.stroke(); }
      } else {
        const { img } = this.machine(def, 0);
        x.imageSmoothingEnabled = true;
        const k2 = Math.min(s / img.width, s / img.height);
        x.drawImage(img, (s - img.width * k2) / 2, (s - img.height * k2) / 2, img.width * k2, img.height * k2);
      }
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
    case 'block':
      poly([2, 6, 8, 3, 14, 6, 8, 9], shade(c, 1.2)); poly([2, 6, 8, 9, 8, 15, 2, 12], c); poly([8, 9, 14, 6, 14, 12, 8, 15], shade(c, 0.6));
      R(4, 9, 2, 1, c2); R(10, 10, 3, 1, c2); break;
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
