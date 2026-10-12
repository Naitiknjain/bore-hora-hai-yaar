import type { Rng } from '../../lib/random'
import type { Difficulty } from '../../types'

export type Mark = 'X' | 'O'
export type Cell = Mark | null
export type Board = Cell[]

export const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
] as const

export const emptyBoard = (): Board => Array(9).fill(null)

export function winner(board: Board): { mark: Mark; line: readonly number[] } | null {
  for (const line of LINES) {
    const [a, b, c] = line
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return { mark: board[a]!, line }
  }
  return null
}

export const isFull = (board: Board) => board.every((c) => c !== null)
export const isOver = (board: Board) => winner(board) !== null || isFull(board)
export const other = (m: Mark): Mark => (m === 'X' ? 'O' : 'X')
export const emptyCells = (board: Board) => board.flatMap((c, i) => (c === null ? [i] : []))

/** Applies a move; returns null for illegal moves (occupied cell or finished game). */
export function play(board: Board, index: number, mark: Mark): Board | null {
  if (index < 0 || index > 8 || board[index] !== null || isOver(board)) return null
  const next = board.slice()
  next[index] = mark
  return next
}

/** Minimax with depth preference (win sooner, lose later). Returns score from `me`'s perspective. */
function minimax(board: Board, turn: Mark, me: Mark, depth: number): number {
  const w = winner(board)
  if (w) return w.mark === me ? 10 - depth : depth - 10
  if (isFull(board)) return 0
  let best = turn === me ? -Infinity : Infinity
  for (const i of emptyCells(board)) {
    board[i] = turn
    const score = minimax(board, other(turn), me, depth + 1)
    board[i] = null
    best = turn === me ? Math.max(best, score) : Math.min(best, score)
  }
  return best
}

export function bestMoves(board: Board, me: Mark): number[] {
  const cells = emptyCells(board)
  let best = -Infinity
  let moves: number[] = []
  const work = board.slice()
  for (const i of cells) {
    work[i] = me
    const s = minimax(work, other(me), me, 1)
    work[i] = null
    if (s > best) {
      best = s
      moves = [i]
    } else if (s === best) moves.push(i)
  }
  return moves
}

function findLineMove(board: Board, mark: Mark): number | null {
  for (const [a, b, c] of LINES) {
    const line = [a, b, c]
    const marks = line.map((i) => board[i])
    if (marks.filter((m) => m === mark).length === 2 && marks.includes(null)) return line[marks.indexOf(null)]
  }
  return null
}

export function aiMove(board: Board, me: Mark, difficulty: Difficulty, rng: Rng): number {
  const cells = emptyCells(board)
  if (!cells.length) return -1
  const random = () => cells[Math.floor(rng() * cells.length)]
  const optimal = () => {
    const moves = bestMoves(board, me)
    return moves[Math.floor(rng() * moves.length)]
  }
  if (difficulty === 'hard') return optimal()
  if (difficulty === 'easy') {
    // occasional mistakes: mostly random, sometimes sensible
    return rng() < 0.35 ? optimal() : random()
  }
  // medium: win > block > centre > corner > random, with a small chance to slip
  if (rng() < 0.12) return random()
  const win = findLineMove(board, me)
  if (win !== null) return win
  const block = findLineMove(board, other(me))
  if (block !== null) return block
  if (board[4] === null) return 4
  const corners = [0, 2, 6, 8].filter((i) => board[i] === null)
  if (corners.length) return corners[Math.floor(rng() * corners.length)]
  return random()
}
