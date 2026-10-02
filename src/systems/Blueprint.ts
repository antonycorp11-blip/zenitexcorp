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
    this.items = [
      { id: 'armazem', key: 'armazem', tx: tx0 + 8, ty: gy - 2, dir: 0, label: 'ARMAZÉM' },
      { id: 'perfuradora', key: 'perfuradora', tx: tx0 + 16, ty: gy - 2, dir: 1, label: 'PERFURADORA ↓' },
      { id: 'esteira', key: 'esteira', tx: tx0 + 15, tx2: tx0 + 10, ty: gy - 1, dir: 2, label: 'ESTEIRA ◀' },
      { id: 'processador_solo', key: 'processador_solo', tx: tx0 - 11, ty: gy - 2, dir: 0, label: 'PROCESSADOR' },
      { id: 'compactador', key: 'compactador', tx: tx0 - 14, ty: gy - 2, dir: 0, label: 'COMPACTADOR' },
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

  /** Confere a linha: grão saindo da calha da perfuradora cai na esteira, que leva até o funil/lateral do armazém. */
  checkLine(): { ok: boolean; msg: string } {
    const g = this.g;
    const d = g.machines.list.find(m => m.def.behavior === 'drill');
    if (!d) return { ok: false, msg: 'Falta a perfuradora.' };
    if (d.dir !== 1 && d.dir !== 0 && d.dir !== 2) return { ok: false, msg: 'A perfuradora está apontando para cima: gire para a terra.' };
    // a calha fica do lado oposto ao da perfuração horizontal; perfurando para baixo, sai pela esquerda
    const side = d.dir === 0 ? -1 : d.dir === 2 ? 1 : -1;
    const bx = side < 0 ? d.tx - 1 : d.tx + d.def.w;
    const first = g.machines.at(bx, d.ty + d.def.h - 1);
    if (!first?.belt) return { ok: false, msg: 'Não há esteira encostada embaixo da calha da perfuradora.' };
    let b: Machine = first;
    for (let guard = 0; guard < 200; guard++) {
      const step = b.dir === 2 ? -1 : 1;
      const n: Machine | undefined = g.machines.at(b.tx + step, b.ty) ?? g.machines.at(b.tx + step, b.ty - 1);
      if (!n) return { ok: false, msg: 'A esteira termina no vazio: o material cai no chão. Leve até o armazém.' };
      if (n.belt) { if (n.dir !== b.dir) return { ok: false, msg: 'Uma esteira está virada para o lado contrário: toque nela e gire.' }; b = n; continue; }
      if (n === d) return { ok: false, msg: 'A esteira está andando PARA a perfuradora. Ela tem que andar para o armazém: refaça arrastando da perfuradora até o armazém.' };
      if (['storage', 'command', 'link', 'separator', 'prep', 'compactor'].includes(n.def.behavior)) return { ok: true, msg: `Linha completa: perfuradora → esteira → ${n.def.name}.` };
      return { ok: false, msg: `A esteira entrega em ${n.def.name}, que não recebe material bruto.` };
    }
    return { ok: false, msg: 'Esteira longa demais.' };
  }
}
