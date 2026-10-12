import type { Rng } from '../../lib/random'
import type { Difficulty } from '../../types'

export const W = 640
export const H = 400
export const PADDLE_H = 72
export const PADDLE_W = 12
export const BALL = 10
export const PADDLE_X = 24
export const PADDLE_SPEED = 420

export interface PongState {
  left: number // paddle centre y
  right: number
  ball: { x: number; y: number; vx: number; vy: number }
  score: [number, number]
  serveTimer: number // seconds until the ball moves
  hits: number
}

export const AI: Record<Difficulty, { speed: number; error: number; predict: boolean }> = {
  easy: { speed: 210, error: 55, predict: false },
  medium: { speed: 320, error: 26, predict: false },
  hard: { speed: 460, error: 8, predict: true },
}

export function serve(state: PongState, towards: 0 | 1, rng: Rng): PongState {
  const angle = (rng() - 0.5) * 0.9
  const speed = 300
  const dir = towards === 0 ? -1 : 1
  return {
    ...state,
    ball: { x: W / 2, y: H / 2, vx: Math.cos(angle) * speed * dir, vy: Math.sin(angle) * speed },
    serveTimer: 0.8,
    hits: 0,
  }
}

export function initialState(rng: Rng): PongState {
  return serve({ left: H / 2, right: H / 2, ball: { x: W / 2, y: H / 2, vx: 0, vy: 0 }, score: [0, 0], serveTimer: 0, hits: 0 }, rng() < 0.5 ? 0 : 1, rng)
}

export const clampPaddle = (y: number) => Math.max(PADDLE_H / 2, Math.min(H - PADDLE_H / 2, y))

/** Predicts where the ball will cross x, including wall bounces. */
export function predictY(ball: PongState['ball'], x: number): number {
  if (ball.vx === 0) return ball.y
  const t = (x - ball.x) / ball.vx
  if (t < 0) return H / 2
  let y = ball.y + ball.vy * t
  const span = H - BALL
  y -= BALL / 2
  y = ((y % (2 * span)) + 2 * span) % (2 * span)
  if (y > span) y = 2 * span - y
  return y + BALL / 2
}

export function aiTarget(state: PongState, difficulty: Difficulty, jitter: number): number {
  const cfg = AI[difficulty]
  const coming = state.ball.vx > 0
  if (!coming) return H / 2 + jitter * 0.3
  const base = cfg.predict ? predictY(state.ball, W - PADDLE_X) : state.ball.y
  return base + jitter * cfg.error
}

export function movePaddle(current: number, target: number, maxSpeed: number, dt: number): number {
  const d = target - current
  const step = Math.sign(d) * Math.min(Math.abs(d), maxSpeed * dt)
  return clampPaddle(current + step)
}

/**
 * Advances the ball. Returns the scoring side (0 = left scored, 1 = right scored) when a point ends.
 */
export function stepBall(state: PongState, dt: number): { state: PongState; scored: 0 | 1 | null; hit: boolean; wall: boolean } {
  if (state.serveTimer > 0) return { state: { ...state, serveTimer: Math.max(0, state.serveTimer - dt) }, scored: null, hit: false, wall: false }
  const b = { ...state.ball }
  let hits = state.hits
  let hit = false
  let wall = false
  b.x += b.vx * dt
  b.y += b.vy * dt
  if (b.y < BALL / 2) {
    b.y = BALL / 2
    b.vy = Math.abs(b.vy)
    wall = true
  } else if (b.y > H - BALL / 2) {
    b.y = H - BALL / 2
    b.vy = -Math.abs(b.vy)
    wall = true
  }

  const bounce = (paddleY: number, dir: 1 | -1) => {
    const rel = (b.y - paddleY) / (PADDLE_H / 2) // -1..1
    const speed = Math.min(780, Math.hypot(b.vx, b.vy) * 1.06)
    const angle = rel * 0.95
    b.vx = Math.cos(angle) * speed * dir
    b.vy = Math.sin(angle) * speed
    hits += 1
    hit = true
  }

  // left paddle
  if (b.vx < 0 && b.x - BALL / 2 <= PADDLE_X + PADDLE_W / 2 && b.x + BALL / 2 >= PADDLE_X - PADDLE_W / 2) {
    if (Math.abs(b.y - state.left) <= PADDLE_H / 2 + BALL / 2) {
      b.x = PADDLE_X + PADDLE_W / 2 + BALL / 2
      bounce(state.left, 1)
    }
  }
  // right paddle
  const rx = W - PADDLE_X
  if (b.vx > 0 && b.x + BALL / 2 >= rx - PADDLE_W / 2 && b.x - BALL / 2 <= rx + PADDLE_W / 2) {
    if (Math.abs(b.y - state.right) <= PADDLE_H / 2 + BALL / 2) {
      b.x = rx - PADDLE_W / 2 - BALL / 2
      bounce(state.right, -1)
    }
  }

  let scored: 0 | 1 | null = null
  if (b.x < -BALL) scored = 1
  else if (b.x > W + BALL) scored = 0
  const score: [number, number] = [...state.score]
  if (scored !== null) score[scored] += 1
  return { state: { ...state, ball: b, hits, score }, scored, hit, wall }
}
