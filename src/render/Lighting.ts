/**
 * Iluminação: camada de escuridão em baixa resolução onde as luzes "abrem buracos",
 * mais uma camada aditiva de brilho colorido. A névoa de guerra é desenhada por cima.
 */
type C3 = readonly number[];
export interface Light { x: number; y: number; r: number; c: C3; a: number; }

export class Lighting {
  dark: HTMLCanvasElement; dctx: CanvasRenderingContext2D;
  glow: HTMLCanvasElement; gctx: CanvasRenderingContext2D;
  private grad = new Map<string, HTMLCanvasElement>();
  scale = 0.5;
  lights: Light[] = [];
  private texs: { hole: HTMLCanvasElement; glow: HTMLCanvasElement; x: number; y: number; w: number; h: number; a: number }[] = [];
  static readonly TEX_SCALE = 0.5;
  static readonly TEX_PAD = 48;

  /** Pré-renderiza um conjunto de luzes estáticas em duas texturas (buraco na escuridão + brilho). */
  bake(lights: Light[], x0: number, y0: number, size: number): { hole: HTMLCanvasElement; glow: HTMLCanvasElement } {
    const P = Lighting.TEX_PAD, S = Lighting.TEX_SCALE;
    const dim = Math.ceil((size + P * 2) * S);
    const hole = document.createElement('canvas'); hole.width = hole.height = dim;
    const glow = document.createElement('canvas'); glow.width = glow.height = dim;
    const h = hole.getContext('2d')!, gl = glow.getContext('2d')!;
    h.globalCompositeOperation = 'lighter'; gl.globalCompositeOperation = 'lighter';
    const white = this.gradient([255, 255, 255], true);
    for (const L of lights) {
      const x = (L.x - x0 + P) * S, y = (L.y - y0 + P) * S, r = L.r * S;
      h.globalAlpha = Math.min(1, L.a * 1.3); h.drawImage(white, x - r, y - r, r * 2, r * 2);
      gl.globalAlpha = L.a * 0.2; gl.drawImage(this.gradient(L.c), x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6);
    }
    return { hole, glow };
  }
  addBaked(t: { hole: HTMLCanvasElement; glow: HTMLCanvasElement }, x0: number, y0: number, size: number, a = 1) {
    const P = Lighting.TEX_PAD;
    this.texs.push({ hole: t.hole, glow: t.glow, x: x0 - P, y: y0 - P, w: size + P * 2, h: size + P * 2, a });
  }

  constructor() {
    this.dark = document.createElement('canvas'); this.dctx = this.dark.getContext('2d')!;
    this.glow = document.createElement('canvas'); this.gctx = this.glow.getContext('2d')!;
  }

  resize(w: number, h: number) {
    const W = Math.ceil(w * this.scale), H = Math.ceil(h * this.scale);
    if (this.dark.width !== W || this.dark.height !== H) {
      this.dark.width = W; this.dark.height = H; this.glow.width = W; this.glow.height = H;
    }
  }

  /** Sprite de gradiente radial cacheado por cor. */
  gradient(c: C3, soft = false): HTMLCanvasElement {
    const rgb = `${c[0] | 0},${c[1] | 0},${c[2] | 0}`;
    const key = rgb + (soft ? 's' : '');
    let g = this.grad.get(key);
    if (!g) {
      g = document.createElement('canvas'); g.width = g.height = 64;
      const x = g.getContext('2d')!;
      const rg = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      rg.addColorStop(0, `rgba(${rgb},1)`);
      rg.addColorStop(soft ? 0.5 : 0.25, `rgba(${rgb},${soft ? 0.35 : 0.55})`);
      rg.addColorStop(1, `rgba(${rgb},0)`);
      x.fillStyle = rg; x.fillRect(0, 0, 64, 64);
      this.grad.set(key, g);
    }
    return g;
  }

  add(x: number, y: number, r: number, c: C3, a = 1) { this.lights.push({ x, y, r, c, a }); }

  /** sx, sy: conversão mundo->tela; zoom; ambient: cor escura do setor; darkness 0..1 */
  render(camX: number, camY: number, zoom: number, w: number, h: number, ambient: C3, darkness: number, surfacePx = -1e9, top = darkness) {
    const s = this.scale * zoom;
    const d = this.dctx, g = this.gctx;
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, this.dark.width, this.dark.height);
    // vista lateral: claro acima do chão, escurece com a profundidade
    const sy = (surfacePx - camY) * s;
    const gr = d.createLinearGradient(0, sy, 0, sy + 260 * s);
    const c = `${ambient[0]},${ambient[1]},${ambient[2]}`;
    gr.addColorStop(0, `rgba(${c},${top})`); gr.addColorStop(1, `rgba(${c},${darkness})`);
    d.fillStyle = gr;
    d.fillRect(0, 0, this.dark.width, this.dark.height);
    d.globalCompositeOperation = 'destination-out';
    g.clearRect(0, 0, this.glow.width, this.glow.height);
    g.globalCompositeOperation = 'lighter';
    for (const T of this.texs) {
      const x = (T.x - camX) * s, y = (T.y - camY) * s, w2 = T.w * s, h2 = T.h * s;
      d.globalAlpha = T.a; d.drawImage(T.hole, x, y, w2, h2);
      g.globalAlpha = T.a; g.drawImage(T.glow, x, y, w2, h2);
    }
    this.texs.length = 0;
    const white = this.gradient([255, 255, 255], true);
    for (const L of this.lights) {
      const x = (L.x - camX) * s, y = (L.y - camY) * s, r = L.r * s;
      if (x + r < 0 || y + r < 0 || x - r > this.dark.width || y - r > this.dark.height) continue;
      d.globalAlpha = Math.min(1, L.a * 1.3);
      d.drawImage(white, x - r, y - r, r * 2, r * 2);
      g.globalAlpha = L.a * 0.2;
      g.drawImage(this.gradient(L.c), x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6);
    }
    d.globalAlpha = 1; g.globalAlpha = 1;
    d.globalCompositeOperation = 'source-over';
    this.lights.length = 0;
    void w; void h;
  }
}
