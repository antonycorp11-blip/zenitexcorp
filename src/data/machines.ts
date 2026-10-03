import type { HazardKey } from './sectors';

export type MachineCat = 'logistica' | 'extracao' | 'processamento' | 'energia' | 'base' | 'estabilizacao' | 'mega' | 'drones';
export type Behavior =
  | 'belt' | 'splitter' | 'storage' | 'link' | 'lift' | 'terminal' | 'launchpad'
  | 'drill' | 'pump' | 'complex' | 'tectonic' | 'mantle' | 'cannon' | 'cutter' | 'collector' | 'orbital'
  | 'crusher' | 'purifier' | 'refinery' | 'foundry' | 'synth'
  | 'analyzer' | 'separator' | 'prep' | 'compactor' | 'riser' | 'launcher' | 'filter' | 'scaffold' | 'blower' | 'tube' | 'silo' | 'extractor' | 'ship'
  | 'generator' | 'reactor'
  | 'command' | 'workshop' | 'lab' | 'robotics' | 'archaeo' | 'logcenter'
  | 'field' | 'lamp' | 'support' | 'platform' | 'surge' | 'dronepad';
export type Look = 'belt' | 'splitter' | 'crate' | 'silo' | 'lift' | 'terminal' | 'pad' | 'drill' | 'pump' | 'complex' | 'mega' | 'cannon'
  | 'crusher' | 'refinery' | 'foundry' | 'tank' | 'generator' | 'reactor' | 'capsule' | 'bench' | 'lab' | 'robotics' | 'dish' | 'lamp' | 'support' | 'platform' | 'field';

export interface MachineDef {
  key: string;
  name: string;
  cat: MachineCat;
  behavior: Behavior;
  look: Look;
  w: number; h: number;          // em tiles de 16px
  cost: Record<string, number>;
  power: number;                 // kW (+ gera, - consome)
  desc: string;
  research?: string;             // pesquisa que desbloqueia
  rotatable?: boolean;
  wear?: number;                 // % de condição perdida por minuto trabalhando
  heat?: number;                 // calor adicionado ao setor
  speed?: number;                // belts: tiles/s; processos: ciclos/s; drills: potência
  capacity?: number;             // armazenamento (kg) / throughput (kg/min)
  radius?: number;               // em tiles (efeitos de área)
  field?: { hazard: HazardKey; amount: number; sectorWide?: number };
  glow?: [number, number, number];
  tier?: number;                 // drills: nível de rocha que conseguem perfurar
  fuel?: { item: string; perMin: number };
  unique?: boolean;              // um por setor
  onLiquid?: boolean;            // só pode ser posto sobre líquido/abismo
  phase9?: boolean;              // exige setor certificado
  sector12?: boolean;
  robot?: string;                // estações de drone: tipo de robô que a estação mantém
  hidden?: boolean;              // fora do jogo atual (mantido só para saves antigos)
  takes?: Record<string, number>; // processamento: material aceito → fator de aproveitamento (1 = ideal)
  minLayer?: number;             // aparece no menu a partir desta camada
  /** geometria da saída: lateral (calha da seta), por baixo, ou peneira (minerais por baixo, resíduo pela lateral) */
  outMode?: 'side' | 'bottom' | 'sieve';
  /** separador fixo: estes grãos são puxados para o lado da seta; o resto cai por baixo */
  pick?: string[];
  /** esteira vazada: os grãos caem pelos furos na máquina logo abaixo (se ela aceitar); o resto segue */
  leaky?: boolean;
}

const D: MachineDef[] = [];
const m = (d: MachineDef) => D.push(d);

