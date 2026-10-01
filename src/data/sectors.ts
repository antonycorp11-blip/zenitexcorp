import { MAT } from './materials';

export type HazardKey = 'calor' | 'frio' | 'toxico' | 'radiacao' | 'gravidade' | 'pressao' | 'corrosao' | 'anomalia';
export const HAZARD_NAMES: Record<HazardKey, string> = {
  calor: 'Calor extremo', frio: 'Frio extremo', toxico: 'Toxicidade', radiacao: 'Radiação',
  gravidade: 'Gravidade irregular', pressao: 'Pressão', corrosao: 'Corrosão', anomalia: 'Anomalia alienígena',
};

export interface OreSpawn { mat: number; weight: number; }
export interface SectorDef {
  id: number;               // 1..12
  name: string;
  code: string;             // ex. "Setor 01"
  desc: string;
  tier: number;             // nível de perfurador para atravessar a contenção
  pos: [number, number];    // semente Voronoi (fração do mundo)
  rock: number;
  floor: [number, number, number];
  floor2: [number, number, number];
  ambient: [number, number, number]; // cor da escuridão
  darkness: number;         // 0..1
  accent: string;           // cor de UI/mapa
  openness: number;         // fração aproximada de cavernas
  ores: OreSpawn[];
  oreDensity: number;
  liquid?: { mat: number; amount: number };
  roots?: boolean;
  ruins: number;            // densidade de ruínas (0..1)
  tempC: number;
  hazards: Partial<Record<HazardKey, number>>; // 0..100
  reserve: number;          // fração da massa planetária
  stabilize: { machine: string; count: number }[];
  quota: Record<string, number>;
  logisticsKg: number;      // fase 5
  music: 'calmo' | 'industrial' | 'tenso' | 'misterio' | 'nucleo';
}

const ring = (angDeg: number, r: number): [number, number] => {
  const a = (angDeg * Math.PI) / 180;
  return [0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r];
};

