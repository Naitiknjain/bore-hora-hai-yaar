import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// online mode: a registered player and a configured backend, with the server mocked
const rpc = vi.fn()
vi.mock('../../src/lib/supabase', () => ({
  backendConfigured: true,
  rpc: (...args: unknown[]) => rpc(...args),
  ApiError: class ApiError extends Error {
    code: string
    constructor(code: string) {
      super(code)
      this.code = code
    }
  },
}))
vi.mock('../../src/features/player/PlayerContext', () => ({
  usePlayer: () => ({ player: { id: 'p1', registered: true }, online: true }),
}))

const { useLoopWallet } = await import('../../src/games/loop-sort/wallet')
const { ApiError } = await import('../../src/lib/supabase')

const server = (coins: number, undo = 2) => ({ coins, boosters: { undo, shuffle: 2, extra_truck: 2, extra_slot: 2 } })

beforeEach(() => {
  localStorage.clear()
  rpc.mockReset()
})

describe('online wallet', () => {
  it('shows the server wallet, and fetches it again once completed levels have synced (coins are paid there)', async () => {
    rpc.mockResolvedValue(server(500))
    const { result, rerender } = renderHook(({ done, pending }) => useLoopWallet(done, pending, false), { initialProps: { done: [] as number[], pending: 0 } })
    await waitFor(() => expect(result.current.wallet.coins).toBe(500))
    expect(rpc).toHaveBeenCalledWith('loop_sort_wallet')
    // a level is finished: first optimistically (result still pending), then synced
    rpc.mockResolvedValue(server(510))
    rerender({ done: [1], pending: 1 })
    rerender({ done: [1], pending: 0 })
    await waitFor(() => expect(result.current.wallet.coins).toBe(510))
  })

  it('spends optimistically, sends the use to the server and adopts its answer', async () => {
    rpc.mockResolvedValueOnce(server(500))
    const { result } = renderHook(() => useLoopWallet([], 0, false))
    await waitFor(() => expect(result.current.wallet.coins).toBe(500))
    rpc.mockResolvedValueOnce({ results: [], wallet: server(500, 1) })
    act(() => void result.current.spendBooster('undo'))
    expect(result.current.wallet.boosters.undo).toBe(1)
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('loop_sort_wallet_events', { p_events: [expect.objectContaining({ kind: 'use', booster: 'undo' })] }))
    await waitFor(() => expect(localStorage.getItem('bhhy:loopsort:p1:wallet-queue')).toBe('[]'))
  })

  it('keeps uses made offline in the queue and sends them, once, when the server is back', async () => {
    rpc.mockResolvedValueOnce(server(500))
    const { result, rerender } = renderHook(({ done }) => useLoopWallet(done, 0, false), { initialProps: { done: [] as number[] } })
    await waitFor(() => expect(result.current.wallet.coins).toBe(500))
    rpc.mockRejectedValueOnce(new ApiError('network'))
    act(() => void result.current.spendBooster('shuffle'))
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2))
    // still shown as spent, still queued
    expect(result.current.wallet.boosters.shuffle).toBe(1)
    const queued = JSON.parse(localStorage.getItem('bhhy:loopsort:p1:wallet-queue')!)
    expect(queued).toHaveLength(1)
    // back online (any later sync, e.g. after the next level)
    rpc.mockResolvedValue({ results: [], wallet: { ...server(500), boosters: { ...server(500).boosters, shuffle: 1 } } })
    rerender({ done: [1] })
    await waitFor(() => expect(localStorage.getItem('bhhy:loopsort:p1:wallet-queue')).toBe('[]'))
    const sent = rpc.mock.calls.filter((c) => c[0] === 'loop_sort_wallet_events').map((c) => (c[1] as { p_events: { id: string }[] }).p_events[0].id)
    expect(new Set(sent).size).toBe(1) // the retry reuses the same event id, so the server counts it once
  })

  it('when the server refuses a use, the wallet shows what the server says', async () => {
    rpc.mockResolvedValueOnce(server(100, 0))
    const { result } = renderHook(() => useLoopWallet([], 0, false))
    await waitFor(() => expect(result.current.wallet.coins).toBe(100))
    expect(result.current.spendBooster('undo')).toBe(false) // 300 needed, only 100: refused locally already
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})
