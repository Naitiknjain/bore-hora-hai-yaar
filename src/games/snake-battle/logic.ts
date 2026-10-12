import type { Rng } from '../../lib/random'

export type Dir = 'up' | 'down' | 'left' | 'right'
export interface Point {
  x: number
  y: number
}

export const COLS = 20
export const ROWS = 20
export const START_LENGTH = 3
export const MAX_SCORE = COLS * ROWS - START_LENGTH

const VEC: Record<Dir, Point> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }
const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' }

export interface SnakeState {
  snake: Point[] // head first
  dir: Dir
  queue: Dir[] // buffered turns, applied one per tick
  food: Point | null
  score: number
  status: 'running' | 'dead' | 'won'
}

export function initialState(rng: Rng): SnakeState {
  const y = Math.floor(ROWS / 2)
  const snake = Array.from({ length: START_LENGTH }, (_, i) => ({ x: 6 - i, y }))
  const s: SnakeState = { snake, dir: 'right', queue: [], food: null, score: 0, status: 'running' }
  s.food = placeFood(s.snake, rng)
  return s
}

export function placeFood(snake: Point[], rng: Rng): Point | null {
  const occupied = new Set(snake.map((p) => p.y * COLS + p.x))
  const free: number[] = []
  for (let i = 0; i < COLS * ROWS; i += 1) if (!occupied.has(i)) free.push(i)
  if (!free.length) return null
  const idx = free[Math.floor(rng() * free.length)]
  return { x: idx % COLS, y: Math.floor(idx / COLS) }
}

/**
 * Buffers a turn. A turn is compared with the *last buffered* direction, so quickly pressing
 * up+left while moving right cannot produce an illegal 180° reversal within one tick.
 */
export function queueTurn(state: SnakeState, dir: Dir): SnakeState {
  const last = state.queue.length ? state.queue[state.queue.length - 1] : state.dir
  if (dir === last || dir === OPPOSITE[last] || state.queue.length >= 3) return state
  return { ...state, queue: [...state.queue, dir] }
}

export function step(state: SnakeState, rng: Rng): SnakeState {
  if (state.status !== 'running') return state
  const [nextDir, ...rest] = state.queue.length ? state.queue : [state.dir]
  const dir = nextDir
  const head = state.snake[0]
  const v = VEC[dir]
  const nh = { x: head.x + v.x, y: head.y + v.y }

  if (nh.x < 0 || nh.y < 0 || nh.x >= COLS || nh.y >= ROWS) return { ...state, dir, queue: rest, status: 'dead' }

  const eating = state.food !== null && nh.x === state.food.x && nh.y === state.food.y
  // the tail moves away this tick unless we grow, so it is not an obstacle
  const body = eating ? state.snake : state.snake.slice(0, -1)
  if (body.some((p) => p.x === nh.x && p.y === nh.y)) return { ...state, dir, queue: rest, status: 'dead' }

  const snake = [nh, ...body]
  if (!eating) return { ...state, snake, dir, queue: rest }

  const score = state.score + 1
  const food = placeFood(snake, rng)
  return { snake, dir, queue: rest, food, score, status: food ? 'running' : 'won' }
}

/** Milliseconds per tick: starts relaxed and speeds up gradually as the snake grows. */
export const tickMs = (score: number) => Math.max(65, 150 - score * 2.5)
