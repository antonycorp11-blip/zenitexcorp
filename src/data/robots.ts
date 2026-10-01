// Robôs ajudam em escala, nunca substituem o jogador.
export type RobotKind = 'scout' | 'miner' | 'carry' | 'repair' | 'survey' | 'hazard' | 'loader';
export interface RobotDef {
  kind: RobotKind;
  name: string;
  desc: string;
  cost: Record<string, number>;
  research: string;
  speed: number;        // px/s
  capacity: number;     // kg
  energyUse: number;    // %/min
  wear: number;         // %/min
  color: [number, number, number];
  stats: [string, string][];
}

export const ROBOTS: RobotDef[] = [
  { kind: 'scout', name: 'Scout Bot', desc: 'Explora áreas sob névoa na zona designada. Não minera, não carrega, não reclama.', cost: { placa_ferronox: 6, celula_lumenita: 4, sensor: 1 }, research: 'robotica', speed: 70, capacity: 0, energyUse: 3, wear: 0.6, color: [255, 200, 80], stats: [['Velocidade', '70 px/s'], ['Raio de revelação', '6 tiles']] },
  { kind: 'carry', name: 'Robô Carregador', desc: 'Recolhe produção parada em máquinas e no chão e leva ao armazém mais próximo.', cost: { placa_ferronox: 8, motor: 1, celula_lumenita: 3 }, research: 'robotica', speed: 55, capacity: 60, energyUse: 4, wear: 0.5, color: [240, 150, 40], stats: [['Capacidade', '60 kg'], ['Velocidade', '55 px/s']] },
  { kind: 'miner', name: 'Drone Minerador', desc: 'Extrai minérios comuns expostos na zona e os entrega. Não consegue extrair variantes raras.', cost: { placa_ferronox: 10, motor: 1, broca: 1, celula_lumenita: 4 }, research: 'robo_minerador', speed: 45, capacity: 40, energyUse: 6, wear: 0.9, color: [255, 160, 40], stats: [['Capacidade', '40 kg'], ['Raio de extração', '3 células'], ['Consumo', '6%/min']] },
  { kind: 'repair', name: 'Robô de Reparo', desc: 'Mantém máquinas acima de 60%. Não resolve falhas críticas — isso continua sendo seu trabalho.', cost: { placa_ferronox: 8, sensor: 1, pecas: 4 }, research: 'robo_reparo', speed: 50, capacity: 0, energyUse: 4, wear: 0.4, color: [80, 200, 255], stats: [['Reparo', '6%/s'], ['Consome', 'Peças de Reposição']] },
  { kind: 'survey', name: 'Survey Bot', desc: 'Varre a zona e marca depósitos e ruínas no mapa.', cost: { chip_nexolita: 2, sensor: 2, celula_lumenita: 4 }, research: 'robo_survey', speed: 60, capacity: 0, energyUse: 3, wear: 0.4, color: [170, 100, 255], stats: [['Detecção', '10 tiles']] },
  { kind: 'hazard', name: 'Hazard Bot', desc: 'Projeta um campo que reduz o perigo ambiental onde estiver estacionado.', cost: { filtro: 2, gel_crysalis: 2, placa_ferronox: 8 }, research: 'robo_hazard', speed: 40, capacity: 0, energyUse: 5, wear: 0.6, color: [120, 255, 140], stats: [['Redução', '-35 de perigo'], ['Raio', '8 tiles']] },
  { kind: 'loader', name: 'Loader Bot', desc: 'Opera elevadores e terminais orbitais: +20% de vazão por robô na estrutura (máx. 3).', cost: { motor: 2, circuito: 1, placa_ferronox: 10 }, research: 'robo_loader', speed: 50, capacity: 0, energyUse: 4, wear: 0.7, color: [255, 220, 120], stats: [['Bônus de vazão', '+20%']] },
];
export const ROBOT: Record<string, RobotDef> = Object.fromEntries(ROBOTS.map(r => [r.kind, r]));