// ---------------- LOGÍSTICA ----------------
m({ key: 'esteira', name: 'Esteira Mk I', cat: 'logistica', behavior: 'belt', look: 'belt', w: 1, h: 1, rotatable: true, cost: { ferronox: 2 }, power: 0, speed: 1.4, wear: 0.02, desc: 'Leva grãos para a direita ou esquerda. Arraste no sentido desejado; GIRAR/R inverte a direção, inclusive de uma linha pronta.' });
m({ key: 'esteira_vazada', name: 'Esteira Vazada', cat: 'logistica', behavior: 'belt', look: 'belt', w: 1, h: 1, rotatable: true, leaky: true, cost: { ferronox: 4 }, power: 0, speed: 1.4, wear: 0.02, desc: 'Esteira com furos: ponha POR CIMA de uma fileira de Incineradores. A terra cai pelos furos no Incinerador logo abaixo; se ele estiver cheio, segue para o próximo. Assim todos recebem, e o que sobrar acumula na ponta.' });
m({ key: 'esteira2', name: 'Esteira Mk II', cat: 'logistica', behavior: 'belt', look: 'belt', w: 1, h: 1, rotatable: true, cost: { placa_ferronox: 1, ferronox: 1 }, power: 0, speed: 2.8, wear: 0.02, research: 'esteira2', desc: 'Dobro da velocidade. Dobro dos gargalos em outros lugares.' });
m({ key: 'esteira3', name: 'Esteira Mk III', cat: 'logistica', behavior: 'belt', look: 'belt', w: 1, h: 1, rotatable: true, cost: { placa_ferronox: 1, polimero_solvex: 1 }, power: 0, speed: 5.5, wear: 0.02, research: 'esteira3', desc: 'Transporte de alta vazão.' });
m({ key: 'tubo', name: 'Tubo de Vácuo', cat: 'logistica', behavior: 'tube', look: 'belt', w: 1, h: 1, rotatable: true, cost: { ferronox: 2 }, power: 0, speed: 6, desc: 'Pode ser instalado dentro de grãos soltos. Aspira o entorno e leva material em qualquer direção, inclusive para cima, sem limite de distância.' });
m({ key: 'tubo_gigante', name: 'Tubo de Vácuo Gigante', cat: 'logistica', behavior: 'tube', look: 'belt', w: 1, h: 1, rotatable: true, cost: { ferronox: 8, lumenita: 3 }, power: 0, speed: 18, desc: 'Aspira uma área maior e transporta até 3 grãos por ciclo. Ideal para trazer material do fundo até a superfície.' });
m({ key: 'reforcador', name: 'Reforçador de Vazão', cat: 'logistica', behavior: 'tube', look: 'belt', w: 1, h: 1, rotatable: true, cost: { ferronox: 10, lumenita: 4 }, power: 0, speed: 6, desc: 'Peça opcional que transporta até 2 grãos por ciclo. Nenhuma linha precisa de reforçador para funcionar.' });
m({ key: 'piso_orbital', name: 'Plataforma Orbital', cat: 'base', behavior: 'scaffold', look: 'platform', w: 1, h: 1, cost: { ferronox: 3 }, power: 0, desc: 'Piso de liga orbital: se sustenta SOZINHO, mesmo sem terra embaixo. Você, os grãos e qualquer máquina ficam em cima. É a base de tudo: a cápsula de comando só pousa numa plataforma de 6+ peças.' });
m({ key: 'plataforma_metal', name: 'Plataforma', cat: 'logistica', behavior: 'scaffold', look: 'platform', w: 1, h: 1, cost: { ferronox: 1 }, power: 0, desc: 'Viga de 1 tile: você pisa em cima e os grãos também. Use para subir a fábrica e apoiar peças no alto.' });
m({ key: 'elevador_grao', name: 'Elevador de Grãos', cat: 'logistica', behavior: 'riser', look: 'lift', w: 1, h: 1, rotatable: true, cost: { ferronox: 4, lumenita: 1 }, power: 0, desc: 'Leva grãos do fundo até a superfície. Arraste uma coluna vertical contínua; alimente a peça de baixo com uma esteira e ligue a saída no topo a outra esteira ou coletor.' });
m({ key: 'lancador_grao', name: 'Lançador de Grãos', cat: 'logistica', behavior: 'launcher', look: 'lift', w: 1, h: 1, rotatable: true, cost: { ferronox: 8, lumenita: 4 }, power: 0, desc: 'Grão que entra (por esteira ou caindo em cima) é arremessado em arco para o lado da seta. Atravessa buracos e alimenta funis de longe.' });
m({ key: 'separador', name: 'Desviador', cat: 'logistica', behavior: 'splitter', look: 'splitter', w: 1, h: 1, rotatable: true, cost: { ferronox: 6, lumenita: 4 }, power: -1, speed: 6, desc: 'Bifurca a esteira. Com filtro: o item escolhido segue em frente, o resto sai pelas laterais. Sem filtro: divide igualmente.' });
m({ key: 'armazem', name: 'Coletor', cat: 'logistica', behavior: 'storage', look: 'crate', w: 2, h: 2, cost: { ferronox: 30, lumenita: 8 }, power: 0, capacity: 2500, desc: 'Só na base. Recebe material das esteiras e o envia ao Estoque Central. Cada armazém amplia o pátio de resíduo em 1.000 kg.' });
m({ key: 'armazem_grande', name: 'Silo Industrial', cat: 'logistica', behavior: 'storage', look: 'silo', w: 3, h: 3, cost: { placa_ferronox: 30, componente: 8 }, power: 0, capacity: 30000, research: 'silos', desc: 'Buffer setorial de grande capacidade.' });
m({ key: 'elevador_carga', name: 'Elevador de Carga', cat: 'logistica', behavior: 'link', look: 'lift', w: 2, h: 2, cost: { ferronox: 50, lumenita: 25 }, power: -6, capacity: 1500, wear: 0.15, desc: '+1.500 kg/min de minério dos armazéns para o Estoque Central.' });
m({ key: 'elevador_industrial', name: 'Elevador Industrial', cat: 'logistica', behavior: 'link', look: 'lift', w: 3, h: 3, cost: { componente: 16, motor: 6, placa_ferronox: 20 }, power: -25, capacity: 6000, wear: 0.15, research: 'elev_industrial', desc: '6.000 kg/min de vazão setorial.' });
m({ key: 'elevador_profundo', name: 'Elevador Profundo', cat: 'logistica', behavior: 'link', look: 'lift', w: 3, h: 3, cost: { liga_termo: 16, motor: 12, circuito: 4 }, power: -80, capacity: 40000, wear: 0.15, research: 'elev_profundo', desc: '40.000 kg/min. Atravessa o manto.' });
m({ key: 'elevador_planetario', name: 'Elevador Planetário', cat: 'logistica', behavior: 'link', look: 'lift', w: 4, h: 4, cost: { liga_ancestral: 6, nucleo_sinaptico: 16, circuito: 16 }, power: -300, capacity: 300000, wear: 0.1, research: 'elev_planetario', desc: '300.000 kg/min. Conecta camadas planetárias inteiras.' });
m({ key: 'elevador_pessoal', name: 'Elevador Pessoal', cat: 'logistica', behavior: 'lift', look: 'lift', w: 1, h: 1, cost: { ferronox: 25, lumenita: 15 }, power: -2, research: 'elev_pessoal', desc: 'Rede de transporte pessoal. Viaje entre elevadores pessoais.' });
m({ key: 'terminal_orbital', name: 'Terminal Orbital', cat: 'logistica', behavior: 'terminal', look: 'terminal', w: 3, h: 3, cost: { ferronox: 80, lumenita: 60 }, power: -10, capacity: 400, wear: 0.05, desc: 'Exporta Blocos de Massa Planetária (3.000 kg/min) — é assim que o resíduo sai do planeta. Também vende itens do estoque (400 kg/min).' });
m({ key: 'plataforma_lancamento', name: 'Plataforma de Lançamento', cat: 'logistica', behavior: 'launchpad', look: 'pad', w: 4, h: 4, cost: { placa_ferronox: 60, motor: 10, pyroxis_estabilizado: 20 }, power: -40, capacity: 5000, wear: 0.1, research: 'lancamento', desc: '+5.000 kg/min de venda e +30.000 kg/min de exportação de blocos.' });

