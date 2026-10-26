import { createRng, shuffle, type Rng } from '../../lib/random'
import { PICTURES, rasterise, type Picture } from './pictures'

/**
 * Arrow Go rules (our interpretation of the reference "free-path" arrow puzzle):
 *  - Each arrow is a winding path of grid cells; the last cell is the head and the head's
 *    direction is the direction of the final segment.
 *  - Tapping an arrow slides it off the board in its head direction - only if every cell from
 *    the head to the board edge is free of other arrows (its own body counts as an obstacle too).
 *  - A blocked tap costs a heart. Removing every arrow completes the level.
 *  - Each level's arrows are packed into an original picture (see pictures.ts) that is revealed as they leave.
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
  /** the picture the arrows form; clearing them reveals it */
  picture: { name: string; color: string }
  /** every cell of the picture */
  mask: Cell[]
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

/** Picture shown by level n: 30 pictures, then the same pictures again on denser grids. */
export function pictureFor(n: number): Picture {
  return PICTURES[(n - 1) % PICTURES.length]
}

export function levelSize(n: number): { width: number; height: number; maxLen: number } {
  const t = Math.min(1, (n - 1) / (TOTAL_LEVELS - 1))
  const long = Math.round(9 + t * 13) // 9 .. 22 cells along the picture's long side
  const { aspect } = pictureFor(n)
  const width = aspect >= 1 ? long : Math.max(5, Math.round(long * aspect))
  const height = aspect >= 1 ? Math.max(5, Math.round(long / aspect)) : long
  const maxLen = Math.round(3 + t * 5) // 3 .. 8: many arrows make a dense picture
  return { width, height, maxLen }
}

function growArrow(start: Cell, free: (k: string) => boolean, maxLen: number, rng: Rng): Cell[] {
  const cells = [start]
  const used = new Set([key(start)])
  const target = 2 + Math.floor(rng() * (maxLen - 1))
  let straight: Dir | null = null
  while (cells.length < target) {
    const cur = cells[cells.length - 1]
    // continuing straight often makes the long lanes of the reference look
    const dirs = shuffle(rng, ['up', 'down', 'left', 'right'] as Dir[])
    if (straight && rng() < 0.5) dirs.unshift(straight)
    let moved = false
    for (const d of dirs) {
      const v = VEC[d]
      const nx = { x: cur.x + v.x, y: cur.y + v.y }
      const k = key(nx)
      if (!free(k) || used.has(k)) continue
      cells.push(nx)
      used.add(k)
      straight = d
      moved = true
      break
    }
    if (!moved) break
  }
  return cells
}

/** Arrows that greedy removal can never clear (cycles of blockers, or arrows curling into themselves). */
function stuckArrows(arrows: Arrow[], width: number, height: number): Arrow[] {
  let left = arrows.slice()
  for (;;) {
    const free = removableArrows(left, width, height)
    if (!free.length) return left
    const ids = new Set(free.map((a) => a.id))
    left = left.filter((a) => !ids.has(a.id))
  }
}

const adjacent = (a: Cell, b: Cell) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1

/**
 * Deterministic, original level generator: the level's picture is rasterised and packed densely with
 * winding arrows, then deadlocks are repaired (reverse, split, or as a last resort remove an arrow)
 * until greedy removal clears the board. Every level is verified solvable.
 */
export function generateLevel(n: number): Level {
  const picture = pictureFor(n)
  const { width, height, maxLen } = levelSize(n)
  const grid = rasterise(picture, width, height)
  const mask: Cell[] = []
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) if (grid[y][x]) mask.push({ x, y })
  const inMask = new Set(mask.map(key))
  const minDepth = n < 4 ? 1 : n < 15 ? 2 : n < 35 ? 3 : 4

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const rng = createRng(n * 7919 + attempt * 104729 + 17)
    const occupied = new Set<string>()
    let arrows: Arrow[] = []
    let nextId = 0
    const leftovers: Cell[] = []
    for (const c of shuffle(rng, mask.slice())) {
      if (occupied.has(key(c))) continue
      const cells = growArrow(c, (k) => inMask.has(k) && !occupied.has(k), maxLen, rng)
      if (cells.length < 2) {
        leftovers.push(c)
        continue
      }
      cells.forEach((x) => occupied.add(key(x)))
      arrows.push({ id: nextId++, cells, color: '' })
    }
    // single cells join a neighbouring arrow (as its new tail, or its new head) so the picture has no holes
    for (const c of leftovers) {
      if (occupied.has(key(c))) continue
      const tailHost = arrows.find((a) => adjacent(a.cells[0], c))
      if (tailHost) tailHost.cells.unshift(c)
      else {
        const headHost = arrows.find((a) => adjacent(a.cells[a.cells.length - 1], c))
        if (!headHost) continue
        headHost.cells.push(c)
      }
      occupied.add(key(c))
    }

    const reversed = new Set<number>()
    let ok = false
    for (let repairs = 0; repairs < 600; repairs += 1) {
      const stuck = stuckArrows(arrows, width, height)
      if (!stuck.length) {
        ok = true
        break
      }
      const a = stuck[Math.floor(rng() * stuck.length)]
      if (!reversed.has(a.id)) {
        reversed.add(a.id)
        arrows = arrows.map((x) => (x.id === a.id ? { ...x, cells: x.cells.slice().reverse() } : x))
      } else if (a.cells.length >= 4) {
        const cut = 2 + Math.floor(rng() * (a.cells.length - 3))
        arrows = arrows.filter((x) => x.id !== a.id)
        arrows.push({ id: nextId++, cells: a.cells.slice(0, cut), color: '' }, { id: nextId++, cells: a.cells.slice(cut), color: '' })
      } else {
        arrows = arrows.filter((x) => x.id !== a.id)
      }
    }
    if (!ok) continue
    const covered = arrows.reduce((sum, a) => sum + a.cells.length, 0)
    if (covered < mask.length * 0.88 || arrows.length < 2 || depth(arrows, width, height) < minDepth) continue
    // stable ids and colours after repair
    arrows = arrows.map((a, i) => ({ ...a, id: i, color: NEON[i % NEON.length] }))
    return { number: n, width, height, arrows, picture: { name: picture.name, color: picture.color }, mask }
  }
  throw new Error(`could not generate level ${n}`)
}

const cache = new Map<number, Level>()
export function getLevel(n: number): Level {
  if (!cache.has(n)) cache.set(n, generateLevel(n))
  return cache.get(n)!
}
