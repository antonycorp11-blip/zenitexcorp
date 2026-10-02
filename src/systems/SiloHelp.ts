import type { Game } from '../Game';
import type { Machine } from './Machines';
import type { BPItem } from './Blueprint';
import { ITEM } from '../data/items';
import { MACHINE } from '../data/machines';

const MAGNET = new Set(['ferronox', 'ferronox_denso', 'umbrium']);
export interface SiloPlan { msg: string; item: BPItem | null; remove: Machine | null }

/**
 * Guia de montagem da SEPARAÇÃO, olhando a fábrica real:
 * Peneira → (embaixo) Ímã/Ressonador → (do lado da seta) Silo; o resto cai no Coletor.
 * Devolve a mensagem, a peça a construir (marcada no mapa, posição travada) e a peça a desmontar (marcada em vermelho).
 */
export function siloPlan(g: Game, key: string): SiloPlan {
  const M = g.machines, name = ITEM[key]?.name ?? key;
  const sepKey = MAGNET.has(key) ? 'ima' : 'ressonador', sepDef = MACHINE[sepKey];
  const sepName = sepKey === 'ima' ? 'Ímã (Separador Magnético)' : 'Ressonador de Cristais';
  const none = (msg: string): SiloPlan => ({ msg, item: null, remove: null });
  const isSep = (m?: Machine) => !!m && m.def.behavior === 'filter' && !!m.def.pick;
  // reconstrução em andamento (a Peneira foi desmontada para o separador entrar embaixo dela)
  const G = g.flags.sepGuide as { x: number; y: number; dir: number; key: string; pen: number } | undefined;
  if (G && G.key === sepKey) {
    const old = M.byId.get(G.pen);
    if (old && old.tx === G.x && old.ty === G.y) return { msg: `O ${sepName} entra <b>entre a Peneira e o Coletor</b>.<br>1) Toque na <b>Peneira</b> (marcada em vermelho) → <b>DESMONTAR</b> (volta 100%). Ela sobe um andar depois.`, item: null, remove: old };
    const s = M.at(G.x, G.y), pn = M.at(G.x, G.y - 1);
    if (!s || s.key !== sepKey) return { msg: `2) <b>Processamento → ${sepName}</b> no quadrado verde, onde a Peneira estava. Seta <b>▶</b>.`, item: { id: 'g_sep', key: sepKey, tx: G.x, ty: G.y, dir: 0, label: sepKey === 'ima' ? 'ÍMÃ ▶' : 'RESSONADOR ▶' }, remove: null };
    if (!pn || pn.def.outMode !== 'sieve') return { msg: '3) <b>Processamento → Peneira</b> de volta, agora <b>em cima</b> do separador. Seta <b>◀</b>.', item: { id: 'g_pen', key: 'peneira', tx: G.x, ty: G.y - 1, dir: G.dir, label: 'PENEIRA ◀' }, remove: null };
    delete g.flags.sepGuide;
  }
  const P = M.list.find(m => m.def.outMode === 'sieve');
  if (!P) return none('Monte primeiro a torre: <b>Coletor</b>, <b>Peneira</b> em cima e um <b>Soprador</b> com <b>Tubo</b> até a Peneira.');
  // desce pela pilha embaixo da peneira procurando o separador certo
  let S: Machine | null = null, bottom: Machine = P, cur = M.at(P.tx, P.ty + 1);
  while (isSep(cur)) { if (cur!.def.pick!.includes(key)) { S = cur!; break; } bottom = cur!; cur = M.at(cur!.tx, cur!.ty + 1); }
  if (!S) {
    const sx = bottom.tx, sy = bottom.ty + 1;
    if (!M.canPlace(sepDef, sx, sy)) return { msg: `<b>Processamento → ${sepName}</b> no quadrado verde, <b>embaixo da Peneira</b>. Seta <b>▶</b>: é para lá que ele puxa o ${name}.`, item: { id: 'g_sep', key: sepKey, tx: sx, ty: sy, dir: 0, label: sepKey === 'ima' ? 'ÍMÃ ▶' : 'RESSONADOR ▶' }, remove: null };
    if (bottom === P && M.at(P.tx, P.ty - 1) === undefined && !M.at(P.tx + 1, P.ty - 1)) {
      // a Peneira está em cima do Coletor: ela precisa subir um andar para o separador entrar no meio
      g.flags.sepGuide = { x: P.tx, y: P.ty, dir: P.dir, key: sepKey, pen: P.id };
      return { msg: `O ${sepName} entra <b>entre a Peneira e o Coletor</b>.<br>1) Toque na <b>Peneira</b> (marcada em vermelho) → <b>DESMONTAR</b> (volta 100%). Ela sobe um andar depois.`, item: null, remove: P };
    }
    return none(`Abra espaço <b>embaixo da Peneira</b> para o ${sepName}.`);
  }
  // silo do lado da seta do separador
  const silos = M.list.filter(m => m.def.behavior === 'silo');
  const side = S.dir === 2 ? S.tx - 1 : S.tx + S.def.w;
  const silo = silos.find(s => side >= s.tx && side < s.tx + s.def.w && s.ty > S!.ty && s.ty <= S!.ty + 5);
  if (!silo) {
    const tx = S.dir === 2 ? side - 1 : side;
    for (let ty = S.ty + 1; ty <= S.ty + 5; ty++) if (!M.canPlace(MACHINE.silo, tx, ty)) return { msg: `<b>Logística → Silo</b> no quadrado verde: <b>embaixo da saída ${S.dir === 2 ? '◀' : '▶'}</b> do ${sepName}. O ${name} puxado cai dentro dele.`, item: { id: 'g_silo', key: 'silo', tx, ty, dir: S.dir === 2 ? 0 : 2, label: 'SILO' }, remove: null };
    return none(`Abra espaço no chão do lado <b>${S.dir === 2 ? '◀' : '▶'}</b> do ${sepName} para o <b>Silo</b> (ou toque nele e <b>GIRE</b>).`);
  }
  const lock = silo.filter ?? Object.keys(silo.inb).find(k => (silo.inb[k] ?? 0) > 0);
  if (lock && lock !== key) return none(`Esse Silo guarda <b>${ITEM[lock]?.name ?? lock}</b>. Toque nele → <b>GUARDA</b> → ${name}.`);
  const blowers = M.list.filter(m => m.def.behavior === 'blower');
  if (!blowers.length) return none('Ponha um <b>Soprador</b> perto de onde vai cavar e ligue um <b>Tubo</b> até em cima da Peneira.');
  if (!blowers.some(b => b.fin > 1)) return none('<b>Cave o chão perto do Soprador</b>: a terra sobe pelo tubo, a Peneira solta os minerais e o separador manda o seu para o Silo.');
  return none(`Funcionando: o ${sepName} puxa o ${name} para o Silo. Continue cavando.`);
}

export function siloHelp(g: Game, key: string): string { return siloPlan(g, key).msg; }