// ---------------- EXTRAÇÃO ----------------
m({ key: 'soprador', name: 'Soprador Automático', cat: 'extracao', behavior: 'blower', look: 'pump', w: 1, h: 1, rotatable: true, cost: { ferronox: 20, lumenita: 10 }, power: 0, capacity: 900, radius: 7, wear: 0.3, glow: [120, 220, 255], desc: 'Portátil: você coloca e RECOLHE quando a frente acaba. Aspira as pilhas soltas num raio de 7 tiles e sopra para o tubo encostado no lado da seta (sem tubo, sopra no ar). Cave perto dele.' });
m({ key: 'perfuradora', name: 'Perfuradora Mk I', cat: 'extracao', behavior: 'drill', look: 'drill', w: 2, h: 2, rotatable: true, cost: { ferronox: 30, lumenita: 15 }, power: -8, speed: 1, tier: 2, wear: 1.2, heat: 1, glow: [255, 170, 60], desc: 'Perfura o terreno à frente e despeja material bruto da camada. Regiões de teor alto rendem mais minerais depois do processamento.' });
m({ key: 'perfuradora2', name: 'Perfuradora Mk II', cat: 'extracao', behavior: 'drill', look: 'drill', w: 2, h: 2, rotatable: true, cost: { placa_ferronox: 16, broca: 2, motor: 2 }, power: -25, speed: 2.6, tier: 4, wear: 1.0, heat: 3, glow: [255, 170, 60], research: 'perfuradora2', desc: 'Perfuração pesada. Alcance maior.' });
m({ key: 'perfuradora3', name: 'Perfuradora Mk III', cat: 'extracao', behavior: 'drill', look: 'drill', w: 2, h: 2, rotatable: true, cost: { liga_termo: 8, broca: 4, circuito: 2 }, power: -70, speed: 6, tier: 6, wear: 0.8, heat: 6, glow: [255, 120, 60], research: 'perfuradora3', desc: 'Atravessa rocha hiperdensa.' });
m({ key: 'bomba', name: 'Bomba de Drenagem', cat: 'extracao', behavior: 'pump', look: 'pump', w: 2, h: 2, cost: { placa_ferronox: 8, motor: 2 }, power: -12, radius: 7, wear: 0.8, research: 'bomba', glow: [80, 200, 255], desc: 'Drena líquidos ao redor. Lagoas corrosivas rendem Solvex.' });
m({ key: 'complexo', name: 'Complexo de Extração', cat: 'extracao', behavior: 'complex', look: 'complex', w: 4, h: 4, cost: { placa_ferronox: 60, motor: 8, componente: 16, celula_lumenita: 16 }, power: -60, wear: 0.6, heat: 8, research: 'complexo1', glow: [255, 160, 50], desc: 'Extrai a camada em escala industrial. Melhorável até Mk V. Perde calibração com o tempo: recalibre à mão.' });
m({ key: 'broca_tectonica', name: 'Broca Tectônica', cat: 'mega', behavior: 'tectonic', look: 'mega', w: 5, h: 5, cost: { liga_termo: 60, liga_ancestral: 8, motor: 40, circuito: 20 }, power: -1200, wear: 0.5, heat: 30, research: 'tectonica', glow: [255, 90, 30], desc: 'Perfura o manto do setor. Única forma de passar da crosta.' });
m({ key: 'extrator_manto', name: 'Extrator de Manto', cat: 'mega', behavior: 'mantle', look: 'mega', w: 5, h: 5, cost: { liga_ancestral: 20, celula_negra: 10, motor: 60, nucleo_ia: 4 }, power: -3000, wear: 0.5, heat: 40, research: 'extrator_manto', glow: [255, 60, 160], desc: 'Bombeia o manto planetário em escala continental.' });
m({ key: 'uplink_orbital', name: 'Uplink de Plataforma Orbital', cat: 'mega', behavior: 'orbital', look: 'dish', w: 4, h: 4, cost: { nucleo_sinaptico: 30, circuito: 30, liga_termo: 30 }, power: -500, wear: 0.3, research: 'plataformas_orbitais', glow: [120, 200, 255], desc: 'Coordena plataformas em órbita: +50% em toda extração de manto (máx. 3).' });
m({ key: 'canhao_materia', name: 'Canhão de Matéria', cat: 'mega', behavior: 'cannon', look: 'cannon', w: 4, h: 4, cost: { celula_negra: 20, liga_ancestral: 12, nucleo_ia: 4 }, power: -2000, wear: 0, research: 'canhao', glow: [255, 80, 255], desc: 'Disparado MANUALMENTE pelo mapa orbital. Cada disparo arranca um pedaço de setor.' });
m({ key: 'coletor_gravitacional', name: 'Coletor Gravitacional', cat: 'mega', behavior: 'collector', look: 'dish', w: 4, h: 4, cost: { celula_negra: 16, nucleo_sinaptico: 30, liga_ancestral: 10 }, power: -1500, wear: 0.6, research: 'coletor', glow: [200, 120, 255], desc: 'Recolhe fragmentos orbitais. Precisa de resintonia manual frequente.' });
m({ key: 'cortador_planetario', name: 'Cortador Planetário', cat: 'mega', behavior: 'cutter', look: 'cannon', w: 6, h: 6, cost: { liga_ancestral: 40, celula_negra: 40, nucleo_ia: 12, fragmento_nucleo: 120 }, power: -8000, research: 'cortador', sector12: true, unique: true, glow: [255, 220, 120], desc: 'A ferramenta final. Opera o último 1%.' });

