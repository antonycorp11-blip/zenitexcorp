import { CELL, CHUNK_PX, TILE, TILE_CELLS, WORLD_CW, WORLD_PX_W } from '../core/constants';
import { hash2 } from '../core/rng';
import { DIRS } from '../core/math';
import { MATERIALS } from '../data/materials';
import { SECTORS } from '../data/sectors';
import { ITEM } from '../data/items';
import { MACHINE, type MachineDef } from '../data/machines';
import { ioSpec } from '../data/howto';
import { SPRITE_K } from './SideSprites';
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
    const dpr = Math.min(2, window.devicePixelRatio || 1); // HD: resolução real da tela
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.width = Math.floor(w * dpr); this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.g.camera.w = this.canvas.width; this.g.camera.h = this.canvas.height;
    this.g.lighting.resize(this.canvas.width, this.canvas.height);
    const z = Math.max(1.8, Math.min(3, h / 200)) * dpr;   // vista lateral: perto o bastante para ver os grãos
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
    ctx.imageSmoothingEnabled = true;
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

    // grãos em voo (soprados ou arremessados)
    for (const f of g.world.flyers) {
      if (f.x < L || f.x > R || f.y < T || f.y > B) continue;
      const c = MATERIALS[f.m]?.top ?? [200, 200, 200];
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      ctx.fillRect(Math.floor(f.x), Math.floor(f.y), CELL, CELL);
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
      const pi = g.sprites.machine(m.def, 0).img; ctx.drawImage(pi, x, y - 2, pi.width / SPRITE_K, pi.height / SPRITE_K);
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
        const ri = g.sprites.robot(r.kind, Math.floor(this.time * 20) % 2); ctx.drawImage(ri, Math.round(r.x - 8), Math.round(r.y - 12 + Math.sin(this.time * 3 + r.id) * 1.5), ri.width / SPRITE_K, ri.height / SPRITE_K);
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
        const ci = g.sprites.chest(); ctx.drawImage(ci, Math.round(c.x - 8), Math.round(c.y - 12 + bob), ci.width / SPRITE_K, ci.height / SPRITE_K);
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
      const left = p.facing === 2;
      const body = g.sprites.player(0, p.frame, p.suit.termico ?? 0, p.jet > 0);
      const bx = Math.round(p.x), by = Math.round(p.y - 22);
      ctx.save();
      ctx.translate(bx, by);
      if (left) ctx.scale(-1, 1);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(body, -8, 0, body.width / SPRITE_K, body.height / SPRITE_K);
      ctx.restore();
      // braço com o perfurador apontando para a mira (ou para a frente)
      const sx = p.x + (left ? -1 : 1), sy = p.y - 12;
      let ang = left ? Math.PI : 0;
      if (g.mining.hitting) ang = Math.atan2(g.mining.hitY - sy, g.mining.hitX - sx);
      else if (g.mining.blowing) ang = Math.atan2(g.input.worldY - sy, g.input.worldX - sx);
      ctx.save(); ctx.translate(Math.round(sx), Math.round(sy)); ctx.rotate(ang);
      if (Math.abs(ang) > Math.PI / 2) ctx.scale(1, -1);
      const armImg = g.sprites.arm(p.drillLevel);
      ctx.drawImage(armImg, 0, -3, armImg.width / SPRITE_K, armImg.height / SPRITE_K);
      ctx.restore();
      ctx.imageSmoothingEnabled = true;
      if (p.jet > 0) { g.fx.ember(p.x + (p.facing === 2 ? 3 : -3), p.y - 4, [255, 170, 60]); g.lighting.add(p.x, p.y - 2, 26, [255, 160, 60], 0.7); }
    } });
    objs.sort((a, b) => a.y - b.y);
    for (const o of objs) o.draw();

    this.drawRockets();
    this.drawBlueprint();
    this.drawIO(L, T, R, B);
    this.mark('objects');
    // ---- feixe de mineração ----
    if (g.mining.hitting) {
      const hx = g.mining.hitX, hy = g.mining.hitY;
      const s0x = p.x + (p.facing === 2 ? -1 : 1), s0y = p.y - 12;
      const ang = Math.atan2(hy - s0y, hx - s0x);
      const sx = s0x + Math.cos(ang) * 13, sy = s0y + Math.sin(ang) * 13;
      const BEAM: [number, number, number][] = [[255, 170, 60], [255, 220, 70], [80, 220, 255], [90, 255, 160], [200, 110, 255], [255, 250, 210]];
      const lv = Math.min(5, p.drillLevel), bc = BEAM[lv];
      const dist = Math.hypot(hx - sx, hy - sy);
      // cone do aspirador (translúcido) + grãos sendo puxados
      const spread = 7 + lv;
      const nx = -Math.sin(ang), ny = Math.cos(ang);
      ctx.fillStyle = 'rgba(160,220,255,0.10)';
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hx + nx * spread, hy + ny * spread); ctx.lineTo(hx - nx * spread, hy - ny * spread); ctx.closePath(); ctx.fill();
      for (let k = 0; k < 5; k++) {
        const t = ((this.time * 2.2 + k / 5) % 1);
        const off = Math.sin(k * 7.3 + this.time * 3) * spread * (1 - t);
        ctx.fillStyle = 'rgba(210,240,255,0.55)';
        ctx.fillRect(hx + (sx - hx) * t + nx * off, hy + (sy - hy) * t + ny * off, 1, 1);
      }
      // feixe de corte
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(${bc[0]},${bc[1]},${bc[2]},${0.55 + Math.random() * 0.3})`; ctx.lineWidth = 1.6 + lv * 0.5;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,235,0.95)'; ctx.lineWidth = 0.6 + lv * 0.2;
      ctx.beginPath(); ctx.moveTo(sx, sy);
      const segs = Math.max(2, Math.floor(dist / 8));
      for (let k = 1; k <= segs; k++) { const t = k / segs; ctx.lineTo(sx + (hx - sx) * t + (Math.random() - 0.5) * (k < segs ? 1.5 : 0), sy + (hy - sy) * t + (Math.random() - 0.5) * (k < segs ? 1.5 : 0)); }
      ctx.stroke();
      const hs = 3 + lv * 0.7 + Math.random() * 1.5; ctx.fillStyle = `rgba(${bc[0]},${bc[1]},${bc[2]},0.9)`; ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
      ctx.fillStyle = 'rgba(255,255,240,0.9)'; ctx.fillRect(hx - 1, hy - 1, 2, 2);
      ctx.globalCompositeOperation = 'source-over';
      g.lighting.add(hx, hy, 60 + lv * 10, bc, 1);
      g.lighting.add(sx, sy, 26, bc, 0.7);
    }
    g.fx.draw(ctx);

    // ---- fantasma de construção ----
    this.drawBuildGhost();

    // ---- luz do jogador ----
    g.lighting.add(p.x, p.y - 10, 120 + p.scannerLevel * 8, [255, 230, 200], 0.95);
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
    g.lighting.render(L, T, z, W, H, sd.ambient, Math.min(0.92, 0.4 + sd.darkness + storm + finalDark), surfPx, g.planet.layer === 1 ? storm + finalDark : Math.min(0.8, 0.3 + sd.darkness));
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
    this.post(W, H, (g.world.gen.landing.y * CELL - T) * z, g.planet.layer);
    ctx.imageSmoothingEnabled = true;

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

  /** Céu atmosférico (superfície) ou caverna gigante com neblina (camadas de baixo), com paralaxe suave. */
  private drawSky(L: number, T: number, z: number, W: number, H: number) {
    const ctx = this.ctx, g = this.g;
    const surfY = (g.world.gen.landing.y * CELL - T) * z;
    const layer = g.planet.layer;
    ctx.imageSmoothingEnabled = true;
    if (layer === 1) {
      const gr = ctx.createLinearGradient(0, surfY - 420 * z, 0, surfY + 10 * z);
      gr.addColorStop(0, '#2f6fc2'); gr.addColorStop(0.5, '#6aa8e0'); gr.addColorStop(0.82, '#b6d8ee'); gr.addColorStop(1, '#f0dcb8');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      // sol com brilho atmosférico
      const sx = W * 0.74 - L * 0.02 * z, sy = surfY - 190 * z;
      const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 160 * z);
      sg.addColorStop(0, 'rgba(255,250,230,1)'); sg.addColorStop(0.06, 'rgba(255,244,210,0.95)'); sg.addColorStop(0.12, 'rgba(255,226,170,0.45)'); sg.addColorStop(0.4, 'rgba(255,214,160,0.12)'); sg.addColorStop(1, 'rgba(255,214,160,0)');
      ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);
      // nuvens suaves em duas profundidades
      for (let i = 0; i < 8; i++) {
        const par = i < 4 ? 0.05 : 0.12;
        const span = W / z + 600;
        const cxw = (((i * 377 - L * par + this.time * (1.5 + (i % 3))) % span) + span) % span - 300;
        const cyw = surfY / z - 150 - ((i * 53) % 130) - (i < 4 ? 60 : 0);
        this.softCloud(cxw * z, cyw * z, (i < 4 ? 0.7 : 1.1) * z, i % 3, i < 4 ? 0.55 : 0.85);
      }
    } else {
      const SK: [string, string, string][] = [
        ['', '', ''], ['#0b0f14', '#1b232c', '#3a3a38'], ['#0e0302', '#2a0c06', '#6a2410'],
        ['#03070e', '#0a1a2c', '#1e3a56'], ['#06030c', '#140c24', '#2c1c40'], ['#020a0d', '#06202a', '#123a40'], ['#140601', '#3a1204', '#8a3410'],
      ];
      const [a2, b2, c2] = SK[layer - 1];
      const gr = ctx.createLinearGradient(0, surfY - 300 * z, 0, surfY);
      gr.addColorStop(0, a2); gr.addColorStop(0.6, b2); gr.addColorStop(1, c2);
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    }
    // cordilheiras com perspectiva aérea (as de trás somem na névoa)
    const ridges = layer === 1
      ? [['#88a6c2', '#bccfdd'], ['#5b7891', '#93abbd'], ['#3b5263', '#6c8394']]
      : [['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.05)'], ['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.15)'], ['rgba(0,0,0,0.75)', 'rgba(0,0,0,0.3)']];
    for (let k = 0; k < 3; k++) {
      const zz = Math.min(z, 1.3);
      const par = 0.12 + k * 0.16, amp = [62, 44, 28][k] * zz / z, base = surfY + [-10, -2, 6][k] * z;
      const gr = ctx.createLinearGradient(0, base - amp * 1.8 * z, 0, base);
      gr.addColorStop(0, ridges[k][0]); gr.addColorStop(1, ridges[k][1]);
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.moveTo(0, H);
      for (let sx = 0; sx <= W + 4; sx += 4) {
        const wx = L * par + sx / z;
        const hgt = (Math.sin(wx * 0.005 * (1 + k * 0.3)) * 0.45 + Math.sin(wx * 0.013 + k * 2) * 0.28 + Math.abs(Math.sin(wx * 0.031 + k)) * 0.22 + 0.85) * amp;
        ctx.lineTo(sx, base - hgt * z);
      }
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
      if (k === 1) {
        // torres da Zenitex na névoa
        for (let t = 0; t < 3; t++) {
          const span = W / z + 500;
          const wx = (((t * 610 + 240 - L * par) % span) + span) % span - 250;
          const q = z * 0.5, bx = wx * z, by = base - amp * 0.95 * z;
          ctx.fillStyle = layer === 1 ? 'rgba(110,130,150,0.7)' : 'rgba(0,0,0,0.5)';
          ctx.fillRect(bx, by - 52 * q, 5 * q, 64 * q); ctx.fillRect(bx - 10 * q, by - 34 * q, 25 * q, 2.5 * q); ctx.fillRect(bx + 11 * q, by - 26 * q, 2.5 * q, 34 * q);
          if (Math.floor(this.time * 1.2 + t) % 2) { ctx.fillStyle = 'rgba(255,90,60,0.9)'; ctx.beginPath(); ctx.arc(bx + 2.5 * q, by - 54 * q, 1.6 * q, 0, 7); ctx.fill(); }
        }
      }
    }
    // névoa do horizonte
    const hz = ctx.createLinearGradient(0, surfY - 60 * z, 0, surfY + 4 * z);
    hz.addColorStop(0, 'rgba(255,255,255,0)'); hz.addColorStop(1, layer === 1 ? 'rgba(240,226,200,0.55)' : 'rgba(120,90,70,0.12)');
    ctx.fillStyle = hz; ctx.fillRect(0, surfY - 60 * z, W, 64 * z);
    if (layer > 1) {
      // teto rochoso com estalactites e partículas em suspensão
      ctx.fillStyle = '#040507';
      ctx.beginPath(); ctx.moveTo(0, 0);
      for (let sx = 0; sx <= W + 6; sx += 6) {
        const wx = L * 0.3 + sx / z;
        const hang = (Math.sin(wx * 0.05) * 0.5 + 0.5) * 18 + Math.max(0, Math.sin(wx * 0.37) * Math.sin(wx * 0.11)) * 40;
        ctx.lineTo(sx, surfY - 260 * z + hang * z);
      }
      ctx.lineTo(W, 0); ctx.closePath(); ctx.fill();
      const mote = SECTORS[layer - 1].accent;
      for (let i = 0; i < 30; i++) {
        const mx = ((hash2(i, 1, 9) * W + this.time * 5 * (i % 3 + 1)) % W), my = surfY - (30 + hash2(i, 2, 9) * 220) * z + Math.sin(this.time + i) * 4 * z;
        ctx.globalAlpha = 0.25 + 0.25 * Math.sin(this.time * 2 + i);
        ctx.fillStyle = mote; ctx.beginPath(); ctx.arc(mx, my, (1 + (i % 3) * 0.6) * z * 0.6, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.imageSmoothingEnabled = true;
    void WORLD_PX_W;
  }

  private clouds: HTMLCanvasElement[] = [];
  /** nuvem macia (vários gradientes radiais), pré-renderizada */
  private softCloud(x: number, y: number, s: number, v: number, alpha: number) {
    if (!this.clouds.length) {
      for (let k = 0; k < 3; k++) {
        const c = document.createElement('canvas'); c.width = 220; c.height = 80;
        const x2 = c.getContext('2d')!;
        for (let i = 0; i < 14; i++) {
          const px = 30 + hash2(i, k, 4) * 160, py = 40 + (hash2(i, k, 5) - 0.5) * 24, r = 18 + hash2(i, k, 6) * 22;
          const gr = x2.createRadialGradient(px, py - r * 0.3, 0, px, py, r);
          gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.6, 'rgba(240,244,250,0.6)'); gr.addColorStop(1, 'rgba(220,228,240,0)');
          x2.fillStyle = gr; x2.beginPath(); x2.arc(px, py, r, 0, 7); x2.fill();
        }
        // base sombreada
        const sh = x2.createLinearGradient(0, 30, 0, 80); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(120,140,170,0.35)');
        x2.globalCompositeOperation = 'source-atop'; x2.fillStyle = sh; x2.fillRect(0, 0, 220, 80);
        this.clouds.push(c);
      }
    }
    const c = this.clouds[v % this.clouds.length];
    this.ctx.globalAlpha = alpha;
    this.ctx.drawImage(c, x, y, 220 * s * 0.6, 80 * s * 0.6);
    this.ctx.globalAlpha = 1;
  }

  /** pós-processamento: raios de sol, vinheta e correção de cor */
  private post(W: number, H: number, surfScreenY: number, layer: number) {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (layer === 1 && surfScreenY > -40) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) {
        const x = W * (0.45 + i * 0.13) + Math.sin(this.time * 0.2 + i) * 20;
        const gr = ctx.createLinearGradient(x, 0, x - 120, surfScreenY);
        gr.addColorStop(0, 'rgba(255,236,190,0.07)'); gr.addColorStop(1, 'rgba(255,236,190,0)');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 40, 0); ctx.lineTo(x - 80, surfScreenY); ctx.lineTo(x - 160, surfScreenY); ctx.closePath(); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    // correção de cor: quente em cima, fria embaixo
    ctx.globalCompositeOperation = 'soft-light';
    const cg = ctx.createLinearGradient(0, 0, 0, H);
    cg.addColorStop(0, layer === 1 ? 'rgba(255,214,160,0.25)' : 'rgba(255,170,110,0.15)'); cg.addColorStop(1, 'rgba(80,110,150,0.18)');
    ctx.fillStyle = cg; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    // vinheta
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }

  private drawMachine(m: Machine) {
    const g = this.g, ctx = this.ctx;
    const { img, oy } = g.sprites.machine(m.def, m.dir, m.def.behavior === 'complex' ? m.level : m.def.key.endsWith('2') ? 1 : m.def.key.endsWith('3') ? 2 : 0);
    // máquinas trabalhando tremem (peneiras, britadores, prensas)
    const shake = m.working && ['separator', 'prep', 'compactor'].includes(m.def.behavior) ? (Math.floor(this.time * 24 + m.id) % 2 ? 1 : 0) : 0;
    const x = m.tx * TILE + shake, y = m.ty * TILE - oy;
    if (m.def.behavior === 'drill') this.drawDrillBit(m);
    // sombra de contato no chão
    const bw = m.def.w * TILE, by0 = (m.ty + m.def.h) * TILE;
    const cs = ctx.createRadialGradient(m.tx * TILE + bw / 2, by0, 0, m.tx * TILE + bw / 2, by0, bw * 0.7);
    cs.addColorStop(0, 'rgba(0,0,0,0.45)'); cs.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cs; ctx.fillRect(m.tx * TILE - bw * 0.2, by0 - 4, bw * 1.4, 7);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, x, y, img.width / SPRITE_K, img.height / SPRITE_K);
    ctx.imageSmoothingEnabled = true;
    this.animate(m, x, y + oy);
    if (m.working && m.def.behavior === 'compactor' && Math.random() < 0.08) g.fx.dust(x + m.def.w * 8, m.ty * TILE + 8, 2);
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

  private rockets: { x: number; y: number; v: number }[] = [];
  private rocketT = 0;
  /** detalhes animados por cima do sprite (x, y = canto da pegada) */
  private animate(m: Machine, x: number, y: number) {
    const ctx = this.ctx, g = this.g, d = m.def, t = this.time;
    const W = d.w * TILE, H = d.h * TILE;
    if (d.behavior === 'separator' && m.working) {
      // grãos descendo pela peneira inclinada: minerais (azul) e resíduo (marrom)
      const wx = x + 4, wy = y + 7, ww = W - 8, wh = H - 16, right = m.dir !== 2;
      for (let i = 0; i < 7; i++) {
        const k = (t * 0.9 + i / 7) % 1;
        const gx = wx + (right ? k : 1 - k) * ww, gy = wy + wh * 0.25 + k * wh * 0.5 - 1 + (i % 2 ? Math.sin(t * 30 + i) * 0.5 : 0);
        ctx.fillStyle = i % 3 === 0 ? '#5ab0ff' : '#9a8470';
        ctx.fillRect(gx, gy, 1.2, 1.2);
        if (i % 3 !== 0 && k > 0.4) { ctx.fillStyle = '#9a8470'; ctx.fillRect(gx, gy + 2 + (k - 0.4) * wh * 0.6, 1, 1); }
      }
    } else if (d.behavior === 'prep' && m.working && d.key !== 'descompressor' && d.key !== 'desintegrador') {
      const cy = y + 8 + (H - 18) / 2;
      for (const [cx, dirn] of [[x + W / 2 - 5, 1], [x + W / 2 + 5, -1]] as [number, number][]) {
        ctx.strokeStyle = 'rgba(40,40,46,0.9)'; ctx.lineWidth = 0.8;
        for (let k = 0; k < 3; k++) { const a = t * 8 * dirn + k * Math.PI / 3; ctx.beginPath(); ctx.moveTo(cx - Math.cos(a) * 3.5, cy - Math.sin(a) * 3.5); ctx.lineTo(cx + Math.cos(a) * 3.5, cy + Math.sin(a) * 3.5); ctx.stroke(); }
      }
    } else if ((d.key === 'descompressor' || d.key === 'desintegrador') && m.working) {
      const r = H * 0.14 * (1 + Math.sin(t * 6) * 0.25);
      ctx.fillStyle = `rgba(${(d.glow ?? [255, 200, 120]).join(',')},0.5)`; ctx.beginPath(); ctx.arc(x + W / 2, y + H / 2, r, 0, 7); ctx.fill();
    } else if (d.behavior === 'compactor') {
      const k = m.working ? (Math.sin(t * 5) * 0.5 + 0.5) : 0;
      ctx.fillStyle = '#c47a22'; ctx.fillRect(x + W / 2 - 7, y + 11 + k * 5, 14, 3);
      ctx.fillStyle = '#e8a040'; ctx.fillRect(x + W / 2 - 7, y + 11 + k * 5, 14, 1);
    } else if (d.behavior === 'refinery' && m.working && Math.random() < 0.15) {
      g.fx.smoke(x + W - 9, y - 22, [90, 90, 96]);
    } else if (d.behavior === 'storage') {
      const r = g.sectors.rt[m.sector];
      const f = r.bufCap > 0 ? Math.min(1, Object.values(r.buffer).reduce((a, b) => a + b, 0) / r.bufCap) : 0;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x + W - 4, y + 4, 3, H - 8);
      ctx.fillStyle = f > 0.9 ? '#ff5a3a' : '#7aff8a'; ctx.fillRect(x + W - 3.5, y + 4 + (H - 8) * (1 - f), 2, (H - 8) * f);
    } else if (d.behavior === 'terminal') {
      this.rocketT -= 1 / 60;
      if (g.machines.blockFlow > 50 && this.rocketT <= 0 && this.rockets.length < 3) { this.rockets.push({ x: x + W / 2 + 2, y: y - 30, v: 0 }); this.rocketT = 9; }
    }
  }

  /** foguetes de carga decolando com os blocos exportados */
  private drawRockets() {
    const ctx = this.ctx, g = this.g;
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.v += 40 / 60; r.y -= r.v / 60 * 4;
      ctx.fillStyle = '#e8eaf0'; ctx.fillRect(r.x - 3, r.y, 6, 18);
      ctx.fillStyle = '#e8962a'; ctx.fillRect(r.x - 3, r.y + 4, 6, 2);
      ctx.beginPath(); ctx.moveTo(r.x - 3, r.y); ctx.lineTo(r.x, r.y - 5); ctx.lineTo(r.x + 3, r.y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = `rgba(255,${180 + Math.random() * 60},80,0.9)`; ctx.fillRect(r.x - 2, r.y + 18, 4, 4 + Math.random() * 6);
      g.fx.smoke(r.x, r.y + 24, [210, 210, 210]);
      g.lighting.add(r.x, r.y + 22, 50, [255, 180, 80], 0.9);
      if (r.y < g.camera.top() - 400) this.rockets.splice(i, 1);
    }
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
    ctx.drawImage(img, ox * TILE, oy * TILE - ex, img.width / SPRITE_K, img.height / SPRITE_K);
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
    this.ioHints(def, ox, oy, b.dir);
  }

  /**
   * Indicadores permanentes perto do jogador: funil (o que entra), calhas (o que sai, com ícone e seta animada)
   * e uma luz de estado. Assim cada máquina diz sozinha como usá-la.
   */
  private drawIO(L: number, T: number, R: number, B: number) {
    const g = this.g, ctx = this.ctx, p = g.player;
    const near = g.build.active ? 9999 : 230;
    for (const m of g.machines.list) {
      const d = m.def, bh = d.behavior;
      if (bh === 'belt' || bh === 'lamp' || bh === 'support' || bh === 'platform') continue;
      if (!g.build.active && (bh === 'command' || bh === 'terminal' || bh === 'analyzer')) continue;   // fixos da base: sem poluir
      const x0 = m.tx * TILE, y0 = m.ty * TILE, W = d.w * TILE, H = d.h * TILE;
      if (x0 > R || x0 + W < L || y0 > B || y0 + H < T) continue;
      const [cx, cy] = g.machines.centerPx(m);
      if (Math.hypot(cx - p.x, cy - p.y) > near) continue;
      const io = ioSpec(d, m.dir, g.planet.layer);
      const ex = g.sprites.machine(d, m.dir).oy;
      const t = this.time;
      // entrada
      if (io.inTop) {
        const bx = x0 + W / 2, by = y0 - ex - 9 + Math.sin(t * 4 + m.id) * 1;
        this.badge(bx, by, io.inTop === 'tudo' ? null : io.inTop.slice(0, 2), '#3ad06a', 'down');
      }
      // saídas
      for (const o of io.outs) {
        const right = o.side === 0;
        const sx = right ? x0 + W + 2 : x0 - 2, sy = y0 + H - 6;
        const col = o.label.startsWith('minerais') ? '#4aa8ff' : '#ff9a2a';
        // seta animada saindo
        const k = (t * 1.6 + m.id * 0.3) % 1;
        ctx.globalAlpha = m.working ? 0.9 : 0.45;
        for (let j = 0; j < 2; j++) {
          const kk = (k + j * 0.5) % 1, ax = sx + (right ? 1 : -1) * (2 + kk * 10);
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.moveTo(ax + (right ? 4 : -4), sy); ctx.lineTo(ax, sy - 3); ctx.lineTo(ax, sy + 3); ctx.closePath(); ctx.fill();
        }
        ctx.globalAlpha = 1;
        if (o.keys.length) this.badge(sx + (right ? 18 : -18), sy - 9, o.keys.slice(0, 2), col, right ? 'right' : 'left');
      }
      // luz de estado
      const st = m.broken || m.state.startsWith('Travada') || m.state.startsWith('Saída') ? '#ff4a3a' : m.working ? '#3aff6a' : '#ffd04a';
      const lx = x0 + W - 3, ly = y0 - ex + 2;
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(lx, ly, 2.6, 0, 7); ctx.fill();
      ctx.fillStyle = st; ctx.beginPath(); ctx.arc(lx, ly, 1.8, 0, 7); ctx.fill();
      g.lighting.add(lx, ly, 10, st === '#3aff6a' ? [60, 255, 100] : st === '#ff4a3a' ? [255, 60, 40] : [255, 200, 60], 0.5);
      if (io.base && g.machines.atBase(m)) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x0 + 1, y0 - ex - 1, 15, 6); ctx.fillStyle = '#9ad8ff'; ctx.font = '5px monospace'; ctx.fillText('BASE', x0 + 2, y0 - ex + 4); }
    }
  }

  /** projeto guiado: onde construir a próxima peça (tracejado verde, nome, direção) */
  private drawBlueprint() {
    const g = this.g, ctx = this.ctx;
    const it = g.ui.tutorial.currentBp();
    if (!it || g.blueprint.placed(it.id)) return;
    const d = MACHINE[it.key];
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 4);
    ctx.save();
    ctx.setLineDash([3, 2]); ctx.lineWidth = 1.2; ctx.strokeStyle = `rgba(120,255,150,${0.6 + pulse * 0.4})`;
    if (it.key === 'esteira') {
      const x0 = Math.min(it.tx, it.tx2!) * TILE, x1 = (Math.max(it.tx, it.tx2!) + 1) * TILE, y = it.ty * TILE;
      ctx.fillStyle = `rgba(120,255,150,${0.12 + pulse * 0.1})`; ctx.fillRect(x0, y, x1 - x0, TILE);
      ctx.strokeRect(x0, y, x1 - x0, TILE);
      ctx.setLineDash([]);
      // setas de fluxo andando para o armazém + marcadores de início e fim
      const dir = it.dir === 2 ? -1 : 1;
      for (let k = 0; k < (x1 - x0) / 10; k++) {
        const ax = (dir < 0 ? x1 : x0) + dir * (((this.time * 18) % 10) + k * 10);
        if (ax < x0 || ax > x1) continue;
        ctx.fillStyle = 'rgba(160,255,180,0.9)'; ctx.beginPath(); ctx.moveTo(ax + dir * 4, y + 8); ctx.lineTo(ax, y + 5); ctx.lineTo(ax, y + 11); ctx.closePath(); ctx.fill();
      }
      for (const [tx, n] of [[it.tx, '1'], [it.tx2!, '2']] as [number, string][]) {
        const cx = (tx + 0.5) * TILE, cy = y - 7;
        ctx.fillStyle = '#1a3a22'; ctx.beginPath(); ctx.arc(cx, cy, 4.5, 0, 7); ctx.fill();
        ctx.strokeStyle = '#7aff8a'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#d8ffe0'; ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(n, cx, cy + 2.2);
      }
      ctx.textAlign = 'left';
    } else {
      const x = it.tx * TILE, y = it.ty * TILE, W = d.w * TILE, H = d.h * TILE;
      ctx.fillStyle = `rgba(120,255,150,${0.12 + pulse * 0.12})`; ctx.fillRect(x, y, W, H);
      ctx.strokeRect(x + 0.5, y + 0.5, W - 1, H - 1);
      ctx.setLineDash([]);
      if (d.rotatable) {
        const [dx, dy] = DIRS[it.dir];
        const cx = x + W / 2, cy = y + H / 2;
        ctx.strokeStyle = '#7aff8a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx - dx * 6, cy - dy * 6); ctx.lineTo(cx + dx * 8, cy + dy * 8); ctx.stroke();
        ctx.fillStyle = '#7aff8a'; ctx.beginPath(); ctx.moveTo(cx + dx * 13, cy + dy * 13); ctx.lineTo(cx + dx * 7 - dy * 5, cy + dy * 7 + dx * 5); ctx.lineTo(cx + dx * 7 + dy * 5, cy + dy * 7 - dx * 5); ctx.closePath(); ctx.fill();
      }
    }
    // etiqueta
    const lx = (it.key === 'esteira' ? (it.tx + it.tx2!) / 2 + 0.5 : it.tx + d.w / 2) * TILE, ly = it.key === 'esteira' ? it.ty * TILE - 16 : (it.ty + d.h / 2) * TILE + 2;   // dentro do quadrado: não briga com o rótulo de toque
    ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'center';
    const tw = ctx.measureText(it.label).width + 8;
    ctx.fillStyle = 'rgba(10,30,16,0.88)'; ctx.fillRect(lx - tw / 2, ly - 7, tw, 9);
    ctx.fillStyle = '#9cffb0'; ctx.fillText(it.label, lx, ly);
    ctx.restore();
  }

  /** etiqueta com ícones de itens e uma seta (direção do fluxo) */
  private badge(x: number, y: number, keys: string[] | null, col: string, arrow: 'down' | 'left' | 'right') {
    const ctx = this.ctx, g = this.g;
    const n = keys ? keys.length : 1;
    const w = 4 + n * 9 + 6, h = 11;
    const bx = Math.round(x - w / 2), by = Math.round(y - h / 2);
    ctx.fillStyle = 'rgba(8,12,18,0.82)'; ctx.fillRect(bx, by, w, h);
    ctx.fillStyle = col; ctx.fillRect(bx, by, w, 1); ctx.fillRect(bx, by + h - 1, w, 1);
    if (keys) keys.forEach((k, i) => ctx.drawImage(g.sprites.item(k, 8), bx + 2 + i * 9, by + 1.5));
    else { ctx.fillStyle = '#e8eef4'; ctx.font = '6px monospace'; ctx.fillText('★', bx + 3, by + 8); }
    ctx.fillStyle = col;
    const ax = bx + w - 5, ay = by + h / 2;
    ctx.beginPath();
    if (arrow === 'down') { ctx.moveTo(ax - 2.5, ay - 2); ctx.lineTo(ax + 2.5, ay - 2); ctx.lineTo(ax, ay + 2.5); }
    else if (arrow === 'right') { ctx.moveTo(ax - 2, ay - 2.5); ctx.lineTo(ax - 2, ay + 2.5); ctx.lineTo(ax + 2.5, ay); }
    else { ctx.moveTo(ax + 2, ay - 2.5); ctx.lineTo(ax + 2, ay + 2.5); ctx.lineTo(ax - 2.5, ay); }
    ctx.closePath(); ctx.fill();
  }

  /** setas de entrada (funil) e saída (calha) na prévia de construção */
  private ioHints(def: MachineDef, ox: number, oy: number, dir: number) {
    const ctx = this.ctx;
    const bh = def.behavior;
    const W = def.w * TILE, H = def.h * TILE, x0 = ox * TILE, y0 = oy * TILE;
    const bob = Math.sin(this.time * 6) * 1.5;
    const tri = (x: number, y: number, ddx: number, ddy: number, col: string) => {
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.moveTo(x + ddx * 6, y + ddy * 6); ctx.lineTo(x - ddy * 5 - ddx * 2, y + ddx * 5 - ddy * 2); ctx.lineTo(x + ddy * 5 - ddx * 2, y - ddx * 5 - ddy * 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(x + ddx * 5, y + ddy * 5); ctx.lineTo(x - ddy * 4 - ddx * 1.5, y + ddx * 4 - ddy * 1.5); ctx.lineTo(x + ddy * 4 - ddx * 1.5, y - ddx * 4 - ddy * 1.5); ctx.closePath(); ctx.fill();
    };
    const takesGrains = ['separator', 'prep', 'compactor', 'storage', 'link', 'command', 'riser', 'launcher', 'terminal'].includes(bh);
    if (takesGrains) tri(x0 + W / 2, y0 - 10 + bob, 0, 1, '#7aff8a');                  // funil: entra por cima
    const right = dir !== 2;
    const outSide = (r: boolean, col: string) => tri(r ? x0 + W + 7 + bob : x0 - 7 - bob, y0 + H - 6, r ? 1 : -1, 0, col);
    if (bh === 'drill' || bh === 'complex') outSide(!(dir === 0), '#ffb04a');
    else if (bh === 'separator') outSide(right, '#6ab4ff');
    else if (bh === 'prep' || bh === 'compactor' || bh === 'refinery' || bh === 'launcher') outSide(right, '#ffb04a');
    if (bh === 'drill') {
      const [dx, dy] = DIRS[dir];
      const rng = (def.key === 'perfuradora' ? 56 : def.key === 'perfuradora2' ? 80 : 112) * CELL;
      const w = (def.w * TILE_CELLS + 4) * CELL;
      const fx = dx > 0 ? x0 + W : dx < 0 ? x0 - rng : x0 + W / 2 - w / 2;
      const fy = dy > 0 ? y0 + H : dy < 0 ? y0 - rng : y0 + H / 2 - w / 2;
      ctx.strokeStyle = 'rgba(255,200,80,0.55)'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
      ctx.strokeRect(fx, fy, dx ? rng : w, dy ? rng : w); ctx.setLineDash([]);
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
      const label = g.input.touch ? h.label.replace(/^\[E\]\s*/, 'TOQUE ▸ ') : h.label;
      ctx.font = `700 ${Math.round(12 * dpr)}px Rajdhani, system-ui, sans-serif`;
      const w = ctx.measureText(label).width + 16 * dpr;
      ctx.fillStyle = 'rgba(8,14,22,0.85)'; ctx.fillRect(x - w / 2, y - 14 * dpr, w, 19 * dpr);
      ctx.strokeStyle = 'rgba(232,150,42,0.9)'; ctx.strokeRect(x - w / 2 + 0.5, y - 14 * dpr + 0.5, w - 1, 19 * dpr - 1);
      ctx.fillStyle = '#ffd08a'; ctx.fillText(label, x, y);
    }
    ctx.textAlign = 'left';
  }
}
