// @vitest-environment node
import { describe, expect, it } from 'vitest'
import levels from '../../src/games/loop-sort/levels.json'
import { CHAKKAR_CONFIG, continuesLeft, usesLeft, type ChakkarConfig } from '../../src/games/loop-sort/config'
import { abilityAvailable, afterTick, canContinue, continueAttempt, giveUp, startAttempt, tapTruck, applyAbility, type Attempt } from '../../src/games/loop-sort/attempt'
import { attemptTap, beltCount, beltLayout, boardLayout, conveyorLoad, freeSpace, initialState, isWon, maxCapacity, MAX_TRUCKS, neighbours, replay, settle, SPARE_DOCKS, tap, tick, type LevelDef, type LoopState } from '../../src/games/loop-sort/logic'

const LEVELS = levels as LevelDef[]
const lvl = (trucks: number[][], capacity: number, n = 1): LevelDef => ({ n, colors: 4, capacity, hidden: false, trucks: trucks.map((blocks) => ({ blocks })), solution: [] })
const withState = (a: Attempt, state: LoopState): Attempt => ({ ...a, state })

/** Plays one tap and lets the conveyor settle. */
const play = (a: Attempt, truck: number): Attempt => {
  const t = tapTruck(a, truck)
  return t.status === 'playing' ? withState(t, settle(t.state)) : t
}

describe('config', () => {
  it('defaults: confirmed loss rule, 2 uses of each ability, 1 free continue (+1 slot), 12 trucks', () => {
    expect(CHAKKAR_CONFIG.lossTrigger).toBe('tap-exceeds-capacity')
    expect(CHAKKAR_CONFIG.abilitiesPerLevel).toEqual({ undo: 2, shuffle: 2, extraTruck: 2, extraSlot: 2 })
    expect(CHAKKAR_CONFIG.continuesPerAttempt).toBe(1)
    expect(CHAKKAR_CONFIG.slotsPerContinue).toBe(1)
    expect(CHAKKAR_CONFIG.maxTrucks).toBe(MAX_TRUCKS)
  })

  it('Admin Mode is unlimited, Normal Mode follows the configured counts', () => {
    expect(usesLeft('undo', 5, true)).toBe(Infinity)
    expect(continuesLeft(9, true)).toBe(Infinity)
    expect(usesLeft('undo', 1, false)).toBe(1)
    expect(usesLeft('undo', 2, false)).toBe(0)
    const custom: ChakkarConfig = { ...CHAKKAR_CONFIG, abilitiesPerLevel: { undo: 5, shuffle: 0, extraTruck: 1, extraSlot: 3 } }
    expect(usesLeft('undo', 1, false, custom)).toBe(4)
    expect(usesLeft('shuffle', 0, false, custom)).toBe(0)
  })
})

describe('layout with up to 12 trucks', () => {
  it('portrait loop, upright trucks, one belt position each, evenly spaced, no overlaps (1..12 trucks)', () => {
    for (let k = 1; k <= 12; k += 1) {
      const b = boardLayout(k)
      expect(b.trucks).toHaveLength(k)
      expect(new Set(b.trucks.map((t) => t.pos)).size).toBe(k)
      expect(b.loop.h).toBeGreaterThanOrEqual(b.loop.w) // portrait
      // constant speed: every step along the loop has (almost) the same length
      const gaps = b.points.map((p, i) => Math.hypot(b.points[(i + 1) % b.points.length][0] - p[0], b.points[(i + 1) % b.points.length][1] - p[1]))
      expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(2)
      for (const t of b.trucks) {
        expect(t.h).toBeGreaterThan(t.w) // upright
        const [px] = b.points[t.pos]
        expect(px).toBeGreaterThan(t.x) // the truck's belt position is right at its open end
        expect(px).toBeLessThan(t.x + t.w)
        expect(t.x).toBeGreaterThanOrEqual(0)
        expect(t.x + t.w).toBeLessThanOrEqual(b.width)
      }
      for (let i = 0; i < k; i += 1)
        for (let j = i + 1; j < k; j += 1) {
          const p = b.trucks[i]
          const q = b.trucks[j]
          expect(p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h).toBe(false)
        }
      expect(beltLayout(k).length).toBe(b.points.length)
    }
    expect(boardLayout(2).trucks.map((t) => t.row)).toEqual(['inner-top', 'inner-top']) // side by side, like Level 1
    const rows = boardLayout(12).trucks.map((t) => t.row)
    expect(['inner-top', 'inner-bottom', 'outer-top', 'outer-bottom'].map((r) => rows.filter((x) => x === r).length)).toEqual([4, 4, 2, 2])
  })

  it('cubes stream out one per step and every truck downstream is offered them (no skipping)', () => {
    // two neighbouring trucks: the group from truck 0 must end up entirely in the matching truck
    let s = initialState(lvl([[3, 1, 1], [1, 1]], 6))
    s = tap(s, 0).state
    expect(beltCount(s)).toBe(0)
    expect(conveyorLoad(s)).toBe(2) // still streaming out of the truck
    expect(freeSpace(s)).toBe(4)
    let emittedPerTick = 0
    for (let i = 0; i < 3; i += 1) {
      const r = tick(s)
      emittedPerTick = Math.max(emittedPerTick, r.emitted.length)
      s = r.state
    }
    expect(emittedPerTick).toBe(1)
    s = settle(s)
    expect(s.trucks[1].done).toBe(true) // got all four 1s
    expect(s.trucks[0].blocks).toEqual([3]) // never took its own cubes back
  })

  it('a truck that is still streaming out never accepts cubes', () => {
    let s = initialState(lvl([[2, 2]], 6))
    s = tap(s, 0).state // source now empty but still emitting
    s = settle(s)
    expect(s.trucks[0].blocks).toEqual([2, 2]) // came back only after a full lap
  })

  it('never builds more than 12 trucks, even with spare docks', () => {
    const big = lvl(Array.from({ length: 11 }, () => [0]), 6)
    expect(initialState(big, 5).trucks).toHaveLength(12)
  })
})

