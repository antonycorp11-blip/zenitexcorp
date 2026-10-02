import { CELL, TILE } from '../core/constants';
import { MAT, IS_SOLID, matById } from '../data/materials';
import { SECTORS } from '../data/sectors';
import { POOLS } from '../data/dialogue';
import { ITEM } from '../data/items';
import { fmtInt } from '../core/math';
import type { Game } from '../Game';

export interface Anomaly { id: number; x: number; y: number; sector: number; t: number; }

/** Eventos ocasionais que geram trabalho manual. */
export class Events {
  timer = 90;
  anomalies: Anomaly[] = [];
  storm = 0;
  private nextId = 1;
  log: { t: number; text: string }[] = [];

  constructor(private g: Game) {}

  private record(text: string) { this.log.unshift({ t: this.g.time, text }); if (this.log.length > 40) this.log.pop(); }

  update(dt: number) {
    const g = this.g;
    if (g.flags.intro || g.flags.ending) return;
    this.storm = Math.max(0, this.storm - dt);
    // anomalias drenam energia do setor enquanto existirem
    for (const a of this.anomalies) { a.t += dt; g.sectors.rt[a.sector].demand += 40; }
    this.timer -= dt;
    if (this.timer > 0) return;
    // frequência aumenta com a escala da operação
    const scale = Math.min(2.2, 1 + g.machines.list.length / 120 + g.planet.fraction());
    this.timer = (80 + Math.random() * 90) / scale;
    this.fire();
  }

  fire() {
    const g = this.g;
    const M = g.machines.list;
    const opts: [string, number][] = [['memo', 1.2], ['contract', 1.2], ['deposit', 2], ['choice', 2.2]];
    if (M.length > 6) opts.push(['cavein', 2.5], ['failure', 2], ['surge', 1.5]);
    if (g.robots.list.length) opts.push(['robot', 1.2]);
    if (g.planet.layer >= 5) opts.push(['anomaly', 1.6], ['alien', 1]);   // Manto para baixo
    if (g.sectors.current === 1) opts.push(['storm', 0.8]);
    if (g.world.gen.ruins.length) opts.push(['ruin', 1.2]);
    let total = 0; for (const o of opts) total += o[1];
    let r = Math.random() * total, pick = opts[0][0];
    for (const o of opts) { r -= o[1]; if (r <= 0) { pick = o[0]; break; } }
    switch (pick) {
      case 'memo': { const l = POOLS.ev_memo; const line = l[Math.floor(Math.random() * l.length)]; g.dialogue.queue.push(line); break; }
      case 'contract': { const c = g.contracts.generate(); if (c) { g.contracts.available.unshift(c); g.toast('Novo contrato corporativo disponível (J)', '#ffd04a'); } break; }
      case 'deposit': this.deposit(); break;
      case 'choice': this.choice(); break;
      case 'cavein': {
        const cands = M.filter(m => m.def.behavior !== 'platform' && !this.supported(m));
        if (!cands.length) break;
        const m = cands[Math.floor(Math.random() * cands.length)];
        const [x, y] = g.machines.centerPx(m);
        this.caveIn(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 40, true);
        break;
      }
      case 'failure': {
        const cands = M.filter(m => m.def.power !== 0 && !m.broken && m.def.behavior !== 'command');
        if (!cands.length) break;
        const m = cands[Math.floor(Math.random() * cands.length)];
        m.broken = true; m.cond = 0;
        g.say('ev_failure', 60);
        g.bus.emit('machine_broken', m);
        this.record(`Falha industrial: ${m.def.name} (${SECTORS[m.sector - 1].code})`);
        break;
      }
      case 'surge': {
        const protectedBy = M.filter(m => m.def.behavior === 'surge');
        let hit = 0;
        for (const m of M) {
          if (m.def.power >= 0 || m.broken) continue;
          const [x, y] = g.machines.centerPx(m);
          if (protectedBy.some(p => { const [px, py] = g.machines.centerPx(p); return Math.hypot(px - x, py - y) / TILE < (p.def.radius ?? 12); })) continue;
          if (Math.random() < 0.18) { m.cond = Math.max(0, m.cond - 50); if (m.cond <= 0) { m.broken = true; } hit++; }
        }
        if (hit) { g.say('ev_surge', 60); g.toast(`Pico energético: ${hit} máquinas danificadas`, '#ffd04a'); this.record(`Pico energético (${hit} máquinas)`); }
        break;
      }
      case 'robot': {
        const free = g.robots.list.filter(r => !r.stuck && !r.broken);
        if (!free.length) break;
        const r = free[Math.floor(Math.random() * free.length)];
        r.stuck = true;
        g.say('ev_robot_lost', 60);
        g.scanner.addMarker(r.x, r.y, `${r.name} preso`, '#ffd27a', 'robot');
        this.record(`Robô preso: ${r.name}`);
        break;
      }
      case 'anomaly': {
        const secs = g.planet.layer >= 2 ? [g.planet.layer] : [];
        const s = secs[Math.floor(Math.random() * secs.length)];
        if (!s) break;
        for (let k = 0; k < 200; k++) {
          const x = Math.random() * 10240, y = Math.random() * 10240;
          if (g.world.sectorAtPx(x, y) !== s) continue;
          const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
          if (!g.world.explored[ty * 640 + tx] || IS_SOLID[g.world.get(Math.floor(x / CELL), Math.floor(y / CELL))]) continue;
          this.anomalies.push({ id: this.nextId++, x, y, sector: s, t: 0 });
          g.scanner.addMarker(x, y, 'Anomalia alienígena', '#b07aff', 'anomaly');
          g.say('ev_anomaly', 60);
          this.record(`Anomalia em ${SECTORS[s - 1].code}`);
          break;
        }
        break;
      }
      case 'alien': g.say('ev_alien', 90); g.fx.flashScreen([60, 230, 240], 0.25); this.record('Atividade alienígena detectada'); break;
      case 'storm': this.storm = 60; g.say('ev_storm', 120); this.record('Tempestade de poeira'); break;
      case 'ruin': {
        const site = g.world.gen.ruins.find(s => g.sectors.s[s.sector].discovered && !g.scanner.mapMarkers.some(m => m.kind === 'ruin' && Math.hypot(m.x - s.x0 * CELL, m.y - s.y0 * CELL) < 400));
        if (!site) break;
        g.scanner.addMarker((site.x0 + site.w / 2) * CELL, (site.y0 + site.h / 2) * CELL, site.kind === 'cidade' ? 'Cidade enterrada' : site.kind === 'templo' ? 'Templo' : 'Estrutura enterrada', '#4af0e0', 'ruin');
        g.say('ev_ruin', 60);
        this.record('Ruína localizada pela telemetria');
        break;
      }
    }
  }

