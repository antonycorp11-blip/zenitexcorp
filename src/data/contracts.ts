// Modelos de contratos corporativos. O sistema escolhe itens conforme o progresso.
export type ContractKind = 'ship' | 'mine' | 'craft' | 'rare' | 'ruin' | 'rate' | 'explore';
export interface ContractTemplate {
  kind: ContractKind;
  title: string;      // {item} {n} {sector}
  flavor: string[];
  baseReward: number; // multiplicado pela escala
  minutes: number;
}

export const CONTRACT_TEMPLATES: ContractTemplate[] = [
  { kind: 'ship', title: 'Suprimento de {item}', baseReward: 1.6, minutes: 25, flavor: ['"Nossas análises indicam que você é bom em cavar buracos. Continue assim, é para isso que pagamos."', '"A demanda orbital está alta. A sua motivação deveria acompanhar."'] },
  { kind: 'ship', title: 'Demanda de {item}', baseReward: 1.5, minutes: 35, flavor: ['"Um cliente muito importante precisa disso. Todos os clientes são muito importantes. Alguns mais."'] },
  { kind: 'mine', title: 'Amostras de {item}', baseReward: 1.3, minutes: 30, flavor: ['"Extraia com suas próprias mãos. O cliente pediu autenticidade artesanal."'] },
  { kind: 'craft', title: 'Encomenda: {item}', baseReward: 1.8, minutes: 30, flavor: ['"Fabricação local reduz custos de frete. E aumenta os seus."'] },
  { kind: 'rare', title: 'Espécime Raro: {item}', baseReward: 3.5, minutes: 45, flavor: ['"Robôs não sabem extrair isso. Você sabe? Prove."', '"Colecionadores pagam bem por variantes raras. Você recebe parte disso. Uma parte."'] },
  { kind: 'ruin', title: 'Levantamento Arqueológico', baseReward: 2.5, minutes: 50, flavor: ['"O departamento de Patrimônio quer saber o que vai ser demolido antes de demolir. Burocracia."'] },
  { kind: 'rate', title: 'Meta de Produção', baseReward: 3, minutes: 40, flavor: ['"Aumente a taxa de extração. Por quê? Porque gráficos devem subir."'] },
  { kind: 'explore', title: 'Mapeamento de Caverna', baseReward: 1.2, minutes: 30, flavor: ['"Mapeie a área. Ou, como dizemos no marketing, \'descubra oportunidades\'."'] },
];
