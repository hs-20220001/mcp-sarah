import { describe, expect, it, vi } from 'vitest'
import { SnapshotStore } from '../src/core/snapshots.js'

describe('SnapshotStore', () => {
  it('pagina um snapshot estável e o expira pelo TTL', () => {
    vi.useFakeTimers()
    try {
      const store = new SnapshotStore<number>(1_000)
      const snapshot = store.create([1, 2, 3, 4])
      expect(store.page(snapshot.id, 0, 2)).toMatchObject({ items: [1, 2], nextOffset: 2, total: 4 })
      expect(store.page(snapshot.id, 2, 50)).toMatchObject({ items: [3, 4], nextOffset: null, total: 4 })
      vi.advanceTimersByTime(1_001)
      expect(() => store.page(snapshot.id, 0, 2)).toThrow(/Snapshot inexistente ou expirado/)
    } finally {
      vi.useRealTimers()
    }
  })
})
