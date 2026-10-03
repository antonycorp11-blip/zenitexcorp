import './styles.css';
import { Game, type GameOptions } from './Game';
import { UI } from './ui/UI';
import type { PanelId } from './ui/Panels';
import { MobileControls } from './input/MobileControls';
import { loadSlot, deleteSlot } from './systems/Save';
import { RESEARCH_BY_KEY } from './data/research';
import { ITEMS } from './data/items';
import { SECTORS } from './data/sectors';
import { inPortal, isLocalHost, PLAY_URL, transferLocalSave, cloudLoad, athgReady, athgOwnExit, athgGameStarted } from './core/athg';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const DEV = new URLSearchParams(location.search).has('dev') && isLocalHost();   // atalhos de desenvolvedor só no computador de desenvolvimento
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || (DEV && new URLSearchParams(location.search).has('touch'));
if (isTouch) document.body.classList.add('touch');

async function boot() {
  // TRAVA: o jogo só roda dentro do ATHG. Link direto → leva o save local para o ATHG e redireciona.
  if (!inPortal() && !isLocalHost() && !DEV) {
    const title = document.getElementById('title');
    if (title) title.innerHTML = '<div class="tbox"><div class="tlogo"><span class="hex">⬢</span> ZENITEX</div><div class="tsub">ABRINDO NO ATHG…</div></div>';
    const local = await loadSlot('slot1').catch(() => null);
    if (local) await transferLocalSave(local);
    location.replace(PLAY_URL);
    return;
  }
  athgReady();
  athgOwnExit();
  let save = await loadSlot('slot1');
  // dentro do portal: o save da conta (nuvem) vale se for mais novo que o deste aparelho
  const cloud = await cloudLoad();
  if (cloud && (cloud.v === 4 || cloud.v === 5) && (!save || (cloud.savedAt ?? 0) > (save.savedAt ?? 0))) save = cloud;
  // saves da versão por setores (v1) não são compatíveis com o mundo em camadas
  if (save && save.v !== 3 && save.v !== 4 && save.v !== 5) { await deleteSlot('slot1'); save = null; }
  let pendingNG: GameOptions | null = null;
  try { const s = localStorage.getItem('zx_ng'); if (s) pendingNG = JSON.parse(s); } catch { /* */ }
  const title = document.getElementById('title')!;
  if (pendingNG) { localStorage.removeItem('zx_ng'); title.remove(); start(pendingNG, null); return; }
  const cont = title.querySelector<HTMLButtonElement>('[data-t="cont"]')!;
  if (save) {
    const f = (save.planet?.units ? save.planet.units.reduce((a: number, u: number, i: number) => a + (i ? SECTORS[i - 1].share * Math.min(1, u / SECTORS[i - 1].target) : 0), 0) : 0) * 100;
    cont.innerHTML = `CONTINUAR CONTRATO <small>${f.toFixed(5).replace('.', ',')}% extraído</small>`;
  } else cont.style.display = 'none';
  cont.onclick = () => { title.remove(); start(save.opts, save); };
  const auto = new URLSearchParams(location.search).get('auto');
  if (DEV && auto !== null) { title.remove(); if (save && auto !== 'new') start(save.opts, save); else { await deleteSlot('slot1'); start({ seed: Number(auto) || 12345, contract: 1, massMult: 1 }, null); } return; }
  title.querySelector<HTMLButtonElement>('[data-t="new"]')!.onclick = async () => {
    if (save && !confirm('Já existe um contrato em andamento. Começar outro descarta o atual. Continuar?')) return;
    await deleteSlot('slot1');
    title.remove();
    start({ seed: (Math.random() * 1e9) | 0, contract: 1, massMult: 1 }, null);
  };
}

