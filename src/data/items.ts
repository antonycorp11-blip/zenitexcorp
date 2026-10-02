// Itens: tudo que pode estar em inventário, estoque, esteira ou receita.
export type ItemCat = 'bruto' | 'residuo' | 'minerio' | 'britado' | 'refinado' | 'liga' | 'componente' | 'consumivel' | 'modulo' | 'especial';
export type Containment = 'contencao' | 'frio' | 'magnetico';
export type IconShape = 'crystal' | 'cluster' | 'gravel' | 'ingot' | 'plate' | 'cell' | 'orb' | 'chip' | 'gear' | 'canister' | 'core' | 'charge' | 'kit' | 'module' | 'lamp' | 'fiber' | 'block';

export interface ItemDef {
  key: string;
  name: string;
  cat: ItemCat;
  color: [number, number, number];
  color2?: [number, number, number];
  icon: IconShape;
  weight: number;        // kg por unidade (inventário do jogador)
  value: number;         // créditos por unidade ao enviar
  contain?: Containment; // exige slot especial na mochila
  desc: string;
}

const items: ItemDef[] = [];
function it(d: ItemDef) { items.push(d); }

// --- Massa planetária bruta (o que a mineração produz) — composição varia por região ---
it({ key: 'solo_k37', name: 'Solo K-37', cat: 'bruto', color: [150, 98, 62], color2: [96, 62, 40], icon: 'gravel', weight: 1, value: 0.2, desc: 'Terra ferruginosa da Crosta. ~80% resíduo, o resto é Ferronox, Lumenita e, às vezes, algo melhor. Processe para descobrir.' });
it({ key: 'rocha_bruta', name: 'Rocha Bruta', cat: 'bruto', color: [118, 122, 128], color2: [70, 74, 80], icon: 'gravel', weight: 1, value: 0.2, desc: 'Rocha compacta da Camada de Pedra. Precisa ser triturada antes da separação.' });
it({ key: 'basalto_bruto', name: 'Basalto Bruto', cat: 'bruto', color: [120, 50, 44], color2: [60, 24, 24], icon: 'gravel', weight: 1, value: 0.25, desc: 'Basalto vulcânico. Exige Triturador Pesado e separação térmica.' });
it({ key: 'matriz_cristalina', name: 'Matriz Cristalina', cat: 'bruto', color: [130, 170, 220], color2: [70, 96, 140], icon: 'gravel', weight: 1, value: 0.3, desc: 'Cristais presos em gelo mineral. Trituração comum destrói os raros: use o Fragmentador Controlado.' });
it({ key: 'rocha_manto', name: 'Rocha de Manto', cat: 'bruto', color: [110, 90, 140], color2: [60, 46, 84], icon: 'gravel', weight: 1, value: 0.3, desc: 'Rocha sob pressão absurda. Precisa ser descomprimida antes de abrir.' });
it({ key: 'matriz_profunda', name: 'Matriz Profunda', cat: 'bruto', color: [70, 120, 126], color2: [36, 66, 72], icon: 'gravel', weight: 1, value: 0.35, desc: 'Mármore e metal líquido solidificado da Cidade Profunda.' });
it({ key: 'materia_nucleo', name: 'Matéria de Núcleo', cat: 'bruto', color: [200, 100, 40], color2: [110, 40, 16], icon: 'gravel', weight: 1, value: 0.5, desc: 'O coração do planeta, em pedaços. Só um Desintegrador consegue abrir.' });
it({ key: 'fragmentado', name: 'Material Fragmentado', cat: 'bruto', color: [150, 140, 128], color2: [90, 84, 76], icon: 'gravel', weight: 1, value: 0.3, desc: 'Rocha já triturada, pronta para o Separador Mineral.' });
it({ key: 'residuo', name: 'Resíduo Planetário', cat: 'residuo', color: [104, 92, 84], color2: [64, 56, 52], icon: 'gravel', weight: 1, value: 0, desc: 'Massa geologicamente inútil. É literalmente 80% do planeta. Compacte e exporte: a Zenitex também vende isso.' });
it({ key: 'bloco_massa', name: 'Bloco de Massa Planetária', cat: 'residuo', color: [140, 120, 100], color2: [255, 170, 60], icon: 'block', weight: 100, value: 6, desc: '100 kg de resíduo compactado. Exportado pelo Terminal Orbital — e o planeta fica menor.' });

