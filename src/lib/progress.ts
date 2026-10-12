import type { GameId } from '../types'
import { readJSON, writeJSON } from './storage'
import { backendConfigured, rpc } from './supabase'

/**
 * Level progress for campaign games (Skater Boy, Arrow Go).
 * Merge rule (same on client and server): completed = union, best[level] = max.
 * Because the merge is commutative and idempotent, devices can sync in any order.
 */
export interface LevelProgress {
  completed: number[]
  best: Record<string, number>
  dirty?: boolean
}

const key = (playerKey: string, game: GameId) => `progress:${playerKey}:${game}`

export function mergeProgress(a: LevelProgress, b: LevelProgress): LevelProgress {
  const completed = [...new Set([...a.completed, ...b.completed])].sort((x, y) => x - y)
  const best: Record<string, number> = { ...a.best }
  for (const [k, v] of Object.entries(b.best)) best[k] = Math.max(best[k] ?? 0, v)
  return { completed, best }
}

export function loadProgress(playerKey: string, game: GameId): LevelProgress {
  return readJSON<LevelProgress>(key(playerKey, game), { completed: [], best: {} })
}

export function recordLevel(playerKey: string, game: GameId, level: number, score?: number): LevelProgress {
  const cur = loadProgress(playerKey, game)
  const add: LevelProgress = { completed: [level], best: score != null ? { [level]: Math.round(score) } : {} }
  const next = { ...mergeProgress(cur, add), dirty: true }
  writeJSON(key(playerKey, game), next)
  return next
}

/** Two-way sync: pushes local progress (server merges), stores the merged result locally. */
export async function syncProgress(playerKey: string, game: GameId, registered: boolean): Promise<LevelProgress> {
  const local = loadProgress(playerKey, game)
  if (!backendConfigured || !registered) return local
  try {
    const merged = await rpc<LevelProgress>('save_progress', {
      p_game: game,
      p_completed: local.completed,
      p_best: local.best,
    })
    const next = mergeProgress(local, merged)
    writeJSON(key(playerKey, game), { ...next, dirty: false })
    return next
  } catch {
    return local
  }
}
