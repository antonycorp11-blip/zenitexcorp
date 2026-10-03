import { ITEM } from '../data/items';
import { fmtInt } from '../core/math';

type C3 = readonly number[];
interface P { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; c: C3; g: number; glow: boolean; }
interface Txt { x: number; y: number; text: string; c: C3; life: number; }

/** Partículas e números flutuantes discretos. */
export class Particles {
  ps: P[] = [];
  texts: Txt[] = [];
  screenFlash: { c: C3; a: number } | null = null;
  private pickAcc = new Map<string, { n: number; x: number; y: number; t: number }>();

  private add(p: P) { if (this.ps.length < 2500) this.ps.push(p); }

  debris(x: number, y: number, c: C3, dx: number, dy: number, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.8, s = 30 + Math.random() * 70;
      const k = 0.6 + Math.random() * 0.6;
      this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, life: 0, max: 0.4 + Math.random() * 0.5, size: Math.random() < 0.3 ? 2 : 1, c: [c[0] * k, c[1] * k, c[2] * k], g: 160, glow: false });
    }
    if (Math.random() < 0.5) this.add({ x, y, vx: (Math.random() - 0.5) * 20, vy: -10 - Math.random() * 15, life: 0, max: 0.9, size: 3, c: [c[0] * 0.6 + 60, c[1] * 0.6 + 50, c[2] * 0.6 + 40], g: -10, glow: false });
  }
  sparks(x: number, y: number, c: C3, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 90;
      this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 0.15 + Math.random() * 0.25, size: 1, c, g: 80, glow: true });
    }
  }
  dust(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = Math.random() * 40;
      this.add({ x: x + Math.cos(a) * 10, y: y + Math.sin(a) * 10, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 8, life: 0, max: 1.5 + Math.random(), size: 3 + Math.random() * 3, c: [120, 100, 85], g: -4, glow: false });
    }
  }
  explosion(x: number, y: number) {
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 160;
      this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 0.3 + Math.random() * 0.6, size: 1 + Math.random() * 2, c: Math.random() < 0.5 ? [255, 200, 80] : [255, 90, 30], g: 30, glow: true });
    }
    this.dust(x, y, 30);
    this.screenFlash = { c: [255, 200, 120], a: 0.35 };
  }
  blood(x: number, y: number) { this.sparks(x, y, [255, 60, 40], 6); }
  smoke(x: number, y: number, c: C3 = [200, 200, 200]) {
    this.add({ x: x + (Math.random() - 0.5) * 4, y, vx: (Math.random() - 0.5) * 6, vy: -12 - Math.random() * 10, life: 0, max: 2 + Math.random(), size: 3 + Math.random() * 3, c, g: -2, glow: false });
  }
  ember(x: number, y: number, c: C3) {
    this.add({ x, y, vx: (Math.random() - 0.5) * 8, vy: -8 - Math.random() * 14, life: 0, max: 1.5 + Math.random() * 1.5, size: 1, c, g: -3, glow: true });
  }
  flashScreen(c: C3, a: number) { this.screenFlash = { c, a }; }

  /** Agrupa coletas próximas num único número "+12 Lumenita". */
  pickup(x: number, y: number, k: string, n: number) {
    const e = this.pickAcc.get(k);
    if (e && e.t < 0.35) { e.n += n; e.x = x; e.y = y; return; }
    this.pickAcc.set(k, { n, x, y, t: 0 });
  }
  text(x: number, y: number, text: string, c: C3) { this.texts.push({ x, y, text, c, life: 0 }); }

  update(dt: number) {
    for (const p of this.ps) { p.life += dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; }
    this.ps = this.ps.filter(p => p.life < p.max);
    for (const t of this.texts) { t.life += dt; t.y -= dt * 14; }
    this.texts = this.texts.filter(t => t.life < 1.4);
    for (const [k, e] of this.pickAcc) {
      e.t += dt;
      if (e.t >= 0.35) {
        this.pickAcc.delete(k);
        const d = ITEM[k];
        this.text(e.x, e.y - 6, `+${e.n >= 10 ? fmtInt(e.n) : e.n.toFixed(1).replace('.', ',')} ${d?.name ?? k}`, d?.color ?? [255, 255, 255]);
      }
    }
    if (this.screenFlash) { this.screenFlash.a -= dt * 1.2; if (this.screenFlash.a <= 0) this.screenFlash = null; }
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.ps) {
      const t = p.life / p.max, a = 1 - t;
      const col = `rgb(${p.c[0] | 0},${p.c[1] | 0},${p.c[2] | 0})`;
      if (p.size >= 3 && !p.glow) {
        // poeira/fumaça: nuvem macia que cresce e some
        ctx.globalAlpha = a * 0.35;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.1, Math.abs(p.size) * (0.6 + Math.max(0, t) * 1.6)), 0, 7); ctx.fill();
      } else if (p.glow) {
        // faísca: risco na direção do movimento
        ctx.globalAlpha = a;
        ctx.strokeStyle = col; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025); ctx.stroke();
      } else {
        ctx.globalAlpha = a * 0.9;
        ctx.fillStyle = col;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  drawGlow(ctx: CanvasRenderingContext2D) {
    for (const p of this.ps) {
      if (!p.glow) continue;
      const a = (1 - p.life / p.max) * 0.6;
      ctx.globalAlpha = a;
      ctx.fillStyle = `rgb(${p.c[0] | 0},${p.c[1] | 0},${p.c[2] | 0})`;
      ctx.fillRect(p.x - 2, p.y - 2, 5, 5);
    }
    ctx.globalAlpha = 1;
  }
}
