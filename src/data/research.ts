export type ResearchCat = 'mineracao' | 'logistica' | 'energia' | 'robotica' | 'processamento' | 'exploracao' | 'seguranca' | 'alienigena' | 'orbital' | 'planetaria';
export const RESEARCH_CATS: { key: ResearchCat; name: string }[] = [
  { key: 'mineracao', name: 'Mineração' }, { key: 'logistica', name: 'Logística' }, { key: 'energia', name: 'Energia' },
  { key: 'robotica', name: 'Robótica' }, { key: 'processamento', name: 'Processamento' }, { key: 'exploracao', name: 'Exploração' },
  { key: 'seguranca', name: 'Segurança' }, { key: 'alienigena', name: 'Tec. Alienígena' }, { key: 'orbital', name: 'Orbital' }, { key: 'planetaria', name: 'Planetária' },
];

export interface ResearchDef {
  key: string;
  name: string;
  cat: ResearchCat;
  desc: string;
  credits: number;
  items: Record<string, number>;
  time: number;               // segundos
  req: string[];
  certified?: number;         // exige setor N certificado
  lore?: number;              // exige N registros no Arquivo
  effects?: Record<string, number>;
  corporate?: boolean;        // mantida no próximo contrato (NG+)
  flavor?: string;
}

const L: ResearchDef[] = [];
const n = (d: ResearchDef) => L.push(d);

// MINERAÇÃO
n({ key: 'mineracao_eficiente', name: 'Mineração Eficiente', cat: 'mineracao', desc: '+25% velocidade de mineração manual.', credits: 150, items: { ferronox: 40 }, time: 10, req: [], effects: { mineSpeed: 0.25 }, corporate: true });
n({ key: 'perfuradora2', name: 'Perfuradora Mk II', cat: 'mineracao', desc: 'Perfuradoras automáticas de nível II.', credits: 800, items: { placa_ferronox: 30, celula_lumenita: 10 }, time: 20, req: ['refino'] });
n({ key: 'perfuradora3', name: 'Perfuradora Mk III', cat: 'mineracao', desc: 'Perfuradoras para rocha hiperdensa.', credits: 6000, items: { liga_termo: 20, chip_nexolita: 20 }, time: 40, req: ['perfuradora2', 'fundidor'] });
n({ key: 'extracao_avancada', name: 'Extração Avançada', cat: 'mineracao', desc: '+50% mineração manual e chance de minério extra.', credits: 2500, items: { placa_ferronox: 40, chip_nexolita: 10 }, time: 30, req: ['mineracao_eficiente', 'perfuradora2'], effects: { mineSpeed: 0.5, oreBonus: 0.2 }, corporate: true });
n({ key: 'explosivos', name: 'Explosivos Direcionais', cat: 'mineracao', desc: 'Cargas explosivas com raio +50%.', credits: 600, items: { pyroxis: 60 }, time: 15, req: [], effects: { blastRadius: 0.5 } });
n({ key: 'complexo2', name: 'Complexo Mk II', cat: 'mineracao', desc: 'Upgrade de Complexos para 3.000 t/min.', credits: 5000, items: { motor: 10, chip_nexolita: 10 }, time: 30, req: ['perfuradora2'], certified: 1 });
n({ key: 'complexo3', name: 'Complexo Mk III', cat: 'mineracao', desc: 'Upgrade para 20.000 t/min.', credits: 30000, items: { liga_termo: 30, circuito: 10 }, time: 45, req: ['complexo2', 'fundidor'], certified: 3 });
n({ key: 'complexo4', name: 'Complexo Mk IV', cat: 'mineracao', desc: 'Upgrade para 120.000 t/min.', credits: 150000, items: { nucleo_sinaptico: 30, circuito: 20 }, time: 60, req: ['complexo3', 'ia_embarcada'], certified: 6 });
n({ key: 'complexo5', name: 'Complexo Mk V', cat: 'mineracao', desc: 'Upgrade para 600.000 t/min.', credits: 900000, items: { liga_ancestral: 10, celula_negra: 10 }, time: 90, req: ['complexo4', 'liga_ancestral'], certified: 9 });

