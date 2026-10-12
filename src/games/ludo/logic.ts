import type { Rng } from '../../lib/random'
import type { Difficulty } from '../../types'

/**
 * Token position (relative to its colour):
 *  -1        in base (yard)
 *   0..50    on the shared 52-square track (0 = own start square)
 *  51..55    own home column
 *   56       home (finished)
 * Exact roll is required to reach 56.
 */
export const BASE = -1
export const LAST_TRACK = 50
export const HOME = 56
export const TRACK_LEN = 52
export const START_INDEX = [0, 13, 26, 39] as const // red, green, yellow, blue (clockwise)
export const SAFE_SQUARES = new Set([0, 8, 13, 21, 26, 34, 39, 47]) // start squares + stars

export const COLORS = [
  { name: 'Red', fill: '#ff4d5e', dark: '#b3263a', light: '#ffd0d5' },
  { name: 'Green', fill: '#3ee08f', dark: '#1f9a5c', light: '#c9f7df' },
  { name: 'Yellow', fill: '#ffd23f', dark: '#c99500', light: '#fff1c2' },
  { name: 'Blue', fill: '#4cc9f0', dark: '#1d8fb3', light: '#cdeffb' },
] as const

export type SeatType = 'human' | 'bot'

export interface LudoState {
  tokens: number[][] // [player][token]
  seats: SeatType[]
  current: number
  sixes: number // consecutive sixes in the current turn
  finished: number[] // players in finishing order
  over: boolean
}

export function newMatch(seats: SeatType[]): LudoState {
  return { tokens: seats.map(() => [BASE, BASE, BASE, BASE]), seats, current: 0, sixes: 0, finished: [], over: false }
}

/** Absolute track index for a token on the shared track, or null when in base/home column. */
export function absolute(player: number, pos: number): number | null {
  if (pos < 0 || pos > LAST_TRACK) return null
  return (START_INDEX[player] + pos) % TRACK_LEN
}

export function canMove(pos: number, roll: number): boolean {
  if (pos === HOME) return false
  if (pos === BASE) return roll === 6
  return pos + roll <= HOME // exact roll needed for home, no overshooting
}

export function legalMoves(s: LudoState, player: number, roll: number): number[] {
  return s.tokens[player].flatMap((pos, i) => (canMove(pos, roll) ? [i] : []))
}

export const target = (pos: number, roll: number) => (pos === BASE ? 0 : pos + roll)

export interface MoveResult {
  state: LudoState
  captured: { player: number; token: number }[]
  reachedHome: boolean
  extraTurn: boolean
  playerFinished: boolean
}

const isFinished = (tokens: number[]) => tokens.every((p) => p === HOME)

/** Unfinished players other than `except`. */
const activePlayers = (s: LudoState) => s.seats.map((_, i) => i).filter((i) => !s.finished.includes(i))

/**
 * Match end rules:
 *  - 1 human: ends as soon as the human finishes (or cannot place better because everyone else finished).
 *  - several humans: ends when every human has finished; remaining bots are ranked automatically.
 *  - always ends when only one unfinished player is left.
 */
export function shouldEnd(s: LudoState): boolean {
  const humans = s.seats.flatMap((t, i) => (t === 'human' ? [i] : []))
  if (humans.every((h) => s.finished.includes(h))) return true
  return activePlayers(s).length <= 1
}

export function nextPlayer(s: LudoState, from = s.current): number {
  for (let k = 1; k <= s.seats.length; k += 1) {
    const p = (from + k) % s.seats.length
    if (!s.finished.includes(p)) return p
  }
  return from
}

/** Passes the turn to the next unfinished player and resets the sixes counter. */
export function passTurn(s: LudoState): LudoState {
  return { ...s, current: nextPlayer(s), sixes: 0 }
}

export type RollOutcome = { kind: 'three-sixes' } | { kind: 'no-moves' } | { kind: 'choose'; legal: number[] }

/**
 * Registers a roll for the current player. On a third consecutive six the roll is cancelled and
 * the turn passes. If no token can move, the turn passes without an extra roll (even on a six).
 */
