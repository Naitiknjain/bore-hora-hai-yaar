import { shuffle, type Rng } from '../../lib/random'
import type { Difficulty } from '../../types'

export const PAIRS: Record<Difficulty, number> = { easy: 7, medium: 11, hard: 15 }

export const EMOJIS = ['🍕', '🦄', '🚀', '🐯', '🍉', '🎸', '🌵', '🐙', '🍩', '⚽', '🦜', '🎈', '🌈', '🐼', '🍔', '🦖', '🎲', '🍦', '🐳', '🌻']

export interface Card {
  id: number
  emoji: string
  matched: boolean
  /** which player matched it (2-player mode) */
  owner?: 0 | 1
}

export interface MemoryState {
  cards: Card[]
  open: number[] // indices currently face-up and unmatched (0..2)
  moves: number // one move = revealing a pair of cards
  pairs: [number, number]
  turn: 0 | 1
  players: 1 | 2
}

export function deal(difficulty: Difficulty, players: 1 | 2, rng: Rng): MemoryState {
  const n = PAIRS[difficulty]
  const chosen = shuffle(rng, EMOJIS).slice(0, n)
  const cards = shuffle(
    rng,
    chosen.flatMap((emoji) => [emoji, emoji]),
  ).map((emoji, id) => ({ id, emoji, matched: false }))
  const turn: 0 | 1 = players === 2 && rng() < 0.5 ? 1 : 0 // starting player randomised per match
  return { cards, open: [], moves: 0, pairs: [0, 0], turn, players }
}

/** Reveals a card. Invalid selections (matched, already open, or two cards already open) are ignored. */
export function reveal(s: MemoryState, index: number): MemoryState {
  const card = s.cards[index]
  if (!card || card.matched || s.open.includes(index) || s.open.length >= 2) return s
  const open = [...s.open, index]
  return { ...s, open, moves: open.length === 2 ? s.moves + 1 : s.moves }
}

export const needsResolve = (s: MemoryState) => s.open.length === 2

export const isMatch = (s: MemoryState) => s.open.length === 2 && s.cards[s.open[0]].emoji === s.cards[s.open[1]].emoji

/**
 * Settles two open cards: a match stays face-up, awards a pair and the same player goes again;
 * a miss flips both back and passes the turn (2-player).
 */
export function resolve(s: MemoryState): MemoryState {
  if (s.open.length !== 2) return s
  if (isMatch(s)) {
    const cards = s.cards.map((c, i) => (s.open.includes(i) ? { ...c, matched: true, owner: s.turn } : c))
    const pairs: [number, number] = [...s.pairs]
    pairs[s.turn] += 1
    return { ...s, cards, open: [], pairs }
  }
  return { ...s, open: [], turn: s.players === 2 ? ((1 - s.turn) as 0 | 1) : s.turn }
}

export const isComplete = (s: MemoryState) => s.cards.every((c) => c.matched)

export function winner(s: MemoryState): 0 | 1 | 'draw' {
  if (s.pairs[0] === s.pairs[1]) return 'draw'
  return s.pairs[0] > s.pairs[1] ? 0 : 1
}