export const SECTORS: SectorDef[] = [
  {
    id: 1, name: 'Planalto de Khelos', code: 'Setor 01', tier: 1, pos: ring(-90, 0.37),
    desc: 'Região relativamente estável. Terreno ferruginoso alienígena. Onde tudo começa — e onde a Zenitex garante que "nada de importante" acontece.',
    rock: MAT.R1, floor: [128, 86, 54], floor2: [104, 66, 42], ambient: [20, 8, 4], darkness: 0.55, accent: '#ff8a3a', openness: 0.36,
    ores: [{ mat: MAT.LUMENITA, weight: 5 }, { mat: MAT.FERRONOX, weight: 6 }, { mat: MAT.LUMENITA_PURA, weight: 0.25 }],
    oreDensity: 0.085, ruins: 0.08, tempC: 23, hazards: {}, reserve: 0.02,
    stabilize: [{ machine: 'suporte', count: 2 }], quota: { lumenita: 600, ferronox: 600 }, logisticsKg: 800, music: 'calmo',
  },
  {
    id: 2, name: 'Bosque Verdânio', code: 'Setor 02', tier: 1, pos: ring(-45, 0.37),
    desc: 'Raízes minerais gigantes atravessam a rocha. Fluidos bioluminescentes. Algo aqui ainda está vivo, o que a Zenitex trata como "detalhe de licenciamento".',
    rock: MAT.R2, floor: [92, 70, 44], floor2: [66, 60, 36], ambient: [4, 16, 8], darkness: 0.62, accent: '#4cff7a', openness: 0.4,
    ores: [{ mat: MAT.VERDANIO, weight: 6 }, { mat: MAT.NEXOLITA, weight: 3 }, { mat: MAT.LUMENITA, weight: 2 }, { mat: MAT.VERDANIO_VIVO, weight: 0.3 }],
    oreDensity: 0.09, liquid: { mat: MAT.WATER, amount: 0.05 }, roots: true, ruins: 0.1, tempC: 26, hazards: { toxico: 18 }, reserve: 0.03,
    stabilize: [{ machine: 'filtro_ar', count: 2 }], quota: { verdanio: 800, nexolita: 300 }, logisticsKg: 1500, music: 'calmo',
  },
  {
    id: 3, name: 'Campos Pyrox', code: 'Setor 03', tier: 2, pos: ring(0, 0.37),
    desc: 'Região vulcânica. Rios de material incandescente. Classificada como "ambiente de baixo risco". Tem lava no teto.',
    rock: MAT.R3, floor: [100, 52, 32], floor2: [74, 36, 24], ambient: [30, 4, 2], darkness: 0.5, accent: '#ff4a2a', openness: 0.36,
    ores: [{ mat: MAT.PYROXIS, weight: 6 }, { mat: MAT.FERRONOX_DENSO, weight: 3 }, { mat: MAT.FERRONOX, weight: 2 }, { mat: MAT.PYROXIS_VOLATIL, weight: 0.35 }],
    oreDensity: 0.09, liquid: { mat: MAT.LAVA, amount: 0.12 }, ruins: 0.06, tempC: 140, hazards: { calor: 55 }, reserve: 0.04,
    stabilize: [{ machine: 'refrigerador', count: 3 }], quota: { pyroxis: 1500, ferronox: 1200 }, logisticsKg: 3000, music: 'tenso',
  },
  {
    id: 4, name: 'Abismo Crysalis', code: 'Setor 04', tier: 2, pos: ring(45, 0.37),
    desc: 'Cavernas cristalinas gigantes, temperaturas negativas absurdas e abismos sem fundo catalogado.',
    rock: MAT.R4, floor: [84, 104, 136], floor2: [60, 76, 106], ambient: [2, 8, 22], darkness: 0.6, accent: '#7fe0ff', openness: 0.42,
    ores: [{ mat: MAT.CRYSALIS, weight: 6 }, { mat: MAT.LUMENITA, weight: 3 }, { mat: MAT.LUMENITA_PURA, weight: 0.6 }, { mat: MAT.LUMENITA_INSTAVEL, weight: 0.4 }],
    oreDensity: 0.09, liquid: { mat: MAT.CHASM, amount: 0.1 }, ruins: 0.08, tempC: -95, hazards: { frio: 55 }, reserve: 0.05,
    stabilize: [{ machine: 'aquecedor', count: 2 }, { machine: 'plataforma', count: 4 }], quota: { crysalis: 1500, lumenita: 3000 }, logisticsKg: 5000, music: 'calmo',
  },
  {
    id: 5, name: 'Pântano Nexolítico', code: 'Setor 05', tier: 3, pos: ring(90, 0.37),
    desc: 'Lagunas corrosivas e gases alienígenas. A brochura chama de "spa mineral".',
    rock: MAT.R5, floor: [84, 72, 42], floor2: [58, 56, 30], ambient: [8, 22, 2], darkness: 0.55, accent: '#9cff3a', openness: 0.4,
    ores: [{ mat: MAT.NEXOLITA, weight: 6 }, { mat: MAT.SOLVEX, weight: 4 }, { mat: MAT.VERDANIO, weight: 3 }, { mat: MAT.NEXOLITA_CONDENSADA, weight: 0.3 }],
    oreDensity: 0.095, liquid: { mat: MAT.ACID, amount: 0.14 }, roots: true, ruins: 0.08, tempC: 31, hazards: { toxico: 70, corrosao: 40 }, reserve: 0.06,
    stabilize: [{ machine: 'bomba', count: 2 }, { machine: 'filtro_ar', count: 2 }], quota: { nexolita: 2500, solvex: 1200 }, logisticsKg: 8000, music: 'tenso',
  },
  {
    id: 6, name: 'Ruínas de Var-Ka', code: 'Setor 06', tier: 3, pos: ring(135, 0.37),
    desc: 'A primeira cidade subterrânea. Mineração e arqueologia. O planeta talvez não estivesse tão "abandonado" assim.',
    rock: MAT.R6, floor: [80, 82, 84], floor2: [60, 64, 68], ambient: [2, 14, 18], darkness: 0.62, accent: '#3ae6ff', openness: 0.4,
    ores: [{ mat: MAT.FERRONOX, weight: 4 }, { mat: MAT.LUMENITA, weight: 3 }, { mat: MAT.SOLVEX, weight: 2 }, { mat: MAT.NEXOLITA, weight: 2 }],
    oreDensity: 0.07, ruins: 0.9, tempC: 12, hazards: { anomalia: 25 }, reserve: 0.06,
    stabilize: [{ machine: 'suporte', count: 3 }], quota: { ferronox: 6000, solvex: 1500 }, logisticsKg: 12000, music: 'misterio',
  },
  {
    id: 7, name: 'Mar Subterrâneo', code: 'Setor 07', tier: 3, pos: ring(180, 0.37),
    desc: 'Lagos internos imensos, ilhas minerais e estruturas submersas. A Zenitex lembra: afogamento não é acidente de trabalho, é descuido.',
    rock: MAT.R7, floor: [70, 88, 88], floor2: [50, 66, 70], ambient: [0, 10, 20], darkness: 0.6, accent: '#2ab4ff', openness: 0.46,
    ores: [{ mat: MAT.CRYSALIS, weight: 3 }, { mat: MAT.SOLVEX, weight: 4 }, { mat: MAT.LUMENITA, weight: 4 }, { mat: MAT.FERRONOX_DENSO, weight: 2 }],
    oreDensity: 0.085, liquid: { mat: MAT.WATER, amount: 0.3 }, ruins: 0.25, tempC: 8, hazards: { pressao: 30 }, reserve: 0.08,
    stabilize: [{ machine: 'bomba', count: 3 }, { machine: 'plataforma', count: 6 }], quota: { solvex: 3000, crysalis: 3000 }, logisticsKg: 20000, music: 'calmo',
  },
  {
    id: 8, name: 'Campo Gravítico', code: 'Setor 08', tier: 4, pos: ring(225, 0.37),
    desc: 'Gravidade irregular. Fragmentos flutuam. Objetos caem em direções criativas.',
    rock: MAT.R8, floor: [86, 74, 100], floor2: [64, 54, 78], ambient: [10, 4, 22], darkness: 0.6, accent: '#b07aff', openness: 0.42,
    ores: [{ mat: MAT.NEXOLITA, weight: 4 }, { mat: MAT.UMBRIUM, weight: 2 }, { mat: MAT.CRYSALIS, weight: 3 }, { mat: MAT.NEXOLITA_CONDENSADA, weight: 0.5 }],
    oreDensity: 0.08, liquid: { mat: MAT.CHASM, amount: 0.12 }, ruins: 0.15, tempC: 4, hazards: { gravidade: 60 }, reserve: 0.08,
    stabilize: [{ machine: 'estabilizador', count: 3 }], quota: { umbrium: 400, nexolita: 6000 }, logisticsKg: 30000, music: 'misterio',
  },
  {
    id: 9, name: 'Necrocristais', code: 'Setor 09', tier: 4, pos: ring(200, 0.19),
    desc: 'Formações minerais crescem de volta depois de removidas. Algo no planeta está reagindo à mineração.',
    rock: MAT.R9, floor: [102, 98, 92], floor2: [74, 72, 68], ambient: [4, 14, 10], darkness: 0.66, accent: '#c8ffe0', openness: 0.38,
    ores: [{ mat: MAT.NECROCRISTAL, weight: 6 }, { mat: MAT.UMBRIUM, weight: 2 }, { mat: MAT.LUMENITA, weight: 2 }],
    oreDensity: 0.1, ruins: 0.25, tempC: -10, hazards: { radiacao: 40, anomalia: 40 }, reserve: 0.09,
    stabilize: [{ machine: 'inibidor', count: 3 }], quota: { necrocristal: 1500, umbrium: 800 }, logisticsKg: 40000, music: 'misterio',
  },
  {
    id: 10, name: 'Cinturão do Núcleo', code: 'Setor 10', tier: 5, pos: ring(320, 0.19),
    desc: 'Terreno extremamente denso. Máquinas comuns praticamente param. Aqui só funcionam complexos industriais.',
    rock: MAT.R10, floor: [86, 58, 52], floor2: [62, 42, 40], ambient: [24, 4, 4], darkness: 0.6, accent: '#ff5a3a', openness: 0.3,
    ores: [{ mat: MAT.FERRONOX_DENSO, weight: 6 }, { mat: MAT.PYROXIS, weight: 3 }, { mat: MAT.UMBRIUM, weight: 2 }, { mat: MAT.PYROXIS_VOLATIL, weight: 0.5 }],
    oreDensity: 0.09, liquid: { mat: MAT.LAVA, amount: 0.1 }, ruins: 0.1, tempC: 210, hazards: { calor: 75, pressao: 60 }, reserve: 0.12,
    stabilize: [{ machine: 'refrigerador', count: 3 }, { machine: 'suporte', count: 4 }], quota: { ferronox_denso: 6000, pyroxis: 8000 }, logisticsKg: 60000, music: 'tenso',
  },
  {
    id: 11, name: 'Cidade Profunda', code: 'Setor 11', tier: 5, pos: ring(80, 0.19),
    desc: 'O maior conjunto de estruturas de Khelos. Arquivos, templos, máquinas, estátuas, mapas estelares.',
    rock: MAT.R11, floor: [66, 86, 90], floor2: [46, 64, 70], ambient: [0, 14, 20], darkness: 0.64, accent: '#4af0ff', openness: 0.4,
    ores: [{ mat: MAT.SOLVEX, weight: 3 }, { mat: MAT.NEXOLITA_CONDENSADA, weight: 1 }, { mat: MAT.LUMENITA_PURA, weight: 1 }, { mat: MAT.NECROCRISTAL, weight: 2 }],
    oreDensity: 0.07, liquid: { mat: MAT.WATER, amount: 0.06 }, ruins: 1, tempC: 18, hazards: { anomalia: 65, radiacao: 35 }, reserve: 0.12,
    stabilize: [{ machine: 'escudo_rad', count: 3 }], quota: { cristal_memoria: 60, solvex_refinado: 800 }, logisticsKg: 80000, music: 'misterio',
  },
  {
    id: 12, name: 'Coração Planetário', code: 'Setor 12', tier: 6, pos: [0.5, 0.5],
    desc: 'A última grande região. O material mais valioso do planeta. E respostas sobre sua verdadeira função.',
    rock: MAT.R12, floor: [108, 58, 30], floor2: [80, 42, 22], ambient: [30, 10, 2], darkness: 0.45, accent: '#ffb04a', openness: 0.34,
    ores: [{ mat: MAT.NUCLEO, weight: 3 }, { mat: MAT.UMBRIUM, weight: 2 }, { mat: MAT.NECROCRISTAL, weight: 2 }, { mat: MAT.FERRONOX_DENSO, weight: 2 }],
    oreDensity: 0.08, liquid: { mat: MAT.LAVA, amount: 0.08 }, ruins: 0.4, tempC: 380, hazards: { calor: 85, radiacao: 70, pressao: 80, anomalia: 80 }, reserve: 0.25,
    stabilize: [{ machine: 'estabilizador', count: 2 }, { machine: 'escudo_rad', count: 2 }, { machine: 'refrigerador', count: 2 }], quota: { fragmento_nucleo: 300, celula_negra: 40 }, logisticsKg: 100000, music: 'nucleo',
  },
];

export const sectorById = (id: number) => SECTORS[id - 1];
