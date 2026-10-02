import type { Game } from '../Game';
import type { Machine } from './Machines';
import type { BPItem } from './Blueprint';
import { ITEM } from '../data/items';
import { MACHINE } from '../data/machines';
import { COMPOSITION } from '../data/composition';

const MAGNET = new Set(['ferronox', 'ferronox_denso', 'umbrium', 'pyroxis']);
export interface SiloPlan { msg: string; item: BPItem | null; remove: Machine | null }

/**
 * Guia das metas de silo, olhando a fábrica real. Estrutura:
 * Soprador → Tubo de Vácuo → Esteira; por cima dela (1 espaço livre) o Ímã / Ressonador;
 * um Tubo de Vácuo encostado no extrator leva o mineral até em cima de um Silo.
 */
export function siloPlan(g: Game, key: string): SiloPlan {
  const M = g.machines, name = ITEM[key]?.name ?? key;
  const sepKey = MAGNET.has(key) ? 'ima' : 'ressonador', sepDef = MACHINE[sepKey];
  const sepName = sepKey === 'ima' ? 'Ímã Extrator' : 'Ressonador Extrator';
  const none = (msg: string, remove: Machine | null = null): SiloPlan => ({ msg, item: null, remove });
  const belts = M.list.filter(m => m.def.behavior === 'belt');
  if (!belts.length) return none('Monte a linha: <b>Soprador</b> → <b>Tubo de Vácuo</b> → <b>Esteira</b> (MENU → Ajuda → refazer tutorial, se precisar).');
  const exts = M.list.filter(m => m.key === sepKey);
  const overBelt = (e: Machine) => [0, 1].some(i => M.at(e.tx + i, e.ty + 2)?.def.behavior === 'belt');
  if (!exts.length) {
    for (const b of belts) {
      const n = M.at(b.tx + 1, b.ty); if (!n || n.def.behavior !== 'belt') continue;
      if (M.at(b.tx, b.ty - 1) || M.at(b.tx + 1, b.ty - 1)) continue;
      if (!M.canPlace(sepDef, b.tx, b.ty - 2)) return { msg: `<b>Processamento → ${sepName}</b> no quadrado verde: <b>por cima da esteira</b>, com 1 espaço livre embaixo.`, item: { id: 'g_ext', key: sepKey, tx: b.tx, ty: b.ty - 2, dir: 0, label: sepName.toUpperCase() }, remove: null };
    }
    return none(`Ponha o <b>${sepName}</b> por cima de uma esteira, deixando <b>1 espaço livre</b> entre eles.`);
  }
  const e = exts.find(overBelt);
  if (!e) return none(`O ${sepName} precisa ficar <b>por cima de uma esteira</b> com 1 espaço livre. Toque nele → <b>DESMONTAR</b> e ponha no lugar certo.`, exts[0]);
  const adj: Machine[] = [];
  for (let i = -1; i <= e.def.w; i++) for (const ty of [e.ty - 1, e.ty + 1]) { const o = M.at(e.tx + i, ty); if (o?.def.behavior === 'tube') adj.push(o); }
  for (const tx of [e.tx - 1, e.tx + e.def.w]) { const o = M.at(tx, e.ty); if (o?.def.behavior === 'tube') adj.push(o); }
  if (!adj.length) return none(`Encoste um <b>Tubo de Vácuo</b> no ${sepName} (em cima ou do lado) e leve até <b>em cima de um Silo</b>.`);
  const rare = new Set(Object.values(COMPOSITION).map(c => c.rare.k));
  const kind = (s: Machine) => s.filter ?? Object.keys(s.inb).find(k => (s.inb[k] ?? 0) > 0 && !rare.has(k));
  const silos = M.list.filter(m => m.def.behavior === 'silo');
  if (!silos.some(s => !kind(s) || kind(s) === key)) return none(`Construa um <b>Silo</b> (Logística) e faça o tubo do ${sepName} terminar <b>em cima dele</b>.`);
  const blowers = M.list.filter(m => m.def.behavior === 'blower');
  if (!blowers.some(b => b.fin > 1)) return none('<b>Cave o chão perto do Soprador</b>: a terra vai pela esteira e passa embaixo do extrator.');
  if (M.siloCount(key) < 1 && e.state.startsWith('Puxando')) return none(`O ${sepName} está puxando, mas nada chega no Silo: a <b>ponta do tubo</b> tem que ficar <b>em cima do Silo</b>.`);
  return none(`Funcionando: o ${sepName} puxa o ${name} da esteira e o tubo leva até o Silo. Continue cavando.`);
}

export function siloHelp(g: Game, key: string): string { return siloPlan(g, key).msg; }
