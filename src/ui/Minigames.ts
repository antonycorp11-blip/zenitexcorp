import type { Game } from '../Game';
import type { UI } from './UI';
import type { Machine } from '../systems/Machines';
import { SECTORS } from '../data/sectors';
import { esc, h } from './dom';

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
      ['zenitex', 'QUEM VOCÊ É', 'Você é um <b>minerador contratado pela ZENITEX Planetary Resources</b>, uma corporação que compra planetas "improdutivos" para desmontá-los e vender a matéria. Seu contrato é com o planeta <b>K-37</b>.'],
      ['zena', 'O OBJETIVO', 'Extrair <b>100% da massa do planeta</b>. O número no canto superior esquerdo, <b>MASSA PLANETÁRIA EXTRAÍDA</b>, é o seu placar. Cada pedra que você remove conta. Quando chegar a 100%, o planeta deixa de existir e o contrato termina.'],
      ['rocha', 'COMO SE AVANÇA', '<ul><li><b>Minere</b> com o perfurador: o minério vai para a mochila.</li><li><b>Entregue</b> no Centro de Comando (cápsula laranja): vira o seu Estoque Central.</li><li>Com o estoque você <b>constrói</b> máquinas e <b>pesquisa</b> tecnologias.</li><li><b>Automatize</b>: perfuradoras quebram a rocha sozinhas e esteiras levam o minério até o armazém da base.</li></ul>'],
      ['br7', 'A ESCALA', 'O planeta tem <b>7 camadas</b>, da superfície ao núcleo. Cada camada passa por 9 fases até ser <b>certificado</b> e liberar os Complexos de Extração, que drenam milhões de toneladas. Setores mais fundos exigem perfuradores melhores e proteção contra calor, frio e toxinas.<br><br><b>Nenhuma automação é total:</b> máquinas quebram, perfuradoras precisam de outro lugar, robôs travam. Você sempre terá trabalho manual.'],
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
