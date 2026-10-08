// Photos taken with no signal wait here, in the browser's own database, until
// they can be uploaded. Text entries fit in localStorage; photos do not.
// If the browser has no IndexedDB (some private windows) they are held in
// memory instead, which still covers a brief drop in signal.

export interface QueuedPhoto {
  id: string
  pmId: string
  itemId: string | null
  deficiencyId: string | null
  name: string
  type: string
  blob: Blob
  createdAt: number
}

const DB = 'pf-pm'
const STORE = 'photos'
const memory = new Map<string, QueuedPhoto>()

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return }
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: 'id' }) }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch { resolve(null) }
  })
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return open().then((db) => new Promise<T | null>((resolve) => {
    if (!db) { resolve(null); return }
    try {
      const tx = db.transaction(STORE, mode)
      const req = work(tx.objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      tx.oncomplete = () => db.close()
    } catch { resolve(null) }
  }))
}

export async function putPhoto(p: QueuedPhoto): Promise<void> {
  memory.set(p.id, p)
  await run('readwrite', (s) => s.put(p))
}

export async function removePhoto(id: string): Promise<void> {
  memory.delete(id)
  await run('readwrite', (s) => s.delete(id))
}

export async function listPhotos(pmId: string): Promise<QueuedPhoto[]> {
  const stored = (await run<QueuedPhoto[]>('readonly', (s) => s.getAll() as IDBRequest<QueuedPhoto[]>)) ?? []
  const all = new Map<string, QueuedPhoto>()
  for (const p of [...stored, ...memory.values()]) all.set(p.id, p)
  return [...all.values()].filter((p) => p.pmId === pmId).sort((a, b) => a.createdAt - b.createdAt)
}
