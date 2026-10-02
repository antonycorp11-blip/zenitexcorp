import { fmtInt, fmtShort, fmtTime, fmtMass } from '../core/math';
import { TILE, WORLD_TW, WORLD_TH, WORLD_PX_W, WORLD_PX_H, CELL } from '../core/constants';
import { ITEM, ITEMS, itemName, type ItemCat } from '../data/items';
import { MACHINES, MACHINE, MACHINE_CATS, nextDir, COMPLEX_LEVELS, CANNON_SHOT_FRAC, type MachineCat } from '../data/machines';
import { RESEARCH, RESEARCH_CATS, type ResearchCat } from '../data/research';
import { RECIPE, RECIPES } from '../data/recipes';
import { SECTORS, HAZARD_NAMES, type HazardKey } from '../data/sectors';
import { ROBOTS, ROBOT, type RobotKind } from '../data/robots';
import { LORE, LORE_CATS, type LoreCat } from '../data/lore';
import { DRILLS, SCANNERS, PACKS, SUIT_MODULES, ENERGY_LEVELS, HEALTH_LEVELS } from '../data/equipment';
import { POOLS } from '../data/dialogue';
import { bagTotal } from '../systems/Inventory';
import type { Machine } from '../systems/Machines';
import type { Game } from '../Game';
import type { UI } from './UI';
import { costStr, hazIcon, hexRgb } from './UI';
import { renderPlanet } from './Orbital';
import { esc } from './dom';
import { HIDDEN_RESEARCH } from '../data/economy';
import { gradeLabel, gradeColor, compOf, RAW_BY_LAYER } from '../data/composition';
import { SEP_EFF } from '../systems/Machines';

export type PanelId = 'inventory' | 'build' | 'upgrades' | 'research' | 'sectors' | 'robots' | 'contracts' | 'archive' | 'map' | 'help' | 'menu' | 'machine' | 'ops' | 'lifts' | 'settings' | 'missions';

/** O menu único: 5 abas grandes. Os painéis antigos viram atalhos para elas. */
const MAIN: [PanelId, string, string][] = [['build', '⚒', 'CONSTRUIR'], ['upgrades', '✚', 'MELHORIAS'], ['inventory', '▣', 'MOCHILA'], ['missions', '◎', 'MISSÕES'], ['map', '⌖', 'MAPA']];
const IS_MAIN = new Set(MAIN.map(m => m[0]));

const TITLES: Record<PanelId, string> = {
  inventory: 'INVENTÁRIO E FABRICAÇÃO', build: 'CONSTRUÇÃO', upgrades: 'MELHORIAS DE EQUIPAMENTO', research: 'ÁRVORE DE PESQUISAS',
  sectors: 'SETORES DE EXTRAÇÃO', robots: 'ROBÔS E AUTOMAÇÃO', contracts: 'CONTRATOS E TAREFAS CORPORATIVAS', archive: 'ARQUIVO DE KHELOS',
  map: 'MAPA PLANETÁRIO', missions: 'MISSÕES', help: 'MANUAL DO COLABORADOR', menu: 'ZENITEX PLANETARY RESOURCES', machine: '', ops: 'CENTRAL DE OPERAÇÕES', lifts: 'REDE DE ELEVADORES PESSOAIS', settings: 'CONFIGURAÇÕES',
};

export class Panels {
  id: PanelId | null = null;
  el: HTMLElement | null = null;
  lastTab: PanelId = 'build';
  st: Record<string, any> = { invTab: 'todos', buildCat: 'extracao', upBr: 'perf', misTab: 'camada', resCat: 'mineracao', archCat: 'historia', craftSel: 'of_componente', mapTab: 'mapa', conTab: 'disp' };
  machine: Machine | null = null;
  private refreshT = 0;
  private mapRaf = 0;
  private mapView = { x: 0, y: 0, z: 1, drag: false, lx: 0, ly: 0 };
  private planetCache: { c: HTMLCanvasElement; t: number } | null = null;

  constructor(private g: Game, private ui: UI) {}

  isOpen() { return !!this.id; }

  open(id: PanelId) {
    // atalhos antigos -> abas do menu único
    if (id === 'research') { id = 'upgrades'; if (this.st.upBr === 'perf' || this.st.upBr === 'traje') this.st.upBr = 'mineracao'; }
    if (id === 'sectors') { id = 'missions'; this.st.misTab = 'camada'; }
    if (id === 'contracts') { id = 'missions'; this.st.misTab = 'contratos'; }
    if (id === 'archive') { id = 'missions'; this.st.misTab = 'arquivo'; }
    if (id === 'robots') { id = 'build'; this.st.buildCat = 'drones'; }
    if (this.id === id && id !== 'machine') { this.close(); return; }
    this.close();
    this.id = id;
    if (IS_MAIN.has(id)) this.lastTab = id;
    const layer = this.ui.modal;
    const head = IS_MAIN.has(id)
      ? `<div class="pnl-h nav">${MAIN.map(([k, ic, n]) => `<button class="nt ${k === id ? 'on' : ''}" data-act="nav" data-arg="${k}"><span>${ic}</span><b>${n}</b></button>`).join('')}<button class="gear" data-act="pause" title="Menu do jogo">⚙</button><button class="x" data-act="close">✕</button></div>`
      : `<div class="pnl-h"><span class="pnl-t"></span><button class="x" data-act="close">✕</button></div>`;
    layer.innerHTML = `<div class="pnl ui-block ${id} ${IS_MAIN.has(id) ? 'main' : ''}">${head}<div class="pnl-b"></div></div>`;
    layer.classList.add('show');
    this.el = layer.querySelector('.pnl')!;
    this.el.addEventListener('click', e => this.onClick(e));
    this.el.addEventListener('change', e => this.onChange(e));
    this.el.addEventListener('input', e => this.onChange(e));
    layer.onclick = e => { if (e.target === layer) this.close(); };
    this.render();
    if (id === 'map') this.startMap();
  }
  openMachine(m: Machine) {
    this.machine = m;
    if (m.def.behavior === 'command') { this.open('ops'); return; }
    if (m.def.behavior === 'lift') { this.open('lifts'); return; }
    if (m.def.behavior === 'workshop') { this.st.invTab = 'fab'; this.open('inventory'); return; }
    if (m.def.behavior === 'lab') { this.open('research'); return; }
    if (m.def.behavior === 'robotics') { this.open('robots'); return; }
    if (m.def.behavior === 'archaeo') { this.open('archive'); return; }
    this.open('machine');
  }
  close() {
    if (this.id === 'menu' && this.ui.menuOpen) { this.ui.menuOpen = false; this.g.paused = false; }
    this.id = null; this.el = null;
    cancelAnimationFrame(this.mapRaf);
    this.ui.modal.classList.remove('show');
    this.ui.modal.innerHTML = '';
    this.g.input.uiCapture = false;
  }

  refresh() {
    if (!this.id || this.id === 'map' || this.id === 'menu' || this.id === 'settings' || this.id === 'help') return;
    this.refreshT -= 0.15;
    if (this.refreshT > 0) return;
    this.refreshT = 0.6;
    // não re-renderiza enquanto o usuário interage com um campo
    if (document.activeElement && this.el?.contains(document.activeElement) && (document.activeElement as HTMLElement).tagName === 'SELECT') return;
    this.render();
  }

  private render() {
    if (!this.el || !this.id) return;
    const body = this.el.querySelector('.pnl-b')!;
    const scrolls = Array.from(body.querySelectorAll('.scroll')).map(s => s.scrollTop);
    const t = this.el.querySelector('.pnl-t');
    if (t) t.textContent = this.id === 'machine' && this.machine ? this.machine.def.name.toUpperCase() : TITLES[this.id];
    body.innerHTML = (this as any)['r_' + this.id]?.() ?? '';
    body.querySelectorAll('.scroll').forEach((s, i) => { if (scrolls[i]) s.scrollTop = scrolls[i]; });
    if (this.id === 'map') this.bindMapCanvas();
  }

