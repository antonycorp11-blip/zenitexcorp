import { MAT } from './materials';

export type HazardKey = 'calor' | 'frio' | 'toxico' | 'radiacao' | 'gravidade' | 'pressao' | 'corrosao' | 'anomalia';
export const HAZARD_NAMES: Record<HazardKey, string> = {
  calor: 'Calor extremo', frio: 'Frio extremo', toxico: 'Toxicidade', radiacao: 'Radiação',
  gravidade: 'Gravidade irregular', pressao: 'Pressão', corrosao: 'Corrosão', anomalia: 'Anomalia alienígena',
};

export interface OreSpawn { mat: number; weight: number; }

/**
 * CAMADAS do planeta, de fora para dentro. Cada camada é um mapa inteiro (um disco visto de cima).
 * As de cima são maiores; as de baixo são menores, porém muito mais duras e com metas de massa maiores.
 * (O nome "SectorDef" foi mantido para compatibilidade com os sistemas: setor = camada.)
 */
export interface SectorDef {
  id: number;               // 1..7 (1 = superfície)
  name: string;
  code: string;             // ex. "Camada 1"
  desc: string;
  tier: number;             // classe de perfurador necessária para a rocha desta camada
  radius: number;           // raio do disco da camada (fração do mundo)
  target: number;           // meta de massa da camada (unidades de extração)
  share: number;            // fração da massa planetária total
  rock: number;
  floor: [number, number, number];
  floor2: [number, number, number];
  ambient: [number, number, number];
  darkness: number;
  accent: string;
  openness: number;
  ores: OreSpawn[];
  oreDensity: number;
  liquid?: { mat: number; amount: number };
  roots?: boolean;
  ruins: number;
  tempC: number;
  hazards: Partial<Record<HazardKey, number>>;
  stabilize: { machine: string; count: number }[];
  quota: Record<string, number>;
  logisticsKg: number;
  music: 'calmo' | 'industrial' | 'tenso' | 'misterio' | 'nucleo';
  pos: [number, number];    // centro (compatibilidade com mapa/órbita)
}

const C: [number, number] = [0.5, 0.5];