  /** Decisões rápidas com risco e recompensa. */
  choice() {
    const g = this.g, p = g.player;
    if (g.ui.modalOpen() || g.build.active) { this.timer = 15; return; }
    const L = g.planet.layer, mul = Math.pow(2.2, L - 1);
    const pick = Math.floor(Math.random() * 3);
    if (pick === 0) {
      // bolsão instável perto do jogador
      let wall: [number, number] | null = null;
      for (let r = 20; r < 140 && !wall; r += 6) for (let a = 0; a < 16; a++) { const x = p.x + Math.cos(a / 16 * 6.283) * r, y = p.y + Math.sin(a / 16 * 6.283) * r; if (IS_SOLID[g.world.get(Math.floor(x / CELL), Math.floor(y / CELL))]) { wall = [x, y]; break; } }
      if (!wall) return;
      const [wx, wy] = wall;
      g.ui.mini.choice('BOLSÃO INSTÁVEL DETECTADO', 'BR-7: "Há um bolsão de Pyroxis sob pressão na parede ao lado. Detonar libera muito minério de uma vez — e pode desabar o teto."',
        [{ label: '💥 Detonar (minério + risco)', cls: 'orange', fn: () => { g.mining.detonate(wx, wy); g.mining.detonate(wx + 12, wy + 6); const sd = g.planet.def; for (const o of sd.ores.slice(0, 2)) g.mining.spawnDrop(wx, wy, matById(o.mat).item!, 60 * L); g.toast('Bolsão detonado: fragmentos de minério espalhados!', '#ffd04a'); } },
         { label: 'Isolar com segurança', cls: 'ghost', fn: () => { const c = Math.round(60 * mul); g.stock.credits += c; g.toast(`Isolado. Bônus de segurança: +${c} ◆`, '#9cff8a'); } }]);
    } else if (pick === 1) {
      g.ui.mini.choice('CARGA EXTRAVIADA', 'ZENA: "Um cargueiro Zenitex perdeu uma cápsula de suprimentos na sua região. Recuperá-la é opcional, como tudo que é bom para você."',
        [{ label: '📦 Ir buscar (marca no mapa)', cls: 'orange', fn: () => {
            for (let k = 0; k < 60; k++) {
              const a = Math.random() * 6.283, d = 160 + Math.random() * 200, x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
              const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
              if (IS_SOLID[g.world.get(cx, cy)] || !g.world.gen.insidePlanet(cx, cy)) continue;
              const ch = { id: g.chests.list.length, x: cx * CELL + 2, y: cy * CELL + 2, cx, cy, opened: false };
              g.chests.list.push(ch); g.scanner.addMarker(ch.x, ch.y, 'Carga extraviada', '#ffd04a', 'chest');
              g.toast('Cápsula marcada no mapa (amarelo).', '#ffd04a'); return;
            }
          } },
         { label: 'Ignorar', cls: 'ghost', fn: () => g.dialogue.line('zena', 'Recusa registrada. A cápsula será cobrada do seu bônus anual mesmo assim.') }]);
    } else {
      const top = Object.keys(g.stock.items).filter(k => g.stock.count(k) > 50).sort((a, b) => g.stock.count(b) - g.stock.count(a))[0];
      if (!top) return;
      const q = Math.floor(g.stock.count(top) * 0.25), price = Math.round(q * (ITEM[top]?.value ?? 1) * 3);
      g.ui.mini.choice('OFERTA RELÂMPAGO', `DIRETOR VARREN: "Um cliente quer ${fmtInt(q)} kg de ${ITEM[top]?.name} AGORA. Pago o triplo. Decide rápido, que eu não tenho o dia todo."`,
        [{ label: `Vender por ${fmtInt(price)} ◆`, cls: 'orange', fn: () => { g.stock.take(top, q); g.stock.credits += price; g.toast(`Vendido: +${fmtInt(price)} ◆`, '#ffd04a'); g.audio.success(); } },
         { label: 'Recusar', cls: 'ghost', fn: () => g.dialogue.line('varren', 'Recusou? Interessante. Vou anotar isso em algum lugar importante.') }]);
    }
  }

