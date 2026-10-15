/**
 * Chakkar Cubes - core rules (self-contained so the level generator script can import it directly).
 * Internal game id stays `loop-sort` so saved progress keeps working.
 *
 * Rules (from the public listing, in-game text and observed gameplay; original levels only):
 *  - Trucks hold a stack of coloured cubes (bottom -> top), 4 slots each. Up to 12 trucks sit
 *    around a looping conveyor (sides first, then top and bottom rows).
 *  - Tapping a truck sends its whole top group of same-coloured cubes onto the conveyor.
 *  - The conveyor moves continuously. A cube drops into the first truck it passes that has room
 *    and is empty or has the same colour on top.
 *  - 4 cubes of one colour complete a truck (it is marked done and stays in place).
 *  - The conveyor holds `capacity` cubes. Loss (confirmed): tapping a truck whose group does not
 *    fit into the remaining space -> Out of Space. Cubes are never discarded and the conveyor
 *    never exceeds its capacity.
 *  - Curtains: a truck stays closed until a given colour has been completed.
 *  - Hidden cubes: only the top cube of a truck is visible (from a certain level on).
 */

export const TRUCK_CAPACITY = 4
export const MAX_TRUCKS = 12

export interface TruckDef {
  blocks: number[]
  lock?: number // curtain: opens once this colour is completed
}

export interface LevelDef {
  n: number
  colors: number
  capacity: number // conveyor capacity in cubes
  hidden: boolean
  trucks: TruckDef[]
  /** A verified winning sequence of truck taps (each applied on a settled board, no abilities). */
  solution: number[]
}

export interface Truck {
  blocks: number[]
  lock?: number
  done: boolean
  doneColor?: number
  pos: number // conveyor position this truck is attached to
  /** Spare dock reserved for the Extra Truck ability; not part of play until activated. */
  inactive?: boolean
}

export interface LoopState {
  trucks: Truck[]
  belt: (number | null)[] // one slot per conveyor position
  capacity: number
  completed: number[] // colours completed
}

// ---------------------------------------------------------------------------
// Layout: a rounded-rectangle loop. Trucks go on the left/right sides (up to 3 each), then
// in rows above and below the loop (up to 3 each) -> 12 trucks max.
// Clockwise order: top (L->R), right (top->bottom), bottom (R->L), left (bottom->top).
// ---------------------------------------------------------------------------
export type Side = 'top' | 'right' | 'bottom' | 'left'

export interface BeltLayout {
  rows: number // trucks per side column
  top: number // trucks in the top row
  bottom: number // trucks in the bottom row
  topPoints: number
  sidePoints: number
  length: number
  truckPos: number[]
  truckSide: Side[]
  truckSlot: number[] // index within its side
}

export function beltLayout(truckCount: number): BeltLayout {
  const k = Math.max(1, Math.min(MAX_TRUCKS, truckCount))
  const rows = Math.min(3, Math.ceil(k / 2))
  const sideTrucks = Math.min(k, rows * 2)
  const rest = k - sideTrucks
  const top = Math.ceil(rest / 2)
  const bottom = rest - top
  const topPoints = Math.max(3, Math.max(top, bottom) * 2 + 1)
  const sidePoints = rows * 2
  const length = topPoints * 2 + sidePoints * 2
  const truckPos: number[] = []
  const truckSide: Side[] = []
  const truckSlot: number[] = []
  const rightCount = Math.ceil(sideTrucks / 2)
  // first the side trucks (keeps existing small layouts identical), then top, then bottom
  for (let i = 0; i < sideTrucks; i += 1) {
    if (i < rightCount) {
      truckPos.push(topPoints + i * 2 + 1)
      truckSide.push('right')
      truckSlot.push(i)
    } else {
      const r = i - rightCount
      truckPos.push(topPoints + sidePoints + topPoints + (sidePoints - 1 - (r * 2 + 1)))
      truckSide.push('left')
      truckSlot.push(r)
    }
  }
  const offset = (count: number) => Math.floor((topPoints - (count * 2 - 1)) / 2)
  for (let j = 0; j < top; j += 1) {
    truckPos.push(offset(top) + j * 2)
    truckSide.push('top')
    truckSlot.push(j)
  }
  for (let j = 0; j < bottom; j += 1) {
    // bottom runs right -> left
    truckPos.push(topPoints + sidePoints + (topPoints - 1 - (offset(bottom) + j * 2)))
    truckSide.push('bottom')
    truckSlot.push(j)
  }
  return { rows, top, bottom, topPoints, sidePoints, length, truckPos, truckSide, truckSlot }
}

