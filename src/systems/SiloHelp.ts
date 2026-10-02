import type { Game } from '../Game';
import type { Machine } from './Machines';
import { ITEM } from '../data/items';

const MAGNET = new Set(['ferronox', 'ferronox_denso', 'umbrium']);

/**
 * Diz ao jogador, olhando a fábrica real, qual é o PRÓXIMO passo para encher um silo de `key`.
 * Caminho: você cava → Soprador → Tubo → Peneira → Separador (Ímã ou Ressonador) → Silo do lado da seta.
 */
export function siloHelp(g: Game, key: string): string {
  const M = g.machines, name = ITEM[key]?.name ?? key;
  const sepKey = MAGNET.has(key) ? 'ima' : 'ressonador', sepName = sepKey === 'ima' ? 'Separador Magnético (Ímã)' : 'Ressonador de Cristais';
  const seps = M.list.filter(m => m.key === sepKey);
  if (!seps.length) return `1) <b>Construir → Processamento → ${sepName}</b>, embaixo da Peneira (a Peneira fica em cima dele).`;
  const silos = M.list.filter(m => m.def.behavior === 'silo');
  // silo que recebe a saída lateral de algum separador
  const fed = (sep: Machine) => {
    const sx = sep.dir === 2 ? sep.tx - 1 : sep.tx + sep.def.w;
    return silos.find(s => sx >= s.tx && sx < s.tx + s.def.w && s.ty > sep.ty && s.ty <= sep.ty + 4);
  };
  const pair = seps.map(s => ({ s, silo: fed(s) })).find(p => p.silo) ?? null;
  if (!silos.length || !pair) {
    const s = seps[0];
    return `2) <b>Construir → Logística → Silo</b> embaixo da saída do ${sepName}: do lado da seta <b>${s.dir === 2 ? '◀' : '▶'}</b>, encostado no chão.`;
  }
  const silo = pair.silo!;
  const lock = silo.filter ?? Object.keys(silo.inb).find(k => (silo.inb[k] ?? 0) > 0);
  if (lock && lock !== key) return `O silo está guardando <b>${ITEM[lock]?.name ?? lock}</b>. Toque nele → <b>GUARDA</b> → escolha ${name} (ou construa outro silo).`;
  const sep = pair.s;
  const top = M.at(sep.tx, sep.ty - 1) ?? M.at(sep.tx + 1, sep.ty - 1);
  if (!top || top.def.behavior !== 'separator') return `3) Ponha uma <b>Peneira</b> em cima do ${sepName} (os minerais caem da Peneira nele).`;
  const blowers = M.list.filter(m => m.def.behavior === 'blower');
  if (!blowers.length) return '4) Ponha um <b>Soprador</b> (Construir → Extração) perto de onde você vai cavar e ligue um <b>Tubo</b> dele até em cima da Peneira.';
  if (!M.list.some(m => m.def.behavior === 'tube')) return '4) Ligue um <b>Tubo</b> (Logística) do bocal do Soprador até em cima da Peneira.';
  if (!blowers.some(b => b.fin > 1)) return '5) <b>Cave o chão perto do Soprador</b>: ele aspira as pilhas e manda pelo tubo.';
  return `Funcionando: continue cavando perto do Soprador. O ${sepName} separa o ${name} e manda para o Silo.`;
}
