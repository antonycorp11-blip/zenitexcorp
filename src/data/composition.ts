import { fbm } from '../core/noise';

/**
 * MASSA PLANETÁRIA BRUTA.
 * Minerar (à mão ou com perfuradoras) produz o material bruto da camada. Ele só vira minerais
 * depois de processado; o que sobra é resíduo planetário, que precisa ser compactado e exportado.
 * A barra da camada mede massa REMOVIDA do planeta (separada ou exportada), não massa escavada.
 */

/** kg de material bruto por unidade de meta da camada (1 célula minerada à mão = 1 unidade). */
export const KG_PER_UNIT = 2;
/** kg de resíduo em cada Bloco de Massa Planetária. */
export const BLOCK_KG = 100;

export const RAW_BY_LAYER = ['', 'solo_k37', 'rocha_bruta', 'basalto_bruto', 'matriz_cristalina', 'rocha_manto', 'matriz_profunda', 'materia_nucleo'];
export const rawOf = (layer: number) => RAW_BY_LAYER[layer] ?? RAW_BY_LAYER[1];
/** Itens cuja composição varia (carregam um "teor" médio por contêiner). */
export const GRADED = new Set([...RAW_BY_LAYER.filter(Boolean), 'fragmentado']);

export interface LayerComp {
  minerals: { k: string; frac: number }[];   // fração em massa no teor 1.0
  rare: { k: string; frac: number };
  /** processamento exigido (texto curto para UI/tutorial) */
  chain: string;
}

export const COMPOSITION: Record<number, LayerComp> = {
  1: { minerals: [{ k: 'ferronox', frac: 0.115 }, { k: 'lumenita', frac: 0.07 }], rare: { k: 'lumenita_pura', frac: 0.004 }, chain: 'Processador de Solo (ressonância)' },
  2: { minerals: [{ k: 'ferronox', frac: 0.10 }, { k: 'nexolita', frac: 0.06 }], rare: { k: 'nexolita_condensada', frac: 0.003 }, chain: 'Triturador → Separador Mineral' },
  3: { minerals: [{ k: 'pyroxis', frac: 0.10 }, { k: 'ferronox_denso', frac: 0.06 }], rare: { k: 'pyroxis_volatil', frac: 0.004 }, chain: 'Triturador Pesado → Separador (térmico)' },
  4: { minerals: [{ k: 'crysalis', frac: 0.09 }, { k: 'lumenita', frac: 0.07 }], rare: { k: 'lumenita_instavel', frac: 0.005 }, chain: 'Fragmentador Controlado → Separador Mineral' },
  5: { minerals: [{ k: 'necrocristal', frac: 0.07 }, { k: 'umbrium', frac: 0.05 }], rare: { k: 'nexolita_condensada', frac: 0.004 }, chain: 'Descompressor → Separador (gravitacional)' },
  6: { minerals: [{ k: 'solvex', frac: 0.08 }, { k: 'ferronox_denso', frac: 0.06 }], rare: { k: 'lumenita_pura', frac: 0.006 }, chain: 'Descompressor ou Triturador Pesado → Separador' },
  7: { minerals: [{ k: 'umbrium', frac: 0.07 }, { k: 'necrocristal', frac: 0.06 }], rare: { k: 'fragmento_nucleo', frac: 0.01 }, chain: 'Desintegrador → Separador Industrial' },
};
export const compOf = (layer: number) => COMPOSITION[layer] ?? COMPOSITION[1];

/** Separação de um lote: minerais (variação natural) + resíduo. Nada some: perdas viram resíduo. */
export function separate(layer: number, kg: number, grade: number, eff: number, rnd = Math.random): { out: Record<string, number>; residue: number } {
  const c = compOf(layer);
  const out: Record<string, number> = {};
  let sum = 0;
  for (const m of c.minerals) {
    const q = kg * m.frac * grade * eff * (0.85 + 0.3 * rnd());
    if (q > 0) { out[m.k] = q; sum += q; }
  }
  // raro: chance proporcional ao teor (pedaços de 1 kg)
  const exp = kg * c.rare.frac * grade * eff;
  let rare = Math.floor(exp);
  if (rnd() < exp - rare) rare++;
  if (rare > 0) { out[c.rare.k] = rare; sum += rare; }
  if (sum > kg * 0.6) { const f = (kg * 0.6) / sum; for (const k in out) out[k] *= f; sum = kg * 0.6; }
  return { out, residue: Math.max(0, kg - sum) };
}

/** Teor regional (0.4..2.0): campo procedural. Veios visíveis multiplicam o teor. */
export function gradeAt(seed: number, layer: number, cx: number, cy: number): number {
  const n = fbm(cx * 0.003, cy * 0.003, seed + 900 + layer * 17, 3);
  const t = Math.max(0, Math.min(1, (n - 0.3) / 0.4));
  return 0.4 + 1.6 * Math.pow(t, 1.5);
}
export const VEIN_GRADE = 2.2;
export const MAX_GRADE = 3.5;

/** Rótulo do teor. `fem` para "concentração"/"pureza"; padrão masculino ("teor"). */
export function gradeLabel(g: number, fem = false): string {
  return g < 0.7 ? (fem ? 'BAIXA' : 'BAIXO') : g < 1.3 ? (fem ? 'MÉDIA' : 'MÉDIO') : g < 1.9 ? (fem ? 'ALTA' : 'ALTO') : (fem ? 'MUITO ALTA' : 'MUITO ALTO');
}
export function gradeColor(g: number): string {
  return g < 0.7 ? '#ff8a6a' : g < 1.3 ? '#ffd04a' : g < 1.9 ? '#9cff8a' : '#6af0ff';
}
/** Faixa de porcentagem aproximada de um mineral com dado teor. */
export function pctRange(frac: number, g: number): string {
  const a = frac * g * 100 * 0.85, b = frac * g * 100 * 1.15;
  const f = (x: number) => (x < 1 ? x.toFixed(1) : Math.round(x).toString());
  return `${f(a)}–${f(b)}%`;
}

/** Mistura de teor ao somar q kg com teor g a um contêiner que já tem `have` kg. */
export type Grades = Record<string, number>;
export function gradeMix(gm: Grades, have: number, k: string, q: number, g: number | undefined) {
  if (!GRADED.has(k) || q <= 0) return;
  const cur = gm[k] ?? 1, gg = g ?? 1, t = have + q;
  gm[k] = t > 0 ? (cur * Math.max(0, have) + gg * q) / t : gg;
}