/** Largest capacity a layout can hold while keeping free conveyor positions for movement. */
export const maxCapacity = (s: LoopState) => s.belt.length - 2

/**
 * Builds the starting board. `spareDocks` reserves empty, inactive docks for the Extra Truck
 * ability (they are laid out now so adding a truck never moves the conveyor).
 */
export function initialState(level: Pick<LevelDef, 'trucks' | 'capacity'>, spareDocks = 0): LoopState {
  const spare = Math.max(0, Math.min(spareDocks, MAX_TRUCKS - level.trucks.length))
  const total = level.trucks.length + spare
  const layout = beltLayout(total)
  const trucks: Truck[] = level.trucks.map((t, i) => ({ blocks: t.blocks.slice(), lock: t.lock, done: false, pos: layout.truckPos[i] }))
  for (let i = level.trucks.length; i < total; i += 1) trucks.push({ blocks: [], done: false, pos: layout.truckPos[i], inactive: true })
  const belt = Array(layout.length).fill(null)
  return { trucks, belt, capacity: Math.min(level.capacity, belt.length - 2), completed: [] }
}

export const beltCount = (s: LoopState) => s.belt.reduce((n: number, b) => (b === null ? n : n + 1), 0)
export const freeSpace = (s: LoopState) => s.capacity - beltCount(s)
export const isLocked = (s: LoopState, t: Truck) => t.lock !== undefined && !s.completed.includes(t.lock)

/** Top group of identical colours (what a tap would unload). */
export function topRun(t: Truck): number[] {
  if (!t.blocks.length) return []
  const c = t.blocks[t.blocks.length - 1]
  let k = t.blocks.length - 1
  while (k > 0 && t.blocks[k - 1] === c) k -= 1
  return t.blocks.slice(k)
}

export type TapError = 'empty' | 'locked' | 'done' | 'belt-full' | 'invalid'

/** Why a truck cannot be tapped right now (null = it can). `belt-full` = not enough space. */
export function canTap(s: LoopState, i: number): TapError | null {
  const t = s.trucks[i]
  if (!t || t.inactive) return 'invalid'
  if (t.done) return 'done'
  if (isLocked(s, t)) return 'locked'
  if (!t.blocks.length) return 'empty'
  if (topRun(t).length > freeSpace(s)) return 'belt-full'
  return null
}

/** Unloads the top group onto the conveyor, just ahead of the truck (so it does not instantly reload). */
export function tap(s: LoopState, i: number): { state: LoopState; error: TapError | null } {
  const err = canTap(s, i)
  if (err) return { state: s, error: err }
  const t = s.trucks[i]
  const run = topRun(t)
  const belt = s.belt.slice()
  let p = t.pos
  for (const c of run) {
    do p = (p + 1) % belt.length
    while (belt[p] !== null)
    belt[p] = c
  }
  const trucks = s.trucks.map((x, k) => (k === i ? { ...x, blocks: x.blocks.slice(0, x.blocks.length - run.length) } : x))
  return { state: { ...s, trucks, belt }, error: null }
}

export type TapOutcome =
  | { kind: 'moved'; state: LoopState }
  | { kind: 'out-of-space'; truck: number; needed: number; free: number }
  | { kind: 'refused'; reason: TapError }

/**
 * Applies the configured loss rule to a tap.
 * With 'tap-exceeds-capacity' a tap that does not fit becomes an Out of Space loss (the state is
 * left untouched - nothing is discarded). With 'jammed' it is simply refused.
 */
export function attemptTap(s: LoopState, i: number, trigger: 'tap-exceeds-capacity' | 'jammed'): TapOutcome {
  const err = canTap(s, i)
  if (!err) return { kind: 'moved', state: tap(s, i).state }
  if (err === 'belt-full' && trigger === 'tap-exceeds-capacity') {
    return { kind: 'out-of-space', truck: i, needed: topRun(s.trucks[i]).length, free: freeSpace(s) }
  }
  return { kind: 'refused', reason: err }
}

export function accepts(s: LoopState, t: Truck, color: number): boolean {
  if (t.inactive || t.done || isLocked(s, t) || t.blocks.length >= TRUCK_CAPACITY) return false
  return !t.blocks.length || t.blocks[t.blocks.length - 1] === color
}

export interface TickResult {
  state: LoopState
  absorbed: { truck: number; color: number }[]
  completed: number[] // truck indices completed this tick
}

