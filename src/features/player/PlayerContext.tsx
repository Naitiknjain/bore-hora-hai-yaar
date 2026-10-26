import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getResults, installSyncTriggers, setSyncPlayer, syncPending } from '../../lib/offline-sync'
import { uuid } from '../../lib/random'
import { clearAppStorage, readJSON, writeJSON } from '../../lib/storage'
import { ApiError, backendConfigured, ensureAuthSession, rpc, supabase } from '../../lib/supabase'
import type { Player } from '../../types'

interface ServerPlayer {
  player_id: string
  nickname: string
  created_at: string
  player_code?: string
}

type Status = 'loading' | 'onboarding' | 'ready'

interface PlayerCtx {
  status: Status
  player: Player | null
  backend: boolean
  online: boolean
  /** Server says this browser is no longer linked to the saved player (e.g. auth storage cleared). */
  needsRelink: boolean
  /** A freshly issued private code to show the player once. Never persisted. */
  issuedCode: string | null
  dismissIssuedCode: () => void
  createPlayer: (nickname: string) => Promise<void>
  recover: (code: string) => Promise<void>
  rename: (nickname: string) => Promise<void>
  rotateCode: () => Promise<string>
  forgetDevice: () => Promise<void>
  /** Retry linking a locally created (offline) player to the backend. */
  retryRegistration: () => Promise<void>
}

const PlayerContext = createContext<PlayerCtx | null>(null)

const NICK_RE = /^[^<>\p{Cc}]{2,20}$/u

/**
 * True for text that looks like a private player code (BHHY-XXXX-..., or 16+ code symbols in dash-separated
 * groups). Such text must never become a public nickname: that would leak most of the secret code.
 */
export function looksLikePlayerCode(raw: string): boolean {
  const t = raw.trim().toUpperCase()
  if (/^BHHY[\s-]*[0-9A-Z]{4}/.test(t)) return true
  return /^[0-9A-Z]{4}([\s-]+[0-9A-Z]{4}){2,}[\s-]*$/.test(t)
}

export function validateNickname(raw: string): string | null {
  const nick = raw.trim().replace(/\s+/g, ' ')
  return NICK_RE.test(nick) && !looksLikePlayerCode(nick) ? nick : null
}