describe('conveyor capacity and the Out of Space rule', () => {
  it('tracks cubes on the conveyor and never exceeds capacity (random play on real levels)', () => {
    for (const def of LEVELS.slice(0, 20)) {
      let a = startAttempt(def, false)
      for (let step = 0; step < 300 && a.status === 'playing'; step += 1) {
        a = tapTruck(a, (step * 7) % a.state.trucks.length)
        expect(beltCount(a.state)).toBeLessThanOrEqual(a.state.capacity)
        if (step % 3 === 0) a = afterTick(a, tick(a.state).state, false)
        expect(beltCount(a.state)).toBeLessThanOrEqual(a.state.capacity)
      }
    }
  })

  it('full conveyor: any tap -> Out of Space, board unchanged, no cube discarded', () => {
    // a 2-slot conveyor filled by two cubes nobody can take (no truck is empty or topped with 1)
    let a = startAttempt(lvl([[5, 1, 1], [2, 3], [3, 2]], 2), false)
    a = play(a, 0)
    expect(beltCount(a.state)).toBe(2)
    const before = JSON.stringify(a.state)
    const lost = tapTruck(a, 1)
    expect(lost.status).toBe('out-of-space')
    expect(lost.pending).toEqual({ truck: 1, needed: 1, free: 0 })
    expect(JSON.stringify(lost.state)).toBe(before)
    // further taps are ignored while the screen is open
    expect(tapTruck(lost, 2)).toBe(lost)
  })

  it('insufficient remaining capacity: a group larger than the free space triggers the loss', () => {
    const s = initialState(lvl([[1, 2, 2], [4, 3]], 2))
    const after = settle(tap(s, 1).state) // 1 cube circulating, 1 slot free (no truck takes colour 3)
    expect(beltCount(after)).toBe(1)
    expect(attemptTap(after, 0, 'tap-exceeds-capacity')).toEqual({ kind: 'out-of-space', truck: 0, needed: 2, free: 1 })
    // the alternative rule refuses the tap instead
    expect(attemptTap(after, 0, 'jammed')).toEqual({ kind: 'refused', reason: 'belt-full' })
  })

  it('successful continue: +1 slot, the waiting move now fits and is played', () => {
    let a = startAttempt(lvl([[5, 1, 1], [2, 3], [3, 2]], 2), false)
    a = play(a, 0)
    a = tapTruck(a, 1)
    expect(canContinue(a)).toBe(true)
    const c = continueAttempt(a)
    expect(c.status).toBe('playing')
    expect(c.continuesUsed).toBe(1)
    expect(c.state.capacity).toBe(3)
    expect(conveyorLoad(c.state)).toBe(3) // the waiting move went through (its cube streams out next)
    expect(c.state.trucks[1].blocks).toEqual([2])
  })

  it('a continue that still cannot fit the move resumes play without moving anything', () => {
    let a = startAttempt(lvl([[1, 1, 1], [2, 3, 3], [4, 5]], 1), false)
    a = play(a, 2) // one cube (5) on a 1-slot conveyor
    a = tapTruck(a, 1) // group of 2 needs 2, 0 free
    expect(a.status).toBe('out-of-space')
    const c = continueAttempt(a)
    expect(c.status).toBe('playing')
    expect(c.state.capacity).toBe(2)
    expect(c.state.trucks[1].blocks).toEqual([2, 3, 3])
    expect(beltCount(c.state)).toBe(1)
  })

  it('one free continue per attempt in Normal Mode, unlimited in Admin Mode', () => {
    const def = lvl([[1, 1, 1], [2, 3, 3], [4, 5], [6, 7, 7]], 1)
    const lose = (admin: boolean) => tapTruck(play(startAttempt(def, admin), 2), 1)
    const normal = tapTruck(continueAttempt(lose(false)), 3) // needs 2, free 1 -> out of space again
    expect(normal.status).toBe('out-of-space')
    expect(canContinue(normal)).toBe(false)
    expect(continueAttempt(normal)).toBe(normal)
    const admin = tapTruck(continueAttempt(lose(true)), 3)
    expect(admin.status).toBe('out-of-space')
    expect(canContinue(admin)).toBe(true)
  })

  it('give up ends the attempt', () => {
    const a = tapTruck(play(startAttempt(lvl([[5, 1, 1], [2, 3], [3, 2]], 2), false), 0), 1)
    const g = giveUp(a)
    expect(g.status).toBe('given-up')
    expect(tapTruck(g, 2)).toBe(g)
    expect(continueAttempt(g)).toBe(g)
  })

  it('the +1 Slot ability can also rescue an Out of Space screen without using the continue', () => {
    const a = tapTruck(play(startAttempt(lvl([[5, 1, 1], [2, 3], [3, 2]], 2), false), 0), 1)
    const r = applyAbility(a, 'extraSlot')
    expect(r.status).toBe('playing')
    expect(r.used.extraSlot).toBe(1)
    expect(r.continuesUsed).toBe(0)
  })

  it('reports a winning board once the conveyor settles', () => {
    const a = startAttempt(lvl([[1, 1, 1], [1]], 4), false)
    const t = tapTruck(a, 1)
    expect(afterTick(t, settle(t.state), true).status).toBe('won')
  })
})

