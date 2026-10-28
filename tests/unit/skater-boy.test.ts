// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  generateLevel, JUMP_REACH, LIVES, levelScore, MAX_LEVEL_SCORE, obstacleTop, RAMP_V, GRAVITY, PLAYER_H, simulate, start, startAt, step, surfaceAt,
  TOTAL_LEVELS, worldOf, type LevelData, type SkaterState,
} from '../../src/games/skater-boy/logic'

const idle = { accelerate: false, jump: false, jumpHeld: false, trick: false }

const flatLevel = (extra: Partial<LevelData> = {}): LevelData => ({
  id: 0,
  world: 'town',
  length: 2000,
  segments: [{ x0: 0, x1: 2200, h0: 0, h1: 0 }],
  obstacles: [],
  coins: [],
  ...extra,
})

const ride = (l: LevelData, s: SkaterState, until: (s: SkaterState) => boolean, input = { ...idle, jumpHeld: true }) => {
  let n = 0
  while (!until(s) && n < 5000) {
    s = step(l, s, input, 1 / 60)
    n += 1
  }
  return s
}

describe('skater physics', () => {
  it('rides forward automatically and finishes a flat level', () => {
    const s = simulate(flatLevel(), () => idle)
    expect(s.status).toBe('finished')
    expect(s.lives).toBe(LIVES)
  })

  it('pushing speeds up', () => {
    const l = flatLevel()
    let s = start(l)
    for (let i = 0; i < 60; i += 1) s = step(l, s, { ...idle, accelerate: true }, 1 / 60)
    expect(s.speed).toBeGreaterThan(300)
  })

  it('a bail costs a life and respawns at the checkpoint; out of lives ends the run', () => {
    const l = flatLevel({ obstacles: [{ x: 400, w: 30, h: 36, kind: 'bin' }] })
    let s = ride(l, start(l), (t) => t.status !== 'riding', idle)
    expect(s.status).toBe('bailed')
    expect(s.lives).toBe(LIVES - 1)
    s = ride(l, s, (t) => t.status === 'riding', idle)
    expect(s.x).toBeLessThan(200)
    expect(simulate(l, () => idle).status).toBe('crashed')
    const jumper = (_: LevelData, t: SkaterState) => ({ ...idle, jumpHeld: true, jump: t.grounded && t.x > 330 && t.x < 345 })
    expect(simulate(l, jumper).status).toBe('finished')
  })

  it('checkpoints move the respawn point forward', () => {
    const l = flatLevel({ checkpoints: [600], obstacles: [{ x: 900, w: 30, h: 36, kind: 'bin' }] })
    let s = ride(l, start(l), (t) => t.status === 'bailed', idle)
    expect(s.checkpoint).toBe(600)
    s = ride(l, s, (t) => t.status === 'riding', idle)
    expect(s.x).toBe(600)
  })

  it('falls into gaps', () => {
    const l = flatLevel({ segments: [{ x0: 0, x1: 500, h0: 0, h1: 0 }, { x0: 650, x1: 2200, h0: 0, h1: 0 }] })
    const s = ride(l, start(l), (t) => t.status !== 'riding', idle)
    expect(s.crashReason).toMatch(/gap/)
    expect(surfaceAt(l, 600)).toBeNull()
  })

  it('a flip in the air scores on landing; landing mid-trick bails', () => {
    const l = flatLevel()
    let s = step(l, start(l), { ...idle, jump: true, jumpHeld: true }, 1 / 60)
    s = step(l, s, { ...idle, jumpHeld: true, jump: true }, 1 / 60)
    s = ride(l, s, (t) => t.status !== 'riding' || t.grounded)
    expect(s.status).toBe('riding')
    expect(s.trickPoints).toBe(150)
    let t = step(l, start(l), { ...idle, jump: true, jumpHeld: true }, 1 / 60)
    t = ride(l, t, (u) => u.vy < -500)
    t = step(l, t, { ...idle, jumpHeld: true, trick: true }, 1 / 60)
    t = ride(l, t, (u) => u.status !== 'riding' || u.grounded)
    expect(t.status).toBe('bailed')
    expect(t.crashReason).toMatch(/mid-trick/)
  })

  it('push in the air spins; two tricks in one jump make a combo', () => {
    const l = flatLevel({ segments: [{ x0: 0, x1: 300, h0: 0, h1: 0 }, { x0: 300, x1: 390, h0: 0, h1: 26 }, { x0: 560, x1: 2200, h0: 0, h1: 0 }] })
    let s = ride(l, start(l), (t) => t.x > 370, idle)
    s = step(l, s, { ...idle, jump: true, jumpHeld: true }, 1 / 60)
    s = step(l, s, { ...idle, jumpHeld: true, spin: true }, 1 / 60)
    s = ride(l, s, (t) => t.trick === null)
    s = step(l, s, { ...idle, jumpHeld: true, trick: true }, 1 / 60)
    s = ride(l, s, (t) => t.status !== 'riding' || t.grounded)
    expect(s.status).toBe('riding')
    expect(s.trickPoints).toBe(250 + 150 * 2)
  })

  it('landing on a rail grinds along it for points', () => {
    const l = flatLevel({ obstacles: [{ x: 400, w: 260, h: 34, kind: 'rail', grind: true }] })
    expect(ride(l, start(l), (t) => t.status !== 'riding', idle).crashReason).toMatch(/rail/)
    let s = ride(l, start(l), (t) => t.x > 352, idle)
    s = step(l, s, { ...idle, jump: true, jumpHeld: true }, 1 / 60)
    s = ride(l, s, (t) => t.grind !== null || t.status !== 'riding')
    expect(s.grind).not.toBeNull()
    expect(s.h).toBe(obstacleTop(l, l.obstacles[0]))
    s = ride(l, s, (t) => t.grind === null)
    expect(s.trickPoints).toBeGreaterThan(80)
    expect(simulate(l, undefined, 1 / 60, 240, s).status).toBe('finished')
  })

  it('ramps launch the rider', () => {
    const l = flatLevel({ segments: [{ x0: 0, x1: 300, h0: 0, h1: 0 }, { x0: 300, x1: 390, h0: 0, h1: 26 }, { x0: 600, x1: 2200, h0: 0, h1: 0 }] })
    expect(simulate(l, () => idle).status).toBe('finished')
  })

  it('level score stays within what the server accepts', () => {
    const s = { ...start(flatLevel()), trickPoints: 10 ** 6 }
    expect(levelScore(s)).toBe(MAX_LEVEL_SCORE)
  })
})