// LOGÍSTICA
n({ key: 'separador', name: 'Separadores', cat: 'logistica', desc: 'Filtragem de itens em esteiras.', credits: 250, items: { placa_ferronox: 10 }, time: 10, req: ['refino'] });
n({ key: 'esteira2', name: 'Esteira Mk II', cat: 'logistica', desc: 'Esteiras 2x mais rápidas.', credits: 600, items: { placa_ferronox: 20 }, time: 15, req: ['refino'] });
n({ key: 'esteira3', name: 'Esteira Mk III', cat: 'logistica', desc: 'Esteiras de alta vazão.', credits: 8000, items: { polimero_solvex: 30, motor: 6 }, time: 30, req: ['esteira2', 'fundidor'] });
n({ key: 'silos', name: 'Silos Industriais', cat: 'logistica', desc: 'Armazenamento setorial de 30 t.', credits: 900, items: { placa_ferronox: 30, componente: 4 }, time: 15, req: ['refino'] });
n({ key: 'elev_pessoal', name: 'Elevadores Pessoais', cat: 'logistica', desc: 'Rede de viagem rápida.', credits: 300, items: { ferronox: 60, lumenita: 40 }, time: 10, req: [], corporate: true });
n({ key: 'elev_industrial', name: 'Elevador Industrial', cat: 'logistica', desc: 'Vazão setorial de 6 t/min.', credits: 2000, items: { motor: 4, componente: 10 }, time: 25, req: ['silos'] });
n({ key: 'elev_profundo', name: 'Elevador Profundo', cat: 'logistica', desc: 'Vazão setorial de 40 t/min.', credits: 20000, items: { liga_termo: 20, circuito: 4 }, time: 40, req: ['elev_industrial', 'fundidor'] });
n({ key: 'elev_planetario', name: 'Elevador Planetário', cat: 'logistica', desc: 'Vazão setorial de 300 t/min.', credits: 300000, items: { liga_ancestral: 6, nucleo_sinaptico: 20 }, time: 60, req: ['elev_profundo', 'liga_ancestral'] });
n({ key: 'central_logistica', name: 'Central Logística', cat: 'logistica', desc: '+25% de vazão em todos os elevadores.', credits: 12000, items: { circuito: 6, sensor: 6 }, time: 30, req: ['elev_industrial', 'robo_loader'] });
n({ key: 'lancamento', name: 'Plataformas de Lançamento', cat: 'logistica', desc: '+5 t/min de envio orbital por plataforma.', credits: 3000, items: { motor: 6, pyroxis_estabilizado: 20 }, time: 25, req: ['elev_industrial'] });

// ENERGIA
n({ key: 'reator_lumenita', name: 'Reator de Lumenita', cat: 'energia', desc: '+140 kW por reator.', credits: 500, items: { celula_lumenita: 15 }, time: 15, req: ['refino'] });
n({ key: 'reator_pyroxis', name: 'Reator Pyroxis', cat: 'energia', desc: '+600 kW. Superaquece setores.', credits: 4000, items: { pyroxis_estabilizado: 30, motor: 4 }, time: 30, req: ['reator_lumenita'] });
n({ key: 'reator_hibrido', name: 'Reator Híbrido', cat: 'energia', desc: '+2.500 kW, refrigerado biologicamente.', credits: 40000, items: { refrigerante_bio: 20, liga_termo: 20 }, time: 50, req: ['reator_pyroxis', 'fundidor'] });
n({ key: 'energia_orbital', name: 'Energia Orbital', cat: 'energia', desc: 'Receptores de 4.000 kW.', credits: 120000, items: { nucleo_sinaptico: 20, circuito: 10 }, time: 60, req: ['reator_hibrido', 'lancamento'] });
n({ key: 'nucleo_alien', name: 'Núcleo Alienígena', cat: 'energia', desc: 'Replica geradores de Khelos: 20.000 kW.', credits: 500000, items: { cristal_memoria: 40, liga_ancestral: 10 }, time: 90, req: ['energia_orbital', 'liga_ancestral'], lore: 28 });
n({ key: 'surto', name: 'Proteção de Surto', cat: 'energia', desc: 'Protetores contra picos energéticos.', credits: 800, items: { celula_lumenita: 10 }, time: 12, req: ['reator_lumenita'] });

