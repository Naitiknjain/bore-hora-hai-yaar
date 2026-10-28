import { createRng, type Rng } from '../../lib/random'

/**
 * Skater Boy - an original side-scrolling skateboard engine in the style of the classic phone runners.
 * Two buttons: push (hold to go faster) and jump. In the air, jump again for a flip trick and push
 * for a 360 spin; land on rails, benches and logs to grind them. Three lives per run with checkpoints,
 * three hidden gems per level. Levels are plain data produced by a deterministic generator whose
 * difficulty rises per world; an autopilot in the tests proves every level (and every checkpoint
 * restart) can be finished.
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
export const SPIN_TIME = 0.5
export const PLAYER_W = 28
export const PLAYER_H = 46
export const FINISH_RUNOUT = 260
export const LIVES = 3
/** how long the rider tumbles after a bail before respawning at the checkpoint */
export const BAIL_TIME = 1.1
export const TRICK_POINTS = 150
export const SPIN_POINTS = 250
export const GEM_POINTS = 200
/** the server keeps per-level bests up to 50 000 */
export const MAX_LEVEL_SCORE = 49_999

export interface Segment {
  x0: number
  x1: number
  h0: number // surface height above GROUND at x0
  h1: number // at x1 (h1 > h0 = ramp)
}
export type ObstacleKind = 'cone' | 'bin' | 'bench' | 'rail' | 'log' | 'rock' | 'stump' | 'trunk' | 'tomb' | 'coffin' | 'pumpkin' | 'slab'
export interface Obstacle {
  x: number
  w: number
  h: number
  kind: ObstacleKind
  /** the top can be landed on and ground along */
  grind?: boolean
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
  /** three hidden gems, placed where a well-timed jump or grind reaches them */
  gems?: Coin[]
  /** respawn points after a bail (x, on flat open ground) */
  checkpoints?: number[]
}