// --- Minérios brutos (1 unidade = 1 kg) ---
it({ key: 'lumenita', name: 'Lumenita', cat: 'minerio', color: [60, 140, 255], icon: 'crystal', weight: 1, value: 2, desc: 'Cristal energético azul. Base de baterias, reatores e infraestrutura elétrica.' });
it({ key: 'ferronox', name: 'Ferronox', cat: 'minerio', color: [150, 150, 175], color2: [40, 40, 52], icon: 'cluster', weight: 1, value: 2, desc: 'Metal negro extremamente resistente. Principal material estrutural.' });
it({ key: 'pyroxis', name: 'Pyroxis', cat: 'minerio', color: [255, 70, 40], icon: 'crystal', weight: 1, value: 4, desc: 'Cristal vermelho instável. Calor, explosivos e reatores térmicos.' });
it({ key: 'verdanio', name: 'Verdânio', cat: 'minerio', color: [60, 230, 100], icon: 'crystal', weight: 1, value: 4, desc: 'Material semiorgânico que cresce lentamente. Biofiltros e regeneração.' });
it({ key: 'nexolita', name: 'Nexolita', cat: 'minerio', color: [170, 80, 255], icon: 'crystal', weight: 1, value: 6, desc: 'Cristal roxo que amplifica sinais. Computação, drones e IA.' });
it({ key: 'crysalis', name: 'Crysalis', cat: 'minerio', color: [150, 230, 255], icon: 'crystal', weight: 1, value: 7, contain: 'frio', desc: 'Mineral extremamente frio. Precisa de slot refrigerado.' });
it({ key: 'solvex', name: 'Solvex', cat: 'minerio', color: [255, 210, 60], icon: 'crystal', weight: 1, value: 8, desc: 'Mineral amarelo de uso químico.' });
it({ key: 'umbrium', name: 'Umbrium', cat: 'minerio', color: [80, 50, 120], color2: [20, 10, 30], icon: 'cluster', weight: 2, value: 30, contain: 'magnetico', desc: 'Absorve energia. Exige campo magnético para transporte.' });
it({ key: 'lumenita_pura', name: 'Lumenita Pura', cat: 'minerio', color: [190, 225, 255], icon: 'crystal', weight: 1, value: 25, desc: 'Lumenita sem impurezas. Depósitos raros; robôs não sabem extrair.' });
it({ key: 'lumenita_instavel', name: 'Lumenita Instável', cat: 'minerio', color: [90, 255, 255], icon: 'crystal', weight: 1, value: 18, contain: 'contencao', desc: 'Oscila em frequência perigosa. Exige contenção.' });
it({ key: 'ferronox_denso', name: 'Ferronox Denso', cat: 'minerio', color: [100, 100, 120], color2: [20, 20, 28], icon: 'cluster', weight: 3, value: 10, desc: 'Ferronox comprimido pela pressão do manto.' });
it({ key: 'pyroxis_volatil', name: 'Pyroxis Volátil', cat: 'minerio', color: [255, 160, 40], icon: 'crystal', weight: 1, value: 22, contain: 'contencao', desc: 'Detona sob vibração. Exige contenção.' });
it({ key: 'verdanio_vivo', name: 'Verdânio Vivo', cat: 'minerio', color: [160, 255, 130], icon: 'crystal', weight: 1, value: 24, desc: 'Ainda cresce depois de extraído. A Zenitex classifica isso como "rendimento".' });
it({ key: 'nexolita_condensada', name: 'Nexolita Condensada', cat: 'minerio', color: [235, 130, 255], icon: 'crystal', weight: 1, value: 40, desc: 'Nexolita sob pressão extrema. Amplificação de sinal absurda.' });
it({ key: 'necrocristal', name: 'Necrocristal', cat: 'minerio', color: [200, 240, 215], icon: 'crystal', weight: 1, value: 35, desc: 'Cresce de volta depois de removido. Ninguém sabe por quê. Ninguém do Jurídico quer saber.' });
it({ key: 'fragmento_nucleo', name: 'Fragmento de Núcleo', cat: 'minerio', color: [255, 200, 110], color2: [200, 80, 20], icon: 'core', weight: 4, value: 400, contain: 'magnetico', desc: 'Matéria do coração planetário.' });

