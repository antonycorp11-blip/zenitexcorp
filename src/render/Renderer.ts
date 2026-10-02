import { CELL, CHUNK_PX, TILE, WORLD_CW, WORLD_PX_W } from '../core/constants';
import { DIRS } from '../core/math';
import { MATERIALS } from '../data/materials';
import { SECTORS } from '../data/sectors';
import { ITEM } from '../data/items';
import { MACHINE } from '../data/machines';
import type { Game } from '../Game';
import { BASE_RADIUS, type Machine } from '../systems/Machines';

type C3 = readonly number[];
const rgba = (c: C3, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

export class Renderer {
  ctx: CanvasRenderingContext2D;
  private fog: HTMLCanvasElement; private fctx: CanvasRenderingContext2D;
  private fogImg: ImageData | null = null;
  private time = 0;
  prof: Record<string, number> = {};
  private pt = 0;
  private mark(k: string) { const n = performance.now(); this.prof[k] = (this.prof[k] ?? 0) * 0.9 + (n - this.pt) * 0.1; this.pt = n; }

  constructor(private g: Game, private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.fog = document.createElement('canvas');
    this.fctx = this.fog.getContext('2d')!;
  }

  resize() {
    const dpr = 1; // pixel art: resolução nativa CSS, ampliada com image-rendering: pixelated
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.width = Math.floor(w * dpr); this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.g.camera.w = this.canvas.width; this.g.camera.h = this.canvas.height;
    this.g.lighting.resize(this.canvas.width, this.canvas.height);
    const z = Math.max(1.25, Math.min(2.4, h / 380));
    if (!this.g.flags.userZoom) { this.g.camera.targetZoom = z; this.g.camera.zoom = z; }
  }

  draw(dt: number) {
    const g = this.g, ctx = this.ctx, cam = g.camera;
    this.time += dt;
    g.terrain.frame++;
    const W = this.canvas.width, H = this.canvas.height;
    const z = cam.zoom;
    const L = Math.round(cam.left() * z) / z, T = Math.round(cam.top() * z) / z;
    const R = L + W / z, B = T + H / z;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawSky(L, T, z, W, H);
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(z, 0, 0, z, -L * z, -T * z);

    this.pt = performance.now();
    // ---- terreno ----
    const c0x = Math.floor(L / CHUNK_PX), c1x = Math.floor(R / CHUNK_PX);
    const c0y = Math.floor(T / CHUNK_PX), c1y = Math.floor((B + 40) / CHUNK_PX);
    let budget = g.input.touch ? 6 : 12;   // grãos se movem o tempo todo: re-render parcial é barato
    const sec = g.world.sectorAtPx(g.player.x, g.player.y) || 1;
    const sd = SECTORS[sec - 1];
    // prioriza o chunk do jogador
    const order: [number, number][] = [];
    for (let cy = c0y; cy <= c1y; cy++) for (let cx = c0x; cx <= c1x; cx++) order.push([cx, cy]);
    const pcx = g.player.x / CHUNK_PX, pcy = g.player.y / CHUNK_PX;
    order.sort((a, b) => Math.hypot(a[0] + 0.5 - pcx, a[1] + 0.5 - pcy) - Math.hypot(b[0] + 0.5 - pcx, b[1] + 0.5 - pcy));
    for (const [cx, cy] of order) {
      const k = cy * WORLD_CW + cx;
      const needs = g.world.dirty.has(k) || !g.terrain.get(cx, cy, false);
      const ch = g.terrain.get(cx, cy, needs && budget-- > 0);
      if (!ch) continue;
      ctx.drawImage(ch.canvas, cx * CHUNK_PX, cy * CHUNK_PX, CHUNK_PX, CHUNK_PX);
      if (ch.lights.length) {
        if (!ch.baked) ch.baked = g.lighting.bake(ch.lights, cx * CHUNK_PX, cy * CHUNK_PX, CHUNK_PX);
        g.lighting.addBaked(ch.baked, cx * CHUNK_PX, cy * CHUNK_PX, CHUNK_PX, 0.88 + 0.12 * Math.sin(this.time * 1.7 + cx * 3 + cy * 7));
      }
    }

    this.mark('terrain');
    // ---- marcas de scanner ----
    for (const m of g.scanner.marks) {
      const age = g.time - m.t;
      const a = Math.max(0, 1 - age / 25);
      const def = MATERIALS[m.mat];
      const col = m.level <= 0 ? [255, 220, 120] : def.glow ?? def.top;
      ctx.strokeStyle = rgba(col, a * (0.6 + 0.4 * Math.sin(this.time * 5 + m.x)));
      ctx.lineWidth = 1 / z * 2;
      const r = 3 + Math.min(10, m.n * 0.8) * (m.level >= 1 ? 1 : 0.5);
      ctx.strokeRect(m.x - r, m.y - r, r * 2, r * 2);
      g.lighting.add(m.x, m.y, 20, col, 0.4 * a);
    }
    for (const r of g.scanner.rings) {
      ctx.strokeStyle = `rgba(120,220,255,${0.5 * (1 - r.r / r.max)})`;
      ctx.lineWidth = 2 / z;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
    }

    // ---- esteiras (chão) ----
    for (const m of g.machines.list) {
      if (m.def.behavior !== 'belt') continue;
      const x = m.tx * TILE, y = m.ty * TILE;
      if (x > R || x + TILE < L || y > B || y + TILE < T) continue;
      this.drawBelt(m, x, y);
    }
    for (const m of g.machines.list) if (m.def.behavior === 'platform') {
      const x = m.tx * TILE, y = m.ty * TILE;
      if (x > R || x + TILE < L || y > B || y + TILE < T) continue;
      ctx.drawImage(g.sprites.machine(m.def, 0).img, x, y - 2);
    }

    this.mark('belts');
    // ---- objetos ordenados por y ----
    type Obj = { y: number; draw: () => void };
    const objs: Obj[] = [];
    for (const m of g.machines.list) {
      const b = m.def.behavior;
      if (b === 'belt' || b === 'platform') continue;
      const x = m.tx * TILE, y = m.ty * TILE;
      const w = m.def.w * TILE, h = m.def.h * TILE;
      if (x > R || x + w < L || y - 60 > B || y + h < T) continue;
      objs.push({ y: y + h, draw: () => this.drawMachine(m) });
    }
    for (const r of g.robots.list) {
      if (r.x < L - 20 || r.x > R + 20 || r.y < T - 20 || r.y > B + 20) continue;
      objs.push({ y: r.y, draw: () => {
        ctx.drawImage(g.sprites.robot(r.kind, Math.floor(r.frame) % 2), Math.round(r.x - 6), Math.round(r.y - 10));
        if (r.stuck || r.broken || r.energy <= 0) this.alert(r.x, r.y - 14, r.stuck ? '#ffd27a' : '#ff5a3a');
        g.lighting.add(r.x, r.y - 4, 26, [255, 210, 150], 0.5);
        if (r.name === 'KILO') { ctx.fillStyle = '#ffd27a'; ctx.font = `${7}px monospace`; }
      } });
    }
    for (const a of g.lore.artifacts) {
      if (a.x < L - 20 || a.x > R + 20 || a.y < T - 20 || a.y > B + 20) continue;
      if (!g.lore.visible(a)) continue;
      objs.push({ y: a.y + 4, draw: () => {
        ctx.drawImage(g.sprites.artifact(a.kind), a.x - 6, a.y - 12 + Math.sin(this.time * 2 + a.id) * 0.5);
        g.lighting.add(a.x, a.y - 6, 40, [60, 230, 240], 0.75 + 0.2 * Math.sin(this.time * 3 + a.id));
      } });
    }
    for (const c of g.chests.list) {
      if (c.x < L - 20 || c.x > R + 20 || c.y < T - 20 || c.y > B + 20 || !g.chests.visible(c)) continue;
      objs.push({ y: c.y + 4, draw: () => {
        const bob = Math.sin(this.time * 2.5 + c.id) * 0.8;
        ctx.drawImage(g.sprites.chest(), Math.round(c.x - 7), Math.round(c.y - 12 + bob));
        g.lighting.add(c.x, c.y - 6, 46, [255, 210, 110], 0.8 + 0.15 * Math.sin(this.time * 3 + c.id));
        if (Math.random() < 0.04) g.fx.ember(c.x + (Math.random() - 0.5) * 10, c.y - 8, [255, 220, 120]);
      } });
    }
    for (const an of g.events.anomalies) {
      if (an.x < L - 30 || an.x > R + 30 || an.y < T - 30 || an.y > B + 30) continue;
      objs.push({ y: an.y, draw: () => {
        const s = 6 + Math.sin(this.time * 4) * 2;
        ctx.fillStyle = 'rgba(190,120,255,0.8)';
        for (let i = 0; i < 6; i++) { const a = this.time * 1.5 + i; ctx.fillRect(an.x + Math.cos(a) * s * 1.6 - 1, an.y - 10 + Math.sin(a) * s - 1, 2, 2); }
        ctx.fillStyle = '#fff'; ctx.fillRect(an.x - 1, an.y - 11, 3, 3);
        g.lighting.add(an.x, an.y - 10, 70, [180, 100, 255], 0.9);
      } });
    }
    const cargo = g.player.cargo;
    if (cargo) objs.push({ y: cargo.y, draw: () => {
      ctx.fillStyle = '#e8962a'; ctx.fillRect(cargo.x - 4, cargo.y - 6, 8, 6); ctx.fillStyle = '#1c1e24'; ctx.fillRect(cargo.x - 3, cargo.y - 5, 6, 1);
      g.lighting.add(cargo.x, cargo.y - 4, 30, [255, 180, 80], 0.8); this.alert(cargo.x, cargo.y - 12, '#ffb04a');
    } });
    for (const d of g.mining.drops) {
      if (d.x < L || d.x > R || d.y < T || d.y > B) continue;
      objs.push({ y: d.y, draw: () => {
        ctx.drawImage(g.sprites.item(d.k, 8), Math.round(d.x - 4), Math.round(d.y - 6 + Math.sin(this.time * 4 + d.x) * 1));
        const c = ITEM[d.k]?.color; if (c) g.lighting.add(d.x, d.y - 3, 10, c, 0.4);
      } });
    }
    for (const e of g.mining.explosives) {
      objs.push({ y: e.y, draw: () => {
        ctx.fillStyle = '#e83a2a'; ctx.fillRect(e.x - 2, e.y - 4, 4, 4);
        if (Math.floor(e.t * 6) % 2) { ctx.fillStyle = '#fff'; ctx.fillRect(e.x, e.y - 6, 1, 2); g.lighting.add(e.x, e.y, 30, [255, 60, 40], 0.9); }
      } });
    }
    for (const s of g.flares) {
      objs.push({ y: s.y, draw: () => { ctx.fillStyle = '#ffb04a'; ctx.fillRect(s.x - 1, s.y - 3, 2, 3); g.lighting.add(s.x, s.y - 2, 90, [255, 170, 80], 0.95); if (Math.random() < 0.2) g.fx.ember(s.x, s.y - 3, [255, 180, 80]); } });
    }
    // jogador
    const p = g.player;
    objs.push({ y: p.y + 2, draw: () => {
      if (p.invuln > 0 && Math.floor(this.time * 10) % 2) return;
      ctx.drawImage(g.sprites.player(p.facing === 2 ? 2 : 0, p.frame, p.suit.termico ?? 0), Math.round(p.x - 6), Math.round(p.y - 16));
      if (p.jet > 0) { g.fx.ember(p.x + (p.facing === 2 ? 3 : -3), p.y - 4, [255, 170, 60]); g.lighting.add(p.x, p.y - 2, 26, [255, 160, 60], 0.7); }
    } });
    objs.sort((a, b) => a.y - b.y);
    for (const o of objs) o.draw();

    this.mark('objects');
    // ---- feixe de mineração ----
    if (g.mining.hitting) {
      const hx = g.mining.hitX, hy = g.mining.hitY;
      const sx = p.x + (p.facing === 0 ? 4 : p.facing === 2 ? -4 : 0), sy = p.y - 6;
      // cor e largura do feixe mudam com a classe do perfurador: a melhoria se vê
      const BEAM: [number, number, number][] = [[255, 170, 60], [255, 220, 70], [80, 220, 255], [90, 255, 160], [200, 110, 255], [255, 250, 210]];
      const lv = Math.min(5, p.drillLevel), bc = BEAM[lv], bw = 2 + lv * 0.7;
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(${bc[0]},${bc[1]},${bc[2]},${0.6 + Math.random() * 0.3})`; ctx.lineWidth = bw;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,230,0.9)'; ctx.lineWidth = 0.8 + lv * 0.25;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hx + (Math.random() - 0.5) * 2, hy + (Math.random() - 0.5) * 2); ctx.stroke();
      const hs = 4 + lv; ctx.fillStyle = `rgba(${bc[0]},${bc[1]},${bc[2]},0.9)`; ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
      ctx.globalCompositeOperation = 'source-over';
      g.lighting.add(hx, hy, 60 + lv * 10, bc, 1);
      g.lighting.add(sx, sy, 30, [255, 200, 120], 0.6);
    }
    g.fx.draw(ctx);

    // ---- fantasma de construção ----
    this.drawBuildGhost();

    // ---- luz do jogador ----
    g.lighting.add(p.x, p.y - 6, 85 + p.scannerLevel * 5, [255, 225, 190], 0.85);
    const [ax, ay] = [g.input.worldX - p.x, g.input.worldY - p.y];
    const al = Math.hypot(ax, ay) || 1;
    g.lighting.add(p.x + (ax / al) * 55, p.y + (ay / al) * 55, 70, [255, 235, 200], 0.6);

    this.mark('fx');
    // ---- iluminação ----
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const storm = g.events.storm > 0 ? 0.15 : 0;
    const finalDark = g.flags.finalSeq ? 0.1 + 0.1 * Math.sin(this.time * 3) : 0;
    // escuridão cresce com a profundidade (a superfície da Terra é dia)
    const surfPx = g.world.gen.landing.y * CELL;
    g.lighting.render(L, T, z, W, H, sd.ambient, Math.min(0.95, 0.55 + sd.darkness + storm + finalDark), surfPx, g.planet.layer === 1 ? storm + finalDark : Math.min(0.8, 0.3 + sd.darkness));
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(g.lighting.dark, 0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(g.lighting.glow, 0, 0, W, H);
    ctx.setTransform(z, 0, 0, z, -L * z, -T * z);
    g.fx.drawGlow(ctx);
    ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    this.mark('light');
    // ---- névoa de guerra ----
    ctx.imageSmoothingEnabled = false;

    // ---- textos em espaço de tela ----
    this.drawOverlayTexts(L, T, z);

    this.mark('fogtext');
    if (g.events.storm > 0) { ctx.fillStyle = 'rgba(150,100,70,0.18)'; ctx.fillRect(0, 0, W, H); }
    if (g.fx.screenFlash) { ctx.fillStyle = rgba(g.fx.screenFlash.c, g.fx.screenFlash.a); ctx.fillRect(0, 0, W, H); }
  }

  /** Esteira vista de lado: estrutura, roletes girando e lona; os grãos andam por cima (são terreno). */
  private drawBelt(m: Machine, x: number, y: number) {
    const ctx = this.ctx;
    const tier = m.key === 'esteira3' ? 2 : m.key === 'esteira2' ? 1 : 0;
    const frame = tier === 2 ? '#7a3aa0' : tier === 1 ? '#2a6aa0' : '#b8742a';
    const d = m.dir === 2 ? -1 : 1;
    ctx.fillStyle = '#2a2c33'; ctx.fillRect(x, y, 16, 6);                  // lona
    ctx.fillStyle = frame; ctx.fillRect(x, y + 6, 16, 3);                 // longarina
    ctx.fillStyle = '#16171c'; ctx.fillRect(x + 2, y + 9, 2, 7); ctx.fillRect(x + 12, y + 9, 2, 7); // pés
    const sp = (m.def.speed ?? 1) * (m.broken ? 0 : 1);
    const off = (((this.time * sp * 24 * d) % 4) + 4) % 4;
    ctx.fillStyle = '#4a4e58';
    for (let k = -4; k < 20; k += 4) { const o = k + off; if (o >= 0 && o < 15) ctx.fillRect(x + o, y + 1, 1, 4); }
    ctx.fillStyle = '#6a6e78'; ctx.fillRect(x, y, 16, 1);
    // seta da direção
    ctx.fillStyle = '#ffd04a'; ctx.fillRect(x + (d > 0 ? 11 : 4), y + 7, 1, 1);
    if (m.state.startsWith('Travada') && Math.floor(this.time * 2) % 2) { ctx.fillStyle = 'rgba(255,60,40,0.45)'; ctx.fillRect(x, y, 16, 9); }
  }

  /** Céu da superfície (dia) ou o vazio escavado das camadas de baixo, com morros em paralaxe. */
  private drawSky(L: number, T: number, z: number, W: number, H: number) {
    const ctx = this.ctx, g = this.g;
    const surfY = (g.world.gen.landing.y * CELL - T) * z;
    const layer = g.planet.layer;
    const SK: [string, string, string][] = [
      ['#4f8fd0', '#9ccbe8', '#f0c890'], ['#1c2430', '#33404c', '#5a5450'], ['#1a0806', '#3a120a', '#7a2a10'],
      ['#06101e', '#10243a', '#2a4a66'], ['#0c0818', '#1c1230', '#3a2450'], ['#04141a', '#0a2a30', '#1a4a50'], ['#200a02', '#4a1806', '#a04010'],
    ];
    const [a, b, c] = SK[layer - 1] ?? SK[0];
    const gr = ctx.createLinearGradient(0, surfY - H, 0, surfY);
    gr.addColorStop(0, a); gr.addColorStop(0.7, b); gr.addColorStop(1, c);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    // morros/paredões distantes em duas camadas de paralaxe
    const hillCol = layer === 1 ? ['#6a86a0', '#4c6478'] : ['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.55)'];
    for (let k = 0; k < 2; k++) {
      const par = 0.25 + k * 0.25, amp = (k ? 26 : 40) * z, base = surfY + (k ? 6 : -4) * z;
      ctx.fillStyle = hillCol[k];
      ctx.beginPath(); ctx.moveTo(0, H);
      for (let sx = 0; sx <= W; sx += 8) {
        const wx = (L * par + sx / z) * 0.01;
        const hy = base - (Math.sin(wx * (1.3 + k)) * 0.5 + Math.sin(wx * 0.37 + k * 2) * 0.5 + 1) * amp;
        ctx.lineTo(sx, hy);
      }
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    }
    if (layer === 1) {
      // sol baixo e algumas nuvens
      ctx.fillStyle = 'rgba(255,230,170,0.9)'; ctx.beginPath(); ctx.arc(W * 0.78 - L * 0.02 * z, surfY - 150 * z, 16 * z, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (let i = 0; i < 6; i++) { const cx = ((i * 260 - L * 0.12 + this.time * 3) % (W / z + 200) + W / z + 200) % (W / z + 200) - 100; ctx.fillRect(cx * z, surfY - (90 + (i * 37) % 70) * z, (40 + (i * 13) % 30) * z, 5 * z); }
    }
    void WORLD_PX_W;
  }

  private drawMachine(m: Machine) {
    const g = this.g, ctx = this.ctx;
    const { img, oy } = g.sprites.machine(m.def, m.dir, m.def.behavior === 'complex' ? m.level : m.def.key.endsWith('2') ? 1 : m.def.key.endsWith('3') ? 2 : 0);
    const x = m.tx * TILE, y = m.ty * TILE - oy;
    if (m.def.behavior === 'drill') this.drawDrillBit(m);
    ctx.drawImage(img, x, y);
    const [cx, cy] = g.machines.centerPx(m);
    if (m.broken) { ctx.fillStyle = 'rgba(30,0,0,0.45)'; ctx.fillRect(x, y, img.width, img.height); if (Math.random() < 0.15) g.fx.smoke(cx, cy - 6, [80, 80, 80]); }
    if (m.buried > 0) {
      ctx.fillStyle = `rgba(96,82,70,${0.6 + m.buried * 0.4})`;
      for (let i = 0; i < m.def.w * 4; i++) for (let j = 0; j < m.def.h * 3; j++) ctx.fillRect(x + i * 4 + ((j * 7) % 3), m.ty * TILE + j * 5 - 6, 4, 5);
    }
    // vida
    if (m.working && m.def.glow) {
      const pulse = 0.75 + 0.25 * Math.sin(this.time * 3 + m.id);
      g.lighting.add(cx, cy - oy * 0.5, 30 + m.def.w * 10, m.def.glow, 0.6 * pulse);
      if ((m.def.heat ?? 0) > 2 && Math.random() < 0.06) g.fx.smoke(x + img.width * 0.8, y + 4);

    } else if (m.def.glow && !m.broken) g.lighting.add(cx, cy - oy * 0.4, 18 + m.def.w * 4, m.def.glow, 0.25);
    if (m.def.behavior === 'lamp' && !m.broken) g.lighting.add(cx, cy - 10, 110, [255, 200, 130], 0.8);
    if (m.def.behavior === 'command') g.lighting.add(cx, cy, 120, [255, 190, 120], 0.55);
    if (m.def.behavior === 'reactor' && m.working && Math.random() < 0.1) g.fx.smoke(cx, y + 6, [220, 220, 220]);
    // alertas
    if (m.broken || m.overheat || m.buried > 0 || m.state.startsWith('Sem energia')) this.alert(cx, y - 4, m.broken ? '#ff4a3a' : m.overheat ? '#ff9a2a' : '#ffd04a');
    else if (m.exhausted || m.state === 'Saída cheia' || (m.eff < 0.6 && m.def.behavior === 'complex')) this.alert(cx, y - 4, '#ffd04a');
  }

  /** Haste e broca girando, entrando no buraco até a frente de escavação. */
  private drawDrillBit(m: Machine) {
    const ctx = this.ctx;
    const [dx, dy] = DIRS[m.dir];
    const w = m.def.w * TILE, h = m.def.h * TILE;
    const cx = m.tx * TILE + w / 2, cy = m.ty * TILE + h / 2;
    const ex = dx ? (dx > 0 ? m.tx * TILE + w : m.tx * TILE) : cx, ey = dy ? (dy > 0 ? m.ty * TILE + h : m.ty * TILE) : cy;
    const len = Math.min(m.depth, 60) * CELL + 2;
    const spin = Math.floor(this.time * (m.working ? 20 : 0)) % 4;
    // haste
    for (let k = 0; k < len; k += 2) {
      const px = ex + dx * k, py = ey + dy * k;
      ctx.fillStyle = (k / 2 + spin) % 2 ? '#5a5e68' : '#7a7e8a';
      if (dx) ctx.fillRect(px, py - 2, 2, 4); else ctx.fillRect(px - 2, py, 4, 2);
    }
    // broca (cone com espiral)
    const bx = ex + dx * len, by = ey + dy * len;
    for (let k = 0; k < 9; k++) {
      const half = 5 - k * 0.55;
      ctx.fillStyle = (k + spin) % 2 ? '#c8ccd6' : '#e8962a';
      if (dx) ctx.fillRect(bx + dx * k, by - half, 1, half * 2); else ctx.fillRect(bx - half, by + dy * k, half * 2, 1);
    }
    if (m.working && Math.random() < 0.4) this.g.fx.sparks(bx + dx * 9, by + dy * 9, [255, 200, 120], 1);
  }

  private alert(x: number, y: number, col: string) {
    const ctx = this.ctx;
    const b = Math.floor(this.time * 3) % 2 ? 0 : -1;
    ctx.fillStyle = '#000'; ctx.fillRect(x - 3, y - 9 + b, 7, 9);
    ctx.fillStyle = col; ctx.fillRect(x - 2, y - 8 + b, 5, 7);
    ctx.fillStyle = '#000'; ctx.fillRect(x, y - 7 + b, 1, 3); ctx.fillRect(x, y - 3 + b, 1, 1);
    this.g.lighting.add(x, y - 4, 20, [255, 120, 60], 0.6);
  }

  private drawBuildGhost() {
    const g = this.g, ctx = this.ctx;
    const b = g.build;
    if (!b.active) return;
    const tx = b.deconstruct ? Math.floor(g.input.worldX / TILE) : b.tx;
    const ty = b.deconstruct ? Math.floor(g.input.worldY / TILE) : b.ty;
    if (b.deconstruct) {
      const m = g.machines.at(tx, ty);
      ctx.strokeStyle = 'rgba(255,80,60,0.9)'; ctx.lineWidth = 1;
      if (m) ctx.strokeRect(m.tx * TILE + 0.5, m.ty * TILE + 0.5, m.def.w * TILE - 1, m.def.h * TILE - 1);
      else ctx.strokeRect(tx * TILE + 0.5, ty * TILE + 0.5, TILE - 1, TILE - 1);
      return;
    }
    const def = MACHINE[b.key!];
    if (!def) return;
    if (def.behavior === 'belt') {
      // linha de esteiras: cada tile com a seta da direção
      for (const [px, py, dir] of g.beltPath()) {
        const ex = g.machines.at(px, py);
        const ok = ex?.belt || !g.machines.canPlace(def, px, py);
        ctx.globalAlpha = 0.65; this.drawBelt({ ...(ex ?? {}), def, dir, broken: false, belt: [], state: '', key: def.key } as any, px * TILE, py * TILE); ctx.globalAlpha = 1;
        ctx.fillStyle = ok ? 'rgba(80,255,120,0.22)' : 'rgba(255,60,40,0.35)';
        ctx.fillRect(px * TILE, py * TILE, TILE, TILE);
        const [dx, dy] = DIRS[dir];
        ctx.strokeStyle = '#ffd04a'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(px * TILE + 8 - dx * 4, py * TILE + 8 - dy * 4); ctx.lineTo(px * TILE + 8 + dx * 5, py * TILE + 8 + dy * 5); ctx.stroke();
        ctx.fillStyle = '#ffd04a'; ctx.fillRect(px * TILE + 7 + dx * 5, py * TILE + 7 + dy * 5, 3, 3);
      }
      if (b.anchor) { ctx.strokeStyle = '#ffd04a'; ctx.strokeRect(b.anchor[0] * TILE + 0.5, b.anchor[1] * TILE + 0.5, TILE - 1, TILE - 1); }
      return;
    }
    const ox = tx - Math.floor((def.w - 1) / 2), oy = ty - Math.floor((def.h - 1) / 2);
    const err = g.machines.canPlace(def, ox, oy);
    const tooFar = Math.hypot((ox + def.w / 2) * TILE - g.player.x, (oy + def.h / 2) * TILE - g.player.y) > 260;
    const afford = g.stock.has(def.cost, g.pack.items);
    const { img, oy: ex } = g.sprites.machine(def, b.dir);
    ctx.globalAlpha = 0.6;
    ctx.drawImage(img, ox * TILE, oy * TILE - ex);
    ctx.globalAlpha = 1;
    ctx.fillStyle = err || tooFar ? 'rgba(255,60,40,0.28)' : afford ? 'rgba(80,255,120,0.22)' : 'rgba(255,200,40,0.25)';
    ctx.fillRect(ox * TILE, oy * TILE, def.w * TILE, def.h * TILE);
    if (def.behavior === 'storage') {
      const cmd = g.machines.list.find(m => m.def.behavior === 'command');
      if (cmd) { const [cx, cy] = g.machines.centerPx(cmd); ctx.strokeStyle = 'rgba(255,200,80,0.45)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(cx, cy, BASE_RADIUS * TILE, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    }
    if (def.radius) {
      ctx.strokeStyle = 'rgba(120,220,255,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc((ox + def.w / 2) * TILE, (oy + def.h / 2) * TILE, def.radius * TILE, 0, Math.PI * 2); ctx.stroke();
    }
    if (def.rotatable) {
      const [dx, dy] = DIRS[b.dir];
      const cx = (ox + def.w / 2) * TILE, cy = (oy + def.h / 2) * TILE;
      ctx.strokeStyle = '#ffd04a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + dx * 14, cy + dy * 14); ctx.stroke();
      if (def.behavior === 'drill') {
        const rng = def.key === 'perfuradora' ? 28 : def.key === 'perfuradora2' ? 40 : 56;
        ctx.strokeStyle = 'rgba(255,200,80,0.4)';
        const w = 12 * CELL, d = rng * CELL;
        const fx = dx > 0 ? (ox + def.w) * TILE : dx < 0 ? ox * TILE - d : ox * TILE - 2 * CELL;
        const fy = dy > 0 ? (oy + def.h) * TILE : dy < 0 ? oy * TILE - d : oy * TILE - 2 * CELL;
        ctx.strokeRect(fx, fy, dx ? d : w, dy ? d : w);
      }
    }
  }

  private drawOverlayTexts(L: number, T: number, z: number) {
    const g = this.g, ctx = this.ctx;
    const dpr = this.canvas.width / window.innerWidth;
    const toS = (x: number, y: number): [number, number] => [(x - L) * z, (y - T) * z];
    ctx.textAlign = 'center';
    ctx.font = `600 ${Math.round(11 * dpr)}px Rajdhani, system-ui, sans-serif`;
    for (const t of g.fx.texts) {
      const [x, y] = toS(t.x, t.y);
      const a = Math.min(1, 1.4 - t.life);
      ctx.fillStyle = `rgba(0,0,0,${a * 0.7})`; ctx.fillText(t.text, x + 1, y + 1);
      ctx.fillStyle = rgba(t.c, a); ctx.fillText(t.text, x, y);
    }
    // rótulos de scanner (nível 2+)
    ctx.font = `600 ${Math.round(10 * dpr)}px Rajdhani, system-ui, sans-serif`;
    for (const m of g.scanner.marks) {
      if (m.level < 1 || m.n < 2) continue;
      const age = g.time - m.t; if (age > 12) continue;
      const [x, y] = toS(m.x, m.y - 12);
      ctx.fillStyle = `rgba(0,0,0,0.6)`; ctx.fillText(g.scanner.label(m), x + 1, y + 1);
      ctx.fillStyle = `rgba(200,240,255,${1 - age / 12})`; ctx.fillText(g.scanner.label(m), x, y);
    }
    // prompt de interação
    const h = g.hover;
    if (h && !g.build.active) {
      const [x, y] = toS(h.x, h.y - 18);
      ctx.font = `700 ${Math.round(12 * dpr)}px Rajdhani, system-ui, sans-serif`;
      const w = ctx.measureText(h.label).width + 16 * dpr;
      ctx.fillStyle = 'rgba(8,14,22,0.85)'; ctx.fillRect(x - w / 2, y - 14 * dpr, w, 19 * dpr);
      ctx.strokeStyle = 'rgba(232,150,42,0.9)'; ctx.strokeRect(x - w / 2 + 0.5, y - 14 * dpr + 0.5, w - 1, 19 * dpr - 1);
      ctx.fillStyle = '#ffd08a'; ctx.fillText(h.label, x, y);
    }
    ctx.textAlign = 'left';
  }
}
