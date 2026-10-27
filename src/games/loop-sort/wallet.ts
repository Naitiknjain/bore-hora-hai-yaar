import { useCallback, useEffect, useRef, useState } from 'react'
import { usePlayer } from '../../features/player/PlayerContext'
import { uuid } from '../../lib/random'
import { readJSON, writeJSON } from '../../lib/storage'
import { backendConfigured, rpc } from '../../lib/supabase'
import type { AbilityId } from './config'
import { difficultyOf } from './logic'

/**
 * Chakkar Cubes wallet: coins and a stock of each booster.
 *
 * Online (backend configured + registered player): the server owns the wallet
 * (supabase/migrations/20261027000002_loop_sort_wallet.sql). Booster uses are sent as idempotent
 * events, queued while offline, and applied here optimistically for display. Coins for completed
 * levels are paid by the server from the player's progress.
 *
 * Local-only (no backend): the same rules run on this device.
 */

export interface Wallet {
  coins: number
  boosters: Record<AbilityId, number>
}

export interface WalletEvent {
  id: string
  kind: 'use' | 'buy'
  booster: AbilityId
}

export const WALLET_START: Wallet = { coins: 500, boosters: { undo: 2, shuffle: 2, extraTruck: 2, extraSlot: 2 } }
/** Coins for a booster bought when the stock is empty (the reference's prices where known). */
export const BOOSTER_PRICE: Record<AbilityId, number> = { undo: 300, shuffle: 300, extraTruck: 900, extraSlot: 800 }

/** Coins for completing a level the first time: 10, Hard 30, Super Hard 50 (same as the server). */
export function levelReward(n: number): number {
  const d = difficultyOf(n)
  return d === 'super' ? 50 : d === 'hard' ? 30 : 10
}

/** Whether a booster can be used now: from the stock, or bought on the spot. Admin Mode is free. */
export function canAfford(w: Wallet, id: AbilityId, admin: boolean): boolean {
  return admin || w.boosters[id] > 0 || w.coins >= BOOSTER_PRICE[id]
}

/** One event on a wallet; null when it is not affordable (the server rejects it the same way). */
export function applyWalletEvent(w: Wallet, e: Pick<WalletEvent, 'kind' | 'booster'>, admin: boolean): Wallet | null {
  const price = BOOSTER_PRICE[e.booster]
  const stock = w.boosters[e.booster]
  if (e.kind === 'use') {
    if (admin) return w
    if (stock > 0) return { ...w, boosters: { ...w.boosters, [e.booster]: stock - 1 } }
    return w.coins >= price ? { ...w, coins: w.coins - price } : null
  }
  return w.coins >= price ? { coins: w.coins - price, boosters: { ...w.boosters, [e.booster]: stock + 1 } } : null
}

export function applyWalletLocally(base: Wallet, events: WalletEvent[], admin: boolean): Wallet {
  return events.reduce((w, e) => applyWalletEvent(w, e, admin) ?? w, base)
}

/** Pays first-completion coins for levels not rewarded yet (local-only mode). */
export function claimRewards(w: Wallet, rewarded: number[], completed: number[]): { wallet: Wallet; rewarded: number[] } {
  const fresh = completed.filter((n) => !rewarded.includes(n))
  if (!fresh.length) return { wallet: w, rewarded }
  return { wallet: { ...w, coins: w.coins + fresh.reduce((s, n) => s + levelReward(n), 0) }, rewarded: [...rewarded, ...fresh].sort((a, b) => a - b) }
}

interface ServerWallet {
  coins: number
  boosters: { undo: number; shuffle: number; extra_truck: number; extra_slot: number }
}

const TO_SERVER: Record<AbilityId, string> = { undo: 'undo', shuffle: 'shuffle', extraTruck: 'extra_truck', extraSlot: 'extra_slot' }

const fromServer = (s: ServerWallet): Wallet => ({
  coins: s.coins,
  boosters: { undo: s.boosters.undo, shuffle: s.boosters.shuffle, extraTruck: s.boosters.extra_truck, extraSlot: s.boosters.extra_slot },
})

