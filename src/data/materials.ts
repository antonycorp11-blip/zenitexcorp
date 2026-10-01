// Materiais de terreno. Cada célula do mundo guarda um id daqui.
// kind: solid = pode ser minerado; liquid/chasm = bloqueia caminhada mas não é parede.
export type MatKind = 'air' | 'rock' | 'ore' | 'liquid' | 'chasm' | 'ancient' | 'barrier' | 'edge';
export type Pattern = 'cobble' | 'crystal' | 'organic' | 'basalt' | 'ice' | 'slime' | 'block' | 'bone' | 'dense' | 'core';
export type MatSound = 'rock' | 'crystal' | 'metal' | 'organic' | 'ice' | 'glass' | 'ancient';

export interface MaterialDef {
  id: number;
  key: string;
  name: string;
  kind: MatKind;
  tier: number;          // nível mínimo de ferramenta
  hardness: number;      // "segundos de dano" a potência 1
  massT: number;         // toneladas por célula
  top: [number, number, number];
  face: [number, number, number];
  pattern: Pattern;
  sound: MatSound;
  item?: string;         // item gerado ao minerar
  yieldKg?: number;      // kg de item por célula
  glow?: [number, number, number];
  rare?: boolean;        // robôs não conseguem extrair: exige precisão manual
  regrow?: boolean;      // necrocristais
  hazard?: number;       // dano por segundo ao pisar (líquidos)
}

const M: MaterialDef[] = [];
let nextId = 0;
function def(d: Omit<MaterialDef, 'id'>): number { const id = nextId++; M.push({ ...d, id }); return id; }