/** Moves the conveyor one position and lets trucks pick up cubes passing their chute. */
export function tick(s: LoopState): TickResult {
  const n = s.belt.length
  const belt: (number | null)[] = Array(n).fill(null)
  for (let p = 0; p < n; p += 1) belt[(p + 1) % n] = s.belt[p]
  const absorbed: { truck: number; color: number }[] = []
  const completedNow: number[] = []
  let trucks = s.trucks
  let completed = s.completed
  trucks.forEach((t, i) => {
    const c = belt[t.pos]
    if (c === null) return
    const state = { ...s, trucks, completed }
    if (!accepts(state, trucks[i], c)) return
    belt[t.pos] = null
    const blocks = [...trucks[i].blocks, c]
    const full = blocks.length === TRUCK_CAPACITY && blocks.every((b) => b === c)
    trucks = trucks.map((x, k) => (k === i ? { ...x, blocks: full ? [] : blocks, done: full || x.done, doneColor: full ? c : x.doneColor } : x))
    if (full) {
      completed = [...completed, c]
      completedNow.push(i)
    }
    absorbed.push({ truck: i, color: c })
  })
  return { state: { ...s, trucks, belt, completed }, absorbed, completed: completedNow }
}

/** Runs the conveyor until nothing more can be absorbed (a full lap with no pick-ups) or it is empty. */
export function settle(s: LoopState): LoopState {
  let state = s
  let idle = 0
  while (beltCount(state) > 0 && idle < state.belt.length) {
    const r = tick(state)
    state = r.state
    idle = r.absorbed.length ? 0 : idle + 1
  }
  return state
}

export const isWon = (s: LoopState) => beltCount(s) === 0 && s.trucks.every((t) => t.done || t.blocks.length === 0)

/** True when blocks remain but no truck could ever be tapped (even with unlimited space). */
export function hasNoMoves(s: LoopState): boolean {
  if (isWon(s)) return false
  return s.trucks.every((t) => t.inactive || t.done || isLocked(s, t) || t.blocks.length === 0)
}

/** Legacy 'jammed' rule: settled and no tap fits. */
export function isJammed(s: LoopState): boolean {
  if (isWon(s)) return false
  return s.trucks.every((_, i) => canTap(s, i) !== null)
}

// ---------------------------------------------------------------------------
// Abilities (pure). Use limits live in config.ts / the UI; these only change the board.
// ---------------------------------------------------------------------------

/** +n conveyor slots (never beyond what the loop can physically hold). */
export function addConveyorSlots(s: LoopState, n = 1): LoopState {
  return { ...s, capacity: Math.min(maxCapacity(s), s.capacity + n) }
}

export const canAddConveyorSlot = (s: LoopState) => s.capacity < maxCapacity(s)

/** Index of the next spare dock the Extra Truck ability would open, or -1. */
export const nextSpareDock = (s: LoopState) => s.trucks.findIndex((t) => t.inactive)

/** Opens one spare dock as an empty truck. */
export function addTruck(s: LoopState): LoopState {
  const i = nextSpareDock(s)
  if (i < 0) return s
  return { ...s, trucks: s.trucks.map((t, k) => (k === i ? { ...t, inactive: false } : t)) }
}

/** Trucks whose cube order can be shuffled (2+ cubes, not all one colour, open). */
export function canShuffle(s: LoopState, i: number): boolean {
  const t = s.trucks[i]
  if (!t || t.inactive || t.done || isLocked(s, t) || t.blocks.length < 2) return false
  return new Set(t.blocks).size > 1
}

/** Reorders the cubes inside one truck; guaranteed to change the order. */
export function shuffleTruck(s: LoopState, i: number, rand: () => number = Math.random): LoopState {
  if (!canShuffle(s, i)) return s
  const original = s.trucks[i].blocks
  let blocks = original
  for (let attempt = 0; attempt < 20 && blocks.join() === original.join(); attempt += 1) {
    blocks = original.slice()
    for (let a = blocks.length - 1; a > 0; a -= 1) {
      const b = Math.floor(rand() * (a + 1))
      ;[blocks[a], blocks[b]] = [blocks[b], blocks[a]]
    }
  }
  if (blocks.join() === original.join()) blocks = [...original.slice(1), original[0]] // rotate as a last resort
  return { ...s, trucks: s.trucks.map((t, k) => (k === i ? { ...t, blocks } : t)) }
}