// --- Britados (Triturador: dobra o rendimento no refino) ---
const BRITAVEL: [string, string, [number, number, number]][] = [
  ['lumenita', 'Lumenita', [60, 140, 255]], ['ferronox', 'Ferronox', [150, 150, 175]], ['pyroxis', 'Pyroxis', [255, 70, 40]],
  ['verdanio', 'Verdânio', [60, 230, 100]], ['nexolita', 'Nexolita', [170, 80, 255]], ['crysalis', 'Crysalis', [150, 230, 255]],
  ['solvex', 'Solvex', [255, 210, 60]], ['umbrium', 'Umbrium', [80, 50, 120]],
];
for (const [k, n, c] of BRITAVEL)
  it({ key: 'britado_' + k, name: n + ' Britado', cat: 'britado', color: c, icon: 'gravel', weight: 1, value: 3, desc: `${n} triturado. Rende o dobro na refinaria.` });
export const BRITAVEL_KEYS = BRITAVEL.map(b => b[0]);

// --- Refinados ---
it({ key: 'celula_lumenita', name: 'Célula de Lumenita', cat: 'refinado', color: [80, 160, 255], icon: 'cell', weight: 1, value: 12, desc: 'Armazenamento energético padrão Zenitex.' });
it({ key: 'placa_ferronox', name: 'Placa de Ferronox', cat: 'refinado', color: [130, 130, 150], icon: 'plate', weight: 2, value: 10, desc: 'Placa estrutural laminada.' });
it({ key: 'pyroxis_estabilizado', name: 'Pyroxis Estabilizado', cat: 'refinado', color: [255, 100, 50], icon: 'canister', weight: 1, value: 20, desc: 'Pyroxis encapsulado. Só explode quando autorizado.' });
it({ key: 'fibra_verdanio', name: 'Fibra de Verdânio', cat: 'refinado', color: [80, 230, 110], icon: 'fiber', weight: 1, value: 18, desc: 'Fibra biomineral para filtros.' });
it({ key: 'chip_nexolita', name: 'Chip de Nexolita', cat: 'refinado', color: [180, 90, 255], icon: 'chip', weight: 1, value: 30, desc: 'Processamento por ressonância cristalina.' });
it({ key: 'gel_crysalis', name: 'Gel Criogênico', cat: 'refinado', color: [160, 235, 255], icon: 'canister', weight: 1, value: 28, desc: 'Refrigerante de base Crysalis.' });
it({ key: 'solvex_refinado', name: 'Solvex Refinado', cat: 'refinado', color: [255, 220, 80], icon: 'canister', weight: 1, value: 32, desc: 'Solvente universal. Dissolve quase tudo, inclusive orçamentos.' });
it({ key: 'matriz_umbrium', name: 'Matriz de Umbrium', cat: 'refinado', color: [100, 60, 150], icon: 'ingot', weight: 2, value: 120, desc: 'Absorvedor energético estabilizado.' });
it({ key: 'cristal_memoria', name: 'Cristal de Memória', cat: 'refinado', color: [210, 255, 230], icon: 'orb', weight: 1, value: 150, desc: 'Necrocristal purificado. Há padrões dentro dele. Padrões demais.' });

// --- Ligas / combinações (Fundidor Alienígena) ---
it({ key: 'nucleo_sinaptico', name: 'Núcleo de Energia Sináptica', cat: 'liga', color: [130, 120, 255], color2: [60, 160, 255], icon: 'core', weight: 1, value: 90, desc: 'Lumenita + Nexolita. Energia que "pensa" para onde ir.' });
it({ key: 'liga_termo', name: 'Barra Densa', cat: 'refinado', color: [200, 90, 70], color2: [90, 90, 110], icon: 'ingot', weight: 2, value: 70, desc: 'Ferronox Denso refinado. Suporta magma e pressão.' });
it({ key: 'refrigerante_bio', name: 'Refrigerante Biológico', cat: 'liga', color: [110, 240, 200], icon: 'canister', weight: 1, value: 80, desc: 'Crysalis + Verdânio. Resfria e se regenera.' });
it({ key: 'celula_negra', name: 'Célula de Energia Negra', cat: 'liga', color: [60, 30, 90], color2: [90, 160, 255], icon: 'cell', weight: 2, value: 400, desc: 'Umbrium + Lumenita. Densidade energética proibida em 14 sistemas.' });
it({ key: 'polimero_solvex', name: 'Polímero Solvex', cat: 'liga', color: [240, 200, 90], color2: [120, 120, 140], icon: 'plate', weight: 1, value: 85, desc: 'Solvex + Ferronox. Resistente à corrosão.' });
it({ key: 'liga_ancestral', name: 'Liga Ancestral', cat: 'liga', color: [70, 220, 230], color2: [40, 60, 70], icon: 'ingot', weight: 2, value: 600, desc: 'Ferronox Denso + Cristal de Memória. A receita estava escrita em uma parede.' });

