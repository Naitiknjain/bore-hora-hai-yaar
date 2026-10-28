import { createRng, shuffle, type Rng } from '../../lib/random'
import levelsData from './levels.json'
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
  // one map of the board for all arrows (the level generator calls this a lot)
  const taken = new Uint8Array(width * height)
  for (const a of arrows) for (const c of a.cells) taken[c.y * width + c.x] = 1
  return arrows.filter((a) => {
    const v = VEC[headDir(a)]
    const h = a.cells[a.cells.length - 1]
    for (let x = h.x + v.x, y = h.y + v.y; x >= 0 && y >= 0 && x < width && y < height; x += v.x, y += v.y) if (taken[y * width + x]) return false
    return true
  })
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
  const long = Math.round(9 + t * 15) // 9 .. 24 cells along the picture's long side
  const { aspect } = pictureFor(n)
  const width = aspect >= 1 ? long : Math.max(5, Math.round(long * aspect))
  const height = aspect >= 1 ? Math.max(5, Math.round(long / aspect)) : long
  const maxLen = Math.round(3 + t * 7) // 3 .. 10: long, winding arrows are harder to read
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
 * How hard level n must be: at most `maxFree` arrows free at the start, and at least `minDepth`
 * rounds of removal in the right order (the reference's harder tiers: long chains, few free moves).
 */
export function difficulty(n: number): { maxFree: number; minDepth: number } {
  if (n <= 5) return { maxFree: Infinity, minDepth: 1 }
  if (n <= 15) return { maxFree: 6, minDepth: 3 }
  if (n <= 30) return { maxFree: 4, minDepth: 5 }
  if (n <= 45) return { maxFree: 3, minDepth: 7 }
  return { maxFree: 3, minDepth: 9 }
}

/** Lower is harder: free arrows at the start beyond the target, and missing removal rounds. */
function shortfall(arrows: Arrow[], width: number, height: number, target: { maxFree: number; minDepth: number }) {
  const free = removableArrows(arrows, width, height).length
  return Math.max(0, free - target.maxFree) * 3 + Math.max(0, target.minDepth - depth(arrows, width, height))
}

/**
 * Tightens a solvable board towards the level's target with two moves, always keeping it solvable:
 *  - turn a free arrow round, so it points into the picture and has to wait for others
 *  - join a free arrow onto the arrow whose tail its head touches, so it leaves with that arrow
 * Each round takes the move that helps most (steepest descent) until the target is met or nothing helps.
 */
function tighten(arrows: Arrow[], width: number, height: number, target: { maxFree: number; minDepth: number }, maxLen: number, rng: Rng, effort: number): Arrow[] {
  let best = arrows
  let score = shortfall(best, width, height, target)
  let current = best
  let currentScore = score
  for (let round = 0; round < 160 * effort && score > 0; round += 1) {
    const free = removableArrows(current, width, height)
    const moves: Arrow[][] = []
    for (const a of free) {
      moves.push(current.map((x) => (x.id === a.id ? { ...x, cells: x.cells.slice().reverse() } : x)))
      const head = a.cells[a.cells.length - 1]
      for (const host of current) {
        if (host.id === a.id || host.cells.length + 1 > maxLen + 6) continue
        if (adjacent(head, host.cells[0])) {
          // join the whole arrow onto the neighbour's tail, or just hand it the head cell
          if (a.cells.length + host.cells.length <= maxLen + 6) moves.push(current.filter((x) => x.id !== a.id).map((x) => (x.id === host.id ? { ...x, cells: [...a.cells, ...x.cells] } : x)))
          if (a.cells.length >= 3) moves.push(current.map((x) => (x.id === a.id ? { ...x, cells: x.cells.slice(0, -1) } : x.id === host.id ? { ...x, cells: [head, ...x.cells] } : x)))
        }
        // or hand the head cell to a neighbour's head end (that neighbour's head moves one cell)
        if (a.cells.length >= 3 && adjacent(head, host.cells[host.cells.length - 1])) {
          moves.push(current.map((x) => (x.id === a.id ? { ...x, cells: x.cells.slice(0, -1) } : x.id === host.id ? { ...x, cells: [...x.cells, head] } : x)))
        }
      }
    }
    // a couple of random turns elsewhere can open deeper chains
    for (let k = 0; k < 3 && current.length; k += 1) {
      const a = current[Math.floor(rng() * current.length)]
      moves.push(current.map((x) => (x.id === a.id ? { ...x, cells: x.cells.slice().reverse() } : x)))
    }
    // the best move; when nothing improves, a sideways move (no worse) walks out of dead ends
    let pick: Arrow[] | null = null
    let pickScore = Infinity
    for (const m of shuffle(rng, moves)) {
      if (stuckArrows(m, width, height).length) continue
      const sc = shortfall(m, width, height, target)
      if (sc < pickScore) {
        pick = m
        pickScore = sc
      }
    }
    if (!pick || pickScore > currentScore) break
    current = pick
    currentScore = pickScore
    if (currentScore < score) {
      best = current
      score = currentScore
    }
  }
  return best
}

/**
 * Deterministic, original level generator: the level's picture is rasterised and packed densely with
 * winding arrows, then deadlocks are repaired (reverse, split, or as a last resort remove an arrow)
 * until greedy removal clears the board. Every level is verified solvable.
 */
export function generateLevel(n: number, effort = 1): Level {
  const picture = pictureFor(n)
  const { width, height, maxLen } = levelSize(n)
  const grid = rasterise(picture, width, height)
  const mask: Cell[] = []
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) if (grid[y][x]) mask.push({ x, y })
  const inMask = new Set(mask.map(key))
  const target = difficulty(n)
  let fallback: { arrows: Arrow[]; score: number } | null = null

  for (let attempt = 0; attempt < Math.max(80, 24 * effort + 1); attempt += 1) {
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
    if (covered < mask.length * 0.88 || arrows.length < 2) continue
    arrows = tighten(arrows, width, height, target, maxLen, rng, effort)
    const score = shortfall(arrows, width, height, target)
    if (score > 0) {
      // keep the hardest board found in case no attempt reaches the target
      if (!fallback || score < fallback.score) fallback = { arrows, score }
      if (attempt < 24 * effort) continue
    }
    return finish(arrows)
  }
  if (fallback) return finish(fallback.arrows)
  throw new Error(`could not generate level ${n}`)

  function finish(list: Arrow[]): Level {
    // stable ids and colours after repair
    const arrows = list.map((a, i) => ({ ...a, id: i, color: NEON[i % NEON.length] }))
    return { number: n, width, height, arrows, picture: { name: picture.name, color: picture.color }, mask }
  }
}