/**
 * Undo restores the board from before the last tap, but keeps anything paid for since then
 * (extra conveyor slots and opened docks) - an undo never takes back an ability.
 */
export function undoTo(previous: LoopState, current: LoopState): LoopState {
  const trucks = previous.trucks.map((t, i) => ({ ...t, inactive: current.trucks[i]?.inactive ?? t.inactive }))
  return { ...previous, trucks, capacity: Math.max(previous.capacity, current.capacity) }
}

// ---------------------------------------------------------------------------
// Solvers
// ---------------------------------------------------------------------------
export function stateKey(s: LoopState): string {
  return `${s.trucks.map((t) => (t.inactive ? 'X' : t.done ? 'D' : t.blocks.join(''))).join('|')}#${s.belt.map((b) => (b === null ? '.' : b)).join('')}#${s.capacity}`
}

/**
 * Breadth-first search over settled boards: returns a *shortest* winning tap sequence
 * from `from` (default: the level start), or null if none exists within the node budget.
 */
export function solveLevel(level: Pick<LevelDef, 'trucks' | 'capacity'>, maxNodes = 80000, from?: LoopState): number[] | null {
  const start = from ?? initialState(level)
  if (isWon(start)) return []
  const seen = new Set<string>([stateKey(start)])
  let frontier: { s: LoopState; path: number[] }[] = [{ s: start, path: [] }]
  let nodes = 0
  while (frontier.length) {
    const next: { s: LoopState; path: number[] }[] = []
    for (const { s, path } of frontier) {
      for (let i = 0; i < s.trucks.length; i += 1) {
        if (canTap(s, i) !== null) continue
        const after = settle(tap(s, i).state)
        const key = stateKey(after)
        if (seen.has(key)) continue
        seen.add(key)
        const p = [...path, i]
        if (isWon(after)) return p
        if (++nodes > maxNodes) return null
        next.push({ s: after, path: p })
      }
    }
    frontier = next
  }
  return null
}

/**
 * Fast depth-first search (iterative, no recursion limit): proves solvability.
 * The solution is not necessarily shortest.
 */
export function solveDepthFirst(level: Pick<LevelDef, 'trucks' | 'capacity'>, maxNodes = 60000, from?: LoopState): number[] | null {
  interface Node {
    s: LoopState
    parent: Node | null
    move: number
  }
  const seen = new Set<string>()
  const pathOf = (n: Node) => {
    const out: number[] = []
    for (let c: Node | null = n; c && c.parent; c = c.parent) out.push(c.move)
    return out.reverse()
  }
  const stack: Node[] = [{ s: from ?? initialState(level), parent: null, move: -1 }]
  let nodes = 0
  while (stack.length) {
    const node = stack.pop()!
    if (isWon(node.s)) return pathOf(node)
    const key = stateKey(node.s)
    if (seen.has(key)) continue
    seen.add(key)
    if (++nodes > maxNodes) return null
    // push the least promising first so the largest groups are explored first
    const order = node.s.trucks
      .map((_, i) => i)
      .filter((i) => canTap(node.s, i) === null)
      .sort((a, b) => topRun(node.s.trucks[a]).length - topRun(node.s.trucks[b]).length)
    for (const i of order) stack.push({ s: settle(tap(node.s, i).state), parent: node, move: i })
  }
  return null
}

/** How far a board is from sorted: cubes on the conveyor + cubes sitting on a different colour. */
export function disorder(s: LoopState): number {
  let h = beltCount(s)
  for (const t of s.trucks) {
    if (t.done || t.inactive || !t.blocks.length) continue
    let base = 1
    while (base < t.blocks.length && t.blocks[base] === t.blocks[0]) base += 1
    h += t.blocks.length - base
  }
  return h
}

/**
 * Weighted best-first search (A*-like): explores boards closest to sorted first, so solutions
 * are short (good for hints and compact level files) while staying fast on big levels.
 */
