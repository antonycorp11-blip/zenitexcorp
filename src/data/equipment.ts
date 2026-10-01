import type { HazardKey } from './sectors';

// "Melhorias": equipamento pessoal do minerador.
export interface DrillLevel { name: string; tier: number; power: number; radius: number; range: number; energy: number; cost: Record<string, number>; research?: string; }
export const DRILLS: DrillLevel[] = [
  { name: 'Perfurador Portátil Zenitex P-01', tier: 1, power: 1, radius: 1.7, range: 46, energy: 3, cost: {} },
  { name: 'Perfurador P-02 "Persistência"', tier: 2, power: 1.7, radius: 2.0, range: 54, energy: 3.5, cost: { ferronox: 120, lumenita: 60 } },
  { name: 'Perfurador P-03 "Proatividade"', tier: 3, power: 2.6, radius: 2.3, range: 62, energy: 4, cost: { placa_ferronox: 40, celula_lumenita: 20, pyroxis_estabilizado: 10 }, research: 'refino' },
  { name: 'Perfurador P-04 "Sinergia"', tier: 4, power: 3.8, radius: 2.6, range: 70, energy: 4.5, cost: { liga_termo: 12, chip_nexolita: 10, motor: 4 }, research: 'fundidor' },
  { name: 'Perfurador P-05 "Resiliência"', tier: 5, power: 5.4, radius: 3.0, range: 78, energy: 5, cost: { liga_termo: 30, circuito: 6, refrigerante_bio: 8 }, research: 'perfuradora3' },
  { name: 'Perfurador P-06 "Disrupção"', tier: 6, power: 8, radius: 3.4, range: 90, energy: 6, cost: { liga_ancestral: 6, celula_negra: 4, nucleo_sinaptico: 10 }, research: 'liga_ancestral' },
];

export interface ScannerLevel { name: string; radius: number; desc: string; cost: Record<string, number>; research?: string; }
export const SCANNERS: ScannerLevel[] = [
  { name: 'Scanner Básico', radius: 14, desc: 'Detecta material próximo.', cost: {} },
  { name: 'Scanner de Densidade', radius: 22, desc: 'Indica densidade e quantidade estimada dos depósitos.', cost: { celula_lumenita: 8, placa_ferronox: 8 }, research: 'refino' },
  { name: 'Scanner de Composição', radius: 32, desc: 'Mostra a composição provável, inclusive variantes raras e artefatos.', cost: { sensor: 2, chip_nexolita: 6 } },
  { name: 'Scanner Orbital', radius: 44, desc: 'Marca no mapa as regiões promissoras de toda a camada.', cost: { sensor: 6, circuito: 2, nucleo_sinaptico: 2 }, research: 'logistica_orbital' },
];

export interface PackLevel { name: string; weight: number; contencao: number; frio: number; magnetico: number; cost: Record<string, number>; }
export const PACKS: PackLevel[] = [
  { name: 'Mochila Padrão', weight: 120, contencao: 0, frio: 0, magnetico: 0, cost: {} },
  { name: 'Mochila Reforçada', weight: 250, contencao: 1, frio: 1, magnetico: 0, cost: { ferronox: 100, verdanio: 30 } },
  { name: 'Mochila Industrial', weight: 500, contencao: 2, frio: 2, magnetico: 1, cost: { placa_ferronox: 30, fibra_verdanio: 10, gel_crysalis: 4 } },
  { name: 'Mochila de Campo Magnético', weight: 1000, contencao: 3, frio: 3, magnetico: 3, cost: { polimero_solvex: 12, matriz_umbrium: 4, motor: 2 } },
  { name: 'Mochila Dimensional "Contrato Vitalício"', weight: 2500, contencao: 6, frio: 6, magnetico: 6, cost: { liga_ancestral: 4, celula_negra: 2 } },
];
export const SPECIAL_SLOT_KG = 60; // kg por slot especial

export interface SuitModule { key: string; name: string; hazards: HazardKey[]; levels: { prot: number; cost: Record<string, number>; research?: string }[]; desc: string; }
export const SUIT_MODULES: SuitModule[] = [
  { key: 'termico', name: 'Módulo Térmico', hazards: ['calor'], desc: 'Proteção contra calor extremo.', levels: [
    { prot: 45, cost: { crysalis: 20, placa_ferronox: 10 } }, { prot: 75, cost: { gel_crysalis: 10, liga_termo: 4 }, research: 'fundidor' }, { prot: 100, cost: { refrigerante_bio: 10, liga_termo: 10 }, research: 'reator_hibrido' }] },
  { key: 'crio', name: 'Módulo Criogênico', hazards: ['frio'], desc: 'Aquecimento interno do traje.', levels: [
    { prot: 45, cost: { pyroxis: 30, placa_ferronox: 10 } }, { prot: 75, cost: { pyroxis_estabilizado: 10, fibra_verdanio: 6 } }, { prot: 100, cost: { liga_termo: 8 }, research: 'fundidor' }] },
  { key: 'filtro', name: 'Máscara e Filtro', hazards: ['toxico', 'corrosao'], desc: 'Filtra toxinas e protege contra corrosão.', levels: [
    { prot: 40, cost: { verdanio: 30, ferronox: 20 } }, { prot: 75, cost: { filtro: 3, polimero_solvex: 2 }, research: 'fundidor' }, { prot: 100, cost: { refrigerante_bio: 6, polimero_solvex: 6 }, research: 'fundidor' }] },
  { key: 'blindagem', name: 'Blindagem de Radiação', hazards: ['radiacao'], desc: 'Camada absorvente de Umbrium.', levels: [
    { prot: 50, cost: { umbrium: 20, placa_ferronox: 10 } }, { prot: 80, cost: { matriz_umbrium: 4 } }, { prot: 100, cost: { celula_negra: 2 } }] },
  { key: 'gravidade', name: 'Âncora Gravitacional', hazards: ['gravidade'], desc: 'Compensa deriva gravitacional.', levels: [
    { prot: 50, cost: { nexolita: 40, celula_lumenita: 6 } }, { prot: 80, cost: { chip_nexolita: 8, motor: 2 } }, { prot: 100, cost: { nucleo_sinaptico: 4 } }] },
  { key: 'pressao', name: 'Casco de Pressão', hazards: ['pressao'], desc: 'Estrutura para alta pressão.', levels: [
    { prot: 50, cost: { ferronox_denso: 30, placa_ferronox: 10 } }, { prot: 80, cost: { liga_termo: 6 }, research: 'fundidor' }, { prot: 100, cost: { liga_ancestral: 2 } }] },
  { key: 'sintonia', name: 'Sintonizador Khel', hazards: ['anomalia'], desc: 'Reconstruído a partir de registros de Khelos. Sera jura que é seguro.', levels: [
    { prot: 40, cost: { artefato: 3, chip_nexolita: 4 } }, { prot: 75, cost: { cristal_memoria: 4, artefato: 4 } }, { prot: 100, cost: { cristal_memoria: 12, liga_ancestral: 2 } }] },
];

export const ENERGY_LEVELS = [
  { max: 100, cost: {} as Record<string, number> },
  { max: 160, cost: { celula_lumenita: 10 } },
  { max: 260, cost: { bateria: 6 } },
  { max: 400, cost: { nucleo_sinaptico: 3 } },
];
export const HEALTH_LEVELS = [
  { max: 100, cost: {} as Record<string, number> },
  { max: 140, cost: { placa_ferronox: 20, verdanio: 20 } },
  { max: 200, cost: { polimero_solvex: 6, fibra_verdanio: 10 } },
  { max: 300, cost: { liga_termo: 8, refrigerante_bio: 4 } },
];
