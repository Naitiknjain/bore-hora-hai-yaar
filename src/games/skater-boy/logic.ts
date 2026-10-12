import { createRng, type Rng } from '../../lib/random'

/**
 * Skater Boy - an original side-scrolling skateboard engine inspired by the classic genre.
 * Levels are plain data (ground segments, obstacles, coins). The 90 original campaign levels are
 * produced by a deterministic generator whose difficulty rises per world; an autopilot in the
 * tests proves every generated level can be finished. Hand-made LevelData can be dropped in too.
 */

export type World = 'town' | 'forest' | 'cemetery'
export const WORLDS: { id: World; name: string; from: number; to: number }[] = [
  { id: 'town', name: 'Town', from: 1, to: 30 },
  { id: 'forest', name: 'Forest', from: 31, to: 60 },
  { id: 'cemetery', name: 'Cemetery', from: 61, to: 90 },
]
export const TOTAL_LEVELS = 90

export const GROUND = 300 // base ground line (screen y) - surfaces are measured upward from here
export const CRUISE = 260
export const BOOST = 390
export const ACCEL = 320
export const GRAVITY = 1800
export const JUMP_V = 650
export const RAMP_V = 860
export const TRICK_TIME = 0.42
export const PLAYER_W = 28
export const PLAYER_H = 46
export const FINISH_RUNOUT = 260

export interface Segment {
  x0: number
  x1: number
  h0: number // surface height above GROUND at x0
  h1: number // at x1 (h1 > h0 = ramp)
}
export type ObstacleKind = 'cone' | 'bin' | 'bench' | 'log' | 'rock' | 'stump' | 'tomb' | 'coffin' | 'pumpkin'
export interface Obstacle {
  x: number
  w: number
  h: number
  kind: ObstacleKind
}
export interface Coin {
  x: number
  h: number // height above GROUND
}
export interface LevelData {
  id: number
  world: World
  length: number // finish line x
  segments: Segment[]
  obstacles: Obstacle[]
  coins: Coin[]
}

export function worldOf(n: number): World {
  return n <= 30 ? 'town' : n <= 60 ? 'forest' : 'cemetery'
}

/** Surface height at x, or null over a gap. */
export function surfaceAt(level: LevelData, x: number): number | null {
  for (const s of level.segments) {
    if (x >= s.x0 && x <= s.x1) return s.h0 + ((s.h1 - s.h0) * (x - s.x0)) / Math.max(1, s.x1 - s.x0)
  }
  return null
}