export function solveBestFirst(level: Pick<LevelDef, 'trucks' | 'capacity'>, maxNodes = 60000, from?: LoopState): number[] | null {
  interface Node {
    s: LoopState
    parent: Node | null
    move: number
    g: number
    f: number
  }
  const heap: Node[] = []
  const push = (n: Node) => {
    heap.push(n)
    let i = heap.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (heap[p].f <= heap[i].f) break
      ;[heap[p], heap[i]] = [heap[i], heap[p]]
      i = p
    }
  }
  const pop = () => {
    const top = heap[0]
    const last = heap.pop()!
    if (heap.length) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let m = i
        if (l < heap.length && heap[l].f < heap[m].f) m = l
        if (r < heap.length && heap[r].f < heap[m].f) m = r
        if (m === i) break
        ;[heap[m], heap[i]] = [heap[i], heap[m]]
        i = m
      }
    }
    return top
  }
  const pathOf = (n: Node) => {
    const out: number[] = []
    for (let c: Node | null = n; c && c.parent; c = c.parent) out.push(c.move)
    return out.reverse()
  }
  const start = from ?? initialState(level)
  const seen = new Set<string>()
  push({ s: start, parent: null, move: -1, g: 0, f: disorder(start) })
  let nodes = 0
  while (heap.length) {
    const node = pop()
    if (isWon(node.s)) return pathOf(node)
    const key = stateKey(node.s)
    if (seen.has(key)) continue
    seen.add(key)
    if (++nodes > maxNodes) return null
    for (let i = 0; i < node.s.trucks.length; i += 1) {
      if (canTap(node.s, i) !== null) continue
      const next = settle(tap(node.s, i).state)
      if (seen.has(stateKey(next))) continue
      push({ s: next, parent: node, move: i, g: node.g + 1, f: node.g + 1 + 2 * disorder(next) })
    }
  }
  return null
}

/** Replays a solution and reports whether it wins (used by tests and the generator). */
export function replay(level: Pick<LevelDef, 'trucks' | 'capacity'>, taps: number[]): boolean {
  let s = initialState(level)
  for (const i of taps) {
    const r = tap(s, i)
    if (r.error) return false
    s = settle(r.state)
  }
  return isWon(s)
}

// ---------------------------------------------------------------------------
// Level generation (used offline by scripts/generate-loop-sort-levels.ts) - original layouts.
// ---------------------------------------------------------------------------
function rng32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function levelParams(n: number) {
  // colours (= filled trucks) grow from 2 to 8; total trucks stay <= 10 so Extra Truck has room
  const colors = n <= 2 ? 2 : n <= 6 ? 3 : n <= 14 ? 4 : n <= 25 ? 5 : n <= 38 ? 6 : n <= 50 ? 7 : 8
  const empties = n <= 3 ? 2 : n <= 30 ? 1 + (n % 2) : n % 3 === 0 ? 2 : 1
  // conveyor capacity in cubes (the reference uses roughly 7-14)
  const capacity = n <= 6 ? 8 : n <= 20 ? 7 : n <= 40 ? 6 : 5
  const hidden = n >= 6
  const curtain = n >= 18 && n % 3 === 0
  return { colors, empties, capacity, hidden, curtain }
}

export function generateLevel(n: number): LevelDef {
  const p = levelParams(n)
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const rand = rng32(n * 2654435761 + attempt * 97 + 1)
    const pool: number[] = []
    for (let c = 0; c < p.colors; c += 1) for (let k = 0; k < TRUCK_CAPACITY; k += 1) pool.push(c)
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    const trucks: TruckDef[] = []
    for (let i = 0; i < p.colors; i += 1) trucks.push({ blocks: pool.slice(i * 4, i * 4 + 4) })
    // a truck that is already complete makes the level boring
    if (trucks.some((t) => t.blocks.every((b) => b === t.blocks[0]))) continue
    for (let e = 0; e < p.empties; e += 1) trucks.splice(Math.floor(rand() * (trucks.length + 1)), 0, { blocks: [] })
    if (trucks.length > 10) continue
    if (p.curtain) {
      const candidates = trucks.map((t, i) => (t.blocks.length ? i : -1)).filter((i) => i >= 0)
      const idx = candidates[Math.floor(rand() * candidates.length)]
      const lockColor = Math.floor(rand() * p.colors)
      if (!trucks[idx].blocks.includes(lockColor)) trucks[idx] = { ...trucks[idx], lock: lockColor }
    }
    const def = { trucks, capacity: p.capacity }
    const any = solveBestFirst(def) ?? solveDepthFirst(def)
    if (!any) continue
    // shortest solution when the search space is small enough; otherwise the level is hard anyway
    const shortest = solveLevel(def, 15000)
    const minTaps = Math.min(3 + n / 6, 10)
    if (shortest && shortest.length < minTaps) continue
    return { n, colors: p.colors, capacity: p.capacity, hidden: p.hidden, trucks, solution: shortest ?? any }
  }
  throw new Error(`Could not generate level ${n}`)
}
