// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { generateLevel, simulate, start, step, surfaceAt, TOTAL_LEVELS, worldOf, type LevelData } from '../../src/games/skater-boy/logic'

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

describe('skater physics', () => {
  it('rides forward automatically and finishes a flat level', () => {
    const s = simulate(flatLevel(), () => idle)
    expect(s.status).toBe('finished')
  })

  it('accelerates when asked', () => {
    const l = flatLevel()
    let s = start(l)
    for (let i = 0; i < 60; i += 1) s = step(l, s, { ...idle, accelerate: true }, 1 / 60)
    expect(s.speed).toBeGreaterThan(300)
  })

  it('crashes into an obstacle without jumping, clears it with a jump', () => {
    const l = flatLevel({ obstacles: [{ x: 400, w: 30, h: 36, kind: 'bin' }] })
    expect(simulate(l, () => idle).status).toBe('crashed')
    const jumper = (_: LevelData, s: ReturnType<typeof start>) => ({ ...idle, jumpHeld: true, jump: s.grounded && s.x > 330 && s.x < 345 })
    expect(simulate(l, jumper).status).toBe('finished')
  })

  it('falls into gaps', () => {
    const l = flatLevel({ segments: [{ x0: 0, x1: 500, h0: 0, h1: 0 }, { x0: 650, x1: 2200, h0: 0, h1: 0 }] })
    const s = simulate(l, () => idle)
    expect(s.status).toBe('crashed')
    expect(s.crashReason).toMatch(/gap/)
    expect(surfaceAt(l, 600)).toBeNull()
  })

  it('crashes when landing during a trick and scores a completed trick', () => {
    const l = flatLevel()
    let s = start(l)
    s = step(l, s, { ...idle, jump: true, jumpHeld: true }, 1 / 60)
    s = step(l, s, { ...idle, jumpHeld: true, trick: true }, 1 / 60)
    while (s.status === 'riding' && !s.grounded) s = step(l, s, { ...idle, jumpHeld: true }, 1 / 60)
    expect(s.status).toBe('riding')
    expect(s.trickPoints).toBe(150)
    // trick started right before landing
    let t = step(l, start(l), { ...idle, jump: true, jumpHeld: true }, 1 / 60)
    while (t.vy > -500) t = step(l, t, { ...idle, jumpHeld: true }, 1 / 60)
    t = step(l, t, { ...idle, jumpHeld: true, trick: true }, 1 / 60)
    while (t.status === 'riding' && !t.grounded) t = step(l, t, { ...idle, jumpHeld: true }, 1 / 60)
    expect(t.status).toBe('crashed')
    expect(t.crashReason).toMatch(/mid-trick/)
  })

  it('ramps launch the rider', () => {
    const l = flatLevel({ segments: [{ x0: 0, x1: 300, h0: 0, h1: 0 }, { x0: 300, x1: 390, h0: 0, h1: 26 }, { x0: 600, x1: 2200, h0: 0, h1: 0 }] })
    expect(simulate(l, () => idle).status).toBe('finished')
  })
})

describe('skater campaign', () => {
  it(`has ${TOTAL_LEVELS} levels across three worlds, each finishable by the autopilot`, () => {
    const failures: string[] = []
    for (let n = 1; n <= TOTAL_LEVELS; n += 1) {
      const l = generateLevel(n)
      expect(l.world).toBe(worldOf(n))
      const s = simulate(l)
      if (s.status !== 'finished') failures.push(`level ${n}: ${s.crashReason} at x=${Math.round(s.x)}`)
    }
    expect(failures).toEqual([])
    expect(worldOf(1)).toBe('town')
    expect(worldOf(31)).toBe('forest')
    expect(worldOf(90)).toBe('cemetery')
  })
})