export const MAT = {
  AIR: def({ key: 'air', name: 'Vazio', kind: 'air', tier: 0, hardness: 0, massT: 0, top: [0, 0, 0], face: [0, 0, 0], pattern: 'cobble', sound: 'rock' }),
  EDGE: def({ key: 'edge', name: 'Manto Inviolável', kind: 'edge', tier: 99, hardness: 1e9, massT: 0, top: [22, 18, 20], face: [12, 10, 12], pattern: 'dense', sound: 'metal' }),
  // Rochas setoriais (1..12)
  R1: def({ key: 'regolito', name: 'Regolito de Khelos', kind: 'rock', tier: 1, hardness: 0.35, massT: 0.018, top: [96, 58, 48], face: [50, 28, 26], pattern: 'cobble', sound: 'rock' }),
  R2: def({ key: 'xisto', name: 'Xisto Radicular', kind: 'rock', tier: 1, hardness: 0.45, massT: 0.02, top: [58, 66, 46], face: [28, 34, 22], pattern: 'organic', sound: 'organic' }),
  R3: def({ key: 'basalto', name: 'Basalto Ígneo', kind: 'rock', tier: 2, hardness: 0.6, massT: 0.026, top: [70, 30, 36], face: [34, 14, 20], pattern: 'basalt', sound: 'rock' }),
  R4: def({ key: 'glacial', name: 'Quartzo Glacial', kind: 'rock', tier: 2, hardness: 0.6, massT: 0.024, top: [62, 80, 116], face: [28, 38, 64], pattern: 'ice', sound: 'ice' }),
  R5: def({ key: 'lodo', name: 'Lodo Nexolítico', kind: 'rock', tier: 3, hardness: 0.55, massT: 0.022, top: [54, 50, 32], face: [26, 24, 14], pattern: 'slime', sound: 'organic' }),
  R6: def({ key: 'varka', name: 'Pedra de Var-Ka', kind: 'rock', tier: 3, hardness: 0.7, massT: 0.028, top: [56, 62, 70], face: [26, 30, 38], pattern: 'cobble', sound: 'rock' }),
  R7: def({ key: 'abissal', name: 'Arenito Abissal', kind: 'rock', tier: 3, hardness: 0.7, massT: 0.026, top: [44, 62, 72], face: [18, 30, 38], pattern: 'cobble', sound: 'rock' }),
  R8: def({ key: 'gravitita', name: 'Gravitita', kind: 'rock', tier: 4, hardness: 0.8, massT: 0.03, top: [70, 54, 92], face: [34, 24, 50], pattern: 'basalt', sound: 'glass' }),
  R9: def({ key: 'ossario', name: 'Ossário Mineral', kind: 'rock', tier: 4, hardness: 0.85, massT: 0.03, top: [78, 74, 74], face: [38, 36, 38], pattern: 'bone', sound: 'glass' }),
  R10: def({ key: 'densa', name: 'Rocha Hiperdensa', kind: 'rock', tier: 5, hardness: 1.1, massT: 0.05, top: [50, 38, 42], face: [22, 14, 18], pattern: 'dense', sound: 'metal' }),
  R11: def({ key: 'marmore', name: 'Mármore Profundo', kind: 'rock', tier: 5, hardness: 1.0, massT: 0.04, top: [42, 70, 78], face: [16, 32, 40], pattern: 'block', sound: 'ancient' }),
  R12: def({ key: 'nuclear', name: 'Matéria Nuclear', kind: 'rock', tier: 6, hardness: 1.4, massT: 0.08, top: [110, 52, 26], face: [56, 22, 12], pattern: 'core', sound: 'metal', glow: [255, 110, 40] }),
  // Raízes orgânicas (Bosque Verdânio)
  ROOT: def({ key: 'raiz', name: 'Raiz Mineral', kind: 'rock', tier: 1, hardness: 0.5, massT: 0.016, top: [92, 70, 44], face: [52, 36, 22], pattern: 'organic', sound: 'organic' }),
  RUBBLE: def({ key: 'entulho', name: 'Entulho', kind: 'rock', tier: 1, hardness: 0.15, massT: 0.012, top: [96, 82, 70], face: [56, 46, 40], pattern: 'cobble', sound: 'rock' }),
  // Minérios
  LUMENITA: def({ key: 'lumenita', name: 'Lumenita', kind: 'ore', tier: 1, hardness: 0.55, massT: 0.012, top: [60, 130, 255], face: [24, 56, 150], pattern: 'crystal', sound: 'crystal', item: 'lumenita', yieldKg: 6, glow: [70, 150, 255] }),
  FERRONOX: def({ key: 'ferronox', name: 'Ferronox', kind: 'ore', tier: 1, hardness: 0.7, massT: 0.02, top: [120, 120, 140], face: [46, 46, 58], pattern: 'crystal', sound: 'metal', item: 'ferronox', yieldKg: 7 }),
  PYROXIS: def({ key: 'pyroxis', name: 'Pyroxis', kind: 'ore', tier: 2, hardness: 0.65, massT: 0.014, top: [255, 70, 40], face: [150, 24, 16], pattern: 'crystal', sound: 'crystal', item: 'pyroxis', yieldKg: 5, glow: [255, 80, 30] }),
  VERDANIO: def({ key: 'verdanio', name: 'Verdânio', kind: 'ore', tier: 1, hardness: 0.5, massT: 0.011, top: [60, 220, 90], face: [20, 110, 40], pattern: 'crystal', sound: 'organic', item: 'verdanio', yieldKg: 5, glow: [70, 255, 110] }),
  NEXOLITA: def({ key: 'nexolita', name: 'Nexolita', kind: 'ore', tier: 2, hardness: 0.7, massT: 0.012, top: [170, 70, 255], face: [80, 24, 150], pattern: 'crystal', sound: 'crystal', item: 'nexolita', yieldKg: 4, glow: [170, 80, 255] }),
  CRYSALIS: def({ key: 'crysalis', name: 'Crysalis', kind: 'ore', tier: 2, hardness: 0.75, massT: 0.013, top: [150, 230, 255], face: [60, 130, 170], pattern: 'crystal', sound: 'ice', item: 'crysalis', yieldKg: 4, glow: [140, 230, 255] }),
  SOLVEX: def({ key: 'solvex', name: 'Solvex', kind: 'ore', tier: 3, hardness: 0.6, massT: 0.012, top: [255, 210, 60], face: [150, 110, 20], pattern: 'crystal', sound: 'glass', item: 'solvex', yieldKg: 4, glow: [255, 200, 60] }),
  UMBRIUM: def({ key: 'umbrium', name: 'Umbrium', kind: 'ore', tier: 4, hardness: 1.0, massT: 0.03, top: [40, 26, 56], face: [14, 8, 22], pattern: 'crystal', sound: 'metal', item: 'umbrium', yieldKg: 3, glow: [120, 60, 200] }),
  // Variantes raras — exigem extração manual
  LUMENITA_PURA: def({ key: 'lumenita_pura', name: 'Lumenita Pura', kind: 'ore', tier: 2, hardness: 0.9, massT: 0.01, top: [180, 220, 255], face: [70, 120, 220], pattern: 'crystal', sound: 'crystal', item: 'lumenita_pura', yieldKg: 3, glow: [160, 210, 255], rare: true }),
  LUMENITA_INSTAVEL: def({ key: 'lumenita_instavel', name: 'Lumenita Instável', kind: 'ore', tier: 2, hardness: 0.6, massT: 0.012, top: [90, 255, 255], face: [20, 140, 170], pattern: 'crystal', sound: 'crystal', item: 'lumenita_instavel', yieldKg: 3, glow: [80, 255, 255], rare: true }),
  FERRONOX_DENSO: def({ key: 'ferronox_denso', name: 'Ferronox Denso', kind: 'ore', tier: 3, hardness: 1.2, massT: 0.04, top: [84, 84, 100], face: [30, 30, 40], pattern: 'crystal', sound: 'metal', item: 'ferronox_denso', yieldKg: 6 }),
  PYROXIS_VOLATIL: def({ key: 'pyroxis_volatil', name: 'Pyroxis Volátil', kind: 'ore', tier: 3, hardness: 0.6, massT: 0.012, top: [255, 150, 40], face: [170, 60, 10], pattern: 'crystal', sound: 'crystal', item: 'pyroxis_volatil', yieldKg: 3, glow: [255, 150, 40], rare: true }),
  VERDANIO_VIVO: def({ key: 'verdanio_vivo', name: 'Verdânio Vivo', kind: 'ore', tier: 3, hardness: 0.6, massT: 0.011, top: [150, 255, 120], face: [50, 160, 50], pattern: 'crystal', sound: 'organic', item: 'verdanio_vivo', yieldKg: 3, glow: [150, 255, 120], rare: true }),
  NEXOLITA_CONDENSADA: def({ key: 'nexolita_condensada', name: 'Nexolita Condensada', kind: 'ore', tier: 4, hardness: 1.0, massT: 0.016, top: [230, 120, 255], face: [110, 40, 160], pattern: 'crystal', sound: 'crystal', item: 'nexolita_condensada', yieldKg: 3, glow: [230, 130, 255], rare: true }),
  NECROCRISTAL: def({ key: 'necrocristal', name: 'Necrocristal', kind: 'ore', tier: 4, hardness: 0.9, massT: 0.02, top: [210, 220, 200], face: [90, 110, 96], pattern: 'crystal', sound: 'glass', item: 'necrocristal', yieldKg: 4, glow: [190, 255, 220], regrow: true }),
  NUCLEO: def({ key: 'fragmento_nucleo', name: 'Fragmento de Núcleo', kind: 'ore', tier: 6, hardness: 1.6, massT: 0.12, top: [255, 200, 120], face: [200, 90, 30], pattern: 'crystal', sound: 'metal', item: 'fragmento_nucleo', yieldKg: 2, glow: [255, 190, 90], rare: true }),
  // Líquidos e abismos
  LAVA: def({ key: 'lava', name: 'Magma', kind: 'liquid', tier: 99, hardness: 0, massT: 0, top: [255, 96, 20], face: [200, 40, 10], pattern: 'slime', sound: 'rock', glow: [255, 90, 20], hazard: 45 }),
  WATER: def({ key: 'agua', name: 'Água Subterrânea', kind: 'liquid', tier: 99, hardness: 0, massT: 0, top: [20, 90, 130], face: [10, 50, 80], pattern: 'slime', sound: 'rock', glow: [40, 160, 220], hazard: 0 }),
  ACID: def({ key: 'acido', name: 'Lagoa Corrosiva', kind: 'liquid', tier: 99, hardness: 0, massT: 0, top: [130, 230, 30], face: [60, 140, 10], pattern: 'slime', sound: 'rock', glow: [140, 255, 40], hazard: 18 }),
  CHASM: def({ key: 'abismo', name: 'Abismo', kind: 'chasm', tier: 99, hardness: 0, massT: 0, top: [4, 8, 16], face: [2, 4, 8], pattern: 'dense', sound: 'rock', hazard: 0 }),
  // Pedra ancestral (ruínas) e barreiras de contenção entre setores
  ANCIENT: def({ key: 'ancestral', name: 'Pedra Ancestral', kind: 'ancient', tier: 4, hardness: 2.0, massT: 0.04, top: [52, 70, 76], face: [22, 34, 40], pattern: 'block', sound: 'ancient', glow: [60, 220, 230] }),
  CONT2: def({ key: 'contencao2', name: 'Contenção Classe II', kind: 'barrier', tier: 2, hardness: 1.6, massT: 0.05, top: [60, 56, 62], face: [26, 24, 30], pattern: 'dense', sound: 'metal' }),
  CONT3: def({ key: 'contencao3', name: 'Contenção Classe III', kind: 'barrier', tier: 3, hardness: 2.0, massT: 0.06, top: [54, 50, 66], face: [24, 22, 34], pattern: 'dense', sound: 'metal' }),
  CONT4: def({ key: 'contencao4', name: 'Contenção Classe IV', kind: 'barrier', tier: 4, hardness: 2.4, massT: 0.07, top: [50, 44, 70], face: [22, 18, 36], pattern: 'dense', sound: 'metal' }),
  CONT5: def({ key: 'contencao5', name: 'Contenção Classe V', kind: 'barrier', tier: 5, hardness: 2.8, massT: 0.08, top: [64, 36, 40], face: [30, 14, 18], pattern: 'dense', sound: 'metal' }),
  CONT6: def({ key: 'contencao6', name: 'Contenção Classe VI', kind: 'barrier', tier: 6, hardness: 3.2, massT: 0.1, top: [80, 40, 24], face: [40, 16, 10], pattern: 'dense', sound: 'metal', glow: [255, 90, 30] }),
};