// ---------------- PROCESSAMENTO DA MASSA PLANETÁRIA ----------------
// bruto → (preparo) → separação → minerais + resíduo → Compactador → blocos → Terminal Orbital
m({ key: 'analisador', name: 'Analisador de Matriz Zenitex', cat: 'processamento', behavior: 'analyzer', look: 'lab', w: 2, h: 2, cost: { ferronox: 999 }, power: 0, unique: true, glow: [80, 200, 255], desc: 'Processamento MANUAL. Coloque material bruto, sintonize a frequência e veja o que existe dentro do planeta.' });
// Fábrica VERTICAL (por gravidade): o material cai por cima, é processado e sai por baixo ou pela lateral.
m({ key: 'peneira', name: 'Peneira de Ressonância', cat: 'processamento', behavior: 'separator', outMode: 'sieve', look: 'tank', w: 2, h: 1, rotatable: true, cost: { ferronox: 25, lumenita: 12 }, power: 0, capacity: 600, wear: 0.4, takes: { solo_k37: 1, fragmentado: 1 }, glow: [120, 220, 255], desc: 'O material bruto cai em cima: os MINERAIS passam pela grade e caem por baixo; o RESÍDUO escorrega para o lado da seta. 600 kg/min.' });
m({ key: 'compactador', name: 'Incinerador', cat: 'processamento', behavior: 'compactor', outMode: 'bottom', look: 'generator', w: 1, h: 2, cost: { ferronox: 25, lumenita: 8 }, power: 0, capacity: 900, wear: 0.4, glow: [255, 170, 60], desc: 'QUEIMA a terra e o resíduo que chegam nele (pela esteira, por tubo ou caindo no funil). Tudo que é queimado sai do planeta e enche a barra da CAMADA. Na base, também queima sozinho o resíduo do estoque.' });
m({ key: 'ima', name: 'Ímã Extrator', cat: 'processamento', behavior: 'extractor', look: 'splitter', w: 2, h: 1, cost: { ferronox: 20, lumenita: 6 }, power: 0, pick: ['ferronox', 'ferronox_denso', 'umbrium', 'pyroxis'], glow: [255, 90, 70], desc: 'Fica POR CIMA de uma esteira (1 espaço livre entre eles). Puxa o METAL da terra que passa embaixo e manda para o Tubo de Vácuo encostado nele. Leve o tubo até um Silo, um Coletor ou a Refinaria.' });
m({ key: 'ressonador', name: 'Ressonador Extrator', cat: 'processamento', behavior: 'extractor', look: 'splitter', w: 2, h: 1, cost: { ferronox: 20, lumenita: 14 }, power: 0, pick: ['lumenita', 'lumenita_pura', 'lumenita_instavel', 'crysalis', 'nexolita', 'nexolita_condensada', 'necrocristal', 'solvex', 'fragmento_nucleo', 'pyroxis_volatil'], glow: [90, 200, 255], desc: 'Fica POR CIMA de uma esteira (1 espaço livre). Faz os CRISTAIS da terra que passa embaixo saltarem para ele e manda para o Tubo de Vácuo encostado. Leve o tubo até um Silo, um Coletor ou onde quiser.' });
m({ key: 'silo', name: 'Silo', cat: 'logistica', behavior: 'silo', look: 'silo', w: 2, h: 2, hidden: true, rotatable: true, cost: { ferronox: 24 }, power: 0, capacity: 150, desc: 'Guarda UM tipo de mineral (o primeiro que cair, ou o escolhido no cartão). As MELHORIAS são pagas com o que está nos silos. Cheio, transborda pelo lado da seta.' });
m({ key: 'filtro', name: 'Filtro', cat: 'processamento', behavior: 'filter', look: 'splitter', w: 1, h: 1, rotatable: true, cost: { ferronox: 6, lumenita: 4 }, power: 0, desc: 'O grão do tipo escolhido passa direto e cai por baixo; todo o resto desvia para o lado da seta. Escolha o tipo no cartão da peça.' });
m({ key: 'triturador', name: 'Britador', cat: 'processamento', behavior: 'prep', outMode: 'bottom', look: 'crusher', w: 2, h: 2, rotatable: true, cost: { ferronox: 60, lumenita: 20 }, power: 0, capacity: 900, wear: 0.6, minLayer: 2, takes: { rocha_bruta: 1, matriz_cristalina: 0.55 }, glow: [255, 170, 60], desc: 'Rocha cai por cima, sai Material Fragmentado por baixo — direto numa Peneira empilhada embaixo. 900 kg/min. Quebra cristais (−45%).' });
m({ key: 'triturador_pesado', name: 'Britador Pesado', cat: 'processamento', behavior: 'prep', outMode: 'bottom', look: 'crusher', w: 2, h: 2, rotatable: true, cost: { placa_ferronox: 20, pyroxis: 40 }, power: 0, capacity: 1800, wear: 0.6, minLayer: 3, takes: { basalto_bruto: 1, rocha_bruta: 1, matriz_profunda: 1, matriz_cristalina: 0.55, rocha_manto: 0.7 }, glow: [255, 110, 50], desc: 'Basalto e rochas densas caem por cima, saem fragmentados por baixo. 1.800 kg/min.' });
m({ key: 'fragmentador', name: 'Fragmentador Controlado', cat: 'processamento', behavior: 'prep', outMode: 'bottom', look: 'tank', w: 2, h: 2, rotatable: true, cost: { placa_ferronox: 20, gel_crysalis: 10 }, power: 0, capacity: 1500, wear: 0.5, minLayer: 4, takes: { matriz_cristalina: 1, rocha_bruta: 1 }, glow: [150, 230, 255], desc: 'Abre a Matriz Cristalina sem destruir os raros: entra por cima, sai por baixo. 1.500 kg/min.' });
m({ key: 'descompressor', name: 'Descompressor de Manto', cat: 'processamento', behavior: 'prep', outMode: 'bottom', look: 'reactor', w: 2, h: 2, rotatable: true, cost: { liga_termo: 12, umbrium: 20 }, power: 0, capacity: 3000, wear: 0.5, minLayer: 5, takes: { rocha_manto: 1, matriz_profunda: 1 }, glow: [190, 120, 255], desc: 'Alivia a pressão da Rocha de Manto: entra por cima, sai por baixo. 3.000 kg/min.' });
m({ key: 'peneira_pesada', name: 'Peneira Gravitacional', cat: 'processamento', behavior: 'separator', outMode: 'sieve', look: 'foundry', w: 3, h: 1, rotatable: true, cost: { liga_termo: 20, necrocristal: 40 }, power: 0, capacity: 4000, wear: 0.4, minLayer: 5, takes: { fragmentado: 1, solo_k37: 1 }, glow: [200, 120, 255], desc: 'Peneira em escala de camada: minerais por baixo, resíduo pela lateral. 4.000 kg/min.' });
m({ key: 'desintegrador', name: 'Desintegrador de Matéria', cat: 'processamento', behavior: 'prep', outMode: 'bottom', look: 'reactor', w: 2, h: 2, rotatable: true, cost: { matriz_umbrium: 8, liga_termo: 30 }, power: 0, capacity: 8000, wear: 0.5, minLayer: 7, takes: { materia_nucleo: 1, matriz_profunda: 1, rocha_manto: 1 }, glow: [255, 200, 110], desc: 'A única coisa que abre Matéria de Núcleo: entra por cima, sai por baixo. 8.000 kg/min.' });
// antigos (só para saves)
m({ key: 'processador_solo', name: 'Processador de Solo', cat: 'processamento', behavior: 'separator', look: 'tank', w: 2, h: 2, rotatable: true, cost: { ferronox: 40, lumenita: 20 }, power: 0, capacity: 600, takes: { solo_k37: 1 }, hidden: true, desc: 'Substituído pela Peneira.' });
m({ key: 'separador_mineral', name: 'Separador Mineral', cat: 'processamento', behavior: 'separator', look: 'foundry', w: 3, h: 3, rotatable: true, cost: { ferronox: 80 }, power: 0, capacity: 1200, takes: { fragmentado: 1 }, hidden: true, desc: 'Substituído pela Peneira.' });
m({ key: 'refinaria', name: 'Refinaria', cat: 'processamento', behavior: 'refinery', look: 'refinery', w: 3, h: 3, rotatable: true, cost: { ferronox: 50, lumenita: 30 }, power: -15, speed: 3, wear: 0.6, heat: 2, research: 'refino', glow: [255, 140, 50], desc: '2 kg de mineral separado → 1 barra refinada.' });
m({ key: 'purificador', name: 'Purificador', cat: 'processamento', behavior: 'purifier', look: 'tank', w: 2, h: 2, cost: { placa_ferronox: 12, celula_lumenita: 6 }, power: -20, speed: 1, wear: 0.6, research: 'purificador', glow: [120, 255, 230], desc: 'Estabiliza variantes raras em refinados de alto rendimento.' });
m({ key: 'fundidor', name: 'Fundidor Alienígena', cat: 'processamento', behavior: 'foundry', look: 'foundry', w: 3, h: 3, cost: { placa_ferronox: 30, chip_nexolita: 6, artefato: 2 }, power: -50, speed: 1.2, wear: 0.5, heat: 6, research: 'fundidor', glow: [80, 240, 255], desc: 'Combina materiais complementares. Projeto baseado em ruínas de Khelos.' });
m({ key: 'sintetizador', name: 'Sintetizador', cat: 'processamento', behavior: 'synth', look: 'refinery', w: 3, h: 3, cost: { placa_ferronox: 30, motor: 4, chip_nexolita: 4 }, power: -40, speed: 1, wear: 0.5, research: 'sintetizador', glow: [190, 120, 255], desc: 'Fabrica componentes automaticamente a partir da esteira.' });

