import { beforeEach, describe, expect, it, vi } from 'vitest'

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

const sync = await import('../../src/lib/offline-sync')
const { ApiError } = await import('../../src/lib/supabase')

beforeEach(() => {
  localStorage.clear()
  rpc.mockReset()
})

describe('offline sync queue', () => {
  it('still syncs after an early call made before the player was registered (regression)', async () => {
    // app start: no registered player yet -> the sync exits immediately
    sync.setSyncPlayer({ id: 'p1', registered: false })
    await sync.syncPending()
    // player registers, then finishes a game
    sync.setSyncPlayer({ id: 'p1', registered: true })
    rpc.mockResolvedValue({ status: 'accepted' })
    sync.recordResult({ gameId: 'memory-match', board: 'easy', metrics: { pairs: 7, moves: 10, timeMs: 30000 } })
    await sync.syncPending()
    await vi.waitFor(() => expect(sync.getResults()[0].status).toBe('synced'))
    expect(rpc).toHaveBeenCalledWith('submit_score', expect.objectContaining({ p_game: 'memory-match', p_board: 'easy' }))
  })

  it('keeps results pending on network errors and retries later without duplicates', async () => {
    sync.setSyncPlayer({ id: 'p2', registered: true })
    rpc.mockRejectedValueOnce(new ApiError('network'))
    const r = sync.recordResult({ gameId: 'tetris', board: 'classic', metrics: { score: 100, lines: 1 } })!
    await sync.syncPending()
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledTimes(1))
    expect(sync.getResults()[0].status).toBe('pending')
    rpc.mockResolvedValue({ status: 'accepted' })
    await sync.syncPending()
    await vi.waitFor(() => expect(sync.getResults()[0].status).toBe('synced'))
    // the same submission id is reused for the retry (server dedupes on it)
    expect(rpc.mock.calls.every((c) => (c[1] as { p_submission_id: string }).p_submission_id === r.submissionId)).toBe(true)
  })

  it('marks server-rejected results as rejected instead of retrying forever', async () => {
    sync.setSyncPlayer({ id: 'p3', registered: true })
    rpc.mockRejectedValue(new ApiError('invalid_metrics'))
    sync.recordResult({ gameId: 'tetris', board: 'classic', metrics: { score: 5, lines: 0 } })
    await vi.waitFor(() => expect(sync.getResults()[0].status).toBe('rejected'))
  })
})