/** Re-keys locally stored data when an offline-created player gets its server id. */
function migrateLocalKey(oldId: string, newId: string) {
  if (oldId === newId) return
  const results = getResults().map((r) => (r.playerKey === oldId ? { ...r, playerKey: newId } : r))
  writeJSON('results', results)
  try {
    const moves: [string, string][] = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i)
      if (k?.includes(`:${oldId}:`)) moves.push([k, k.replace(`:${oldId}:`, `:${newId}:`)])
    }
    for (const [from, to] of moves) {
      const v = localStorage.getItem(from)
      if (v != null) localStorage.setItem(to, v)
      localStorage.removeItem(from)
    }
  } catch {
    /* ignore */
  }
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [player, setPlayer] = useState<Player | null>(() => readJSON<Player | null>('player', null))
  const [status, setStatus] = useState<Status>(() => (readJSON<Player | null>('player', null) ? 'ready' : 'onboarding'))
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  const [needsRelink, setNeedsRelink] = useState(false)
  const [issuedCode, setIssuedCode] = useState<string | null>(null)
  const registering = useRef(false)

  const persist = useCallback((p: Player | null) => {
    setPlayer(p)
    if (p) writeJSON('player', p)
    setSyncPlayer(p)
  }, [])

  useEffect(() => {
    setSyncPlayer(readJSON<Player | null>('player', null))
    installSyncTriggers()
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  const registerOnServer = useCallback(
    async (local: Player) => {
      if (registering.current) return
      registering.current = true
      try {
        await ensureAuthSession()
        let server: ServerPlayer
        try {
          server = await rpc<ServerPlayer>('register_player', { p_nickname: local.nickname })
        } catch (err) {
          if (err instanceof ApiError && err.code === 'already_registered') {
            server = (await rpc<ServerPlayer | null>('me'))!
          } else throw err
        }
        migrateLocalKey(local.id, server.player_id)
        persist({ id: server.player_id, nickname: server.nickname, createdAt: server.created_at, registered: true })
        if (server.player_code) setIssuedCode(server.player_code)
        void syncPending()
      } finally {
        registering.current = false
      }
    },
    [persist],
  )

  // Background reconciliation with the backend; never blocks local play.
  useEffect(() => {
    if (!backendConfigured || !player || !online) return
    let cancelled = false
    ;(async () => {
      try {
        if (!player.registered) {
          await registerOnServer(player)
          return
        }
        const { data } = await supabase!.auth.getSession()
        if (!data.session) {
          if (!cancelled) setNeedsRelink(true)
          return
        }
        const me = await rpc<ServerPlayer | null>('me')
        if (cancelled) return
        if (!me || me.player_id !== player.id) {
          setNeedsRelink(true)
        } else {
          setNeedsRelink(false)
          if (me.nickname !== player.nickname) persist({ ...player, nickname: me.nickname })
          void syncPending()
        }
      } catch {
        /* offline or backend unavailable: keep playing locally */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [player, online, registerOnServer, persist])

  const createPlayer = useCallback(
    async (nickname: string) => {
      const nick = validateNickname(nickname)
      if (!nick) throw new ApiError('invalid_nickname')
      const local: Player = { id: uuid(), nickname: nick, createdAt: new Date().toISOString(), registered: false }
      if (backendConfigured && navigator.onLine) {
        // Throws on server errors (e.g. rate limit) so the form can show them.
        try {
          await registerOnServer(local)
          setStatus('ready')
          return
        } catch (err) {
          if (!(err instanceof ApiError) || err.code !== 'network') throw err
        }
      }
      persist(local)
      setStatus('ready')
    },
    [persist, registerOnServer],
  )

  const recover = useCallback(
    async (code: string) => {
      await ensureAuthSession()
      const server = await rpc<ServerPlayer>('recover_player', { p_code: code })
      persist({ id: server.player_id, nickname: server.nickname, createdAt: server.created_at, registered: true })
      setNeedsRelink(false)
      setStatus('ready')
      void syncPending()
    },
    [persist],
  )

  const rename = useCallback(
    async (nickname: string) => {
      const nick = validateNickname(nickname)
      if (!nick) throw new ApiError('invalid_nickname')
      if (!player) return
      if (player.registered) {
        const server = await rpc<ServerPlayer>('rename_player', { p_nickname: nick })
        persist({ ...player, nickname: server.nickname })
      } else {
        persist({ ...player, nickname: nick })
      }
    },
    [player, persist],
  )

  const rotateCode = useCallback(async () => {
    const res = await rpc<{ player_code: string }>('rotate_player_code')
    return res.player_code
  }, [])

  const forgetDevice = useCallback(async () => {
    if (backendConfigured && player?.registered) {
      try {
        await rpc('forget_device')
        await supabase?.auth.signOut()
      } catch {
        /* still clear locally */
      }
    }
    clearAppStorage()
    setSyncPlayer(null)
    setPlayer(null)
    setNeedsRelink(false)
    setStatus('onboarding')
  }, [player])

  const retryRegistration = useCallback(async () => {
    if (player && !player.registered) await registerOnServer(player)
  }, [player, registerOnServer])

  const value = useMemo<PlayerCtx>(
    () => ({
      status,
      player,
      backend: backendConfigured,
      online,
      needsRelink,
      issuedCode,
      dismissIssuedCode: () => setIssuedCode(null),
      createPlayer,
      recover,
      rename,
      rotateCode,
      forgetDevice,
      retryRegistration,
    }),
    [status, player, online, needsRelink, issuedCode, createPlayer, recover, rename, rotateCode, forgetDevice, retryRegistration],
  )

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
}

export function usePlayer(): PlayerCtx {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error('usePlayer must be used inside PlayerProvider')
  return ctx
}
