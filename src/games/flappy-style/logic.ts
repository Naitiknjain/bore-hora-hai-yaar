import type { Rng } from '../../lib/random'

export const W = 360
export const H = 640
export const GROUND = H - 70
export const BIRD_X = 100
export const BIRD_R = 15
export const GRAVITY = 1500
export const FLAP_V = -430
export const PIPE_W = 64
export const GAP = 158
export const SPACING = 215
export const SPEED = 155

export interface Pipe {
  x: number
  gapY: number // centre of the gap
  passed: boolean
}

export interface FlappyState {
  y: number
  vy: number
  pipes: Pipe[]
  score: number
  started: boolean
  dead: boolean
  t: number
}

export function initial(): FlappyState {
  return { y: H / 2 - 40, vy: 0, pipes: [], score: 0, started: false, dead: false, t: 0 }
}

export function newPipe(x: number, rng: Rng): Pipe {
  const min = 90 + GAP / 2
  const max = GROUND - 70 - GAP / 2
  return { x, gapY: min + rng() * (max - min), passed: false }
}

export function flap(s: FlappyState, rng: Rng): FlappyState {
  if (s.dead) return s
  const pipes = s.started ? s.pipes : [newPipe(W + 60, rng)]
  return { ...s, started: true, vy: FLAP_V, pipes }
}

function circleRect(cx: number, cy: number, r: number, x: number, y: number, w: number, h: number) {
  const nx = Math.max(x, Math.min(cx, x + w))
  const ny = Math.max(y, Math.min(cy, y + h))
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r
}

export function collides(s: FlappyState): boolean {
  if (s.y + BIRD_R >= GROUND) return true
  return s.pipes.some(
    (p) =>
      circleRect(BIRD_X, s.y, BIRD_R - 2, p.x, -1000, PIPE_W, p.gapY - GAP / 2 + 1000) ||
      circleRect(BIRD_X, s.y, BIRD_R - 2, p.x, p.gapY + GAP / 2, PIPE_W, GROUND - (p.gapY + GAP / 2)),
  )
}

export function step(s: FlappyState, dt: number, rng: Rng): { state: FlappyState; scored: boolean } {
  if (!s.started || s.dead) return { state: { ...s, t: s.t + dt }, scored: false }
  const vy = s.vy + GRAVITY * dt
  const y = Math.max(-40, s.y + vy * dt) // flying above the screen is allowed, pipes still extend upwards
  let pipes = s.pipes.map((p) => ({ ...p, x: p.x - SPEED * dt })).filter((p) => p.x + PIPE_W > -10)
  const last = pipes[pipes.length - 1]
  if (!last || last.x < W + 60 - SPACING) pipes = [...pipes, newPipe((last?.x ?? W) + SPACING, rng)]
  let score = s.score
  let scored = false
  pipes = pipes.map((p) => {
    if (!p.passed && p.x + PIPE_W / 2 < BIRD_X) {
      score += 1
      scored = true
      return { ...p, passed: true }
    }
    return p
  })
  const next: FlappyState = { ...s, y, vy, pipes, score, t: s.t + dt }
  if (collides(next)) return { state: { ...next, dead: true, y: Math.min(next.y, GROUND - BIRD_R) }, scored }
  return { state: next, scored }
}
