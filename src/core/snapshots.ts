import { randomUUID } from 'node:crypto'
import { AppError } from './errors.js'

interface Snapshot<T> {
  id: string
  items: T[]
  expiresAt: number
}

export class SnapshotStore<T> {
  readonly #snapshots = new Map<string, Snapshot<T>>()
  readonly #ttlMs: number

  constructor(ttlMs = 10 * 60 * 1_000) {
    this.#ttlMs = ttlMs
  }

  create(items: T[]): Snapshot<T> {
    this.#purge()
    const snapshot = { id: randomUUID(), items: [...items], expiresAt: Date.now() + this.#ttlMs }
    this.#snapshots.set(snapshot.id, snapshot)
    return snapshot
  }

  page(id: string, offset: number, limit: number): { items: T[]; nextOffset: number | null; total: number; expiresAt: string } {
    this.#purge()
    const snapshot = this.#snapshots.get(id)
    if (!snapshot) throw new AppError('NOT_FOUND', 'Snapshot inexistente ou expirado.')
    const items = snapshot.items.slice(offset, offset + limit)
    const next = offset + items.length
    return {
      items,
      nextOffset: next < snapshot.items.length ? next : null,
      total: snapshot.items.length,
      expiresAt: new Date(snapshot.expiresAt).toISOString(),
    }
  }

  #purge(): void {
    const now = Date.now()
    for (const [id, snapshot] of this.#snapshots) {
      if (snapshot.expiresAt <= now) this.#snapshots.delete(id)
    }
  }
}
