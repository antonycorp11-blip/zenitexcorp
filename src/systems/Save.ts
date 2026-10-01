/** Persistência em IndexedDB (com fallback para localStorage). */
const DB = 'zenitex-planetary', STORE = 'saves';

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function saveSlot(slot: string, data: unknown): Promise<boolean> {
  try {
    const db = await open();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(data, slot);
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
    });
    return true;
  } catch {
    try { localStorage.setItem('zx_' + slot, JSON.stringify(data)); return true; } catch { return false; }
  }
}

export async function loadSlot(slot: string): Promise<any | null> {
  try {
    const db = await open();
    return await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).get(slot);
      r.onsuccess = () => res(r.result ?? null); r.onerror = () => rej(r.error);
    });
  } catch {
    try { const s = localStorage.getItem('zx_' + slot); return s ? JSON.parse(s) : null; } catch { return null; }
  }
}

export async function deleteSlot(slot: string) {
  try { const db = await open(); const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(slot); } catch { /* */ }
  try { localStorage.removeItem('zx_' + slot); } catch { /* */ }
}

export function packBytes(a: Uint8Array): string {
  // RLE simples + base64
  const out: number[] = [];
  let prev = a[0], run = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === prev && run < 255) run++;
    else { out.push(prev, run); prev = a[i]; run = 1; }
  }
  out.push(prev, run);
  let s = '';
  for (let i = 0; i < out.length; i += 8192) s += String.fromCharCode(...out.slice(i, i + 8192));
  return btoa(s);
}
export function unpackBytes(s: string, into: Uint8Array) {
  const b = atob(s);
  let p = 0;
  for (let i = 0; i < b.length; i += 2) { const v = b.charCodeAt(i), r = b.charCodeAt(i + 1); into.fill(v, p, p + r); p += r; }
}