  supported(m: { tx: number; ty: number }) {
    for (const s of this.g.machines.list) {
      if (s.def.behavior !== 'support') continue;
      if (Math.hypot(s.tx - m.tx, s.ty - m.ty) <= (s.def.radius ?? 9)) return true;
    }
    return false;
  }

  /** Desabamento: preenche um círculo com entulho e pode soterrar máquinas. */
  caveIn(x: number, y: number, announce: boolean) {
    const g = this.g, w = g.world;
    if (this.supported({ tx: Math.floor(x / TILE), ty: Math.floor(y / TILE) })) return;
    const R = 5 + Math.random() * 4;
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    let filled = 0;
    for (let j = -Math.ceil(R); j <= R; j++) for (let i = -Math.ceil(R); i <= R; i++) {
      if (Math.hypot(i, j) > R - Math.random() * 1.5) continue;
      const px = (cx + i) * CELL, py = (cy + j) * CELL;
      if (w.get(cx + i, cy + j) !== MAT.AIR) continue;
      const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
      const occ = w.occ[ty * 640 + tx];
      if (occ) { const m = g.machines.byId.get(occ); if (m && m.def.behavior !== 'belt') { m.buried = 1; continue; } }
      if (Math.hypot(px - g.player.x, py - g.player.y) < 8) continue;
      w.set(cx + i, cy + j, MAT.RUBBLE);
      filled++;
    }
    for (const r of g.robots.list) if (Math.hypot(r.x - x, r.y - y) < R * CELL) r.stuck = true;
    if (filled) {
      g.fx.dust(x, y, 40);
      g.shake(5);
      g.audio.rumble();
      g.stats.caveins++;
      if (announce) { g.say('ev_cavein', 40); g.scanner.addMarker(x, y, 'Desabamento', '#ff8a3a', 'cavein'); this.record(`Desabamento em ${SECTORS[(w.sectorAtPx(x, y) || 1) - 1].code}`); }
    }
  }

  /** Novo depósito raro surge na rocha perto da área explorada. */
  deposit() {
    const g = this.g, w = g.world, p = g.player;
    const sec = g.world.sectorAtPx(p.x, p.y) || 1;
    const sd = SECTORS[sec - 1];
    const rare = sd.ores.filter(o => matById(o.mat).rare);
    const ore = rare.length ? rare[Math.floor(Math.random() * rare.length)].mat : sd.ores[0].mat;
    for (let k = 0; k < 60; k++) {
      const a = Math.random() * Math.PI * 2, d = 140 + Math.random() * 260;
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
      if (w.sectorAtPx(x, y) !== sec || !IS_SOLID[w.get(cx, cy)] || matById(w.get(cx, cy)).kind !== 'rock') continue;
      for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) if (Math.hypot(i, j) < 3.2 && matById(w.get(cx + i, cy + j)).kind === 'rock') w.set(cx + i, cy + j, ore);
      g.scanner.addMarker(x, y, `Depósito: ${matById(ore).name}`, '#ffd04a', 'deposit');
      g.say('ev_deposit', 60);
      this.record(`Depósito de ${matById(ore).name} detectado`);
      return;
    }
  }

  resolveAnomaly(a: Anomaly) {
    const g = this.g;
    this.anomalies.splice(this.anomalies.indexOf(a), 1);
    g.scanner.mapMarkers = g.scanner.mapMarkers.filter(m => !(m.kind === 'anomaly' && Math.hypot(m.x - a.x, m.y - a.y) < 30));
    g.pack.add('artefato', 3) || g.stock.add('artefato', 3, false);
    g.stock.credits += 500 * a.sector;
    g.stats.anomalies++;
    g.dialogue.line('sera', 'A anomalia se acalmou quando você chegou perto. Como se tivesse sido... ouvida.');
    g.dialogue.line('zena', 'Anomalia neutralizada. Sistemas normalizados. Fragmentos recolhidos para avaliação.');
  }

  serialize() { return { anomalies: this.anomalies, nextId: this.nextId }; }
  load(s: any) { this.anomalies = s.anomalies ?? []; this.nextId = s.nextId ?? 1; }
}
