/**
 * Loop Sort - core rules (self-contained so the level generator script can import it directly).
 *
 * Our reading of the reference game (Play Store listing + screenshots; no proprietary data used):
 *  - Trucks hold a stack of coloured blocks (bottom -> top), 4 slots each.
 *  - Tapping a truck sends its top run of same-coloured blocks onto a looping conveyor belt.
 *  - The belt moves continuously. A block drops into the first truck it passes that has room and
 *    is either empty or has the same colour on top ("sorted automatically").
 *  - A truck holding 4 blocks of one colour is complete and drives away.
 *  - The belt has a limited capacity. If the belt is full of blocks no truck can take and no
 *    truck can be tapped, the belt is jammed and the level is lost (costs a life).
 *  - Curtain trucks stay closed until a given colour has been completed.
 *  - Hidden blocks: only the top block of a truck is visible (from a certain level on).
 */

export const TRUCK_CAPACITY = 4

export interface TruckDef {
  blocks: number[]
  lock?: number // curtain: opens once this colour is completed
}

export interface LevelDef {
  n: number
  colors: number
  capacity: number // belt capacity in blocks
  hidden: boolean
  trucks: TruckDef[]
  /** A verified winning sequence of truck taps (each applied on a settled board). */
  solution: number[]
}

export interface Truck {
  blocks: number[]
  lock?: number
  done: boolean
  doneColor?: number
  pos: number // belt position this truck is attached to
}

export interface LoopState {
  trucks: Truck[]
  belt: (number | null)[] // one slot per belt position
  capacity: number
  completed: number[] // colours completed
}

// ---------------------------------------------------------------------------
// Belt geometry: a stadium-shaped loop with trucks on its right and left sides.
// Order is clockwise: top (L->R), right side (top->bottom), bottom (R->L), left side (bottom->top).
// ---------------------------------------------------------------------------
export interface BeltLayout {
  rows: number
  length: number
  truckPos: number[]
  truckSide: ('left' | 'right')[]
  truckRow: number[]
}

export function beltLayout(truckCount: number): BeltLayout {
  const rows = Math.ceil(truckCount / 2)
  const side = rows * 2
  const length = 3 + side + 3 + side
  const truckPos: number[] = []
  const truckSide: ('left' | 'right')[] = []
  const truckRow: number[] = []
  for (let i = 0; i < truckCount; i += 1) {
    if (i < rows) {
      truckPos.push(3 + i * 2 + 1)
      truckSide.push('right')
      truckRow.push(i)
    } else {
      const r = i - rows
      // left side runs bottom -> top
      truckPos.push(3 + side + 3 + (side - 1 - (r * 2 + 1)))
      truckSide.push('left')
      truckRow.push(r)
    }
  }
  return { rows, length, truckPos, truckSide, truckRow }
}

export function initialState(level: Pick<LevelDef, 'trucks' | 'capacity'>): LoopState {
  const layout = beltLayout(level.trucks.length)
  return {
    trucks: level.trucks.map((t, i) => ({ blocks: t.blocks.slice(), lock: t.lock, done: false, pos: layout.truckPos[i] })),
    belt: Array(layout.length).fill(null),
    capacity: level.capacity,
    completed: [],
  }
}

export const beltCount = (s: LoopState) => s.belt.reduce((n: number, b) => (b === null ? n : n + 1), 0)
export const isLocked = (s: LoopState, t: Truck) => t.lock !== undefined && !s.completed.includes(t.lock)

/** Top run of identical colours (what a tap would unload). */
export function topRun(t: Truck): number[] {
  if (!t.blocks.length) return []
  const c = t.blocks[t.blocks.length - 1]
  let k = t.blocks.length - 1
  while (k > 0 && t.blocks[k - 1] === c) k -= 1
  return t.blocks.slice(k)
}

export type TapError = 'empty' | 'locked' | 'done' | 'belt-full' | 'invalid'

export function canTap(s: LoopState, i: number): TapError | null {
  const t = s.trucks[i]
  if (!t) return 'invalid'
  if (t.done) return 'done'
  if (isLocked(s, t)) return 'locked'
  if (!t.blocks.length) return 'empty'
  if (beltCount(s) + topRun(t).length > s.capacity) return 'belt-full'
  return null
}

/** Unloads the top run onto the belt, just ahead of the truck (so it does not instantly reload). */
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

