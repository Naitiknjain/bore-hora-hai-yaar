export const W = 480
export const H = 640
export const PADDLE_W = 84
export const PADDLE_H = 14
export const PADDLE_Y = H - 48
export const BALL_R = 7
export const BRICK_COLS = 10
export const BRICK_W = 44
export const BRICK_H = 18
export const BRICK_GAP = 2
export const BRICK_TOP = 80
export const START_LIVES = 3

export interface Brick {
  x: number
  y: number
  hp: number
  maxHp: number
  points: number
  color: string
}

/** Wall layouts: each char is a brick (1/2 = hit points) or '.' for a gap. */
export const WALLS: string[][] = [
  ['1111111111', '1111111111', '1111111111', '1111111111', '1111111111'],
  ['2222222222', '1.111111.1', '1111..1111', '1.111111.1', '1111111111', '.11111111.'],
  ['..222222..', '.21111112.', '2111111112', '2112222112', '2111111112', '.21111112.', '..222222..'],
]

const ROW_COLORS = ['#ff4d5e', '#ff8a3d', '#ffd23f', '#3ee08f', '#4cc9f0', '#a77dff', '#ff5d8f']

export function buildWall(level: number): Brick[] {
  const layout = WALLS[level]
  const left = (W - (BRICK_COLS * BRICK_W + (BRICK_COLS - 1) * BRICK_GAP)) / 2
  const bricks: Brick[] = []
  layout.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      if (ch === '.') return
      const hp = Number(ch)
      bricks.push({
        x: left + c * (BRICK_W + BRICK_GAP),
        y: BRICK_TOP + r * (BRICK_H + BRICK_GAP),
        hp,
        maxHp: hp,
        points: (layout.length - r) * 10 + (hp - 1) * 20,
        color: ROW_COLORS[r % ROW_COLORS.length],
      })
    }),
  )
  return bricks
}

export interface Ball {
  x: number
  y: number
  vx: number
  vy: number
}

export const baseSpeed = (level: number) => 340 + level * 40

export function launch(paddleX: number, level: number): Ball {
  const speed = baseSpeed(level)
  const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.6
  return { x: paddleX, y: PADDLE_Y - BALL_R - 1, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed }
}

export interface StepResult {
  ball: Ball
  bricks: Brick[]
  gained: number
  lost: boolean
  hitPaddle: boolean
  hitBrick: boolean
}

/** Advances the ball with sub-steps so it never tunnels through bricks at high speed. */
export function stepBall(ball: Ball, bricks: Brick[], paddleX: number, dt: number): StepResult {
  let b = { ...ball }
  let list = bricks
  let gained = 0
  let hitPaddle = false
  let hitBrick = false
  const steps = Math.max(1, Math.ceil((Math.hypot(b.vx, b.vy) * dt) / (BALL_R * 0.8)))
  const h = dt / steps
  for (let i = 0; i < steps; i += 1) {
    b.x += b.vx * h
    b.y += b.vy * h
    if (b.x < BALL_R) {
      b.x = BALL_R
      b.vx = Math.abs(b.vx)
    } else if (b.x > W - BALL_R) {
      b.x = W - BALL_R
      b.vx = -Math.abs(b.vx)
    }
    if (b.y < BALL_R) {
      b.y = BALL_R
      b.vy = Math.abs(b.vy)
    }
    // paddle
    if (b.vy > 0 && b.y + BALL_R >= PADDLE_Y - PADDLE_H / 2 && b.y - BALL_R <= PADDLE_Y + PADDLE_H / 2 && Math.abs(b.x - paddleX) <= PADDLE_W / 2 + BALL_R) {
      const rel = Math.max(-1, Math.min(1, (b.x - paddleX) / (PADDLE_W / 2)))
      const speed = Math.min(Math.hypot(b.vx, b.vy) * 1.015, 720)
      const angle = rel * (Math.PI / 3) // up to 60° from vertical
      b.vx = Math.sin(angle) * speed
      b.vy = -Math.cos(angle) * speed
      b.y = PADDLE_Y - PADDLE_H / 2 - BALL_R
      hitPaddle = true
    }
    // bricks: first overlapping brick only
    const idx = list.findIndex((br) => b.x + BALL_R > br.x && b.x - BALL_R < br.x + BRICK_W && b.y + BALL_R > br.y && b.y - BALL_R < br.y + BRICK_H)
    if (idx >= 0) {
      const br = list[idx]
      const overlapX = Math.min(b.x + BALL_R - br.x, br.x + BRICK_W - (b.x - BALL_R))
      const overlapY = Math.min(b.y + BALL_R - br.y, br.y + BRICK_H - (b.y - BALL_R))
      if (overlapX < overlapY) {
        b.vx = b.x < br.x + BRICK_W / 2 ? -Math.abs(b.vx) : Math.abs(b.vx)
      } else {
        b.vy = b.y < br.y + BRICK_H / 2 ? -Math.abs(b.vy) : Math.abs(b.vy)
      }
      hitBrick = true
      if (br.hp <= 1) {
        gained += br.points
        list = list.filter((_, k) => k !== idx)
      } else {
        list = list.map((x, k) => (k === idx ? { ...x, hp: x.hp - 1 } : x))
      }
    }
    if (b.y - BALL_R > H) return { ball: b, bricks: list, gained, lost: true, hitPaddle, hitBrick }
  }
  // avoid near-horizontal endless bouncing
  if (Math.abs(b.vy) < 80) b = { ...b, vy: b.vy < 0 ? -80 : 80 }
  return { ball: b, bricks: list, gained, lost: false, hitPaddle, hitBrick }
}

export const clampPaddle = (x: number) => Math.max(PADDLE_W / 2, Math.min(W - PADDLE_W / 2, x))
