// Espaços de trabalho guardados no navegador (IndexedDB): metadados e arquivo do projeto separados.
export type WsMeta = { id: string; name: string; created: number; updated: number; frames: number; thumb?: string }

const open = () => new Promise<IDBDatabase>((res, rej) => { const q = indexedDB.open('kixel', 1); q.onupgradeneeded = () => q.result.createObjectStore('kv'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error) })
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T> {
  const db = await open()
  try { return await new Promise<T>((res, rej) => { const t = db.transaction('kv', mode); const r = fn(t.objectStore('kv')); t.oncomplete = () => res((r ? (r as IDBRequest).result : undefined) as T); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error) }) } finally { db.close() }
}
export const newId = () => Math.random().toString(36).slice(2, 10)

export async function listWs(): Promise<WsMeta[]> {
  const all = await tx<WsMeta[]>('readonly', s => s.getAll(IDBKeyRange.bound('wsm:', 'wsm:￿')))
  return (all ?? []).sort((a, b) => b.updated - a.updated)
}
export async function getMeta(id: string): Promise<WsMeta | undefined> { return tx<WsMeta | undefined>('readonly', s => s.get('wsm:' + id)) }
export async function getBlob(id: string): Promise<Blob | undefined> { return tx<Blob | undefined>('readonly', s => s.get('wsb:' + id)) }
export async function putWs(meta: WsMeta, blob?: Blob): Promise<void> {
  await tx<void>('readwrite', s => { s.put(meta, 'wsm:' + meta.id); if (blob) s.put(blob, 'wsb:' + meta.id) })
}
export async function putMeta(meta: WsMeta): Promise<void> { await tx<void>('readwrite', s => { s.put(meta, 'wsm:' + meta.id) }) }
export async function delWs(id: string): Promise<void> { await tx<void>('readwrite', s => { s.delete('wsm:' + id); s.delete('wsb:' + id) }) }
export async function legacyAutosave(): Promise<Blob | undefined> { return tx<Blob | undefined>('readonly', s => s.get('autosave')) }
export async function dropLegacy(): Promise<void> { await tx<void>('readwrite', s => { s.delete('autosave') }) }
