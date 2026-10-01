import { fmtInt, fmtShort, fmtMass } from '../core/math';
import { TILE, WORLD_TILES, WORLD_PX } from '../core/constants';
import { SECTORS, HAZARD_NAMES, type HazardKey } from '../data/sectors';
import { SPEAKERS } from '../data/dialogue';
import { ITEM, TOP_BAR_ITEMS, itemName } from '../data/items';
import { SLOGANS } from '../data/slogans';
import { MACHINE } from '../data/machines';
import { PHASES } from '../systems/Sectors';
import type { LoreDef } from '../data/lore';
import type { Game } from '../Game';
import type { Machine } from '../systems/Machines';
import { Panels, type PanelId } from './Panels';
import { Minigames } from './Minigames';
import { Cinematics } from './Cinematics';
import { esc, h } from './dom';

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
    // botões laterais
    this.root.querySelectorAll<HTMLElement>('[data-open]').forEach(b => b.addEventListener('click', () => { g.audio.click(); this.open(b.dataset.open as PanelId); }));
    // hotbar
    this.el.hotbar.addEventListener('click', e => {
      const s = (e.target as HTMLElement).closest<HTMLElement>('[data-slot]');
      if (s) g.selectSlot(Number(s.dataset.slot));
    });
    // captura de mouse sobre a UI
    this.root.addEventListener('mouseover', e => { g.input.uiCapture = (e.target as HTMLElement) !== this.root && !!(e.target as HTMLElement).closest('.ui-block'); });
    this.root.addEventListener('mouseout', () => { g.input.uiCapture = false; });
    this.minimap.addEventListener('click', () => this.open('map'));
    this.el.objective.addEventListener('click', () => this.open('sectors'));
    this.el.buildControls.querySelectorAll<HTMLButtonElement>('[data-build-action]').forEach(button => {
      button.addEventListener('click', () => {
        const action = button.dataset.buildAction;
        if (action === 'confirm') g.confirmBuild();
        else if (action === 'rotate') g.build.dir = (g.build.dir + 1) % 4;
        else if (action === 'cancel') g.exitBuild();
      });
    });
  }

  private template() {
    const sideBtns: [PanelId, string, string][] = [
      ['inventory', '▤', 'Inventário (Tab)'], ['build', '⚒', 'Construção (B)'], ['upgrades', '✚', 'Melhorias (U)'], ['research', '⚗', 'Pesquisa (K)'],
      ['sectors', '◈', 'Setores (G)'], ['robots', '⚙', 'Robôs (Y)'], ['contracts', '☰', 'Contratos (J)'], ['archive', '📖', 'Arquivo de Khelos (L)'], ['map', '⌖', 'Mapa (M)'],
    ];
    return `
    <div class="hud" data-id="hud">
      <div class="ui-block panel mass" data-id="massBox">
        <div class="row"><span class="ttl">MASSA PLANETÁRIA EXTRAÍDA</span><span class="big" data-id="massPct">0,0000000%</span></div>
        <div class="bar"><i data-id="massBar"></i></div>
        <div class="row sub"><span data-id="massT">0 / 2.860.000.000 t</span><span data-id="massRate" class="rate"></span></div>
        <div class="remain" data-id="massRemain">MASSA PLANETÁRIA RESTANTE: 100,000000%</div>
      </div>
      <div class="ui-block panel depth" data-id="depthBox"><div class="ttl" data-id="depthTtl">PROFUNDIDADE</div><div class="big2" data-id="depth">0 m</div><div class="sname" data-id="sname"></div></div>
      <div class="ui-block panel quote" data-id="quote"></div>
      <div class="side ui-block">${sideBtns.map(([id, ic, t]) => `<button class="sbtn" data-open="${id}" title="${t}"><span>${ic}</span><b class="badge" data-id="badge_${id}"></b></button>`).join('')}</div>
      <div class="ui-block panel res" data-id="res"></div>
      <div class="ui-block panel mm"><canvas data-id="minimap" width="240" height="170"></canvas><div class="mmcap"><span data-id="mmName"></span><span class="scale">50 m</span></div></div>
      <div class="ui-block panel vitals"><div class="vb hp"><span>❤</span><div class="bar"><i data-id="hpBar"></i><em data-id="hpTxt"></em></div></div><div class="vb en"><span>⚡</span><div class="bar"><i data-id="enBar"></i><em data-id="enTxt"></em></div></div><div class="vb pack"><span title="Mochila">▣</span><div class="bar"><i data-id="packBar"></i><em data-id="packTxt"></em></div></div></div>
      <div class="ui-block panel env" data-id="env"></div>
      <div class="ui-block hotbar" data-id="hotbar"></div>
      <div class="ui-block panel objective" data-id="objective"></div>
      <div class="ui-block panel corp" data-id="corp"></div>
      <div class="dialog" data-id="dialog"></div>
      <div class="hold" data-id="hold"><div class="lbl"></div><div class="bar"><i></i></div></div>
      <div class="toasts" data-id="toasts"></div>
      <div class="banner" data-id="banner"></div>
      <div class="flashname" data-id="flashname"></div>
      <div class="sectortitle" data-id="sectortitle"></div>
      <div class="build-hint" data-id="buildHint"></div>
      <div class="build-controls ui-block" data-id="buildControls"><button data-build-action="cancel">CANCELAR</button><button data-build-action="rotate">GIRAR</button><button class="confirm" data-build-action="confirm">CONFIRMAR</button></div>
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
  flashMass() { this.el.massBox.classList.remove('pulse'); void this.el.massBox.offsetWidth; this.el.massBox.classList.add('pulse'); }
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
    this.el.hud.classList.toggle('hidden', g.flags.intro || g.flags.ending);
    if (this.hudT > 0) return;
    this.hudT = 0.15;
    const p = g.player;
    // massa
    const f = g.planet.fraction();
    this.el.massPct.textContent = PCT(f);
    (this.el.massBar as HTMLElement).style.width = Math.max(0.4, f * 100) + '%';
    this.el.massT.textContent = `${fmtInt(g.planet.extracted())} / ${fmtInt(g.planet.total)} t`;
    const rate = g.planet.rate();
    this.el.massRate.textContent = rate > 0.01 ? `+${rate >= 1 ? fmtShort(rate) + ' t' : fmtInt(rate * 1000) + ' kg'}/min` : '';
    this.el.massRemain.textContent = `MASSA PLANETÁRIA RESTANTE: ${((1 - f) * 100).toFixed(f < 0.01 ? 6 : 4).replace('.', ',')}%`;
    // profundidade e setor
    const sec = g.world.sectorAtPx(p.x, p.y) || 1;
    const sd = SECTORS[sec - 1];
    const cx = WORLD_PX / 2;
    const r = Math.hypot(p.x - cx, p.y - cx) / WORLD_PX;
    const depth = Math.max(0, (0.43 - r) / 0.43 * 3200);
    const nearBase = g.machines.list.some(m => m.def.behavior === 'command' && Math.hypot((m.tx + 1.5) * TILE - p.x, (m.ty + 1.5) * TILE - p.y) < 160);
    this.el.depthTtl.textContent = nearBase ? `BASE — ${sd.code.toUpperCase()}` : 'PROFUNDIDADE';
    this.el.depth.textContent = depth < 15 ? 'Superfície' : `${fmtInt(depth)} m`;
    this.el.sname.textContent = sd.name;
    this.el.sname.style.color = sd.accent;
    // citação / perigo
    const dk = g.hazards.dominantKey();
    const lv = dk ? g.hazards.levels[dk] ?? 0 : 0;
    if (dk && lv > 3) {
      const prot = p.protection(dk);
      const col = lv > prot ? '#ff5a3a' : '#9cff5a';
      const segs = Array.from({ length: 10 }, (_, i) => `<i style="background:${i < Math.round(lv / 10) ? col : '#1d2a33'}"></i>`).join('');
      this.el.quote.innerHTML = `<div class="hz"><span class="hzi">${hazIcon(dk)}</span><div><div class="hzt">${HAZARD_NAMES[dk].toUpperCase()} <b style="color:${col}">${Math.round(lv)}%</b></div><div class="segs">${segs}</div><div class="hzs">Proteção do traje: ${prot}% ${lv > prot ? '· <b style="color:#ff6a4a">DANO</b>' : ''}</div></div></div>`;
    } else {
      this.sloganT -= 0.15;
      if (this.sloganT <= 0) { this.sloganT = 14; this.sloganI = (this.sloganI + 1) % SLOGANS.length; }
      this.el.quote.innerHTML = `<div class="slogan"><span class="logo">⬢</span><div>${esc(SLOGANS[this.sloganI])}<i>— Corporação Zenitex™</i></div></div>`;
    }
    // recursos
    this.el.res.innerHTML = TOP_BAR_ITEMS.filter((k, i) => i < 5 || g.stock.count(k) > 0).map(k => {
      const rt = g.stock.rate(k);
      return `<div class="ri"><img src="${g.sprites.itemUrl(k)}"><div><span>${ITEM[k].name}</span><b>${fmtShort(g.stock.count(k))}</b>${rt > 1 ? `<em>(+${fmtShort(rt)}/min)</em>` : ''}</div></div>`;
    }).join('') + `<div class="ri cr"><span class="cico">◆</span><div><span>Créditos</span><b>${fmtShort(g.stock.credits)}</b></div></div>`;
    // vitais
    (this.el.hpBar as HTMLElement).style.width = (p.hp / p.maxHp) * 100 + '%';
    this.el.hpTxt.textContent = `${Math.ceil(p.hp)}/${p.maxHp}`;
    (this.el.enBar as HTMLElement).style.width = (p.energy / p.maxEnergy) * 100 + '%';
    this.el.enTxt.textContent = `${Math.floor(p.energy)}/${p.maxEnergy}`;
    const load = g.pack.weight(), capacity = g.pack.maxWeight();
    (this.el.packBar as HTMLElement).style.width = Math.min(100, load / capacity * 100) + '%';
    this.el.packTxt.textContent = `${fmtInt(load)}/${fmtInt(capacity)} kg`;
    // ambiente
    const t = g.hazards.tempC;
    const tox = g.hazards.levels.toxico ?? 0;
    this.el.env.innerHTML = `<div class="ev"><span class="evi">🌡</span><div><small>TEMP. AMBIENTE</small><b style="color:${t > 60 || t < -20 ? '#ff7a4a' : '#ffd07a'}">${Math.round(t)} °C</b></div></div>
      <div class="ev"><span class="evi">${dk && dk !== 'toxico' ? hazIcon(dk) : '☣'}</span><div><small>${dk && dk !== 'toxico' ? HAZARD_NAMES[dk].toUpperCase() : 'TOXICIDADE'}</small><b style="color:${(dk ? lv : tox) > 40 ? '#ff7a4a' : '#9cff5a'}">${dk && dk !== 'toxico' ? Math.round(lv) + '%' : tox > 0 ? Math.round(tox) + '%' : 'Baixa'}</b></div></div>`;
    // hotbar
    this.el.hotbar.innerHTML = g.hotbar.map((s, i) => {
      if (!s) return `<div class="hs" data-slot="${i}"><em>${(i + 1) % 10}</em></div>`;
      let img = '', cnt = '';
      if (s.type === 'tool') img = s.key === 'drill' ? toolIcon('drill') : toolIcon('scanner');
      else if (s.type === 'item') { img = `<img src="${g.sprites.itemUrl(s.key)}">`; cnt = `<b>${fmtShort(g.pack.count(s.key))}</b>`; }
      else { const d = MACHINE[s.key]; img = `<img src="${g.sprites.machineUrl(d)}">`; cnt = g.canBuildKey(s.key) ? '' : '<b class="lock">🔒</b>'; }
      const title = s.type === 'tool' ? (s.key === 'drill' ? g.mining.drill.name : 'Scanner') : s.type === 'item' ? ITEM[s.key]?.name : MACHINE[s.key]?.name;
      return `<div class="hs ${i === g.selected ? 'sel' : ''}" data-slot="${i}" title="${esc(title ?? '')}">${img}${cnt}<em>${(i + 1) % 10}</em></div>`;
    }).join('');
    // objetivo
    this.updateObjective();
    // badges
    this.badge('contracts', g.contracts.available.length ? String(g.contracts.available.length) : '');
    this.badge('research', g.research.active ? '…' : '');
    const bad = g.machines.list.filter(m => m.broken || m.overheat || m.buried > 0).length + g.robots.list.filter(r => r.stuck || r.broken).length;
    this.badge('sectors', bad ? '!' : '');
    this.badge('archive', g.lore.unlocked.size ? String(g.lore.unlocked.size) : '');
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
        this.el.buildHint.innerHTML = g.input.touch
          ? `${esc(def.name)} · ${costStr(g, def.cost)}${reason ? `<small>${esc(reason)}</small>` : ''}`
          : `${esc(def.name)} · mova o mouse para posicionar · confirme para construir · custo: ${costStr(g, def.cost)}${reason ? `<small>${esc(reason)}</small>` : ''}`;
      }
    }
    // corp
    const ev = g.events.log[0];
    this.el.corp.style.display = !g.input.touch && ev && g.time - ev.t < 6 ? 'flex' : 'none';
    if (ev) this.el.corp.innerHTML = `<span class="logo">⬢</span><div><small>TELEMETRIA ZENITEX</small>${esc(ev.text)}</div>`;
    this.drawMinimap();
    this.panels.refresh();
  }

  private badge(id: string, v: string) { const b = this.el['badge_' + id]; if (b) { b.textContent = v; b.style.display = v ? 'block' : 'none'; } }

  private updateObjective() {
    const g = this.g;
    const tut = g.tutorialObjectives();
    let html = '';
    if (g.flags.finalReady) {
      const st = g.final.stabilizers;
      html = `<div class="oh">⚠ OBJETIVO FINAL</div>` + (
        !g.machines.count('cortador_planetario') ? `<div class="oi">□ Construir o Cortador Planetário no Coração</div>` :
        !g.flags.finalSeq ? `<div class="oi">□ Iniciar a desmontagem final no Cortador [E]</div>` :
        st.map((s, i) => `<div class="oi ${s.done ? 'ok' : ''}">${s.done ? '■' : '□'} Estabilizador ${i + 1}</div>`).join('') + (g.flags.finalArmed ? `<div class="oi">□ Disparar o Cortador Planetário</div>` : ''));
    } else if (tut) {
      html = `<div class="oh">◎ OBJETIVO ATUAL</div>` + tut.map(o => `<div class="oi ${o.done ? 'ok' : ''}">${o.done ? '■' : '□'} ${esc(o.text)}${o.cur && !o.done ? `<small>${o.cur}</small>` : ''}</div>`).join('');
    } else {
      const s = g.sectors.focus();
      const st = g.sectors.s[s];
      const objs = g.sectors.objectives(s);
      html = `<div class="oh">◎ ${SECTORS[s - 1].code.toUpperCase()} · ${st.phase < 9 ? `FASE ${st.phase + 1}/9 — ${PHASES[st.phase].toUpperCase()}` : 'AUTOMATIZADO'}</div>` +
        objs.map(o => `<div class="oi ${o.done ? 'ok' : ''}">${o.done ? '■' : '□'} ${esc(o.text)}${o.max > 1 ? `<small>${fmtShort(o.cur)} / ${fmtShort(o.max)}</small>` : ''}</div>`).join('');
      const c = g.contracts.active[0];
      if (c) html += `<div class="oc">◆ ${esc(c.title)} <small>${fmtShort(c.progress)} / ${fmtShort(c.target)}</small></div>`;
    }
    this.el.objective.innerHTML = html;
    if (g.input.touch) {
      const pending = Array.from(this.el.objective.querySelectorAll<HTMLElement>('.oi:not(.ok)')).slice(0, 2);
      const lines = pending.length ? pending : Array.from(this.el.objective.querySelectorAll<HTMLElement>('.oi')).slice(0, 1);
      const label = (o: HTMLElement) => {
        const small = o.querySelector('small')?.textContent?.trim();
        const main = Array.from(o.childNodes).filter(n => n.nodeName !== 'SMALL').map(n => n.textContent).join('').trim();
        return small ? `${main} (${small})` : main;
      };
      this.el.objective.innerHTML = `<div class="oh">◎ OBJETIVOS · TOQUE PARA VER TODOS</div>${lines.map(o => `<div class="oi">${esc(label(o))}</div>`).join('')}`;
    }
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