export const SECTORS: SectorDef[] = [
  {
    id: 1, name: 'Crosta de Terra', code: 'Camada 1', tier: 1, radius: 0.47, target: 8000, share: 0.35, pos: C,
    desc: 'A superfície: terra ferruginosa, cavernas rasas, Lumenita e Ferronox por toda parte. A maior camada do planeta — e a mais fácil.',
    rock: MAT.R1, floor: [128, 86, 54], floor2: [104, 66, 42], ambient: [20, 8, 4], darkness: 0.55, accent: '#ff8a3a', openness: 0.38,
    ores: [{ mat: MAT.FERRONOX, weight: 6 }, { mat: MAT.LUMENITA, weight: 5 }, { mat: MAT.LUMENITA_PURA, weight: 0.3 }],
    oreDensity: 0.09, liquid: { mat: MAT.WATER, amount: 0.04 }, roots: true, ruins: 0.12, tempC: 23, hazards: {},
    stabilize: [{ machine: 'suporte', count: 2 }], quota: { lumenita: 600, ferronox: 600 }, logisticsKg: 800, music: 'calmo',
  },
  {
    id: 2, name: 'Camada de Pedra', code: 'Camada 2', tier: 2, radius: 0.42, target: 20000, share: 0.22, pos: C,
    desc: 'Rocha cinzenta e compacta, bolsões de gás e as primeiras ruínas de Var-Ka. Ainda dá para respirar — com filtro.',
    rock: MAT.R6, floor: [80, 82, 84], floor2: [60, 64, 68], ambient: [2, 12, 16], darkness: 0.6, accent: '#3ae6ff', openness: 0.38,
    ores: [{ mat: MAT.FERRONOX, weight: 5 }, { mat: MAT.NEXOLITA, weight: 5 }, { mat: MAT.NEXOLITA_CONDENSADA, weight: 0.3 }],
    oreDensity: 0.085, liquid: { mat: MAT.ACID, amount: 0.06 }, ruins: 0.55, tempC: 31, hazards: { toxico: 30 },
    stabilize: [{ machine: 'filtro_ar', count: 2 }, { machine: 'suporte', count: 2 }], quota: { nexolita: 1500, ferronox: 2000 }, logisticsKg: 3000, music: 'misterio',
  },
  {
    id: 3, name: 'Camada de Basalto', code: 'Camada 3', tier: 3, radius: 0.37, target: 45000, share: 0.15, pos: C,
    desc: 'Rios de magma e rocha vulcânica. Pyroxis cresce perto do calor. A Zenitex chama de "morno".',
    rock: MAT.R3, floor: [100, 52, 32], floor2: [74, 36, 24], ambient: [30, 4, 2], darkness: 0.5, accent: '#ff4a2a', openness: 0.36,
    ores: [{ mat: MAT.PYROXIS, weight: 6 }, { mat: MAT.FERRONOX_DENSO, weight: 4 }, { mat: MAT.PYROXIS_VOLATIL, weight: 0.35 }],
    oreDensity: 0.09, liquid: { mat: MAT.LAVA, amount: 0.12 }, ruins: 0.12, tempC: 140, hazards: { calor: 55 },
    stabilize: [{ machine: 'refrigerador', count: 3 }], quota: { pyroxis: 3000, ferronox_denso: 1500 }, logisticsKg: 8000, music: 'tenso',
  },
  {
    id: 4, name: 'Camada Cristalina', code: 'Camada 4', tier: 4, radius: 0.32, target: 90000, share: 0.11, pos: C,
    desc: 'Cavernas de Crysalis congelado e abismos sem fundo catalogado. Temperaturas absurdas abaixo de zero.',
    rock: MAT.R4, floor: [84, 104, 136], floor2: [60, 76, 106], ambient: [2, 8, 22], darkness: 0.6, accent: '#7fe0ff', openness: 0.42,
    ores: [{ mat: MAT.CRYSALIS, weight: 6 }, { mat: MAT.LUMENITA, weight: 4 }, { mat: MAT.LUMENITA_INSTAVEL, weight: 0.4 }],
    oreDensity: 0.09, liquid: { mat: MAT.CHASM, amount: 0.1 }, ruins: 0.2, tempC: -95, hazards: { frio: 55 },
    stabilize: [{ machine: 'aquecedor', count: 2 }, { machine: 'plataforma', count: 4 }], quota: { crysalis: 3000, lumenita: 6000 }, logisticsKg: 20000, music: 'calmo',
  },
  {
    id: 5, name: 'Manto', code: 'Camada 5', tier: 5, radius: 0.27, target: 160000, share: 0.09, pos: C,
    desc: 'Rocha comprimida, gravidade instável e necrocristais que crescem de volta. Algo aqui reage à mineração.',
    rock: MAT.R8, floor: [86, 74, 100], floor2: [64, 54, 78], ambient: [10, 4, 22], darkness: 0.62, accent: '#b07aff', openness: 0.4,
    ores: [{ mat: MAT.UMBRIUM, weight: 4 }, { mat: MAT.NECROCRISTAL, weight: 5 }, { mat: MAT.NEXOLITA_CONDENSADA, weight: 0.4 }],
    oreDensity: 0.09, liquid: { mat: MAT.CHASM, amount: 0.08 }, ruins: 0.25, tempC: 60, hazards: { gravidade: 55, radiacao: 30 },
    stabilize: [{ machine: 'estabilizador', count: 3 }, { machine: 'inibidor', count: 2 }], quota: { umbrium: 800, necrocristal: 1500 }, logisticsKg: 40000, music: 'misterio',
  },
  {
    id: 6, name: 'Núcleo Externo', code: 'Camada 6', tier: 5, radius: 0.22, target: 260000, share: 0.05, pos: C,
    desc: 'A Cidade Profunda de Khelos: arquivos, templos e estátuas entre mármore e metal líquido.',
    rock: MAT.R11, floor: [66, 86, 90], floor2: [46, 64, 70], ambient: [0, 14, 20], darkness: 0.64, accent: '#4af0ff', openness: 0.4,
    ores: [{ mat: MAT.SOLVEX, weight: 5 }, { mat: MAT.FERRONOX_DENSO, weight: 4 }, { mat: MAT.LUMENITA_PURA, weight: 0.6 }],
    oreDensity: 0.08, liquid: { mat: MAT.LAVA, amount: 0.06 }, ruins: 1, tempC: 210, hazards: { calor: 60, anomalia: 55, pressao: 40 },
    stabilize: [{ machine: 'escudo_rad', count: 2 }, { machine: 'refrigerador', count: 2 }], quota: { cristal_memoria: 60, ferronox_denso: 6000 }, logisticsKg: 80000, music: 'misterio',
  },
  {
    id: 7, name: 'Núcleo', code: 'Camada 7', tier: 6, radius: 0.18, target: 400000, share: 0.03, pos: C,
    desc: 'O coração planetário. Pequeno para um planeta; imenso para um minerador. O material mais valioso — e as respostas.',
    rock: MAT.R12, floor: [108, 58, 30], floor2: [80, 42, 22], ambient: [30, 10, 2], darkness: 0.45, accent: '#ffb04a', openness: 0.34,
    ores: [{ mat: MAT.UMBRIUM, weight: 4 }, { mat: MAT.NECROCRISTAL, weight: 3 }, { mat: MAT.NUCLEO, weight: 1.2 }],
    oreDensity: 0.08, liquid: { mat: MAT.LAVA, amount: 0.08 }, ruins: 0.4, tempC: 380, hazards: { calor: 85, radiacao: 70, pressao: 80, anomalia: 80 },
    stabilize: [{ machine: 'estabilizador', count: 2 }, { machine: 'escudo_rad', count: 2 }, { machine: 'refrigerador', count: 2 }], quota: { fragmento_nucleo: 300, celula_negra: 40 }, logisticsKg: 100000, music: 'nucleo',
  },
];

export const LAYER_COUNT = SECTORS.length;
export const sectorById = (id: number) => SECTORS[id - 1];