function segmentAt(level: LevelData, x: number): Segment | null {
  return level.segments.find((s) => x >= s.x0 && x <= s.x1) ?? null
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------
export interface SkaterState {
  x: number
  h: number // feet height above GROUND
  vy: number // upward positive
  speed: number
  grounded: boolean
  trickTimer: number // > 0 while a trick animation is running
  tricksThisAir: number
  trickPoints: number
  cleanLandings: number
  coins: Set<number>
  status: 'riding' | 'crashed' | 'finished'
  crashReason?: string
  rotation: number // visual board spin
  fromJump: boolean // airborne because of a jump (early release = short hop)
  t: number
  lastMessage?: string
}

export interface Input {
  accelerate: boolean
  jump: boolean // pressed this frame
  jumpHeld: boolean
  trick: boolean // pressed this frame
}

export function start(level: LevelData): SkaterState {
  return {
    x: 80,
    h: surfaceAt(level, 80) ?? 0,
    vy: 0,
    speed: CRUISE,
    grounded: true,
    trickTimer: 0,
    tricksThisAir: 0,
    trickPoints: 0,
    cleanLandings: 0,
    coins: new Set(),
    status: 'riding',
    rotation: 0,
    fromJump: false,
    t: 0,
  }
}

export const TRICK_POINTS = 150

export function step(level: LevelData, s: SkaterState, input: Input, dt: number): SkaterState {
  if (s.status !== 'riding') return s
  let { x, h, vy, speed, grounded, trickTimer, tricksThisAir, trickPoints, cleanLandings, rotation, fromJump } = s
  const coins = s.coins
  let lastMessage: string | undefined

  // speed control
  const targetSpeed = input.accelerate ? BOOST : CRUISE
  speed += Math.sign(targetSpeed - speed) * Math.min(Math.abs(targetSpeed - speed), ACCEL * dt)

  // jump / tricks
  if (input.jump && grounded) {
    // popping off a ramp gives a bigger launch than a flat-ground ollie
    const onRamp = (() => {
      const g = segmentAt(level, x)
      return g !== null && g.h1 > g.h0 + 10
    })()
    vy = onRamp ? RAMP_V + 60 : JUMP_V
    grounded = false
    fromJump = true
    tricksThisAir = 0
  } else if (input.trick && !grounded && trickTimer <= 0) {
    trickTimer = TRICK_TIME
    tricksThisAir += 1
  }
  if (!grounded && fromJump && !input.jumpHeld && vy > 260) vy = 260 // short hop when the jump key is released early

  const prevSurface = surfaceAt(level, x)
  const prevSeg = segmentAt(level, x)
  x += speed * dt

  if (trickTimer > 0) {
    trickTimer = Math.max(0, trickTimer - dt)
    rotation += (Math.PI * 2 * dt) / TRICK_TIME
    if (trickTimer === 0) {
      rotation = 0
      const pts = TRICK_POINTS * tricksThisAir
      trickPoints += pts
      lastMessage = tricksThisAir > 1 ? `Combo x${tricksThisAir}! +${pts}` : `Kickflip! +${pts}`
    }
  }

  const surf = surfaceAt(level, x)
  if (grounded) {
    if (surf === null) {
      // rolled off an edge (or a ramp lip): become airborne
      grounded = false
      const launchedFromRamp = prevSeg && prevSeg.h1 > prevSeg.h0 + 10 && prevSurface !== null
      vy = launchedFromRamp ? RAMP_V : 0
      fromJump = false
      tricksThisAir = 0
    } else if (surf - h > 8) {
      return { ...s, x, status: 'crashed', crashReason: 'Ran into a wall' }
    } else {
      const seg = segmentAt(level, x)
      // leaving the top of a ramp onto lower ground also launches
      if (prevSeg && seg !== prevSeg && prevSeg.h1 > prevSeg.h0 + 10 && surf < (prevSurface ?? 0) - 4) {
        grounded = false
        vy = RAMP_V
        fromJump = false
        tricksThisAir = 0
        h = prevSurface ?? h
      } else {
        h = surf
        vy = 0
      }
    }
  }

  if (!grounded) {
    vy -= GRAVITY * dt
    const nh = h + vy * dt
    if (surf !== null && nh <= surf && vy <= 0) {
      if (surf - nh > 30 && h < surf - 2) {
        return { ...s, x, h: nh, status: 'crashed', crashReason: 'Slammed into a ledge' }
      }
      if (trickTimer > 0) return { ...s, x, h: surf, status: 'crashed', crashReason: 'Landed mid-trick!' }
      h = surf
      vy = 0
      grounded = true
      cleanLandings += 1
      if (!lastMessage && tricksThisAir > 0) lastMessage = 'Clean landing!'
      tricksThisAir = 0
      rotation = 0
    } else {
      h = nh
    }
    if (h < -80) return { ...s, x, h, status: 'crashed', crashReason: 'Fell into a gap' }
  }

  // obstacles
  const px0 = x - PLAYER_W / 2
  const px1 = x + PLAYER_W / 2
  for (const o of level.obstacles) {
    if (px1 > o.x + 3 && px0 < o.x + o.w - 3) {
      const base = surfaceAt(level, o.x + o.w / 2) ?? 0
      if (h < base + o.h - 3) return { ...s, x, h, status: 'crashed', crashReason: `Hit a ${o.kind}` }
    }
  }

  // coins
  level.coins.forEach((c, i) => {
    if (!coins.has(i) && Math.abs(c.x - x) < 22 && h - 6 < c.h && h + PLAYER_H + 6 > c.h) coins.add(i)
  })

  const status = x >= level.length ? 'finished' : 'riding'
  return { x, h, vy, speed, grounded, trickTimer, tricksThisAir, trickPoints, cleanLandings, coins, status, rotation, fromJump, t: s.t + dt, lastMessage }
}

export function levelScore(s: SkaterState): number {
  return s.coins.size * 25 + s.trickPoints + s.cleanLandings * 10 + (s.status === 'finished' ? 500 : 0)
}

// ---------------------------------------------------------------------------
// Level generation
// ---------------------------------------------------------------------------
const OBSTACLES: Record<World, { kind: ObstacleKind; w: number; h: number }[]> = {
  town: [
    { kind: 'cone', w: 22, h: 30 },
    { kind: 'bin', w: 28, h: 38 },
    { kind: 'bench', w: 56, h: 26 },
  ],
  forest: [
    { kind: 'log', w: 52, h: 26 },
    { kind: 'rock', w: 34, h: 30 },
    { kind: 'stump', w: 28, h: 36 },
  ],
  cemetery: [
    { kind: 'tomb', w: 30, h: 40 },
    { kind: 'coffin', w: 58, h: 24 },
    { kind: 'pumpkin', w: 30, h: 28 },
  ],
}

type Feature = 'gap' | 'obstacle' | 'double' | 'ramp-gap' | 'platform' | 'coins' | 'gap-boost'

export interface Builder {
  x: number
  segments: Segment[]
  obstacles: Obstacle[]
  coins: Coin[]
}

function flat(b: Builder, len: number, h = 0) {
  const last = b.segments[b.segments.length - 1]
  if (last && last.x1 === b.x && last.h0 === h && last.h1 === h) last.x1 += len
  else b.segments.push({ x0: b.x, x1: b.x + len, h0: h, h1: h })
  b.x += len
}

function coinArc(b: Builder, x0: number, x1: number, peak: number, base = 0) {
  const n = 5
  for (let i = 0; i < n; i += 1) {
    const t = i / (n - 1)
    b.coins.push({ x: x0 + (x1 - x0) * t, h: base + 30 + peak * 4 * t * (1 - t) })
  }
}

/** Difficulty 0..1 across the whole campaign. */
const difficulty = (n: number) => (n - 1) / (TOTAL_LEVELS - 1)

export function generateLevel(n: number): LevelData {
  const world = worldOf(n)
  const rng: Rng = createRng(n * 92821 + 7)
  const d = difficulty(n)
  const local = ((n - 1) % 30) / 29
  // ground starts behind the camera so the opening shot never shows a cliff
  const b: Builder = { x: -400, segments: [], obstacles: [], coins: [] }
  flat(b, 920)
  const features = 6 + Math.round(d * 10 + local * 3)
  const pool: Feature[] = ['gap', 'obstacle', 'coins']
  if (n >= 3) pool.push('double')
  if (n >= 5) pool.push('ramp-gap')
  if (n >= 8) pool.push('platform')
  if (n >= 40) pool.push('gap-boost')
  const kinds = OBSTACLES[world]
  for (let i = 0; i < features; i += 1) {
    const f = n <= 2 && i === 0 ? 'obstacle' : pool[Math.floor(rng() * pool.length)]
    switch (f) {
      case 'gap': {
        const w = Math.round(60 + rng() * (40 + d * 50)) // up to ~150
        coinArc(b, b.x - 30, b.x + w + 30, 70)
        b.x += w
        flat(b, 300 + rng() * 120)
        break
      }
      case 'gap-boost': {
        // needs the accelerate button: wider than a cruise-speed jump can clear
        const w = Math.round(170 + rng() * 30)
        coinArc(b, b.x - 40, b.x + w + 40, 90)
        b.x += w
        flat(b, 360 + rng() * 120)
        break
      }
      case 'obstacle': {
        const k = kinds[Math.floor(rng() * kinds.length)]
        b.obstacles.push({ x: b.x + 40, ...k })
        b.coins.push({ x: b.x + 40 + k.w / 2, h: k.h + 70 })
        flat(b, 300 + rng() * 140)
        break
      }
      case 'double': {
        const k1 = kinds[Math.floor(rng() * kinds.length)]
        const k2 = kinds[Math.floor(rng() * kinds.length)]
        b.obstacles.push({ x: b.x + 40, ...k1 })
        // second obstacle far enough to land and jump again
        const gap = 230 + rng() * 80
        b.obstacles.push({ x: b.x + 40 + k1.w + gap, ...k2 })
        flat(b, 40 + k1.w + gap + k2.w + 300)
        break
      }
      case 'ramp-gap': {
        const rampLen = 90
        const rampH = 26
        b.segments.push({ x0: b.x, x1: b.x + rampLen, h0: 0, h1: rampH })
        b.x += rampLen
        const w = Math.round(120 + rng() * (70 + d * 50))
        coinArc(b, b.x, b.x + w + 60, 150, rampH)
        b.x += w
        flat(b, 380 + rng() * 120)
        break
      }
      case 'platform': {
        const ph = Math.round(40 + rng() * 30)
        const plen = 300 + rng() * 260
        flat(b, 40)
        const startX = b.x + 60 // small gap before the ledge so riders must jump up onto it
        b.x = startX
        flat(b, plen, ph)
        if (plen > 420 && rng() < 0.5 + d * 0.4) {
          const k = kinds[Math.floor(rng() * kinds.length)]
          b.obstacles.push({ x: startX + plen / 2 - k.w / 2, ...k })
        }
        for (let c = 0; c < 4; c += 1) b.coins.push({ x: startX + 60 + c * 50, h: ph + 30 })
        flat(b, 340 + rng() * 100)
        break
      }
      case 'coins': {
        for (let c = 0; c < 5; c += 1) b.coins.push({ x: b.x + 60 + c * 45, h: 30 })
        flat(b, 330)
        break
      }
    }
  }
  flat(b, FINISH_RUNOUT + 200)
  return { id: n, world, length: b.x - 200, segments: b.segments, obstacles: b.obstacles, coins: b.coins }
}

const cache = new Map<number, LevelData>()
export function getLevel(n: number): LevelData {
  if (!cache.has(n)) cache.set(n, generateLevel(n))
  return cache.get(n)!
}

// ---------------------------------------------------------------------------
// Autopilot (used by tests to prove every generated level can be finished)
// ---------------------------------------------------------------------------
export function autopilot(level: LevelData, s: SkaterState): Input {
  const look = (dx: number) => surfaceAt(level, s.x + dx)
  // upcoming hazards
  let gapAhead = Infinity
  let gapWidth = 0
  for (let dx = 0; dx < 400; dx += 4) {
    if (look(dx) === null) {
      gapAhead = dx
      let w = dx
      while (w < 600 && look(w) === null) w += 4
      gapWidth = w - dx
      break
    }
  }
  const ramp = level.segments.find((g) => g.h1 > g.h0 + 10 && g.x1 > s.x - 5 && g.x0 < s.x + 400)
  const accelerate = gapWidth > 140 || (gapAhead < 400 && gapWidth > 120)
  let jump = false
  if (s.grounded) {
    const cur = surfaceAt(level, s.x) ?? 0
    const onRamp = ramp && s.x >= ramp.x0 && s.x <= ramp.x1
    // obstacles
    for (const o of level.obstacles) {
      const dist = o.x - (s.x + PLAYER_W / 2)
      if (dist > 0 && dist < s.speed * 0.16 + 6) jump = true
    }
    // ledges
    const ahead = look(s.speed * 0.2)
    if (ahead !== null && ahead > cur + 8 && !onRamp && !(ramp && s.x + s.speed * 0.2 >= ramp.x0)) jump = true
    // gaps (not after ramps, which launch automatically)
    if (!onRamp && gapAhead < 14 && !(ramp && ramp.x1 >= s.x - 5 && ramp.x1 <= s.x + 20)) jump = true
  }
  return { accelerate, jump, jumpHeld: true, trick: false }
}

export function simulate(level: LevelData, controller = autopilot, dt = 1 / 60, maxT = 240): SkaterState {
  let s = start(level)
  while (s.status === 'riding' && s.t < maxT) s = step(level, s, controller(level, s), dt)
  return s
}
