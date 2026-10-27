/**
 * Chakkar Cubes - core rules (self-contained so the level generator script can import it directly).
 * Internal game id stays `loop-sort` so saved progress keeps working.
 *
 * Rules (from the public listing, in-game text and observed gameplay; original levels only):
 *  - Trucks hold a stack of coloured cubes (bottom -> top), 4 slots each. Up to 12 upright trucks
 *    stand in rows inside and around a portrait conveyor loop (see boardLayout).
 *  - Tapping a truck sends its whole top group of same-coloured cubes onto the conveyor. The cubes
 *    stream out of the truck one per conveyor step (as in the reference), so every cube passes
 *    every truck downstream - none is skipped.
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
/**
 * Empty docks a Normal Mode level reserves for the Extra Truck ability. Levels are solved on exactly
 * this board, so what the player gets is the board the solver proved winnable.
 */
export const SPARE_DOCKS = 2

export interface TruckDef {
  blocks: number[]
  lock?: number // curtain: opens once this colour is completed
}

export interface LevelDef {
  n: number
  /** Board layout; older levels without one use 'rows'. */
  style?: LayoutStyle
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
  /** Cubes already tapped out of this truck, waiting to drop onto the conveyor (one per step). */
  outgoing?: number[]
}

export interface LoopState {
  /** board layout the positions belong to (defaults to 'rows') */
  style?: LayoutStyle
  /** how many of the last docks are spares for Extra Truck (they keep their own place on the board) */
  spares?: number
  trucks: Truck[]
  belt: (number | null)[] // one slot per conveyor position
  capacity: number
  completed: number[] // colours completed
}

// ---------------------------------------------------------------------------
// Layout (matches the reference Level 1): a portrait rounded loop with upright trucks.
//  - inner top row: up to 4 trucks standing inside the loop, open end up, fed by the top belt
//  - inner bottom row: up to 4 more, open end down, fed by the bottom belt
//  - outer rows: up to 2 above and 2 below the loop, facing it -> 12 trucks max
// Conveyor positions are spaced evenly along the whole loop (constant speed, no jumps) and
// every truck sits exactly on one position, so a passing cube is always offered to it.
// ---------------------------------------------------------------------------
export type Facing = 'up' | 'down' | 'left' | 'right'
export type RowId = 'inner-top' | 'inner-bottom' | 'outer-top' | 'outer-bottom' | 'inner-stack'
/**
 * Board layouts seen in the reference:
 *  - rows:   upright trucks in rows inside and around a rounded square loop (its first levels)
 *  - stack:  sideways trucks stacked inside the loop, facing the right-hand belt, with upright
 *            trucks above and below the loop facing it
 *  - tunnel: like stack, but the left side of the loop runs through a hidden tunnel (a C-shaped track)
 */
export type LayoutStyle = 'rows' | 'stack' | 'tunnel'

export interface TruckSpot {
  x: number
  y: number
  w: number
  h: number
  /** Direction of the open end (towards the belt). */
  facing: Facing
  row: RowId
  pos: number
}

export interface BoardLayout {
  width: number
  height: number
  /** Belt centre line. */
  loop: { x: number; y: number; w: number; h: number; r: number }
  step: number
  points: [number, number][]
  trucks: TruckSpot[]
  /** Area hidden by the tunnel (cubes inside it are not drawn), if this layout has one. */
  tunnel?: { x: number; y: number; w: number; h: number }
}

export interface BeltLayout {
  length: number
  truckPos: number[]
}

export const BOARD_WIDTH = 360
const LOOP_X = 34
const LOOP_W = BOARD_WIDTH - LOOP_X * 2
const LOOP_R = 46
const RIM_HALF = 26
const STEP = 34
const GAP = 8
const PAD = 26 // space between the belt rim and the trucks