// ---------------- ENERGIA ----------------
m({ key: 'gerador', name: 'Gerador Básico', cat: 'energia', behavior: 'generator', look: 'generator', w: 2, h: 2, cost: { ferronox: 20, lumenita: 12 }, power: 20, wear: 0.2, glow: [255, 200, 80], desc: '+20 kW. Sem combustível. Sem ambição.' });
m({ key: 'reator_lumenita', name: 'Reator de Lumenita', cat: 'energia', behavior: 'reactor', look: 'reactor', w: 3, h: 3, cost: { placa_ferronox: 20, celula_lumenita: 10 }, power: 140, fuel: { item: 'lumenita', perMin: 30 }, wear: 0.3, heat: 4, research: 'reator_lumenita', glow: [80, 160, 255], desc: '+140 kW. Consome Lumenita do Estoque Central.' });
m({ key: 'reator_pyroxis', name: 'Reator Pyroxis', cat: 'energia', behavior: 'reactor', look: 'reactor', w: 3, h: 3, cost: { placa_ferronox: 30, pyroxis_estabilizado: 12, motor: 2 }, power: 600, fuel: { item: 'pyroxis', perMin: 30 }, wear: 0.4, heat: 30, research: 'reator_pyroxis', glow: [255, 80, 40], desc: '+600 kW. Aquece MUITO o setor.' });
m({ key: 'reator_hibrido', name: 'Reator Híbrido', cat: 'energia', behavior: 'reactor', look: 'reactor', w: 3, h: 3, cost: { liga_termo: 16, refrigerante_bio: 8, circuito: 4 }, power: 2500, fuel: { item: 'celula_lumenita', perMin: 12 }, wear: 0.3, heat: 10, research: 'reator_hibrido', glow: [120, 255, 200], desc: '+2.500 kW. Refrigerado biologicamente.' });
m({ key: 'receptor_orbital', name: 'Receptor de Energia Orbital', cat: 'energia', behavior: 'generator', look: 'dish', w: 3, h: 3, cost: { nucleo_sinaptico: 12, placa_ferronox: 40, circuito: 6 }, power: 4000, wear: 0.2, research: 'energia_orbital', glow: [255, 230, 120], desc: '+4.000 kW transmitidos da órbita.' });
m({ key: 'nucleo_alienigena', name: 'Núcleo Alienígena', cat: 'energia', behavior: 'generator', look: 'reactor', w: 3, h: 3, cost: { liga_ancestral: 10, cristal_memoria: 20, celula_negra: 4 }, power: 20000, wear: 0.1, research: 'nucleo_alien', glow: [80, 255, 240], desc: '+20.000 kW. Ele funciona. Ninguém sabe exatamente com o quê.' });

