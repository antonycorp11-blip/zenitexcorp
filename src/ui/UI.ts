import { FAB_UPS, fabLevel } from '../data/factory';
import { siloHelp } from '../systems/SiloHelp';
import { METAS } from '../data/metas';
import { fmtInt, fmtShort, fmtMass, fmtTime } from '../core/math';
import { TILE, WORLD_TW, WORLD_TH, WORLD_PX_W, WORLD_PX_H, WORLD_W, WORLD_H, CELL } from '../core/constants';
import { SECTORS, HAZARD_NAMES, type HazardKey } from '../data/sectors';
import { SPEAKERS } from '../data/dialogue';
import { ITEM, TOP_BAR_ITEMS, itemName } from '../data/items';
import { SLOGANS } from '../data/slogans';
import { MACHINE, MACHINES, MACHINE_CATS } from '../data/machines';
import { rawOf, compOf } from '../data/composition';
import type { LoreDef } from '../data/lore';
import type { Game } from '../Game';
import type { Machine } from '../systems/Machines';
import { Panels, type PanelId } from './Panels';
import { Minigames } from './Minigames';
import { Cinematics } from './Cinematics';
import { esc, h } from './dom';
import { Tutorial } from './Tutorial';

const PCT = (f: number) => {
  const p = f * 100;
  const digits = p < 0.01 ? 7 : p < 1 ? 5 : p < 10 ? 4 : 4;
  return p.toFixed(digits).replace('.', ',') + '%';
};

export class UI {
  root: HTMLElement;
  panels: Panels;
  mini: Minigames;
  cine: Cinematics;
  tutorial: Tutorial;
  private el: Record<string, HTMLElement> = {};
  private minimap: HTMLCanvasElement;
  private mctx: CanvasRenderingContext2D;
  private sloganI = 0; private sloganT = 0;
  private hudT = 0;
  private discoveryEl: HTMLElement | null = null;
  menuOpen = false;
  collapsed = false;
  quickCat = 2;
  quickOpen() { return this.el.quickBuild.classList.contains('show'); }