describe('skater campaign', () => {
  const levels = Array.from({ length: TOTAL_LEVELS }, (_, i) => generateLevel(i + 1))

  it(`has ${TOTAL_LEVELS} levels across three worlds, each finishable by the autopilot without a bail`, () => {
    const failures: string[] = []
    for (const l of levels) {
      expect(l.world).toBe(worldOf(l.id))
      const s = simulate(l)
      if (s.status !== 'finished' || s.lives !== LIVES) failures.push(`level ${l.id}: ${s.crashReason} lives ${s.lives}`)
    }
    expect(failures).toEqual([])
    expect(worldOf(1)).toBe('town')
    expect(worldOf(31)).toBe('forest')
    expect(worldOf(90)).toBe('cemetery')
  })

  it('every checkpoint restart can be finished', () => {
    const failures: string[] = []
    for (const l of levels) {
      for (const cp of l.checkpoints ?? []) {
        const s = simulate(l, undefined, 1 / 60, 240, startAt(l, cp))
        if (s.status !== 'finished' || s.lives !== LIVES) failures.push(`level ${l.id} from ${cp}: ${s.crashReason}`)
      }
    }
    expect(failures).toEqual([])
    expect(levels.filter((l) => (l.checkpoints?.length ?? 0) >= 1).length).toBeGreaterThan(80)
  })

  it('three gems per level, each within jumping reach', () => {
    for (const l of levels) {
      expect(l.gems).toHaveLength(3)
      for (const g of l.gems!) {
        const below = surfaceAt(l, g.x)
        const rail = l.obstacles.find((o) => o.grind && g.x >= o.x && g.x <= o.x + o.w)
        const base = rail ? obstacleTop(l, rail) : (below ?? 0)
        const ramp = l.segments.some((s) => s.h1 > s.h0 + 10 && s.x1 <= g.x && s.x1 > g.x - 300)
        const reach = ramp ? ((RAMP_V + 60) ** 2) / (2 * GRAVITY) + PLAYER_H : JUMP_REACH
        expect(g.h - base, `level ${l.id} gem at ${g.x}`).toBeLessThan(reach)
      }
    }
  })
})