/** Compact form for the shipped levels file: each arrow as a flat list of x, y pairs (tail to head). */
export type PackedLevel = { n: number; w: number; h: number; a: number[][] }

export const packLevel = (l: Level): PackedLevel => ({ n: l.number, w: l.width, h: l.height, a: l.arrows.map((ar) => ar.cells.flatMap((c) => [c.x, c.y])) })

/** Rebuilds a shipped level: the picture and its mask come from the level number and size. */
export function unpackLevel(p: PackedLevel): Level {
  const picture = pictureFor(p.n)
  const grid = rasterise(picture, p.w, p.h)
  const mask: Cell[] = []
  for (let y = 0; y < p.h; y += 1) for (let x = 0; x < p.w; x += 1) if (grid[y][x]) mask.push({ x, y })
  const arrows = p.a.map((flat, i) => ({ id: i, color: NEON[i % NEON.length], cells: Array.from({ length: flat.length / 2 }, (_, k) => ({ x: flat[2 * k], y: flat[2 * k + 1] })) }))
  return { number: p.n, width: p.w, height: p.h, arrows, picture: { name: picture.name, color: picture.color }, mask }
}

const cache = new Map<number, Level>()
/** Shipped levels (scripts/generate-arrow-levels.ts searches hard for them); generated live as a fallback. */
export function getLevel(n: number): Level {
  if (!cache.has(n)) {
    const packed = (levelsData as PackedLevel[])[n - 1]
    cache.set(n, packed ? unpackLevel(packed) : generateLevel(n))
  }
  return cache.get(n)!
}
