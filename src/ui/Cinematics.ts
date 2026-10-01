import type { Game } from '../Game';
import type { UI } from './UI';
import { INTRO } from '../data/dialogue';
import { SPEAKERS } from '../data/dialogue';
import { renderPlanet } from './Orbital';
import { fmtInt, fmtTime, fmtShort } from '../core/math';
import { LORE } from '../data/lore';
import { esc, h } from './dom';

/** Abertura (chegada ao planeta) e encerramento (planeta removido). */
export class Cinematics {
  active = false;
  private raf = 0;

  constructor(private g: Game, private ui: UI) {}

  intro(onDone: () => void) {
    const g = this.g;
    this.active = true;
    const layer = this.ui.cineLayer;
    layer.innerHTML = `<canvas class="cine-c"></canvas><div class="cine-sub"></div><button class="cine-skip">Pular ›</button>`;
    layer.classList.add('show');
    const c = layer.querySelector('canvas')!;
    const x = c.getContext('2d')!;
    const sub = layer.querySelector<HTMLElement>('.cine-sub')!;
    const resize = () => { c.width = innerWidth; c.height = innerHeight; };
    resize();
    const planet = renderPlanet(g, 600, 0);
    const stars = Array.from({ length: 300 }, () => [Math.random(), Math.random(), Math.random()]);
    let t = 0, last = performance.now(), li = -1;
    const lines = INTRO;
    const finish = () => { cancelAnimationFrame(this.raf); layer.classList.remove('show'); layer.innerHTML = ''; this.active = false; onDone(); };
    layer.querySelector('.cine-skip')!.addEventListener('click', finish);
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      const W = c.width, H = c.height;
      x.fillStyle = '#01030a'; x.fillRect(0, 0, W, H);
      for (const [sx, sy, b] of stars) { x.fillStyle = `rgba(255,255,255,${b * 0.8})`; x.fillRect(sx * W, sy * H, b > 0.8 ? 2 : 1, b > 0.8 ? 2 : 1); }
      // planeta aproximando
      const zoom = Math.min(1, t / 14);
      const size = Math.min(W, H) * (0.35 + zoom * 0.9);
      const px = W * 0.62 - zoom * W * 0.1, py = H * 0.5 + zoom * H * 0.25;
      x.drawImage(planet, px - size / 2, py - size / 2, size, size);
      // nave
      const sx = W * (0.05 + Math.min(1, t / 12) * 0.45), sy = H * (0.25 + Math.sin(t * 0.5) * 0.02 + Math.min(1, t / 12) * 0.12);
      x.fillStyle = '#c8ccd6'; x.fillRect(sx - 30, sy - 6, 60, 12); x.fillStyle = '#e8962a'; x.fillRect(sx - 30, sy - 6, 14, 12); x.fillRect(sx + 18, sy - 3, 14, 6);
      x.fillStyle = '#2a2e38'; x.fillRect(sx - 10, sy - 9, 24, 3);
      x.fillStyle = `rgba(90,180,255,${0.6 + Math.random() * 0.4})`; x.fillRect(sx - 40, sy - 3, 10, 6);
      // cápsula descendo
      if (t > 12.5) {
        const k = Math.min(1, (t - 12.5) / 3);
        const cx = sx + 10 + k * (px - sx - 10) * 0.9, cy = sy + k * (py - size * 0.42 - sy);
        x.fillStyle = '#e8962a'; x.beginPath(); x.arc(cx, cy, 4, 0, 7); x.fill();
        x.fillStyle = `rgba(255,160,60,${0.6})`; x.fillRect(cx - 1, cy - 14 * k, 2, 10 * k);
      }
      // falas
      const idx = Math.min(lines.length - 1, Math.floor(t / 3.4));
      if (idx !== li) { li = idx; const [sp, text] = lines[idx]; sub.innerHTML = `<b style="color:${SPEAKERS[sp].color}">${SPEAKERS[sp].name}</b> ${esc(text)}`; g.audio.blip(sp); }
      if (t > 16.5) { x.fillStyle = `rgba(0,0,0,${Math.min(1, (t - 16.5) / 1.2)})`; x.fillRect(0, 0, W, H); }
      if (t > 17.8) { finish(); return; }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  ending() {
    const g = this.g;
    this.active = true;
    const layer = this.ui.cineLayer;
    layer.innerHTML = `<canvas class="cine-c"></canvas><div class="cine-big"></div><div class="cine-sub"></div>`;
    layer.classList.add('show');
    const c = layer.querySelector('canvas')!; c.width = innerWidth; c.height = innerHeight;
    const x = c.getContext('2d')!;
    const big = layer.querySelector<HTMLElement>('.cine-big')!;
    const sub = layer.querySelector<HTMLElement>('.cine-sub')!;
    const frames = [0.99, 0.995, 0.998, 0.9995].map(f => renderPlanet(g, 500, f));
    const frags = Array.from({ length: 140 }, () => ({ a: Math.random() * Math.PI * 2, r: Math.random() * 0.2, v: 20 + Math.random() * 80, s: 2 + Math.random() * 6, c: Math.random() < 0.3 ? '#ff8a3a' : '#6a4a3a' }));
    let t = 0, last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      const W = c.width, H = c.height;
      x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
      for (let i = 0; i < 200; i++) { x.fillStyle = `rgba(255,255,255,${(i * 37 % 10) / 14})`; x.fillRect((i * 97 % 1000) / 1000 * W, (i * 53 % 1000) / 1000 * H, 1, 1); }
      const cx = W / 2, cy = H / 2;
      if (t < 6) {
        const fi = Math.min(3, Math.floor(t / 1.5));
        const sh = (Math.random() - 0.5) * Math.min(10, t * 2);
        x.drawImage(frames[fi], cx - 250 + sh, cy - 250 + sh);
        if (Math.random() < 0.3) g.audio.rumble();
      }
      if (t > 4) {
        const k = t - 4;
        for (const f of frags) {
          const r = 60 + f.r * 200 + f.v * k;
          x.fillStyle = f.c; x.globalAlpha = Math.max(0, 1 - k / 8);
          x.fillRect(cx + Math.cos(f.a) * r, cy + Math.sin(f.a) * r, f.s, f.s);
        }
        x.globalAlpha = 1;
        if (k < 1.2) { x.fillStyle = `rgba(255,220,160,${1 - k / 1.2})`; x.fillRect(0, 0, W, H); }
      }
      if (t > 7 && t < 7.1) { big.innerHTML = 'PLANETARY EXTRACTION: <b>100%</b>'; big.className = 'cine-big show'; g.audio.success(); }
      if (t > 10.5 && t < 10.6) { big.innerHTML = 'ASSET DEPLETED.'; big.className = 'cine-big show red'; }
      if (t > 13 && t < 13.1) { big.className = 'cine-big'; }
      if (t > 16 && t < 16.1) sub.innerHTML = `<b style="color:#ffb000">ZENITEX</b> Excelente trabalho. Um corpo planetário a menos ocupando espaço improdutivamente. Seu próximo contrato já está disponível.`;
      if (t > 23 && t < 23.1) sub.innerHTML = `<b style="color:#9ab">TELEMETRIA</b> Sinal não identificado detectado deixando o sistema. 4,1 bilhões de padrões. Classificação: irrelevante.`;
      if (t > 29) { this.report(); return; }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private report() {
    cancelAnimationFrame(this.raf);
    const g = this.g, s = g.stats;
    const totalOre = Object.values(s.mined).reduce((a, b) => a + b, 0);
    const value = g.stock.credits + s.shipped * 3;
    const layer = this.ui.cineLayer;
    const sectorsAuto = Array.from({ length: 12 }, (_, i) => i + 1).filter(i => g.sectors.automated(i)).length;
    const el = h(`<div class="report"><div class="logo-big">⬢ ZENITEX</div><h1>RELATÓRIO DE ENCERRAMENTO — CONTRATO 7-K${36 + g.opts.contract}</h1>
      <div class="rgrid">
        ${[['Tempo de operação', fmtTime(g.time)], ['Massa extraída', fmtInt(g.planet.total) + ' t'], ['Setores automatizados', `${sectorsAuto}/12`], ['Minério extraído manualmente', fmtShort(totalOre) + ' kg'],
          ['Enviado à Zenitex', fmtShort(s.shipped) + ' kg'], ['Descobertas arqueológicas', `${g.lore.unlocked.size}/${LORE.length}`], ['Estruturas preservadas', String(g.lore.preserved)], ['Estruturas demolidas', String(g.lore.demolished)],
          ['Artefatos destruídos pela automação', String(g.lore.destroyed)], ['Mortes', String(s.deaths)], ['Desabamentos', String(s.caveins)], ['Reparos manuais', String(s.repairs)],
          ['Calibrações manuais', String(s.calibrations)], ['Máquinas construídas', String(s.built)], ['Robôs fabricados', String(s.robots)], ['Contratos concluídos', String(s.contracts)],
          ['Eficiência', `${Math.round(Math.min(100, (s.calibrations * 2 + s.repairs) / Math.max(1, s.built) * 100))}%`], ['Valor total gerado', fmtShort(value) + ' ◆']].map(([a, b]) => `<div><small>${a}</small><b>${b}</b></div>`).join('')}
      </div>
      <p class="rq">"${g.lore.preserved > g.lore.demolished ? 'Notamos uma tendência preservacionista em seu histórico. Isso será discutido em sua avaliação de desempenho.' : 'Desempenho exemplar. Nenhum valor histórico foi desperdiçado.'}" — Diretor Varren</p>
      <p class="rq sera">"Eu guardei as fotos. Todas. Alguém precisa lembrar." — Dra. Sera Venn</p>
      <div class="row"><button class="btn big green" data-a="ng">ACEITAR NOVO CONTRATO PLANETÁRIO</button><button class="btn ghost" data-a="stay">Permanecer nos destroços</button></div>
      <small class="muted">Novo contrato: planeta maior, novos perigos. Tecnologias corporativas permanecem.</small></div>`);
    layer.appendChild(el);
    el.querySelector('[data-a="ng"]')!.addEventListener('click', () => (window as any).zenitexNewGamePlus());
    el.querySelector('[data-a="stay"]')!.addEventListener('click', () => { layer.classList.remove('show'); layer.innerHTML = ''; this.active = false; g.flags.ending = false; });
  }
}
