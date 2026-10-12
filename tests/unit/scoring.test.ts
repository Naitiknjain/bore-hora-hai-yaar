import { beforeEach, describe, expect, it } from 'vitest'
import { computeRankKeys, localSummary, wpmFrom } from '../../src/lib/scoring'
import { mergeProgress } from '../../src/lib/progress'
import { getResults, recordResult, setSyncPlayer } from '../../src/lib/offline-sync'
import type { StoredResult } from '../../src/types'

describe('score validation mirror', () => {
  it('ranks memory match by time then moves (lower is better)', () => {
    const a = computeRankKeys('memory-match', 'easy', { pairs: 7, moves: 10, timeMs: 30000 })!
    const b = computeRankKeys('memory-match', 'easy', { pairs: 7, moves: 9, timeMs: 30000 })!
    const c = computeRankKeys('memory-match', 'easy', { pairs: 7, moves: 8, timeMs: 40000 })!
    expect(b.rank1).toBe(a.rank1)
    expect(b.rank2).toBeGreaterThan(a.rank2)
    expect(a.rank1).toBeGreaterThan(c.rank1)
  })

  it('rejects impossible results', () => {
    expect(computeRankKeys('memory-match', 'hard', { pairs: 7, moves: 10, timeMs: 30000 })).toBeNull()
    expect(computeRankKeys('ludo', 'easy', { position: 3, points: 10 })).toBeNull()
    expect(computeRankKeys('pong', 'easy', { target: 7, playerScore: 7, cpuScore: 7 })).toBeNull()
    expect(computeRankKeys('2048', 'classic', { score: 10, maxTile: 6 })).toBeNull()
    expect(computeRankKeys('typing-racer', 'easy', { wpm: 300, accuracy: 100, timeMs: 1000, chars: 10 })).toBeNull()
    expect(computeRankKeys('loop-sort', 'classic', { score: 1 })).toBeNull()
  })

  it('uses the standard WPM formula', () => {
    expect(wpmFrom(250, 60000)).toBe(50)
    const k = computeRankKeys('typing-racer', 'easy', { wpm: 50, accuracy: 97.5, timeMs: 60000, chars: 250 })
    expect(k).toEqual({ rank1: 50, rank2: 97.5 })
  })

  it('sums Ludo/Pong style boards and picks the best for others', () => {
    const base = { playerKey: 'p', playedAt: new Date().toISOString(), status: 'local-only' as const }
    const rows: StoredResult[] = [
      { ...base, submissionId: '1', gameId: 'ludo', board: 'easy', metrics: { position: 1, points: 10 } },
      { ...base, submissionId: '2', gameId: 'ludo', board: 'easy', metrics: { position: 2, points: 5 } },
      { ...base, submissionId: '3', gameId: 'ludo', board: 'hard', metrics: { position: 1, points: 10 } },
      { ...base, submissionId: '4', gameId: 'tetris', board: 'classic', metrics: { score: 100, lines: 2 } },
      { ...base, submissionId: '5', gameId: 'tetris', board: 'classic', metrics: { score: 900, lines: 9 } },
    ]
    expect(localSummary(rows, 'ludo', 'easy')).toMatchObject({ rank1: 15, rank2: 1, results: 2 })
    expect(localSummary(rows, 'tetris', 'classic')).toMatchObject({ rank1: 900, metrics: { score: 900 } })
  })
})

describe('progress merge', () => {
  it('is commutative and idempotent', () => {
    const a = { completed: [1, 2, 5], best: { 1: 100, 5: 20 } }
    const b = { completed: [2, 3], best: { 1: 50, 3: 70 } }
    const ab = mergeProgress(a, b)
    expect(ab).toEqual(mergeProgress(b, a))
    expect(mergeProgress(ab, ab)).toEqual(ab)
    expect(ab).toEqual({ completed: [1, 2, 3, 5], best: { 1: 100, 3: 70, 5: 20 } })
  })
})

describe('offline results log', () => {
  beforeEach(() => localStorage.clear())

  it('stores results locally with unique submission ids and skips invalid ones', () => {
    setSyncPlayer({ id: 'local-1', registered: false })
    const a = recordResult({ gameId: 'tetris', board: 'classic', metrics: { score: 10, lines: 1 } })
    const b = recordResult({ gameId: 'tetris', board: 'classic', metrics: { score: 10, lines: 1 } })
    const bad = recordResult({ gameId: 'tetris', board: 'classic', metrics: { score: -1, lines: 1 } })
    expect(a?.submissionId).not.toBe(b?.submissionId)
    expect(bad).toBeNull()
    const all = getResults()
    expect(all).toHaveLength(2)
    // no backend configured in tests => local-only, never "pending"
    expect(all.every((r) => r.status === 'local-only')).toBe(true)
  })
})
