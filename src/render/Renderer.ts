import { fabVal } from '../data/factory';
import { CELL, CHUNK_PX, TILE, TILE_CELLS, WORLD_CW, WORLD_PX_W, wrapX, nearestX } from '../core/constants';
import { hash2 } from '../core/rng';
import { DIRS } from '../core/math';
import { MATERIALS } from '../data/materials';
import { SECTORS } from '../data/sectors';
import { ITEM } from '../data/items';
import { MACHINE, type MachineDef } from '../data/machines';
import { ioSpec } from '../data/howto';
import { SPRITE_K, paintPlayer } from './SideSprites';
import type { Game } from '../Game';
import { BASE_RADIUS, type Machine } from '../systems/Machines';
import { renderPlanet } from '../ui/Orbital';

type C3 = readonly number[];
const rgba = (c: C3, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

export class Renderer {
  ctx: CanvasRenderingContext2D;
  private fog: HTMLCanvasElement; private fctx: CanvasRenderingContext2D;
  private fogImg: ImageData | null = null;
  private time = 0;
  private orbitCache: { canvas: HTMLCanvasElement; time: number; layer: number } | null = null;
  private dtR = 0.016; private walkPh = 0; private stride = 0; private lean = 0; private armA = 0;
  private resolutionScale = 1;
  private actualDpr = 0;
  private qualityTime = 0; private qualityFrames = 0; private qualityBusy = 0; private qualityGap = 0;
  prof: Record<string, number> = {};
  private pt = 0;
  private mark(k: string) { const n = performance.now(); this.prof[k] = (this.prof[k] ?? 0) * 0.9 + (n - this.pt) * 0.1; this.pt = n; }
  private screenX(x: number) { return nearestX(x, this.g.camera.x); }
  private wrapDraw(x: number, draw: () => void) {
    return () => { this.ctx.save(); this.ctx.translate(this.screenX(x) - x, 0); draw(); this.ctx.restore(); };
  }

  constructor(private g: Game, private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.fog = document.createElement('canvas');
    this.fctx = this.fog.getContext('2d')!;
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    if ((memory && memory <= 4) || navigator.hardwareConcurrency <= 4) this.resolutionScale = window.devicePixelRatio > 1 ? 0.85 : 1;
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1) * this.resolutionScale;
    const oldDpr = this.actualDpr;
    this.actualDpr = dpr;
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.width = Math.floor(w * dpr); this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.g.camera.w = this.canvas.width; this.g.camera.h = this.canvas.height;
    this.g.lighting.scale = this.resolutionScale < 0.85 ? 0.4 : this.resolutionScale < 1 ? 0.45 : 0.5;
    this.g.lighting.resize(this.canvas.width, this.canvas.height);
    const z = Math.max(1.8, Math.min(3, h / 200)) * dpr;   // vista lateral: perto o bastante para ver os grãos
    if (!this.g.flags.userZoom) { this.g.camera.targetZoom = z; this.g.camera.zoom = z; }
    else if (oldDpr && oldDpr !== dpr) { this.g.camera.zoom *= dpr / oldDpr; this.g.camera.targetZoom *= dpr / oldDpr; }
  }

  /** Reduz pixels processados só após lentidão persistente; recupera nitidez quando sobra tempo. */
  recordFrame(gap: number, busyMs: number) {
    if (document.hidden || this.g.offline || gap <= 0 || gap > 5) return;
    const frameGap = Math.min(gap, 0.25);
    this.qualityTime += frameGap;
    this.qualityGap += frameGap;
    this.qualityBusy += busyMs;
    this.qualityFrames++;
    if (this.qualityTime < (this.resolutionScale < 1 ? 6 : 3)) return;
    const avgGap = this.qualityGap / this.qualityFrames, avgBusy = this.qualityBusy / this.qualityFrames;
    this.qualityTime = this.qualityGap = this.qualityBusy = this.qualityFrames = 0;
    const next = avgGap > 0.038 || avgBusy > 24 ? (this.resolutionScale === 1 ? 0.85 : 0.7)
      : avgGap < 0.021 && avgBusy < 12 ? (this.resolutionScale === 0.7 ? 0.85 : 1) : this.resolutionScale;
    if (next !== this.resolutionScale) { this.resolutionScale = next; this.resize(); }
  }

  draw(dt: number) {
    const g = this.g, ctx = this.ctx, cam = g.camera;
    this.time += dt; this.dtR = Math.min(0.05, dt);
    g.terrain.frame++;
    const W = this.canvas.width, H = this.canvas.height;
    if (cam.targetZoom <= 0.55 * this.actualDpr) { this.drawOrbit(W, H); return; }
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
    const pcx = cam.x / CHUNK_PX, pcy = g.player.y / CHUNK_PX;
    order.sort((a, b) => Math.hypot(a[0] + 0.5 - pcx, a[1] + 0.5 - pcy) - Math.hypot(b[0] + 0.5 - pcx, b[1] + 0.5 - pcy));
    for (const [cx, cy] of order) {
      const sourceCx = wrapX(cx, WORLD_CW);
      const k = cy * WORLD_CW + sourceCx;
      const needs = g.world.dirty.has(k) || !g.terrain.get(sourceCx, cy, false);
      const ch = g.terrain.get(sourceCx, cy, needs && budget-- > 0);
      if (!ch) continue;
      ctx.drawImage(ch.canvas, cx * CHUNK_PX, cy * CHUNK_PX, CHUNK_PX, CHUNK_PX);
      if (ch.lights.length) {
        if (!ch.baked) ch.baked = g.lighting.bake(ch.lights, sourceCx * CHUNK_PX, cy * CHUNK_PX, CHUNK_PX);
        g.lighting.addBaked(ch.baked, cx * CHUNK_PX, cy * CHUNK_PX, CHUNK_PX, 0.88 + 0.12 * Math.sin(this.time * 1.7 + cx * 3 + cy * 7));
      }
    }

    // grãos em voo (soprados ou arremessados)
    for (const f of g.world.flyers) {
      const x = this.screenX(f.x);
      if (x < L || x > R || f.y < T || f.y > B) continue;
      const c = MATERIALS[f.m]?.top ?? [200, 200, 200];
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      ctx.fillRect(Math.floor(x), Math.floor(f.y), CELL, CELL);
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
      ctx.strokeRect(this.screenX(m.x) - r, m.y - r, r * 2, r * 2);
      g.lighting.add(m.x, m.y, 20, col, 0.4 * a);
    }
    for (const r of g.scanner.rings) {
      ctx.strokeStyle = `rgba(120,220,255,${0.5 * (1 - r.r / r.max)})`;
      ctx.lineWidth = 2 / z;
      ctx.beginPath(); ctx.arc(this.screenX(r.x), r.y, r.r, 0, Math.PI * 2); ctx.stroke();
    }

    // ---- esteiras (chão) ----
    for (const m of g.machines.list) {
      if (m.def.behavior !== 'belt') continue;
      const x = this.screenX(m.tx * TILE), y = m.ty * TILE;
      if (x > R || x + TILE < L || y > B || y + TILE < T) continue;
      this.drawBelt(m, x, y);
    }
    // pisos orbitais: campo antigravidade embaixo (cone suave pulsando)
    for (const m of g.machines.list) if (m.key === 'piso_orbital') {
      const x = this.screenX(m.tx * TILE), y = m.ty * TILE;
      if (x > R || x + TILE < L || y > B || y + TILE < T) continue;
      const pulse = 0.55 + 0.25 * Math.sin(this.time * 3 + m.tx * 0.7);
      const gr = ctx.createLinearGradient(0, y + 9, 0, y + 22);
      gr.addColorStop(0, `rgba(120,220,255,${0.45 * pulse})`); gr.addColorStop(1, 'rgba(120,220,255,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(x + 6, y + 9); ctx.lineTo(x + 10, y + 9); ctx.lineTo(x + 13, y + 22); ctx.lineTo(x + 3, y + 22); ctx.closePath(); ctx.fill();
      if ((m.tx & 1) === 0) g.lighting.add(x + 8, y + 10, 22, [110, 210, 255], 0.35 * pulse);
    }
    for (const m of g.machines.list) if (m.def.behavior === 'platform') {
      const x = this.screenX(m.tx * TILE), y = m.ty * TILE;
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
      const x = this.screenX(m.tx * TILE), y = m.ty * TILE;
      const w = m.def.w * TILE, h = m.def.h * TILE;
      if (x > R || x + w < L || y - 60 > B || y + h < T) continue;
      // empilhadas: as de cima desenham por cima das de baixo (funil do coletor não cobre a peneira)
      objs.push({ y: b === 'tube' ? -200000 - y : -100000 - y, draw: this.wrapDraw(m.tx * TILE, () => b === 'tube' ? this.drawTube(m) : this.drawMachine(m)) });
    }
    const drop = g.capsuleDrop;
    if (drop) objs.push({ y: -50000, draw: this.wrapDraw(drop.tx * TILE, () => {
      // cápsula descendo com retrofoguetes, freando perto do piso
      const def = MACHINE.comando, { img, oy } = g.sprites.machine(def, 0);
      const k = Math.min(1, drop.t / 3.2), fall = Math.pow(1 - k, 2.2) * 700;
      const x = drop.tx * TILE, y = drop.ty * TILE - oy - fall, cx = x + def.w * TILE / 2, by = y + oy + def.h * TILE;
      const fl = 10 + Math.random() * 8 + (1 - k) * 10;
      const gr = ctx.createLinearGradient(0, by - 2, 0, by + fl);
      gr.addColorStop(0, 'rgba(255,250,220,0.95)'); gr.addColorStop(0.4, 'rgba(255,170,60,0.85)'); gr.addColorStop(1, 'rgba(255,90,30,0)');
      ctx.fillStyle = gr;
      for (const ox of [-12, 12]) { ctx.beginPath(); ctx.moveTo(cx + ox - 4, by - 2); ctx.lineTo(cx + ox + 4, by - 2); ctx.lineTo(cx + ox, by + fl); ctx.closePath(); ctx.fill(); }
      ctx.drawImage(img, x, y, img.width / SPRITE_K, img.height / SPRITE_K);
      g.lighting.add(cx, by + 4, 120, [255, 170, 80], 1);
      if (Math.random() < 0.5) g.fx.smoke(cx + (Math.random() - 0.5) * 30, by + fl * 0.6, [190, 170, 150]);
    }) });
    for (const r of g.robots.list) {
      const x = this.screenX(r.x);
      if (x < L - 20 || x > R + 20 || r.y < T - 20 || r.y > B + 20) continue;
      objs.push({ y: r.y, draw: this.wrapDraw(r.x, () => {
        const ri = g.sprites.robot(r.kind, Math.floor(this.time * 20) % 2); ctx.drawImage(ri, Math.round(r.x - 8), Math.round(r.y - 12 + Math.sin(this.time * 3 + r.id) * 1.5), ri.width / SPRITE_K, ri.height / SPRITE_K);
        if (r.stuck || r.broken || r.energy <= 0) this.alert(r.x, r.y - 14, r.stuck ? '#ffd27a' : '#ff5a3a');
        g.lighting.add(r.x, r.y - 4, 26, [255, 210, 150], 0.5);
        if (r.name === 'KILO') { ctx.fillStyle = '#ffd27a'; ctx.font = `${7}px monospace`; }
      }) });
    }
    for (const a of g.lore.artifacts) {
      const x = this.screenX(a.x);
      if (x < L - 20 || x > R + 20 || a.y < T - 20 || a.y > B + 20) continue;
      if (!g.lore.visible(a)) continue;
      objs.push({ y: a.y + 4, draw: this.wrapDraw(a.x, () => {
        ctx.drawImage(g.sprites.artifact(a.kind), a.x - 6, a.y - 12 + Math.sin(this.time * 2 + a.id) * 0.5);
        g.lighting.add(a.x, a.y - 6, 40, [60, 230, 240], 0.75 + 0.2 * Math.sin(this.time * 3 + a.id));
      }) });
    }
    for (const c of g.chests.list) {
      const x = this.screenX(c.x);
      if (x < L - 20 || x > R + 20 || c.y < T - 20 || c.y > B + 20 || !g.chests.visible(c)) continue;
      objs.push({ y: c.y + 4, draw: this.wrapDraw(c.x, () => {
        const bob = Math.sin(this.time * 2.5 + c.id) * 0.8;
        const ci = g.sprites.chest(); ctx.drawImage(ci, Math.round(c.x - 8), Math.round(c.y - 12 + bob), ci.width / SPRITE_K, ci.height / SPRITE_K);
        g.lighting.add(c.x, c.y - 6, 46, [255, 210, 110], 0.8 + 0.15 * Math.sin(this.time * 3 + c.id));
        if (Math.random() < 0.04) g.fx.ember(c.x + (Math.random() - 0.5) * 10, c.y - 8, [255, 220, 120]);
      }) });
    }
    for (const an of g.events.anomalies) {
      const x = this.screenX(an.x);
      if (x < L - 30 || x > R + 30 || an.y < T - 30 || an.y > B + 30) continue;
      objs.push({ y: an.y, draw: this.wrapDraw(an.x, () => {
        const s = 6 + Math.sin(this.time * 4) * 2;
        ctx.fillStyle = 'rgba(190,120,255,0.8)';
        for (let i = 0; i < 6; i++) { const a = this.time * 1.5 + i; ctx.fillRect(an.x + Math.cos(a) * s * 1.6 - 1, an.y - 10 + Math.sin(a) * s - 1, 2, 2); }
        ctx.fillStyle = '#fff'; ctx.fillRect(an.x - 1, an.y - 11, 3, 3);
        g.lighting.add(an.x, an.y - 10, 70, [180, 100, 255], 0.9);
      }) });
    }
    const cargo = g.player.cargo;
    if (cargo) objs.push({ y: cargo.y, draw: this.wrapDraw(cargo.x, () => {
      ctx.fillStyle = '#e8962a'; ctx.fillRect(cargo.x - 4, cargo.y - 6, 8, 6); ctx.fillStyle = '#1c1e24'; ctx.fillRect(cargo.x - 3, cargo.y - 5, 6, 1);
      g.lighting.add(cargo.x, cargo.y - 4, 30, [255, 180, 80], 0.8); this.alert(cargo.x, cargo.y - 12, '#ffb04a');
    }) });
    for (const d of g.mining.drops) {
      const x = this.screenX(d.x);
      if (x < L || x > R || d.y < T || d.y > B) continue;
      objs.push({ y: d.y, draw: this.wrapDraw(d.x, () => {
        ctx.drawImage(g.sprites.item(d.k, 8), Math.round(d.x - 4), Math.round(d.y - 6 + Math.sin(this.time * 4 + d.x) * 1));
        const c = ITEM[d.k]?.color; if (c) g.lighting.add(d.x, d.y - 3, 10, c, 0.4);
      }) });
    }
    for (const e of g.mining.explosives) {
      objs.push({ y: e.y, draw: this.wrapDraw(e.x, () => {
        ctx.fillStyle = '#e83a2a'; ctx.fillRect(e.x - 2, e.y - 4, 4, 4);
        if (Math.floor(e.t * 6) % 2) { ctx.fillStyle = '#fff'; ctx.fillRect(e.x, e.y - 6, 1, 2); g.lighting.add(e.x, e.y, 30, [255, 60, 40], 0.9); }
      }) });
    }
    for (const s of g.flares) {
      objs.push({ y: s.y, draw: this.wrapDraw(s.x, () => { ctx.fillStyle = '#ffb04a'; ctx.fillRect(s.x - 1, s.y - 3, 2, 3); g.lighting.add(s.x, s.y - 2, 90, [255, 170, 80], 0.95); if (Math.random() < 0.2) g.fx.ember(s.x, s.y - 3, [255, 180, 80]); }) });
    }
    // jogador
    const p = g.player;
    objs.push({ y: p.y + 2, draw: this.wrapDraw(p.x, () => {
      if (p.invuln > 0 && Math.floor(this.time * 10) % 2) return;
      const left = p.facing === 2;
      // pose contínua: passo pela velocidade, inclinação no voo, braço que acompanha a mira
      const spd = Math.abs(p.vx), flying = !p.grounded && (p.jet > 0 || g.input.jetHeld);
      this.walkPh += (p.grounded ? spd * 0.11 : 0) * this.dtR;
      this.stride += ((p.grounded && spd > 8 ? Math.min(1, spd / 70) : 0) - this.stride) * Math.min(1, this.dtR * 10);
      const leanT = flying ? Math.max(-0.35, Math.min(0.35, p.vx / 420)) * (left ? -1 : 1) + 0.08 : 0;
      this.lean += (leanT - this.lean) * Math.min(1, this.dtR * 8);
      const bx = p.x, by = p.y - 22;
      ctx.save();
      ctx.translate(bx, by);
      if (left) ctx.scale(-1, 1);
      ctx.translate(-8, 0);
      ctx.imageSmoothingEnabled = true;
      const bob = paintPlayer(ctx, { phase: this.walkPh, stride: this.stride, jet: p.jet > 0, jetDX: p.jetDX * (left ? -1 : 1), jetDY: p.jetDY, jetPower: p.jetPower, flying, lean: this.lean, suitTier: p.suit.termico ?? 0, t: this.time });
      ctx.restore();
      // braço: mira no alvo (laser / soprar / joystick direito); parado, fica abaixado e balança com o passo
      const sx = p.x + (left ? -1.5 : 1.5), sy = p.y - 12.6 - bob;
      const fwd = left ? Math.PI : 0;
      let want: number;
      if (g.mining.hitting) want = Math.atan2(g.mining.hitY - sy, g.mining.hitX - sx);
      else if (g.mining.blowing || (g.input.touch ? g.input.aimActive : !g.build.active)) want = Math.atan2(g.input.worldY - sy, g.input.worldX - sx);
      else want = fwd + (left ? -1 : 1) * (flying ? 0.55 : 1.05 + Math.sin(this.walkPh) * 0.35 * this.stride);
      // ângulo suave (pelo caminho mais curto)
      let dA = want - this.armA; while (dA > Math.PI) dA -= Math.PI * 2; while (dA < -Math.PI) dA += Math.PI * 2;
      this.armA += dA * Math.min(1, this.dtR * 18);
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(this.armA);
      if (Math.cos(this.armA) < 0) ctx.scale(1, -1);
      const armImg = g.sprites.arm(p.drillLevel);
      ctx.drawImage(armImg, -1, -3.5, armImg.width / SPRITE_K, armImg.height / SPRITE_K);
      ctx.restore();
      // ombreira por cima do braço
      ctx.fillStyle = '#e4e9f1'; ctx.strokeStyle = 'rgba(10,12,18,0.95)'; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.arc(sx, sy, 2.1, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ec9628'; ctx.beginPath(); ctx.arc(sx, sy, 0.8, 0, 7); ctx.fill();
      ctx.imageSmoothingEnabled = true;
      if (p.jet > 0) g.lighting.add(p.x + (left ? 5 : -5), p.y - 5, 24 + p.jetPower * 16, [120, 210, 255], 0.55 + p.jetPower * 0.35);
    }) });
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

  /** O último nível do zoom mostra o corpo planetário inteiro no espaço. */
  private drawOrbit(W: number, H: number) {
    const ctx = this.ctx, g = this.g;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#020914'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 140; i++) {
      const x = hash2(i, 7, 19) * W, y = hash2(i, 13, 19) * H;
      ctx.fillStyle = `rgba(185,220,255,${0.12 + hash2(i, 4, 19) * 0.55})`;
      ctx.fillRect(x, y, i % 11 === 0 ? 2 : 1, i % 11 === 0 ? 2 : 1);
    }
    const size = Math.min(H * 0.82, W * 0.48, 540), cx = W / 2, cy = H / 2;
    const halo = ctx.createRadialGradient(cx, cy, size * 0.3, cx, cy, size * 0.65);
    halo.addColorStop(0, '#bc603b32'); halo.addColorStop(1, '#bc603b00');
    ctx.fillStyle = halo; ctx.fillRect(cx - size, cy - size, size * 2, size * 2);
    if (!this.orbitCache || this.orbitCache.layer !== g.planet.layer || this.time - this.orbitCache.time > 3) {
      this.orbitCache = { canvas: renderPlanet(g, 420, undefined, this.time), time: this.time, layer: g.planet.layer };
    }
    ctx.drawImage(this.orbitCache.canvas, cx - size / 2, cy - size / 2, size, size);
    ctx.textAlign = 'center'; ctx.fillStyle = '#d6e8ed';
    ctx.font = `bold ${Math.max(12, H * 0.033)}px Rajdhani, sans-serif`;
    ctx.fillText('ZENITEX · VISÃO ORBITAL', cx, cy - size / 2 - 9);
    ctx.font = `${Math.max(10, H * 0.026)}px Rajdhani, sans-serif`;
    ctx.fillText(`${SECTORS[g.planet.layer - 1].name} · ${((g.planet.fraction() || 0) * 100).toFixed(3)}% extraído`, cx, cy + size / 2 + 17);
    ctx.textAlign = 'start';
  }

  /** Esteira Vazada: grade de aço aberta (sem lona), furos com o brilho do fogo de baixo e calhas que despejam no Incinerador */
  private drawLeakyBelt(m: Machine, x: number, y: number) {
    const ctx = this.ctx, d = m.dir === 2 ? -1 : 1, t = this.time;
    const glow = 0.45 + 0.25 * Math.sin(t * 5 + m.tx);
    ctx.fillStyle = `rgba(255,120,40,${glow * 0.5})`; ctx.fillRect(x, y + 1, 16, 8);          // fogo visto pelos furos
    ctx.fillStyle = '#3c4048'; ctx.fillRect(x, y, 16, 1.5);                                 // trilho de cima
    // grade: barras inclinadas que correm no sentido da esteira
    const off = (((t * (m.def.speed ?? 1) * 18 * d) % 4) + 4) % 4;
    ctx.fillStyle = '#9aa3ad';
    for (let k = -4; k < 20; k += 4) { const o = k + off; if (o >= 0 && o < 15) ctx.fillRect(x + o, y + 1.5, 1.2, 4.5); }
    ctx.fillStyle = '#20232a'; ctx.fillRect(x, y + 6, 16, 2);                               // longarina escura
    ctx.fillStyle = '#e8b030'; for (let k = 0; k < 16; k += 4) ctx.fillRect(x + k, y + 6, 2, 2);   // faixa de perigo amarela/preta
    // calhas em funil despejando para baixo
    ctx.fillStyle = '#5a606a';
    for (const cx of [4, 12]) { ctx.beginPath(); ctx.moveTo(x + cx - 3, y + 8); ctx.lineTo(x + cx + 3, y + 8); ctx.lineTo(x + cx + 1, y + 13); ctx.lineTo(x + cx - 1, y + 13); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = `rgba(255,170,60,${glow})`; ctx.fillRect(x + 3, y + 13, 2, 3); ctx.fillRect(x + 11, y + 13, 2, 3);
    // seta da direção
    ctx.fillStyle = '#ffd47a'; ctx.beginPath(); const ax = x + 8, ay = y + 3.5; ctx.moveTo(ax + 3 * d, ay); ctx.lineTo(ax - 1 * d, ay - 2.5); ctx.lineTo(ax - 1 * d, ay + 2.5); ctx.closePath(); ctx.fill();
  }

  /** Esteira vista de lado: estrutura, roletes girando e lona; os grãos andam por cima (são terreno). */
  private drawBelt(m: Machine, x: number, y: number) {
    const ctx = this.ctx;
    if (m.def.leaky) { this.drawLeakyBelt(m, x, y); return; }
    const tier = m.key === 'esteira3' ? 2 : m.key === 'esteira2' ? 1 : 0;
    const frame = tier === 2 ? '#a169be' : tier === 1 ? '#68aee0' : '#e2a148';
    const d = m.dir === 2 ? -1 : 1;
    ctx.fillStyle = '#121d27'; ctx.fillRect(x - 0.4, y - 0.6, 16.8, 9.5);
    ctx.fillStyle = '#566674'; ctx.fillRect(x + 0.5, y, 15, 1.3);
    ctx.fillStyle = '#2d3942'; ctx.fillRect(x + 0.5, y + 1.3, 15, 5);
    ctx.fillStyle = frame; ctx.fillRect(x, y + 6.6, 16, 1.5);
    ctx.fillStyle = '#17242e'; ctx.fillRect(x + 1.5, y + 8, 13, 5);
    ctx.fillStyle = '#101b24'; ctx.fillRect(x + 2, y + 12, 2, 4); ctx.fillRect(x + 12, y + 12, 2, 4);
    const sp = (m.def.speed ?? 1) * (m.broken ? 0 : 1);
    const off = (((this.time * sp * 24 * d) % 4) + 4) % 4;
    ctx.fillStyle = '#707b80';
    for (let k = -4; k < 20; k += 4) { const o = k + off; if (o >= 0 && o < 15) ctx.fillRect(x + o, y + 1.7, 1.2, 3.5); }
    ctx.fillStyle = '#b8c5c2'; ctx.fillRect(x, y, 16, 0.45);
    // roletes, marcação industrial e seta legível nas duas direções
    for (const rx of [3, 8, 13]) {
      ctx.fillStyle = '#0a1219'; ctx.beginPath(); ctx.arc(x + rx, y + 10.5, 2, 0, 7); ctx.fill();
      ctx.strokeStyle = '#a9b5b4'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(x + rx, y + 10.5, 1.25, 0, 7); ctx.stroke();
      ctx.fillStyle = '#d3dcd5'; ctx.beginPath(); ctx.arc(x + rx, y + 10.5, 0.45, 0, 7); ctx.fill();
    }
    ctx.fillStyle = '#d39138'; ctx.fillRect(x, y + 6, 16, 0.8);
    ctx.strokeStyle = '#ffd47a'; ctx.lineWidth = 1.2;
    const ar = d > 0 ? x + 11 : x + 5;
    ctx.beginPath(); ctx.moveTo(ar - d * 2.5, y + 4); ctx.lineTo(ar, y + 2.3); ctx.lineTo(ar - d * 2.5, y + 0.6); ctx.stroke();
    if (m.state.startsWith('Travada') && Math.floor(this.time * 2) % 2) { ctx.fillStyle = 'rgba(255,60,40,0.45)'; ctx.fillRect(x, y, 16, 9); }
  }

  /** Céu atmosférico (superfície) ou caverna gigante com neblina (camadas de baixo), com paralaxe suave. */
  private drawSky(L: number, T: number, z: number, W: number, H: number) {
    const ctx = this.ctx, g = this.g;
    const surfY = (g.world.gen.landing.y * CELL - T) * z;
    const layer = g.planet.layer;
    ctx.imageSmoothingEnabled = true;
    // ESPAÇO: muito acima do chão o céu escurece até o preto, com estrelas (é lá que fica a Nave)
    const spaceTop = surfY - 950 * z, spaceK = Math.max(0, Math.min(1, (0 - (surfY - 700 * z)) / (600 * z)));
    if (layer === 1) {
      const gr = ctx.createLinearGradient(0, spaceTop, 0, surfY + 10 * z);
      gr.addColorStop(0, '#02040a'); gr.addColorStop(0.3, '#081430'); gr.addColorStop(0.5, '#215a9d'); gr.addColorStop(0.7, '#2888c9'); gr.addColorStop(0.9, '#70bee6'); gr.addColorStop(1, '#e9d5ad');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      // Disco de um mundo vizinho, visível apenas junto à atmosfera.
      const planetX = W * 0.26 - ((L * z * 0.008) % (W * 0.6));
      const planetY = surfY - 120 * z, planetR = Math.min(W * 0.2, 86 * z);
      if (planetY + planetR > 0 && planetY - planetR < H) {
        const atm = ctx.createRadialGradient(planetX - planetR * 0.32, planetY - planetR * 0.36, 0, planetX, planetY, planetR);
        atm.addColorStop(0, 'rgba(227,250,255,0.28)'); atm.addColorStop(0.75, 'rgba(147,199,224,0.2)'); atm.addColorStop(0.96, 'rgba(66,130,173,0.22)'); atm.addColorStop(1, 'rgba(226,247,255,0.08)');
        ctx.fillStyle = atm; ctx.beginPath(); ctx.arc(planetX, planetY, planetR, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(222,246,255,0.16)'; ctx.lineWidth = Math.max(1, z * 0.8); ctx.stroke();
      }
      // sol com brilho atmosférico
      const sx = W * 0.74, sy = surfY - 190 * z;
      const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 160 * z);
      sg.addColorStop(0, 'rgba(255,250,230,1)'); sg.addColorStop(0.06, 'rgba(255,244,210,0.95)'); sg.addColorStop(0.12, 'rgba(255,226,170,0.45)'); sg.addColorStop(0.4, 'rgba(255,214,160,0.12)'); sg.addColorStop(1, 'rgba(255,214,160,0)');
      ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);
      // nuvens suaves em duas profundidades
      // nuvens em várias altitudes: baixas e cheias perto do chão, finas e ralas lá em cima (somem no espaço)
      for (let i = 0; i < 16; i++) {
        const band = Math.floor(i / 4), back = i % 4 < 2;
        const par = back ? 0.05 + band * 0.01 : 0.12 + band * 0.02;
        const period = WORLD_PX_W * par;
        const cxw = nearestX((i % 4) * period / 4 + (band * 0.37 % 1) * period + this.time * (1.5 + (i % 3)), L * par, period) - L * par - 100;
        const cyw = surfY / z - 68 - ((i * 37) % 76) - (back ? 28 : 0) - band * 74;
        const sy = cyw * z; if (sy < -120 * z || sy > H + 60 * z) continue;
        const alpha = (back ? 0.55 : 0.85) * Math.max(0.15, 1 - band * 0.16);
        const scale = (back ? 0.7 : 1.1) * (band >= 3 ? 1.5 : 1) * z;
        for (let off = -period; off < W / z + 200; off += period) this.softCloud((cxw + off) * z, sy, scale, i % 3, alpha);
      }
    } else {
      const SK: [string, string, string][] = [
        ['', '', ''], ['#0b0f14', '#1b232c', '#3a3a38'], ['#0e0302', '#2a0c06', '#6a2410'],
        ['#03070e', '#0a1a2c', '#1e3a56'], ['#06030c', '#140c24', '#2c1c40'], ['#020a0d', '#06202a', '#123a40'], ['#140601', '#3a1204', '#8a3410'],
      ];
      const [a2, b2, c2] = SK[layer - 1];
      const gr = ctx.createLinearGradient(0, spaceTop, 0, surfY);
      gr.addColorStop(0, '#010207'); gr.addColorStop(0.55, a2); gr.addColorStop(0.85, b2); gr.addColorStop(1, c2);
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    }
    // estrelas (só aparecem conforme a câmera sobe)
    const starA = Math.max(0, Math.min(1, (surfY - 500 * z) / (500 * z)));
    if (starA > 0.02) {
      for (let i = 0; i < 140; i++) {
        const per = WORLD_PX_W * 0.08;
        const sx = ((hash2(i, 3, 7) * per - L * 0.08) % per + per) % per * z, sy = hash2(i, 5, 7) * H;
        if (sx > W) continue;
        ctx.globalAlpha = starA * (0.35 + 0.65 * hash2(i, 9, 7)) * (0.75 + 0.25 * Math.sin(this.time * 2 + i));
        ctx.fillStyle = '#e8f0ff'; ctx.fillRect(sx, sy, (1 + (i % 3 === 0 ? 1 : 0)) * Math.max(1, z * 0.5), (1 + (i % 3 === 0 ? 1 : 0)) * Math.max(1, z * 0.5));
      }
      ctx.globalAlpha = 1;
    }
    // no espaço: lua e um planeta com anel (paralaxe lenta)
    if (starA > 0.05) {
      ctx.globalAlpha = Math.min(1, starA * 1.2);
      const mx = W * 0.22 - ((L * 0.02) % (W * 1.6)), my = surfY - 1250 * z * 0.92;
      const mg = ctx.createRadialGradient(mx - 10 * z, my - 10 * z, 2, mx, my, 40 * z);
      mg.addColorStop(0, '#f4f2ea'); mg.addColorStop(0.7, '#b8b4aa'); mg.addColorStop(1, '#6e6a62');
      ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx, my, 34 * z, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(80,76,70,0.35)'; for (const [a, b, r] of [[-10, -6, 6], [8, 10, 9], [14, -12, 4], [-14, 14, 5]]) { ctx.beginPath(); ctx.arc(mx + a * z, my + b * z, r * z, 0, 7); ctx.fill(); }
      const px2 = W * 0.78 - ((L * 0.01) % (W * 1.8)), py2 = surfY - 1450 * z * 0.92;
      const pg = ctx.createRadialGradient(px2 - 18 * z, py2 - 18 * z, 4, px2, py2, 70 * z);
      pg.addColorStop(0, '#d9a070'); pg.addColorStop(0.6, '#9a5a3a'); pg.addColorStop(1, '#3a1e14');
      ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(px2, py2, 56 * z, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(230,210,180,0.55)'; ctx.lineWidth = 4 * z; ctx.beginPath(); ctx.ellipse(px2, py2, 96 * z, 18 * z, -0.25, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    void spaceK;
    // Cordilheiras vetoriais acompanham a câmera; cada cume tem facetas e luz próprias.
    if (layer === 1) this.drawMountains(L, surfY, z, W, H);
    // Cavernas das camadas inferiores mantêm silhuetas próprias.
    const ridges = layer === 1
      ? [['#88a6c2', '#bccfdd'], ['#5b7891', '#93abbd'], ['#3b5263', '#6c8394']]
      : [['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.05)'], ['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.15)'], ['rgba(0,0,0,0.75)', 'rgba(0,0,0,0.3)']];
    for (let k = 0; k < (layer === 1 ? 0 : 3); k++) {
      const zz = Math.min(z, 1.3);
      const par = 0.12 + k * 0.16, amp = [62, 44, 28][k] * zz / z, base = surfY + [-10, -2, 6][k] * z;
      const gr = ctx.createLinearGradient(0, base - amp * 1.8 * z, 0, base);
      gr.addColorStop(0, ridges[k][0]); gr.addColorStop(1, ridges[k][1]);
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.moveTo(0, H);
      for (let sx = 0; sx <= W + 4; sx += 4) {
        const phase = (L * par + sx / z) * Math.PI * 2 / (WORLD_PX_W * par);
        const hgt = (Math.sin(phase * (2 + k)) * 0.45 + Math.sin(phase * (5 + k * 2) + k * 2) * 0.28 + Math.abs(Math.sin(phase * (11 + k * 3) + k)) * 0.22 + 0.85) * amp;
        ctx.lineTo(sx, base - hgt * z);
      }
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
      if (k === 1) {
        // torres da Zenitex na névoa
        for (let t = 0; t < 3; t++) {
          const period = WORLD_PX_W * par;
          const wx = nearestX(t * period / 3 + 240, L * par, period) - L * par;
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
    if (layer > 1 && false) {
      // (removido) teto rochoso: agora dá para subir até o espaço em qualquer camada
      ctx.fillStyle = '#040507';
      ctx.beginPath(); ctx.moveTo(0, 0);
      for (let sx = 0; sx <= W + 6; sx += 6) {
        const phase = (L * 0.3 + sx / z) * Math.PI * 2 / (WORLD_PX_W * 0.3);
        const hang = (Math.sin(phase * 18) * 0.5 + 0.5) * 18 + Math.max(0, Math.sin(phase * 131) * Math.sin(phase * 39)) * 40;
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

  private drawMountains(L: number, surface: number, z: number, W: number, H: number) {
    if (surface < -45 * z) return;
    const ctx = this.ctx;
    const layers = [
      { par: 0.125, step: 128, count: 6, height: 77, base: 14, top: '#729fc5', foot: '#aacbd9', snow: 0.36 },
      { par: 0.25, step: 96, count: 16, height: 50, base: 13, top: '#517ca2', foot: '#8db2c4', snow: 0.2 },
      { par: 0.5, step: 64, count: 48, height: 25, base: 12, top: '#5c8297', foot: '#8caaa5', snow: 0.02 },
    ];
    for (let k = 0; k < layers.length; k++) {
      const q = layers[k], base = surface + q.base * z;
      const start = Math.floor((L * q.par - q.step * 2) / q.step);
      const end = Math.ceil((L * q.par + W / z + q.step * 2) / q.step);
      const path = new Path2D();
      path.moveTo(-q.step * z, H);
      for (let n = start; n <= end; n++) {
        const index = ((n % q.count) + q.count) % q.count;
        const center = n * q.step + (hash2(index, k, 41) - 0.5) * q.step * 0.24;
        const sx = (center - L * q.par) * z;
        const peak = base - q.height * z * (0.62 + hash2(index, k, 42) * 0.64);
        const half = q.step * z * (0.41 + hash2(index, k, 43) * 0.13);
        path.lineTo(sx - half, base - 7 * z);
        path.lineTo(sx - half * 0.64, peak + (base - peak) * 0.64);
        path.lineTo(sx - half * 0.46, peak + (base - peak) * 0.68);
        path.lineTo(sx - half * 0.37, peak + (base - peak) * 0.52);
        path.lineTo(sx - half * 0.12, peak + (base - peak) * 0.27);
        path.lineTo(sx, peak);
        path.lineTo(sx + half * 0.17, peak + (base - peak) * 0.31);
        path.lineTo(sx + half * 0.38, peak + (base - peak) * 0.58);
        path.lineTo(sx + half * 0.5, peak + (base - peak) * 0.55);
        path.lineTo(sx + half * 0.7, peak + (base - peak) * 0.8);
        path.lineTo(sx + half, base - 5 * z);
      }
      path.lineTo(W + q.step * z, H); path.closePath();
      const fill = ctx.createLinearGradient(0, base - q.height * z, 0, base);
      fill.addColorStop(0, q.top); fill.addColorStop(1, q.foot);
      ctx.fillStyle = fill; ctx.fill(path);
      ctx.save(); ctx.clip(path);
      for (let n = start; n <= end; n++) {
        const index = ((n % q.count) + q.count) % q.count;
        const center = n * q.step + (hash2(index, k, 41) - 0.5) * q.step * 0.24;
        const sx = (center - L * q.par) * z;
        if (sx < -q.step * z || sx > W + q.step * z) continue;
        const peak = base - q.height * z * (0.62 + hash2(index, k, 42) * 0.64);
        const half = q.step * z * (0.41 + hash2(index, k, 43) * 0.13);
        const rise = base - peak;
        ctx.fillStyle = k === 2 ? 'rgba(34,75,99,0.1)' : 'rgba(32,81,142,0.17)';
        ctx.beginPath(); ctx.moveTo(sx, peak); ctx.lineTo(sx + half * 0.46, peak + rise * 0.7);
        ctx.lineTo(sx + half, base); ctx.lineTo(sx + half * 0.12, base); ctx.closePath(); ctx.fill();
        if (q.snow) {
          ctx.fillStyle = `rgba(244,250,252,${q.snow})`;
          ctx.beginPath(); ctx.moveTo(sx, peak);
          ctx.lineTo(sx - half * 0.12, peak + rise * 0.27);
          ctx.lineTo(sx - half * 0.27, peak + rise * 0.4);
          ctx.lineTo(sx - half * 0.12, peak + rise * 0.36);
          ctx.lineTo(sx + half * 0.03, peak + rise * 0.18);
          ctx.lineTo(sx + half * 0.16, peak + rise * 0.32); ctx.closePath(); ctx.fill();
        }
        ctx.strokeStyle = k === 2 ? 'rgba(32,73,91,0.11)' : 'rgba(33,75,122,0.19)';
        ctx.lineWidth = Math.max(0.7, z * 0.45);
        ctx.beginPath(); ctx.moveTo(sx, peak + rise * 0.11);
        ctx.lineTo(sx - half * 0.08, peak + rise * 0.32);
        ctx.lineTo(sx - half * 0.3, peak + rise * 0.51);
        ctx.lineTo(sx - half * 0.34, peak + rise * 0.68); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx + half * 0.1, peak + rise * 0.36);
        ctx.lineTo(sx + half * 0.32, peak + rise * 0.59);
        ctx.lineTo(sx + half * 0.42, peak + rise * 0.85); ctx.stroke();
      }
      ctx.restore();
      const mist = ctx.createLinearGradient(0, base - 15 * z, 0, base + 7 * z);
      mist.addColorStop(0, 'rgba(221,240,240,0)'); mist.addColorStop(1, k === 2 ? 'rgba(228,224,192,0.22)' : 'rgba(214,239,245,0.26)');
      ctx.fillStyle = mist; ctx.fillRect(0, base - 15 * z, W, 22 * z);
    }
    // Árvores de fundo são geradas a partir de coordenadas do planeta e se movem em paralaxe.
    if (surface > -10 * z && this.resolutionScale >= 0.85) {
      const par = 0.5, gap = 24;
      const first = Math.floor((L * par - gap) / gap);
      const last = Math.ceil((L * par + W / z + gap) / gap);
      for (let n = first; n <= last; n++) {
        if (hash2(n & 127, 17, 58) < 0.43) continue;
        const sx = (n * gap + hash2(n & 127, 18, 58) * 12 - L * par) * z;
        const height = (8 + hash2(n & 127, 19, 58) * 15) * z;
        const by = surface + 5 * z, tw = height * 0.28;
        ctx.globalAlpha = 0.14 + hash2(n & 127, 20, 58) * 0.12;
        ctx.fillStyle = '#224f55';
        ctx.fillRect(sx - Math.max(0.6, z * 0.3), by - height * 0.4, Math.max(1.2, z * 0.6), height * 0.45);
        for (let tier = 0; tier < 3; tier++) {
          const yy = by - height * (0.95 - tier * 0.22), width = tw * (0.57 + tier * 0.24);
          ctx.beginPath(); ctx.moveTo(sx, yy - height * 0.18);
          ctx.lineTo(sx + width, yy + height * 0.27);
          ctx.lineTo(sx, yy + height * 0.18);
          ctx.lineTo(sx - width, yy + height * 0.27); ctx.closePath(); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
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
    // raios de sol só perto do chão: somem conforme a câmera sobe para o espaço
    const rayK = Math.max(0, Math.min(1, 1 - (surfScreenY - H) / (H * 1.2)));
    if (layer === 1 && surfScreenY > -40 && rayK > 0.02) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = rayK;
      for (let i = 0; i < 4; i++) {
        const x = W * (0.45 + i * 0.13) + Math.sin(this.time * 0.2 + i) * 20;
        const gr = ctx.createLinearGradient(x, 0, x - 120, surfScreenY);
        gr.addColorStop(0, 'rgba(255,236,190,0.04)'); gr.addColorStop(1, 'rgba(255,236,190,0)');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 40, 0); ctx.lineTo(x - 80, surfScreenY); ctx.lineTo(x - 160, surfScreenY); ctx.closePath(); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
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

  /** Tubo pneumático: liga vizinhos, mostra a sucção e os grãos transportados. */
  private drawTube(m: Machine) {
    const g = this.g, ctx = this.ctx;
    const cx = m.tx * TILE + TILE / 2, cy = m.ty * TILE + TILE / 2;
    const sides = new Set<number>([m.dir]);
    for (let d = 0; d < 4; d++) {
      const [dx, dy] = DIRS[d];
      const n = g.machines.at(m.tx + dx, m.ty + dy);
      if (!n) continue;
      // vizinho que manda para mim
      const [bx, by] = DIRS[n.dir];
      if (n.def.behavior === 'tube' && wrapX(n.tx + bx, WORLD_PX_W / TILE) === m.tx && n.ty + by === m.ty) sides.add(d);
      if (n.def.behavior === 'blower' && dy === 0 && (n.dir === 2 ? -1 : 1) === -dx) sides.add(d);
    }
    const R = m.key === 'tubo_gigante' ? 6.4 : 4.2;
    const seg = (d: number, col: string, r: number) => {
      const [dx, dy] = DIRS[d], h = TILE / 2;
      ctx.fillStyle = col;
      if (dx) ctx.fillRect(dx > 0 ? cx : cx - h, cy - r, h, r * 2); else ctx.fillRect(cx - r, dy > 0 ? cy : cy - h, r * 2, h);
    };
    // tubo de vidro reforçado: carcaça grafite, canal de vidro com brilho ciano e anéis de contenção
    // TUBO TRANSPARENTE: vidro quase invisível com bordas claras; os grãos aparecem andando dentro
    for (const d of sides) seg(d, 'rgba(170,230,255,0.55)', R + 0.5);
    for (const d of sides) seg(d, 'rgba(120,200,255,0.10)', R - 0.5);
    ctx.fillStyle = 'rgba(170,230,255,0.55)'; ctx.fillRect(cx - R - 0.5, cy - R - 0.5, R * 2 + 1, R * 2 + 1);
    ctx.fillStyle = 'rgba(120,200,255,0.10)'; ctx.fillRect(cx - R + 0.5, cy - R + 0.5, R * 2 - 1, R * 2 - 1);
    // reflexo do vidro
    ctx.fillStyle = 'rgba(220,245,255,0.35)';
    for (const d of sides) { const [dx] = DIRS[d]; if (dx) ctx.fillRect(dx > 0 ? cx : cx - TILE / 2, cy - R * 0.5, TILE / 2, 0.6); else ctx.fillRect(cx - R * 0.5, DIRS[d][1] > 0 ? cy : cy - TILE / 2, 0.6, TILE / 2); }
    // anéis de contenção nas juntas (luz azul)
    for (const d of sides) { const [dx, dy] = DIRS[d]; const fx = cx + dx * (TILE / 2 - 1.2), fy = cy + dy * (TILE / 2 - 1.2);
      ctx.fillStyle = '#4a5670'; ctx.fillRect(fx - (dx ? 1 : R + 0.8), fy - (dy ? 1 : R + 0.8), dx ? 2 : R * 2 + 1.6, dy ? 2 : R * 2 + 1.6);
      ctx.fillStyle = 'rgba(120,230,255,0.9)'; ctx.fillRect(fx - (dx ? 0.25 : R * 0.5), fy - (dy ? 0.25 : R * 0.5), dx ? 0.5 : R, dy ? 0.5 : R); }
    // pacotes correndo para a saída (brilham dentro do vidro)
    const [ox, oy] = DIRS[m.dir], ph = (this.time * 10) % 1;
    if (m.q) m.q.forEach((p, i) => {
      const t = Math.min(0.95, (i / 4) + ph / 4);
      const c = MATERIALS[p.m]?.top ?? [200, 200, 200];
      const px = cx - TILE / 2 * ox + ox * TILE * t, py = cy - TILE / 2 * oy + oy * TILE * t;
      ctx.fillStyle = 'rgba(140,230,255,0.35)'; ctx.fillRect(px - 2, py - 2, 4, 4);
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; ctx.fillRect(px - 1.2, py - 1.2, 2.4, 2.4);
    });
    // Correntes de ar em espiral entram pela boca do tubo; intensificam durante a sucção.
    if (!m.broken) {
      const alpha = 0.25 + 0.65 * m.fin;
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + this.time * 2.4 + m.id * 0.7;
        const pull = (this.time * 13 + i * 5) % 11;
        const r = 16 - pull;
        ctx.strokeStyle = `rgba(150,235,255,${alpha * (0.35 + pull / 18)})`;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * (r + 5), cy + Math.sin(a) * (r + 5));
        ctx.quadraticCurveTo(cx + Math.cos(a + 0.3) * r, cy + Math.sin(a + 0.3) * r, cx + Math.cos(a + 0.7) * Math.max(3, r - 5), cy + Math.sin(a + 0.7) * Math.max(3, r - 5));
        ctx.stroke();
      }
    }
    if (m.q?.length) g.lighting.add(cx, cy, 16, [110, 210, 255], 0.25);
    // seta discreta (chevron) da direção
    ctx.strokeStyle = 'rgba(255,208,74,0.75)'; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(cx - ox * 1 + oy * 1.6, cy - oy * 1 + ox * 1.6); ctx.lineTo(cx + ox * 1.4, cy + oy * 1.4); ctx.lineTo(cx - ox * 1 - oy * 1.6, cy - oy * 1 - ox * 1.6); ctx.stroke();
    if (m.key === 'reforcador') {
      // colar do reforçador de vazão
      ctx.fillStyle = '#14161c'; ctx.fillRect(cx - 6.5, cy - 6.5, 13, 13);
      ctx.fillStyle = '#e8862a'; ctx.fillRect(cx - 6, cy - 6, 12, 12);
      ctx.fillStyle = '#ffb04a'; ctx.fillRect(cx - 6, cy - 6, 12, 2);
      ctx.fillStyle = '#f2f2ea'; ctx.beginPath(); ctx.arc(cx, cy + 1, 3.4, 0, 7); ctx.fill();
      ctx.strokeStyle = '#d02a1a'; ctx.lineWidth = 0.8; const a = -2.4 + ((m.q?.length ?? 0) / 4) * 2 + Math.sin(this.time * 9 + m.id) * 0.15;
      ctx.beginPath(); ctx.moveTo(cx, cy + 1); ctx.lineTo(cx + Math.cos(a) * 2.8, cy + 1 + Math.sin(a) * 2.8); ctx.stroke();
      g.lighting.add(cx, cy, 14, [255, 170, 80], 0.3);
    }
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
    if (m.def.w >= 2 && m.def.behavior !== 'platform') {
      const px = m.tx * TILE + m.def.w * TILE - 8, py = m.ty * TILE + m.def.h * TILE - 6;
      ctx.fillStyle = '#0b1118'; ctx.fillRect(px - 1, py - 1, 6, 4);
      ctx.fillStyle = m.broken ? '#ff5944' : m.working ? '#75e2d1' : '#e6a34a';
      ctx.fillRect(px, py, 3, 1.4);
      ctx.fillStyle = '#d9e5df'; ctx.fillRect(px + 4, py, 0.6, 1.4);
    }
    if (m.def.behavior === 'silo') {
      // visor com o nível e a cor do mineral guardado
      const k = Object.keys(m.inb).find(q => (m.inb[q] ?? 0) > 0) ?? m.filter;
      const t = Object.values(m.inb).reduce((a, b) => a + b, 0), f = Math.min(1, t / g.machines.siloCap());
      const vx = m.tx * TILE + 13, vy = m.ty * TILE + 6, vw = 6, vh = 22;
      ctx.fillStyle = 'rgba(8,12,18,0.9)'; ctx.fillRect(vx, vy, vw, vh);
      const c = k ? (ITEM[k]?.color ?? [200, 200, 200]) : [60, 60, 60];
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; ctx.fillRect(vx + 1, vy + vh - 1 - (vh - 2) * f, vw - 2, (vh - 2) * f);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(vx + 1, vy + 1, 1, vh - 2);
      if (k) ctx.drawImage(g.sprites.item(k, 8), m.tx * TILE + 3, m.ty * TILE + 10);
      if (f >= 0.999) this.alert(m.tx * TILE + 16, m.ty * TILE - 10, '#ffb04a');
    }
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
    if (d.behavior === 'riser') {
      const ph = (t * 10 + m.ty * 3) % TILE;
      ctx.fillStyle = 'rgba(120,230,255,0.22)'; ctx.fillRect(x + 4, y + 2, W - 8, H - 4);
      ctx.fillStyle = '#ffc46a';
      for (let k = 0; k < 3; k++) {
        const yy = y + H - ((ph + k * 6) % H) - 3;
        if (yy > y + 1 && yy < y + H - 2) { ctx.fillRect(x + 6, yy, 4, 1.4); ctx.fillRect(x + 7, yy - 1, 2, 1); }
      }
      return;
    }
    if (d.behavior === 'blower') {
      // núcleo de plasma: esfera pulsando com arcos girando; mais forte quando está aspirando
      const cx = x + W / 2, cy = y + H / 2 - 0.5, on = m.fin > 1, pulse = 0.75 + 0.25 * Math.sin(t * (on ? 14 : 4) + m.id);
      const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 4.2);
      rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.35, `rgba(150,235,255,${0.95 * pulse})`); rg.addColorStop(0.75, `rgba(170,110,255,${0.75 * pulse})`); rg.addColorStop(1, 'rgba(120,60,255,0)');
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(cx, cy, 4.2, 0, 7); ctx.fill();
      ctx.strokeStyle = `rgba(200,245,255,${0.8 * pulse})`; ctx.lineWidth = 0.5;
      for (let k = 0; k < 3; k++) { const a0 = t * (on ? 9 : 3) * (k % 2 ? -1 : 1) + k * 2.1; ctx.beginPath(); ctx.arc(cx, cy, 2.4 + k * 0.6, a0, a0 + 1.6); ctx.stroke(); }
      g.lighting.add(cx, cy, on ? 46 : 26, [140, 200, 255], on ? 0.9 : 0.5);
      if (on) {
        // grãos sendo sugados em espiral para o anel
        const R = fabVal(g.flags, 'alcance') * TILE * 0.5;
        for (let i = 0; i < 9; i++) {
          const k = (t * 1.6 + i / 9) % 1, a = i * 2.4 + t * 2, r = (1 - k) * R + 3;
          const px = cx + Math.cos(a + k * 3) * r, py = cy + Math.abs(Math.sin(a + k * 3)) * r * 0.7;
          ctx.fillStyle = `rgba(${i % 3 ? '170,140,110' : '120,220,255'},${0.35 + k * 0.6})`; ctx.fillRect(px - 0.6, py - 0.6, 1.2, 1.2);
        }
      }
      return;
    }
    if (d.behavior === 'compactor') {
      // fogo no visor e fumaça na chaminé (mais forte enquanto queima)
      const on = m.working || m.fin > 1, k = on ? 1 : 0.25;
      for (let i = 0; i < 6; i++) {
        const fx = x + 4 + ((i * 2.3 + t * 9) % (W - 8)), hgt = (3 + Math.sin(t * 12 + i * 1.7) * 2 + 3) * k;
        ctx.fillStyle = `rgba(255,${120 + i * 18},40,${0.75 * k})`; ctx.beginPath(); ctx.moveTo(fx - 1.6, y + 20); ctx.quadraticCurveTo(fx, y + 20 - hgt * 1.6, fx + 1.6, y + 20); ctx.fill();
      }
      g.lighting.add(x + W / 2, y + 14, on ? 46 : 18, [255, 140, 50], on ? 0.9 : 0.3);
      if (on && Math.random() < 0.25) g.fx.smoke(x + W - 4, y - 9, [90, 90, 96]);
      if (on && Math.random() < 0.1) g.fx.ember(x + W - 4, y - 9, [255, 150, 60]);
      return;
    }
    if (d.behavior === 'ship') {
      // porta de carga pulsando + rótulo fixo
      const cx = x + W / 2, by = y + H, pulse = 0.6 + 0.4 * Math.sin(t * 3);
      g.lighting.add(cx, by, 60, [120, 220, 255], 0.6 * pulse);
      g.lighting.add(x + 6, y + 20, 50, [120, 220, 255], 0.8);
      // RAIO TRATOR: feixe da boca do tubo até a porta de carga enquanto entrega
      if (m.beam && g.time - m.beam.t < 0.5) {
        const a = 1 - (g.time - m.beam.t) / 0.5, bx = nearestX(m.beam.x, cx);
        const gr = ctx.createLinearGradient(0, m.beam.y, 0, by);
        gr.addColorStop(0, `rgba(140,230,255,${0.15 * a})`); gr.addColorStop(1, `rgba(140,230,255,${0.45 * a})`);
        ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(bx - 3, m.beam.y); ctx.lineTo(bx + 3, m.beam.y); ctx.lineTo(cx + 12, by); ctx.lineTo(cx - 12, by); ctx.closePath(); ctx.fill();
        for (let i = 0; i < 3; i++) { const f = (t * 2.5 + i / 3) % 1; ctx.fillStyle = `rgba(230,250,255,${0.8 * a})`; ctx.fillRect(bx + (cx - bx) * f - 1, m.beam.y + (by - m.beam.y) * f - 1, 2, 2); }
      }
      // só um brilho discreto na porta de carga (sem texto atrapalhando)
      ctx.fillStyle = `rgba(140,230,255,${0.25 + 0.35 * pulse})`; ctx.beginPath(); ctx.ellipse(cx, by + 1, 14, 2.5, 0, 0, 7); ctx.fill();
      return;
    }
    if (d.behavior === 'extractor') {
      // campo puxando para CIMA a partir da esteira: ondas descendo e grãos subindo até o extrator
      const ima = d.key === 'ima', cx = x + W / 2, by = y + H, busy = m.state.startsWith('Puxando'), k = busy ? 1 : 0.4;
      // cada grão puxado sobe BEM VISÍVEL: grão grande, colorido, com rastro e um feixe ligando à máquina
      if (m.fly?.length) {
        const live = m.fly.filter(f => g.time - f.t < 0.55);
        if (live.length) {
          const cg = ctx.createLinearGradient(0, by, 0, by + TILE * 1.9);
          cg.addColorStop(0, ima ? 'rgba(255,120,100,0.28)' : 'rgba(110,220,255,0.28)'); cg.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = cg; ctx.beginPath(); ctx.moveTo(x + 2, by); ctx.lineTo(x + W - 2, by); ctx.lineTo(x + W + 3, by + TILE * 1.9); ctx.lineTo(x - 3, by + TILE * 1.9); ctx.closePath(); ctx.fill();
        }
        for (const f of live) {
          const a = (g.time - f.t) / 0.55, e = a * a * (3 - 2 * a);
          const fx0 = nearestX(f.x, cx), px = fx0 + (cx - fx0) * e, py = f.y + (by - 1 - f.y) * e;
          const c = ITEM[f.k]?.color ?? [230, 230, 240];
          ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.5 * (1 - a)})`; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(fx0, f.y); ctx.lineTo(px, py); ctx.stroke();
          ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; ctx.fillRect(px - 1.6, py - 1.6, 3.2, 3.2);
          ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(px - 0.6, py - 1.2, 1.2, 1.2);
          g.lighting.add(px, py, 10, c as [number, number, number], 0.6);
        }
        m.fly = m.fly.filter(f => g.time - f.t < 0.6);
      }
      ctx.lineWidth = 0.6;
      for (let i = 0; i < 3; i++) {
        const ph = (t * (busy ? 1.4 : 0.5) + i / 3) % 1;
        ctx.strokeStyle = ima ? `rgba(${i % 2 ? '255,90,70' : '120,170,255'},${(1 - ph) * 0.7 * k})` : `rgba(120,230,255,${(1 - ph) * 0.7 * k})`;
        ctx.beginPath(); ctx.ellipse(cx, by + 1 + ph * TILE * 1.6, W * 0.42 * (0.5 + ph * 0.5), 1.4 + ph * 2, 0, 0, Math.PI * 2); ctx.stroke();
      }
      if (busy) {
        const col = ima ? '#e8eefc' : '#4aa8ff';
        for (let i = 0; i < 4; i++) { const ph = (t * 2 + i / 4) % 1; ctx.fillStyle = col; ctx.fillRect(cx - W * 0.3 + (i * 0.2) * W - 0.8, by + TILE * 1.6 * (1 - ph) - 0.8, 1.6, 1.6); }
        g.lighting.add(cx, by + 4, 26, ima ? [255, 130, 110] : [110, 210, 255], 0.55);
      }
      return;
    }
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
    const tx = b.deconstruct && !g.input.touch ? Math.floor(g.input.worldX / TILE) : b.tx;
    const ty = b.deconstruct && !g.input.touch ? Math.floor(g.input.worldY / TILE) : b.ty;
    if (b.deconstruct) {
      const m = g.machines.at(tx, ty);
      ctx.strokeStyle = 'rgba(255,80,60,0.9)'; ctx.lineWidth = 1;
      if (m) ctx.strokeRect(this.screenX(m.tx * TILE) + 0.5, m.ty * TILE + 0.5, m.def.w * TILE - 1, m.def.h * TILE - 1);
      else ctx.strokeRect(tx * TILE + 0.5, ty * TILE + 0.5, TILE - 1, TILE - 1);
      return;
    }
    const def = MACHINE[b.key!];
    if (!def) return;
    if (def.behavior === 'riser' || def.behavior === 'scaffold') {
      for (const [px, py, dir] of g.beltPath()) {
        const ex = g.machines.at(px, py);
        const ok = (ex && ex.key === def.key) || !g.machines.canPlace(def, px, py);
        const { img, oy: e2 } = g.sprites.machine(def, dir);
        const x = this.screenX(px * TILE);
        ctx.globalAlpha = 0.65; ctx.drawImage(img, x, py * TILE - e2, img.width / SPRITE_K, img.height / SPRITE_K); ctx.globalAlpha = 1;
        ctx.fillStyle = ok ? 'rgba(80,255,120,0.22)' : 'rgba(255,60,40,0.35)'; ctx.fillRect(x, py * TILE, TILE, TILE);
      }
      if (b.anchor) { ctx.strokeStyle = '#ffd04a'; ctx.strokeRect(this.screenX(b.anchor[0] * TILE) + 0.5, b.anchor[1] * TILE + 0.5, TILE - 1, TILE - 1); }
      return;
    }
    if (def.behavior === 'tube') {
      for (const [px, py, dir] of g.beltPath()) {
        const ex = g.machines.at(px, py);
        const ok = (ex && ex.def.behavior === 'tube') || !g.machines.canPlace(def, px, py);
        const x = this.screenX(px * TILE), cx = x + 8, cy = py * TILE + 8, [dx, dy] = DIRS[dir];
        ctx.fillStyle = ok ? 'rgba(80,255,120,0.25)' : 'rgba(255,60,40,0.35)'; ctx.fillRect(x, py * TILE, TILE, TILE);
        ctx.fillStyle = def.key === 'reforcador' ? 'rgba(232,134,42,0.8)' : 'rgba(124,134,150,0.8)'; ctx.fillRect(cx - 4, cy - 4, 8, 8);
        ctx.strokeStyle = '#ffd04a'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(cx - dx * 4, cy - dy * 4); ctx.lineTo(cx + dx * 6, cy + dy * 6); ctx.stroke();
      }
      if (b.anchor) { ctx.strokeStyle = '#ffd04a'; ctx.strokeRect(this.screenX(b.anchor[0] * TILE) + 0.5, b.anchor[1] * TILE + 0.5, TILE - 1, TILE - 1); }
      return;
    }
    if (def.behavior === 'belt') {
      // linha de esteiras: cada tile com a seta da direção
      for (const [px, py, dir] of g.beltPath()) {
        const ex = g.machines.at(px, py);
        const ok = ex?.belt || !g.machines.canPlace(def, px, py);
        const x = this.screenX(px * TILE);
        ctx.globalAlpha = 0.65; this.drawBelt({ ...(ex ?? {}), def, dir, broken: false, belt: [], state: '', key: def.key } as any, x, py * TILE); ctx.globalAlpha = 1;
        ctx.fillStyle = ok ? 'rgba(80,255,120,0.22)' : 'rgba(255,60,40,0.35)';
        ctx.fillRect(x, py * TILE, TILE, TILE);
        const [dx, dy] = DIRS[dir];
        ctx.strokeStyle = '#ffd04a'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x + 8 - dx * 4, py * TILE + 8 - dy * 4); ctx.lineTo(x + 8 + dx * 5, py * TILE + 8 + dy * 5); ctx.stroke();
        ctx.fillStyle = '#ffd04a'; ctx.fillRect(x + 7 + dx * 5, py * TILE + 7 + dy * 5, 3, 3);
      }
      if (b.anchor) { ctx.strokeStyle = '#ffd04a'; ctx.strokeRect(this.screenX(b.anchor[0] * TILE) + 0.5, b.anchor[1] * TILE + 0.5, TILE - 1, TILE - 1); }
      return;
    }
    const ox = tx - Math.floor((def.w - 1) / 2), oy = ty - Math.floor((def.h - 1) / 2);
    const err = g.machines.canPlace(def, ox, oy);
    const tooFar = Math.hypot(nearestX((ox + def.w / 2) * TILE, g.player.x) - g.player.x, (oy + def.h / 2) * TILE - g.player.y) > 260;
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
    // máquina em foco: a do rótulo de toque, ou a mais próxima do jogador
    let focus: Machine | null = g.hover?.kind === 'machine' ? (g.hover.ref as Machine) : null;
    if (!focus) { let bd = 70; for (const m of g.machines.list) { if (m.def.behavior === 'belt') continue; const [mx, my] = g.machines.centerPx(m); const dd = Math.hypot(nearestX(mx, p.x) - p.x, my - p.y); if (dd < bd) { bd = dd; focus = m; } } }
    for (const m of g.machines.list) {
      const d = m.def, bh = d.behavior;
      if (bh === 'belt' || bh === 'lamp' || bh === 'support' || bh === 'platform' || bh === 'scaffold') continue;
      if (!g.build.active && (bh === 'command' || bh === 'terminal' || bh === 'analyzer')) continue;   // fixos da base: sem poluir
      const x0 = this.screenX(m.tx * TILE), y0 = m.ty * TILE, W = d.w * TILE, H = d.h * TILE;
      if (x0 > R || x0 + W < L || y0 > B || y0 + H < T) continue;
      const [cx, cy] = g.machines.centerPx(m);
      if (Math.hypot(nearestX(cx, p.x) - p.x, cy - p.y) > near) continue;
      // sem poluir: fora do modo construção, só a máquina em foco (a que você toca/está perto) mostra entrada e saída
      if (!g.build.active && focus !== m) continue;
      if (bh === 'riser' || bh === 'launcher') continue;
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
        if (o.side === 'down') {
          const sx = x0 + W / 2, sy = y0 + H + 3;
          const k = (t * 1.6 + m.id * 0.3) % 1;
          ctx.globalAlpha = m.working ? 0.9 : 0.45;
          ctx.fillStyle = '#4aa8ff';
          for (let j = 0; j < 2; j++) { const ay = sy + ((k + j * 0.5) % 1) * 9; ctx.beginPath(); ctx.moveTo(sx - 3, ay); ctx.lineTo(sx + 3, ay); ctx.lineTo(sx, ay + 4); ctx.closePath(); ctx.fill(); }
          ctx.globalAlpha = 1;
          if (o.keys.length) this.badge(sx + 14, sy + 6, o.keys.slice(0, 2), '#4aa8ff', 'down');
          continue;
        }
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
    const gd = g.guide();
    if (gd?.remove) {
      // peça a desmontar (guia): caixa vermelha piscando
      const m = gd.remove, x = m.tx * TILE, y = m.ty * TILE, W = m.def.w * TILE, H = m.def.h * TILE, a = 0.5 + 0.5 * Math.sin(this.time * 6);
      ctx.save(); ctx.setLineDash([3, 2]); ctx.lineWidth = 1.4; ctx.strokeStyle = `rgba(255,80,60,${0.6 + a * 0.4})`; ctx.strokeRect(x + 0.5, y + 0.5, W - 1, H - 1);
      ctx.fillStyle = `rgba(255,60,40,${0.12 + a * 0.12})`; ctx.fillRect(x, y, W, H); ctx.setLineDash([]);
      ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'center'; const t = 'DESMONTE ESTA'; const tw = ctx.measureText(t).width + 8;
      ctx.fillStyle = 'rgba(40,6,4,0.9)'; ctx.fillRect(x + W / 2 - tw / 2, y - 11, tw, 9); ctx.fillStyle = '#ffb0a0'; ctx.fillText(t, x + W / 2, y - 4.5); ctx.restore();
    }
    const it = g.ui.tutorial.currentBp() ?? gd?.item ?? null;
    if (!it || g.blueprint.placed(it.id)) return;
    const d = MACHINE[it.key];
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 4);
    ctx.save();
    ctx.setLineDash([3, 2]); ctx.lineWidth = 1.2; ctx.strokeStyle = `rgba(120,255,150,${0.6 + pulse * 0.4})`;
    if (it.key === 'esteira' || (it.key === 'piso_orbital' && it.tx2 !== undefined)) {
      const x0 = Math.min(it.tx, it.tx2!) * TILE, x1 = (Math.max(it.tx, it.tx2!) + 1) * TILE, y = it.ty * TILE;
      ctx.fillStyle = `rgba(120,255,150,${0.12 + pulse * 0.1})`; ctx.fillRect(x0, y, x1 - x0, TILE);
      ctx.strokeRect(x0, y, x1 - x0, TILE);
      ctx.setLineDash([]);
      // setas de fluxo andando para o armazém + marcadores de início e fim
      const dir = it.dir === 2 ? -1 : 1;
      if (it.key === 'esteira') for (let k = 0; k < (x1 - x0) / 10; k++) {
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
    } else if (it.key === 'tubo') {
      const path = g.blueprint.tubePath(it);
      ctx.fillStyle = `rgba(120,255,150,${0.12 + pulse * 0.1})`;
      for (const [px, py] of path) { ctx.fillRect(px * TILE, py * TILE, TILE, TILE); ctx.strokeRect(px * TILE + 0.5, py * TILE + 0.5, TILE - 1, TILE - 1); }
      ctx.setLineDash([]);
      // ponto andando pelo caminho
      const k = (this.time * 5) % path.length, [qx, qy] = path[Math.floor(k)], [ddx, ddy] = DIRS[path[Math.floor(k)][2]], f = k % 1;
      ctx.fillStyle = 'rgba(160,255,180,0.95)'; ctx.beginPath(); ctx.arc((qx + 0.5 + ddx * f) * TILE, (qy + 0.5 + ddy * f) * TILE, 2.5, 0, 7); ctx.fill();
      for (const [tx, ty, n] of [[it.tx, it.ty, '1'], [it.tx2!, it.ty2!, '2']] as [number, number, string][]) {
        const cx = (tx + 0.5) * TILE, cy = ty * TILE - 6;
        ctx.fillStyle = '#1a3a22'; ctx.beginPath(); ctx.arc(cx, cy, 4.5, 0, 7); ctx.fill();
        ctx.strokeStyle = '#7aff8a'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#d8ffe0'; ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(n, cx, cy + 2.2);
      }
      ctx.textAlign = 'left';
    } else if (it.ty2 !== undefined) {
      const y0 = Math.min(it.ty, it.ty2) * TILE, y1 = (Math.max(it.ty, it.ty2) + 1) * TILE, x = it.tx * TILE;
      ctx.fillStyle = `rgba(120,255,150,${0.12 + pulse * 0.1})`; ctx.fillRect(x, y0, TILE, y1 - y0);
      ctx.strokeRect(x + 0.5, y0 + 0.5, TILE - 1, y1 - y0 - 1);
      ctx.setLineDash([]);
      // setas subindo e a saída no topo
      for (let k = 0; k < 3; k++) { const ay = y1 - (((this.time * 20) + k * 14) % (y1 - y0)); ctx.fillStyle = 'rgba(160,255,180,0.9)'; ctx.beginPath(); ctx.moveTo(x + 8, ay - 4); ctx.lineTo(x + 4, ay); ctx.lineTo(x + 12, ay); ctx.closePath(); ctx.fill(); }
      const dx = it.dir === 2 ? -1 : 1;
      ctx.fillStyle = '#7aff8a'; ctx.beginPath(); ctx.moveTo(x + 8 + dx * 14, y0 + 4); ctx.lineTo(x + 8 + dx * 7, y0); ctx.lineTo(x + 8 + dx * 7, y0 + 8); ctx.closePath(); ctx.fill();
      for (const [ty, n] of [[it.ty, '1'], [it.ty2, '2']] as [number, string][]) {
        const cx = x + TILE + 6, cy = ty * TILE + 8;
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
    const lx = (it.key === 'tubo' || (it.key === 'piso_orbital' && it.tx2 !== undefined) ? (it.tx + it.tx2!) / 2 + 0.5 : it.key === 'esteira' ? (it.tx + it.tx2!) / 2 + 0.5 : it.tx + d.w / 2) * TILE, ly = it.key === 'tubo' ? it.ty2! * TILE - 6 : it.key === 'esteira' || (it.key === 'piso_orbital' && it.tx2 !== undefined) ? it.ty * TILE - 16 : it.ty2 !== undefined ? Math.min(it.ty, it.ty2) * TILE - 6 : (it.ty + d.h / 2) * TILE + 2;   // dentro do quadrado: não briga com o rótulo de toque
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
    const takesGrains = ['separator', 'prep', 'compactor', 'storage', 'link', 'command', 'riser', 'launcher', 'terminal', 'filter', 'silo'].includes(bh);
    if (takesGrains) tri(x0 + W / 2, y0 - 10 + bob, 0, 1, '#7aff8a');                  // funil: entra por cima
    const right = dir !== 2;
    const outSide = (r: boolean, col: string) => tri(r ? x0 + W + 7 + bob : x0 - 7 - bob, y0 + H - 6, r ? 1 : -1, 0, col);
    const downOut = () => tri(x0 + W / 2, y0 + H + 8 + bob, 0, 1, '#6ab4ff');
    if (bh === 'drill' || bh === 'complex') outSide(!(dir === 0), '#ffb04a');
    else if (def.outMode === 'sieve') { downOut(); outSide(right, '#b09a84'); }
    else if (def.outMode === 'bottom') downOut();
    else if (bh === 'separator') outSide(right, '#6ab4ff');
    else if (bh === 'filter') { downOut(); outSide(right, '#ffb04a'); }
    else if (bh === 'silo') outSide(right, '#ffb04a');
    else if (bh === 'refinery' || bh === 'launcher') outSide(right, '#ffb04a');
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