// ---------------- BASE ----------------
m({ key: 'nave', name: 'Nave Zenitex', cat: 'base', behavior: 'ship', look: 'capsule', w: 14, h: 4, cost: { ferronox: 999 }, power: 0, unique: true, hidden: true, glow: [255, 170, 60], desc: 'A nave de carga em órbita. Só o que chega aqui SAI DO PLANETA: leve os minérios (Ferronox, Lumenita…) até a porta de carga embaixo dela com um Tubo de Vácuo. Cada kg entregue enche a barra da camada e vira créditos.' });
m({ key: 'comando', name: 'Centro de Comando', cat: 'base', behavior: 'command', look: 'capsule', w: 3, h: 3, cost: { ferronox: 999 }, power: 15, capacity: 1200, unique: true, glow: [255, 170, 60], desc: 'Cápsula de pouso. Recebe a mochila e envia o minério dos armazéns ao Estoque Central (1.200 kg/min).' });
m({ key: 'oficina', name: 'Oficina', cat: 'base', behavior: 'workshop', look: 'bench', w: 3, h: 2, cost: { ferronox: 25, lumenita: 10 }, power: -3, glow: [255, 180, 80], desc: 'Fabricação manual de componentes e equipamentos.' });
m({ key: 'laboratorio', name: 'Estação de Pesquisa', cat: 'base', behavior: 'lab', look: 'lab', w: 3, h: 3, cost: { ferronox: 40, lumenita: 40 }, power: -10, glow: [80, 180, 255], desc: 'Habilita a árvore de pesquisa.' });
m({ key: 'centro_robotico', name: 'Centro Robótico', cat: 'base', behavior: 'robotics', look: 'robotics', w: 3, h: 3, cost: { placa_ferronox: 20, celula_lumenita: 10, motor: 2 }, power: -20, research: 'robotica', radius: 30, glow: [255, 170, 60], desc: 'Constrói, recarrega e reprograma robôs.' });
m({ key: 'centro_arqueologico', name: 'Centro Arqueológico', cat: 'base', behavior: 'archaeo', look: 'lab', w: 3, h: 3, cost: { placa_ferronox: 20, sensor: 4 }, power: -8, research: 'arqueologia', glow: [60, 230, 240], desc: 'Analisa achados de Khelos. Cada descoberta reduz custos de pesquisa alienígena.' });
m({ key: 'central_logistica', name: 'Central Logística', cat: 'base', behavior: 'logcenter', look: 'terminal', w: 3, h: 3, cost: { circuito: 6, placa_ferronox: 30, sensor: 4 }, power: -30, research: 'central_logistica', unique: true, glow: [120, 220, 255], desc: '+25% vazão de todos os elevadores do planeta.' });