  private act: Record<string, (arg: string, el: HTMLElement) => void> = {
    close: () => this.close(),
    nav: (a) => { if (this.id !== a) this.open(a as PanelId); },
    pause: () => { this.close(); this.ui.toggleMenu(); },
    descend: () => { this.close(); this.ui.descendPrompt(); },
    tab: (a) => { const [k, v] = a.split(':'); this.st[k] = v; this.render(); },
    sel: (a) => { const [k, v] = a.split(':'); this.st[k] = v; this.render(); },
    craftN: (a) => { const [k, n] = a.split(':'); const err = this.g.crafting.enqueue(k, Number(n)); if (err) this.g.toast(err, '#ff8a3a'); else this.g.audio.click(); this.render(); },
    craft: (a) => { const err = this.g.crafting.enqueue(a, Number(this.st.craftN ?? 1)); if (err) this.g.toast(err, '#ff8a3a'); else this.g.audio.click(); this.render(); },
    build: (a) => { if (!this.g.canBuildKey(a)) return; this.g.startBuild(a); this.close(); },
    pin: (a) => { this.g.hotbar[this.g.selected] = { type: 'build', key: a }; this.g.toast(`Fixado no slot ${(this.g.selected + 1) % 10}`, '#9cff8a'); },
    pinItem: (a) => { this.g.hotbar[this.g.selected] = { type: 'item', key: a }; this.g.toast(`Fixado no slot ${(this.g.selected + 1) % 10}`, '#9cff8a'); },
    research: (a) => { const e = this.g.research.start(a); if (e) { this.g.toast(e, '#ff8a3a'); this.g.audio.error(); } else this.g.audio.success(); this.render(); },
    upgrade: (a) => this.doUpgrade(a),
    accept: (a) => { const e = this.g.contracts.accept(Number(a)); if (e) this.g.toast(e, '#ff8a3a'); else this.g.audio.success(); this.render(); },
    ship: (a) => { const l = this.g.machines.shipList; const i = l.indexOf(a); if (i >= 0) l.splice(i, 1); else l.push(a); this.render(); },
    shipUp: (a) => { const l = this.g.machines.shipList; const i = l.indexOf(a); if (i > 0) { l.splice(i, 1); l.splice(i - 1, 0, a); } this.render(); },
    robotBuild: (a) => {
      const rc = this.nearestRobotics();
      if (!rc) { this.g.toast('Construa um Centro Robótico', '#ff8a3a'); return; }
      const r = this.g.robots.build(a as RobotKind, rc);
      if (typeof r === 'string') this.g.toast(r, '#ff8a3a'); else { this.g.audio.success(); this.st.robotSel = String(r.id); }
      this.render();
    },
    robotZone: (a) => { const r = this.g.robots.list.find(x => x.id === Number(a)); if (r) { r.zx = this.g.player.x; r.zy = this.g.player.y; r.path = []; r.sector = this.g.world.sectorAtPx(r.zx, r.zy); this.g.toast(`Zona de ${r.name} definida aqui`, '#9cff8a'); } this.render(); },
    robotScrap: (a) => { const r = this.g.robots.list.find(x => x.id === Number(a)); if (r) { this.g.robots.list.splice(this.g.robots.list.indexOf(r), 1); this.g.stock.add('placa_ferronox', 4, false); } this.render(); },
    calib: () => { if (this.machine) { const m = this.machine; this.close(); this.ui.calibrate(m, 'normal'); } },
    repair: () => { const m = this.machine; if (m && this.g.machines.repair(m)) this.g.toast('Reparada', '#9cff8a'); else this.g.toast('Precisa de Peças de Reposição, Kit de Reparo ou Ferronox', '#ff8a3a'); this.render(); },
    cupgrade: () => { const m = this.machine; if (!m) return; const e = this.g.machines.upgradeComplex(m); if (e) this.g.toast(e, '#ff8a3a'); else this.g.audio.success(); this.render(); },
    filter: (a) => { if (this.machine) this.machine.filter = a || undefined; this.render(); },
    recipe: (a) => { if (this.machine) { this.machine.recipe = a || undefined; this.machine.inb = {}; } this.render(); },
    collect: () => { const m = this.machine; if (!m) return; for (const k of Object.keys(m.out)) { const got = this.g.pack.add(k, m.out[k], m.g[k]); m.out[k] -= got; if (m.out[k] <= 0.01) delete m.out[k]; } this.render(); },
    analyzer: () => { this.close(); this.ui.mini.analyzer(); },
    dismantle: () => { const m = this.machine; if (!m || m.def.behavior === 'command') return; for (const k in m.def.cost) this.g.stock.add(k, Math.floor(m.def.cost[k] * 0.75), false); this.g.machines.remove(m); this.close(); },
    rotate: () => { const m = this.machine; if (m && m.def.rotatable) { m.dir = nextDir(m.def, m.dir); m.depth = 0; m.exhausted = false; } this.render(); },
    reset: () => { const m = this.machine; if (m) { m.depth = 0; m.exhausted = false; m.t = 0; } this.render(); },
    lift: (a) => { const m = this.g.machines.byId.get(Number(a)); if (m) { const [x, y] = this.g.machines.centerPx(m); this.g.player.x = x; this.g.player.y = y + m.def.h * 8 + 6; this.g.camera.x = x; this.g.camera.y = y; this.g.audio.success(); this.close(); } },
    ops: (a) => this.ops(a),
    finalStart: () => { const m = this.machine; if (m) this.g.startFinal(m); this.close(); },
    finalFire: () => { this.close(); this.g.fireCutter(); },
    cannonCharge: () => { const m = this.machine; if (!m) return; if (this.g.stock.pay({ celula_negra: 1 }, this.g.pack.items)) { m.charged = true; this.g.toast('Canhão carregado', '#9cff8a'); } else this.g.toast('Precisa de 1 Célula de Energia Negra', '#ff8a3a'); this.render(); },
    fire: (a) => this.fireCannon(Number(a)),
    save: () => { this.g.save(); this.g.toast('Contrato salvo', '#9cff8a'); },
    resume: () => this.ui.toggleMenu(),
    settings: () => { this.id = 'settings'; this.render(); },
    help: () => { this.id = 'help'; this.render(); },
    briefing: () => { this.close(); if (this.ui.menuOpen) this.ui.toggleMenu(); this.ui.mini.briefing(() => {}); },
    tutorial: () => { this.ui.tutorial.restart(); this.close(); if (this.ui.menuOpen) { this.ui.menuOpen = false; this.g.paused = false; } },
    newgame: () => { if (confirm('Iniciar um novo contrato? O progresso atual será perdido.')) (window as any).zenitexNewGame(); },
    quit: () => { this.g.save().then(() => location.reload()); },
    collapse: () => this.ui.toggleCollapse(),
    lore: (a) => { this.st.loreSel = a; this.render(); },
    secsel: (a) => { this.st.secSel = Number(a); this.render(); },
    mapTab: (a) => { this.st.mapTab = a; this.render(); },
    zoom: (a) => { this.g.camera.targetZoom = Number(a); },
  };

