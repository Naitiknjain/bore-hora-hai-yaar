import type { GameId, Metrics, StoredResult } from '../types'
import { uuid } from './random'
import { computeRankKeys } from './scoring'
import { readJSON, writeJSON } from './storage'
import { ApiError, backendConfigured, rpc } from './supabase'

/**
 * Local results log + offline queue.
 * Every finished game is written here first (so nothing is lost offline), then pushed to the server.
 * Each result carries a client-generated submissionId, and the server ignores ids it already has,
 * so retries and replays are idempotent.
 */

const KEY = 'results'
const MAX_RESULTS = 600

type Listener = () => void
const listeners = new Set<Listener>()

let currentPlayer: { id: string; registered: boolean } | null = null
let syncing: Promise<void> | null = null

export function setSyncPlayer(player: { id: string; registered: boolean } | null) {
  currentPlayer = player
}

export function getResults(): StoredResult[] {
  return readJSON<StoredResult[]>(KEY, [])
}

function save(results: StoredResult[]) {
  writeJSON(KEY, results.slice(-MAX_RESULTS))
  listeners.forEach((l) => l())
}

export function subscribeResults(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function pendingCount(): number {
  return getResults().filter((r) => r.status === 'pending' && r.playerKey === currentPlayer?.id).length
}

export interface RecordOptions {
  gameId: GameId
  board: string
  metrics: Metrics
  sessionId?: string | null
  /** Results that should never leave the device (e.g. local multiplayer). */
  localOnly?: boolean
}

/** Stores a finished result and schedules a sync. Returns the stored record. */
export function recordResult(opts: RecordOptions): StoredResult | null {
  if (!currentPlayer) return null
  if (!computeRankKeys(opts.gameId, opts.board, opts.metrics)) {
    // Would be rejected by the server; do not pollute the queue.
    return null
  }
  const result: StoredResult = {
    submissionId: uuid(),
    playerKey: currentPlayer.id,
    gameId: opts.gameId,
    board: opts.board,
    metrics: opts.metrics,
    playedAt: new Date().toISOString(),
    sessionId: opts.sessionId ?? null,
    status: backendConfigured && !opts.localOnly ? 'pending' : 'local-only',
  }
  save([...getResults(), result])
  void syncPending()
  return result
}

/** Pushes pending results for the current registered player. Safe to call often. */
export function syncPending(): Promise<void> {
  if (syncing) return syncing
  // Note: the body can finish synchronously (e.g. not registered yet). Clear the in-flight
  // marker *after* assigning it, otherwise a synchronous exit would leave it set forever
  // and block every later sync.
  const run = runSync()
  syncing = run
  void run.finally(() => {
    if (syncing === run) syncing = null
  })
  return run
}

async function runSync(): Promise<void> {
  if (!backendConfigured || !currentPlayer?.registered) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  const playerId = currentPlayer.id
  const pending = getResults().filter((r) => r.status === 'pending' && r.playerKey === playerId)
  for (const item of pending) {
    try {
      await rpc('submit_score', {
        p_submission_id: item.submissionId,
        p_game: item.gameId,
        p_board: item.board,
        p_metrics: item.metrics,
        p_played_at: item.playedAt,
        p_session_id: item.sessionId ?? null,
      })
      update(item.submissionId, { status: 'synced', error: undefined })
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'unknown'
      if (code === 'network' || code === 'server_error' || code === 'rate_limited' || code === 'not_authenticated') {
        // transient: stop and retry later, keeping order
        return
      }
      update(item.submissionId, { status: 'rejected', error: code })
    }
  }
}

function update(id: string, patch: Partial<StoredResult>) {
  save(getResults().map((r) => (r.submissionId === id ? { ...r, ...patch } : r)))
}

/** Requests a server game session (used to sanity-check durations). Never blocks gameplay. */
export async function startServerSession(gameId: GameId, board: string): Promise<string | null> {
  if (!backendConfigured || !currentPlayer?.registered) return null
  try {
    return await rpc<string>('start_game_session', { p_game: gameId, p_board: board })
  } catch {
    return null
  }
}

let installed = false
export function installSyncTriggers() {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('online', () => void syncPending())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncPending()
  })
  window.setInterval(() => void syncPending(), 60_000)
}
