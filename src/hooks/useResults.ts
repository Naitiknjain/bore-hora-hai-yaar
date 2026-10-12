import { useSyncExternalStore } from 'react'
import { getResults, subscribeResults } from '../lib/offline-sync'
import { readJSON, writeJSON } from '../lib/storage'
import type { GameId, StoredResult } from '../types'

let cache: StoredResult[] | null = null
function snapshot() {
  cache ??= getResults()
  return cache
}
// Invalidate even while no component is subscribed, so a later mount never sees stale data.
subscribeResults(() => {
  cache = null
})

/** Live view of locally stored results (re-renders when results are added or synced). */
export function useResults(): StoredResult[] {
  return useSyncExternalStore(
    (cb) =>
      subscribeResults(() => {
        cache = null
        cb()
      }),
    snapshot,
    snapshot,
  )
}

const RECENT_KEY = 'recent-games'

export function markRecentlyPlayed(id: GameId) {
  const list = readJSON<{ id: GameId; at: string }[]>(RECENT_KEY, []).filter((x) => x.id !== id)
  list.unshift({ id, at: new Date().toISOString() })
  writeJSON(RECENT_KEY, list.slice(0, 8))
}

export function getRecentlyPlayed(): { id: GameId; at: string }[] {
  return readJSON(RECENT_KEY, [])
}
