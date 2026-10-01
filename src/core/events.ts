// Barramento de eventos tipado de forma leve. Sistemas se comunicam por aqui
// para evitar dependências diretas entre módulos.
type Handler = (payload: any) => void;

export class EventBus {
  private map = new Map<string, Handler[]>();
  on(ev: string, fn: Handler): () => void {
    const list = this.map.get(ev) ?? [];
    list.push(fn);
    this.map.set(ev, list);
    return () => { const l = this.map.get(ev); if (l) l.splice(l.indexOf(fn), 1); };
  }
  emit(ev: string, payload?: any) {
    const list = this.map.get(ev);
    if (list) for (const fn of list.slice()) fn(payload);
    const all = this.map.get('*');
    if (all) for (const fn of all) fn({ ev, payload });
  }
}

export const bus = new EventBus();
