/** Melhorias da fábrica (pagas com os SILOS). Cada uma tem 4 níveis: valor atual → próximos. */
export interface FabUp { key: string; name: string; unit: string; vals: number[]; costs: Record<string, number>[]; desc: string; }

export const FAB_UPS: FabUp[] = [
  { key: 'laser', name: 'Laser · Alcance', unit: '×', vals: [1, 1.35, 1.7, 2.1], desc: 'Até onde o feixe do laser alcança (a força do laser fica na aba Laser).',
    costs: [{ ferronox: 30, lumenita: 10 }, { ferronox: 100, lumenita: 40 }, { ferronox: 260, lumenita: 100, lumenita_pura: 5 }] },
  { key: 'alcance', name: 'Soprador · Alcance', unit: 'tiles', vals: [7, 9, 11, 14], desc: 'Raio em que cada soprador aspira as pilhas.',
    costs: [{ ferronox: 40, lumenita: 15 }, { ferronox: 120, lumenita: 50 }, { ferronox: 300, lumenita: 120, lumenita_pura: 6 }] },
  { key: 'vazao', name: 'Soprador · Vazão', unit: 'kg/min', vals: [900, 1400, 2100, 3000], desc: 'Quanto cada soprador aspira por minuto.',
    costs: [{ ferronox: 60, lumenita: 10 }, { ferronox: 160, lumenita: 40 }, { ferronox: 360, lumenita: 100, lumenita_pura: 6 }] },
  { key: 'pressao', name: 'Tubo · Velocidade', unit: '×', vals: [1, 1.35, 1.7, 2.1], desc: 'Acelera a passagem dos grãos pelos tubos, sem limite de distância.',
    costs: [{ ferronox: 50, lumenita: 20 }, { ferronox: 140, lumenita: 60 }, { ferronox: 320, lumenita: 140, lumenita_pura: 8 }] },
];

/** Minerais que só podem pagar melhorias se estiverem guardados num silo. */
export const SILO_KEYS = new Set(['ferronox', 'lumenita', 'nexolita', 'pyroxis', 'ferronox_denso', 'crysalis', 'umbrium', 'necrocristal', 'solvex',
  'lumenita_pura', 'nexolita_condensada', 'pyroxis_volatil', 'lumenita_instavel', 'fragmento_nucleo']);

export function fabLevel(flags: Record<string, any>, key: string): number { return flags.fab?.[key] ?? 0; }
export function fabVal(flags: Record<string, any>, key: string): number { const u = FAB_UPS.find(x => x.key === key); if (!u) return key === 'silo' ? 150 : 1; return u.vals[Math.min(u.vals.length - 1, fabLevel(flags, key))]; }
