// @vitest-environment node
import { describe, expect, it } from 'vitest'
import levels from '../../src/games/loop-sort/levels.json'
import { applyLocally, LOCAL_MAX_LIVES, LOCAL_REGEN_MS, regenLocal, type LoopAccount } from '../../src/games/loop-sort/account'
import {
  beltCount, beltLayout, canTap, initialState, isJammed, isWon, replay, settle, solveDepthFirst, tap, tick, topRun, TRUCK_CAPACITY, type LevelDef,
} from '../../src/games/loop-sort/logic'

const LEVELS = levels as LevelDef[]

describe('loop sort rules', () => {
  it('unloads only the top run of identical colours, ahead of the truck', () => {
    const s = initialState({ capacity: 6, trucks: [{ blocks: [0, 1, 1] }, { blocks: [] }] })
    expect(topRun(s.trucks[0])).toEqual([1, 1])
    const r = tap(s, 0)
    expect(r.error).toBeNull()
    expect(r.state.trucks[0].blocks).toEqual([0])
    expect(r.state.trucks[0].outgoing).toEqual([1, 1]) // streams out one cube per step
    expect(beltCount(r.state)).toBe(0)
    const t1 = tick(r.state)
    expect(t1.emitted).toEqual([{ truck: 0, pos: s.trucks[0].pos, color: 1 }])
  })

  it('refuses taps that would overflow the belt, or on empty/locked trucks', () => {
    const s = initialState({ capacity: 2, trucks: [{ blocks: [1, 1, 1] }, { blocks: [] }, { blocks: [2], lock: 0 }] })
    expect(canTap(s, 0)).toBe('belt-full')
    expect(canTap(s, 1)).toBe('empty')
    expect(canTap(s, 2)).toBe('locked')
  })

  it('cubes drop into an empty truck or one with the same colour on top', () => {
    let s = initialState({ capacity: 6, trucks: [{ blocks: [0, 0, 0, 1] }, { blocks: [1] }, { blocks: [2] }] })
    s = settle(tap(s, 0).state)
    expect(s.trucks[1].blocks).toEqual([1, 1])
    expect(s.trucks[2].blocks).toEqual([2])
    expect(beltCount(s)).toBe(0)
  })

  it('a truck with four of one colour completes and opens matching curtains', () => {
    let s = initialState({ capacity: 6, trucks: [{ blocks: [1, 0] }, { blocks: [0, 0, 0] }, { blocks: [2, 2], lock: 0 }] })
    expect(canTap(s, 2)).toBe('locked')
    s = settle(tap(s, 0).state)
    expect(s.trucks[1].done).toBe(true)
    expect(s.completed).toEqual([0])
    expect(canTap(s, 2)).toBeNull()
  })

  it('detects a jammed belt', () => {
    // belt holds 1, nothing can take a 3 and the only other truck cannot be tapped (belt full)
    let s = initialState({ capacity: 1, trucks: [{ blocks: [0, 3] }, { blocks: [1, 1] }] })
    s = settle(tap(s, 0).state)
    expect(beltCount(s)).toBe(1)
    expect(isJammed(s)).toBe(true)
    expect(isWon(s)).toBe(false)
  })

  it('belt layout attaches every truck to a distinct belt position', () => {
    for (let k = 3; k <= 8; k += 1) {
      const l = beltLayout(k)
      expect(new Set(l.truckPos).size).toBe(k)
      l.truckPos.forEach((p) => expect(p).toBeLessThan(l.length))
    }
  })

  it('tick moves cubes one position per step', () => {
    const s = tick(tap(initialState({ capacity: 6, trucks: [{ blocks: [4] }, { blocks: [2] }, { blocks: [3] }] }), 0).state).state
    const before = s.belt.findIndex((b) => b !== null)
    const after = tick(s).state.belt.findIndex((b) => b !== null)
    expect(after).toBe((before + 1) % s.belt.length)
  })
})

describe('loop sort levels', () => {
  it('ships 800 original levels, each with 4 blocks per colour and a verified solution', () => {
    expect(LEVELS).toHaveLength(800)
    LEVELS.forEach((l, i) => {
      expect(l.n).toBe(i + 1)
      const counts = new Map<number, number>()
      l.trucks.forEach((t) => {
        expect(t.blocks.length).toBeLessThanOrEqual(TRUCK_CAPACITY)
        // a spawner's waiting groups count too
        ;[...t.blocks, ...(t.queue ?? []).flat()].forEach((b) => counts.set(b, (counts.get(b) ?? 0) + 1))
      })
      expect([...counts.values()].every((c) => c === TRUCK_CAPACITY)).toBe(true)
      expect(counts.size).toBe(l.colors)
      expect(replay(l, l.solution)).toBe(true)
    })
  })

  it('difficulty grows: more colours, tighter belts, hidden blocks and curtains later', () => {
    expect(LEVELS[0].colors).toBeLessThan(LEVELS[59].colors)
    expect(LEVELS[0].capacity).toBeGreaterThan(LEVELS[59].capacity)
    expect(LEVELS[0].hidden).toBe(false)
    expect(LEVELS[10].hidden).toBe(true)
    expect(LEVELS.some((l) => l.trucks.some((t) => t.lock !== undefined))).toBe(true)
  })

  it('hint search finds a path from the start of early levels', () => {
    const path = solveDepthFirst(LEVELS[0])
    expect(path && replay(LEVELS[0], path)).toBe(true)
  })
})

describe('loop sort lives (client side)', () => {
  const acc: LoopAccount = {
    lives: 5, maxLives: 5, nextLifeAt: null, regenSeconds: 1200, completed: [], currentLevel: 1, admin: false, adminConfigured: true, totalLevels: 60,
  }

  it('optimistically applies queued fail/complete events', () => {
    const v = applyLocally(acc, [
      { id: 'a', kind: 'fail', level: 1 },
      { id: 'b', kind: 'complete', level: 1 },
    ])
    expect(v.lives).toBe(4)
    expect(v.completed).toEqual([1])
    expect(v.currentLevel).toBe(2)
  })

  it('admin mode: fails cost nothing; completions still count', () => {
    const v = applyLocally({ ...acc, admin: true }, [
      { id: 'a', kind: 'fail', level: 7 },
      { id: 'b', kind: 'complete', level: 40 },
    ])
    expect(v.lives).toBe(5)
    expect(v.completed).toEqual([40])
  })

  it('local-only regeneration refills one life per interval', () => {
    const t0 = 1_000_000
    const low = { ...acc, lives: 2 }
    const r = regenLocal(low, t0, t0 + LOCAL_REGEN_MS * 2 + 1000)
    expect(r.acc.lives).toBe(4)
    expect(r.acc.nextLifeAt).toBe(t0 + LOCAL_REGEN_MS * 3)
    expect(regenLocal(low, t0, t0 + LOCAL_REGEN_MS * 10).acc.lives).toBe(LOCAL_MAX_LIVES)
  })
})
