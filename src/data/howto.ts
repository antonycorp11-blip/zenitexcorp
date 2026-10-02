import type { MachineDef } from './machines';
import { rawOf, compOf, RAW_BY_LAYER } from './composition';
import { REFINE_MAP } from './recipes';

/** Lado de uma saída: 0 = direita, 2 = esquerda (na orientação atual da máquina). */
export interface IOSpec {
  inTop: string[] | 'tudo' | null;     // o que entra pelo funil de cima
  outs: { side: 0 | 2 | 'down'; keys: string[]; label: string }[];
  base?: boolean;                        // liga direto no estoque quando está na base
}

/**
 * O que entra e o que sai de cada máquina, para desenhar setas/ícones no mundo e o diagrama "Como funciona".
 * `layer` define o material bruto e os minerais esperados.
 */
export function ioSpec(def: MachineDef, dir: number, layer: number): IOSpec {
  const right: 0 | 2 = dir === 2 ? 2 : 0, left: 0 | 2 = right === 0 ? 2 : 0;
  const raw = rawOf(layer), comp = compOf(layer);
  const minerals = comp.minerals.map(m => m.k);
  switch (def.behavior) {
    case 'drill': return { inTop: null, outs: [{ side: dir === 0 ? 2 : 0, keys: [raw], label: 'material bruto' }] };
    case 'complex': return { inTop: null, outs: [{ side: 2, keys: [raw], label: 'material bruto' }] };
    case 'storage': case 'link': case 'command': return { inTop: 'tudo', outs: [] };
    case 'terminal': case 'launchpad': return { inTop: ['bloco_massa', ...minerals], outs: [] };
    case 'separator': {
      const takes = Object.keys(def.takes ?? {});
      if (def.outMode === 'sieve') return { inTop: takes.length ? takes : [raw], outs: [{ side: 'down', keys: minerals, label: 'minerais' }, { side: right, keys: ['residuo'], label: 'resíduo' }] };
      return { inTop: takes.length ? takes : [raw], outs: [{ side: right, keys: [...minerals, 'residuo'], label: 'minerais + resíduo' }] };
    }
    case 'prep': return { inTop: Object.keys(def.takes ?? {}).filter(k => RAW_BY_LAYER.includes(k)).slice(0, 3), outs: [{ side: def.outMode === 'bottom' ? 'down' : right, keys: ['fragmentado'], label: 'fragmentado' }] };
    case 'compactor': return { inTop: ['residuo'], outs: [{ side: def.outMode === 'bottom' ? 'down' : right, keys: ['bloco_massa'], label: 'blocos' }], base: true };
    case 'filter': return def.pick ? { inTop: 'tudo', outs: [{ side: right, keys: def.pick.filter(k => minerals.includes(k) || k === comp.rare.k).slice(0, 3), label: def.key === 'ima' ? 'metálicos' : 'cristais' }, { side: 'down', keys: [], label: 'o resto' }] }
      : { inTop: 'tudo', outs: [{ side: 'down', keys: [], label: 'tipo escolhido' }, { side: right, keys: [], label: 'o resto' }] };
    case 'silo': return { inTop: minerals, outs: [{ side: right, keys: [], label: 'transborda' }] };
    case 'refinery': return { inTop: minerals, outs: [{ side: right, keys: minerals.map(k => REFINE_MAP[k]).filter(Boolean), label: 'barras' }] };
    case 'blower': return { inTop: null, outs: [{ side: right, keys: [], label: 'pilhas soltas' }] };
    case 'riser': return { inTop: 'tudo', outs: [{ side: right, keys: [], label: 'sai no topo' }] };
    case 'launcher': return { inTop: 'tudo', outs: [{ side: right, keys: [], label: 'arremesso' }] };
    default: return { inTop: null, outs: [] };
  }
}