// --- Componentes ---
it({ key: 'componente', name: 'Componente Estrutural', cat: 'componente', color: [230, 150, 40], icon: 'plate', weight: 2, value: 25, desc: 'Viga modular Zenitex.' });
it({ key: 'motor', name: 'Motor', cat: 'componente', color: [230, 140, 40], color2: [80, 80, 90], icon: 'gear', weight: 3, value: 45, desc: 'Motor elétrico industrial.' });
it({ key: 'bateria', name: 'Bateria', cat: 'componente', color: [80, 170, 255], icon: 'cell', weight: 2, value: 35, desc: 'Banco de células.' });
it({ key: 'broca', name: 'Cabeça de Broca', cat: 'componente', color: [200, 200, 210], color2: [230, 140, 40], icon: 'charge', weight: 3, value: 60, desc: 'Ponta perfurante.' });
it({ key: 'sensor', name: 'Sensor', cat: 'componente', color: [150, 100, 255], icon: 'chip', weight: 1, value: 55, desc: 'Leitura geológica e telemetria.' });
it({ key: 'filtro', name: 'Filtro', cat: 'componente', color: [100, 220, 120], icon: 'module', weight: 1, value: 40, desc: 'Filtragem de gases e particulados.' });
it({ key: 'circuito', name: 'Circuito Avançado', cat: 'componente', color: [190, 120, 255], color2: [60, 200, 120], icon: 'chip', weight: 1, value: 110, desc: 'Lógica de controle para robôs e complexos.' });
it({ key: 'pecas', name: 'Peças de Reposição', cat: 'componente', color: [220, 170, 60], icon: 'gear', weight: 2, value: 30, desc: 'Consumidas em reparos.' });
it({ key: 'nucleo_ia', name: 'Núcleo de IA', cat: 'componente', color: [120, 200, 255], color2: [200, 120, 255], icon: 'core', weight: 1, value: 300, desc: 'IA embarcada. Esta já pediu aumento.' });

// --- Consumíveis do jogador ---
it({ key: 'explosivo', name: 'Carga Explosiva', cat: 'consumivel', color: [230, 50, 40], icon: 'charge', weight: 2, value: 20, desc: 'Remove grandes volumes de rocha. Desaconselhado perto de máquinas.' });
it({ key: 'sinalizador', name: 'Sinalizador', cat: 'consumivel', color: [255, 180, 60], icon: 'lamp', weight: 1, value: 4, desc: 'Ilumina a área e marca o mapa.' });
it({ key: 'kit_reparo', name: 'Kit de Reparo', cat: 'consumivel', color: [230, 160, 40], icon: 'kit', weight: 2, value: 25, desc: 'Reparo de campo em máquinas e robôs.' });
it({ key: 'medkit', name: 'Kit Médico', cat: 'consumivel', color: [230, 60, 60], icon: 'kit', weight: 1, value: 15, desc: 'Restaura vida. Descontado do salário.' });
it({ key: 'plataforma_kit', name: 'Kit de Plataforma', cat: 'consumivel', color: [200, 140, 50], icon: 'plate', weight: 3, value: 15, desc: 'Plataforma sobre líquidos e abismos.' });

// --- Equipamento portátil ---
it({ key: 'kit_soprador', name: 'Soprador (na mão)', cat: 'consumivel', color: [80, 180, 230], color2: [40, 60, 80], icon: 'module', weight: 0, value: 30, desc: 'Soprador Automático recolhido: coloque de novo em qualquer frente de escavação, sem custo.' });

// --- Especiais ---
it({ key: 'artefato', name: 'Fragmento Ancestral', cat: 'especial', color: [70, 220, 230], icon: 'orb', weight: 1, value: 0, desc: 'Resto material de Khelos. Avaliado pela Zenitex em "depende".' });

export const ITEMS: readonly ItemDef[] = items;
export const ITEM: Record<string, ItemDef> = Object.fromEntries(items.map(i => [i.key, i]));
export const itemName = (k: string) => ITEM[k]?.name ?? k;

// Minérios exibidos na barra superior (como nas referências)
export const TOP_BAR_ITEMS = ['lumenita', 'ferronox', 'pyroxis', 'nexolita', 'verdanio', 'crysalis', 'solvex', 'umbrium'];
export const isRaw = (k: string) => ITEM[k]?.cat === 'bruto';