// ROBÓTICA
n({ key: 'robotica', name: 'Robótica Básica', cat: 'robotica', desc: 'Centro Robótico, Scout Bot e Robô Carregador.', credits: 700, items: { placa_ferronox: 20, celula_lumenita: 10 }, time: 20, req: ['refino'], corporate: true });
n({ key: 'robo_minerador', name: 'Drone Minerador', cat: 'robotica', desc: 'Robôs que extraem minério comum.', credits: 1500, items: { motor: 4, broca: 2 }, time: 25, req: ['robotica'] });
n({ key: 'robo_reparo', name: 'Robô de Reparo', cat: 'robotica', desc: 'Manutenção preventiva automática.', credits: 2000, items: { sensor: 3, pecas: 10 }, time: 25, req: ['robotica'] });
n({ key: 'robo_survey', name: 'Survey Bot', cat: 'robotica', desc: 'Mapeamento de depósitos por robôs.', credits: 2500, items: { sensor: 4, chip_nexolita: 4 }, time: 25, req: ['robotica'] });
n({ key: 'robo_hazard', name: 'Hazard Bot', cat: 'robotica', desc: 'Robôs de mitigação ambiental.', credits: 5000, items: { filtro: 4, gel_crysalis: 6 }, time: 30, req: ['robo_reparo', 'filtragem'] });
n({ key: 'robo_loader', name: 'Loader Bot', cat: 'robotica', desc: 'Robôs operadores de elevadores e terminais.', credits: 6000, items: { circuito: 3, motor: 4 }, time: 30, req: ['robo_minerador', 'elev_industrial'] });
n({ key: 'robotica2', name: 'Baterias de Robô', cat: 'robotica', desc: 'Robôs consomem 40% menos energia e se desgastam 30% menos.', credits: 9000, items: { bateria: 10, circuito: 4 }, time: 30, req: ['robo_reparo'], effects: { robotEnergy: -0.4, robotWear: -0.3 }, corporate: true });
n({ key: 'ia_embarcada', name: 'IA Embarcada', cat: 'robotica', desc: 'Núcleos de IA. A IA corporativa ZENA aprova (desconfiadamente).', credits: 80000, items: { circuito: 20, cristal_memoria: 6 }, time: 60, req: ['robotica2', 'fundidor'] });

// PROCESSAMENTO
n({ key: 'refino', name: 'Refino Mineral', cat: 'processamento', desc: 'Refinarias automáticas.', credits: 100, items: { ferronox: 30, lumenita: 20 }, time: 8, req: [], corporate: true });
n({ key: 'triturador', name: 'Trituração', cat: 'processamento', desc: 'Trituradores: dobram o rendimento do refino.', credits: 300, items: { ferronox: 60 }, time: 12, req: ['refino'] });
n({ key: 'sintetizador', name: 'Síntese de Componentes', cat: 'processamento', desc: 'Fabricação automática de componentes.', credits: 2500, items: { motor: 4, chip_nexolita: 6 }, time: 25, req: ['refino', 'separador'] });
n({ key: 'purificador', name: 'Purificação', cat: 'processamento', desc: 'Processa variantes raras.', credits: 1500, items: { celula_lumenita: 10, fibra_verdanio: 10 }, time: 20, req: ['refino'] });
n({ key: 'fundidor', name: 'Fundição Alienígena', cat: 'processamento', desc: 'Combina materiais complementares. Exige estudo de ruínas.', credits: 3500, items: { chip_nexolita: 10, placa_ferronox: 30 }, time: 30, req: ['purificador'], lore: 4 });

// EXPLORAÇÃO
n({ key: 'arqueologia', name: 'Arqueologia de Campo', cat: 'exploracao', desc: 'Centro Arqueológico. Sera insistiu.', credits: 800, items: { sensor: 2 }, time: 15, req: [], lore: 2 });
n({ key: 'bomba', name: 'Drenagem', cat: 'exploracao', desc: 'Bombas de drenagem de líquidos.', credits: 1200, items: { motor: 2, placa_ferronox: 10 }, time: 15, req: ['refino'] });