/** Instrução curta e direta de como usar. */
export function howTo(def: MachineDef, layer: number): string {
  const raw = rawOf(layer);
  const rawName = raw === 'solo_k37' ? 'Solo K-37' : 'material bruto da camada';
  switch (def.behavior) {
    case 'drill': return 'Ponha no chão com a seta apontando para a terra. Ela cava sozinha e cospe o material bruto pela calha do lado oposto: ponha uma esteira embaixo da calha.';
    case 'belt': return 'Grãos que caem em cima andam no sentido da seta. Na ponta, caem no chão ou entram na máquina encostada (pela lateral ou pelo funil).';
    case 'blower': return 'Portátil. Ponha perto de onde você está cavando: ele aspira sozinho os grãos soltos no círculo e sopra pelo bocal (seta). Ligue um Tubo no bocal para levar até a Peneira. Pilha acabou? Toque nele e RECOLHA para levar a outra frente.';
    case 'tube': return def.key === 'reforcador' ? 'Repõe a pressão do tubo: a cada 14 tubos sem reforçador o fluxo para. Coloque no meio de linhas longas.' : 'Arraste para traçar o caminho (sobe primeiro, depois vai para o lado). O grão anda na seta e sai pela boca: em cima de um funil, entra na máquina. Linhas longas precisam de Reforçador a cada 14 tubos.';
    case 'riser': return 'Empilhe na vertical. O grão que entra embaixo (esteira encostada ou caindo em cima) sai no topo, para o lado da seta.';
    case 'launcher': return 'O grão que entra é arremessado em arco para o lado da seta. Use para pular buracos ou jogar dentro de um funil longe.';
    case 'storage': return 'O funil em cima engole TUDO o que cair dentro (esteira, soprar, perfuradora encostada) e manda para o Estoque Central.';
    case 'link': return 'Aumenta a vazão do armazém da base para o Estoque Central.';
    case 'command': return 'Toque nela para descarregar o aspirador. Também engole grãos soprados no funil.';
    case 'terminal': return 'Exporta os Blocos de Massa do estoque sozinho (é isso que remove o resíduo do planeta). Também aceita blocos jogados em cima.';
    case 'separator': return def.outMode === 'sieve' ? `Deixe ${rawName} CAIR em cima (elevador, lançador ou soprando). Os minerais passam pela grade e caem POR BAIXO — ponha um Coletor embaixo. O resíduo escorrega para o lado da seta — ponha uma Prensa ali.` : `Entra ${rawName} pelo funil ou pela lateral; tudo sai pela calha da seta.`;
    case 'prep': return 'A rocha cai por cima e sai fragmentada POR BAIXO: empilhe uma Peneira logo embaixo e a terra cai direto nela.';
    case 'compactor': return 'Resíduo cai por cima e vira Bloco de Massa. Perto da base, os blocos vão direto ao estoque (o Terminal exporta) e ela também puxa o resíduo do pátio sozinha.';
    case 'silo': return 'Deixe UM mineral cair no funil (o Ímã ou o Ressonador mandam pelo lado). As MELHORIAS da aba Fábrica, do perfurador e as pesquisas são pagas com o que está nos silos. Cheio ou tipo errado: transborda pelo lado da seta — encoste um Coletor ali.';
    case 'filter': if (def.pick) return def.key === 'ima' ? 'Ponha embaixo da Peneira. Os minerais caem nele: os METÁLICOS (Ferronox) são puxados para o lado da seta — ponha um Silo ali — e o resto cai por baixo (num Coletor ou no próximo separador).' : 'Os CRISTAIS (Lumenita) saltam para o lado da seta — ponha um Silo ali — e o resto cai por baixo. Empilhe embaixo de um Ímã para separar tudo.';
      return 'Grão que cai em cima: se for do tipo escolhido (toque na peça para escolher), passa e cai por baixo; o resto desvia para o lado da seta.';
    case 'scaffold': return 'Viga para subir a fábrica: você pisa nela, os grãos ficam em cima, e peças podem ser apoiadas nela.';
    case 'refinery': return 'Jogue minerais no funil: 2 kg viram 1 barra refinada, que vai para um armazém encostado.';
    case 'analyzer': return 'Toque E: escolha o material, dê o pulso de frequência e veja o que existe dentro. Processamento manual.';
    case 'dronepad': return 'O drone trabalha sozinho ao redor da estação e volta para recarregar.';
    case 'field': return 'Protege a área ao redor (e um pouco a camada inteira) contra o perigo indicado.';
    default: return def.desc;
  }
}
void compOf;
