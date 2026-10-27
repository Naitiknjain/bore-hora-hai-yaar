import { useCallback, useEffect, useRef, useState } from 'react'
import { usePlayer } from '../../features/player/PlayerContext'
import { uuid } from '../../lib/random'
import { readJSON, writeJSON } from '../../lib/storage'
import { ApiError, backendConfigured, rpc } from '../../lib/supabase'

/**
 * Chakkar Cubes (internal id loop-sort) account state.
 *
 * Online (backend configured + registered player): the server owns lives, regeneration
 * (server clock), admin sessions and completed levels. Results are sent as idempotent events;
 * while offline they wait in a local queue and are replayed later. The client only applies
 * them optimistically for display - it never regenerates lives on its own clock.
 *
 * Local-only (no backend): lives and regeneration are tracked on this device with Date.now().
 * That mode cannot be protected against clock changes and has no admin mode.
 */

export const LOCAL_MAX_LIVES = 5
export const LOCAL_REGEN_MS = 20 * 60 * 1000
export const TOTAL_LEVELS = 800

export interface LoopEvent {
  id: string
  kind: 'fail' | 'complete'
  level: number
}

export interface LoopAccount {
  lives: number
  maxLives: number
  /** Local epoch ms when the next life arrives (display only), null when full. */
  nextLifeAt: number | null
  regenSeconds: number
  completed: number[]
  currentLevel: number
  admin: boolean
  adminConfigured: boolean
  totalLevels: number
}

interface ServerState {
  lives: number
  max_lives: number
  regen_seconds: number
  next_life_at: string | null
  server_now: string
  completed: number[]
  current_level: number
  total_levels: number
  admin: boolean
  admin_configured: boolean
}

const cacheKey = (p: string) => `loopsort:${p}:state`
const queueKey = (p: string) => `loopsort:${p}:queue`

function fromServer(s: ServerState): LoopAccount {
  // translate the server's next-life timestamp to the local clock using the server's "now"
  const offset = new Date(s.server_now).getTime() - Date.now()
  return {
    lives: s.lives,
    maxLives: s.max_lives,
    regenSeconds: s.regen_seconds,
    nextLifeAt: s.next_life_at ? new Date(s.next_life_at).getTime() - offset : null,
    completed: s.completed ?? [],
    currentLevel: s.current_level,
    admin: s.admin,
    adminConfigured: s.admin_configured,
    totalLevels: s.total_levels,
  }
}

/** Optimistically applies queued events on top of the last known server state. */
export function applyLocally(base: LoopAccount, events: LoopEvent[]): LoopAccount {
  let acc = { ...base, completed: [...base.completed] }
  for (const e of events) {
    if (e.kind === 'fail' && !acc.admin) {
      if (acc.lives >= acc.maxLives) acc.nextLifeAt = null // server will start the timer
      acc.lives = Math.max(0, acc.lives - 1)
    } else if (e.kind === 'complete' && !acc.completed.includes(e.level)) {
      acc = { ...acc, completed: [...acc.completed, e.level].sort((a, b) => a - b), currentLevel: Math.min(acc.totalLevels, e.level + 1) }
    }
  }
  return acc
}

/** Local-only regeneration (device clock). */
export function regenLocal(acc: LoopAccount, anchor: number, now: number): { acc: LoopAccount; anchor: number } {
  if (acc.lives >= acc.maxLives) return { acc: { ...acc, lives: acc.maxLives, nextLifeAt: null }, anchor: now }
  const n = Math.floor((now - anchor) / LOCAL_REGEN_MS)
  let lives = acc.lives
  let a = anchor
  if (n > 0) {
    lives = Math.min(acc.maxLives, lives + n)
    a = lives >= acc.maxLives ? now : anchor + n * LOCAL_REGEN_MS
  }
  return { acc: { ...acc, lives, nextLifeAt: lives < acc.maxLives ? a + LOCAL_REGEN_MS : null }, anchor: a }
}

const LOCAL_DEFAULT: LoopAccount = {
  lives: LOCAL_MAX_LIVES,
  maxLives: LOCAL_MAX_LIVES,
  nextLifeAt: null,
  regenSeconds: LOCAL_REGEN_MS / 1000,
  completed: [],
  currentLevel: 1,
  admin: false,
  adminConfigured: false,
  totalLevels: TOTAL_LEVELS,
}