// ---------------- ESTABILIZAÇÃO / SEGURANÇA ----------------
m({ key: 'holofote', name: 'Holofote', cat: 'estabilizacao', behavior: 'lamp', look: 'lamp', w: 1, h: 1, cost: { ferronox: 3, lumenita: 2 }, power: -1, glow: [255, 190, 100], desc: 'Ilumina. Mantém o jogador psicologicamente produtivo.' });
m({ key: 'suporte', name: 'Suporte Estrutural', cat: 'estabilizacao', behavior: 'support', look: 'support', w: 1, h: 1, cost: { ferronox: 10 }, power: 0, radius: 9, desc: 'Previne desabamentos num raio de 9 tiles.' });
m({ key: 'plataforma', name: 'Plataforma', cat: 'estabilizacao', behavior: 'platform', look: 'platform', w: 1, h: 1, cost: { ferronox: 6 }, power: 0, onLiquid: true, desc: 'Permite caminhar e construir sobre líquidos e abismos.' });
m({ key: 'refrigerador', name: 'Refrigerador', cat: 'estabilizacao', behavior: 'field', look: 'field', w: 2, h: 2, cost: { placa_ferronox: 6, celula_lumenita: 3, crysalis: 6 }, power: -10, radius: 10, field: { hazard: 'calor', amount: 45, sectorWide: 12 }, research: 'refrigeracao', glow: [120, 220, 255], desc: 'Reduz calor local e do setor.' });
m({ key: 'aquecedor', name: 'Aquecedor', cat: 'estabilizacao', behavior: 'field', look: 'field', w: 2, h: 2, cost: { placa_ferronox: 6, pyroxis: 20 }, power: -10, radius: 10, field: { hazard: 'frio', amount: 45, sectorWide: 12 }, research: 'aquecimento', glow: [255, 140, 60], desc: 'Combate o frio extremo.' });
m({ key: 'filtro_ar', name: 'Filtro de Ar', cat: 'estabilizacao', behavior: 'field', look: 'field', w: 2, h: 2, cost: { placa_ferronox: 4, verdanio: 20 }, power: -6, radius: 10, field: { hazard: 'toxico', amount: 50, sectorWide: 10 }, research: 'filtragem', glow: [100, 255, 120], desc: 'Filtra gases tóxicos e corrosivos.' });
m({ key: 'escudo_rad', name: 'Escudo de Radiação', cat: 'estabilizacao', behavior: 'field', look: 'field', w: 2, h: 2, cost: { placa_ferronox: 10, matriz_umbrium: 2 }, power: -25, radius: 11, field: { hazard: 'radiacao', amount: 50, sectorWide: 12 }, research: 'blindagem', glow: [255, 240, 80], desc: 'Absorve radiação com Umbrium.' });
m({ key: 'estabilizador', name: 'Estabilizador Gravitacional', cat: 'estabilizacao', behavior: 'field', look: 'field', w: 2, h: 2, cost: { placa_ferronox: 10, chip_nexolita: 4, celula_lumenita: 4 }, power: -30, radius: 12, field: { hazard: 'gravidade', amount: 60, sectorWide: 12 }, research: 'gravitacao', glow: [190, 120, 255], desc: 'Normaliza a gravidade local.' });
m({ key: 'inibidor', name: 'Inibidor de Crescimento', cat: 'estabilizacao', behavior: 'field', look: 'field', w: 2, h: 2, cost: { fibra_verdanio: 6, chip_nexolita: 4, solvex_refinado: 4 }, power: -20, radius: 14, field: { hazard: 'anomalia', amount: 30, sectorWide: 8 }, research: 'inibicao', glow: [200, 255, 220], desc: 'Impede que necrocristais cresçam de volta.' });
m({ key: 'protetor_surto', name: 'Protetor de Surto', cat: 'estabilizacao', behavior: 'surge', look: 'support', w: 1, h: 1, cost: { placa_ferronox: 2, celula_lumenita: 2 }, power: 0, radius: 12, research: 'surto', glow: [120, 200, 255], desc: 'Protege máquinas próximas contra picos energéticos.' });

