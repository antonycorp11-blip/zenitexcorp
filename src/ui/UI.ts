import { fmtInt, fmtShort, fmtMass, fmtTime } from '../core/math';
import { TILE, WORLD_TILES, WORLD_PX } from '../core/constants';
import { SECTORS, HAZARD_NAMES, type HazardKey } from '../data/sectors';
import { SPEAKERS } from '../data/dialogue';
import { ITEM, TOP_BAR_ITEMS, itemName } from '../data/items';
import { SLOGANS } from '../data/slogans';
import { MACHINE, MACHINES } from '../data/machines';
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
    this.el.meta.addEventListener('click', e => { if (!this.tutorial.tap(e.target as HTMLElement)) this.open('missions'); });
    this.el.layerCard.addEventListener('click', e => { if (!(e.target as HTMLElement).closest('.descend')) this.open('missions'); });
    this.el.buildControls.querySelectorAll<HTMLButtonElement>('[data-build-action]').forEach(button => {
      button.addEventListener('click', () => {
        const action = button.dataset.buildAction;
        if (action === 'confirm') g.confirmBuild();
        else if (action === 'rotate') g.build.dir = (g.build.dir + 1) % 4;
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
        <div class="ly-warn" data-id="lyWarn"></div>
        <button class="descend" data-id="descendBtn">▼ DESCER PARA A PRÓXIMA CAMADA</button>
      </div>
      <button class="ui-block menu-btn" data-id="menuBtn" title="Menu (Tab)"><span>☰</span><b>MENU</b><i class="badge" data-id="menuBadge"></i></button>
      <div class="ui-block hcard meta" data-id="meta"><div class="mt" data-id="metaTitle"></div><div class="mx" data-id="metaText"></div><div class="mb"><i data-id="metaBar"></i></div></div>
      <div class="ui-block res" data-id="res"></div>
      <div class="ui-block hcard mm"><canvas data-id="minimap" width="240" height="170"></canvas><div class="mmcap"><span data-id="mmName"></span><span>MAPA ›</span></div></div>
      <div class="ui-block hcard vitals">
        <div class="vb hp"><span>❤</span><div class="bar"><i data-id="hpBar"></i><em data-id="hpTxt"></em></div></div>
        <div class="vb en"><span>⚡</span><div class="bar"><i data-id="enBar"></i><em data-id="enTxt"></em></div></div>
        <div class="vb pack"><span title="Mochila">▣</span><div class="bar"><i data-id="packBar"></i><em data-id="packTxt"></em></div></div>
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

  modalOpen() { return this.panels.isOpen() || this.mini.isOpen() || this.menuOpen || this.cine.active; }
  discoveryOpen() { return !!this.discoveryEl; }
  open(id: PanelId) { if (this.mini.isOpen() || this.cine.active) return; this.menuOpen = false; this.panels.open(id); }
  openMachine(m: Machine) { this.panels.openMachine(m); }
  closeTop(): boolean {
    if (this.discoveryEl) { this.discoveryEl.remove(); this.discoveryEl = null; return true; }
    if (this.mini.isOpen()) { this.mini.close(); return true; }
    if (this.panels.isOpen()) { this.panels.close(); return true; }
    if (this.menuOpen) { this.toggleMenu(); return true; }
    return false;
  }
  toggleMenu() { this.menuOpen = !this.menuOpen; this.g.paused = this.menuOpen; if (this.menuOpen) this.panels.open('menu'); else this.panels.close(); }
  calibrate(m: Machine | null, mode: 'normal' | 'final', after?: (q: number) => void) { this.mini.calibration(m, mode, after); }

  // ---------------- feedback ----------------
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
    this.el.descendBtn.style.display = g.canDescend() && !g.descendBlocked() ? 'block' : 'none';
    const warn = this.bottleneck();
    this.el.lyWarn.innerHTML = warn ? esc(warn) : '';
    this.el.lyWarn.style.display = warn ? 'block' : 'none';
    // recursos: os 4 mais abundantes + créditos
    const tops = TOP_BAR_ITEMS.filter(k => g.stock.count(k) >= 1).sort((a, b) => g.stock.count(b) - g.stock.count(a)).slice(0, 3);
    if (!tops.length) tops.push('ferronox', 'lumenita');
    const raw = rawOf(g.planet.layer);
    if (g.stock.count(raw) >= 1) tops.unshift(raw);
    const yu = g.machines.yardUsed(), yc = g.machines.yardCap();
    this.el.res.innerHTML = tops.map(k => {
      const rt = g.stock.rate(k);
      return `<div class="ri" title="${ITEM[k].name}"><img src="${g.sprites.itemUrl(k)}"><b>${fmtShort(g.stock.count(k))}</b>${rt > 1 ? `<em>+${fmtShort(rt)}</em>` : ''}</div>`;
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
          this.el.buildHint.innerHTML = `${esc(def.name)} · ${b.anchor ? `${n} tile(s) · ${costStr(g, tot)}` : g.input.touch ? 'toque no início e arraste até o fim' : 'clique no início e arraste até o fim'} · CONFIRMAR instala a linha`;
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
    if (g.stock.count('bloco_massa') >= 20 && M.blockCap <= 0) return '⚠ Blocos parados: sem Terminal Orbital para exportar.';
    if (g.stock.count('bloco_massa') >= 60) return `Exportação no limite (${fmtShort(M.blockCap)} kg/min): outro Terminal Orbital acelera a remoção.`;
    const procs = M.list.filter(m => m.def.behavior === 'separator' || m.def.behavior === 'prep' || m.def.behavior === 'compactor');
    const clog = procs.filter(m => m.state.startsWith('Travada') || m.state.startsWith('Saída cheia'));
    if (clog.length) return `⚠ ${clog[0].def.name}: ${clog[0].state.replace(/^Travada: /, '')}`;
    const dmg = procs.find(m => m.working && m.state.startsWith('Danificando'));
    if (dmg) return `⚠ ${dmg.def.name} ${dmg.state.toLowerCase()}: use o processamento certo da camada.`;
    const raw = rawOf(L), rawQ = g.stock.count(raw);
    const canProc = procs.some(m => M.atBase(m) && M.inputs(m).includes(raw));
    if (rawQ >= 300 && !canProc) {
      const fit = MACHINES.find(d => d.takes?.[raw] === 1 && (d.minLayer ?? 1) <= L);
      return `${fmtInt(rawQ)} kg de ${itemName(raw)} parados no estoque: ${L === 1 ? 'processe no Analisador ou construa um Processador de Solo na base.' : `construa um ${fit?.name ?? 'processador'} na base (${compOf(L).chain}).`}`;
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
      title = `TUTORIAL ${tut.n}/${tut.total} · ${tut.title}`; text = tut.text;
    } else if (g.canDescend()) {
      title = 'CAMADA ESGOTADA'; text = g.descendBlocked() ?? 'Toque em ▼ DESCER no cartão da camada para ir à próxima.';
    } else {
      const L = g.planet.layer, st = g.sectors.s[L], list = g.sectors.objectives(L);
      const o = g.sectors.currentMeta();
      if (o) {
        title = `META ${st.phase + 1}/${list.length} · ${g.planet.def.name.toUpperCase()} · +${fmtShort(g.sectors.reward(L, st.phase))} ◆`;
        text = o.text + (o.max > 1 ? ` <b>(${fmtShort(o.cur)}/${fmtShort(o.max)})</b>` : '');
        prog = o.cur / o.max;
      } else {
        title = 'META · REMOVER A CAMADA';
        text = `Remova o resto da ${g.planet.def.name}: escave, processe o bruto, compacte o resíduo e exporte os blocos.`;
        prog = g.planet.layerFraction();
      }
    }
    this.el.metaTitle.textContent = title;
    this.el.metaText.innerHTML = text;
    (this.el.metaBar as HTMLElement).style.width = prog >= 0 ? Math.min(100, prog * 100) + '%' : '0';
    (this.el.metaBar.parentElement as HTMLElement).style.display = prog >= 0 ? 'block' : 'none';
    this.el.meta.classList.toggle('tut', !!tut);
  }

  private updateDialog() {
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
    const ptx = Math.floor(p.x / TILE), pty = Math.floor(p.y / TILE);
    const scale = 1.5; // px por tile
    const tw = Math.ceil(W / scale), th = Math.ceil(H / scale);
    const img = c.createImageData(tw, th);
    const d = img.data;
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      const tx = ptx - (tw >> 1) + x, ty = pty - (th >> 1) + y;
      const o = (y * tw + x) * 4;
      if (tx < 0 || ty < 0 || tx >= WORLD_TILES || ty >= WORLD_TILES || !g.world.explored[ty * WORLD_TILES + tx]) { d[o + 3] = 255; continue; }
      const s = g.world.sectorTiles[ty * WORLD_TILES + tx];
      const col = s ? hexRgb(SECTORS[s - 1].accent) : [20, 20, 20];
      const cx = tx * 4 + 2, cy = ty * 4 + 2;
      const solid = g.world.solidAt(cx, cy);
      const k = solid ? 0.35 : 0.85;
      d[o] = col[0] * k; d[o + 1] = col[1] * k; d[o + 2] = col[2] * k; d[o + 3] = 255;
      if (g.world.occ[ty * WORLD_TILES + tx]) { d[o] = 255; d[o + 1] = 170; d[o + 2] = 60; }
    }
    const tmp = this.tmpCanvas(tw, th);
    tmp.getContext('2d')!.putImageData(img, 0, 0);
    c.imageSmoothingEnabled = false;
    c.drawImage(tmp, 0, 0, tw * scale, th * scale);
    c.fillStyle = '#fff'; c.fillRect(W / 2 - 2, H / 2 - 2, 4, 4);
    c.strokeStyle = 'rgba(255,255,255,0.6)';
    const vw = (g.camera.w / g.camera.zoom) / TILE * scale, vh = (g.camera.h / g.camera.zoom) / TILE * scale;
    c.strokeRect(W / 2 - vw / 2, H / 2 - vh / 2, vw, vh);
    for (const m of g.scanner.mapMarkers) {
      const x = W / 2 + (m.x / TILE - ptx) * scale, y = H / 2 + (m.y / TILE - pty) * scale;
      if (x < 0 || y < 0 || x > W || y > H) continue;
      c.fillStyle = m.color; c.fillRect(x - 2, y - 2, 4, 4);
    }
    const sec = g.world.sectorAtPx(p.x, p.y) || 1;
    this.el.mmName.textContent = `${SECTORS[sec - 1].name} · ${SECTORS[sec - 1].code}`;
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