describe('abilities', () => {
  it('undo restores the board before the last tap but keeps purchased slots', () => {
    let a = startAttempt(lvl([[1, 2], [3]], 4), false)
    const start = a.state
    a = tapTruck(a, 0)
    a = applyAbility(a, 'extraSlot')
    a = applyAbility(a, 'undo')
    expect(a.state.trucks.map((t) => t.blocks)).toEqual(start.trucks.map((t) => t.blocks))
    expect(beltCount(a.state)).toBe(0)
    expect(a.state.capacity).toBe(5)
    expect(a.used.undo).toBe(1)
    expect(abilityAvailable(a, 'undo')).toBe(false) // nothing left to undo
  })

  it('shuffle reorders one chosen truck only', () => {
    let a = startAttempt(lvl([[1, 2, 3, 1], [4, 4]], 6), false)
    expect(applyAbility(a, 'shuffle', {})).toBe(a) // no truck chosen
    expect(applyAbility(a, 'shuffle', { truck: 1 })).toBe(a) // all one colour: nothing to shuffle
    a = applyAbility(a, 'shuffle', { truck: 0, rand: () => 0.3 })
    expect(a.state.trucks[0].blocks).not.toEqual([1, 2, 3, 1])
    expect([...a.state.trucks[0].blocks].sort()).toEqual([1, 1, 2, 3])
    expect(a.state.trucks[1].blocks).toEqual([4, 4])
    expect(a.used.shuffle).toBe(1)
  })

  it('extra truck opens an empty truck, limited by the allowance and the 12-truck cap', () => {
    let a = startAttempt(lvl([[1, 2], [2, 1]], 4), false)
    expect(a.state.trucks.filter((t) => t.inactive)).toHaveLength(2)
    a = applyAbility(applyAbility(a, 'extraTruck'), 'extraTruck')
    expect(a.state.trucks.filter((t) => !t.inactive)).toHaveLength(4)
    expect(abilityAvailable(a, 'extraTruck')).toBe(false)
    const full = startAttempt(lvl(Array.from({ length: 12 }, () => [1]), 6), true)
    expect(abilityAvailable(full, 'extraTruck')).toBe(false) // admin, but no room left
  })

  it('spare docks are not part of play until opened', () => {
    const a = startAttempt(lvl([[1, 1]], 4), false)
    const spare = a.state.trucks.findIndex((t) => t.inactive)
    expect(tapTruck(a, spare).refused).toEqual({ truck: spare, reason: 'invalid' })
  })

  it('Normal Mode: 2 uses per ability; Admin Mode: unlimited but the conveyor never outgrows the loop', () => {
    const def = lvl([[1, 2, 1, 2], [3, 4]], 3)
    let a = startAttempt(def, false)
    a = applyAbility(applyAbility(a, 'extraSlot'), 'extraSlot')
    expect(a.state.capacity).toBe(5)
    expect(applyAbility(a, 'extraSlot')).toBe(a)
    let admin = startAttempt(def, true)
    for (let i = 0; i < 100; i += 1) admin = applyAbility(admin, 'extraSlot')
    expect(admin.state.capacity).toBe(maxCapacity(admin.state))
  })
})