const walletKey = (p: string) => `loopsort:${p}:wallet`
const walletQueueKey = (p: string) => `loopsort:${p}:wallet-queue`
const rewardedKey = (p: string) => `loopsort:${p}:rewarded`

/**
 * The player's wallet. `completed` is the account's completed levels: in local-only mode new
 * completions pay coins here; online the server pays them, so the wallet is fetched again whenever
 * `completed` changes or the account's pending results (`pendingResults`) have been synced.
 */
export function useLoopWallet(completed: number[], pendingResults: number, admin: boolean) {
  const { player, online } = usePlayer()
  const key = player?.id ?? 'anon'
  const isOnlineMode = backendConfigured && Boolean(player?.registered)
  const base = useRef<Wallet>(readJSON<Wallet>(walletKey(key), WALLET_START))
  const [wallet, setWallet] = useState<Wallet>(() => applyWalletLocally(base.current, readJSON<WalletEvent[]>(walletQueueKey(key), []), admin))
  const inflight = useRef<Promise<void> | null>(null)

  const publish = useCallback(
    (w: Wallet) => {
      base.current = w
      writeJSON(walletKey(key), w)
      setWallet(applyWalletLocally(w, readJSON<WalletEvent[]>(walletQueueKey(key), []), admin))
    },
    [key, admin],
  )

  /** Sends queued booster events (or just fetches the wallet). Concurrent callers share one request. */
  const flush = useCallback((): Promise<void> => {
    if (!isOnlineMode) return Promise.resolve()
    if (inflight.current) return inflight.current
    const run = (async () => {
      try {
        for (;;) {
          const q = readJSON<WalletEvent[]>(walletQueueKey(key), [])
          const batch = q.slice(0, 50)
          const res = batch.length
            ? await rpc<{ wallet: ServerWallet }>('loop_sort_wallet_events', { p_events: batch.map((e) => ({ ...e, booster: TO_SERVER[e.booster] })) }).then((r) => r.wallet)
            : await rpc<ServerWallet>('loop_sort_wallet')
          writeJSON(walletQueueKey(key), readJSON<WalletEvent[]>(walletQueueKey(key), []).filter((e) => !batch.some((x) => x.id === e.id)))
          publish(fromServer(res))
          if (!readJSON<WalletEvent[]>(walletQueueKey(key), []).length) break
        }
      } catch {
        // offline or the server refused: keep the queue and show the last known wallet; the next
        // flush (reconnect, next level, next booster) tries again
      }
    })()
    inflight.current = run
    void run.finally(() => {
      if (inflight.current === run) inflight.current = null
    })
    return run
  }, [isOnlineMode, key, publish])

  // load on player change; online fetch whenever completed levels change (the server pays coins for them)
  const completedKey = completed.join(',')
  const synced = pendingResults === 0
  useEffect(() => {
    base.current = readJSON<Wallet>(walletKey(key), WALLET_START)
    if (isOnlineMode) {
      publish(base.current)
      void flush()
      return
    }
    const r = claimRewards(base.current, readJSON<number[]>(rewardedKey(key), []), completedKey ? completedKey.split(',').map(Number) : [])
    writeJSON(rewardedKey(key), r.rewarded)
    publish(r.wallet)
  }, [key, isOnlineMode, completedKey, synced, flush, publish])

  useEffect(() => {
    if (isOnlineMode && online) void flush()
  }, [online, isOnlineMode, flush])

  /** Uses one booster (from the stock, or bought with coins). Returns false when it is not affordable. */
  const spendBooster = useCallback(
    (booster: AbilityId): boolean => {
      if (!canAfford(wallet, booster, admin)) return false
      const event: WalletEvent = { id: uuid(), kind: 'use', booster }
      if (isOnlineMode) {
        writeJSON(walletQueueKey(key), [...readJSON<WalletEvent[]>(walletQueueKey(key), []), event])
        setWallet((w) => applyWalletEvent(w, event, admin) ?? w)
        void flush()
      } else publish(applyWalletEvent(base.current, event, admin) ?? base.current)
      return true
    },
    [wallet, admin, isOnlineMode, key, flush, publish],
  )

  return { wallet, spendBooster, isOnlineMode }
}
