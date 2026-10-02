import { MACHINE } from '../data/machines';
import type { Game } from '../Game';
import type { Machine } from './Machines';

export interface BPItem { id: string; key: string; tx: number; ty: number; dir: number; label: string; tx2?: number; }

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
    // linha reta à direita da cápsula, tudo fluindo para a ESQUERDA, em direção à base:
    // [Compactador][Armazém] ◀ esteira ◀ [Processador ◀] ◀ esteira ◀ [Perfuradora ↓]
    const x = tx0 + 3;
    this.items = [
      { id: 'compactador', key: 'compactador', tx: x, ty: gy - 2, dir: 2, label: 'COMPACTADOR' },
      { id: 'armazem', key: 'armazem', tx: x + 2, ty: gy - 2, dir: 0, label: 'ARMAZÉM' },
      { id: 'esteira_a', key: 'esteira', tx: x + 5, tx2: x + 4, ty: gy - 1, dir: 2, label: 'ESTEIRA ◀' },
      { id: 'processador_solo', key: 'processador_solo', tx: x + 6, ty: gy - 2, dir: 2, label: 'PROCESSADOR ◀' },
      { id: 'esteira_b', key: 'esteira', tx: x + 10, tx2: x + 8, ty: gy - 1, dir: 2, label: 'ESTEIRA ◀' },
      { id: 'perfuradora', key: 'perfuradora', tx: x + 11, ty: gy - 2, dir: 1, label: 'PERFURADORA ↓' },
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

  /** Confere a linha inteira: perfuradora → esteira → processador → esteira → armazém. */
  checkLine(): { ok: boolean; msg: string; stage: number } {
    const g = this.g;
    const d = g.machines.list.find(m => m.def.behavior === 'drill');
    if (!d) return { ok: false, msg: 'Falta a perfuradora.', stage: 0 };
    if (d.dir === 3) return { ok: false, msg: 'A perfuradora aponta para cima: gire para a terra.', stage: 0 };
    const a = this.follow(this.outBelt(d), d);
    if (!a.ok) return { ok: false, msg: a.msg, stage: 1 };
    let dest = a.to!;
    if (dest.def.behavior === 'separator' || dest.def.behavior === 'prep') {
      const p = dest;
      const b = this.follow(this.outBelt(p), p);
      if (!b.ok) return { ok: false, msg: b.msg + ' (saída do processador — a calha fica do lado da seta)', stage: 2 };
      dest = b.to!;
      if (['storage', 'command', 'link'].includes(dest.def.behavior)) return { ok: true, msg: `Linha completa: perfuradora → esteira → ${p.def.name} → esteira → ${dest.def.name}.`, stage: 3 };
      return { ok: false, msg: `A esteira do processador entrega em ${dest.def.name}: leve até o Armazém.`, stage: 2 };
    }
    if (['storage', 'command', 'link'].includes(dest.def.behavior)) return { ok: true, msg: `Material bruto chegando ao ${dest.def.name} (sem processar).`, stage: 1 };
    return { ok: false, msg: `A esteira entrega em ${dest.def.name}, que não recebe material bruto.`, stage: 1 };
  }
}