describe('levels', () => {
  it('ships 60 original solvable levels with at most 10 trucks (room for Extra Truck)', () => {
    expect(LEVELS).toHaveLength(60)
    for (const l of LEVELS) {
      expect(l.trucks.length).toBeLessThanOrEqual(10)
      expect(replay(l, l.solution)).toBe(true)
    }
    expect(Math.max(...LEVELS.map((l) => l.colors))).toBe(8)
  })
})

describe('layouts', () => {
  it('every level is winnable on exactly the board a Normal Mode attempt starts with', () => {
    for (const l of LEVELS) {
      const a = startAttempt(l, false)
      expect(a.state).toEqual(initialState(l, SPARE_DOCKS))
      expect(replay(l, l.solution), `level ${l.n}`).toBe(true)
    }
  })

  it('spare docks never move the real trucks in the rows layout', () => {
    for (let k = 1; k <= 8; k += 1) {
      const plain = boardLayout(k, 'rows').trucks.map((t) => t.pos)
      const withSpares = boardLayout(k + SPARE_DOCKS, 'rows', SPARE_DOCKS).trucks.map((t) => t.pos)
      expect(withSpares.slice(0, k)).toEqual(plain)
    }
  })

  it('uses all three layouts, and no truck loads inside the tunnel', () => {
    expect(new Set(LEVELS.map((l) => l.style))).toEqual(new Set(['rows', 'stack', 'tunnel']))
    for (const l of LEVELS.filter((x) => x.style === 'tunnel')) {
      const b = boardLayout(l.trucks.length + SPARE_DOCKS, 'tunnel', SPARE_DOCKS)
      const t = b.tunnel!
      for (const spot of b.trucks) {
        const [x, y] = b.points[spot.pos]
        // every loading point is clearly outside the tunnel and its end caps
        expect(x < t.x + t.w + 12 && y >= t.y && y <= t.y + t.h, `level ${l.n}`).toBe(false)
      }
    }
  })
})

