/**
 * Economia enxuta: cada camada tem 2 minérios principais + 1 raro, e cada minério principal vira
 * 1 barra refinada. Componentes e ligas intermediárias deixam de existir nos custos: são expandidos
 * aqui, uma vez, para barras e minérios. Os dados originais continuam legíveis nos arquivos de origem.
 */
import { MACHINES, COMPLEX_LEVELS } from './machines';
import { RESEARCH } from './research';
import { DRILLS, SCANNERS, PACKS, SUIT_MODULES, ENERGY_LEVELS, HEALTH_LEVELS } from './equipment';
import { RECIPES, RECIPE } from './recipes';
import { ROBOTS } from './robots';

type Cost = Record<string, number>;

/** Itens que não existem mais como etapa: viram suas barras/minérios. */
const EXPAND: Record<string, Cost> = {
  componente: { placa_ferronox: 2 },
  motor: { placa_ferronox: 2, celula_lumenita: 1 },
  bateria: { celula_lumenita: 3 },
  broca: { placa_ferronox: 3 },
  sensor: { chip_nexolita: 1, celula_lumenita: 1 },
  filtro: { chip_nexolita: 1, placa_ferronox: 1 },
  circuito: { chip_nexolita: 2, placa_ferronox: 1 },
  nucleo_ia: { chip_nexolita: 6, celula_lumenita: 4, cristal_memoria: 2 },
  nucleo_sinaptico: { celula_lumenita: 1, chip_nexolita: 1 },
  refrigerante_bio: { gel_crysalis: 1, chip_nexolita: 1 },
  celula_negra: { matriz_umbrium: 1, celula_lumenita: 2 },
  polimero_solvex: { placa_ferronox: 2, chip_nexolita: 1 },
  liga_ancestral: { liga_termo: 2, cristal_memoria: 1 },
  fibra_verdanio: { celula_lumenita: 1, placa_ferronox: 1 },
  verdanio: { lumenita: 1 },            // o Verdânio saiu das camadas principais
  crysalis: { lumenita: 2 },            // equipamentos de calor precisam existir antes da camada de Crysalis
};

function expand(c: Cost): Cost {
  let cur: Cost = { ...c };
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    const next: Cost = {};
    for (const [k, n] of Object.entries(cur)) {
      const sub = EXPAND[k];
      if (!sub) { next[k] = (next[k] ?? 0) + n; continue; }
      changed = true;
      for (const [sk, sn] of Object.entries(sub)) next[sk] = (next[sk] ?? 0) + sn * n;
    }
    cur = next;
    if (!changed) break;
  }
  for (const k in cur) cur[k] = Math.max(1, Math.round(cur[k]));
  return cur;
}
function rewrite(obj: { [k: string]: any }, field: string) {
  if (obj[field]) { const e = expand(obj[field]); for (const k of Object.keys(obj[field])) delete obj[field][k]; Object.assign(obj[field], e); }
}

/** Processamento que saiu do jogo (só a Refinaria fica). */
export const HIDDEN_RESEARCH = new Set(['triturador', 'purificador', 'fundidor', 'sintetizador', 'liga_ancestral']);

let applied = false;
export function applyEconomy() {
  if (applied) return;
  applied = true;
  for (const m of MACHINES) rewrite(m, 'cost');
  for (const l of COMPLEX_LEVELS) rewrite(l, 'cost');
  for (const r of RESEARCH) rewrite(r, 'items');
  for (const d of DRILLS) rewrite(d, 'cost');
  for (const s of SCANNERS) rewrite(s, 'cost');
  for (const p of PACKS) rewrite(p, 'cost');
  for (const e of ENERGY_LEVELS) rewrite(e, 'cost');
  for (const h of HEALTH_LEVELS) rewrite(h, 'cost');
  for (const sm of SUIT_MODULES) for (const lv of sm.levels) rewrite(lv, 'cost');
  for (const rb of ROBOTS) rewrite(rb, 'cost');
  for (const rc of RECIPES) if (rc.station === 'oficina') rewrite(rc, 'in');
  // máquinas de processamento intermediário fora do jogo
  for (const k of ['triturador', 'purificador', 'fundidor', 'sintetizador']) { const d = MACHINES.find(x => x.key === k); if (d) d.hidden = true; }
  // P-03 é meta da Pedra: só pode pedir o que existe até a Pedra
  DRILLS[2].cost = { placa_ferronox: 40, celula_lumenita: 20, chip_nexolita: 10 };
  // explosivos precisam existir desde a primeira camada
  const ex = RECIPE.of_explosivo; if (ex) { for (const k of Object.keys(ex.in)) delete ex.in[k]; Object.assign(ex.in, { ferronox: 6, lumenita: 3 }); }
  const exr = RESEARCH.find(r => r.key === 'explosivos'); if (exr) exr.items = { ferronox: 60 };
  // Fundidor saiu da árvore: quem dependia dele passa a depender da Refinaria
  for (const r of RESEARCH) r.req = r.req.map(q => (HIDDEN_RESEARCH.has(q) ? 'refino' : q)).filter((q, i, a) => a.indexOf(q) === i && q !== r.key);
  for (const d of DRILLS) if (d.research && HIDDEN_RESEARCH.has(d.research)) d.research = 'refino';
  for (const sm of SUIT_MODULES) for (const lv of sm.levels) if (lv.research && HIDDEN_RESEARCH.has(lv.research)) lv.research = undefined;
}
applyEconomy();