export function accepts(s: LoopState, t: Truck, color: number): boolean {
  if (t.done || isLocked(s, t) || t.blocks.length >= TRUCK_CAPACITY) return false
  return !t.blocks.length || t.blocks[t.blocks.length - 1] === color
}

export interface TickResult {
  state: LoopState
  absorbed: { truck: number; color: number }[]
  completed: number[] // truck indices completed this tick
}

/** Moves the belt one position and lets trucks pick up blocks passing their chute. */
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

/** Runs the belt until nothing more can be absorbed (a full lap with no pick-ups) or it is empty. */
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

/** After settling: true when no tap is possible and blocks remain (belt jammed / dead end). */
export function isJammed(s: LoopState): boolean {
  if (isWon(s)) return false
  return s.trucks.every((_, i) => canTap(s, i) !== null)
}

export function stateKey(s: LoopState): string {
  return `${s.trucks.map((t) => (t.done ? 'D' : t.blocks.join(''))).join('|')}#${s.belt.map((b) => (b === null ? '.' : b)).join('')}#${s.capacity}`
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

/** Fast depth-first search: proves solvability (solution not necessarily shortest). */
export function solveDepthFirst(level: Pick<LevelDef, 'trucks' | 'capacity'>, maxNodes = 60000, from?: LoopState): number[] | null {
  const seen = new Set<string>()
  let nodes = 0
  const dfs = (s: LoopState, path: number[]): number[] | null => {
    if (isWon(s)) return path
    if (++nodes > maxNodes) return null
    const key = stateKey(s)
    if (seen.has(key)) return null
    seen.add(key)
    const order = s.trucks
      .map((_, i) => i)
      .filter((i) => canTap(s, i) === null)
      .sort((a, b) => topRun(s.trucks[b]).length - topRun(s.trucks[a]).length)
    for (const i of order) {
      const r = dfs(settle(tap(s, i).state), [...path, i])
      if (r) return r
      if (nodes > maxNodes) return null
    }
    return null
  }
  return dfs(from ?? initialState(level), [])
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
// Level generation (used offline by scripts/generate-loop-sort-levels.ts)
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
  const colors = n <= 3 ? 2 : n <= 10 ? 3 : n <= 25 ? 4 : n <= 45 ? 5 : 6
  const empties = n <= 2 ? 2 : n <= 30 ? 1 + (n % 2) : 1
  const capacity = n <= 5 ? 6 : n <= 20 ? 5 : n <= 40 ? 4 : 4
  const hidden = n >= 6
  const curtain = n >= 18 && n % 3 === 0
  return { colors, empties, capacity, hidden, curtain }
}

export function generateLevel(n: number): LevelDef {
  const p = levelParams(n)
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const rand = rng32(n * 2654435761 + attempt * 97 + 1)
    const pool: number[] = []
    for (let c = 0; c < p.colors; c += 1) for (let k = 0; k < TRUCK_CAPACITY; k += 1) pool.push(c)
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    const trucks: TruckDef[] = []
    for (let i = 0; i < p.colors; i += 1) trucks.push({ blocks: pool.slice(i * 4, i * 4 + 4) })
    // a truck that is already complete or trivially sorted makes the level boring
    if (trucks.some((t) => t.blocks.every((b) => b === t.blocks[0]))) continue
    for (let e = 0; e < p.empties; e += 1) trucks.splice(Math.floor(rand() * (trucks.length + 1)), 0, { blocks: [] })
    if (p.curtain) {
      const candidates = trucks.map((t, i) => (t.blocks.length ? i : -1)).filter((i) => i >= 0)
      const idx = candidates[Math.floor(rand() * candidates.length)]
      const lockColor = Math.floor(rand() * p.colors)
      if (!trucks[idx].blocks.includes(lockColor)) trucks[idx] = { ...trucks[idx], lock: lockColor }
    }
    const def = { trucks, capacity: p.capacity }
    const any = solveDepthFirst(def)
    if (!any) continue
    // shortest solution when the search space is small enough; otherwise the level is hard anyway
    const shortest = solveLevel(def, 15000)
    const minTaps = Math.min(3 + n / 6, 9)
    if (shortest && shortest.length < minTaps) continue
    return { n, colors: p.colors, capacity: p.capacity, hidden: p.hidden, trucks, solution: shortest ?? any }
  }
  throw new Error(`Could not generate Loop Sort level ${n}`)
}
