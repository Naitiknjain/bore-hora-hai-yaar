import type { ComponentType, LazyExoticComponent } from 'react'

export type GameId =
  | 'ludo'
  | 'snake-battle'
  | 'tic-tac-toe'
  | '2048'
  | 'dino-run'
  | 'brick-breaker'
  | 'flappy-style'
  | 'pong'
  | 'memory-match'
  | 'tetris'
  | 'sudoku'
  | 'skater-boy'
  | 'typing-racer'
  | 'loop-sort'
  | 'arrow-go'

export type GameCategory = 'Arcade' | 'Puzzle' | 'Classic' | 'Skill'

export type Difficulty = 'easy' | 'medium' | 'hard'

export type Metrics = Record<string, number>

export type Aggregation = 'best' | 'sum' | 'progress' | 'none'

export interface MetricColumn {
  key: string
  label: string
  format?: 'int' | 'time' | 'decimal' | 'percent'
}

export interface LeaderboardConfig {
  aggregation: Aggregation
  boards: { id: string; label: string }[]
  /** Columns describing rank1/rank2 for display. For 'best' they read the stored metrics. */
  primary: MetricColumn & { source: 'rank1' | 'metric'; lowerIsBetter?: boolean }
  secondary?: MetricColumn & { source: 'rank2' | 'metric'; lowerIsBetter?: boolean }
  /** Short text describing the ranking rule, shown above the table. */
  rule: string
}

export interface GameMeta {
  id: GameId
  name: string
  tagline: string
  description: string
  category: GameCategory
  tags: string[]
  players: string
  /** Tailwind-free raw colours for the card art. */
  colors: { from: string; to: string; accent: string }
  emoji: string
  featured?: boolean
  leaderboard?: LeaderboardConfig
  /** Wide games ask the phone to rotate to landscape when they go fullscreen. */
  orientation?: 'landscape'
  component: LazyExoticComponent<ComponentType>
}

export interface Player {
  /** Stable id. Server player uuid once registered, otherwise a local uuid. */
  id: string
  nickname: string
  createdAt: string
  /** true when the identity exists on the Supabase backend */
  registered: boolean
}

export interface ScoreSubmission {
  submissionId: string
  playerKey: string
  gameId: GameId
  board: string
  metrics: Metrics
  playedAt: string
  sessionId?: string | null
}

export type SyncStatus = 'pending' | 'synced' | 'rejected' | 'local-only'

export interface StoredResult extends ScoreSubmission {
  status: SyncStatus
  error?: string
}

export interface LeaderboardEntry {
  rank: number
  playerId: string
  nickname: string
  rank1: number
  rank2: number
  metrics: Metrics
  achievedAt: string
  results: number
}
