import { fabVal } from '../data/factory';
import { TILE_CELLS, WORLD_W, WORLD_H, wrapX } from '../core/constants';
import { IS_LOOSE, GRAIN_ITEM, GRAIN_KG, MAT } from '../data/materials';
import { RAW_BY_LAYER, compOf, KG_PER_UNIT } from '../data/composition';
import type { Game } from '../Game';

const MAX_SECONDS = 8 * 3600;   // ausência máxima considerada

export interface OfflineReport {
  seconds: number;              // tempo fora considerado
  pulled: number;               // kg aspirados pelos sopradores
  burned: number;               // kg queimados nos Incineradores
  minerals: Record<string, number>;
  limit: 'pilhas' | 'incinerador' | 'soprador';
}

/**
 * Produção offline INSTANTÂNEA: em vez de simular a física quadro a quadro (horas de espera com o jogo travado),
 * calcula o que a fábrica faria. Cada Soprador aspira as pilhas soltas no alcance dele (os grãos somem do mapa
 * de verdade), limitado pela vazão dele e pela queima dos Incineradores; os extratores recuperam os minérios na
 * proporção da eficiência deles e o resto é queimado.
 */
export function runOffline(g: Game, seconds: number): OfflineReport | null {
  seconds = Math.min(MAX_SECONDS, Math.max(0, seconds));
  const M = g.machines, w = g.world, L = g.planet.layer;
  const blowers = M.list.filter(m => m.def.behavior === 'blower' && !m.broken && m.buried <= 0);
  const burners = M.list.filter(m => m.def.behavior === 'compactor' && !m.broken && m.buried <= 0);
  if (seconds < 60 || !blowers.length || !burners.length) return null;

  const burnCap = burners.reduce((n, m) => n + (m.def.capacity ?? 900) / 60, 0) * fabVal(g.flags, 'incinerador') * seconds;
  const blowEach = fabVal(g.flags, 'vazao') / 60 * seconds;
  let budget = Math.min(burnCap, blowEach * blowers.length);
  let limit: OfflineReport['limit'] = burnCap < blowEach * blowers.length ? 'incinerador' : 'soprador';

  const raw = RAW_BY_LAYER[L];
  const R = Math.round(fabVal(g.flags, 'alcance') * TILE_CELLS);
  const take: Record<string, { kg: number; grade: number }> = {};
  let pulled = 0;
  for (const b of blowers) {
    let mine = Math.min(blowEach, budget);
    const cx = Math.floor((b.tx + 0.5) * TILE_CELLS), cy = Math.floor((b.ty + 0.5) * TILE_CELLS);
    for (let dy = -R; dy <= R && mine >= GRAIN_KG; dy++) {
      const y = cy + dy;
      if (y < b.ty * TILE_CELLS || y < 0 || y >= WORLD_H) continue;   // só do nível dele para baixo, como no jogo
      for (let dx = -R; dx <= R && mine >= GRAIN_KG; dx++) {
        if (dx * dx + dy * dy > R * R) continue;
        const x = wrapX(cx + dx, WORLD_W), mat = w.get(x, y);
        if (!IS_LOOSE[mat] || w.occAtCell(x, y)) continue;
        const k = GRAIN_ITEM[mat];
        if (!k || k === 'bloco_massa') continue;
        const t = take[k] ?? (take[k] = { kg: 0, grade: 0 });
        const grade = w.aux[y * WORLD_W + x] / 40 || 1;
        t.grade = (t.grade * t.kg + grade * GRAIN_KG) / (t.kg + GRAIN_KG);
        t.kg += GRAIN_KG;
        w.set(x, y, MAT.AIR);
        mine -= GRAIN_KG; budget -= GRAIN_KG; pulled += GRAIN_KG;
      }
    }
    if (mine >= GRAIN_KG) limit = 'pilhas';   // acabaram as pilhas no alcance deste soprador
  }
  if (pulled <= 0) return { seconds, pulled: 0, burned: 0, minerals: {}, limit: 'pilhas' };

  // extratores: cada um pega a fração "eficiência" do que passa embaixo; vários em série somam
  const eff = fabVal(g.flags, 'extrator') / 100;
  const extractors = M.list.filter(m => m.def.behavior === 'extractor' && !m.broken);
  const comp = compOf(L), minerals: Record<string, number> = {};
  let recovered = 0;
  for (const [k, t] of Object.entries(take)) {
    if (k !== raw && k !== 'fragmentado') continue;   // terra já processada só é queimada
    for (const mm of comp.minerals) {
      const kg = t.kg * mm.frac * t.grade;
      const n = extractors.filter(e => e.def.pick?.includes(mm.k)).length;
      const got = kg * (1 - Math.pow(1 - eff, n));
      if (got > 0) {
        g.stock.add(mm.k, got, false, t.grade);
        minerals[mm.k] = (minerals[mm.k] ?? 0) + got;
        g.sectors.counter(L, 'rec_' + mm.k, got);
        g.sectors.counter(L, 'separated', got);
      }
      if (kg - got > 0) g.sectors.counter(L, 'lost_' + mm.k, kg - got);
      recovered += got;
    }
  }
  const burned = pulled - recovered;
  g.planet.addUnits(burned / KG_PER_UNIT);
  g.sectors.counter(L, 'burned', burned);
  return { seconds, pulled, burned, minerals, limit };
}