export const MATERIALS: readonly MaterialDef[] = M;
export const matById = (id: number) => M[id];
export const SECTOR_ROCK = [MAT.R1, MAT.R2, MAT.R3, MAT.R4, MAT.R5, MAT.R6, MAT.R7, MAT.R8, MAT.R9, MAT.R10, MAT.R11, MAT.R12];
export const BARRIER_BY_TIER: Record<number, number> = { 2: MAT.CONT2, 3: MAT.CONT3, 4: MAT.CONT4, 5: MAT.CONT5, 6: MAT.CONT6 };

// Lookups rápidos por id (usados no laço quente de renderização / colisão)
export const IS_SOLID = new Uint8Array(256);
export const IS_BLOCKING = new Uint8Array(256); // bloqueia caminhada (sólido, líquido, abismo)
export const IS_LIQUID = new Uint8Array(256);
for (const m of M) {
  const solid = m.kind === 'rock' || m.kind === 'ore' || m.kind === 'ancient' || m.kind === 'barrier' || m.kind === 'edge';
  IS_SOLID[m.id] = solid ? 1 : 0;
  IS_BLOCKING[m.id] = solid || m.kind === 'liquid' || m.kind === 'chasm' ? 1 : 0;
  IS_LIQUID[m.id] = m.kind === 'liquid' || m.kind === 'chasm' ? 1 : 0;
}
