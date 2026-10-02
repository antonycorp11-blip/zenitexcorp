// Receitas de processamento automático (máquinas) e fabricação (Oficina / Sintetizador).
export interface Recipe {
  key: string;
  in: Record<string, number>;
  out: Record<string, number>;
  time: number;            // segundos (fabricação manual) / ciclo base (máquina)
  station: 'refinaria' | 'purificador' | 'fundidor' | 'sintetizador' | 'oficina' | 'mao';
  group?: 'componentes' | 'consumiveis' | 'refino' | 'equipamento';
  research?: string;
}

const R: Recipe[] = [];
const r = (x: Recipe) => R.push(x);

export const REFINE_MAP: Record<string, string> = {
  lumenita: 'celula_lumenita', ferronox: 'placa_ferronox', pyroxis: 'pyroxis_estabilizado', verdanio: 'fibra_verdanio',
  nexolita: 'chip_nexolita', crysalis: 'gel_crysalis', solvex: 'solvex_refinado', umbrium: 'matriz_umbrium',
  ferronox_denso: 'liga_termo', necrocristal: 'cristal_memoria',
};
for (const [ore, out] of Object.entries(REFINE_MAP)) {
  if (ore === 'verdanio') continue;
  r({ key: `ref_${ore}`, in: { [ore]: 2 }, out: { [out]: 1 }, time: 1, station: 'refinaria' });
  r({ key: `refb_${ore}`, in: { ['britado_' + ore]: 1 }, out: { [out]: 1 }, time: 1, station: 'refinaria' });
  // Refino manual na Oficina: pior proporção, mais lento — o incentivo para automatizar.
  r({ key: `man_${ore}`, in: { [ore]: 3 }, out: { [out]: 1 }, time: 2.5, station: 'oficina', group: 'refino' });
}

// Purificador
r({ key: 'pur_lpura', in: { lumenita_pura: 1 }, out: { celula_lumenita: 4 }, time: 1, station: 'purificador' });
r({ key: 'pur_linst', in: { lumenita_instavel: 1 }, out: { celula_lumenita: 3 }, time: 1, station: 'purificador' });
r({ key: 'pur_pvol', in: { pyroxis_volatil: 1 }, out: { pyroxis_estabilizado: 4 }, time: 1, station: 'purificador' });
r({ key: 'pur_vviv', in: { verdanio_vivo: 1 }, out: { fibra_verdanio: 4 }, time: 1, station: 'purificador' });
r({ key: 'pur_ncond', in: { nexolita_condensada: 1 }, out: { chip_nexolita: 4 }, time: 1, station: 'purificador' });
r({ key: 'pur_fden', in: { ferronox_denso: 1 }, out: { placa_ferronox: 3 }, time: 1, station: 'purificador' });
r({ key: 'pur_necro', in: { necrocristal: 3 }, out: { cristal_memoria: 1 }, time: 1.5, station: 'purificador' });

// Fundidor alienígena — combinações complementares
r({ key: 'fun_sinaptico', in: { celula_lumenita: 1, chip_nexolita: 1 }, out: { nucleo_sinaptico: 1 }, time: 1, station: 'fundidor' });
r({ key: 'fun_termo', in: { pyroxis_estabilizado: 1, placa_ferronox: 1 }, out: { liga_termo: 1 }, time: 1, station: 'fundidor' });
r({ key: 'fun_refrig', in: { gel_crysalis: 1, fibra_verdanio: 1 }, out: { refrigerante_bio: 1 }, time: 1, station: 'fundidor' });
r({ key: 'fun_negra', in: { matriz_umbrium: 1, celula_lumenita: 2 }, out: { celula_negra: 1 }, time: 1.5, station: 'fundidor' });
r({ key: 'fun_polimero', in: { solvex_refinado: 1, placa_ferronox: 1 }, out: { polimero_solvex: 1 }, time: 1, station: 'fundidor' });
r({ key: 'fun_ancestral', in: { ferronox_denso: 2, cristal_memoria: 1 }, out: { liga_ancestral: 1 }, time: 2, station: 'fundidor', research: 'liga_ancestral' });

// Componentes (Oficina manual e Sintetizador automático usam as mesmas receitas)
const comp = (key: string, inp: Record<string, number>, out: Record<string, number>, time: number, research?: string) => {
  r({ key: `of_${key}`, in: inp, out, time, station: 'oficina', group: 'componentes', research });
  r({ key: `sy_${key}`, in: inp, out, time, station: 'sintetizador', research });
};
comp('componente', { placa_ferronox: 2 }, { componente: 1 }, 3);
r({ key: 'of_pecas', in: { placa_ferronox: 1, ferronox: 4 }, out: { pecas: 2 }, time: 3, station: 'oficina', group: 'consumiveis' });
comp('motor', { placa_ferronox: 2, celula_lumenita: 1 }, { motor: 1 }, 5);
comp('bateria', { celula_lumenita: 3 }, { bateria: 1 }, 4);
comp('broca', { placa_ferronox: 2, pyroxis_estabilizado: 1 }, { broca: 1 }, 5);
comp('sensor', { chip_nexolita: 1, celula_lumenita: 1 }, { sensor: 1 }, 5);
comp('filtro', { fibra_verdanio: 2, placa_ferronox: 1 }, { filtro: 1 }, 4);
comp('circuito', { chip_nexolita: 2, placa_ferronox: 1, solvex_refinado: 1 }, { circuito: 1 }, 8);
comp('nucleo_ia', { circuito: 4, nucleo_sinaptico: 2, cristal_memoria: 1 }, { nucleo_ia: 1 }, 20, 'ia_embarcada');

// Consumíveis (Oficina)
r({ key: 'of_explosivo', in: { pyroxis: 6, ferronox: 2 }, out: { explosivo: 2 }, time: 3, station: 'oficina', group: 'consumiveis' });
r({ key: 'of_sinalizador', in: { lumenita: 3, ferronox: 1 }, out: { sinalizador: 3 }, time: 1.5, station: 'oficina', group: 'consumiveis' });
r({ key: 'of_kit', in: { ferronox: 8, lumenita: 2 }, out: { kit_reparo: 1 }, time: 3, station: 'oficina', group: 'consumiveis' });
r({ key: 'of_kit2', in: { pecas: 2 }, out: { kit_reparo: 2 }, time: 2, station: 'oficina', group: 'consumiveis' });
r({ key: 'of_medkit', in: { verdanio: 4, lumenita: 2 }, out: { medkit: 1 }, time: 2, station: 'oficina', group: 'consumiveis' });
r({ key: 'of_plat', in: { ferronox: 6 }, out: { plataforma_kit: 1 }, time: 1.5, station: 'oficina', group: 'consumiveis' });

export const RECIPES: readonly Recipe[] = R;
export const recipesFor = (station: Recipe['station']) => R.filter(x => x.station === station);
export const RECIPE: Record<string, Recipe> = Object.fromEntries(R.map(x => [x.key, x]));
