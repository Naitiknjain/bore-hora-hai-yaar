import type { Rng } from '../../lib/random'

export const W = 720
export const H = 240
export const GROUND_Y = 200
export const DINO_X = 60
export const STAND = { w: 40, h: 46 }
export const DUCK = { w: 56, h: 26 }
export const GRAVITY = 2600
export const JUMP_V = -800
export const START_SPEED = 380
export const MAX_SPEED = 960

export type ObstacleKind = 'cactus-s' | 'cactus-l' | 'cactus-group' | 'bird-low' | 'bird-mid' | 'bird-high'

export interface Obstacle {
  kind: ObstacleKind
  x: number
  y: number // top
  w: number
  h: number
  /** cactus clusters: the height of each cactus, left to right (drawing only) */
  parts?: number[]
}

/** Horizontal distance covered during one full jump at a given speed. */
export const jumpLength = (speed: number) => speed * ((2 * -JUMP_V) / GRAVITY)

export interface DinoState {
  y: number // dino bottom (GROUND_Y when on the ground)
  vy: number
  ducking: boolean
  obstacles: Obstacle[]
  speed: number
  distance: number
  nextGap: number
  dead: boolean
  t: number
}

export const initial = (): DinoState => ({
  y: GROUND_Y,
  vy: 0,
  ducking: false,
  obstacles: [],
  speed: START_SPEED,
  distance: 0,
  nextGap: 500,
  dead: false,
  t: 0,
})

export const onGround = (s: DinoState) => s.y >= GROUND_Y && s.vy >= 0
export const score = (s: DinoState) => Math.floor(s.distance / 10)

export function makeObstacle(kind: ObstacleKind, x: number): Obstacle {
  switch (kind) {
    case 'cactus-s':
      return { kind, x, y: GROUND_Y - 36, w: 18, h: 36 }
    case 'cactus-l':
      return { kind, x, y: GROUND_Y - 50, w: 26, h: 50 }
    case 'cactus-group':
      return { kind, x, y: GROUND_Y - 40, w: 56, h: 40 }
    case 'bird-low': // must jump
      return { kind, x, y: GROUND_Y - 34, w: 42, h: 26 }
    case 'bird-mid': // duck (or jump high)
      return { kind, x, y: GROUND_Y - 62, w: 42, h: 26 }
    case 'bird-high': // run underneath
      return { kind, x, y: GROUND_Y - 100, w: 42, h: 26 }
  }
}

/**
 * The next stretch of the course, starting at `x`: a cactus cluster of 1-4 cacti of random sizes, a
 * bird at one of three heights (jump / duck / run under), or - later on - a quick double. Every
 * pattern can be cleared at the current speed. Returns the obstacles and the distance to the next
 * spawn (pattern width plus a random gap, sometimes a longer breather).
 */
export function spawnPattern(rng: Rng, distance: number, speed: number, x: number): { obstacles: Obstacle[]; next: number } {
  const jump = jumpLength(speed)
  const birdChance = distance < 1500 ? 0 : Math.min(0.35, 0.12 + distance / 40000)
  const obstacles: Obstacle[] = []
  if (rng() < birdChance) {
    const kind = (['bird-low', 'bird-mid', 'bird-high'] as const)[Math.floor(rng() * 3)]
    const b = makeObstacle(kind, x)
    // a little height jitter that never changes how the bird has to be passed
    obstacles.push({ ...b, y: b.y + Math.round((rng() - 0.5) * (kind === 'bird-high' ? 12 : 6)) })
  } else {
    obstacles.push(cactusCluster(rng, x, jump))
    if (distance > 6000 && rng() < 0.15) {
      // a quick double: land, then jump straight away
      const first = obstacles[0]
      const gapAfterLanding = 40 + speed * (0.1 + rng() * 0.15)
      obstacles.push(cactusCluster(rng, first.x + jump + gapAfterLanding, jump, 2))
    }
  }
  const last = obstacles[obstacles.length - 1]
  const width = last.x + last.w - x
  const breather = rng() < 0.1 ? 1.8 : 1
  return { obstacles, next: width + speed * (0.7 + rng() * 1.1) * breather }
}

/** 1-4 cacti side by side, random heights and widths, never wider than a jump can clear. */
export function cactusCluster(rng: Rng, x: number, jump: number, maxCount = 4): Obstacle {
  const r = rng()
  let count = Math.min(maxCount, r < 0.5 ? 1 : r < 0.8 ? 2 : r < 0.95 ? 3 : 4)
  const widths: number[] = []
  const heights: number[] = []
  for (let i = 0; i < 4; i += 1) {
    widths.push(14 + Math.round(rng() * 10))
    heights.push(28 + Math.round(rng() * 26))
  }
  const room = Math.max(18, jump - 90)
  while (count > 1 && widths.slice(0, count).reduce((a, b) => a + b, 0) > room) count -= 1
  const w = widths.slice(0, count).reduce((a, b) => a + b, 0)
  const parts = heights.slice(0, count)
  const h = Math.max(...parts)
  const kind: ObstacleKind = count > 1 ? 'cactus-group' : h > 44 ? 'cactus-l' : 'cactus-s'
  return { kind, x, y: GROUND_Y - h, w, h, parts }
}

export function spawnKind(rng: Rng, distance: number): ObstacleKind {
  const birds = distance > 4000
  const r = rng()
  if (birds && r < 0.3) return (['bird-low', 'bird-mid', 'bird-high'] as const)[Math.floor(rng() * 3)]
  return r < 0.55 ? 'cactus-s' : r < 0.85 ? 'cactus-l' : 'cactus-group'
}

export function jump(s: DinoState): DinoState {
  if (s.dead || !onGround(s)) return s
  return { ...s, vy: JUMP_V, ducking: false }
}

export function dinoBox(s: DinoState) {
  const size = s.ducking && onGround(s) ? DUCK : STAND
  // slightly forgiving hitbox
  return { x: DINO_X + 4, y: s.y - size.h + 4, w: size.w - 8, h: size.h - 6 }
}

const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

export function step(s: DinoState, dt: number, ducking: boolean, rng: Rng): DinoState {
  if (s.dead) return s
  let vy = s.vy + GRAVITY * dt * (ducking && s.y < GROUND_Y ? 2.2 : 1) // ducking mid-air = fast fall
  let y = s.y + vy * dt
  if (y >= GROUND_Y) {
    y = GROUND_Y
    vy = 0
  }
  const speed = Math.min(MAX_SPEED, s.speed + dt * 9)
  const dx = speed * dt
  const obstacles = s.obstacles.map((o) => ({ ...o, x: o.x - dx })).filter((o) => o.x + o.w > -20)
  let nextGap = s.nextGap - dx
  if (nextGap <= 0) {
    // gaps scale with speed so jumps stay possible
    const p = spawnPattern(rng, s.distance, speed, W + 20)
    obstacles.push(...p.obstacles)
    nextGap = p.next
  }
  const next: DinoState = { ...s, y, vy, ducking, obstacles, speed, distance: s.distance + dx, nextGap, t: s.t + dt }
  const box = dinoBox(next)
  if (obstacles.some((o) => overlap(box, { x: o.x + 3, y: o.y + 3, w: o.w - 6, h: o.h - 4 }))) return { ...next, dead: true }
  return next
}
