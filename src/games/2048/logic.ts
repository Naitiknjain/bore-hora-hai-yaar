import type { Rng } from '../../lib/random'

export type Grid = number[][] // 0 = empty
export type Dir = 'up' | 'down' | 'left' | 'right'
export const SIZE = 4

export const emptyGrid = (): Grid => Array.from({ length: SIZE }, () => Array(SIZE).fill(0))
export const clone = (g: Grid): Grid => g.map((r) => r.slice())

/** Slides and merges one row to the left following the original rules: each tile merges at most once per move. */
export function slideRow(row: number[]): { row: number[]; gained: number; mergedAt: number[] } {
  const tiles = row.filter((v) => v !== 0)
  const out: number[] = []
  const mergedAt: number[] = []
  let gained = 0
  for (let i = 0; i < tiles.length; i += 1) {
    if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) {
      const v = tiles[i] * 2
      out.push(v)
      mergedAt.push(out.length - 1)
      gained += v
      i += 1
    } else out.push(tiles[i])
  }
  while (out.length < row.length) out.push(0)
  return { row: out, gained, mergedAt }
}

function rotateCW(g: Grid): Grid {
  const n = g.length
  return g.map((_, r) => g.map((__, c) => g[n - 1 - c][r]))
}

function rotateTimes(g: Grid, times: number): Grid {
  let out = g
  for (let i = 0; i < ((times % 4) + 4) % 4; i += 1) out = rotateCW(out)
  return out
}

// number of clockwise rotations so that `dir` becomes "left"
const TO_LEFT: Record<Dir, number> = { left: 0, down: 1, right: 2, up: 3 }

export interface MoveResult {
  grid: Grid
  moved: boolean
  gained: number
  merged: Set<string> // "r,c" positions of merged tiles in the result grid
}

export function move(grid: Grid, dir: Dir): MoveResult {
  const k = TO_LEFT[dir]
  const rotated = rotateTimes(grid, k)
  let gained = 0
  const mergedRot: [number, number][] = []
  const slid = rotated.map((row, r) => {
    const res = slideRow(row)
    gained += res.gained
    res.mergedAt.forEach((c) => mergedRot.push([r, c]))
    return res.row
  })
  const result = rotateTimes(slid, 4 - k)
  // map merged coordinates back by rotating a marker grid
  const marker = emptyGrid()
  mergedRot.forEach(([r, c]) => (marker[r][c] = 1))
  const back = rotateTimes(marker, 4 - k)
  const merged = new Set<string>()
  back.forEach((row, r) => row.forEach((v, c) => v && merged.add(`${r},${c}`)))
  const moved = result.some((row, r) => row.some((v, c) => v !== grid[r][c]))
  return { grid: result, moved, gained, merged }
}

export function emptyCells(g: Grid): [number, number][] {
  const out: [number, number][] = []
  g.forEach((row, r) => row.forEach((v, c) => v === 0 && out.push([r, c])))
  return out
}

/** Adds a 2 (90%) or 4 (10%) on a random empty cell. Returns the position or null when full. */
export function addRandomTile(g: Grid, rng: Rng): [number, number] | null {
  const cells = emptyCells(g)
  if (!cells.length) return null
  const [r, c] = cells[Math.floor(rng() * cells.length)]
  g[r][c] = rng() < 0.9 ? 2 : 4
  return [r, c]
}

export function canMove(g: Grid): boolean {
  if (emptyCells(g).length) return true
  for (let r = 0; r < SIZE; r += 1)
    for (let c = 0; c < SIZE; c += 1) {
      if (c + 1 < SIZE && g[r][c] === g[r][c + 1]) return true
      if (r + 1 < SIZE && g[r][c] === g[r + 1][c]) return true
    }
  return false
}

export const maxTile = (g: Grid) => Math.max(...g.flat())

export function newGame(rng: Rng): Grid {
  const g = emptyGrid()
  addRandomTile(g, rng)
  addRandomTile(g, rng)
  return g
}