export function registerRoll(s: LudoState, roll: number): { state: LudoState; outcome: RollOutcome } {
  const sixes = roll === 6 ? s.sixes + 1 : 0
  if (sixes >= 3) return { state: passTurn(s), outcome: { kind: 'three-sixes' } }
  const withSixes = { ...s, sixes }
  const legal = legalMoves(withSixes, s.current, roll)
  if (!legal.length) return { state: passTurn(withSixes), outcome: { kind: 'no-moves' } }
  return { state: withSixes, outcome: { kind: 'choose', legal } }
}

/** Moves one token by the whole roll (dice values are never split). */
export function applyMove(s: LudoState, token: number, roll: number): MoveResult {
  const player = s.current
  const from = s.tokens[player][token]
  if (!canMove(from, roll)) throw new Error('illegal move')
  const to = target(from, roll)
  const tokens = s.tokens.map((t) => t.slice())
  tokens[player][token] = to

  const captured: { player: number; token: number }[] = []
  const abs = absolute(player, to)
  if (abs !== null && !SAFE_SQUARES.has(abs)) {
    tokens.forEach((list, p) => {
      if (p === player) return
      list.forEach((pos, t) => {
        if (absolute(p, pos) === abs) {
          tokens[p][t] = BASE
          captured.push({ player: p, token: t })
        }
      })
    })
  }

  const reachedHome = to === HOME
  let finished = s.finished
  const playerFinished = isFinished(tokens[player])
  if (playerFinished && !finished.includes(player)) finished = [...finished, player]

  // a six or a capture grants one extra turn (never stacked into two)
  const extraTurn = !playerFinished && (roll === 6 || captured.length > 0)
  let state: LudoState = { ...s, tokens, finished }
  state = extraTurn ? state : { ...passTurn(state) }
  if (extraTurn && roll !== 6) state = { ...state, sixes: 0 }
  if (shouldEnd(state)) state = { ...state, over: true }
  return { state, captured, reachedHome, extraTurn, playerFinished }
}

export interface Standing {
  player: number
  position: number
  points: number
  tokensHome: number
  finished: boolean
}

export const POINTS = [10, 5, 0, 0]

/**
 * Final ranking: finishing order first; unfinished players are ranked by tokens home,
 * then the token closest to home, then total distance travelled.
 */
export function standings(s: LudoState): Standing[] {
  const progress = (p: number) => {
    const t = s.tokens[p]
    const home = t.filter((x) => x === HOME).length
    const closest = Math.max(-1, ...t.filter((x) => x !== HOME))
    const distance = t.reduce((sum, x) => sum + Math.max(0, x + 1), 0)
    return { home, closest, distance }
  }
  const unfinished = s.seats
    .map((_, i) => i)
    .filter((i) => !s.finished.includes(i))
    .sort((a, b) => {
      const pa = progress(a)
      const pb = progress(b)
      return pb.home - pa.home || pb.closest - pa.closest || pb.distance - pa.distance || a - b
    })
  return [...s.finished, ...unfinished].map((player, idx) => ({
    player,
    position: idx + 1,
    points: POINTS[idx],
    tokensHome: s.tokens[player].filter((x) => x === HOME).length,
    finished: s.finished.includes(player),
  }))
}

// ---------------------------------------------------------------------------
// Bots
// ---------------------------------------------------------------------------

/** How many opponent tokens could land on absolute square `abs` with a single roll. */
export function threatAt(s: LudoState, player: number, abs: number): number {
  if (SAFE_SQUARES.has(abs)) return 0
  let threats = 0
  s.tokens.forEach((list, p) => {
    if (p === player) return
    for (const pos of list) {
      const a = absolute(p, pos)
      if (a === null) continue
      const d = (abs - a + TRACK_LEN) % TRACK_LEN
      if (d >= 1 && d <= 6 && pos + d <= LAST_TRACK) threats += 1
    }
  })
  return threats
}

function capturesAt(s: LudoState, player: number, to: number): number {
  const abs = absolute(player, to)
  if (abs === null || SAFE_SQUARES.has(abs)) return 0
  let n = 0
  s.tokens.forEach((list, p) => {
    if (p !== player) list.forEach((pos) => absolute(p, pos) === abs && (n += 1))
  })
  return n
}

