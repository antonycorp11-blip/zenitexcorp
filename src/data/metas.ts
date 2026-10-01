/**
 * Metas curtas de cada camada: 3 por camada, em sequência, cada uma com recompensa.
 * Elas guiam o jogador; a descida acontece quando a barra da camada chega a 100%.
 */
export type MetaDef =
  | { kind: 'build'; text: string; key: string; count: number }          // construir N de uma máquina
  | { kind: 'behavior'; text: string; behavior: string; count: number } // N máquinas de um tipo
  | { kind: 'deliver'; text: string; kg: number }                       // kg entregues na base nesta camada
  | { kind: 'drill'; text: string; level: number }                      // perfurador portátil P-0N
  | { kind: 'layer'; text: string; frac: number };                      // fração da camada esgotada

export const METAS: Record<number, MetaDef[]> = {
  1: [
    { kind: 'behavior', text: 'Instale 3 perfuradoras encostadas na rocha', behavior: 'drill', count: 3 },
    { kind: 'deliver', text: 'Leve 500 kg de minério à base (esteira até o armazém)', kg: 500 },
    { kind: 'drill', text: 'Melhore o perfurador para P-02 (a Pedra exige)', level: 2 },
  ],
  2: [
    { kind: 'behavior', text: 'Construa uma estação de drone', behavior: 'dronepad', count: 1 },
    { kind: 'deliver', text: 'Leve 3.000 kg de minério à base', kg: 3000 },
    { kind: 'drill', text: 'Melhore o perfurador para P-03 (o Basalto exige)', level: 3 },
  ],
  3: [
    { kind: 'build', text: 'Instale 2 Perfuradoras Mk II (o basalto é duro)', key: 'perfuradora2', count: 2 },
    { kind: 'build', text: 'Instale 2 Refrigeradores contra o calor', key: 'refrigerador', count: 2 },
    { kind: 'drill', text: 'Melhore o perfurador para P-04 (o Cristal exige)', level: 4 },
  ],
  4: [
    { kind: 'build', text: 'Construa um Complexo de Extração', key: 'complexo', count: 1 },
    { kind: 'build', text: 'Instale 2 Aquecedores contra o frio', key: 'aquecedor', count: 2 },
    { kind: 'drill', text: 'Melhore o perfurador para P-05 (o Manto exige)', level: 5 },
  ],
  5: [
    { kind: 'build', text: 'Instale 2 Estabilizadores Gravitacionais', key: 'estabilizador', count: 2 },
    { kind: 'build', text: 'Instale 2 Perfuradoras Mk III', key: 'perfuradora3', count: 2 },
    { kind: 'deliver', text: 'Leve 40.000 kg de minério à base', kg: 40000 },
  ],
  6: [
    { kind: 'behavior', text: 'Tenha 2 Complexos de Extração', behavior: 'complex', count: 2 },
    { kind: 'build', text: 'Instale um Escudo de Radiação', key: 'escudo_rad', count: 1 },
    { kind: 'drill', text: 'Melhore o perfurador para P-06 (o Núcleo exige)', level: 6 },
  ],
  7: [
    { kind: 'build', text: 'Instale 2 Refrigeradores no Núcleo', key: 'refrigerador', count: 2 },
    { kind: 'layer', text: 'Esgote 50% do Núcleo', frac: 0.5 },
    { kind: 'build', text: 'Construa o Cortador Planetário', key: 'cortador_planetario', count: 1 },
  ],
};