export const FLIPS = ['Kickflip', 'Heelflip', 'Pop Shove-it', 'Varial Flip', 'Hardflip', 'Tre Flip']
export const GRINDS = ['50-50 Grind', 'Board Slide', 'Nose Grind', 'Tail Slide', '5-0 Grind', 'Feeble Grind']
const NAMES: Record<ObstacleKind, string> = {
  cone: 'cone', bin: 'bin', bench: 'bench', rail: 'rail', log: 'log', rock: 'rock', stump: 'stump',
  trunk: 'fallen tree', tomb: 'tombstone', coffin: 'coffin', pumpkin: 'pumpkin', slab: 'crypt slab',
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

/** Height of an obstacle's top above GROUND. */
export const obstacleTop = (level: LevelData, o: Obstacle) => (surfaceAt(level, o.x + o.w / 2) ?? 0) + o.h

/** How far past an edge the rider still overlaps it (half the body, less the forgiving margin). */
const OVERLAP = PLAYER_W / 2 - 3

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------
export interface Trick {
  kind: 'flip' | 'spin'
  t: number
  dur: number
}
export interface Grind {
  i: number
  dist: number
  name: string
}
export interface SkaterState {
  x: number
  h: number // feet height above GROUND
  vy: number // upward positive
  speed: number
  grounded: boolean
  trick: Trick | null
  /** tricks finished during this airtime (a combo multiplies their points) */
  airTricks: number
  /** points waiting for a clean landing */
  airPoints: number
  /** banked points from landed tricks and grinds */
  trickPoints: number
  cleanLandings: number
  coins: Set<number>
  gems: Set<number>
  grind: Grind | null
  lives: number
  checkpoint: number
  status: 'riding' | 'bailed' | 'crashed' | 'finished'
  crashReason?: string
  bailTimer: number
  rotation: number // board flip angle
  spin: number // body spin angle
  fromJump: boolean // airborne because of a jump (early release = short hop)
  t: number
  /** what happened this step, for popups ("KICKFLIP +150", "CHECKPOINT") */
  events: string[]
  lastMessage?: string
}

export interface Input {
  accelerate: boolean
  jump: boolean // pressed this frame
  jumpHeld: boolean
  trick: boolean // pressed this frame (flip; same as a second jump press in the air)
  spin?: boolean // pressed this frame (push pressed in the air)
}

export function startAt(level: LevelData, x: number, keep?: SkaterState): SkaterState {
  return {
    x,
    h: surfaceAt(level, x) ?? 0,
    vy: 0,
    speed: CRUISE,
    grounded: true,
    trick: null,
    airTricks: 0,
    airPoints: 0,
    trickPoints: keep?.trickPoints ?? 0,
    cleanLandings: keep?.cleanLandings ?? 0,
    coins: keep?.coins ?? new Set(),
    gems: keep?.gems ?? new Set(),
    grind: null,
    lives: keep?.lives ?? LIVES,
    checkpoint: keep?.checkpoint ?? x,
    status: 'riding',
    bailTimer: 0,
    rotation: 0,
    spin: 0,
    fromJump: false,
    t: keep?.t ?? 0,
    events: [],
  }
}

export const START_X = 80
export function start(level: LevelData): SkaterState {
  return startAt(level, START_X)
}

function bail(s: SkaterState, patch: Partial<SkaterState>, reason: string): SkaterState {
  return { ...s, ...patch, status: 'bailed', crashReason: reason, bailTimer: BAIL_TIME, lives: s.lives - 1, trick: null, grind: null, airTricks: 0, airPoints: 0, events: [], lastMessage: undefined }
}

const grindPoints = (g: Grind) => 50 + Math.round(g.dist * 0.6)

export function step(level: LevelData, s: SkaterState, input: Input, dt: number): SkaterState {
  if (s.status === 'finished' || s.status === 'crashed') return s
  if (s.status === 'bailed') {
    const bailTimer = s.bailTimer - dt
    if (bailTimer > 0) return { ...s, bailTimer, t: s.t + dt, rotation: s.rotation + dt * 8, events: [] }
    if (s.lives <= 0) return { ...s, bailTimer: 0, status: 'crashed', events: [] }
    return startAt(level, s.checkpoint, { ...s, t: s.t + dt })
  }
  let { x, h, vy, speed, grounded, trick, airTricks, airPoints, trickPoints, cleanLandings, rotation, spin, fromJump, grind, checkpoint } = s
  const { coins, gems } = s
  const events: string[] = []

  // speed control
  const targetSpeed = input.accelerate ? BOOST : CRUISE
  speed += Math.sign(targetSpeed - speed) * Math.min(Math.abs(targetSpeed - speed), ACCEL * dt)

  const endGrind = () => {
    if (!grind) return
    const pts = grindPoints(grind)
    trickPoints += pts
    events.push(`${grind.name.toUpperCase()} +${pts}`)
    grind = null
  }

  // jump / tricks
  if (input.jump && grind) {
    endGrind()
    vy = JUMP_V
    fromJump = true
    airTricks = 0
  } else if (input.jump && grounded) {
    // popping off a ramp gives a bigger launch than a flat-ground ollie
    const g = segmentAt(level, x)
    vy = g !== null && g.h1 > g.h0 + 10 ? RAMP_V + 60 : JUMP_V
    grounded = false
    fromJump = true
    airTricks = 0
    airPoints = 0
  } else if ((input.jump || input.trick) && !grounded && !grind && !trick) {
    trick = { kind: 'flip', t: 0, dur: TRICK_TIME }
  } else if (input.spin && !grounded && !grind && !trick) {
    trick = { kind: 'spin', t: 0, dur: SPIN_TIME }
  }
  if (!grounded && !grind && fromJump && !input.jumpHeld && vy > 260) vy = 260 // short hop when the jump key is released early

  const prevSurface = surfaceAt(level, x)
  const prevSeg = segmentAt(level, x)
  x += speed * dt

  if (trick) {
    const t = Math.min(trick.dur, trick.t + dt)
    if (trick.kind === 'flip') rotation = (Math.PI * 2 * t) / trick.dur
    else spin = (Math.PI * 2 * t) / trick.dur
    if (t >= trick.dur) {
      airTricks += 1
      const base = trick.kind === 'flip' ? TRICK_POINTS : SPIN_POINTS
      const pts = base * airTricks
      airPoints += pts
      const name = trick.kind === 'flip' ? FLIPS[(Math.floor(s.x / 53) + airTricks) % FLIPS.length] : `${360 * Math.min(airTricks, 3)} Spin`
      events.push(`${name.toUpperCase()} +${pts}`)
      trick = null
      rotation = 0
      spin = 0
    } else {
      trick = { ...trick, t }
    }
  }

  const surf = surfaceAt(level, x)
  const land = () => {
    if (airPoints > 0) {
      trickPoints += airPoints
      if (airTricks > 1) events.push(`COMBO x${airTricks}!`)
    }
    airPoints = 0
    airTricks = 0
    cleanLandings += 1
  }

  if (grind) {
    const o = level.obstacles[grind.i]
    h = obstacleTop(level, o)
    vy = 0
    grind = { ...grind, dist: grind.dist + speed * dt }
    if (x > o.x + o.w + OVERLAP) {
      // rolled off the end of the rail
      endGrind()
      fromJump = false
    }
  } else if (grounded) {
    if (surf === null) {
      // rolled off an edge (or a ramp lip): become airborne
      grounded = false
      const launchedFromRamp = prevSeg && prevSeg.h1 > prevSeg.h0 + 10 && prevSurface !== null
      vy = launchedFromRamp ? RAMP_V : 0
      fromJump = false
      airTricks = 0
    } else if (surf - h > 8) {
      return bail(s, { x }, 'Ran into a wall')
    } else {
      const seg = segmentAt(level, x)
      // leaving the top of a ramp onto lower ground also launches
      if (prevSeg && seg !== prevSeg && prevSeg.h1 > prevSeg.h0 + 10 && surf < (prevSurface ?? 0) - 4) {
        grounded = false
        vy = RAMP_V
        fromJump = false
        airTricks = 0
        h = prevSurface ?? h
      } else {
        h = surf
        vy = 0
      }
    }
  }

  if (!grounded && !grind && s.grind === null) {
    vy -= GRAVITY * dt
    const nh = h + vy * dt
    // landing on a grindable top
    const rail = vy <= 0 ? level.obstacles.findIndex((o) => o.grind && x >= o.x - OVERLAP && x <= o.x + o.w + OVERLAP && h >= obstacleTop(level, o) - 2 && nh <= obstacleTop(level, o)) : -1
    if (rail >= 0) {
      if (trick) return bail(s, { x, h: obstacleTop(level, level.obstacles[rail]) }, 'Landed mid-trick!')
      land()
      h = obstacleTop(level, level.obstacles[rail])
      vy = 0
      grind = { i: rail, dist: 0, name: GRINDS[(rail * 7 + level.id) % GRINDS.length] }
      rotation = 0
      spin = 0
    } else if (surf !== null && nh <= surf && vy <= 0) {
      if (surf - nh > 30 && h < surf - 2) return bail(s, { x, h: nh }, 'Slammed into a ledge')
      if (trick) return bail(s, { x, h: surf }, 'Landed mid-trick!')
      h = surf
      vy = 0
      grounded = true
      land()
      rotation = 0
      spin = 0
    } else {
      h = nh
    }
    if (h < -80) return bail(s, { x, h }, 'Fell into a gap')
  } else if (!grounded && !grind) {
    // just rolled off a rail: start falling next step
    vy -= GRAVITY * dt
    h += vy * dt
  }

  // obstacles
  const px0 = x - PLAYER_W / 2
  const px1 = x + PLAYER_W / 2
  for (let i = 0; i < level.obstacles.length; i += 1) {
    const o = level.obstacles[i]
    if (grind?.i === i) continue
    if (px1 > o.x + 3 && px0 < o.x + o.w - 3 && h < obstacleTop(level, o) - 3) return bail(s, { x, h }, `Hit a ${NAMES[o.kind]}`)
  }

  // pickups
  const touches = (c: Coin, r: number) => Math.abs(c.x - x) < r && h - 6 < c.h && h + PLAYER_H + 6 > c.h
  level.coins.forEach((c, i) => {
    if (!coins.has(i) && touches(c, 22)) coins.add(i)
  })
  level.gems?.forEach((c, i) => {
    if (!gems.has(i) && touches(c, 24)) {
      gems.add(i)
      events.push(`GEM ${gems.size}/3!`)
    }
  })
  for (const cp of level.checkpoints ?? []) {
    if (x >= cp && cp > checkpoint) {
      checkpoint = cp
      events.push('CHECKPOINT')
    }
  }

  const status = x >= level.length ? 'finished' : 'riding'
  if (status === 'finished') endGrind()
  return {
    x, h, vy, speed, grounded, trick, airTricks, airPoints, trickPoints, cleanLandings, coins, gems, grind, lives: s.lives, checkpoint,
    status, bailTimer: 0, rotation, spin, fromJump, t: s.t + dt, events, lastMessage: events[events.length - 1],
  }
}

export function levelScore(s: SkaterState): number {
  const finished = s.status === 'finished'
  const raw = s.coins.size * 25 + s.gems.size * GEM_POINTS + s.trickPoints + s.cleanLandings * 10 + (finished ? 500 + s.lives * 100 : 0)
  return Math.min(MAX_LEVEL_SCORE, raw)
}

// ---------------------------------------------------------------------------
// Level generation
// ---------------------------------------------------------------------------
const OBSTACLES: Record<World, { kind: ObstacleKind; w: number; h: number; grind?: boolean }[]> = {
  town: [
    { kind: 'cone', w: 22, h: 30 },
    { kind: 'bin', w: 28, h: 38 },
    { kind: 'bench', w: 56, h: 26, grind: true },
  ],
  forest: [
    { kind: 'log', w: 52, h: 26, grind: true },
    { kind: 'rock', w: 34, h: 30 },
    { kind: 'stump', w: 28, h: 36 },
  ],
  cemetery: [
    { kind: 'tomb', w: 30, h: 40 },
    { kind: 'coffin', w: 58, h: 24, grind: true },
    { kind: 'pumpkin', w: 30, h: 28 },
  ],
}
/** long grindable pieces, one per world */
const RAILS: Record<World, { kind: ObstacleKind; h: number }> = {
  town: { kind: 'rail', h: 34 },
  forest: { kind: 'trunk', h: 30 },
  cemetery: { kind: 'slab', h: 32 },
}

type Feature = 'gap' | 'obstacle' | 'double' | 'ramp-gap' | 'platform' | 'coins' | 'gap-boost' | 'rail'

export interface Builder {
  x: number
  segments: Segment[]
  obstacles: Obstacle[]
  coins: Coin[]
  /** places a gem could go (reachable with a well-timed jump or grind) */
  spots: Coin[]
  /** x where each feature starts (after the first) - checkpoint candidates */
  starts: number[]
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

/** Highest a rider's body reaches above the surface with a full jump (feet apex + body). */
export const JUMP_REACH = (JUMP_V * JUMP_V) / (2 * GRAVITY) + PLAYER_H

export function generateLevel(n: number): LevelData {
  const world = worldOf(n)
  const rng: Rng = createRng(n * 92821 + 7)
  const d = difficulty(n)
  const local = ((n - 1) % 30) / 29
  // ground starts behind the camera so the opening shot never shows a cliff
  const b: Builder = { x: -400, segments: [], obstacles: [], coins: [], spots: [], starts: [] }
  flat(b, 920)
  const features = 6 + Math.round(d * 10 + local * 3)
  const pool: Feature[] = ['gap', 'obstacle', 'coins']
  if (n >= 3) pool.push('double')
  if (n >= 4) pool.push('rail')
  if (n >= 5) pool.push('ramp-gap')
  if (n >= 8) pool.push('platform')
  if (n >= 40) pool.push('gap-boost')
  const kinds = OBSTACLES[world]
  for (let i = 0; i < features; i += 1) {
    if (i > 0) b.starts.push(b.x)
    const f = n <= 2 && i === 0 ? 'obstacle' : n === 4 && i === 1 ? 'rail' : pool[Math.floor(rng() * pool.length)]
    switch (f) {
      case 'gap': {
        const w = Math.round(60 + rng() * (40 + d * 50)) // up to ~150
        coinArc(b, b.x - 30, b.x + w + 30, 70)
        b.spots.push({ x: b.x + w / 2, h: 135 })
        b.x += w
        flat(b, 300 + rng() * 120)
        break
      }
      case 'gap-boost': {
        // needs the push button: wider than a cruise-speed jump can clear
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
        b.spots.push({ x: b.x + 40 + k.w / 2 + 30, h: 140 })
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
      case 'rail': {
        const r = RAILS[world]
        const w = Math.round(180 + rng() * (60 + d * 90))
        flat(b, 60)
        b.obstacles.push({ x: b.x, w, h: r.h, kind: r.kind, grind: true })
        for (let c = 0; c < 4; c += 1) b.coins.push({ x: b.x + 70 + (c * (w - 90)) / 3, h: r.h + 26 })
        // jump off the rail halfway along to reach it
        b.spots.push({ x: b.x + w * 0.7, h: r.h + 125 })
        flat(b, w + 320 + rng() * 100)
        break
      }
      case 'ramp-gap': {
        const rampLen = 90
        const rampH = 26
        b.segments.push({ x0: b.x, x1: b.x + rampLen, h0: 0, h1: rampH })
        b.x += rampLen
        const w = Math.round(120 + rng() * (70 + d * 50))
        coinArc(b, b.x, b.x + w + 60, 150, rampH)
        b.spots.push({ x: b.x + (w + 60) * 0.45, h: rampH + 205 })
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
        b.spots.push({ x: startX + plen - 60, h: ph + 135 })
        flat(b, 340 + rng() * 100)
        break
      }
      case 'coins': {
        for (let c = 0; c < 5; c += 1) b.coins.push({ x: b.x + 60 + c * 45, h: 30 })
        b.spots.push({ x: b.x + 150, h: 140 })
        flat(b, 330)
        break
      }
    }
  }
  flat(b, FINISH_RUNOUT + 200)
  const length = b.x - 200
  const level: LevelData = { id: n, world, length, segments: b.segments, obstacles: b.obstacles, coins: b.coins }

  // one gem in each third of the level
  const gems: Coin[] = []
  for (let third = 0; third < 3; third += 1) {
    const inThird = b.spots.filter((p) => p.x >= (length * third) / 3 && p.x < (length * (third + 1)) / 3 && !gems.includes(p))
    const pool2 = inThird.length ? inThird : b.spots.filter((p) => !gems.includes(p))
    if (pool2.length) gems.push(pool2[Math.floor(rng() * pool2.length)])
  }
  level.gems = gems

  // checkpoints near a third and two thirds of the way, on open flat ground just before a feature
  const checkpoints: number[] = []
  for (const frac of [1 / 3, 2 / 3]) {
    const want = length * frac
    const candidates = b.starts
      .map((sx) => sx - 170)
      .filter((cx) => cx > START_X + 200 && surfaceAt(level, cx) === 0 && surfaceAt(level, cx - 40) === 0 && !level.obstacles.some((o) => o.x + o.w > cx - 40 && o.x < cx + 160))
      .sort((a, c) => Math.abs(a - want) - Math.abs(c - want))
    const cx = candidates[0]
    if (cx !== undefined && !checkpoints.includes(cx) && (!checkpoints.length || cx > checkpoints[checkpoints.length - 1] + 300)) checkpoints.push(cx)
  }
  level.checkpoints = checkpoints
  return level
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

export function simulate(level: LevelData, controller = autopilot, dt = 1 / 60, maxT = 240, from?: SkaterState): SkaterState {
  let s = from ?? start(level)
  while ((s.status === 'riding' || s.status === 'bailed') && s.t < maxT) s = step(level, s, controller(level, s), dt)
  return s
}
