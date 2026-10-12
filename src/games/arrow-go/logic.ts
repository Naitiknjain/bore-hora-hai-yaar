import { createRng, shuffle, type Rng } from '../../lib/random'

/**
 * Arrow Go rules (our interpretation of the reference "free-path" arrow puzzle):
 *  - Each arrow is a winding path of grid cells; the last cell is the head and the head's
 *    direction is the direction of the final segment.
 *  - Tapping an arrow slides it off the board in its head direction - only if every cell from
 *    the head to the board edge is free of other arrows (its own body counts as an obstacle too).
 *  - A blocked tap costs a heart. Removing every arrow completes the level.
 */

export type Dir = 'up' | 'down' | 'left' | 'right'
export interface Cell {
  x: number
  y: number
}
export interface Arrow {
  id: number
  cells: Cell[] // tail ... head
  color: string
}
export interface Level {
  number: number
  width: number
  height: number
  arrows: Arrow[]
}

export const TOTAL_LEVELS = 60
export const HEARTS = 3

export const NEON = ['#3ee08f', '#4cc9f0', '#ffd23f', '#a77dff', '#ff5d8f', '#ff8a3d', '#7cf5ff', '#c6ff4d']

const VEC: Record<Dir, Cell> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }

export function headDir(a: Arrow): Dir {
  const h = a.cells[a.cells.length - 1]
  const p = a.cells[a.cells.length - 2]
  if (h.x > p.x) return 'right'
  if (h.x < p.x) return 'left'
  return h.y > p.y ? 'down' : 'up'
}

/** Cells from just past the head to the edge of the board. */
export function exitRay(a: Arrow, width: number, height: number): Cell[] {
  const v = VEC[headDir(a)]
  const h = a.cells[a.cells.length - 1]
  const out: Cell[] = []
  for (let x = h.x + v.x, y = h.y + v.y; x >= 0 && y >= 0 && x < width && y < height; x += v.x, y += v.y) out.push({ x, y })
  return out
}

const key = (c: Cell) => `${c.x},${c.y}`

/** Returns the id of the first arrow blocking `a` (possibly itself), or null when the path is clear. */
export function blocker(a: Arrow, arrows: Arrow[], width: number, height: number): number | null {
  const owner = new Map<string, number>()
  for (const other of arrows) for (const c of other.cells) owner.set(key(c), other.id)
  for (const c of exitRay(a, width, height)) {
    const id = owner.get(key(c))
    if (id !== undefined) return id
  }
  return null
}

export const canRemove = (a: Arrow, arrows: Arrow[], width: number, height: number) => blocker(a, arrows, width, height) === null

export function removableArrows(arrows: Arrow[], width: number, height: number): Arrow[] {
  return arrows.filter((a) => canRemove(a, arrows, width, height))
}

/**
 * Removal only ever frees lanes, so greedily removing any free arrow never hurts:
 * a board is solvable iff repeated greedy removal clears it. Returns a solution order or null.
 */
export function solve(arrows: Arrow[], width: number, height: number): number[] | null {
  let left = arrows.slice()
  const order: number[] = []
  while (left.length) {
    const free = removableArrows(left, width, height)
    if (!free.length) return null
    for (const f of free) order.push(f.id)
    const ids = new Set(free.map((f) => f.id))
    left = left.filter((a) => !ids.has(a.id))
  }
  return order
}

/** Number of greedy "waves" needed - a rough measure of how much ordering a level requires. */
export function depth(arrows: Arrow[], width: number, height: number): number {
  let left = arrows.slice()
  let waves = 0
  while (left.length) {
    const free = new Set(removableArrows(left, width, height).map((a) => a.id))
    if (!free.size) return Infinity
    left = left.filter((a) => !free.has(a.id))
    waves += 1
  }
  return waves
}

export function levelSize(n: number): { width: number; height: number; maxLen: number } {
  const t = Math.min(1, (n - 1) / (TOTAL_LEVELS - 1))
  const width = Math.round(4 + t * 7) // 4 .. 11
  const height = Math.round(5 + t * 8) // 5 .. 13
  const maxLen = Math.round(3 + t * 6) // 3 .. 9
  return { width, height, maxLen }
}

function growArrow(start: Cell, occupied: Set<string>, width: number, height: number, maxLen: number, rng: Rng): Cell[] {
  const cells = [start]
  const used = new Set([key(start)])
  const target = 2 + Math.floor(rng() * (maxLen - 1))
  let straight: Dir | null = null
  while (cells.length < target) {
    const cur = cells[cells.length - 1]
    // prefer continuing straight sometimes, which makes nicer long lanes
    const dirs = shuffle(rng, ['up', 'down', 'left', 'right'] as Dir[])
    if (straight && rng() < 0.45) dirs.unshift(straight)
    let moved = false
    for (const d of dirs) {
      const v = VEC[d]
      const n = { x: cur.x + v.x, y: cur.y + v.y }
      const k = key(n)
      if (n.x < 0 || n.y < 0 || n.x >= width || n.y >= height || occupied.has(k) || used.has(k)) continue
      cells.push(n)
      used.add(k)
      straight = d
      moved = true
      break
    }
    if (!moved) break
  }
  return cells
}

/** Deterministic, original level generator. Every level is verified solvable. */
export function generateLevel(n: number): Level {
  const { width, height, maxLen } = levelSize(n)
  const minDepth = n < 4 ? 1 : n < 15 ? 2 : n < 35 ? 3 : 4
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const rng = createRng(n * 7919 + attempt * 104729 + 17)
    const occupied = new Set<string>()
    let arrows: Arrow[] = []
    const fill = 0.62 + Math.min(0.25, n * 0.006)
    let guard = 0
    while (occupied.size < width * height * fill && guard < 400) {
      guard += 1
      const free: Cell[] = []
      for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) if (!occupied.has(`${x},${y}`)) free.push({ x, y })
      if (!free.length) break
      const cells = growArrow(free[Math.floor(rng() * free.length)], occupied, width, height, maxLen, rng)
      if (cells.length < 2) {
        occupied.add(key(cells[0])) // isolated cell: leave empty
        continue
      }
      cells.forEach((c) => occupied.add(key(c)))
      arrows.push({ id: arrows.length, cells, color: NEON[arrows.length % NEON.length] })
    }
    // repair: drop arrows that are permanently stuck (cycles or self-blocking) until solvable
    for (;;) {
      let left = arrows.slice()
      for (;;) {
        const free = removableArrows(left, width, height)
        if (!free.length) break
        const ids = new Set(free.map((a) => a.id))
        left = left.filter((a) => !ids.has(a.id))
      }
      if (!left.length) break
      const drop = left[Math.floor(rng() * left.length)]
      arrows = arrows.filter((a) => a.id !== drop.id)
    }
    if (arrows.length >= Math.min(4 + n, 6 + n / 2) * 0.6 && depth(arrows, width, height) >= minDepth) {
      // stable ids and colours after repair
      arrows = arrows.map((a, i) => ({ ...a, id: i, color: NEON[i % NEON.length] }))
      return { number: n, width, height, arrows }
    }
  }
  throw new Error(`could not generate level ${n}`)
}

const cache = new Map<number, Level>()
export function getLevel(n: number): Level {
  if (!cache.has(n)) cache.set(n, generateLevel(n))
  return cache.get(n)!
}
