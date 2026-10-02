import type { Game } from '../Game';
import type { UI } from './UI';
import type { Machine } from '../systems/Machines';
import { SECTORS } from '../data/sectors';
import { esc, h } from './dom';
import { ITEM } from '../data/items';
import { gradeLabel, gradeColor, compOf, RAW_BY_LAYER } from '../data/composition';
import { fmtInt } from '../core/math';

const kg1 = (x: number) => (x >= 100 ? fmtInt(x) : x.toFixed(1).replace('.', ','));

/**
 * Operações manuais que robôs não fazem: calibração, auditoria, decisões.
 */
export class Minigames {
  private el: HTMLElement | null = null;
  private raf = 0;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(private g: Game, private ui: UI) {}
  isOpen() { return !!this.el; }
  close() {
    cancelAnimationFrame(this.raf);
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = null;
    this.el?.remove(); this.el = null;
  }

  private mount(html: string) {
    this.close();
    this.el = h(`<div class="mg-layer"><div class="mg ui-block">${html}</div></div>`);
    document.body.appendChild(this.el);
    return this.el;
  }

  /** Calibração: 3 ponteiros que precisam parar na faixa verde. */
  calibration(m: Machine | null, mode: 'normal' | 'final', after?: (q: number) => void) {
    const final = mode === 'final';
    const labels = final ? ['Fase de ressonância', 'Pressão do manto', 'Campo de contenção', 'Fluxo do núcleo'] : ['Pressão', 'Energia', m?.def.behavior === 'drill' ? 'Velocidade de perfuração' : m?.overheat ? 'Refrigeração' : 'Velocidade'];
    const el = this.mount(`<div class="mg-h">${final ? '⚠ ESTABILIZADOR DO NÚCLEO' : '🎛 CALIBRAÇÃO MANUAL'} <small>${esc(m?.def.name ?? 'Coração Planetário')}</small></div>
      <p class="muted">Pare o ponteiro na faixa verde: <kbd>Espaço</kbd> ou clique/toque. ${final ? 'O núcleo não perdoa.' : 'Robôs não têm dedos para isto.'}</p>
      <div class="dials">${labels.map((l, i) => `<div class="dial" data-i="${i}"><span>${l}</span><div class="track"><div class="zone"></div><div class="perfect"></div><div class="needle"></div></div><b class="res"></b></div>`).join('')}</div>
      <button class="btn big stopbtn">PARAR</button>`);
    const dials = Array.from(el.querySelectorAll<HTMLElement>('.dial'));
    const state = dials.map(() => {
      const w = final ? 0.12 + Math.random() * 0.04 : 0.2 + Math.random() * 0.08;
      return { pos: Math.random(), dir: 1, speed: (final ? 1.3 : 0.75) + Math.random() * 0.5, zs: 0.1 + Math.random() * (0.8 - w), w, done: false, score: 0 };
    });
    dials.forEach((d, i) => { const z = d.querySelector<HTMLElement>('.zone')!; z.style.left = state[i].zs * 100 + '%'; z.style.width = state[i].w * 100 + '%'; const p = d.querySelector<HTMLElement>('.perfect')!; p.style.left = (state[i].zs + state[i].w * 0.4) * 100 + '%'; p.style.width = state[i].w * 20 + '%'; });
    let cur = 0, last = performance.now(), fails = 0;
    const stop = () => {
      const s = state[cur];
      if (!s) return;
      const center = s.zs + s.w / 2;
      const inside = s.pos >= s.zs && s.pos <= s.zs + s.w;
      const res = dials[cur].querySelector('.res')!;
      if (!inside) {
        fails++;
        res.textContent = '✖'; (res as HTMLElement).style.color = '#ff5a3a';
        this.g.audio.error(); this.g.shake(2);
        if (final) { this.g.player.hurt(6, 'descarga do núcleo'); }
        s.speed *= 1.08;
        if (fails >= (final ? 5 : 4)) { this.g.toast('Calibração falhou. Tente novamente.', '#ff6a3a'); this.close(); return; }
        return;
      }
      s.score = 1 - Math.abs(s.pos - center) / (s.w / 2);
      res.textContent = s.score > 0.8 ? 'PERFEITO' : 'OK'; (res as HTMLElement).style.color = s.score > 0.8 ? '#4af0e0' : '#9cff8a';
      s.done = true;
      this.g.audio.click();
      cur++;
      if (cur >= state.length) {
        const q = state.reduce((a, b) => a + b.score, 0) / state.length;
        setTimeout(() => {
          this.close();
          if (m) this.g.machines.calibrated(m, q);
          after?.(q);
          this.g.toast(`Calibração concluída — precisão ${Math.round(q * 100)}%`, '#9cff8a');
        }, 350);
      }
    };
    el.querySelector('.stopbtn')!.addEventListener('click', stop);
    el.querySelector('.track')?.parentElement?.parentElement?.addEventListener('click', e => { if ((e.target as HTMLElement).closest('.track')) stop(); });
    this.keyHandler = (e: KeyboardEvent) => { if (e.key === ' ' || e.key === 'e' || e.key === 'Enter') { e.preventDefault(); stop(); } if (e.key === 'Escape') this.close(); };
    window.addEventListener('keydown', this.keyHandler);
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      state.forEach((s, i) => {
        if (s.done) return;
        if (i === cur) { s.pos += s.dir * s.speed * dt; if (s.pos > 1) { s.pos = 1; s.dir = -1; } if (s.pos < 0) { s.pos = 0; s.dir = 1; } }
        dials[i].classList.toggle('active', i === cur);
        dials[i].querySelector<HTMLElement>('.needle')!.style.left = s.pos * 100 + '%';
      });
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Formulário de auditoria Z-77: a resposta certa é sempre a mais corporativa. */
  audit(sector: number) {
    const Q: [string, string[], number][] = [
      ['Durante a operação, uma estrutura alienígena foi encontrada. Qual é o procedimento correto?', ['Interromper a extração e preservar', 'Notificar o Jurídico e continuar a extração', 'Chorar baixinho'], 1],
      ['Qual é a prioridade número 1 da Zenitex?', ['Segurança do colaborador', 'Margem operacional', 'Preservação ambiental'], 1],
      ['Um colaborador relata calor excessivo (140 °C). A classificação correta é:', ['Ambiente de baixo risco', 'Emergência', 'Motivo para pausa'], 0],
      ['Complete o slogan: "Preservação é apenas…"', ['…um direito fundamental', '…mineração atrasada', '…uma opção'], 1],
      ['Quantos planetas são necessários para um colaborador feliz?', ['Um, intacto', 'Nenhum: felicidade não é KPI', 'Depende do bônus'], 1],
      ['O que significa "automação total"?', ['O fim do trabalho manual', 'Algo que não existe', 'Férias'], 1],
      ['Uma IA corporativa sugere que você descanse. Você deve:', ['Descansar', 'Reportar a IA por mau funcionamento', 'Desconfiar e continuar trabalhando'], 2],
    ];
    const qs = Q.sort(() => Math.random() - 0.5).slice(0, 3);
    let i = 0, wrong = 0;
    const render = () => {
      const [q, opts] = qs[i];
      this.mount(`<div class="mg-h">📋 FORMULÁRIO DE AUDITORIA Z-77 <small>${SECTORS[sector - 1].code} · pergunta ${i + 1}/3</small></div>
        <p class="audit-q">${esc(q)}</p><div class="opts">${opts.map((o, k) => `<button data-k="${k}"><span>${String.fromCharCode(65 + k)}.</span> ${esc(o)}</button>`).join('')}</div>
        <p class="muted">Departamento de Conformidade · Tempo médio de análise: 3 a 400 dias úteis.</p>`);
      this.el!.querySelectorAll<HTMLElement>('button[data-k]').forEach(b => b.addEventListener('click', () => {
        if (Number(b.dataset.k) === qs[i][2]) { this.g.audio.click(); i++; }
        else { wrong++; this.g.audio.error(); this.g.toast('Resposta registrada como "inadequada ao perfil corporativo".', '#ff8a3a'); }
        if (wrong >= 2) { this.close(); this.g.dialogue.line('zenitex', 'Formulário Z-77 rejeitado. Reenvie após reflexão produtiva.'); return; }
        if (i >= qs.length) { this.close(); this.g.sectors.s[sector].auditPassed = true; this.g.dialogue.line('zenitex', 'Formulário Z-77 aprovado. Sua alma corporativa foi validada.'); this.g.audio.success(); return; }
        render();
      }));
    };
    render();
  }

  /** Briefing do contrato: quem você é, o objetivo e o ciclo de jogo. */
  briefing(onDone: () => void) {
    const P: [string, string, string][] = [
      ['zenitex', 'QUEM VOCÊ É', 'Você é um <b>minerador contratado pela ZENITEX Planetary Resources</b>. A Zenitex procura <b>MUNDOS MORTOS</b>: núcleo resfriado, sem tectônica, sem magnetosfera, sem biosfera, sem valor de colonização. Juridicamente, <b>RECURSO PLANETÁRIO RECUPERÁVEL</b>. O seu é o <b>K-37</b>.'],
      ['zena', 'O OBJETIVO', 'Remover <b>100% da massa do planeta</b>, camada por camada. A barra da <b>CAMADA</b> mede massa <b>REMOVIDA</b>: minerais separados e resíduo exportado. Escavar não basta — o planeta só fica menor quando a massa sai dele.'],
      ['rocha', 'COMO SE AVANÇA', '<ul><li><b>Cave</b>: o feixe solta o chão em <b>grãos</b> de material bruto (Solo K-37) e o aspirador da arma puxa e guarda. O <b>jetpack</b> te tira do buraco. Com <b>SOPRAR</b>, a mesma arma joga material da mochila em funis e esteiras.</li><li><b>Processe</b> no <b>Analisador de Matriz</b> da base: viram minerais (Ferronox, Lumenita…) e <b>resíduo</b>.</li><li>Com os minerais você <b>constrói</b>. <b>Automatize</b>: perfuradora → esteira → processador → compactador → terminal orbital.</li><li>O resíduo é ~80% do planeta: <b>compacte em blocos e exporte</b>.</li></ul>'],
      ['br7', 'A ESCALA', 'O planeta tem <b>7 camadas</b>, da superfície ao núcleo. Cada material exige um processamento diferente: terra se separa por ressonância, rocha precisa ser triturada, cristal precisa de cuidado, manto precisa ser descomprimido.<br><br><b>Nenhuma automação é total:</b> gargalos aparecem, máquinas quebram, regiões se esgotam. Você sempre terá trabalho.'],
      ['sera', 'O QUE NINGUÉM TE CONTOU', 'A Zenitex diz que o planeta é abandonado. Mas há <b>ruínas com brilho ciano</b> pelo caminho. Pare perto delas e segure <b>E</b> para catalogar os registros no Arquivo. Talvez você descubra quem morava aqui.'],
    ];
    let i = 0;
    const render = () => {
      const [sp, t, body] = P[i];
      const el = this.mount(`<div class="brief"><div class="mg-h">📋 BRIEFING DO CONTRATO <small>${i + 1}/${P.length} · ${t}</small></div>
        <div class="bp"><img src="${this.g.sprites.portraitUrl(sp as any)}"><div class="bt">${body}</div></div>
        <div class="bnav"><button class="btn ghost" data-b="prev" ${i === 0 ? 'disabled' : ''}>‹ Voltar</button><span class="dots">${P.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</span>
        <button class="btn orange" data-b="next">${i === P.length - 1 ? 'COMEÇAR O TRABALHO' : 'Próximo ›'}</button></div></div>`);
      el.querySelector('[data-b="prev"]')!.addEventListener('click', () => { i = Math.max(0, i - 1); render(); });
      el.querySelector('[data-b="next"]')!.addEventListener('click', () => { if (i < P.length - 1) { i++; render(); } else { this.close(); onDone(); } });
    };
    render();
  }

  /**
   * ANALISADOR DE MATRIZ ZENITEX — processamento manual.
   * Escolher material → sintonizar a frequência (um toque) → centrífuga → relatório do que existe dentro.
   */
  analyzer(pick?: string, amount?: number) {
    const g = this.g;
    const src = g.rawAvailable();
    const cap = g.analyzerCap();
    const yard = g.machines.yardRoom();
    const yardCap = g.machines.yardCap();
    if (!src.length) {
      const el = this.mount(`<div class="mg-h">🔬 ANALISADOR DE MATRIZ <small>processamento manual</small></div>
        <p>Sem material bruto. <b>Minere a terra</b> (o aspirador da arma guarda) e volte aqui — ou traga por esteira até o armazém.</p>
        <p class="muted">Ninguém sabe o que existe dentro do ${esc(ITEM[RAW_BY_LAYER[g.planet.layer]]?.name ?? 'material')} até processar.</p>
        <div class="row"><button class="btn orange" data-b="x">ENTENDIDO</button></div>`);
      el.querySelector('[data-b="x"]')!.addEventListener('click', () => this.close());
      return;
    }
    let sel = src.find(x => x.k === pick) ?? src[0];
    let qty = Math.min(amount ?? cap, cap, sel.q);
    const render = () => {
      const opts = [25, 50, 100, cap].filter((v, i, a) => v <= cap && a.indexOf(v) === i);
      const blocked = yard < Math.min(qty, sel.q) * 0.8;
      const el = this.mount(`<div class="mg-h">🔬 ANALISADOR DE MATRIZ ZENITEX <small>processamento manual</small></div>
        <div class="an-src">${src.map(x => `<button class="an-it ${x.k === sel.k ? 'on' : ''}" data-k="${x.k}"><img src="${g.sprites.itemUrl(x.k)}"><span><b>${esc(ITEM[x.k]?.name ?? x.k)}</b><small>${fmtInt(x.q)} kg · teor <i style="color:${gradeColor(x.grade)}">${gradeLabel(x.grade)}</i></small></span></button>`).join('')}</div>
        <div class="an-q"><span>Carga:</span>${opts.map(v => `<button class="btn ${Math.min(v, sel.q) === qty ? 'orange' : 'ghost'}" data-q="${v}">${fmtInt(Math.min(v, sel.q))} kg</button>`).join('')}</div>
        <p class="muted">Pátio de resíduo: ${fmtInt(yardCap - yard)} / ${fmtInt(yardCap)} kg${blocked ? ' — <b class="warn">CHEIO: construa um Compactador e exporte blocos</b>' : ''}</p>
        <div class="row"><button class="btn ghost" data-b="x">FECHAR</button><button class="btn orange big" data-b="go" ${blocked ? 'disabled' : ''}>INICIAR ▸</button></div>`);
      el.querySelectorAll<HTMLElement>('[data-k]').forEach(b => b.addEventListener('click', () => { sel = src.find(x => x.k === b.dataset.k)!; qty = Math.min(qty, sel.q) || Math.min(cap, sel.q); render(); }));
      el.querySelectorAll<HTMLElement>('[data-q]').forEach(b => b.addEventListener('click', () => { qty = Math.min(Number(b.dataset.q), sel.q); render(); }));
      el.querySelector('[data-b="x"]')!.addEventListener('click', () => this.close());
      el.querySelector('[data-b="go"]')!.addEventListener('click', () => { if (blocked) { g.say('yard_full', 20); return; } this.tune(sel.k, qty); });
    };
    render();
  }

  /** Sintonia de frequência: um toque na faixa verde. Errar não perde nada: só rende menos. */
  private tune(k: string, qty: number) {
    const el = this.mount(`<div class="mg-h">🔬 SINTONIZE A FREQUÊNCIA <small>${esc(ITEM[k]?.name ?? k)} · ${fmtInt(qty)} kg</small></div>
      <p class="muted">Toque em <b>PULSO</b> quando o ponteiro passar pela faixa verde. Quanto mais no centro, mais mineral sai do material.</p>
      <div class="dials"><div class="dial active"><span>Frequência de ressonância</span><div class="track"><div class="zone"></div><div class="perfect"></div><div class="needle"></div></div><b class="res"></b></div></div>
      <button class="btn big orange stopbtn">PULSO</button>`);
    const w = 0.22, zs = 0.15 + Math.random() * 0.6;
    const z = el.querySelector<HTMLElement>('.zone')!; z.style.left = zs * 100 + '%'; z.style.width = w * 100 + '%';
    const p = el.querySelector<HTMLElement>('.perfect')!; p.style.left = (zs + w * 0.4) * 100 + '%'; p.style.width = w * 20 + '%';
    const needle = el.querySelector<HTMLElement>('.needle')!;
    let pos = Math.random(), dir = 1, last = performance.now(), done = false;
    const stop = () => {
      if (done) return;
      done = true;
      const inside = pos >= zs && pos <= zs + w;
      const score = inside ? 1 - Math.abs(pos - (zs + w / 2)) / (w / 2) : 0;
      const eff = inside ? 0.86 + 0.12 * score : 0.72;
      const res = el.querySelector<HTMLElement>('.res')!;
      res.textContent = !inside ? 'FORA DE FASE' : score > 0.75 ? 'RESSONÂNCIA PERFEITA' : 'EM FASE';
      res.style.color = !inside ? '#ff8a3a' : score > 0.75 ? '#4af0e0' : '#9cff8a';
      if (inside) this.g.audio.click(); else this.g.audio.error();
      setTimeout(() => this.spin(k, qty, eff), 450);
    };
    el.querySelector('.stopbtn')!.addEventListener('click', stop);
    el.querySelector('.track')!.addEventListener('click', stop);
    this.keyHandler = (e: KeyboardEvent) => { if (e.key === ' ' || e.key === 'e' || e.key === 'Enter') { e.preventDefault(); stop(); } if (e.key === 'Escape') this.close(); };
    window.addEventListener('keydown', this.keyHandler);
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      if (!done) { pos += dir * 0.9 * dt; if (pos > 1) { pos = 1; dir = -1; } if (pos < 0) { pos = 0; dir = 1; } needle.style.left = pos * 100 + '%'; }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Centrífuga curta (antecipação) e depois o relatório. */
  private spin(k: string, qty: number, eff: number) {
    const g = this.g;
    const comp = compOf(Math.max(1, RAW_BY_LAYER.indexOf(k)) || g.planet.layer);
    const el = this.mount(`<div class="an-spin"><div class="an-rotor"><i></i><i></i><i></i></div><div class="mg-h">CENTRIFUGANDO…</div>
      <div class="an-bars">${[...comp.minerals.map(m => m.k), 'residuo'].map(x => `<div><span>${esc(ITEM[x]?.name ?? x)}</span><b><i></i></b></div>`).join('')}</div></div>`);
    g.audio.scan();
    el.querySelectorAll<HTMLElement>('.an-bars b i').forEach((b, i) => setTimeout(() => { b.style.width = '100%'; }, 80 + i * 180));
    setTimeout(() => {
      const r = g.analyze(k, qty, eff);
      if (!r) { this.close(); g.toast('Pátio de resíduo cheio: compacte e exporte antes de analisar mais.', '#ff8a3a'); g.say('yard_full', 20); return; }
      this.report(k, r, eff);
    }, 1150);
  }

  private report(k: string, r: { kg: number; grade: number; out: Record<string, number>; residue: number; pay: number }, eff: number) {
    const g = this.g;
    const comp = compOf(Math.max(1, RAW_BY_LAYER.indexOf(k)) || g.planet.layer);
    const rows = Object.keys(r.out).sort((a, b) => r.out[b] - r.out[a]);
    const line = (key: string, q: number, cls = '') => `<div class="an-row ${cls}"><img src="${g.sprites.itemUrl(key)}"><span>${esc(ITEM[key]?.name ?? key)}${cls === 'rare' ? ' <em>★ RARO</em>' : ''}</span><b>${kg1(q)} kg</b><small>${(q / r.kg * 100).toFixed(1).replace('.', ',')}%</small><i style="width:${Math.max(2, q / r.kg * 100)}%"></i></div>`;
    const el = this.mount(`<div class="an-res"><div class="ups-t">ANÁLISE CONCLUÍDA</div>
      <h2>${fmtInt(r.kg)} kg ${esc((ITEM[k]?.name ?? k).toUpperCase())} PROCESSADO</h2>
      <div class="an-rows">${rows.map(x => line(x, r.out[x], x === comp.rare.k ? 'rare' : '')).join('')}${line('residuo', r.residue, 'res')}</div>
      <p class="muted">Teor <b style="color:${gradeColor(r.grade)}">${gradeLabel(r.grade)}</b> · Eficiência ${Math.round(eff * 100)}% · +${fmtInt(r.pay)} ◆ créditos · Minerais → Estoque · Resíduo → Pátio</p>
      <div class="row"><button class="btn ghost" data-b="x">FECHAR</button><button class="btn orange big" data-b="again">PROCESSAR DE NOVO</button></div></div>`);
    if (rows.includes(comp.rare.k)) { g.fx.flashScreen([255, 220, 120], 0.25); g.audio.discover(true); } else g.audio.success();
    el.querySelector('[data-b="x"]')!.addEventListener('click', () => this.close());
    el.querySelector('[data-b="again"]')!.addEventListener('click', () => this.analyzer(k, r.kg));
  }

  /** Momento de melhoria: antes → depois, grande e claro. */
  upgradeShow(title: string, rows: [string, string, string][], note = '') {
    const el = this.mount(`<div class="upshow"><div class="ups-t">✚ MELHORIA</div><h2>${esc(title)}</h2>
      <div class="ups-rows">${rows.map(([k, a, b]) => `<div><span>${esc(k)}</span><em>${esc(a)}</em><i>➜</i><b>${esc(b)}</b></div>`).join('')}</div>
      ${note ? `<p class="muted">${esc(note)}</p>` : ''}<button class="btn orange big">ÓTIMO</button></div>`);
    el.querySelector('button')!.addEventListener('click', () => this.close());
    this.g.fx.flashScreen([255, 210, 120], 0.35);
    this.g.audio.discover(true);
  }

  choice(title: string, body: string, opts: { label: string; cls: string; fn: () => void }[]) {
    const el = this.mount(`<div class="mg-h">${esc(title)}</div><p class="choice-b">${body}</p><div class="row">${opts.map((o, i) => `<button class="btn ${o.cls}" data-i="${i}">${esc(o.label)}</button>`).join('')}</div>`);
    el.querySelectorAll<HTMLElement>('button[data-i]').forEach(b => b.addEventListener('click', () => { this.close(); opts[Number(b.dataset.i)].fn(); }));
    void this.ui;
  }
}