function start(opts: GameOptions, save: any) {
  athgGameStarted();
  const g = new Game(canvas, opts);
  g.ui = new UI(g);
  (window as any).game = g;
  try { const v = localStorage.getItem('zx_vol'); if (v) Object.assign(g.audio.volume, JSON.parse(v)); } catch { /* */ }
  g.audio.init();
  g.renderer.resize();
  window.addEventListener('resize', () => g.renderer.resize());
  if (isTouch) {
    g.input.touch = true;
    document.body.classList.add('touch');
    new MobileControls(g.input, b => {
      g.audio.init();
      if (b === 'interact' || (b === 'tapAction' && g.hover)) { if (g.hover) { g.input.press('e'); g.input.keys.add('e'); setTimeout(() => g.input.keys.delete('e'), (g.hover.kind === 'machine' && (g.hover.ref as any).broken) || g.hover.kind === 'artifact' || g.hover.kind === 'anomaly' ? 2800 : 100); } }
      if (b === 'scan') g.scanner.pulse();
      if (b === 'blow') { g.flags.blowMode = !g.flags.blowMode; document.querySelector('#mobile [data-b="blow"]')?.classList.toggle('on', !!g.flags.blowMode); g.toast(g.flags.blowMode ? 'SOPRAR: o joystick direito joga material da mochila' : 'CAVAR: o joystick direito cava e aspira', '#ffd04a'); }
      if (b === 'tool2') g.selectSlot(g.selected === 0 ? 1 : 0);
      const panel = ({ inv: 'inventory', build: 'build', upgrades: 'upgrades', research: 'research', sectors: 'sectors', robots: 'robots', contracts: 'contracts', archive: 'archive', map: 'map', help: 'help' } as Record<string, PanelId>)[b];
      if (panel) g.ui.open(panel);
      if (b === 'hud') g.ui.toggleCollapse();
    });
  }
  if (save) {
    g.load(save);
    g.beginOffline(save.savedAt);
    g.flags.intro = false;
    g.dialogue.line('zena', 'Bem-vindo de volta. O planeta esperou por você. Ele não tinha escolha.');
    g.flags.briefed = true;
    if (g.flags.justDescended) {
      g.markLayerStart();
      const L = SECTORS[g.flags.justDescended - 1];
      g.ui.sectorTitle(L.id);
      g.ui.banner(`${L.code.toUpperCase()} — ${L.name.toUpperCase()}`, `Base empacotada e reembolsada (${g.flags.packed ?? 0} construções). Remonte a operação.`);
      g.dialogue.line('zena', L.desc);
      g.flags.justDescended = 0;
    }
  } else {
    g.setupNew();
    if (opts.contract > 1) g.dialogue.line('varren', `Contrato 7-K${36 + opts.contract}. Planeta maior. Mesma missão. Suas tecnologias corporativas foram transferidas — o resto foi "reciclado".`);
    const afterIntro = () => {
      g.flags.intro = false;
      g.ui.flashMass();
      g.ui.sectorTitle(1);
      g.flags.briefed = true;
    };
    if (DEV && new URLSearchParams(location.search).has('auto')) afterIntro(); else g.ui.cine.intro(afterIntro);
  }
  canvas.addEventListener('mousedown', () => g.audio.init());
  window.addEventListener('beforeunload', () => { if (!g.flags.intro) g.save(); });

  (window as any).zenitexNewGame = async () => {
    g.leaving = true; await deleteSlot('slot1'); location.reload(); };
  (window as any).zenitexNewGamePlus = async () => {
    g.leaving = true;
    const keep = [...g.research.done].filter(k => RESEARCH_BY_KEY[k]?.corporate);
    const ng: GameOptions = { seed: (Math.random() * 1e9) | 0, contract: opts.contract + 1, massMult: opts.massMult * 1.5, keepResearch: keep };
    localStorage.setItem('zx_ng', JSON.stringify(ng));
    await deleteSlot('slot1');
    location.reload();
  };

  if (DEV) devTools(g);

  let last = performance.now();
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); if (!g.flags.intro) g.save(); }
    else if (hiddenAt) { g.beginOffline(hiddenAt); hiddenAt = 0; last = performance.now(); }
  });
  // um erro num quadro nunca pode congelar o jogo: agenda o próximo quadro antes e isola cada etapa
  let errs = 0;
  const safe = (f: () => void, what: string) => { try { f(); } catch (e) { if (errs++ < 20) console.error(`[zenitex] erro em ${what}:`, e); } };
  const frame = (now: number) => {
    requestAnimationFrame(frame);
    if (document.hidden) { last = now; return; }
    const gap = (now - last) / 1000;
    const dt = Math.min(0.1, gap);
    last = now;
    const started = performance.now();
    safe(() => g.update(dt), 'update');
    safe(() => g.renderer.draw(dt), 'draw');
    safe(() => g.ui.update(dt), 'ui');
    safe(() => g.renderer.recordFrame(gap, performance.now() - started), 'quality');
  };
  requestAnimationFrame(frame);
}

/** Ferramentas de teste: ?dev na URL. */
function devTools(g: Game) {
  (window as any).step = (n: number, fn?: (i: number) => void) => {
    for (let i = 0; i < n; i++) { fn?.(i); g.update(1 / 60); }
    g.renderer.draw(1 / 60); g.ui.update(1);
    return [g.time.toFixed(1), g.player.x | 0, g.player.y | 0];
  };
  g.toast('MODO DEV: F2 recursos · F3 +massa · F4 avança fase · F5 invencível · F6 revela mapa · F7 pesquisa tudo · F8 drill máx', '#ff8aff');
  window.addEventListener('keydown', e => {
    if (e.key === 'F2') { for (const i of ITEMS) g.stock.add(i.key, 500, false); g.stock.credits += 1e6; g.toast('+recursos', '#ff8aff'); }
    if (e.key === 'F3') { const s = g.world.sectorAtPx(g.player.x, g.player.y) || 1; g.planet.cannonHit(s, g.planet.total * 0.05); }
    if (e.key === 'F4') { const s = g.sectors.focus(); g.sectors.advance(s); if (g.sectors.s[s].phase === 7) g.sectors.s[s].auditPassed = true; }
    if (e.key === 'F5') { g.flags.godMode = !g.flags.godMode; g.toast('god ' + g.flags.godMode, '#ff8aff'); }
    if (e.key === 'F6') { g.world.explored.fill(1); }
    if (e.key === 'F7') { for (const k of Object.keys(RESEARCH_BY_KEY)) g.research.grant(k); }
    if (e.key === 'F8') { g.player.drillLevel = 5; g.player.scannerLevel = 3; g.pack.level = 4; for (const k of ['termico', 'crio', 'filtro', 'blindagem', 'gravidade', 'pressao', 'sintonia']) g.player.suit[k] = 3; }
    if (e.key.startsWith('F') && e.key.length <= 3 && Number(e.key.slice(1)) >= 2 && Number(e.key.slice(1)) <= 8) e.preventDefault();
  });
}

boot();
