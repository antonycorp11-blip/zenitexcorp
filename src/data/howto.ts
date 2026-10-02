import type { MachineDef } from './machines';
import { rawOf, compOf, RAW_BY_LAYER } from './composition';
import { REFINE_MAP } from './recipes';

/** Lado de uma saída: 0 = direita, 2 = esquerda (na orientação atual da máquina). */
export interface IOSpec {
  inTop: string[] | 'tudo' | null;     // o que entra pelo funil de cima
  outs: { side: 0 | 2; keys: string[]; label: string }[];
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
      return { inTop: takes.length ? takes : [raw], outs: [{ side: right, keys: [...minerals, 'residuo'], label: 'minerais + resíduo' }] };
    }
    case 'prep': return { inTop: Object.keys(def.takes ?? {}).filter(k => RAW_BY_LAYER.includes(k)).slice(0, 3), outs: [{ side: right, keys: ['fragmentado'], label: 'fragmentado' }] };
    case 'compactor': return { inTop: ['residuo'], outs: [{ side: right, keys: ['bloco_massa'], label: 'blocos' }], base: true };
    case 'refinery': return { inTop: minerals, outs: [{ side: right, keys: minerals.map(k => REFINE_MAP[k]).filter(Boolean), label: 'barras' }] };
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
    case 'riser': return 'Empilhe na vertical. O grão que entra embaixo (esteira encostada ou caindo em cima) sai no topo, para o lado da seta.';
    case 'launcher': return 'O grão que entra é arremessado em arco para o lado da seta. Use para pular buracos ou jogar dentro de um funil longe.';
    case 'storage': return 'O funil em cima engole TUDO o que cair dentro (esteira, soprar, perfuradora encostada) e manda para o Estoque Central.';
    case 'link': return 'Aumenta a vazão do armazém da base para o Estoque Central.';
    case 'command': return 'Toque E perto dela para entregar a mochila. Também engole grãos pelo funil.';
    case 'terminal': return 'Exporta os Blocos de Massa do estoque sozinho (é isso que remove o resíduo do planeta). Também aceita blocos jogados em cima.';
    case 'separator': return `Entra ${rawName} pelo funil ou por uma esteira encostada na lateral. Minerais e resíduo saem juntos pela calha do lado da seta: ponha ali uma esteira até o Armazém.`;
    case 'prep': return 'Entra material bruto pelo funil ou pela lateral. Sai Material Fragmentado pela calha da seta: leve por esteira até um Separador Mineral.';
    case 'compactor': return 'Construa colado na base: ele puxa sozinho o resíduo que chega ao estoque (o pátio) e transforma em Blocos de Massa, que o Terminal Orbital exporta.';
    case 'refinery': return 'Jogue minerais no funil: 2 kg viram 1 barra refinada, que vai para um armazém encostado.';
    case 'analyzer': return 'Toque E: escolha o material, dê o pulso de frequência e veja o que existe dentro. Processamento manual.';
    case 'dronepad': return 'O drone trabalha sozinho ao redor da estação e volta para recarregar.';
    case 'field': return 'Protege a área ao redor (e um pouco a camada inteira) contra o perigo indicado.';
    default: return def.desc;
  }
}
void compOf;