export function scoreMove(s: LudoState, token: number, roll: number, difficulty: Difficulty): number {
  const player = s.current
  const from = s.tokens[player][token]
  const to = target(from, roll)
  const caps = capturesAt(s, player, to)
  const absTo = absolute(player, to)
  const absFrom = absolute(player, from)
  const safeTo = absTo === null || SAFE_SQUARES.has(absTo)
  const hard = difficulty === 'hard'

  let score = roll * 0.5 + to * 0.05
  score += caps * (hard ? 90 : 50)
  if (from === BASE) score += hard ? 35 : 30
  if (to === HOME) score += hard ? 60 : 40
  if (from <= LAST_TRACK && to > LAST_TRACK) score += hard ? 40 : 20 // into the safe home column
  if (safeTo) score += hard ? 18 : 12
  if (hard) {
    const before = absFrom !== null ? threatAt(s, player, absFrom) : 0
    const after = absTo !== null ? threatAt(s, player, absTo) : 0
    score += before * 22 * (from / LAST_TRACK + 0.5) // rescue tokens that have travelled far
    score -= after * 28 * (to / LAST_TRACK + 0.5)
  } else if (absFrom !== null && SAFE_SQUARES.has(absFrom) && !safeTo) {
    score -= 8
  }
  return score
}

export function botChoose(s: LudoState, roll: number, legal: number[], difficulty: Difficulty, rng: Rng): number {
  if (legal.length === 1) return legal[0]
  if (difficulty === 'easy') {
    // basic legal moves: random, but grab an obvious capture now and then
    const caps = legal.filter((t) => capturesAt(s, s.current, target(s.tokens[s.current][t], roll)) > 0)
    if (caps.length && rng() < 0.4) return caps[0]
    return legal[Math.floor(rng() * legal.length)]
  }
  let best = legal[0]
  let bestScore = -Infinity
  for (const t of legal) {
    const sc = scoreMove(s, t, roll, difficulty) + (difficulty === 'medium' ? rng() * 4 : rng() * 0.5)
    if (sc > bestScore) {
      bestScore = sc
      best = t
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// Board geometry (15 x 15 grid), used for rendering
// ---------------------------------------------------------------------------
type RC = [number, number]
const seg = (from: RC, to: RC): RC[] => {
  const out: RC[] = []
  const dr = Math.sign(to[0] - from[0])
  const dc = Math.sign(to[1] - from[1])
  let [r, c] = from
  out.push([r, c])
  while (r !== to[0] || c !== to[1]) {
    r += dr
    c += dc
    out.push([r, c])
  }
  return out
}

/** The 52 track squares in clockwise order, index 0 = Red's start square. */
export const TRACK: RC[] = [
  ...seg([6, 1], [6, 5]),
  ...seg([5, 6], [0, 6]),
  ...seg([0, 7], [0, 8]),
  ...seg([1, 8], [5, 8]),
  ...seg([6, 9], [6, 14]),
  ...seg([7, 14], [8, 14]),
  ...seg([8, 13], [8, 9]),
  ...seg([9, 8], [14, 8]),
  ...seg([14, 7], [14, 6]),
  ...seg([13, 6], [9, 6]),
  ...seg([8, 5], [8, 0]),
  ...seg([7, 0], [6, 0]),
]

export const HOME_COLUMN: RC[][] = [
  seg([7, 1], [7, 5]),
  seg([1, 7], [5, 7]),
  seg([7, 13], [7, 9]),
  seg([13, 7], [9, 7]),
]

/** Yard spots are cell centres (already include the +0.5). */
export const YARD_SPOTS: RC[][] = [
  [[2, 2], [2, 4], [4, 2], [4, 4]],
  [[2, 11], [2, 13], [4, 11], [4, 13]],
  [[11, 11], [11, 13], [13, 11], [13, 13]],
  [[11, 2], [11, 4], [13, 2], [13, 4]],
]

/** Cell whose centre sits inside each colour's home triangle. */
const HOME_SPOT: RC[] = [
  [7, 6],
  [6, 7],
  [7, 8],
  [8, 7],
]

/** Grid cell (row, col) of a token, for drawing. */
export function cellOf(player: number, token: number, pos: number): RC {
  if (pos === BASE) return YARD_SPOTS[player][token]
  if (pos === HOME) return HOME_SPOT[player]
  if (pos > LAST_TRACK) return HOME_COLUMN[player][pos - LAST_TRACK - 1]
  return TRACK[absolute(player, pos)!]
}