export function useLoopAccount() {
  const { player, online } = usePlayer()
  const key = player?.id ?? 'anon'
  const isOnlineMode = backendConfigured && Boolean(player?.registered)
  const [account, setAccount] = useState<LoopAccount>(() => readJSON<LoopAccount>(cacheKey(key), LOCAL_DEFAULT))
  const [queue, setQueue] = useState<LoopEvent[]>(() => readJSON<LoopEvent[]>(queueKey(key), []))
  const [error, setError] = useState<string | null>(null)
  const [synced, setSynced] = useState(false)
  const base = useRef<LoopAccount>(account)
  const inflight = useRef<Promise<void> | null>(null)

  const publish = useCallback(
    (serverAcc: LoopAccount, pending: LoopEvent[]) => {
      base.current = serverAcc
      const view = applyLocally(serverAcc, pending)
      writeJSON(cacheKey(key), serverAcc)
      setAccount(view)
    },
    [key],
  )

  const saveQueue = useCallback(
    (q: LoopEvent[]) => {
      writeJSON(queueKey(key), q)
      setQueue(q)
    },
    [key],
  )

  // local-only mode: regenerate on the device clock
  const localTick = useCallback(() => {
    const anchor = readJSON<number>(`loopsort:${key}:anchor`, Date.now())
    const r = regenLocal(base.current, anchor, Date.now())
    writeJSON(`loopsort:${key}:anchor`, r.anchor)
    base.current = r.acc
    writeJSON(cacheKey(key), r.acc)
    setAccount(r.acc)
  }, [key])

  /** Sends queued events (or just fetches state). Concurrent callers share one in-flight request. */
  const flush = useCallback((): Promise<void> => {
    if (!isOnlineMode) return Promise.resolve()
    if (inflight.current) return inflight.current
    const run = (async () => {
      try {
        // loop until the queue is drained, so callers awaiting flush() see every event applied
        for (;;) {
          const q = readJSON<LoopEvent[]>(queueKey(key), [])
          const batch = q.slice(0, 50)
          const res = batch.length
            ? await rpc<{ state: ServerState }>('loop_sort_apply_events', { p_events: batch }).then((r) => r.state)
            : await rpc<ServerState>('loop_sort_state')
          const rest = readJSON<LoopEvent[]>(queueKey(key), []).filter((e) => !batch.some((x) => x.id === e.id))
          saveQueue(rest)
          publish(fromServer(res), rest)
          setSynced(true)
          setError(null)
          if (!rest.length) break
        }
      } catch (err) {
        if (!(err instanceof ApiError && err.code === 'network')) setError('Could not reach the Chakkar Cubes server - playing with your last known lives.')
      }
    })()
    // assign first, clear after: a synchronous finish must never leave the marker stuck
    inflight.current = run
    void run.finally(() => {
      if (inflight.current === run) inflight.current = null
    })
    return run
  }, [isOnlineMode, key, publish, saveQueue])

  useEffect(() => {
    base.current = readJSON<LoopAccount>(cacheKey(key), LOCAL_DEFAULT)
    const q = readJSON<LoopEvent[]>(queueKey(key), [])
    setQueue(q)
    setAccount(applyLocally(base.current, q))
    if (isOnlineMode) void flush()
    else localTick()
  }, [key, isOnlineMode, flush, localTick])

  useEffect(() => {
    if (isOnlineMode && online) void flush()
  }, [online, isOnlineMode, flush])

  // refresh when the next life is due (server decides; we just ask again)
  useEffect(() => {
    if (account.nextLifeAt === null) return
    const wait = Math.max(1000, account.nextLifeAt - Date.now() + 500)
    const t = window.setTimeout(() => (isOnlineMode ? void flush() : localTick()), Math.min(wait, 2 ** 31 - 1))
    return () => window.clearTimeout(t)
  }, [account.nextLifeAt, isOnlineMode, flush, localTick])

  const record = useCallback(
    (kind: LoopEvent['kind'], level: number) => {
      const event: LoopEvent = { id: uuid(), kind, level }
      if (isOnlineMode) {
        const q = [...readJSON<LoopEvent[]>(queueKey(key), []), event]
        saveQueue(q)
        setAccount(applyLocally(base.current, q))
        void flush()
      } else {
        let acc = base.current
        if (kind === 'fail' && acc.lives >= acc.maxLives) writeJSON(`loopsort:${key}:anchor`, Date.now())
        acc = applyLocally(acc, [event])
        if (kind === 'fail') acc = regenLocal(acc, readJSON<number>(`loopsort:${key}:anchor`, Date.now()), Date.now()).acc
        base.current = acc
        writeJSON(cacheKey(key), acc)
        setAccount(acc)
      }
    },
    [isOnlineMode, key, saveQueue, flush],
  )

  const enterAdmin = useCallback(
    async (pin: string) => {
      if (!isOnlineMode) throw new ApiError('not_configured')
      await flush()
      const s = await rpc<ServerState>('loop_sort_enter_admin', { p_pin: pin })
      publish(fromServer(s), readJSON<LoopEvent[]>(queueKey(key), []))
    },
    [isOnlineMode, flush, publish, key],
  )

  const exitAdmin = useCallback(async () => {
    if (!isOnlineMode) return
    // send pending admin-mode results first so they are judged while admin is still active
    await flush()
    const s = await rpc<ServerState>('loop_sort_exit_admin')
    publish(fromServer(s), readJSON<LoopEvent[]>(queueKey(key), []))
  }, [isOnlineMode, flush, publish, key])

  const selectLevel = useCallback(
    async (level: number) => {
      if (!isOnlineMode) {
        base.current = { ...base.current, currentLevel: level }
        writeJSON(cacheKey(key), base.current)
        setAccount((a) => ({ ...a, currentLevel: level }))
        return
      }
      setAccount((a) => ({ ...a, currentLevel: level }))
      try {
        const s = await rpc<ServerState>('loop_sort_select_level', { p_level: level })
        publish(fromServer(s), readJSON<LoopEvent[]>(queueKey(key), []))
      } catch {
        /* offline: keep local pointer */
      }
    },
    [isOnlineMode, key, publish],
  )

  return { account, pending: queue.length, error, synced, isOnlineMode, record, enterAdmin, exitAdmin, selectLevel, refresh: flush }
}
