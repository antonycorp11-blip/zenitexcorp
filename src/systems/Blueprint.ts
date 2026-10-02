import { MACHINE } from '../data/machines';
import type { Game } from '../Game';
import type { Machine } from './Machines';

export interface BPItem { id: string; key: string; tx: number; ty: number; dir: number; label: string; tx2?: number; ty2?: number; }

/**
 * Projeto guiado da primeira indústria (tutorial): onde vai cada peça, com que rotação, e a verificação
 * de que a linha funciona de verdade (perfuradora → esteira → funil do armazém).
 */
export class Blueprint {
  items: BPItem[] = [];
  constructor(private g: Game) {}

  /** monta o projeto a partir da posição da cápsula (vale para qualquer camada) */
  layout() {
    const c = this.g.machines.list.find(m => m.def.behavior === 'command');
    if (!c) { this.items = []; return; }
    const tx0 = c.tx + 1, gy = c.ty + c.def.h;     // gy = primeira fileira de chão
    // FÁBRICA VERTICAL, à direita da cápsula (tudo cai por gravidade):
    //            [ELEVADOR ▲]
    //   [PENEIRA ◀]  [ ▲ ]
    // [PRENSA][COLETOR][ ▲ ]◀ esteira ◀ [PERFURADORA ↓]
    const x = tx0 + 4;
    this.items = [
      { id: 'armazem', key: 'armazem', tx: x, ty: gy - 2, dir: 0, label: 'COLETOR' },
      { id: 'peneira', key: 'peneira', tx: x, ty: gy - 3, dir: 2, label: 'PENEIRA ◀' },
      { id: 'compactador', key: 'compactador', tx: x - 1, ty: gy - 2, dir: 0, label: 'PRENSA' },
      { id: 'elevador', key: 'elevador_grao', tx: x + 2, ty: gy - 1, ty2: gy - 4, dir: 2, label: 'ELEVADOR ▲' },
      { id: 'perfuradora', key: 'perfuradora', tx: x + 6, ty: gy - 2, dir: 1, label: 'PERFURADORA ↓' },
      { id: 'esteira', key: 'esteira', tx: x + 5, tx2: x + 3, ty: gy - 1, dir: 2, label: 'ESTEIRA ◀' },
    ];
  }

  item(id: string) { return this.items.find(i => i.id === id); }

  /** a peça foi posta onde o projeto pede, girada certo? */
  placed(id: string): boolean {
    const it = this.item(id); if (!it) return false;
    if (it.key === 'esteira') {
      for (let x = Math.min(it.tx, it.tx2!); x <= Math.max(it.tx, it.tx2!); x++) { const m = this.g.machines.at(x, it.ty); if (!m?.belt || m.dir !== it.dir) return false; }
      return true;
    }
    if (it.ty2 !== undefined) {
      for (let y = Math.min(it.ty, it.ty2); y <= Math.max(it.ty, it.ty2); y++) { const m = this.g.machines.at(it.tx, y); if (!m || m.key !== it.key) return false; }
      const top = this.g.machines.at(it.tx, Math.min(it.ty, it.ty2));
      return !!top && top.dir === it.dir;
    }
    const m = this.g.machines.at(it.tx, it.ty);
    return !!m && m.key === it.key && m.tx === it.tx && m.ty === it.ty && (!MACHINE[it.key].rotatable || m.dir === it.dir);
  }

  /** Segue a esteira a partir de um tile até a máquina que recebe. */
  private follow(start: Machine | undefined, from: Machine): { ok: boolean; to?: Machine; msg: string } {
    const g = this.g;
    if (!start?.belt) return { ok: false, msg: `Não há esteira encostada na saída de ${from.def.name}.` };
    let b: Machine = start;
    for (let guard = 0; guard < 200; guard++) {
      const step = b.dir === 2 ? -1 : 1;
      const n: Machine | undefined = g.machines.at(b.tx + step, b.ty) ?? g.machines.at(b.tx + step, b.ty - 1);
      if (!n) return { ok: false, msg: 'A esteira termina no vazio: o material cai no chão.' };
      if (n.belt) { if (n.dir !== b.dir) return { ok: false, msg: 'Uma esteira está virada para o lado contrário: toque nela e gire.' }; b = n; continue; }
      if (n === from) return { ok: false, msg: `A esteira está andando de volta para ${from.def.name}. Ela tem que andar para longe dela.` };
      return { ok: true, to: n, msg: '' };
    }
    return { ok: false, msg: 'Esteira longa demais.' };
  }
  /** a esteira encostada na calha (saída) de uma máquina */
  private outBelt(m: Machine): Machine | undefined {
    const side = m.def.behavior === 'drill' ? (m.dir === 0 ? -1 : m.dir === 2 ? 1 : -1) : (m.dir === 2 ? -1 : 1);
    const bx = side < 0 ? m.tx - 1 : m.tx + m.def.w;
    return this.g.machines.at(bx, m.ty + m.def.h - 1);
  }

  /** Confere a fábrica do projeto peça a peça e diz exatamente o que falta ou está errado. */
  checkLine(): { ok: boolean; msg: string; stage: number } {
    const order: [string, string][] = [
      ['armazem', 'Falta o Coletor no quadrado marcado.'],
      ['peneira', 'A Peneira tem que ficar EM CIMA do Coletor, com a seta ◀ (resíduo para a esquerda).'],
      ['compactador', 'A Prensa vai do lado esquerdo, embaixo da borda por onde o resíduo escorrega.'],
      ['elevador', 'O Elevador é uma coluna de 4, encostada no Coletor, com a saída do topo ◀ para cima da Peneira.'],
      ['perfuradora', 'A Perfuradora vai na ponta, com a seta para BAIXO.'],
      ['esteira', 'A esteira vai da perfuradora ATÉ o elevador (arraste da perfuradora para o elevador).'],
    ];
    for (let i = 0; i < order.length; i++) if (!this.placed(order[i][0])) return { ok: false, msg: order[i][1], stage: i };
    return { ok: true, msg: 'Fábrica montada: perfuradora → esteira → elevador → peneira → minerais no coletor, resíduo na prensa.', stage: order.length };
  }
}