/** Point at arc length `s` along a rounded rectangle, clockwise from the top-left straight. */
function pointOnLoop(x: number, y: number, w: number, h: number, r: number, s: number): [number, number] {
  const top = w - 2 * r
  const side = h - 2 * r
  const arc = (Math.PI * r) / 2
  const per = 2 * top + 2 * side + 4 * arc
  let d = ((s % per) + per) % per
  const corner = (cx: number, cy: number, from: number, t: number): [number, number] => {
    const a = from + (t / arc) * (Math.PI / 2)
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  }
  if (d < top) return [x + r + d, y]
  d -= top
  if (d < arc) return corner(x + w - r, y + r, -Math.PI / 2, d)
  d -= arc
  if (d < side) return [x + w, y + r + d]
  d -= side
  if (d < arc) return corner(x + w - r, y + h - r, 0, d)
  d -= arc
  if (d < top) return [x + w - r - d, y + h]
  d -= top
  if (d < arc) return corner(x + r, y + h - r, Math.PI / 2, d)
  d -= arc
  if (d < side) return [x, y + h - r - d]
  d -= side
  return corner(x + r, y + r, Math.PI, d)
}

const layoutCache = new Map<string, BoardLayout>()

/** Full board geometry for `truckCount` docks in a layout style (shared by the rules and the renderer). */
export function boardLayout(truckCount: number, style: LayoutStyle = 'rows', spares = 0): BoardLayout {
  const k = Math.max(1, Math.min(MAX_TRUCKS, truckCount))
  const sp = Math.max(0, Math.min(spares, k - 1))
  const id = `${style}:${k}:${sp}`
  const cached = layoutCache.get(id)
  if (cached) return cached
  const result = style === 'rows' ? rowsLayout(k, sp) : stackLayout(k, style === 'tunnel')
  layoutCache.set(id, result)
  return result
}

/** Evenly spaced belt positions around a rounded rectangle (constant speed, no jumps). */
function loopPoints(loop: { x: number; y: number; w: number; h: number; r: number }) {
  const per = 2 * (loop.w - 2 * loop.r) + 2 * (loop.h - 2 * loop.r) + 2 * Math.PI * loop.r
  const n = Math.round(per / STEP)
  const step = per / n
  const points: [number, number][] = Array.from({ length: n }, (_, i) => pointOnLoop(loop.x, loop.y, loop.w, loop.h, loop.r, i * step))
  return { points, step }
}

