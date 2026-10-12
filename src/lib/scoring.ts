import type { GameId, LeaderboardEntry, Metrics, StoredResult } from '../types'

/**
 * Client mirror of private.validate_score (supabase/migrations/..._scores_leaderboards.sql).
 * Used for local (device) leaderboards and to avoid queueing results the server would reject.
 * The server remains the authority; keep both in sync when changing rules.
 * Convention: higher rank1/rank2 is better.
 */
export interface RankKeys {
  rank1: number
  rank2: number
}

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
const isNum = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max

export const MEMORY_PAIRS: Record<string, number> = { easy: 7, medium: 11, hard: 15 }

export function wpmFrom(chars: number, timeMs: number): number {
  if (timeMs <= 0) return 0
  return Math.round((chars / 5 / (timeMs / 60000)) * 10) / 10
}

export function computeRankKeys(game: GameId, board: string, m: Metrics): RankKeys | null {
  switch (game) {
    case 'ludo': {
      if (!isInt(m.position, 1, 4)) return null
      const expected = m.position === 1 ? 10 : m.position === 2 ? 5 : 0
      if (m.points !== expected) return null
      return { rank1: m.points, rank2: m.position === 1 ? 1 : 0 }
    }
    case 'snake-battle':
      return isInt(m.score, 0, 397) ? { rank1: m.score, rank2: 0 } : null
    case 'tic-tac-toe':
      return isInt(m.result, -1, 1) ? { rank1: m.result === 1 ? 1 : 0, rank2: m.result === 0 ? 1 : 0 } : null
    case '2048':
      if (!isInt(m.score, 0, 4_000_000) || !isInt(m.maxTile, 2, 131072) || (m.maxTile & (m.maxTile - 1)) !== 0) return null
      return { rank1: m.score, rank2: m.maxTile }
    case 'dino-run':
      return isInt(m.score, 0, 1_000_000) ? { rank1: m.score, rank2: 0 } : null
    case 'brick-breaker':
      return isInt(m.score, 0, 100_000) && isInt(m.level, 1, 10) ? { rank1: m.score, rank2: m.level } : null
    case 'flappy-style':
      return isInt(m.score, 0, 100_000) ? { rank1: m.score, rank2: 0 } : null
    case 'pong': {
      const t = m.target
      if (![5, 7, 11].includes(t) || !isInt(m.playerScore, 0, t) || !isInt(m.cpuScore, 0, t)) return null
      const valid = (m.playerScore === t && m.cpuScore < t) || (m.cpuScore === t && m.playerScore < t)
      return valid ? { rank1: m.playerScore === t ? 1 : 0, rank2: m.playerScore - m.cpuScore } : null
    }
    case 'memory-match': {
      const pairs = MEMORY_PAIRS[board]
      if (!pairs || m.pairs !== pairs || !isInt(m.moves, pairs, 5000) || !isInt(m.timeMs, m.moves * 250, 86_400_000)) return null
      return { rank1: -m.timeMs, rank2: -m.moves }
    }
    case 'tetris':
      return isInt(m.score, 0, 10_000_000) && isInt(m.lines, 0, 100_000) ? { rank1: m.score, rank2: m.lines } : null
    case 'sudoku':
      return isInt(m.timeMs, 15000, 86_400_000) && isInt(m.mistakes, 0, 10000) ? { rank1: -m.timeMs, rank2: -m.mistakes } : null
    case 'typing-racer': {
      if (!isNum(m.wpm, 0, 250) || !isNum(m.accuracy, 0, 100) || !isInt(m.timeMs, 1000, 3_600_000) || !isInt(m.chars, 1, 10000))
        return null
      if (Math.abs(m.wpm - wpmFrom(m.chars, m.timeMs)) > 1) return null
      return { rank1: Math.round(m.wpm * 10) / 10, rank2: Math.round(m.accuracy * 10) / 10 }
    }
    default:
      return null
  }
}

/** Aggregation per game (mirrors public.games.aggregation). */
export const AGGREGATION: Record<GameId, 'best' | 'sum' | 'progress' | 'none'> = {
  ludo: 'sum',
  'snake-battle': 'best',
  'tic-tac-toe': 'sum',
  '2048': 'best',
  'dino-run': 'best',
  'brick-breaker': 'best',
  'flappy-style': 'best',
  pong: 'sum',
  'memory-match': 'best',
  tetris: 'best',
  sudoku: 'best',
  'skater-boy': 'progress',
  'typing-racer': 'best',
  'loop-sort': 'none',
  'arrow-go': 'progress',
}

/** Builds a single-player "device" leaderboard row from locally stored results. */
export function localSummary(results: StoredResult[], game: GameId, board: string): LeaderboardEntry | null {
  const rows = results.filter((r) => r.gameId === game && r.board === board)
  if (!rows.length) return null
  const keyed = rows
    .map((r) => ({ r, k: computeRankKeys(game, board, r.metrics) }))
    .filter((x): x is { r: StoredResult; k: RankKeys } => x.k !== null)
  if (!keyed.length) return null
  const agg = AGGREGATION[game]
  if (agg === 'sum') {
    return {
      rank: 1,
      playerId: rows[0].playerKey,
      nickname: '',
      rank1: keyed.reduce((s, x) => s + x.k.rank1, 0),
      rank2: keyed.reduce((s, x) => s + x.k.rank2, 0),
      metrics: {},
      achievedAt: keyed[keyed.length - 1].r.playedAt,
      results: keyed.length,
    }
  }
  const best = keyed.reduce((a, b) =>
    b.k.rank1 > a.k.rank1 || (b.k.rank1 === a.k.rank1 && b.k.rank2 > a.k.rank2) ? b : a,
  )
  return {
    rank: 1,
    playerId: best.r.playerKey,
    nickname: '',
    rank1: best.k.rank1,
    rank2: best.k.rank2,
    metrics: best.r.metrics,
    achievedAt: best.r.playedAt,
    results: keyed.length,
  }
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export function formatMs(ms: number): string {
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  return formatDuration(ms)
}
