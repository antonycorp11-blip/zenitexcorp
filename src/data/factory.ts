/**
 * ÁRVORE DE MELHORIAS: cada "trilha" (key) tem vários níveis; alguns níveis exigem nível de outra trilha (ligações da árvore).
 * Valores crescem MUITO: limpar uma camada inteira (milhares de toneladas) exige o topo da árvore.
 */
export interface FabUp { key: string; branch: string; name: string; unit: string; vals: number[]; costs: Record<string, number>[]; desc: string; req?: Record<number, [string, number][]>; }

/** recuperação mínima de cada minério (minério extraído ÷ minério que existia na terra processada) para liberar a descida */
export const RECOVERY_GOAL = 0.8;

const cost = (fe: number, lu: number, n: number, g = 3): Record<string, number>[] => Array.from({ length: n }, (_, i) => {
  const k = Math.pow(g, i), c: Record<string, number> = { ferronox: Math.round(fe * k / 10) * 10, lumenita: Math.round(lu * k / 10) * 10 };
  if (i >= 3) c.lumenita_pura = 4 * (i - 2) * (i - 2);
  return c;
});

export const FAB_BRANCHES = [
  { key: 'laser', name: 'LASER', color: '#ff8a4a' },
  { key: 'soprador', name: 'SOPRADOR', color: '#b088ff' },
  { key: 'logistica', name: 'LOGÍSTICA', color: '#6ad0ff' },
  { key: 'fabrica', name: 'FÁBRICA', color: '#7aff8a' },
];

export const FAB_UPS: FabUp[] = [
  { key: 'laser', branch: 'laser', name: 'Alcance do Laser', unit: '×', vals: [1, 1.5, 2, 2.75, 3.5, 4.5, 6], desc: 'Até onde o feixe alcança.', costs: cost(30, 10, 6) },
  { key: 'laserRaio', branch: 'laser', name: 'Área do Feixe', unit: '×', vals: [1, 1.4, 1.9, 2.5, 3.2, 4], desc: 'Largura do feixe: quanta terra solta cada disparo.', costs: cost(50, 20, 5), req: { 1: [['laser', 1]], 3: [['laser', 3]] } },
  { key: 'laserForca', branch: 'laser', name: 'Potência do Laser', unit: '×', vals: [1, 1.6, 2.5, 4, 6, 9, 14], desc: 'Velocidade com que o feixe desfaz a rocha.', costs: cost(60, 25, 6), req: { 1: [['laserRaio', 1]], 4: [['laserRaio', 3]] } },
  { key: 'alcance', branch: 'soprador', name: 'Alcance do Soprador', unit: 'tiles', vals: [7, 10, 14, 20, 28, 38, 50], desc: 'Raio em que cada soprador aspira as pilhas.', costs: cost(40, 15, 6), req: { 3: [['laser', 2]] } },
  { key: 'vazao', branch: 'soprador', name: 'Vazão do Soprador', unit: 'kg/min', vals: [900, 2000, 4500, 9000, 18000, 36000, 72000], desc: 'Quanto cada soprador aspira por minuto.', costs: cost(60, 15, 6), req: { 2: [['pressao', 1]], 4: [['pressao', 2], ['esteira', 2]] } },
  { key: 'pressao', branch: 'logistica', name: 'Velocidade dos Tubos', unit: '×', vals: [1, 2, 3.5, 6, 10, 16], desc: 'Quantos grãos por segundo cada tubo leva.', costs: cost(50, 20, 5) },
  { key: 'esteira', branch: 'logistica', name: 'Velocidade das Esteiras', unit: '×', vals: [1, 1.5, 2, 2.75, 3.5], desc: 'Esteiras mais rápidas levam mais terra (cuidado: os extratores têm que dar conta).', costs: cost(40, 15, 4), req: { 1: [['pressao', 1]] } },
  { key: 'extrator', branch: 'fabrica', name: 'Eficiência dos Extratores', unit: '%', vals: [62, 70, 78, 86, 92, 96], desc: 'Quanto do minério da terra que passa embaixo cada Ímã/Ressonador puxa numa passada.', costs: cost(80, 30, 5), req: { 2: [['esteira', 1]], 4: [['incinerador', 2]] } },
  { key: 'incinerador', branch: 'fabrica', name: 'Vazão do Incinerador', unit: '×', vals: [1, 2, 4, 8, 16, 32], desc: 'Quanta terra cada Incinerador queima por minuto.', costs: cost(50, 20, 5), req: { 2: [['vazao', 2]] } },
];

/** o que falta para comprar o próximo nível desta trilha (ou null se liberado) */
export function fabLocked(flags: Record<string, any>, u: FabUp): string | null {
  const next = fabLevel(flags, u.key) + 1;
  for (const [k, lv] of u.req?.[next] ?? []) if (fabLevel(flags, k) < lv) { const o = FAB_UPS.find(x => x.key === k); return `Requer ${o?.name ?? k} nível ${lv}`; }
  return null;
}

/** Minerais que só podem pagar melhorias se estiverem guardados num silo. */
export const SILO_KEYS = new Set(['ferronox', 'lumenita', 'nexolita', 'pyroxis', 'ferronox_denso', 'crysalis', 'umbrium', 'necrocristal', 'solvex',
  'lumenita_pura', 'nexolita_condensada', 'pyroxis_volatil', 'lumenita_instavel', 'fragmento_nucleo']);

export function fabLevel(flags: Record<string, any>, key: string): number { return flags.fab?.[key] ?? 0; }
export function fabVal(flags: Record<string, any>, key: string): number { const u = FAB_UPS.find(x => x.key === key); if (!u) return key === 'silo' ? 150 : 1; return u.vals[Math.min(u.vals.length - 1, fabLevel(flags, key))]; }
