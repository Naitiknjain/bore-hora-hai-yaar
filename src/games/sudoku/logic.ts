import { shuffle, type Rng } from '../../lib/random'
import type { Difficulty } from '../../types'

/** 81-length arrays, 0 = empty. Index = row * 9 + col. */
export type Grid = number[]

export const row = (i: number) => Math.floor(i / 9)
export const col = (i: number) => i % 9
export const box = (i: number) => Math.floor(row(i) / 3) * 3 + Math.floor(col(i) / 3)

/** Precomputed peers (same row, column or box) for each cell. */
export const PEERS: number[][] = Array.from({ length: 81 }, (_, i) => {
  const out: number[] = []
  for (let j = 0; j < 81; j += 1) if (j !== i && (row(j) === row(i) || col(j) === col(i) || box(j) === box(i))) out.push(j)
  return out
})

const bit = (d: number) => 1 << d

function candidatesMask(g: Grid, i: number): number {
  let used = 0
  for (const p of PEERS[i]) if (g[p]) used |= bit(g[p])
  return ~used & 0b1111111110
}

const popcount = (m: number) => {
  let c = 0
  while (m) {
    m &= m - 1
    c += 1
  }
  return c
}

/**
 * Counts solutions up to `limit` using backtracking with the most-constrained-cell heuristic.
 * Optionally randomises digit order (used to generate solved grids).
 */
export function countSolutions(input: Grid, limit = 2, rng?: Rng, out?: { solution?: Grid }): number {
  const g = input.slice()
  let count = 0
  const solve = (): boolean => {
    let best = -1
    let bestMask = 0
    let bestCount = 10
    for (let i = 0; i < 81; i += 1) {
      if (g[i]) continue
      const m = candidatesMask(g, i)
      const c = popcount(m)
      if (c === 0) return false
      if (c < bestCount) {
        best = i
        bestMask = m
        bestCount = c
        if (c === 1) break
      }
    }
    if (best === -1) {
      count += 1
      if (out && !out.solution) out.solution = g.slice()
      return count >= limit
    }
    let digits = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => bestMask & bit(d))
    if (rng) digits = shuffle(rng, digits)
    for (const d of digits) {
      g[best] = d
      if (solve()) return true
    }
    g[best] = 0
    return false
  }
  solve()
  return count
}

export function solve(g: Grid): Grid | null {
  const out: { solution?: Grid } = {}
  return countSolutions(g, 1, undefined, out) ? out.solution! : null
}

export function generateSolved(rng: Rng): Grid {
  const out: { solution?: Grid } = {}
  countSolutions(Array(81).fill(0), 1, rng, out)
  return out.solution!
}

export const TARGET_CLUES: Record<Difficulty, number> = { easy: 40, medium: 32, hard: 26 }

export interface Puzzle {
  puzzle: Grid
  solution: Grid
  clues: number
}

/**
 * Creates a puzzle with a *unique* solution: starts from a random solved grid and removes
 * cells (in symmetric pairs where possible) only while the solution stays unique.
 */
export function generatePuzzle(difficulty: Difficulty, rng: Rng): Puzzle {
  const solution = generateSolved(rng)
  const puzzle = solution.slice()
  const target = TARGET_CLUES[difficulty]
  let clues = 81
  for (const i of shuffle(rng, [...Array(41).keys()])) {
    if (clues <= target) break
    const j = 80 - i
    const cells = i === j ? [i] : [i, j]
    if (clues - cells.length < target - 1) continue
    const saved = cells.map((c) => puzzle[c])
    cells.forEach((c) => (puzzle[c] = 0))
    if (countSolutions(puzzle, 2) !== 1) cells.forEach((c, k) => (puzzle[c] = saved[k]))
    else clues -= cells.length
  }
  return { puzzle, solution, clues }
}

/** Indices whose value duplicates a peer's value (row/column/box rule violations). */
export function conflicts(values: Grid): Set<number> {
  const out = new Set<number>()
  for (let i = 0; i < 81; i += 1) {
    if (!values[i]) continue
    for (const p of PEERS[i]) if (values[p] === values[i]) out.add(i)
  }
  return out
}

export function isSolved(values: Grid): boolean {
  return values.every((v) => v >= 1 && v <= 9) && conflicts(values).size === 0
}

/** Validates a grid as a well-formed Sudoku puzzle with a unique solution. */
export function isValidPuzzle(g: Grid): boolean {
  return g.length === 81 && g.every((v) => Number.isInteger(v) && v >= 0 && v <= 9) && conflicts(g).size === 0 && countSolutions(g, 2) === 1
}