// ---------------- DRONES (cada estação mantém um robô que trabalha ao redor dela) ----------------
m({ key: 'drone_coletor', name: 'Estação: Drone Coletor', cat: 'drones', behavior: 'dronepad', look: 'robotics', w: 2, h: 2, robot: 'carry', cost: { ferronox: 40, lumenita: 20 }, power: 0, research: 'robotica', glow: [255, 170, 60], desc: 'O drone recolhe minério parado em máquinas e no chão e leva ao armazém da base. Recarrega na estação.' });
m({ key: 'drone_minerador', name: 'Estação: Drone Minerador', cat: 'drones', behavior: 'dronepad', look: 'robotics', w: 2, h: 2, robot: 'miner', cost: { ferronox: 50, lumenita: 30 }, power: 0, research: 'robo_minerador', glow: [255, 160, 40], desc: 'O drone extrai minério comum exposto ao redor da estação (não extrai variantes raras).' });
m({ key: 'drone_reparo', name: 'Estação: Drone de Reparo', cat: 'drones', behavior: 'dronepad', look: 'robotics', w: 2, h: 2, robot: 'repair', cost: { ferronox: 40, lumenita: 30, pecas: 4 }, power: 0, research: 'robo_reparo', glow: [80, 200, 255], desc: 'Mantém máquinas próximas acima de 60%. Falhas críticas continuam sendo suas.' });
m({ key: 'drone_batedor', name: 'Estação: Drone Batedor', cat: 'drones', behavior: 'dronepad', look: 'robotics', w: 2, h: 2, robot: 'scout', cost: { ferronox: 30, lumenita: 20 }, power: 0, research: 'robotica', glow: [255, 200, 80], desc: 'Explora a névoa ao redor da estação e revela o mapa.' });
m({ key: 'drone_sonda', name: 'Estação: Drone Sonda', cat: 'drones', behavior: 'dronepad', look: 'robotics', w: 2, h: 2, robot: 'survey', cost: { ferronox: 40, nexolita: 20 }, power: 0, research: 'robo_survey', glow: [170, 100, 255], desc: 'Varre a área e marca depósitos e ruínas no mapa.' });
m({ key: 'drone_ambiental', name: 'Estação: Drone Ambiental', cat: 'drones', behavior: 'dronepad', look: 'robotics', w: 2, h: 2, robot: 'hazard', cost: { ferronox: 50, crysalis: 10, verdanio: 20 }, power: 0, research: 'robo_hazard', glow: [120, 255, 140], desc: 'Reduz calor, frio e toxinas ao redor da estação.' });
m({ key: 'drone_operador', name: 'Estação: Drone Operador', cat: 'drones', behavior: 'dronepad', look: 'robotics', w: 2, h: 2, robot: 'loader', cost: { ferronox: 60, motor: 2 }, power: 0, research: 'robo_loader', glow: [255, 220, 120], desc: 'Opera elevadores e terminais próximos: +20% de vazão.' });

// Fora da versão atual (sem rede de energia; pesquisa e fabricação não exigem prédio): mantidos só para saves antigos
for (const k of ['perfuradora', 'perfuradora2', 'perfuradora3', 'complexo', 'separador', 'elevador_pessoal', 'plataforma', 'gerador', 'reator_lumenita', 'reator_pyroxis', 'reator_hibrido', 'receptor_orbital', 'nucleo_alienigena', 'protetor_surto', 'laboratorio', 'oficina', 'centro_robotico']) {
  const d = D.find(x => x.key === k); if (d) d.hidden = true;
}

export const MACHINES: readonly MachineDef[] = D;
/** Vista lateral: só perfuradoras giram nas 4 direções; o resto vira para a esquerda/direita. */
export const nextDir = (def: MachineDef | undefined, dir: number) => def?.behavior === 'drill' || def?.behavior === 'tube' ? (dir + 1) % 4 : dir === 0 ? 2 : 0;
export const MACHINE: Record<string, MachineDef> = Object.fromEntries(D.map(d => [d.key, d]));
export const MACHINE_CATS: { key: MachineCat; name: string }[] = [
  { key: 'base', name: 'Base' }, { key: 'extracao', name: 'Extração' }, { key: 'logistica', name: 'Logística' }, { key: 'processamento', name: 'Processamento' },
  { key: 'drones', name: 'Drones' }, { key: 'estabilizacao', name: 'Segurança' }, { key: 'mega', name: 'Planetária' },
];

// Níveis do Complexo de Extração Profunda (t/min de reserva removida)
export const COMPLEX_LEVELS = [
  { name: 'Mk I', rate: 60, power: 60, cost: {} as Record<string, number>, research: '' },
  { name: 'Mk II', rate: 300, power: 160, cost: { motor: 12, placa_ferronox: 60, chip_nexolita: 8 }, research: 'complexo2' },
  { name: 'Mk III', rate: 1200, power: 450, cost: { liga_termo: 20, circuito: 8, refrigerante_bio: 6 }, research: 'complexo3' },
  { name: 'Mk IV', rate: 4000, power: 1200, cost: { liga_termo: 40, nucleo_sinaptico: 16, nucleo_ia: 1 }, research: 'complexo4' },
  { name: 'Mk V', rate: 12000, power: 3000, cost: { liga_ancestral: 8, celula_negra: 6, nucleo_ia: 3 }, research: 'complexo5' },
];
export const TECTONIC_RATE = 25000;      // unidades/min
export const MANTLE_RATE = 60000;
export const CANNON_SHOT_FRAC = 0.06;    // fração da meta da camada por disparo
export const CANNON_COOLDOWN = 45;
export const COLLECTOR_RATE = 20000;     // ativa a partir de 50% (fragmentos)