  constructor(private g: Game) {
    this.root = document.getElementById('ui')!;
    this.root.innerHTML = this.template();
    this.root.querySelectorAll<HTMLElement>('[data-id]').forEach(e => (this.el[e.dataset.id!] = e));
    this.minimap = this.el.minimap as HTMLCanvasElement;
    this.mctx = this.minimap.getContext('2d')!;
    this.panels = new Panels(g, this);
    this.mini = new Minigames(g, this);
    this.cine = new Cinematics(g, this);
    this.tutorial = new Tutorial(g, this.el.hud);
    this.el.menuBtn.addEventListener('click', () => { g.audio.click(); this.open(this.panels.lastTab); });
    this.el.quickBuildBtn.addEventListener('click', () => {
      g.audio.click();
      if (this.panels.isOpen()) this.panels.close();
      this.el.quickBuild.classList.toggle('show');
      this.el.quickBuildBtn.setAttribute('aria-expanded', String(this.el.quickBuild.classList.contains('show')));
      if (this.el.quickBuild.classList.contains('show')) this.renderQuickBuild();
    });
    this.el.quickBuild.addEventListener('click', e => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!button) return;
      if (button.dataset.quick === 'close') { this.hideQuickBuild(); return; }
      if (button.dataset.quick === 'cat') { this.quickCat = Number(button.dataset.cat); this.renderQuickBuild(); return; }
      if (button.dataset.quick === 'item') {
        const key = button.dataset.key!;
        if (!g.canBuildKey(key)) { g.toast('Desbloqueie esta peça em Melhorias', '#ffb86a'); return; }
        this.hideQuickBuild();
        g.startBuild(key);
        g.audio.click();
      }
    });
    this.el.orbitBtn.addEventListener('click', () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      g.camera.targetZoom = g.camera.targetZoom <= 0.55 * dpr ? 2 * dpr : 0.25 * dpr;
      g.flags.userZoom = true;
      this.hideQuickBuild();
      g.audio.click();
    });
    this.el.upBtn.addEventListener('click', () => { g.audio.click(); this.panels.st.upBr = 'fab'; this.open('upgrades'); if (this.tutorial.active) this.tutorial.tap(this.el.meta as HTMLElement); });
    this.el.descendBtn.addEventListener('click', () => this.descendPrompt());
    // hotbar
    this.el.hotbar.addEventListener('click', e => {
      const s = (e.target as HTMLElement).closest<HTMLElement>('[data-slot]');
      if (s) { if (g.input.touch) g.tapSlot(Number(s.dataset.slot)); else g.selectSlot(Number(s.dataset.slot)); }
    });
    // captura de mouse sobre a UI
    this.root.addEventListener('mouseover', e => { g.input.uiCapture = (e.target as HTMLElement) !== this.root && !!(e.target as HTMLElement).closest('.ui-block'); });
    this.root.addEventListener('mouseout', () => { g.input.uiCapture = false; });
    this.minimap.addEventListener('click', () => this.open('map'));
    this.el.meta.addEventListener('click', e => { if (this.tutorial.tap(e.target as HTMLElement)) return; const L = this.g.planet.layer, md = METAS[L]?.[this.g.sectors.s[L].phase]; if (!this.tutorial.active && md?.kind === 'silo') { this.showLesson(); return; } this.open('missions'); });
    this.el.layerCard.addEventListener('click', e => { if (!(e.target as HTMLElement).closest('.descend')) this.open('missions'); });
    this.el.buildControls.querySelectorAll<HTMLButtonElement>('[data-build-action]').forEach(button => {
      button.addEventListener('click', () => {
        const action = button.dataset.buildAction;
        if (action === 'confirm') g.confirmBuild();
        else if (action === 'rotate') g.rotateBuild();
        else if (action === 'cancel') g.exitBuild();
      });
    });
  }

  /** Resumo ao esgotar a camada, com recorde pessoal. */
  layerSummary(l: number) {
    const g = this.g, st = g.flags.layerStart ?? { t: 0, cells: 0, chests: 0, built: 0, lore: 0 };
    const L = SECTORS[l - 1], secs = g.time - st.t;
    let best = 0; try { best = Number(localStorage.getItem('zx_best_' + l)) || 0; } catch { /* */ }
    const record = !best || secs < best;
    if (record) try { localStorage.setItem('zx_best_' + l, String(Math.round(secs))); } catch { /* */ }
    const rows: [string, string][] = [['Tempo na camada', fmtTime(secs)], ['Recorde', record ? '🏆 NOVO RECORDE' : fmtTime(best)], ['Células extraídas', fmtInt(g.stats.cells - st.cells)],
      ['Minério entregue', fmtInt(g.sectors.s[l].counters.delivered ?? 0) + ' kg'], ['Baús abertos', String((g.stats.chests ?? 0) - (st.chests ?? 0))], ['Construções', String(g.stats.built - st.built)],
      ['Registros de Khelos', String(g.lore.unlocked.size - (st.lore ?? 0))], ['Planeta extraído', PCT(g.planet.fraction())]];
    const block = g.descendBlocked();
    const next = SECTORS[l];
    this.mini.choice(`${L.name.toUpperCase()} ESGOTADA`, `<div class="sumgrid">${rows.map(([k, v]) => `<div><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join('')}</div>${next ? `<p>${block ? `<span class="warn">${esc(block)}</span>` : `Próxima: <b>${esc(next.name)}</b> — ${esc(next.desc)}`}</p>` : ''}`,
      next && !block ? [{ label: 'Ficar mais um pouco', cls: 'ghost', fn: () => {} }, { label: '▼ DESCER AGORA', cls: 'orange', fn: () => g.descend() }] : [{ label: 'Continuar', cls: 'orange', fn: () => {} }]);
  }

  descendPrompt() {
    const g = this.g;
    {
      if (!g.canDescend()) return;
      this.mini.choice('DESCER PARA A PRÓXIMA CAMADA?', `Sua base inteira é empacotada e <b>100% do custo volta ao estoque</b>. Você reaparece no poço central da <b>${esc(SECTORS[g.planet.layer].name)}</b>: menor, porém mais dura. Estoque, melhorias e registros vão com você.`,
        [{ label: 'Ainda não', cls: 'ghost', fn: () => {} }, { label: '▼ DESCER', cls: 'orange', fn: () => g.descend() }]);
    }
  }

  private template() {
    return `
    <div class="hud" data-id="hud">
      <div class="ui-block hcard layer" data-id="layerCard">
        <div class="ly-top"><span class="ly-code" data-id="lyCode"></span><b data-id="lyName"></b></div>
        <div class="ly-bar"><u data-id="lyDug"></u><i data-id="lyBar"></i><span data-id="lyPct"></span></div>
        <div class="ly-sub"><span data-id="lyPlanet"></span><span data-id="lyRate" class="rate"></span></div>
        <div class="ly-obj" data-id="lyObj"></div>
        <div class="ly-warn" data-id="lyWarn"></div>
        <button class="descend" data-id="descendBtn">▼ DESCER PARA A PRÓXIMA CAMADA</button>
      </div>
      <button class="ui-block menu-btn" data-id="menuBtn" title="Menu (Tab)"><span>☰</span><b>MENU</b><i class="badge" data-id="menuBadge"></i></button>
      <button class="ui-block up-btn" data-id="upBtn"><span>✚</span><b>MELHORIAS</b><i class="dot" data-id="upDot"></i></button>
      <div class="ui-block hcard meta" data-id="meta"><div class="mt" data-id="metaTitle"></div><div class="mx" data-id="metaText"></div><div class="mb"><i data-id="metaBar"></i></div></div>
      <div class="ui-block res" data-id="res"></div>
      <div class="ui-block hcard mm"><canvas data-id="minimap" width="240" height="170"></canvas><div class="mmcap"><span data-id="mmName"></span><span>MAPA ›</span><button class="orbit-btn" data-id="orbitBtn" aria-label="Afastar zoom até o planeta" title="Afastar zoom até o planeta">−</button></div></div>
      <button class="ui-block quick-build-btn" data-id="quickBuildBtn" aria-label="Construir" aria-expanded="false" title="Construir"><span>▦</span><small>CONSTRUIR</small></button>
      <div class="ui-block quick-build" data-id="quickBuild"></div>
      <div class="ui-block hcard vitals">
        <div class="vb hp"><span>❤</span><div class="bar"><i data-id="hpBar"></i><em data-id="hpTxt"></em></div></div>
        <div class="vb en"><span>⚡</span><div class="bar"><i data-id="enBar"></i><em data-id="enTxt"></em></div></div>
        <div class="vb pack"><span title="Aspirador">◎</span><div class="bar"><i data-id="packBar"></i><em data-id="packTxt"></em></div></div>
        <div class="hzchip" data-id="hz"></div>
      </div>
      <div class="ui-block hotbar" data-id="hotbar"></div>
      <div class="dialog" data-id="dialog"></div>
      <div class="hold" data-id="hold"><div class="lbl"></div><div class="bar"><i></i></div></div>
      <div class="toasts" data-id="toasts"></div>
      <div class="banner" data-id="banner"></div>
      <div class="flashname" data-id="flashname"></div>
      <div class="geocard" data-id="geocard"></div>
      <div class="sectortitle" data-id="sectortitle"></div>
      <div class="build-hint" data-id="buildHint"></div>
      <div class="build-controls ui-block" data-id="buildControls"><button data-build-action="cancel">✕ CANCELAR</button><button data-build-action="rotate">↻ GIRAR</button><button class="confirm" data-build-action="confirm">✔ CONFIRMAR</button></div>
      <div class="popups" data-id="popups"></div>
      <div class="saved" data-id="saved">✔ salvo</div>
      <div class="vignette" data-id="vignette"></div>
    </div>
    <div class="modal-layer" data-id="modal"></div>
    <div class="cine-layer" data-id="cine"></div>`;
  }

  get modal() { return this.el.modal; }
  get cineLayer() { return this.el.cine; }

  private hideQuickBuild() {
    this.el.quickBuild.classList.remove('show');
    this.el.quickBuildBtn.setAttribute('aria-expanded', 'false');
  }
  private renderQuickBuild() {
    const g = this.g, cat = MACHINE_CATS[this.quickCat];
    const list = MACHINES.filter(d => d.cat === cat.key && !d.hidden && !['command', 'analyzer'].includes(d.behavior) && (d.minLayer ?? 1) <= g.planet.layer)
      .sort((a, b) => (a.key === 'tubo' ? -1 : b.key === 'tubo' ? 1 : 0) || Number(g.canBuildKey(b.key)) - Number(g.canBuildKey(a.key)));
    const cats = MACHINE_CATS.map((c, i) => ({ c, i })).filter(({ c }) => MACHINES.some(d => d.cat === c.key && !d.hidden && !['command', 'analyzer'].includes(d.behavior) && (d.minLayer ?? 1) <= g.planet.layer));
    this.el.quickBuild.innerHTML = `<div class="qb-head"><div class="qb-tabs">${cats.map(({ c, i }) => `<button data-quick="cat" data-cat="${i}" class="${i === this.quickCat ? 'on' : ''}">${esc(c.name)}</button>`).join('')}</div><button data-quick="close" aria-label="Fechar">×</button></div><div class="qb-items">${list.map(d => {
      const locked = !g.canBuildKey(d.key);
      const cost = Object.entries(d.cost).map(([k, n]) => `<span class="${g.stock.count(k) + g.pack.count(k) < n ? 'short' : ''}"><img src="${g.sprites.itemUrl(k)}" alt="">${fmtShort(n)}</span>`).join('');
      const label = d.key === 'tubo' ? 'Tubo Vácuo' : d.key === 'tubo_gigante' ? 'Tubo Gigante' : d.key === 'reforcador' ? 'Reforçador' : d.name;
      return `<button class="qb-item ${locked ? 'locked' : ''}" data-quick="item" data-key="${d.key}" title="${esc(d.desc)}"><img class="qb-art" src="${g.sprites.machineUrl(d)}" alt=""><b>${esc(label)}</b><small>${locked ? '🔒 Melhoria' : cost}</small></button>`;
    }).join('')}</div>`;
  }

  modalOpen() { return this.panels.isOpen() || this.mini.isOpen() || this.menuOpen || this.cine.active; }
  discoveryOpen() { return !!this.discoveryEl; }
  open(id: PanelId) { if (this.mini.isOpen() || this.cine.active) return; this.hideQuickBuild(); this.menuOpen = false; this.panels.open(id); }
  openMachine(m: Machine) { this.panels.openMachine(m); }
  closeTop(): boolean {
    if (this.el.quickBuild.classList.contains('show')) { this.hideQuickBuild(); return true; }
    if (this.discoveryEl) { this.discoveryEl.remove(); this.discoveryEl = null; return true; }
    if (this.mini.isOpen()) { this.mini.close(); return true; }
    if (this.panels.isOpen()) { this.panels.close(); return true; }
    if (this.menuOpen) { this.toggleMenu(); return true; }
    return false;
  }
  toggleMenu() { this.menuOpen = !this.menuOpen; this.g.paused = this.menuOpen; if (this.menuOpen) this.panels.open('menu'); else this.panels.close(); }
  calibrate(m: Machine | null, mode: 'normal' | 'final', after?: (q: number) => void) { this.mini.calibration(m, mode, after); }

  // ---------------- feedback ----------------
  /** Aula animada: como a torre separa resíduo, Ferronox e Lumenita (abre no tutorial, no cartão do Ímã/Ressonador e na meta de silo). */
  showLesson() {
    if (document.querySelector('.lesson')) return;
    const dots = (cls: string, n: number) => Array.from({ length: n }, (_, i) => `<i class="ld ${cls}" style="animation-delay:${(i * 3.6 / n).toFixed(2)}s"></i>`).join('');
    const el = document.createElement('div');
    el.className = 'lesson';
    el.innerHTML = `<div class="lcard">
      <div class="lt">COMO OS EXTRATORES FUNCIONAM</div>
      <div class="lbody">
        <div class="ldia">
          <div class="lb lsfe">SALDO<br>Fe</div><div class="lb lslu">SALDO<br>Lu</div>
          <div class="lb ltfe"></div><div class="lb ltfe v"></div><div class="lb ltlu"></div><div class="lb ltlu v"></div>
          <div class="lb lima">ÍMÃ</div><div class="lb lres">RESSON.</div>
          <div class="lgap a"></div><div class="lgap b"></div>
          <div class="lb lbelt"></div><div class="lb lprensa">🔥</div><div class="lb lsop">SOPR.</div><div class="lb ltin"></div>
          ${dots('d-dirt', 5)}${dots('d-fe', 3)}${dots('d-lu', 3)}
        </div>
        <ol class="lsteps">
          <li><i class="k d-dirt0"></i>O <b>Soprador</b> manda a terra pelo <b>Tubo de Vácuo</b> até a <b>esteira</b>.</li>
          <li><i class="k d-fe"></i>O <b>Ímã</b>, <b>por cima da esteira</b>, puxa o <b>Ferronox</b> (prateado) direto para o seu <b>saldo</b> (com um tubo encostado, você leva até a <b>Nave</b>).</li>
          <li><i class="k d-lu"></i>O <b>Ressonador</b> puxa a <b>Lumenita</b> (azul) do mesmo jeito.</li>
          <li><i class="k d-gray"></i>A terra muda de cor a cada extração. O que sobra (<b>cinza</b>) é <b>queimado no Incinerador</b> e sai do planeta.</li>
        </ol>
      </div>
      <p class="lnote">Regra: deixe <b>1 espaço livre</b> entre o extrator e a esteira. Para os minérios <b>saírem do planeta</b>, encoste um <b>Tubo de Vácuo</b> no extrator e leve até a <b>Nave</b> lá no alto.</p>
      <button class="ok">ENTENDI</button></div>`;
    el.querySelector('.ok')!.addEventListener('click', () => { this.g.flags.lessonSep = true; el.remove(); });
    document.body.appendChild(el);
  }

  toast(text: string, color: string) {
    const t = h(`<div class="toast" style="border-color:${color}"><i style="background:${color}"></i>${esc(text)}</div>`);
    this.el.toasts.prepend(t);
    while (this.el.toasts.children.length > 5) this.el.toasts.lastChild!.remove();
    setTimeout(() => t.classList.add('out'), 4200);
    setTimeout(() => t.remove(), 4800);
  }
  banner(title: string, sub: string) {
    const b = this.el.banner;
    b.innerHTML = `<div class="t">${esc(title)}</div><div class="s">${esc(sub)}</div>`;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }
  /** Cartão de ANÁLISE GEOLÓGICA do scanner (some sozinho). */
  private geoT = 0;
  geoCard(html: string) {
    const c = this.el.geocard;
    c.innerHTML = html;
    c.classList.add('show');
    clearTimeout(this.geoT);
    this.geoT = window.setTimeout(() => c.classList.remove('show'), 7000);
  }

  flashName(name: string, c: readonly number[]) {
    const f = this.el.flashname;
    f.textContent = name.toUpperCase();
    f.style.color = `rgb(${c[0]},${c[1]},${c[2]})`;
    f.style.textShadow = `0 0 18px rgb(${c[0]},${c[1]},${c[2]})`;
    f.classList.remove('show'); void f.offsetWidth; f.classList.add('show');
  }
  sectorTitle(s: number) {
    const sd = SECTORS[s - 1];
    const e = this.el.sectortitle;
    e.innerHTML = `<div class="c">${sd.code}</div><div class="n" style="color:${sd.accent}">${esc(sd.name)}</div>`;
    e.classList.remove('show'); void e.offsetWidth; e.classList.add('show');
  }
  flashMass() { this.el.layerCard.classList.remove('pulse'); void this.el.layerCard.offsetWidth; this.el.layerCard.classList.add('pulse'); }
  hurtFlash() { this.el.vignette.classList.remove('hit'); void this.el.vignette.offsetWidth; this.el.vignette.classList.add('hit'); }
  deathFlash(cause: string) { this.banner('COLABORADOR RECONSTITUÍDO', `Causa: ${cause}. Custo descontado da participação nos lucros.`); }
  savedIndicator() { const s = this.el.saved; s.classList.remove('show'); void s.offsetWidth; s.classList.add('show'); }

  discovery(l: LoreDef) {
    this.discoveryEl?.remove();
    const p = h(`<div class="popup-pair ui-block">
      <div class="popup disc"><div class="ph">📖 DESCOBERTA ARQUEOLÓGICA <button class="x">✕</button></div>
        <div class="pb"><div class="glyph">${glyphSvg(l.id)}</div><div><div class="pt">${esc(l.title.toUpperCase())}</div><div class="ptx">${esc(l.text)}</div><div class="pmeta">Arquivo de Khelos · ${this.g.lore.unlocked.size}/${41} registros · +${fmtInt(l.credits)} créditos</div></div></div></div>
      <div class="popup corp"><div class="ph">⬢ COMUNICAÇÃO DA CORPORAÇÃO ZENITEX</div>
        <div class="pb"><img src="${this.g.sprites.portraitUrl('varren')}"><div class="ptx">${esc(l.zena)}</div></div></div>
      ${l.sera ? `<div class="popup sera"><div class="pb"><img src="${this.g.sprites.portraitUrl('sera')}"><div><b>DRA. SERA VENN</b><div class="ptx">${esc(l.sera)}</div></div></div></div>` : ''}
    </div>`);
    p.querySelector('.x')!.addEventListener('click', () => { p.remove(); this.discoveryEl = null; });
    this.el.popups.appendChild(p);
    this.discoveryEl = p;
    setTimeout(() => { if (this.discoveryEl === p) { p.classList.add('out'); setTimeout(() => { p.remove(); if (this.discoveryEl === p) this.discoveryEl = null; }, 600); } }, 16000);
  }

  templeChoice(l: LoreDef) {
    const val = Math.round(l.massT * 15);
    this.mini.choice(`ESTRUTURA: ${l.title.toUpperCase()}`,
      `ZENA: "Estrutura não produtiva localizada. Valor histórico: não aplicável. Valor mineral estimado: ${fmtInt(val)} créditos. Continue a extração."<br><br>DRA. SERA VENN: "Por favor. Pelo menos esta."`,
      [{ label: `Demolir e extrair (+${fmtInt(val)} créditos)`, cls: 'warn', fn: () => this.g.lore.templeChoice(l, true) },
       { label: 'Preservar a estrutura', cls: 'ok', fn: () => this.g.lore.templeChoice(l, false) }]);
  }

  ending() { this.panels.close(); this.cine.ending(); }

  // ---------------- atualização do HUD ----------------
  update(dt: number) {
    const g = this.g;
    this.hudT -= dt;
    this.updateDialog();
    this.updateHold();
    this.tutorial.update();
    this.el.hud.classList.toggle('hidden', !!(g.flags.intro || g.flags.ending));
    document.body.classList.toggle('building', g.build.active);
    const orbiting = g.camera.targetZoom <= 0.55 * Math.min(2, window.devicePixelRatio || 1);
    document.body.classList.toggle('orbiting', orbiting);
    if (this.el.orbitBtn.dataset.mode !== String(orbiting)) {
      this.el.orbitBtn.dataset.mode = String(orbiting);
      this.el.orbitBtn.textContent = orbiting ? '+' : '−';
      this.el.orbitBtn.title = orbiting ? 'Voltar ao jogo' : 'Afastar zoom até o planeta';
    }
    // o joystick direito diz o que ele faz agora: usar o que está perto, cavar ou soprar
    if (g.input.touch) {
      const span = document.querySelector<HTMLElement>('#mobile .stick.right span');
      if (span) {
        const h = g.hover;
        const txt = h ? 'TOQUE: ' + h.label.replace(/^\[E\]\s*/, '').replace(' (segure)', '') : g.flags.blowMode ? 'ARRASTE: SOPRAR' : 'ARRASTE: CAVAR / ASPIRAR';
        if (span.textContent !== txt) { span.textContent = txt; span.classList.toggle('act', !!h); }
      }
    }
    if (this.hudT > 0) return;
    this.hudT = 0.15;
    const p = g.player;
    // camada atual
    const L = g.planet.def, lf = g.planet.layerFraction();
    this.el.lyCode.textContent = `${L.code.toUpperCase()}/${SECTORS.length}`;
    this.el.lyName.textContent = L.name;
    this.el.layerCard.style.setProperty('--acc', L.accent);
    (this.el.lyBar as HTMLElement).style.width = Math.max(0.6, lf * 100) + '%';
    this.el.lyPct.textContent = (lf * 100).toFixed(lf < 0.01 ? 2 : 1).replace('.', ',') + '%';
    (this.el.lyDug as HTMLElement).style.width = Math.max(0.6, g.planet.dugFraction() * 100) + '%';
    this.el.lyPlanet.textContent = `Escavado ${Math.floor(g.planet.dugFraction() * 100)}% · removido ${(lf * 100).toFixed(1).replace('.', ',')}% · planeta ${PCT(g.planet.fraction())}`;
    const ru = g.planet.rateUnits();
    this.el.lyRate.textContent = ru > 0.05 ? `+${(ru / L.target * 100).toFixed(ru / L.target < 0.001 ? 3 : 2).replace('.', ',')}%/min` : '';
    // OBJETIVO fixo: esvaziar a camada (terra queimada + minérios entregues na Nave), camada por camada até o núcleo
    const cs = g.sectors.s[g.planet.layer]?.counters ?? {}, burned = cs.burned ?? 0, shipped = cs.shipped ?? 0;
    const leftT = Math.max(0, (L.target - g.planet.units[g.planet.layer]) * 2 / 1000);
    this.el.lyObj.innerHTML = `<b>DESTRUIR O PLANETA</b> · faltam ${fmtShort(leftT)} t nesta camada<br>🔥 ${fmtShort(burned)} kg queimados · 🚀 ${fmtShort(shipped)} kg na Nave`;
    this.el.descendBtn.style.display = g.canDescend() && !g.descendBlocked() ? 'block' : 'none';
    const warn = this.bottleneck();
    this.el.lyWarn.innerHTML = warn ? esc(warn) : '';
    this.el.lyWarn.style.display = warn ? 'block' : 'none';
    // o cartão de meta/tutorial fica logo abaixo do cartão da camada (que muda de altura)
    document.body.style.setProperty('--lyH', Math.round(this.el.layerCard.getBoundingClientRect().bottom) + 'px');
    // o aviso aumenta o cartão da camada: empurra os vitais para baixo dele
    const vit = this.root.querySelector<HTMLElement>('.hcard.vitals');
    if (vit && g.input.touch) { const rb = this.el.layerCard.getBoundingClientRect(); vit.style.top = Math.round(rb.bottom + 4) + 'px'; }
    // recursos: os 4 mais abundantes + créditos
    // saldo = estoque + silos (é o que paga construções e melhorias). Os 2 minérios da camada sempre à vista.
    const mins = compOf(g.planet.layer).minerals.map(x => x.k);
    const tops = [...mins, ...TOP_BAR_ITEMS.filter(k => !mins.includes(k) && g.upHave(k) >= 1).sort((a, b) => g.upHave(b) - g.upHave(a)).slice(0, 1)];
    const yu = g.machines.yardUsed(), yc = g.machines.yardCap();
    this.el.res.innerHTML = tops.map(k => {
      const rt = g.stock.rate(k);
      return `<div class="ri" title="${ITEM[k].name}"><img src="${g.sprites.itemUrl(k)}"><b>${fmtShort(g.upHave(k))}</b>${rt > 1 ? `<em>+${fmtShort(rt)}</em>` : ''}</div>`;
    }).join('') + (yu >= 1 ? `<div class="ri yard ${yu >= yc * 0.9 ? 'bad' : ''}" title="Pátio de resíduo"><img src="${g.sprites.itemUrl('residuo')}"><b>${Math.round(yu / yc * 100)}%</b></div>` : '')
      + `<div class="ri cr" title="Créditos"><span class="cico">◆</span><b>${fmtShort(g.stock.credits)}</b></div>`;
    // vitais
    (this.el.hpBar as HTMLElement).style.width = (p.hp / p.maxHp) * 100 + '%';
    this.el.hpTxt.textContent = `${Math.ceil(p.hp)}`;
    (this.el.enBar as HTMLElement).style.width = (p.energy / p.maxEnergy) * 100 + '%';
    this.el.enTxt.textContent = `${Math.floor(p.energy)}`;
    const load = g.pack.weight(), capacity = g.pack.maxWeight();
    (this.el.packBar as HTMLElement).style.width = Math.min(100, load / capacity * 100) + '%';
    this.el.packTxt.textContent = `${fmtInt(load)}/${fmtInt(capacity)} kg`;
    // perigo ambiental: só aparece quando existe
    const dk = g.hazards.dominantKey();
    const lv = dk ? g.hazards.levels[dk] ?? 0 : 0;
    if (dk && lv > 3) {
      const prot = p.protection(dk);
      this.el.hz.style.display = 'flex';
      this.el.hz.className = 'hzchip' + (lv > prot ? ' bad' : '');
      this.el.hz.innerHTML = `${hazIcon(dk)} ${HAZARD_NAMES[dk]} ${Math.round(lv)}% <small>${lv > prot ? `traje ${prot}% · DANO` : 'protegido'}</small>`;
    } else this.el.hz.style.display = 'none';
    // hotbar
    const LBL: Record<string, string> = { drill: 'Perfurar', scanner: 'Scanner', explosivo: 'Explosivo', sinalizador: 'Luz', kit_reparo: 'Reparo', medkit: 'Curar', plataforma_kit: 'Plataforma' };
    this.el.hotbar.innerHTML = g.hotbar.map((s, i) => {
      // no celular a barra mostra só ferramentas e consumíveis; construções ficam no MENU
      if (g.input.touch && (!s || s.type === 'build')) return '';
      if (!s) return `<div class="hs" data-slot="${i}"><em>${(i + 1) % 10}</em></div>`;
      let img = '', cnt = '';
      if (s.type === 'tool') img = s.key === 'drill' ? toolIcon('drill') : toolIcon('scanner');
      else if (s.type === 'item') { img = `<img src="${g.sprites.itemUrl(s.key)}">`; cnt = `<b>${fmtShort(g.pack.count(s.key))}</b>`; }
      else { const d = MACHINE[s.key]; img = `<img src="${g.sprites.machineUrl(d)}">`; cnt = g.canBuildKey(s.key) ? '' : '<b class="lock">🔒</b>'; }
      const title = s.type === 'tool' ? (s.key === 'drill' ? g.mining.drill.name : 'Scanner') : s.type === 'item' ? ITEM[s.key]?.name : MACHINE[s.key]?.name;
      const lbl = LBL[s.key] ?? (s.type === 'build' ? (MACHINE[s.key]?.name.split(' ')[0] ?? '') : '');
      return `<div class="hs ${i === g.selected ? 'sel' : ''}" data-slot="${i}" title="${esc(title ?? '')}">${img}${cnt}<em>${g.input.touch ? '' : (i + 1) % 10}</em><u>${esc(lbl)}</u></div>`;
    }).join('');
    // meta atual (tutorial, camada ou final)
    this.updateMeta();
    const bad = g.machines.list.filter(m => m.broken || m.buried > 0).length + g.robots.list.filter(r => r.stuck || r.broken).length;
    const mb = this.el.menuBadge; mb.textContent = bad ? '!' : ''; mb.style.display = bad ? 'block' : 'none';
    // dica de construção
    const b = g.build;
    this.el.buildHint.style.display = b.active ? 'block' : 'none';
    this.el.buildControls.style.display = b.active && !b.deconstruct ? 'flex' : 'none';
    if (b.active) {
      if (b.deconstruct) this.el.buildHint.textContent = 'MODO DESMONTAR · clique: desmontar (75% de reembolso) · Q/botão direito: sair';
      else {
        const def = MACHINE[b.key!];
        const ox = b.tx - Math.floor((def.w - 1) / 2), oy = b.ty - Math.floor((def.h - 1) / 2);
        const missing = Object.entries(def.cost).filter(([k, n]) => g.stock.count(k) + g.pack.count(k) < n)
          .map(([k, n]) => `${fmtInt(n - g.stock.count(k) - g.pack.count(k))} ${itemName(k)}`);
        const reason = g.machines.canPlace(def, ox, oy)
          || (Math.hypot((ox + def.w / 2) * TILE - p.x, (oy + def.h / 2) * TILE - p.y) > 260 ? 'Muito longe para construir' : '')
          || (missing.length ? `Faltam ${missing.join(', ')}` : '');
        if (def.behavior === 'belt') {
          const path = g.beltPath();
          const n = path.filter(([px, py]) => !g.machines.at(px, py)?.belt).length;
          const tot: Record<string, number> = {}; for (const k in def.cost) tot[k] = def.cost[k] * Math.max(1, n);
          const heading = path[0]?.[2] === 2 ? '◀ ESQUERDA' : '▶ DIREITA';
          this.el.buildHint.innerHTML = `${esc(def.name)} · ${b.anchor ? `${n} tile(s) · ${costStr(g, tot)}` : g.input.touch ? 'toque no início e arraste até o fim' : 'clique no início e arraste até o fim'} · ${heading} · GIRAR/R inverte · CONFIRMAR instala a linha`;
        } else if (def.behavior === 'riser' || def.behavior === 'tube') {
          const path = g.beltPath();
          const tool = def.behavior === 'riser' ? 'Arraste do fundo até o topo; saída no alto' : 'Arraste do ponto de entrada ao destino; aceita subida';
          this.el.buildHint.innerHTML = `${esc(def.name)} · ${tool} · ${path.length} peça(s) · GIRAR/R muda a saída · CONFIRMAR instala`;
        } else this.el.buildHint.innerHTML = g.input.touch
          ? `${esc(def.name)} · ${costStr(g, def.cost)}${reason ? `<small>${esc(reason)}</small>` : ''}`
          : `${esc(def.name)} · mova o mouse para posicionar · confirme para construir · custo: ${costStr(g, def.cost)}${reason ? `<small>${esc(reason)}</small>` : ''}`;
      }
    }
    this.drawMinimap();
    this.panels.refresh();
  }


  /** Diagnóstico do que está travando a produção — em linguagem de jogador. */
  private bottleneck(): string | null {
    const g = this.g, M = g.machines, L = g.planet.layer, rt = g.sectors.rt[L];
    if (g.canDescend()) return g.descendBlocked();
    const broken = M.list.filter(m => m.broken).length;
    if (broken) return `⚠ ${broken} máquina(s) quebrada(s): chegue perto e segure E para consertar.`;
    const buried = M.list.filter(m => m.buried > 0).length;
    if (buried) return `⚠ ${buried} máquina(s) soterrada(s): mine o entulho em cima delas.`;
    const drills = M.list.filter(m => m.def.behavior === 'drill');
    // cadeia da massa: o gargalo mais adiante na linha aparece primeiro
    const yu = M.yardUsed(), yc = M.yardCap();
    if (yu >= yc * 0.95) return M.count('compactador') ? '⚠ Pátio de resíduo cheio: mais Compactadores ou Terminais Orbitais.' : '⚠ Pátio de resíduo CHEIO: construa um Compactador Planetário na base. Tudo para em cascata.';
    if (g.stock.count('bloco_massa') >= 60) return `Exportação no limite (${fmtShort(M.blockCap)} kg/min): outro Terminal Orbital acelera a remoção.`;
    const procs = M.list.filter(m => m.def.behavior === 'separator' || m.def.behavior === 'prep' || m.def.behavior === 'compactor');
    const clog = procs.filter(m => m.state.startsWith('Travada') || m.state.startsWith('Saída cheia'));
    if (clog.length) return `⚠ ${clog[0].def.name}: ${clog[0].state.replace(/^Travada: /, '')}`;
    const dmg = procs.find(m => m.working && m.state.startsWith('Danificando'));
    if (dmg) return `⚠ ${dmg.def.name} ${dmg.state.toLowerCase()}: use o processamento certo da camada.`;
    const raw = rawOf(L), rawQ = g.stock.count(raw);
    if (rawQ >= 300) {
      const fit = MACHINES.find(d => d.takes?.[raw] === 1 && (d.minLayer ?? 1) <= L);
      return `${fmtInt(rawQ)} kg de ${itemName(raw)} sem processar no estoque: processe no Analisador, sopre no funil de um processador, ou ligue a esteira da perfuradora num ${fit?.name ?? 'processador'} antes do armazém.`;
    }
    const full = drills.filter(m => m.state.startsWith('Saída cheia')).length;
    if (full) return `⚠ ${full} perfuradora(s) PARADA(S) com a saída cheia: ligue uma esteira saindo dela até o armazém da base.`;
    const jam = M.list.filter(m => m.belt && m.state.startsWith('Travada')).length;
    if (jam) return `⚠ Esteira travada: a ponta dela aponta para algo que não aceita minério. Aponte para um armazém.`;
    const D = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    const facing = M.list.some(m => { if (!m.belt || !m.belt.length) return false; const n = M.at(m.tx + D[m.dir][0], m.ty + D[m.dir][1]); return !!n?.belt && (n.dir + 2) % 4 === m.dir; });
    if (facing) return '⚠ Duas esteiras apontando uma contra a outra: redesenhe o trecho até o armazém.';
    const lost = M.list.filter(m => m.belt && m.state === 'Sem destino' && m.belt.length).length;
    if (lost) return `⚠ Esteira sem destino: a última esteira não está encostada no armazém.`;
    const total = Object.values(rt.buffer).reduce((a, b) => a + b, 0);
    if (rt.bufCap > 0 && total >= rt.bufCap * 0.97) return '⚠ Armazéns cheios: construa outro Armazém ou um Elevador de Carga (+1.500 kg/min).';
    if (rt.linkCap > 0 && total > 200 && rt.linkFlow >= rt.linkCap * 0.95) return `Base no limite (${fmtShort(rt.linkCap)} kg/min): um Elevador de Carga acelera a entrega.`;
    const stuck = g.robots.list.filter(r => r.stuck || r.broken || r.energy <= 0).length;
    if (stuck) return `⚠ ${stuck} drone(s) precisando de você: chegue perto e toque em E.`;
    if (drills.length && drills.every(m => m.exhausted)) return 'Perfuradoras só rendendo em profundidade: gire-as para paredes novas ou mude-as de lugar.';
    return null;
  }

  /** Cartão de META: uma única coisa a fazer agora. */
  private updateMeta() {
    const g = this.g;
    let title = '', text = '', prog = -1;
    const tut = this.tutorial.current();
    if (g.flags.finalReady) {
      const st = g.final.stabilizers;
      title = '⚠ OPERAÇÃO FINAL';
      text = !g.machines.count('cortador_planetario') ? 'Construa o Cortador Planetário no Núcleo.'
        : !g.flags.finalSeq ? 'Abra o Cortador Planetário [E] e inicie a desmontagem final.'
        : !g.flags.finalArmed ? `Ajuste os estabilizadores do núcleo (${st.filter(s => s.done).length}/4).` : 'Volte ao Cortador e DISPARE.';
    } else if (tut) {
      title = `PASSO ${tut.n}/${tut.total} · ${tut.title}`; text = tut.text;
    } else if (g.canDescend()) {
      title = 'CAMADA ESGOTADA'; text = g.descendBlocked() ?? 'Toque em ▼ DESCER no cartão da camada para ir à próxima.';
    } else {
      const L = g.planet.layer, st = g.sectors.s[L], list = g.sectors.objectives(L);
      const o = g.sectors.currentMeta();
      if (o) {
        title = `META ${st.phase + 1}/${list.length} · ${g.planet.def.name.toUpperCase()} · +${fmtShort(g.sectors.reward(L, st.phase))} ◆`;
        text = o.text + (o.max > 1 ? ` <b>(${fmtShort(o.cur)}/${fmtShort(o.max)})</b>` : '');
        const md = METAS[L]?.[st.phase];
        if (md?.kind === 'silo') text += `<div class="mhelp">${siloHelp(g, md.key)}</div>`;
        prog = o.cur / o.max;
      } else {
        title = 'META · REMOVER A CAMADA';
        text = `Esvazie a ${g.planet.def.name}: queime a terra no Incinerador e leve os minérios até a Nave em órbita.`;
        prog = g.planet.layerFraction();
      }
    }
    // fora do tutorial, o cartão de meta só aparece para avisos (camada esgotada, operação final); o objetivo fixo fica no cartão da camada
    (this.el.meta as HTMLElement).style.display = tut || g.flags.finalReady || g.canDescend() ? '' : 'none';
    this.el.metaTitle.textContent = title;
    this.el.metaText.innerHTML = text;
    (this.el.metaBar as HTMLElement).style.width = prog >= 0 ? Math.min(100, prog * 100) + '%' : '0';
    (this.el.metaBar.parentElement as HTMLElement).style.display = prog >= 0 ? 'block' : 'none';
    this.el.meta.classList.toggle('tut', !!tut);
    (this.el.upDot as HTMLElement).style.display = FAB_UPS.some(u => { const c = u.costs[fabLevel(g.flags, u.key)]; return !!c && g.upHas(c); }) ? 'block' : 'none';
  }

  private updateDialog() {
    // falas da IA corporativa desligadas: o foco é minerar o planeta
    if (!this.g.flags.showAI) { this.el.dialog.classList.remove('show'); return; }
    const d = this.g.dialogue.current;
    const box = this.el.dialog;
    if (!d) { box.classList.remove('show'); return; }
    const [sp, text] = d.line;
    const S = SPEAKERS[sp];
    const key = sp + text;
    if (box.dataset.k !== key) {
      box.dataset.k = key;
      box.innerHTML = `<img src="${this.g.sprites.portraitUrl(sp)}"><div><div class="sn" style="color:${S.color}">${S.name} <small>${S.role}</small></div><div class="st"></div></div>`;
      box.classList.add('show');
    }
    const n = Math.min(text.length, Math.floor(d.t * 55));
    const st = box.querySelector('.st')!;
    if (st.textContent!.length !== n) st.textContent = text.slice(0, n);
  }

  private updateHold() {
    const h = this.g.hold;
    const e = this.el.hold;
    if (!h) { e.style.display = 'none'; return; }
    e.style.display = 'block';
    e.querySelector('.lbl')!.textContent = h.label;
    (e.querySelector('i') as HTMLElement).style.width = (h.t / h.dur) * 100 + '%';
  }

  private drawMinimap() {
    const g = this.g, c = this.mctx;
    const W = this.minimap.width, H = this.minimap.height;
    const p = g.player;
    const ov = g.terrain.overview(performance.now());
    // 1 px do minimapa = 2 células; centrado no jogador
    const sx = p.x / CELL / 2 - W / 2, sy = p.y / CELL / 2 - H / 2;
    c.fillStyle = '#05080c'; c.fillRect(0, 0, W, H);
    c.imageSmoothingEnabled = false;
    c.drawImage(ov, -sx, -sy);
    const P = (wx: number, wy: number): [number, number] => [wx / CELL / 2 - sx, wy / CELL / 2 - sy];
    for (const m of g.machines.list) { const [x, y] = P(m.tx * TILE, m.ty * TILE); c.fillStyle = m.broken ? '#ff4a3a' : '#ffb04a'; c.fillRect(x, y, m.def.w * 2, m.def.h * 2); }
    for (const m of g.scanner.mapMarkers) { const [x, y] = P(m.x, m.y); if (x < 0 || y < 0 || x > W || y > H) continue; c.fillStyle = m.color; c.fillRect(x - 2, y - 2, 4, 4); }
    c.fillStyle = '#fff'; c.fillRect(W / 2 - 2, H / 2 - 3, 4, 5);
    c.strokeStyle = 'rgba(255,255,255,0.5)';
    const vw = (g.camera.w / g.camera.zoom) / CELL / 2, vh = (g.camera.h / g.camera.zoom) / CELL / 2;
    c.strokeRect(W / 2 - vw / 2, H / 2 - vh / 2, vw, vh);
    const depth = Math.max(0, Math.round((p.y / CELL - g.world.gen.surfaceAt(p.x / CELL)) * 0.5));
    this.el.mmName.textContent = `${g.planet.def.name} · ${depth > 0 ? depth + ' m de profundidade' : 'superfície'}`;
    void WORLD_TW; void WORLD_TH; void WORLD_PX_W; void WORLD_PX_H; void WORLD_W; void WORLD_H;
  }
  private _tmp: HTMLCanvasElement | null = null;
  private tmpCanvas(w: number, h: number) { if (!this._tmp) this._tmp = document.createElement('canvas'); if (this._tmp.width !== w) this._tmp.width = w; if (this._tmp.height !== h) this._tmp.height = h; return this._tmp; }
  toggleCollapse() { this.collapsed = !this.collapsed; this.el.hud.classList.toggle('collapsed', this.collapsed); }
}

export function costStr(g: Game, cost: Record<string, number>) {
  return Object.entries(cost).map(([k, n]) => {
    const have = g.stock.count(k) + g.pack.count(k);
    return `<span style="color:${have >= n ? '#9cff8a' : '#ff7a5a'}">${fmtShort(n)} ${esc(ITEM[k]?.name ?? k)}</span>`;
  }).join(' · ');
}
export function hexRgb(h: string): [number, number, number] { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function hazIcon(k: HazardKey) { return ({ calor: '🔥', frio: '❄', toxico: '☣', radiacao: '☢', gravidade: '◎', pressao: '⇊', corrosao: '☠', anomalia: '✶' } as Record<string, string>)[k] ?? '!'; }
export function toolIcon(k: 'drill' | 'scanner') {
  return k === 'drill'
    ? `<svg viewBox="0 0 32 32"><path d="M4 20 L18 10 L22 14 L10 26Z" fill="#e8962a"/><path d="M18 10 L28 4 L22 14Z" fill="#c8ccd6"/><rect x="6" y="20" width="6" height="6" fill="#2a2e38" transform="rotate(-35 9 23)"/><circle cx="14" cy="17" r="2" fill="#5ab4ff"/></svg>`
    : `<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="11" fill="none" stroke="#5ab4ff" stroke-width="2"/><circle cx="16" cy="16" r="6" fill="none" stroke="#5ab4ff" stroke-width="1.5" opacity=".7"/><path d="M16 16 L25 9" stroke="#9fe0ff" stroke-width="2"/><circle cx="16" cy="16" r="2" fill="#e8962a"/></svg>`;
}
export function fmtMassStr(t: number) { return fmtMass(t); }
function glyphSvg(seed: string) {
  let s = 0; for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  let p = '';
  for (let i = 0; i < 7; i++) p += `<path d="M${20 + r() * 60} ${15 + i * 13} q ${r() * 20 - 10} ${r() * 10} ${r() * 30} 0" stroke="#4af0e0" stroke-width="2" fill="none"/>`;
  return `<svg viewBox="0 0 100 110"><rect x="10" y="5" width="80" height="100" rx="6" fill="#16262c" stroke="#2a4a52" stroke-width="3"/><circle cx="50" cy="45" r="18" fill="none" stroke="#4af0e0" stroke-width="2"/>${p}</svg>`;
}