/** Picks the free belt position closest to a truck's open end. */
function positionPicker(points: [number, number][], isFree: (i: number) => boolean = () => true) {
  const used = new Set<number>()
  return (x: number, y: number) => {
    let best = -1
    let bestD = Infinity
    points.forEach(([px, py], i) => {
      if (used.has(i) || !isFree(i)) return
      const d = (px - x) ** 2 + (py - y) ** 2
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    used.add(best)
    return best
  }
}

/**
 * Stack layout: up to 4 sideways trucks stacked inside the loop with their open end at the right
 * belt, then upright trucks above the loop (facing down) and below it (facing up), up to 4 each.
 */
function stackLayout(k: number, tunnel: boolean): BoardLayout {
  const inner = Math.min(4, k)
  const above = Math.min(4, Math.ceil((k - inner) / 2))
  const below = Math.min(4, k - inner - above)
  const innerW = LOOP_W - 2 * RIM_HALF - 2 * 12
  // sideways trucks: long side across the loop
  const sw = Math.min(200, innerW)
  const sh = Math.round(sw / 2.05)
  const outerCount = Math.max(above, below)
  const ow = outerCount ? Math.min(78, Math.floor((LOOP_W - (outerCount - 1) * GAP) / outerCount)) : 0
  const oh = Math.round(ow * 2.05)
  const loopY = 30 + (above ? oh + 22 : 0)
  const loopH = Math.max(300, inner * sh + (inner - 1) * GAP + 2 * (RIM_HALF + PAD))
  const height = loopY + loopH + 40 + (below ? oh + 22 : 0)
  const loop = { x: LOOP_X, y: loopY, w: LOOP_W, h: loopH, r: LOOP_R }
  const { points, step } = loopPoints(loop)
  // the tunnel swallows the whole left side (corners included): the top and bottom straights end in caps
  const tunnelRect = tunnel ? { x: 0, y: loopY - RIM_HALF - 4, w: LOOP_X + LOOP_R, h: loopH + 2 * RIM_HALF + 8 } : undefined
  const inTunnel = (i: number) =>
    // (half a step of margin keeps loading points clear of the end caps)
    !!tunnelRect && points[i][0] < tunnelRect.x + tunnelRect.w + STEP / 2 && points[i][1] > tunnelRect.y && points[i][1] < tunnelRect.y + tunnelRect.h
  // no truck may load or unload inside the tunnel, where nobody could see it
  const pick = positionPicker(points, (i) => !inTunnel(i))
  const trucks: TruckSpot[] = []
  const stackH = inner * sh + (inner - 1) * GAP
  const stackY = loopY + loopH / 2 - stackH / 2
  // the stack hugs the right side, its open end right next to the belt
  const stackX = LOOP_X + LOOP_W - RIM_HALF - 10 - sw
  for (let j = 0; j < inner; j += 1) {
    const y = stackY + j * (sh + GAP)
    trucks.push({ x: stackX, y, w: sw, h: sh, facing: 'right', row: 'inner-stack', pos: pick(LOOP_X + LOOP_W, y + sh / 2) })
  }
  const rowXs = (count: number) => {
    const total = count * ow + (count - 1) * GAP
    const start = LOOP_X + LOOP_W / 2 - total / 2
    return Array.from({ length: count }, (_, j) => start + j * (ow + GAP))
  }
  for (const x of rowXs(above)) trucks.push({ x, y: loopY - RIM_HALF - 8 - oh, w: ow, h: oh, facing: 'down', row: 'outer-top', pos: pick(x + ow / 2, loopY) })
  for (const x of rowXs(below)) trucks.push({ x, y: loopY + loopH + RIM_HALF + 8, w: ow, h: oh, facing: 'up', row: 'outer-bottom', pos: pick(x + ow / 2, loopY + loopH) })
  return { width: BOARD_WIDTH, height, loop, step, points, trucks, tunnel: tunnelRect }
}

function rowsLayout(total: number, spares: number): BoardLayout {
  // spare docks (up to 4) get their own row below the loop, like the reference's extra truck, so the
  // real trucks keep exactly the places (and belt positions) they have without them
  const spareRow = Math.min(4, spares, Math.max(0, total - 1))
  const k = total - spareRow
  // one row up to 4 trucks; beyond that split evenly over two rows so trucks stay large
  const innerTop = k <= 4 ? k : Math.ceil(Math.min(k, 8) / 2)
  const innerBottom = Math.min(4, k - innerTop)
  const outerTop = Math.min(2, k - innerTop - innerBottom)
  const outerBottom = Math.min(2, k - innerTop - innerBottom - outerTop)
  const perRow = Math.max(innerTop, innerBottom)
  const innerW = LOOP_W - 2 * RIM_HALF - 2 * 12
  // trucks get bigger when there are fewer of them (like the reference's first levels)
  const tw = Math.min(92, Math.floor((innerW - (perRow - 1) * GAP) / perRow))
  const th = Math.round(tw * 2.05)
  const outerH = th + 30
  const loopY = 30 + (outerTop ? outerH : 0)
  // portrait like the reference: a single row still gets a tall loop
  const loopH = innerBottom ? 2 * th + 2 * (RIM_HALF + PAD) + 34 : Math.max(310, th + 2 * (RIM_HALF + PAD) + 40)
  const height = loopY + loopH + 40 + (outerBottom || spareRow ? outerH : 0)
  const loop = { x: LOOP_X, y: loopY, w: LOOP_W, h: loopH, r: LOOP_R }

  const per = 2 * (LOOP_W - 2 * LOOP_R) + 2 * (loopH - 2 * LOOP_R) + 2 * Math.PI * LOOP_R
  const n = Math.round(per / STEP)
  const step = per / n
  const points: [number, number][] = Array.from({ length: n }, (_, i) => pointOnLoop(loop.x, loop.y, loop.w, loop.h, loop.r, i * step))

  const used = new Set<number>()
  const nearest = (x: number, y: number) => {
    let best = -1
    let bestD = Infinity
    points.forEach(([px, py], i) => {
      if (used.has(i)) return
      const dd = (px - x) ** 2 + (py - y) ** 2 * 4 // prefer the straight edge right next to the truck
      if (dd < bestD) {
        bestD = dd
        best = i
      }
    })
    used.add(best)
    return best
  }
  const trucks: TruckSpot[] = []
  const rowXs = (count: number) => {
    const total = count * tw + (count - 1) * GAP
    const start = LOOP_X + LOOP_W / 2 - total / 2
    return Array.from({ length: count }, (_, j) => start + j * (tw + GAP))
  }
  for (const x of rowXs(innerTop)) {
    trucks.push({ x, y: loopY + RIM_HALF + PAD, w: tw, h: th, facing: 'up', row: 'inner-top', pos: nearest(x + tw / 2, loopY) })
  }
  for (const x of rowXs(innerBottom)) {
    trucks.push({ x, y: loopY + loopH - RIM_HALF - PAD - th, w: tw, h: th, facing: 'down', row: 'inner-bottom', pos: nearest(x + tw / 2, loopY + loopH) })
  }
  // outer trucks sit exactly over a free belt position between the inner trucks
  const outer = (count: number, edgeY: number, facing: Facing, row: RowId, y: number) => {
    for (let j = 0; j < count; j += 1) {
      const wantX = LOOP_X + LOOP_W * (count === 1 ? 0.5 : j === 0 ? 0.3 : 0.7)
      const pos = nearest(wantX, edgeY)
      trucks.push({ x: points[pos][0] - tw / 2, y, w: tw, h: th, facing, row, pos })
    }
  }
  outer(outerTop, loopY, 'down', 'outer-top', loopY - RIM_HALF - 8 - th)
  outer(outerBottom, loopY + loopH, 'up', 'outer-bottom', loopY + loopH + RIM_HALF + 8)
  // spare docks below the loop, facing it (only when the real trucks leave that row free)
  const spareXs = rowXs(spareRow)
  for (const x of spareXs) trucks.push({ x, y: loopY + loopH + RIM_HALF + 8, w: tw, h: th, facing: 'up', row: 'outer-bottom', pos: nearest(x + tw / 2, loopY + loopH) })

  return { width: BOARD_WIDTH, height, loop, step, points, trucks }
}

export function beltLayout(truckCount: number, style: LayoutStyle = 'rows', spares = 0): BeltLayout {
  const b = boardLayout(truckCount, style, spares)
  return { length: b.points.length, truckPos: b.trucks.map((t) => t.pos) }
}

/** Largest capacity a layout can hold while keeping free conveyor positions for movement. */
export const maxCapacity = (s: LoopState) => s.belt.length - 2

/**
 * Builds the starting board. `spareDocks` reserves empty, inactive docks for the Extra Truck
 * ability (they are laid out now so adding a truck never moves the conveyor).
 */
export function initialState(level: Pick<LevelDef, 'trucks' | 'capacity' | 'style'>, spareDocks = 0): LoopState {
  const spare = Math.max(0, Math.min(spareDocks, MAX_TRUCKS - level.trucks.length))
  const total = level.trucks.length + spare
  const layout = beltLayout(total, level.style, spare)
  const trucks: Truck[] = level.trucks.map((t, i) => ({ blocks: t.blocks.slice(), lock: t.lock, done: false, pos: layout.truckPos[i] }))
  for (let i = level.trucks.length; i < total; i += 1) trucks.push({ blocks: [], done: false, pos: layout.truckPos[i], inactive: true })
  const belt = Array(layout.length).fill(null)
  return { style: level.style, spares: spare, trucks, belt, capacity: Math.min(level.capacity, belt.length - 2), completed: [] }
}

export const beltCount = (s: LoopState) => s.belt.reduce((n: number, b) => (b === null ? n : n + 1), 0)
/** Cubes tapped out of trucks that have not reached the conveyor yet. */
export const outgoingCount = (s: LoopState) => s.trucks.reduce((n, t) => n + (t.outgoing?.length ?? 0), 0)
/** Cubes the conveyor is committed to carry (on it now + still streaming out of trucks). */
export const conveyorLoad = (s: LoopState) => beltCount(s) + outgoingCount(s)
export const freeSpace = (s: LoopState) => s.capacity - conveyorLoad(s)
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

/** Sends the top group out of the truck: it streams onto the conveyor one cube per step. */
export function tap(s: LoopState, i: number): { state: LoopState; error: TapError | null } {
  const err = canTap(s, i)
  if (err) return { state: s, error: err }
  const t = s.trucks[i]
  const run = topRun(t)
  const trucks = s.trucks.map((x, k) =>
    k === i ? { ...x, blocks: x.blocks.slice(0, x.blocks.length - run.length), outgoing: [...(x.outgoing ?? []), ...run.slice().reverse()] } : x,
  )
  return { state: { ...s, trucks }, error: null }
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
  if (t.inactive || t.done || isLocked(s, t) || t.outgoing?.length || t.blocks.length >= TRUCK_CAPACITY) return false
  return !t.blocks.length || t.blocks[t.blocks.length - 1] === color
}

export interface TickResult {
  state: LoopState
  absorbed: { truck: number; color: number }[]
  completed: number[] // truck indices completed this tick
  emitted: { truck: number; pos: number; color: number }[] // cubes that left a truck this tick
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
  // trucks with a pending stream drop their next cube onto their own (now empty) position;
  // it moves on next step and is offered to every truck it passes
  const emitted: { truck: number; pos: number; color: number }[] = []
  trucks = trucks.map((t, i) => {
    if (!t.outgoing?.length || belt[t.pos] !== null) return t
    const [c, ...rest] = t.outgoing
    belt[t.pos] = c
    emitted.push({ truck: i, pos: t.pos, color: c })
    return { ...t, outgoing: rest.length ? rest : undefined }
  })
  return { state: { ...s, trucks, belt, completed }, absorbed, completed: completedNow, emitted }
}

/** Runs the conveyor until nothing more can be absorbed (a full lap with no pick-ups) or it is empty. */
export function settle(s: LoopState): LoopState {
  let state = s
  let idle = 0
  while (conveyorLoad(state) > 0 && idle < state.belt.length) {
    const r = tick(state)
    state = r.state
    idle = r.absorbed.length || r.emitted.length ? 0 : idle + 1
  }
  return state
}

export const isWon = (s: LoopState) => conveyorLoad(s) === 0 && s.trucks.every((t) => t.done || t.blocks.length === 0)

/** True when blocks remain but no truck could ever be tapped (even with unlimited space). */
export function hasNoMoves(s: LoopState): boolean {
  if (isWon(s) || outgoingCount(s) > 0) return false
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
  return `${s.trucks.map((t) => (t.inactive ? 'X' : t.done ? 'D' : t.blocks.join('') + (t.outgoing?.length ? `>${t.outgoing.join('')}` : ''))).join('|')}#${s.belt.map((b) => (b === null ? '.' : b)).join('')}#${s.capacity}`
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
  let h = conveyorLoad(s)
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
export function replay(level: Pick<LevelDef, 'trucks' | 'capacity' | 'style'>, taps: number[], spareDocks = SPARE_DOCKS): boolean {
  let s = initialState(level, spareDocks)
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
  // layouts in the reference's order: rows first, stacked sideways trucks from level 3, the C-shaped
  // tunnel track from level 7, then a mix
  const style: LayoutStyle = n <= 2 ? 'rows' : n <= 6 ? 'stack' : (['tunnel', 'rows', 'stack'] as const)[(n - 7) % 3]
  return { colors, empties, capacity, hidden, curtain, style }
}

/** Level 1 is a one-tap tutorial: one colour split over two trucks. */
function tutorialLevel(): LevelDef {
  const def = { style: 'rows' as const, trucks: [{ blocks: [0, 0, 0] }, { blocks: [0] }], capacity: 7 }
  return { n: 1, colors: 1, hidden: false, ...def, solution: solveLevel(def, 80000, initialState(def, SPARE_DOCKS)) ?? [] }
}

export function generateLevel(n: number): LevelDef {
  if (n === 1) return tutorialLevel()
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
    const def = { trucks, capacity: p.capacity, style: p.style }
    // solve the exact board a Normal Mode player gets (with its spare Extra Truck docks)
    const board = initialState(def, SPARE_DOCKS)
    const any = solveBestFirst(def, 60000, board) ?? solveDepthFirst(def, 60000, board)
    if (!any) continue
    // shortest solution when the search space is small enough; otherwise the level is hard anyway
    const shortest = solveLevel(def, 15000, board)
    const minTaps = Math.min(3 + n / 6, 10)
    if (shortest && shortest.length < minTaps) continue
    return { n, style: p.style, colors: p.colors, capacity: p.capacity, hidden: p.hidden, trucks, solution: shortest ?? any }
  }
  throw new Error(`Could not generate level ${n}`)
}