  private onClick(e: Event) {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!t || t.hasAttribute('disabled')) return;
    const fn = this.act[t.dataset.act!];
    if (fn) { fn(t.dataset.arg ?? '', t); }
  }
  private onChange(e: Event) {
    const t = e.target as HTMLInputElement;
    const k = t.dataset.set;
    if (!k) return;
    const g = this.g;
    if (k === 'craftN') this.st.craftN = t.value;
    if (k.startsWith('vol_')) { (g.audio.volume as any)[k.slice(4)] = Number(t.value) / 100; g.audio.applyVolume(); try { localStorage.setItem('zx_vol', JSON.stringify(g.audio.volume)); } catch { /* */ } }
    if (k === 'robotR') { const r = g.robots.list.find(x => x.id === Number(t.dataset.arg)); if (r) r.zr = Number(t.value); }
    if (k === 'robotP') { const r = g.robots.list.find(x => x.id === Number(t.dataset.arg)); if (r) r.priority = t.value || undefined; }
    if (k === 'filterSel') this.act.filter(t.value, t);
    if (k === 'recipeSel') this.act.recipe(t.value, t);
  }

  private tabs(key: string, list: { key: string; name: string }[], extra = '') {
    return `<div class="tabs">${list.map(t => `<button class="${this.st[key] === t.key ? 'on' : ''}" data-act="tab" data-arg="${key}:${t.key}">${esc(t.name)}</button>`).join('')}${extra}</div>`;
  }
  private icon(k: string, s = 28) { return `<img class="ic" style="width:${s}px;height:${s}px" src="${this.g.sprites.itemUrl(k)}">`; }
  private costCells(cost: Record<string, number>) {
    return `<div class="costs">${Object.entries(cost).map(([k, n]) => { const have = this.g.stock.count(k) + this.g.pack.count(k); return `<div class="cc ${have >= n ? 'ok' : 'no'}">${this.icon(k, 26)}<span>${esc(itemName(k))}</span><b>${fmtShort(n)}</b><small>${fmtShort(have)}</small></div>`; }).join('')}</div>`;
  }
  private bar(v: number, max: number, color = '#3ab4ff') { return `<div class="pbar"><i style="width:${Math.min(100, (v / Math.max(1e-9, max)) * 100)}%;background:${color}"></i></div>`; }

  // =============== INVENTÁRIO / FABRICAÇÃO ===============
  r_inventory() {
    const g = this.g, P = g.pack;
    const tab = this.st.invTab === 'fab' ? 'fab' : 'todos';
    let h = this.tabs('invTab', [{ key: 'todos', name: '▣ Estoque e mochila' }, { key: 'fab', name: '⚒ Refinar e fabricar' }]);
    if (tab === 'todos') {
      const w = P.weight(), mw = P.maxWeight();
      const cell = (k: string, n: number, pin = false, gr?: number) => `<div class="cell" title="${esc(ITEM[k]?.desc ?? '')}">${this.icon(k, 30)}<span>${esc(itemName(k))}${gr !== undefined && ITEM[k]?.cat === 'bruto' ? `<small style="color:${gradeColor(gr)}">teor ${gradeLabel(gr)}</small>` : ''}</span><b>${fmtShort(n)}</b>${pin ? `<button class="mini" data-act="pinItem" data-arg="${k}">📌</button>` : ''}</div>`;
      const groups: [string, (k: string) => boolean][] = [
        ['Material bruto (processe para descobrir o que tem dentro)', k => ITEM[k]?.cat === 'bruto'],
        [`Resíduo e blocos · pátio ${fmtInt(g.machines.yardUsed())} / ${fmtInt(g.machines.yardCap())} kg`, k => ITEM[k]?.cat === 'residuo'],
        ['Minérios', k => ITEM[k]?.cat === 'minerio' && !ITEM[k].contain && !['lumenita_pura', 'lumenita_instavel', 'pyroxis_volatil', 'nexolita_condensada', 'verdanio_vivo', 'fragmento_nucleo'].includes(k)],
        ['Raros (valem muitos créditos)', k => ['lumenita_pura', 'lumenita_instavel', 'pyroxis_volatil', 'nexolita_condensada', 'verdanio_vivo', 'fragmento_nucleo', 'umbrium', 'crysalis'].includes(k)],
        ['Barras refinadas', k => ITEM[k]?.cat === 'refinado'],
        ['Consumíveis', k => ITEM[k]?.cat === 'consumivel' || k === 'pecas'],
        ['Outros', k => ['especial', 'liga', 'componente', 'britado'].includes(ITEM[k]?.cat ?? '') && k !== 'pecas'],
      ];
      const stockKeys = Object.keys(g.stock.items).filter(k => g.stock.count(k) >= 0.5);
      h += `<div class="cols"><div class="col"><h3>MOCHILA</h3>
        <div class="kv"><span>${esc(P.def.name)}</span><b>${fmtInt(w)} / ${fmtInt(mw)} kg</b></div>${this.bar(w, mw, w > mw * 0.9 ? '#ff6a3a' : '#e8962a')}
        <div class="grid">${Object.keys(P.items).sort().map(k => cell(k, P.items[k], ITEM[k]?.cat === 'consumivel', P.grade(k))).join('') || '<p class="muted">Vazia.</p>'}</div>
        <p class="muted">Entregue a mochila na cápsula laranja [E]: vira estoque e paga créditos (◆ ${fmtInt(g.stock.credits)}).</p>
        <button class="btn orange" data-act="analyzer">🔬 ANALISADOR DE MATRIZ</button></div>
        <div class="col wide"><h3>ESTOQUE CENTRAL</h3>${groups.map(([name, f]) => { const ks = stockKeys.filter(f); return ks.length ? `<h4>${name}</h4><div class="grid">${ks.map(k => cell(k, g.stock.count(k), false, g.stock.grade(k))).join('')}</div>` : ''; }).join('') || '<p class="muted">Estoque vazio. Minere e processe na base.</p>'}</div></div>`;
      return h;
    }
    // fabricação: só refino à mão e consumíveis
    const recs = g.crafting.recipes().filter(r => r.group === 'refino' || r.group === 'consumiveis').filter(r => !Object.keys(r.in).includes('verdanio'));
    const sel = RECIPE[this.st.craftSel] && recs.includes(RECIPE[this.st.craftSel]) ? RECIPE[this.st.craftSel] : recs[0];
    h += `<p class="muted">Refinar à mão é lento (3 minérios = 1 barra). Uma <b>Refinaria</b> (Construir → Processamento) faz 2 → 1 sozinha, direto da esteira.</p>`;
    h += `<div class="cols"><div class="col list scroll tall">${[['refino', 'Refinar à mão'], ['consumiveis', 'Consumíveis']].map(([grp, name]) => `<h4>${name}</h4>` + recs.filter(r => r.group === grp).map(r => { const out = Object.keys(r.out)[0]; return `<div class="li ${sel === r ? 'on' : ''}" data-act="sel" data-arg="craftSel:${r.key}">${this.icon(out, 26)}<span>${esc(itemName(out))}${r.out[out] > 1 ? ` ×${r.out[out]}` : ''}</span>${g.crafting.can(r) ? '<b class="dot ok"></b>' : ''}</div>`; }).join('')).join('')}</div>`;
    if (sel) {
      const out = Object.keys(sel.out)[0];
      h += `<div class="col wide"><div class="detail"><div class="dh">${this.icon(out, 56)}<div><h2>${esc(itemName(out).toUpperCase())}</h2><p>${esc(ITEM[out]?.desc ?? '')}</p></div></div>
        <h4>INGREDIENTES</h4><div class="recipe">${this.costCells(sel.in)}<span class="arrow">➜</span>${this.icon(out, 40)}<b>${sel.out[out]}×</b></div>
        <div class="kv"><span>⏱ Tempo</span><b>${sel.time}s cada</b></div>
        <div class="row">${[1, 5, 20].map(n => `<button class="btn green" data-act="craftN" data-arg="${sel.key}:${n}" ${!g.crafting.can(sel) ? 'disabled' : ''}>FAZER ${n}×</button>`).join('')}</div>
        <h4>FILA (${g.crafting.queue.length})</h4><div class="queue">${g.crafting.queue.slice(0, 12).map((j, i) => { const r = RECIPE[j.key]; const o = Object.keys(r.out)[0]; return `<div class="q">${this.icon(o, 22)}${i === 0 ? this.bar(j.t, r.time, '#3aff8a') : ''}</div>`; }).join('')}</div></div></div>`;
    }
    return h + '</div>';
  }

  // =============== CONSTRUÇÃO ===============
  r_build() {
    const g = this.g;
    const cat = this.st.buildCat as MachineCat;
    let h = this.tabs('buildCat', MACHINE_CATS) + `<p class="muted">Toque em <b>POSICIONAR</b>, coloque a peça no mapa e aperte <b>CONFIRMAR</b>. Custos saem do Estoque Central + mochila. 📌 fixa no slot ${(g.selected + 1) % 10} da barra.</p>`;
    if (cat === 'processamento') h += `<p class="hint">Esta camada: <b>${esc(itemName(RAW_BY_LAYER[g.planet.layer]))}</b> → ${esc(compOf(g.planet.layer).chain)} → Compactador → Terminal Orbital. Máquinas na base puxam e devolvem direto ao estoque.</p>`;
    h += `<div class="cards scroll tall">${MACHINES.filter(m => m.cat === cat && m.behavior !== 'command' && m.behavior !== 'analyzer' && !m.hidden && (m.minLayer ?? 1) <= g.planet.layer).map(d => {
      const locked = d.research && !g.research.has(d.research);
      const req = locked ? `🔒 Desbloqueie em Melhorias: ${esc(RESEARCH.find(r => r.key === d.research)?.name ?? d.research!)}` : d.sector12 ? '◈ Apenas no Núcleo' : '';
      const afford = g.stock.has(d.cost, g.pack.items);
      return `<div class="card ${locked ? 'locked' : afford ? '' : 'poor'}">
        <div class="ch"><img src="${g.sprites.machineUrl(d)}"><div><b>${esc(d.name)}</b><small>${d.w}×${d.h} tiles${d.capacity ? ` · ${fmtShort(d.capacity)} ${d.behavior === 'storage' ? 'kg' : 'kg/min'}` : ''}</small></div></div>
        <p>${esc(d.desc)}</p>${d.takes ? `<p class="muted">Processa: ${Object.entries(d.takes).map(([k, f]) => `${esc(itemName(k))}${f < 1 ? ` <span class="warn">(−${Math.round((1 - f) * 100)}%)</span>` : ''}`).join(', ')}</p>` : ''}<div class="cost">${costStr(g, d.cost)}</div>${req ? `<div class="req">${req}</div>` : ''}
        <div class="row">${locked ? '' : `<button class="btn" data-act="build" data-arg="${d.key}">POSICIONAR</button><button class="btn ghost" data-act="pin" data-arg="${d.key}">📌</button>`}<span class="count">${g.machines.count(d.key) ? `Ativas: ${g.machines.count(d.key)}` : ''}</span></div></div>`;
    }).join('')}</div>`;
    return h;
  }

  // =============== MELHORIAS ===============
  // =============== MELHORIAS: árvore única ===============
  r_upgrades() {
    const g = this.g, p = g.player;
    const BR: { key: string; name: string }[] = [{ key: 'perf', name: '⛏ Perfurador' }, { key: 'traje', name: '🧑‍🚀 Traje e Mochila' },
      ...RESEARCH_CATS.filter(c => c.key !== 'energia').map(c => ({ key: c.key, name: c.key === 'robotica' ? 'Drones' : c.key === 'mineracao' ? 'Extração' : c.name }))];
    const br = this.st.upBr;
    let h = `<div class="tabs branches">${BR.map(b => {
      const avail = b.key === 'perf' ? !!DRILLS[p.drillLevel + 1] && g.stock.has(DRILLS[p.drillLevel + 1].cost, g.pack.items) && (!DRILLS[p.drillLevel + 1].research || g.research.has(DRILLS[p.drillLevel + 1].research!))
        : b.key === 'traje' ? false : RESEARCH.some(r => r.cat === b.key && !g.research.blocked(r) && g.stock.credits >= g.research.cost(r).credits && g.stock.has(g.research.cost(r).items, g.pack.items));
      return `<button class="${br === b.key ? 'on' : ''}" data-act="tab" data-arg="upBr:${b.key}">${esc(b.name)}${avail ? ' <i class="dotn"></i>' : ''}</button>`;
    }).join('')}</div>`;
    if (br === 'traje') return h + this.equipList(false);
    if (br === 'perf') {
      // cadeia visual P-01 -> P-06
      const sel = Math.min(DRILLS.length - 1, Number(this.st.drillSel ?? p.drillLevel + 1));
      h += `<p class="muted">O perfurador define que rocha você consegue quebrar. Cada camada mais funda exige uma classe maior.</p><div class="chain">${DRILLS.map((d, i) => {
        const st = i <= p.drillLevel ? 'done' : i === p.drillLevel + 1 ? 'avail' : 'lock';
        return `${i ? '<span class="tarrow">➜</span>' : ''}<div class="node ${st} ${i === sel ? 'on' : ''}" data-act="sel" data-arg="drillSel:${i}"><b>P-0${i + 1}</b><small>${st === 'done' ? '✔ equipado' : `classe ${d.tier}`}</small></div>`;
      }).join('')}</div>`;
      const d = DRILLS[sel];
      const layers = SECTORS.filter(L => L.tier <= d.tier).map(L => L.id);
      h += `<div class="detail"><h2>${esc(d.name)}</h2><div class="stats"><div><small>CLASSE (DUREZA)</small><b>${d.tier}</b></div><div><small>POTÊNCIA</small><b>${d.power}×</b></div><div><small>RAIO DO FEIXE</small><b>${d.radius}</b></div><div><small>ALCANCE</small><b>${d.range} px</b></div><div><small>CAMADAS QUE MINERA</small><b>${layers.length ? layers[0] + '–' + layers[layers.length - 1] : '—'}</b></div></div>`;
      if (sel === p.drillLevel + 1) {
        const lock = d.research && !g.research.has(d.research) ? `🔒 Antes desbloqueie: ${esc(RESEARCH.find(r => r.key === d.research)?.name ?? '')}` : '';
        h += `${this.costCells(d.cost)}${lock ? `<p class="warn">${lock}</p>` : ''}<button class="btn orange big" data-act="upgrade" data-arg="drill" ${lock || !g.stock.has(d.cost, g.pack.items) ? 'disabled' : ''}>MELHORAR PARA P-0${sel + 1}</button>`;
      } else if (sel <= p.drillLevel) h += '<p class="ok">✔ Você já tem este perfurador (ou melhor).</p>';
      else h += '<p class="muted">Melhore os anteriores primeiro.</p>';
      return h + '</div>';
    }
    this.st.resCat = br;
    return h + this.r_research();
  }

  // =============== MISSÕES ===============
  r_missions() {
    const g = this.g, t = this.st.misTab;
    let h = this.tabs('misTab', [{ key: 'camada', name: '◈ Camada atual' }, { key: 'contratos', name: `☰ Contratos (${g.contracts.available.length})` }, { key: 'arquivo', name: `📖 Arquivo (${g.lore.unlocked.size})` }]);
    if (t === 'contratos') return h + this.r_contracts();
    if (t === 'arquivo') return h + this.r_archive();
    const L = g.planet.def, lf = g.planet.layerFraction(), st = g.sectors.s[L.id];
    h += `<div class="cols"><div class="col wide"><div class="detail"><h2 style="color:${L.accent}">${L.code.toUpperCase()} — ${esc(L.name.toUpperCase())}</h2><p>${esc(L.desc)}</p>
      <div class="kv"><span>Camada esgotada</span><b>${(lf * 100).toFixed(2).replace('.', ',')}%</b></div>${this.bar(lf, 1, L.accent)}
      <p class="muted">Cada pedra minerada (por você, perfuradoras, drones ou Complexos) enche esta barra. Em 100% a camada acaba e você desce.</p>
      ${g.canDescend() ? '<button class="btn orange big" data-act="descend">▼ DESCER PARA A PRÓXIMA CAMADA</button>' : ''}
      ${g.sectors.descendBlock() && lf >= 1 ? `<p class="warn">${esc(g.sectors.descendBlock()!)}</p>` : ''}
      <h4>METAS DA CAMADA (cada uma paga créditos)</h4>
      <div class="objs">${g.sectors.objectives(L.id).map((o, i) => `<div class="obj ${o.done ? 'ok' : i === st.phase ? 'cur' : 'later'}"><span>${o.done ? '✔' : i === st.phase ? '▶' : '·'} ${esc(o.text)}</span><b>${o.done ? '' : `${fmtShort(o.cur)} / ${fmtShort(o.max)} · +${fmtShort(g.sectors.reward(L.id, i))} ◆`}</b>${i === st.phase ? this.bar(o.cur, o.max, L.accent) : ''}</div>`).join('')}</div>
      </div></div><div class="col"><h3>O PLANETA</h3><div class="layers">${SECTORS.map(S => {
        const done = S.id < g.planet.layer, cur = S.id === g.planet.layer;
        return `<div class="lyr ${done ? 'done' : cur ? 'cur' : ''}" style="--acc:${S.accent}"><b>${S.code}</b><span>${done || cur ? esc(S.name) : '???'}</span><em>${done ? '✔ esgotada' : cur ? (lf * 100).toFixed(1).replace('.', ',') + '%' : `classe ${S.tier}`}</em></div>`;
      }).join('')}</div></div></div>`;
    return h;
  }

  private equipList(withDrill: boolean) {
    const g = this.g, p = g.player;
    const item = (key: string, title: string, sub: string, cur: string, next: string | null, cost: Record<string, number> | null, req: string | null) => `
      <div class="up"><div class="uh"><b>${esc(title)}</b><small>${esc(sub)}</small></div>
        <div class="uv"><span>${cur}</span>${next ? `<span class="arr">➜</span><span class="nx">${next}</span>` : '<span class="max">MÁXIMO</span>'}</div>
        ${next && cost ? `${this.costCells(cost)}${req ? `<div class="req">${req}</div>` : ''}<button class="btn orange" data-act="upgrade" data-arg="${key}" ${req || !g.stock.has(cost, g.pack.items) ? 'disabled' : ''}>MELHORAR</button>` : ''}</div>`;
    const rq = (r?: string) => r && !g.research.has(r) ? `🔒 Pesquisa: ${RESEARCH.find(x => x.key === r)?.name}` : null;
    const d = DRILLS[p.drillLevel], dn = DRILLS[p.drillLevel + 1];
    let h = `<div class="ups scroll tall">`;
    if (withDrill) h += item('drill', 'Perfurador Portátil', d.name, `Classe ${d.tier} · potência ${d.power} · raio ${d.radius}`, dn ? `Classe ${dn.tier} · potência ${dn.power} · raio ${dn.radius}` : null, dn?.cost ?? null, rq(dn?.research));
    const s = SCANNERS[p.scannerLevel], sn = SCANNERS[p.scannerLevel + 1];
    h += item('scanner', 'Scanner', s.name, `${s.radius} tiles — ${s.desc}`, sn ? `${sn.radius} tiles — ${sn.desc}` : null, sn?.cost ?? null, rq(sn?.research));
    const pk = PACKS[g.pack.level], pn = PACKS[g.pack.level + 1];
    h += item('pack', 'Mochila', pk.name, `${pk.weight} kg · slots ${pk.contencao}/${pk.frio}/${pk.magnetico}`, pn ? `${pn.weight} kg · slots ${pn.contencao}/${pn.frio}/${pn.magnetico}` : null, pn?.cost ?? null, null);
    const en = ENERGY_LEVELS[p.energyLevel + 1];
    h += item('energy', 'Bateria do Traje', `Nível ${p.energyLevel + 1}`, `${p.maxEnergy} de energia`, en ? `${en.max}` : null, en?.cost ?? null, null);
    const hl = HEALTH_LEVELS[p.healthLevel + 1];
    h += item('health', 'Blindagem Vital', `Nível ${p.healthLevel + 1}`, `${p.maxHp} de vida`, hl ? `${hl.max}` : null, hl?.cost ?? null, null);
    for (const m of SUIT_MODULES) {
      const lv = p.suit[m.key] ?? 0, nx = m.levels[lv];
      h += item('suit:' + m.key, m.name, `${m.hazards.map(x => HAZARD_NAMES[x]).join(' + ')} · ${m.desc}`, lv ? `Proteção ${m.levels[lv - 1].prot}%` : 'Não instalado', nx ? `Proteção ${nx.prot}%` : null, nx?.cost ?? null, rq(nx?.research));
    }
    return h + '</div>';
  }
  private upgradeStats(a: string): { title: string; rows: [string, string][]; note: string } {
    const g = this.g, p = g.player;
    if (a === 'drill') { const d = DRILLS[p.drillLevel]; return { title: d.name, rows: [['Classe de rocha', String(d.tier)], ['Potência', d.power + '×'], ['Raio do feixe', String(d.radius)], ['Alcance', d.range + ' px']], note: `Agora você quebra rocha de classe ${d.tier}${SECTORS.find(L => L.tier === d.tier) ? ` — inclusive a ${SECTORS.find(L => L.tier === d.tier)!.name}` : ''}.` }; }
    if (a === 'scanner') { const s = SCANNERS[p.scannerLevel]; return { title: s.name, rows: [['Alcance', s.radius + ' tiles']], note: s.desc }; }
    if (a === 'pack') { const k = PACKS[g.pack.level]; return { title: k.name, rows: [['Carga', k.weight + ' kg'], ['Slots especiais', `${k.contencao}/${k.frio}/${k.magnetico}`]], note: '' }; }
    if (a === 'energy') return { title: 'Bateria do Traje', rows: [['Energia', String(p.maxEnergy)]], note: '' };
    if (a === 'health') return { title: 'Blindagem Vital', rows: [['Vida', String(p.maxHp)]], note: '' };
    const k = a.slice(5); const m = SUIT_MODULES.find(x => x.key === k)!; const lv = p.suit[k] ?? 0;
    return { title: m.name, rows: [['Proteção', lv ? m.levels[lv - 1].prot + '%' : '0%']], note: m.desc };
  }

  private doUpgrade(a: string) {
    const g = this.g, p = g.player;
    let cost: Record<string, number> | undefined; let apply: () => void = () => {};
    if (a === 'drill') { const n = DRILLS[p.drillLevel + 1]; cost = n?.cost; apply = () => p.drillLevel++; }
    if (a === 'scanner') { const n = SCANNERS[p.scannerLevel + 1]; cost = n?.cost; apply = () => p.scannerLevel++; }
    if (a === 'pack') { const n = PACKS[g.pack.level + 1]; cost = n?.cost; apply = () => g.pack.level++; }
    if (a === 'energy') { const n = ENERGY_LEVELS[p.energyLevel + 1]; cost = n?.cost; apply = () => { p.energyLevel++; p.energy = p.maxEnergy; }; }
    if (a === 'health') { const n = HEALTH_LEVELS[p.healthLevel + 1]; cost = n?.cost; apply = () => { p.healthLevel++; p.hp = p.maxHp; }; }
    if (a.startsWith('suit:')) { const k = a.slice(5); const m = SUIT_MODULES.find(x => x.key === k)!; const lv = p.suit[k] ?? 0; cost = m.levels[lv]?.cost; apply = () => (p.suit[k] = lv + 1); }
    if (!cost) return;
    if (!g.stock.pay(cost, g.pack.items)) { g.toast('Recursos insuficientes', '#ff8a3a'); g.audio.error(); return; }
    // antes/depois para a tela de melhoria
    const before = this.upgradeStats(a);
    apply();
    const after = this.upgradeStats(a);
    this.close();
    this.ui.mini.upgradeShow(after.title, before.rows.map(([k, v], i) => [k, v, after.rows[i][1]]), after.note);
    if (a === 'drill') g.dialogue.line('zena', `${DRILLS[p.drillLevel].name} entregue. O custo será descontado em suaves 400 parcelas.`);
  }

  // =============== PESQUISA ===============
  r_research() {
    const g = this.g, R = g.research;
    const cat = this.st.resCat as ResearchCat;
    const nodes = RESEARCH.filter(r => r.cat === cat && !HIDDEN_RESEARCH.has(r.key));
    const sel = RESEARCH.find(r => r.key === this.st.resSel && r.cat === cat) ?? nodes.find(r => !R.done.has(r.key)) ?? nodes[0];
    let h = '';
    if (R.active) { const a = RESEARCH.find(r => r.key === R.active!.key)!; h += `<div class="active-res">⚗ Pesquisando <b>${esc(a.name)}</b> ${this.bar(R.active.t, a.time, '#3ab4ff')} <small>${fmtTime(a.time - R.active.t)}</small></div>`; }
    // profundidade de cada nó pela cadeia de requisitos
    const depth = (k: string, seen = 0): number => { const r = RESEARCH.find(x => x.key === k); if (!r || seen > 10) return 0; return r.req.filter(q => RESEARCH.find(x => x.key === q)?.cat === r.cat).reduce((m, q) => Math.max(m, depth(q, seen + 1) + 1), 0); };
    const cols: string[][] = [];
    for (const n of nodes) { const d = depth(n.key); (cols[d] ??= []).push(n.key); }
    h += `<div class="cols"><div class="col wide tree scroll tall">${cols.map(c => `<div class="tcol">${c.map(k => {
      const r = RESEARCH.find(x => x.key === k)!;
      const st = R.done.has(k) ? 'done' : R.active?.key === k ? 'act' : R.blocked(r) ? 'lock' : 'avail';
      return `<div class="node ${st} ${sel?.key === k ? 'on' : ''}" data-act="sel" data-arg="resSel:${k}"><b>${esc(r.name)}</b><small>${st === 'done' ? '✔ concluída' : st === 'act' ? 'em andamento' : st === 'lock' ? '🔒' : fmtShort(R.cost(r).credits) + ' ◆'}</small></div>`;
    }).join('')}</div>`).join('<div class="tarrow">➜</div>')}</div>`;
    if (sel) {
      const c = R.cost(sel), b = R.blocked(sel);
      const machines = MACHINES.filter(m => m.research === sel.key);
      h += `<div class="col"><div class="detail"><h2>${esc(sel.name.toUpperCase())}</h2><p>${esc(sel.desc)}</p>
        ${machines.length ? `<h4>DESBLOQUEIA</h4><div class="unl">${machines.map(m => `<div><img src="${g.sprites.machineUrl(m)}"><span>${esc(m.name)}</span></div>`).join('')}${ROBOTS.filter(r => r.research === sel.key).map(r => `<div><img src="${g.sprites.robotUrl(r.kind)}"><span>${esc(r.name)}</span></div>`).join('')}</div>` : ''}
        <h4>REQUISITOS</h4><div class="reqs">${sel.req.map(q => `<div class="${R.done.has(q) ? 'ok' : 'no'}">${R.done.has(q) ? '✔' : '✖'} ${esc(RESEARCH.find(x => x.key === q)?.name ?? q)}</div>`).join('')}
        ${sel.certified ? `<div class="${g.sectors.certified(sel.certified) ? 'ok' : 'no'}">${g.sectors.certified(sel.certified) ? '✔' : '✖'} Chegar à Camada ${sel.certified}</div>` : ''}
        ${sel.lore ? `<div class="${g.lore.unlocked.size >= sel.lore ? 'ok' : 'no'}">${g.lore.unlocked.size >= sel.lore ? '✔' : '✖'} ${sel.lore} registros de Khelos (${g.lore.unlocked.size})</div>` : ''}
        ${!sel.req.length && !sel.certified && !sel.lore ? '<div class="ok">✔ Nenhum</div>' : ''}</div>
        <h4>CUSTO DA PESQUISA</h4>${this.costCells(c.items)}<div class="kv"><span>Créditos</span><b style="color:${g.stock.credits >= c.credits ? '#9cff8a' : '#ff7a5a'}">${fmtInt(c.credits)} ◆</b></div>
        ${sel.corporate ? '<p class="muted">◆ Tecnologia corporativa: permanece no próximo contrato.</p>' : ''}
        <button class="btn orange" data-act="research" data-arg="${sel.key}" ${b ? 'disabled' : ''}>${R.done.has(sel.key) ? '✔ DESBLOQUEADO' : 'DESBLOQUEAR'}</button>${b && !R.done.has(sel.key) ? `<p class="warn">${esc(b)}</p>` : ''}</div></div>`;
    }
    return h + '</div>';
  }

  // =============== ROBÔS ===============
  r_robots() {
    const g = this.g;
    const rc = this.nearestRobotics();
    const sel = g.robots.list.find(r => String(r.id) === this.st.robotSel) ?? g.robots.list[0];
    let h = `<div class="cols"><div class="col list scroll tall"><h3>FROTA (${g.robots.list.length})</h3>${g.robots.list.map(r => `<div class="li ${sel === r ? 'on' : ''}" data-act="sel" data-arg="robotSel:${r.id}"><img src="${g.sprites.robotUrl(r.kind)}"><div><b>${esc(r.name)}</b><small>${esc(r.state)}</small>${this.bar(r.energy, 100, '#3ab4ff')}</div>${r.stuck || r.broken ? '<b class="dot no"></b>' : ''}</div>`).join('') || '<p class="muted">Nenhum robô ainda.</p>'}</div>`;
    if (sel) {
      const def = ROBOT[sel.kind];
      h += `<div class="col"><div class="detail"><div class="dh"><img src="${g.sprites.robotUrl(sel.kind)}" style="width:56px"><div><h2>${esc(sel.name)}</h2><small>${esc(def.name)} · ${SECTORS[(sel.sector || 1) - 1].code}</small></div></div>
        <div class="kv"><span>Estado</span><b>${esc(sel.state)}</b></div>
        <div class="kv"><span>Energia</span><b>${Math.round(sel.energy)}%</b></div>${this.bar(sel.energy, 100, '#3ab4ff')}
        <div class="kv"><span>Condição</span><b>${Math.round(sel.cond)}%</b></div>${this.bar(sel.cond, 100, '#e8962a')}
        <div class="kv"><span>Carga</span><b>${fmtInt(bagTotal(sel.cargo))} / ${def.capacity} kg</b></div>
        <h4>ZONA DE TRABALHO</h4><div class="kv"><span>Raio</span><input type="range" min="8" max="44" value="${sel.zr}" data-set="robotR" data-arg="${sel.id}"><b>${sel.zr} tiles</b></div>
        ${sel.kind === 'miner' ? `<div class="kv"><span>Prioridade</span><select data-set="robotP" data-arg="${sel.id}"><option value="">Qualquer minério comum</option>${['lumenita', 'ferronox', 'pyroxis', 'verdanio', 'nexolita', 'crysalis', 'solvex'].map(k => `<option value="${k}" ${sel.priority === k ? 'selected' : ''}>${itemName(k)}</option>`).join('')}</select></div>` : ''}
        <div class="row"><button class="btn" data-act="robotZone" data-arg="${sel.id}">DEFINIR ZONA AQUI</button><button class="btn ghost" data-act="robotScrap" data-arg="${sel.id}">Desmontar</button></div>
        <p class="muted">Robôs presos, quebrados ou sem energia exigem intervenção manual [E].</p></div></div>`;
    }
    h += `<div class="col"><h3>DESBLOQUEIO / FABRICAÇÃO</h3>${rc ? `<p class="muted">Fabricação no ${esc(rc.def.name)} mais próximo.</p>` : '<p class="warn">Construa um Centro Robótico (pesquisa Robótica Básica).</p>'}<div class="scroll tall">${ROBOTS.map(r => {
      const locked = !g.research.has(r.research);
      return `<div class="rcard ${locked ? 'locked' : ''}"><div class="ch"><img src="${g.sprites.robotUrl(r.kind)}"><div><b>${esc(r.name)}</b><small>${r.stats.map(s => s.join(': ')).join(' · ')}</small></div></div><p>${esc(r.desc)}</p><div class="cost">${costStr(g, r.cost)}</div>
        ${locked ? `<div class="req">🔒 ${esc(RESEARCH.find(x => x.key === r.research)?.name ?? '')}</div>` : `<button class="btn orange" data-act="robotBuild" data-arg="${r.kind}" ${!rc || !g.stock.has(r.cost, g.pack.items) ? 'disabled' : ''}>FABRICAR</button>`}</div>`;
    }).join('')}</div></div>`;
    return h + '</div>';
  }
  private nearestRobotics(): Machine | undefined {
    const p = this.g.player;
    let best: Machine | undefined, bd = 1e9;
    for (const m of this.g.machines.list) if (m.def.behavior === 'robotics' && !m.broken) { const [x, y] = this.g.machines.centerPx(m); const d = Math.hypot(x - p.x, y - p.y); if (d < bd) { bd = d; best = m; } }
    return best;
  }

  // =============== CONTRATOS ===============
  r_contracts() {
    const g = this.g, C = g.contracts;
    const tab = this.st.conTab;
    let h = this.tabs('conTab', [{ key: 'disp', name: `Contratos Disponíveis (${C.available.length})` }, { key: 'ativos', name: `Ativos (${C.active.length}/3)` }, { key: 'envio', name: 'Vender excedente' }]);
    if (tab === 'envio') {
      const M = g.machines;
      const ships = Math.max(0, Math.ceil(M.shipFlow / 120));
      h += `<div class="cols"><div class="col"><div class="stats"><div><small>CARGUEIROS ATIVOS</small><b>${ships}</b></div><div><small>TAXA DE ENVIO</small><b>${fmtShort(M.shipFlow)} / ${fmtShort(M.shipCap)} kg/min</b>${this.bar(M.shipFlow, M.shipCap, '#3ab4ff')}</div><div><small>TOTAL ENVIADO</small><b>${fmtShort(g.stats.shipped)} kg</b></div><div><small>CRÉDITOS</small><b>${fmtInt(g.stock.credits)} ◆</b></div></div>
        <p class="muted">Opcional: o Terminal Orbital <b>vende</b> o excedente do Estoque Central pelo valor cheio, na ordem abaixo. Você já ganha créditos só de entregar minério na base.</p>
        <h4>FILA DE PRIORIDADE</h4><div class="shiplist">${M.shipList.map((k, i) => `<div class="sl">${this.icon(k, 22)}<span>${i + 1}. ${esc(itemName(k))}</span><small>${fmtShort(g.stock.count(k))} em estoque · ${ITEM[k]?.value ?? 1} ◆/kg</small><button class="mini" data-act="shipUp" data-arg="${k}">▲</button><button class="mini" data-act="ship" data-arg="${k}">✕</button></div>`).join('') || '<p class="muted">Nada sendo enviado.</p>'}</div></div>
        <div class="col"><h4>ADICIONAR À FILA</h4><div class="grid scroll tall">${Object.keys(g.stock.items).filter(k => !M.shipList.includes(k) && g.stock.count(k) >= 1).map(k => `<div class="cell click" data-act="ship" data-arg="${k}">${this.icon(k, 26)}<span>${esc(itemName(k))}</span><b>${fmtShort(g.stock.count(k))}</b></div>`).join('')}</div></div></div>`;
      return h;
    }
    const list = tab === 'disp' ? C.available : C.active;
    const sel = list.find(c => String(c.id) === this.st.conSel) ?? list[0];
    h += `<div class="cols"><div class="col list scroll tall">${list.map(c => `<div class="li ${sel === c ? 'on' : ''}" data-act="sel" data-arg="conSel:${c.id}">${c.item ? this.icon(c.item, 28) : '<span class="ci">◈</span>'}<div><b>${esc(c.title)}</b><small>Prazo: ${fmtTime(c.left)}</small>${c.accepted ? this.bar(c.progress, c.target, '#3ab4ff') : ''}</div><em>◆ ${fmtShort(c.reward)}</em></div>`).join('') || '<p class="muted">Nenhum contrato aqui. Novos chegam periodicamente.</p>'}</div>`;
    if (sel) {
      const what = sel.kind === 'ship' ? `Entregar ${fmtShort(sel.target)} kg de ${itemName(sel.item!)} na base` : sel.kind === 'mine' || sel.kind === 'rare' ? `Extrair manualmente ${fmtShort(sel.target)} kg de ${itemName(sel.item!)}` : sel.kind === 'craft' ? `Fabricar ${sel.target}× ${itemName(sel.item!)}` : sel.kind === 'ruin' ? `Catalogar ${sel.target} registro(s) de Khelos` : sel.kind === 'rate' ? `Atingir ${fmtShort(sel.target)} t/min de extração` : `Explorar mais ${sel.target}% do setor atual`;
      h += `<div class="col wide"><div class="detail contract"><div class="dh"><img src="${g.sprites.portraitUrl('varren')}" class="portrait"><div><h2>${esc(sel.title.toUpperCase())}</h2><small>Corporação Zenitex</small><p class="flavor">${esc(sel.flavor)}</p></div></div>
        <h4>OBJETIVO</h4><div class="kv"><span>${sel.item ? this.icon(sel.item, 22) : ''} ${esc(what)}</span><b>${fmtShort(sel.progress)} / ${fmtShort(sel.target)}</b></div>${this.bar(sel.progress, sel.target, '#3ab4ff')}
        <div class="kv"><span>⏱ Prazo restante</span><b>${fmtTime(sel.left)}</b></div><div class="kv"><span>Recompensa</span><b class="gold">◆ ${fmtInt(sel.reward)} créditos</b></div>
        <div class="note">Observação da Corporação: "${esc(POOLS.ambient[sel.id % POOLS.ambient.length][1])}"</div>
        ${sel.kind === 'ship' ? `<p class="muted">Conta tudo que chega ao Estoque Central: mochila entregue na cápsula ou minério dos armazéns. Barras: refine na Mochila ou na Refinaria.</p>` : ''}
        ${!sel.accepted ? `<button class="btn green" data-act="accept" data-arg="${sel.id}">ACEITAR CONTRATO</button>` : ''}</div></div>`;
    }
    return h + '</div>';
  }

  // =============== ARQUIVO ===============
  r_archive() {
    const g = this.g, L = g.lore;
    const cat = this.st.archCat as LoreCat;
    const entries = LORE.filter(l => l.cat === cat);
    const sel = LORE.find(l => l.id === this.st.loreSel && L.unlocked.has(l.id)) ?? entries.find(l => L.unlocked.has(l.id));
    let h = this.tabs('archCat', LORE_CATS.map(c => ({ key: c.key, name: `${c.name} (${LORE.filter(l => l.cat === c.key && L.unlocked.has(l.id)).length}/${LORE.filter(l => l.cat === c.key).length})` })));
    h += `<p class="muted">Registros: ${L.unlocked.size}/${LORE.length} · Preservados: ${L.preserved} · Demolidos: ${L.demolished} · Destruídos pela automação: ${L.destroyed}</p>`;
    h += `<div class="cols"><div class="col list scroll tall">${entries.map(l => L.unlocked.has(l.id) ? `<div class="li ${sel?.id === l.id ? 'on' : ''}" data-act="lore" data-arg="${l.id}"><span class="ci">✦</span><div><b>${esc(l.title)}</b><small>${SECTORS[l.sector - 1].code} · ${l.kind}</small></div></div>` : `<div class="li locked"><span class="ci">?</span><div><b>???</b><small>${SECTORS[l.sector - 1].code}</small></div></div>`).join('')}</div>`;
    if (sel) {
      const translated = g.research.has('traducao') || sel.sector <= 6;
      h += `<div class="col wide scroll tall"><div class="detail lore"><h2>${esc(sel.title.toUpperCase())}</h2><small>${SECTORS[sel.sector - 1].name} · ${sel.kind}</small>
        <p class="loretext">${translated ? esc(sel.text) : esc(garble(sel.text))}</p>${translated ? '' : '<p class="warn">Tradução parcial. Pesquise "Tradução Khel".</p>'}
        <div class="aside zena"><img src="${g.sprites.portraitUrl('zena')}"><div><b>AVALIAÇÃO ZENITEX</b><p>${esc(sel.zena)}</p><small>Massa mineral estimada: ${fmtMass(sel.massT)}</small></div></div>
        ${sel.sera ? `<div class="aside sera"><img src="${g.sprites.portraitUrl('sera')}"><div><b>DRA. SERA VENN</b><p>${esc(sel.sera)}</p></div></div>` : ''}</div></div>`;
    } else h += `<div class="col wide"><p class="muted">Nenhum registro nesta categoria ainda. Ruínas e artefatos de Khelos aparecem no mapa como estruturas de pedra ancestral com brilho ciano. O scanner de composição revela assinaturas ancestrais.</p></div>`;
    return h + '</div>';
  }

  // =============== MÁQUINA ===============
  /** Painel de processamento: ENTRADA, PROCESSANDO, SAÍDA, CAPACIDADE, EFICIÊNCIA, GARGALO. */
  private procInfo(m: Machine): string {
    const g = this.g, d = m.def;
    if (d.behavior !== 'separator' && d.behavior !== 'prep' && d.behavior !== 'compactor') return '';
    const cap = d.capacity ?? 0;
    const inKey = Object.keys(m.inb).sort((a, b) => m.inb[b] - m.inb[a])[0] ?? g.machines.inputs(m).find(k => g.stock.count(k) > 0) ?? g.machines.inputs(m)[0];
    const f = d.behavior === 'compactor' ? 1 : d.takes?.[inKey] ?? 1;
    const eff = d.behavior === 'separator' ? SEP_EFF * f : f;
    const gargalo = !m.working ? m.state
      : m.fin < cap * 0.6 ? 'Falta material: a entrada está abaixo da capacidade'
      : 'Nenhum: operando no limite. Mais máquinas = mais vazão';
    const total = bagTotal(m.mix);
    const mix = Object.entries(m.mix).filter(([k]) => d.behavior === 'separator').sort((a, b) => b[1] - a[1]);
    const row = (k: string, v: string, col = '') => `<div class="kv"><span>${k}</span><b${col ? ` style="color:${col}"` : ''}>${v}</b></div>`;
    return `<h4>PROCESSAMENTO</h4>
      ${row('ENTRADA', `${fmtShort(m.fin)} kg/min${inKey ? ` · ${esc(itemName(inKey))}` : ''}`)}
      ${row('PROCESSANDO', `${fmtShort(bagTotal(m.inb))} kg${m.g[inKey] ? ` · teor <i style="color:${gradeColor(m.g[inKey])}">${gradeLabel(m.g[inKey])}</i>` : ''}`)}
      ${row('SAÍDA', d.behavior === 'separator' ? `${fmtShort(m.fout)} kg/min minerais · ${fmtShort(m.fres)} kg/min resíduo` : d.behavior === 'compactor' ? `${fmtShort(m.fin / 100)} blocos/min` : `${fmtShort(m.fout)} kg/min fragmentado`)}
      ${row('CAPACIDADE/MIN', `${fmtShort(cap)} kg`)}${this.bar(m.fin, cap, '#3ae6ff')}
      ${row('EFICIÊNCIA', `${Math.round(eff * 100)}%${f < 1 ? ' — máquina errada para este material' : ''}`, eff < 0.8 ? '#ff8a5a' : '#9cff8a')}
      ${row('GARGALO', esc(gargalo), m.working && m.fin >= cap * 0.6 ? '#9cff8a' : '#ffd04a')}
      ${mix.length && total > 0 ? `<h4>JÁ SEPARADO · ${fmtShort(total)} kg</h4><div class="grid">${mix.map(([k, v]) => `<div class="cell">${this.icon(k, 22)}<span>${esc(itemName(k))}</span><b>${(v / total * 100).toFixed(1).replace('.', ',')}%</b></div>`).join('')}</div>` : ''}
      ${g.machines.atBase(m) ? '<p class="muted">Na base: puxa o material do estoque e entrega a saída direto nele.</p>' : '<p class="muted">Fora da base: alimente por esteira e ligue a saída numa esteira até o armazém.</p>'}`;
  }

  r_machine() {
    const g = this.g, m = this.machine;
    if (!m || !g.machines.byId.has(m.id)) return '<p>Máquina removida.</p>';
    const d = m.def, rt = g.sectors.rt[m.sector];
    const inb = Object.entries(m.inb).filter(([, v]) => v > 0.01), out = Object.entries(m.out).filter(([, v]) => v > 0.01);
    let h = `<div class="cols"><div class="col"><div class="dh"><img src="${g.sprites.machineUrl(d)}" style="width:64px"><div><h2>${esc(d.name)}${d.behavior === 'complex' ? ' ' + COMPLEX_LEVELS[m.level].name : ''}</h2><small>${SECTORS[m.sector - 1].code} · ${esc(SECTORS[m.sector - 1].name)}</small><p>${esc(d.desc)}</p></div></div>
      <div class="kv"><span>Estado</span><b style="color:${m.broken || m.overheat ? '#ff6a4a' : m.working ? '#9cff8a' : '#ffd04a'}">${esc(m.state)}</b></div>
      <div class="kv"><span>Condição</span><b>${Math.round(m.cond)}%</b></div>${this.bar(m.cond, 100, m.cond < 30 ? '#ff6a3a' : '#e8962a')}
      ${['complex', 'tectonic', 'mantle', 'collector'].includes(d.behavior) ? `<div class="kv"><span>Calibração / eficiência</span><b style="color:${m.eff < 0.6 ? '#ff7a5a' : '#9cff8a'}">${Math.round(m.eff * 100)}%</b></div>${this.bar(m.eff, 1.1, m.eff < 0.6 ? '#ff6a3a' : '#3aff8a')}<div class="kv"><span>Extração</span><b>${fmtShort(m.produced)} t no total</b></div>` : ''}
      ${m.boost > 1.001 ? `<div class="kv"><span>Bônus de calibração</span><b>+${Math.round((m.boost - 1) * 100)}%</b></div>` : ''}
      ${d.behavior === 'drill' || d.behavior === 'complex' ? `<div class="kv"><span>Material</span><b>${esc(itemName(RAW_BY_LAYER[g.planet.layer]))}</b></div><div class="kv"><span>Teor da região</span><b style="color:${gradeColor(m.lg ?? 1)}">${gradeLabel(m.lg ?? 1)}</b></div>` : ''}
      ${d.behavior === 'drill' ? `<div class="kv"><span>Avanço no veio</span><b>${m.depth} células</b></div><div class="kv"><span>Produção total</span><b>${fmtShort(m.produced)} kg de bruto</b></div>` : ''}
      ${this.procInfo(m)}
      ${d.capacity && (d.behavior === 'link' || d.behavior === 'terminal') ? `<div class="kv"><span>Capacidade</span><b>${fmtShort(d.capacity)} kg/min ${m.loaders ? `(+${Math.min(3, m.loaders) * 20}% loaders)` : ''}</b></div>` : ''}
      ${d.fuel ? `<div class="kv"><span>Combustível</span><b>${esc(itemName(d.fuel.item))} · ${d.fuel.perMin}/min</b></div>` : ''}
      ${inb.length && !d.takes && d.behavior !== 'compactor' ? `<h4>ENTRADA</h4><div class="grid">${inb.map(([k, v]) => `<div class="cell">${this.icon(k, 22)}<span>${esc(itemName(k))}</span><b>${fmtShort(v)}</b></div>`).join('')}</div>` : ''}
      ${out.length ? `<h4>SAÍDA</h4><div class="grid">${out.map(([k, v]) => `<div class="cell">${this.icon(k, 22)}<span>${esc(itemName(k))}</span><b>${fmtShort(v)}</b></div>`).join('')}</div><button class="btn ghost" data-act="collect">Coletar saída na mochila</button>` : ''}
      </div><div class="col"><h4>AÇÕES</h4><div class="actions">`;
    h += `<button class="btn" data-act="calib">🎛 CALIBRAR (minigame)</button>`;
    if (m.cond < 100) h += `<button class="btn orange" data-act="repair">🔧 REPARAR ${costStr(g, g.machines.repairCost(m))}</button>`;
    if (d.rotatable) h += `<button class="btn ghost" data-act="rotate">↻ Girar ${d.behavior === 'drill' ? '(reinicia o veio)' : ''}</button>`;
    if (d.behavior === 'drill' && m.exhausted) h += `<button class="btn ghost" data-act="reset">Reavaliar veio</button>`;
    if (d.behavior === 'complex') {
      const nx = COMPLEX_LEVELS[m.level + 1];
      if (nx) h += `<div class="upbox"><b>Melhoria para ${nx.name}: ${fmtShort(nx.rate)} t/min</b>${this.costCells(nx.cost)}${nx.research && !g.research.has(nx.research) ? `<div class="req">🔒 ${esc(RESEARCH.find(r => r.key === nx.research)?.name ?? '')}</div>` : ''}<button class="btn orange" data-act="cupgrade">MELHORAR</button></div>`;
    }
    if (d.behavior === 'splitter') h += `<div class="kv"><span>Filtro</span><select data-set="filterSel"><option value="">— sem filtro (divide) —</option>${ITEMS.filter(i => i.cat !== 'consumivel' && i.cat !== 'especial').map(i => `<option value="${i.key}" ${m.filter === i.key ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</select></div>`;
    if (d.behavior === 'synth') h += `<div class="kv"><span>Receita</span><select data-set="recipeSel"><option value="">— escolha —</option>${RECIPES.filter(r => r.station === 'sintetizador' && (!r.research || g.research.has(r.research))).map(r => `<option value="${r.key}" ${m.recipe === r.key ? 'selected' : ''}>${esc(itemName(Object.keys(r.out)[0]))}</option>`).join('')}</select></div>${m.recipe ? `<p class="muted">Insumos: ${costStr(g, RECIPE[m.recipe].in)}</p>` : ''}`;
    if (d.behavior === 'terminal' || d.behavior === 'launchpad') h += `<button class="btn" data-act="tab" data-arg="conTab:envio" onclick="">Configurar envio (J)</button>`;
    if (d.behavior === 'cutter') {
      h += g.flags.finalReady ? (!g.flags.finalSeq ? `<button class="btn red" data-act="finalStart">⚠ INICIAR DESMONTAGEM FINAL</button>` : g.flags.finalArmed ? `<button class="btn red big" data-act="finalFire">DISPARAR CORTADOR PLANETÁRIO</button>` : `<p class="warn">Ajuste os 4 estabilizadores ao redor do núcleo.</p>`) : `<p class="muted">Disponível quando a massa extraída atingir 99%.</p>`;
    }
    if (d.behavior === 'cannon') h += m.charged ? `<p class="ok">Carregado. Dispare pelo Mapa → Visão Orbital.</p>` : `<button class="btn orange" data-act="cannonCharge">Recarregar (1 Célula de Energia Negra)</button>`;
    h += `<button class="btn ghost danger" data-act="dismantle">Desmontar (75% de reembolso)</button></div></div></div>`;
    return h;
  }

  // =============== CENTRAL DE OPERAÇÕES ===============
  r_ops() {
    const g = this.g;
    const resp = this.st.opsResp as [string, string][] | undefined;
    const lines: [string, string][] = resp ?? [
      ['rocha', g.planet.layerFraction() < 0.01 ? 'Carga recebida. A camada ainda tá inteira. Não se preocupa, ela não vai fugir.' : 'Carga recebida. A camada tá diminuindo. Devagar, mas tá.'],
      ['zena', `Camada ${(g.planet.layerFraction() * 100).toFixed(1).replace('.', ',')}% esgotada. Créditos: ${fmtInt(g.stock.credits)}. Sua produtividade foi registrada.`],
    ];
    if (g.canDescend()) lines.push(['br7', 'Camada esgotada. Descida autorizada pelo cartão da camada (▼ DESCER).']);
    const opts: [string, string][] = [
      ['next', 'Qual é o próximo objetivo?'],
      ['status', 'Mostrar status da base e logística.'],
      ['ends', 'Isso aqui algum dia acaba? (sarcástico)'],
    ];
    opts.push(['lifts', 'Usar a rede de elevadores pessoais.']);
    return `<div class="ops">${lines.map(([sp, t]) => `<div class="opl"><img src="${g.sprites.portraitUrl(sp as any)}"><div><b>${sp === 'zena' ? 'ZENA' : sp === 'rocha' ? 'ROCHA' : sp === 'br7' ? 'BR-7' : sp === 'varren' ? 'DIRETOR VARREN' : sp === 'sera' ? 'DRA. SERA VENN' : 'ZENITEX'}</b><p>${esc(t)}</p></div></div>`).join('')}
      <div class="opts">${opts.map(([k, t], i) => `<button data-act="ops" data-arg="${k}"><span>${i + 1}.</span> ${esc(t)} <em>›</em></button>`).join('')}</div></div>`;
  }
  private ops(a: string) {
    const g = this.g;
    if (a === 'next') {
      const o = g.sectors.currentMeta();
      this.st.opsResp = [['zena', o ? `Próxima meta: ${o.text} (${fmtShort(o.cur)}/${fmtShort(o.max)}). Camada ${(g.planet.layerFraction() * 100).toFixed(1).replace('.', ',')}% esgotada.` : `Metas cumpridas. Esgote a ${g.planet.def.name} para descer.`], ['varren', 'E lembre-se: meta cumprida é só o início de uma meta maior.']];
    } else if (a === 'status') {
      const broken = g.machines.list.filter(m => m.broken).length;
      const rt = g.sectors.rt[1];
      this.st.opsResp = [['br7', `Máquinas: ${g.machines.list.length} (${broken} quebradas). Robôs: ${g.robots.list.length}. Vazão logística: ${fmtShort(rt.linkFlow)}/${fmtShort(rt.linkCap)} kg/min. Envio orbital: ${fmtShort(g.machines.shipFlow)} kg/min.`], ['rocha', broken ? 'Tem coisa quebrada por aí. Não vai se consertar sozinha.' : 'Tudo rodando. Por enquanto. Bate na madeira. Se achar madeira neste planeta.']];
    } else if (a === 'contracts') {
      this.st.opsResp = [['varren', `Contratos ativos: ${g.contracts.active.length}. Disponíveis: ${g.contracts.available.length}. Concluídos: ${g.contracts.completed}. Abra o painel de contratos (J) para os detalhes. Eu não leio detalhes.`]];
    } else if (a === 'ends') {
      const l = POOLS.ops_ends[Math.floor(Math.random() * POOLS.ops_ends.length)];
      this.st.opsResp = [l];
    } else if (a.startsWith('audit:')) {
      const s = Number(a.slice(6));
      this.close();
      this.ui.mini.audit(s);
      return;
    } else if (a === 'lifts') { this.open('lifts'); return; }
    this.g.audio.blip('zena');
    this.render();
  }

  r_lifts() {
    const g = this.g;
    const lifts = g.machines.list.filter(m => m.def.behavior === 'lift' || m.def.behavior === 'command');
    return `<p class="muted">Viagem instantânea entre Elevadores Pessoais e o Centro de Comando. Pesquise "Elevadores Pessoais" para construir mais.</p><div class="cards">${lifts.map(m => `<div class="card"><div class="ch"><img src="${g.sprites.machineUrl(m.def)}"><div><b>${esc(m.def.name)}</b><small>${SECTORS[m.sector - 1].code} · ${esc(SECTORS[m.sector - 1].name)}</small></div></div><button class="btn" data-act="lift" data-arg="${m.id}">VIAJAR</button></div>`).join('')}</div>`;
  }

  // =============== MENU / AJUDA / CONFIG ===============
  r_menu() {
    return `<div class="menu"><div class="logo-big">⬢ ZENITEX</div><div class="slogan">Transformando mundos em oportunidades.</div>
      <button class="btn big" data-act="resume">CONTINUAR</button><button class="btn" data-act="save">SALVAR CONTRATO</button><button class="btn" data-act="help">MANUAL DO COLABORADOR</button><button class="btn" data-act="settings">CONFIGURAÇÕES</button><button class="btn ghost" data-act="quit">SALVAR E VOLTAR AO TÍTULO</button><button class="btn ghost danger" data-act="newgame">NOVO CONTRATO</button>
      <p class="muted">Tempo de operação: ${fmtTime(this.g.time)} · Contrato ${this.g.opts.contract}</p></div>`;
  }
  r_settings() {
    const v = this.g.audio.volume;
    return `<div class="menu"><h3>ÁUDIO</h3>${(['master', 'sfx', 'music'] as const).map(k => `<div class="kv"><span>${k === 'master' ? 'Geral' : k === 'sfx' ? 'Efeitos' : 'Música'}</span><input type="range" min="0" max="100" value="${Math.round(v[k] * 100)}" data-set="vol_${k}"></div>`).join('')}
      <h3>CÂMERA</h3><div class="row">${[1.5, 2, 2.5, 3].map(z => `<button class="btn ghost" data-act="zoom" data-arg="${z}">${z}×</button>`).join('')}</div>
      <h3>INTERFACE</h3><button class="btn ghost" data-act="collapse">Recolher/expandir HUD</button><button class="btn" data-act="resume">VOLTAR</button></div>`;
  }
  r_help() {
    return `<div class="help scroll tall"><button class="btn orange" data-act="tutorial">▶ REFAZER O TUTORIAL GUIADO</button><button class="btn" data-act="briefing">📋 REVER O BRIEFING DO CONTRATO</button><div class="cols"><div class="col"><h3>CONTROLES (PC)</h3><table>
      ${[['WASD', 'Mover (Shift: correr)'], ['Mouse', 'Mirar'], ['Botão esquerdo', 'Usar ferramenta (minerar / item)'], ['Botão direito', 'Scanner rápido · cancelar construção'], ['1–0 / Ctrl+roda', 'Barra rápida'], ['E (segurar)', 'Interagir · reparar · catalogar'], ['F', 'Pulso de scanner'], ['Tab', 'Inventário e fabricação'], ['B', 'Construção'], ['R', 'Girar construção'], ['X', 'Desmontar'], ['U', 'Melhorias'], ['K', 'Pesquisa'], ['G', 'Setores'], ['Y', 'Robôs'], ['J', 'Contratos'], ['L', 'Arquivo de Khelos'], ['M', 'Mapa / visão orbital'], ['Roda', 'Zoom'], ['Espaço', 'Pular fala'], ['Esc', 'Menu']].map(([a, b]) => `<tr><td><kbd>${a}</kbd></td><td>${b}</td></tr>`).join('')}</table>
      <h3>MOBILE</h3><p>Joystick esquerdo move. Joystick direito mira e usa a ferramenta. Botões grandes: interagir, scanner, ferramenta, construção, inventário, mapa, recolher HUD.</p></div>
      <div class="col wide"><h3>COMO A ZENITEX FUNCIONA</h3>
      <p><b>Objetivo:</b> extrair 100% da massa planetária. Cada célula removida, cada tonelada da reserva profunda conta.</p>
      <p><b>Minerar:</b> segure o botão sobre paredes. Minérios vão para a mochila (peso e slots especiais). Rocha dura exige perfuradores de classe maior (Melhorias).</p>
      <p><b>Estoque Central:</b> entregue a mochila no Centro de Comando, armazéns ou elevadores [E]. Construções e pesquisas usam o Estoque Central.</p>
      <p><b>Logística:</b> perfuradoras despejam minério em esteiras que saem delas. Esteiras apontando para máquinas as alimentam. Armazéns e elevadores formam o <i>buffer do setor</i>, que sobe ao Estoque Central na vazão dos elevadores. Gargalos aparecem em vermelho.</p>
      <p><b>Energia e calor:</b> cada setor tem sua própria rede. Reatores aquecem o setor; sem refrigeração as máquinas superaquecem.</p>
      <p><b>Saga de automação:</b> cada setor passa por 9 fases (G). Após a certificação, Complexos de Extração Profunda drenam a reserva do setor — mas perdem calibração com o tempo e só você pode recalibrá-los.</p>
      <p><b>Nunca existe automação total:</b> máquinas quebram, veios se esgotam, robôs ficam presos, desabamentos soterram estruturas, anomalias drenam energia. Automatizar resolve o problema antigo e cria um maior.</p>
      <p><b>Morte:</b> você volta à base. Sua carga fica no local — recupere-a.</p>
      <p><b>Khelos:</b> ruínas de pedra ancestral guardam registros. Catalogue-os [E]. Extração automática destrói artefatos expostos.</p></div></div></div>`;
  }

  // =============== MAPA / ÓRBITA ===============
  r_map() {
    const g = this.g;
    const tab = this.st.mapTab;
    let h = `<div class="tabs"><button class="${tab === 'mapa' ? 'on' : ''}" data-act="mapTab" data-arg="mapa">Mapa Planetário</button><button class="${tab === 'orbita' ? 'on' : ''}" data-act="mapTab" data-arg="orbita">Visão Orbital</button></div>`;
    if (tab === 'mapa') return h + `<div class="mapwrap"><canvas class="mapc" width="900" height="640"></canvas><div class="maplegend">${SECTORS.filter(s => g.sectors.s[s.id].discovered).map(s => `<span><i style="background:${s.accent}"></i>${s.code} ${esc(s.name)}</span>`).join('')}<span><i style="background:#ffb04a"></i>Máquinas</span><span><i style="background:#4af0e0"></i>Ruínas / registros</span><span><i style="background:#ff4a3a"></i>Problemas</span><p class="muted">Arraste para mover · roda para zoom</p></div></div>`;
    const cannon = g.machines.list.find(m => m.def.behavior === 'cannon');
    const f = g.planet.fraction();
    const M = g.machines;
    h += `<div class="orbit"><div class="ocol">
      <div class="obox"><h4>SETORES DE EXTRAÇÃO</h4>${SECTORS.filter(s => g.sectors.s[s.id].discovered).map(s => `<div class="osec"><span style="color:${s.accent}">■</span><b>${s.code} — ${esc(s.name)}</b><em>${(g.planet.sectorFraction(s.id) * 100).toFixed(1).replace('.', ',')}%</em>${this.bar(g.planet.sectorFraction(s.id), 1, s.accent)}</div>`).join('')}</div>
      <div class="obox"><h4>PROGRESSO DA DESTRUIÇÃO DO PLANETA</h4><div class="stages">${[0, 0.1, 0.25, 0.5, 0.75, 0.9, 1].map(v => `<div class="stg ${f >= v ? 'on' : ''}"><canvas data-stage="${v}" width="56" height="56"></canvas><small>${v * 100}%</small></div>`).join('')}</div></div>
    </div><div class="ocenter"><canvas class="planetc" width="560" height="560"></canvas>${cannon ? `<div class="cannon-ui">${cannon.charged ? 'CANHÃO DE MATÉRIA PRONTO — clique em um setor para disparar' : 'Canhão descarregado — recarregue manualmente no local'}</div>` : ''}</div>
    <div class="ocol"><div class="obox"><h4>ROTAS DE TRANSPORTE ORBITAL</h4><div class="stats"><div><small>CARGUEIROS ATIVOS</small><b>${Math.ceil(M.shipFlow / 120)}</b></div><div><small>TAXA DE ENVIO TOTAL</small><b>${fmtShort(M.shipFlow)} kg/min</b></div><div><small>EXTRAÇÃO PLANETÁRIA</small><b>${fmtShort(g.planet.rate())} t/min</b></div></div></div>
      <div class="obox"><h4>CONTRATOS ATIVOS</h4>${g.contracts.active.map(c => `<div class="osec">${c.item ? this.icon(c.item, 20) : '◈'}<b>${esc(c.title)}</b><em class="gold">◆ ${fmtShort(c.reward)}</em>${this.bar(c.progress, c.target, '#3ab4ff')}<small>Prazo: ${fmtTime(c.left)}</small></div>`).join('') || '<p class="muted">Nenhum.</p>'}</div>
      <div class="obox ad"><b>MENOS PLANETAS.<br>MAIS LUCRO.</b><small>⬢ ZENITEX — transformando mundos em oportunidades.</small></div></div></div>`;
    return h;
  }

  private startMap() {
    const g = this.g;
    this.mapView.x = g.player.x; this.mapView.y = g.player.y; this.mapView.z = 0.6;
    const loop = () => {
      if (this.id !== 'map') return;
      if (this.st.mapTab === 'mapa') this.drawMap(); else this.drawOrbit();
      this.mapRaf = requestAnimationFrame(loop);
    };
    loop();
  }
  private bindMapCanvas() {
    const c = this.el?.querySelector<HTMLCanvasElement>('.mapc');
    if (c) {
      const v = this.mapView;
      c.onmousedown = e => { v.drag = true; v.lx = e.clientX; v.ly = e.clientY; };
      window.onmouseup = () => (v.drag = false);
      c.onmousemove = e => { if (!v.drag) return; v.x -= (e.clientX - v.lx) / (v.z * 0.25); v.y -= (e.clientY - v.ly) / (v.z * 0.25); v.lx = e.clientX; v.ly = e.clientY; };
      c.onwheel = e => { e.preventDefault(); v.z = Math.max(0.1, Math.min(3, v.z * (e.deltaY > 0 ? 0.85 : 1.18))); };
      c.ontouchmove = e => { const t = e.touches[0]; if (v.lx) { v.x -= (t.clientX - v.lx) / (v.z * 0.25); v.y -= (t.clientY - v.ly) / (v.z * 0.25); } v.lx = t.clientX; v.ly = t.clientY; e.preventDefault(); };
      c.ontouchend = () => { v.lx = 0; };
    }
    const pc = this.el?.querySelector<HTMLCanvasElement>('.planetc');
    if (pc) {
      pc.onclick = e => {
        const r = pc.getBoundingClientRect();
        const u = (e.clientX - r.left) / r.width, vv = (e.clientY - r.top) / r.height;
        const s = this.g.world.sectorAtPx(u * WORLD_PX_W, vv * WORLD_PX_H);
        if (s) this.fireCannon(s);
      };
      this.el!.querySelectorAll<HTMLCanvasElement>('[data-stage]').forEach(sc => {
        const v = Number(sc.dataset.stage);
        sc.getContext('2d')!.drawImage(renderPlanet(this.g, 56, v), 0, 0);
      });
    }
  }
  private fireCannon(s: number) {
    const g = this.g;
    const c = g.machines.list.find(m => m.def.behavior === 'cannon' && m.charged && !m.broken);
    if (!c) return;
    if (g.sectors.rt[c.sector].ratio < 0.9) { g.toast('Energia insuficiente para o disparo', '#ff8a3a'); return; }
    const got = g.planet.cannonHit(s, g.planet.def.target * CANNON_SHOT_FRAC);
    c.charged = false;
    g.audio.boom(); g.shake(10);
    g.fx.flashScreen([255, 120, 255], 0.4);
    g.toast(`Disparo: ${fmtShort(got * g.planet.tPerUnit())} t arrancadas da camada. Recarga manual necessária.`, '#ff8aff');
    this.planetCache = null;
  }

  private drawMap() {
    const c = this.el?.querySelector<HTMLCanvasElement>('.mapc');
    if (!c) return;
    const g = this.g, x = c.getContext('2d')!;
    const W = c.width, H = c.height, v = this.mapView;
    const s = v.z * 0.25; // px de canvas por px de mundo
    x.fillStyle = '#020306'; x.fillRect(0, 0, W, H);
    // corte inteiro da camada (1 px = 2 células = 8 px de mundo)
    const ov = g.terrain.overview(performance.now());
    x.imageSmoothingEnabled = false;
    x.drawImage(ov, (0 - v.x) * s + W / 2, (0 - v.y) * s + H / 2, WORLD_PX_W * s, WORLD_PX_H * s);
    const P = (wx: number, wy: number): [number, number] => [(wx - v.x) * s + W / 2, (wy - v.y) * s + H / 2];
    for (const m of g.machines.list) {
      const [px, py] = P(m.tx * TILE, m.ty * TILE);
      x.fillStyle = m.broken || m.overheat ? '#ff4a3a' : m.def.behavior === 'belt' ? '#8a6a3a' : '#ffb04a';
      x.fillRect(px, py, Math.max(1.5, m.def.w * TILE * s), Math.max(1.5, m.def.h * TILE * s));
    }
    for (const r of g.robots.list) { const [px, py] = P(r.x, r.y); x.fillStyle = r.stuck || r.broken ? '#ff4a3a' : '#ffd27a'; x.fillRect(px - 1.5, py - 1.5, 3, 3); }
    x.font = '11px Rajdhani, sans-serif';
    for (const mk of g.scanner.mapMarkers) {
      const [px, py] = P(mk.x, mk.y);
      x.fillStyle = mk.color; x.beginPath(); x.arc(px, py, 3.5, 0, 7); x.fill();
      if (v.z > 0.35) { x.fillStyle = 'rgba(255,255,255,0.8)'; x.fillText(mk.label, px + 6, py + 3); }
    }
    for (const a of g.lore.artifacts) if (a.seen && !a.done && !a.destroyed) { const [px, py] = P(a.x, a.y); x.fillStyle = '#4af0e0'; x.fillRect(px - 2, py - 2, 4, 4); }
    if (g.player.cargo) { const [px, py] = P(g.player.cargo.x, g.player.cargo.y); x.fillStyle = '#ffb04a'; x.fillText('✖ carga perdida', px - 4, py + 3); }
    const [px, py] = P(g.player.x, g.player.y);
    x.fillStyle = '#fff'; x.beginPath(); x.arc(px, py, 4, 0, 7); x.fill();
    x.strokeStyle = '#fff'; x.beginPath(); x.arc(px, py, 8 + Math.sin(performance.now() / 200) * 2, 0, 7); x.stroke();
    void CELL; void WORLD_TW; void WORLD_TH; void TILE;
  }

  private drawOrbit() {
    const c = this.el?.querySelector<HTMLCanvasElement>('.planetc');
    if (!c) return;
    const g = this.g, x = c.getContext('2d')!;
    const t = performance.now() / 1000;
    if (!this.planetCache || t - this.planetCache.t > 3) this.planetCache = { c: renderPlanet(g, 420, undefined, t), t };
    x.fillStyle = '#02040a'; x.fillRect(0, 0, 560, 560);
    for (let i = 0; i < 120; i++) { x.fillStyle = `rgba(255,255,255,${(i * 37 % 10) / 14})`; x.fillRect((i * 97) % 560, (i * 53) % 560, 1, 1); }
    x.drawImage(this.planetCache.c, 70, 70);
    // anel de cargueiros
    const ships = Math.min(24, Math.ceil(g.machines.shipFlow / 120) + 2);
    x.strokeStyle = 'rgba(255,170,60,0.35)'; x.setLineDash([3, 6]);
    x.beginPath(); x.ellipse(280, 280, 250, 200, -0.2, 0, Math.PI * 2); x.stroke(); x.setLineDash([]);
    for (let i = 0; i < ships; i++) {
      const a = t * 0.15 + (i / ships) * Math.PI * 2;
      const px = 280 + Math.cos(a) * 250 * Math.cos(-0.2) - Math.sin(a) * 200 * Math.sin(-0.2), py = 280 + Math.cos(a) * 250 * Math.sin(-0.2) + Math.sin(a) * 200 * Math.cos(-0.2);
      x.fillStyle = '#c8ccd6'; x.fillRect(px - 4, py - 2, 8, 4); x.fillStyle = '#e8962a'; x.fillRect(px - 4, py - 2, 2, 4);
      x.fillStyle = 'rgba(90,180,255,0.8)'; x.fillRect(px - 6, py - 1, 2, 2);
    }
    // rótulos dos setores
    x.font = '700 12px Rajdhani, sans-serif';
    for (const sd of SECTORS) {
      if (!g.sectors.s[sd.id].discovered) continue;
      const px = 70 + sd.pos[0] * 420, py = 70 + sd.pos[1] * 420;
      const f = g.planet.sectorFraction(sd.id);
      x.fillStyle = 'rgba(8,14,22,0.85)'; x.fillRect(px + 8, py - 22, 74, 28);
      x.strokeStyle = sd.accent; x.strokeRect(px + 8.5, py - 21.5, 73, 27);
      x.fillStyle = '#fff'; x.fillText(sd.code.toUpperCase(), px + 13, py - 9);
      x.fillStyle = sd.accent; x.fillText(`${(f * 100).toFixed(1).replace('.', ',')}%`, px + 13, py + 3);
      x.beginPath(); x.arc(px, py, 4, 0, 7); x.fill();
      x.strokeStyle = sd.accent; x.beginPath(); x.arc(px, py, 7 + Math.sin(t * 3) * 1.5, 0, 7); x.stroke();
    }
  }
}

function garble(t: string) { return t.split(' ').map((w, i) => (i % 3 === 1 ? '▓'.repeat(Math.min(6, w.length)) : w)).join(' '); }