// SEGURANÇA
n({ key: 'refrigeracao', name: 'Refrigeração Industrial', cat: 'seguranca', desc: 'Refrigeradores de área.', credits: 600, items: { crysalis: 20, celula_lumenita: 6 }, time: 15, req: ['refino'] });
n({ key: 'aquecimento', name: 'Aquecimento Industrial', cat: 'seguranca', desc: 'Aquecedores de área.', credits: 600, items: { pyroxis: 30 }, time: 15, req: ['refino'] });
n({ key: 'filtragem', name: 'Filtragem Atmosférica', cat: 'seguranca', desc: 'Filtros de ar de área.', credits: 400, items: { verdanio: 40 }, time: 12, req: [] });
n({ key: 'blindagem', name: 'Blindagem de Radiação', cat: 'seguranca', desc: 'Escudos de radiação.', credits: 6000, items: { matriz_umbrium: 4 }, time: 30, req: ['refrigeracao'] });
n({ key: 'gravitacao', name: 'Gravitação Aplicada', cat: 'seguranca', desc: 'Estabilizadores gravitacionais.', credits: 5000, items: { chip_nexolita: 12, celula_lumenita: 12 }, time: 30, req: ['refino'] });
n({ key: 'inibicao', name: 'Inibição Mineral', cat: 'seguranca', desc: 'Inibidores de crescimento de necrocristais.', credits: 9000, items: { fibra_verdanio: 12, solvex_refinado: 12 }, time: 30, req: ['purificador'] });
n({ key: 'manutencao', name: 'Manutenção Preditiva', cat: 'seguranca', desc: 'Máquinas se desgastam 25% mais devagar.', credits: 3000, items: { sensor: 4, pecas: 10 }, time: 25, req: ['robo_reparo'], effects: { wearMult: -0.25 }, corporate: true });

// TECNOLOGIA ALIENÍGENA
n({ key: 'liga_ancestral', name: 'Liga Ancestral', cat: 'alienigena', desc: 'Receita de Khelos encontrada em parede de templo.', credits: 60000, items: { cristal_memoria: 10, ferronox_denso: 60 }, time: 45, req: ['fundidor'], lore: 16 });
n({ key: 'traducao', name: 'Tradução Khel', cat: 'alienigena', desc: 'Leitura completa dos registros. Pesquisas alienígenas 20% mais baratas.', credits: 4000, items: { chip_nexolita: 10 }, time: 30, req: ['arqueologia'], lore: 8, effects: { alienDiscount: 0.2 } });

// ORBITAL
n({ key: 'logistica_orbital', name: 'Logística Orbital', cat: 'orbital', desc: '+50% vazão do Terminal Orbital.', credits: 2000, items: { celula_lumenita: 20, motor: 2 }, time: 20, req: ['refino'], effects: { shipMult: 0.5 }, corporate: true });
n({ key: 'plataformas_orbitais', name: 'Plataformas Orbitais', cat: 'orbital', desc: 'Uplinks que coordenam extração orbital.', credits: 400000, items: { nucleo_sinaptico: 40, circuito: 30 }, time: 60, req: ['energia_orbital', 'tectonica'] });
n({ key: 'canhao', name: 'Canhão de Matéria', cat: 'orbital', desc: 'Arranca blocos de setores pelo mapa orbital. Disparo manual.', credits: 1500000, items: { celula_negra: 20, nucleo_ia: 4 }, time: 90, req: ['plataformas_orbitais'], certified: 11 });
n({ key: 'coletor', name: 'Coletores Gravitacionais', cat: 'orbital', desc: 'Recolhe fragmentos orbitais após o colapso.', credits: 2000000, items: { celula_negra: 20, nucleo_sinaptico: 40 }, time: 90, req: ['canhao'] });

// PLANETÁRIA
n({ key: 'tectonica', name: 'Engenharia Tectônica', cat: 'planetaria', desc: 'Brocas Tectônicas: acesso ao manto.', credits: 250000, items: { liga_termo: 60, nucleo_ia: 2 }, time: 60, req: ['complexo3', 'elev_profundo'], certified: 10 });
n({ key: 'extrator_manto', name: 'Extração de Manto', cat: 'planetaria', desc: 'Extratores de Manto em escala continental.', credits: 1200000, items: { celula_negra: 16, liga_ancestral: 16 }, time: 90, req: ['tectonica', 'liga_ancestral'] });
n({ key: 'cortador', name: 'Cortador Planetário', cat: 'planetaria', desc: 'A ferramenta final.', credits: 5000000, items: { fragmento_nucleo: 200, celula_negra: 30, nucleo_ia: 6 }, time: 120, req: ['extrator_manto', 'canhao'], certified: 12, lore: 36 });

export const RESEARCH: readonly ResearchDef[] = L;
export const RESEARCH_BY_KEY: Record<string, ResearchDef> = Object.fromEntries(L.map(x => [x.key, x]));
