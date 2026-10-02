/**
 * Metas curtas de cada camada: 3 por camada, em sequência, cada uma com recompensa.
 * Elas guiam o jogador; a descida acontece quando a barra da camada chega a 100%.
 */
export type MetaDef =
  | { kind: 'build'; text: string; key: string; count: number }          // construir N de uma máquina
  | { kind: 'behavior'; text: string; behavior: string; count: number } // N máquinas de um tipo
  | { kind: 'deliver'; text: string; kg: number }                       // kg entregues na base nesta camada
  | { kind: 'counter'; text: string; key: string; max: number }         // contador da camada (analyzed, exported, separated…)
  | { kind: 'drill'; text: string; level: number }                      // perfurador portátil P-0N
  | { kind: 'layer'; text: string; frac: number }                      // fração da camada removida
  | { kind: 'silo'; text: string; key: string; kg: number };            // kg de um mineral guardados em silos                      // fração da camada removida

/**
 * A Camada 1 ensina a cadeia inteira, uma peça por vez:
 * cavar com o laser → processar à mão → sopradores nas pilhas → tubo até a fábrica → peneira → prensa → exportar.
 * As camadas de baixo apresentam o processamento específico de cada material.
 */
export const METAS: Record<number, MetaDef[]> = {
  1: [
    { kind: 'counter', text: 'Processe 60 kg de Solo K-37 no Analisador de Matriz', key: 'analyzed', max: 60 },
    { kind: 'behavior', text: 'Tenha 2 Sopradores trabalhando (cave perto deles)', behavior: 'blower', count: 2 },
    { kind: 'silo', text: 'Guarde 100 kg de Ferronox num Silo', key: 'ferronox', kg: 100 },
    { kind: 'silo', text: 'Guarde 60 kg de Lumenita num Silo (Ressonador)', key: 'lumenita', kg: 60 },
    { kind: 'counter', text: 'Exporte 2.000 kg de resíduo em blocos (Terminal Orbital)', key: 'exported', max: 2000 },
    { kind: 'drill', text: 'Melhore o perfurador para P-02 (a Pedra exige)', level: 2 },
  ],
  2: [
    { kind: 'build', text: 'Empilhe um Britador em cima de uma Peneira (a rocha precisa ser quebrada)', key: 'triturador', count: 1 },
    { kind: 'silo', text: 'Guarde 150 kg de Nexolita em silos (Ressonador)', key: 'nexolita', kg: 150 },
    { kind: 'counter', text: 'Separe 1.500 kg de minerais', key: 'separated', max: 1500 },
    { kind: 'counter', text: 'Exporte 10.000 kg de resíduo em blocos', key: 'exported', max: 10000 },
    { kind: 'drill', text: 'Melhore o perfurador para P-03 (o Basalto exige)', level: 3 },
  ],
  3: [
    { kind: 'build', text: 'Construa um Britador Pesado (basalto)', key: 'triturador_pesado', count: 1 },
    { kind: 'build', text: 'Instale 2 Refrigeradores contra o calor', key: 'refrigerador', count: 2 },
    { kind: 'behavior', text: 'Tenha 4 Sopradores em frentes diferentes', behavior: 'blower', count: 4 },
    { kind: 'counter', text: 'Separe 4.000 kg de minerais', key: 'separated', max: 4000 },
    { kind: 'drill', text: 'Melhore o perfurador para P-04 (o Cristal exige)', level: 4 },
  ],
  4: [
    { kind: 'build', text: 'Construa um Fragmentador Controlado (salva os raros)', key: 'fragmentador', count: 1 },
    { kind: 'build', text: 'Instale 2 Aquecedores contra o frio', key: 'aquecedor', count: 2 },
    { kind: 'drill', text: 'Melhore o perfurador para P-05 (o Manto exige)', level: 5 },
  ],
  5: [
    { kind: 'build', text: 'Construa um Descompressor de Manto', key: 'descompressor', count: 1 },
    { kind: 'build', text: 'Instale 2 Estabilizadores Gravitacionais', key: 'estabilizador', count: 2 },
    { kind: 'behavior', text: 'Tenha 8 Sopradores trabalhando', behavior: 'blower', count: 8 },
    { kind: 'counter', text: 'Exporte 80.000 kg de resíduo em blocos', key: 'exported', max: 80000 },
  ],
  6: [
    { kind: 'behavior', text: 'Tenha 10 Sopradores trabalhando', behavior: 'blower', count: 10 },
    { kind: 'build', text: 'Instale um Escudo de Radiação', key: 'escudo_rad', count: 1 },
    { kind: 'drill', text: 'Melhore o perfurador para P-06 (o Núcleo exige)', level: 6 },
  ],
  7: [
    { kind: 'build', text: 'Construa 2 Desintegradores de Matéria', key: 'desintegrador', count: 2 },
    { kind: 'layer', text: 'Remova 50% do Núcleo', frac: 0.5 },
    { kind: 'build', text: 'Construa o Cortador Planetário', key: 'cortador_planetario', count: 1 },
  ],
};