describe('obstacles', () => {
  it('barrier: the truck takes matching cubes but can never be tapped', () => {
    const def: LevelDef = { ...lvl([[2], [], [1]], 6), trucks: [{ blocks: [2] }, { blocks: [], barrier: true }, { blocks: [1] }] }
    let s = initialState(def)
    expect(tap(s, 1).error).toBe('empty')
    s = settle(tap(s, 2).state) // the lone cube passes truck 0 (wrong colour) and drops behind the barrier
    expect(s.trucks[1].blocks).toEqual([1])
    expect(tap(s, 1).error).toBe('barrier')
    expect(isWon(s)).toBe(false) // stuck there until the truck is sorted
  })

  it('ice: frozen trucks neither take nor send cubes until the truck next to it is filled', () => {
    const def: LevelDef = { ...lvl([[2, 1], [], [3, 3, 1, 1]], 6), trucks: [{ blocks: [2, 1] }, { blocks: [] }, { blocks: [3, 3, 1, 1], ice: 1 }] }
    let s = initialState(def)
    expect(tap(s, 2).error).toBe('frozen')
    s = settle(tap(s, 0).state) // the 1 lands in the empty truck 1, the frozen truck ignores it
    expect(s.trucks[1].blocks).toEqual([1])
    expect(s.trucks[2].ice).toBe(1)
    // fill truck 1 to the top: the ice breaks
    s = { ...s, trucks: s.trucks.map((t, i) => (i === 1 ? { ...t, blocks: [1, 2, 2] } : t)), belt: s.belt.map((_, p) => (p === s.trucks[1].pos - 1 ? 2 : null)) }
    s = tick(s).state
    expect(s.trucks[1].blocks.length).toBe(4)
    expect(s.trucks[2].ice).toBeUndefined()
    expect(s.trucks[2].thawed).toBe(true)
    expect(tap(s, 2).error).toBeNull()
  })

  it('levels introduce barriers and ice, and every obstacle level is winnable as stored', () => {
    const withBarrier = LEVELS.filter((l) => l.trucks.some((t) => t.barrier))
    const withIce = LEVELS.filter((l) => l.trucks.some((t) => t.ice !== undefined))
    expect(withBarrier.length).toBeGreaterThan(5)
    expect(withIce.length).toBeGreaterThan(5)
    for (const l of [...withBarrier, ...withIce]) {
      expect(replay(l, l.solution), `level ${l.n}`).toBe(true)
      for (const t of l.trucks) {
        // a barrier truck can only ever collect, so it starts with at most one colour
        if (t.barrier) expect(new Set(t.blocks).size, `level ${l.n}`).toBeLessThanOrEqual(1)
        // ice always sits next to a truck that still has room to fill
        if (t.ice !== undefined) {
          expect(l.trucks[t.ice].blocks.length, `level ${l.n}`).toBeLessThan(4)
          expect(neighbours(boardLayout(initialState(l, SPARE_DOCKS).trucks.length, l.style, initialState(l, SPARE_DOCKS).spares), l.trucks.indexOf(t))).toContain(t.ice)
        }
      }
    }
  })

  it('lock & key: emptying the key truck collects the key and opens the shutter', () => {
    const def: LevelDef = { ...lvl([], 6), trucks: [{ blocks: [2], key: 0 }, { blocks: [1, 1], shutter: 0 }, { blocks: [] }] }
    let s = initialState(def)
    expect(tap(s, 1).error).toBe('shut')
    s = settle(tap(s, 0).state)
    expect(s.keys).toEqual([0])
    expect(s.trucks[0].key).toBeUndefined()
    expect(s.trucks[2].blocks).toEqual([2]) // the shut truck took nothing while it was shut
    expect(tap(s, 1).error).toBeNull()
  })

  it('a shut truck takes no cubes', () => {
    const def: LevelDef = { ...lvl([], 6), trucks: [{ blocks: [2] }, { blocks: [], shutter: 0 }, { blocks: [] }] }
    const s = settle(tap(initialState(def), 0).state)
    expect(s.trucks[1].blocks).toEqual([])
    expect(s.trucks[2].blocks).toEqual([2])
  })

  it('coloured truck: only accepts its own colour', () => {
    const def: LevelDef = { ...lvl([], 6), trucks: [{ blocks: [3, 2] }, { blocks: [], tag: 3 }, { blocks: [] }] }
    let s = settle(tap(initialState(def), 0).state)
    expect(s.trucks[1].blocks).toEqual([]) // the 2 rode past the coloured truck
    expect(s.trucks[2].blocks).toEqual([2])
    s = settle(tap(s, 0).state)
    expect(s.trucks[1].blocks).toEqual([3])
  })

  it('rope: tied trucks cannot be tapped until one of them is sorted', () => {
    const def: LevelDef = { ...lvl([], 6), trucks: [{ blocks: [1] }, { blocks: [1, 1, 1], rope: 0 }, { blocks: [2, 3], rope: 0 }, { blocks: [] }] }
    let s = initialState(def)
    expect(tap(s, 2).error).toBe('tied')
    expect(tap(s, 1).error).toBe('tied')
    s = settle(tap(s, 0).state) // the 4th 1 completes truck 1: the rope comes off
    expect(s.trucks[1].done).toBe(true)
    expect(s.cut).toEqual([0])
    expect(tap(s, 2).error).toBeNull()
  })

  it('levels with lock & key, coloured trucks and ropes are winnable as stored', () => {
    const has = (f: (t: LevelDef['trucks'][number]) => boolean) => LEVELS.filter((l) => l.trucks.some(f))
    const lock = has((t) => t.shutter !== undefined)
    const tag = has((t) => t.tag !== undefined)
    const rope = has((t) => t.rope !== undefined)
    for (const group of [lock, tag, rope]) expect(group.length).toBeGreaterThan(3)
    for (const l of [...lock, ...tag, ...rope]) {
      expect(replay(l, l.solution), `level ${l.n}`).toBe(true)
      if (l.trucks.some((t) => t.shutter !== undefined)) expect(l.trucks.filter((t) => t.key !== undefined).length, `level ${l.n}`).toBe(1)
      for (const t of l.trucks) if (t.tag !== undefined) expect(t.blocks, `level ${l.n}`).toEqual([])
    }
  })
})
