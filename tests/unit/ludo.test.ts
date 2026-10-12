// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createRng } from '../../src/lib/random'
import {
  absolute, applyMove, BASE, botChoose, canMove, HOME, HOME_COLUMN, legalMoves, newMatch, registerRoll, SAFE_SQUARES, standings, START_INDEX, TRACK,
  type LudoState,
} from '../../src/games/ludo/logic'

const solo = () => newMatch(['human', 'bot', 'bot', 'bot'])
const withTokens = (s: LudoState, tokens: number[][], current = 0): LudoState => ({ ...s, tokens, current })

describe('ludo board', () => {
  it('has a 52-square loop and 4 home columns of 5', () => {
    expect(TRACK).toHaveLength(52)
    expect(new Set(TRACK.map(([r, c]) => `${r},${c}`)).size).toBe(52)
    HOME_COLUMN.forEach((col) => expect(col).toHaveLength(5))
    // each colour's last track square is adjacent to its home column entrance
    START_INDEX.forEach((_, p) => {
      const [r, c] = TRACK[absolute(p, 50)!]
      const [hr, hc] = HOME_COLUMN[p][0]
      expect(Math.abs(r - hr) + Math.abs(c - hc)).toBe(1)
    })
  })
})

describe('ludo rules', () => {
  it('needs a six to leave base', () => {
    expect(canMove(BASE, 5)).toBe(false)
    expect(canMove(BASE, 6)).toBe(true)
    const s = solo()
    expect(legalMoves(s, 0, 4)).toEqual([])
    expect(legalMoves(s, 0, 6)).toEqual([0, 1, 2, 3])
  })

  it('requires an exact roll to reach home', () => {
    expect(canMove(53, 3)).toBe(true) // 56
    expect(canMove(53, 4)).toBe(false) // overshoot
    expect(canMove(HOME, 1)).toBe(false)
  })

  it('a six with no legal move shows "no moves" and passes the turn without an extra roll', () => {
    const s = withTokens(solo(), [
      [54, HOME, HOME, HOME],
      [BASE, BASE, BASE, BASE],
      [BASE, BASE, BASE, BASE],
      [BASE, BASE, BASE, BASE],
    ])
    const r = registerRoll(s, 6)
    expect(r.outcome.kind).toBe('no-moves')
    expect(r.state.current).toBe(1)
    expect(r.state.sixes).toBe(0)
  })

  it('cancels the third consecutive six', () => {
    let s = withTokens(solo(), [
      [10, 20, 30, BASE],
      [BASE, BASE, BASE, BASE],
      [BASE, BASE, BASE, BASE],
      [BASE, BASE, BASE, BASE],
    ])
    let r = registerRoll(s, 6)
    s = applyMove(r.state, 0, 6).state
    expect(s.current).toBe(0) // extra roll after a six
    r = registerRoll(s, 6)
    s = applyMove(r.state, 0, 6).state
    expect(s.current).toBe(0)
    r = registerRoll(s, 6)
    expect(r.outcome.kind).toBe('three-sixes')
    expect(r.state.current).toBe(1)
    expect(r.state.tokens[0][0]).toBe(22) // third six did not move anything
  })

  it('captures on normal squares, sends the token to base and grants an extra turn', () => {
    // red token at relative 3 (abs 3); green token at abs 5 = green relative (5-13+52)%52 = 44
    const s = withTokens(solo(), [
      [3, BASE, BASE, BASE],
      [44, BASE, BASE, BASE],
      [BASE, BASE, BASE, BASE],
      [BASE, BASE, BASE, BASE],
    ])
    expect(absolute(1, 44)).toBe(5)
    const r = applyMove(registerRoll(s, 2).state, 0, 2)
    expect(r.captured).toEqual([{ player: 1, token: 0 }])
    expect(r.state.tokens[1][0]).toBe(BASE)
    expect(r.extraTurn).toBe(true)
    expect(r.state.current).toBe(0)
  })

  it('does not capture on safe squares and same-colour tokens can share', () => {
    // abs 8 is a star square; green relative for abs 8 = 47
    expect(SAFE_SQUARES.has(8)).toBe(true)
    const s = withTokens(solo(), [
      [5, 8, BASE, BASE],
      [47, BASE, BASE, BASE],
      [BASE, BASE, BASE, BASE],
      [BASE, BASE, BASE, BASE],
    ])
    const r = applyMove(registerRoll(s, 3).state, 0, 3)
    expect(r.captured).toEqual([])
    expect(r.state.tokens[1][0]).toBe(47)
    expect(r.state.tokens[0]).toEqual([8, 8, BASE, BASE]) // stacked, still movable
    expect(r.state.current).toBe(1) // no extra turn without six/capture
  })

  it('tokens can pass over stacks (no blocking)', () => {
    const s = withTokens(solo(), [
      [1, BASE, BASE, BASE],
      [BASE, BASE, BASE, BASE],
      [BASE, BASE, BASE, BASE],
      [BASE, BASE, BASE, BASE],
    ])
    // two blue tokens stacked on abs 3 (blue relative 16)
    s.tokens[3] = [16, 16, BASE, BASE]
    const r = applyMove(registerRoll(s, 4).state, 0, 4)
    expect(r.state.tokens[0][0]).toBe(5)
  })

  it('ends a solo match when the human finishes and ranks bots by progress', () => {
    const s = withTokens(solo(), [
      [53, HOME, HOME, HOME],
      [HOME, HOME, 10, BASE],
      [HOME, 40, 30, BASE],
      [HOME, HOME, 5, BASE],
    ])
    const r = applyMove(registerRoll(s, 3).state, 0, 3)
    expect(r.playerFinished).toBe(true)
    expect(r.state.over).toBe(true)
    const table = standings(r.state)
    expect(table.map((t) => t.player)).toEqual([0, 1, 3, 2]) // bots: 2 home (closest 10), 2 home (closest 5), 1 home
    expect(table.map((t) => t.points)).toEqual([10, 5, 0, 0])
  })

  it('with several humans, continues until every human finishes', () => {
    let s = withTokens(newMatch(['human', 'human', 'bot', 'bot']), [
      [53, HOME, HOME, HOME],
      [10, BASE, BASE, BASE],
      [BASE, BASE, BASE, BASE],
      [BASE, BASE, BASE, BASE],
    ])
    s = applyMove(registerRoll(s, 3).state, 0, 3).state
    expect(s.over).toBe(false)
    expect(s.finished).toEqual([0])
    expect(s.current).toBe(1)
  })

  it('bots always choose a legal token, and hard bots prefer captures', () => {
    const rng = createRng(4)
    const s = withTokens(solo(), [
      [BASE, BASE, BASE, BASE],
      [10, 30, BASE, BASE],
      [BASE, BASE, BASE, BASE],
      [BASE, BASE, BASE, BASE],
    ], 1)
    // green token at relative 30 => abs 43; red is nowhere. place a blue token 4 ahead of green's 10 (abs 27)
    s.tokens[3] = [(27 - 39 + 52) % 52, BASE, BASE, BASE]
    const pre = registerRoll(s, 4)
    expect(pre.outcome.kind).toBe('choose')
    for (const d of ['easy', 'medium', 'hard'] as const) {
      for (let i = 0; i < 20; i += 1) {
        const choice = botChoose(pre.state, 4, legalMoves(pre.state, 1, 4), d, rng)
        expect(legalMoves(pre.state, 1, 4)).toContain(choice)
      }
    }
    expect(botChoose(pre.state, 4, legalMoves(pre.state, 1, 4), 'hard', rng)).toBe(0)
  })

  it('full bot-vs-bot games always terminate with a valid ranking', () => {
    for (let seed = 1; seed <= 10; seed += 1) {
      const rng = createRng(seed)
      let s = newMatch(['bot', 'bot', 'bot', 'bot'])
      // treat seat 0 as "human" for end rules but drive it with the bot
      s = { ...s, seats: ['human', 'bot', 'bot', 'bot'] }
      let turns = 0
      while (!s.over && turns < 5000) {
        const roll = 1 + Math.floor(rng() * 6)
        const r = registerRoll(s, roll)
        if (r.outcome.kind === 'choose') s = applyMove(r.state, botChoose(r.state, roll, r.outcome.legal, 'hard', rng), roll).state
        else s = r.state
        turns += 1
      }
      expect(s.over).toBe(true)
      const t = standings(s)
      expect(t.map((x) => x.position)).toEqual([1, 2, 3, 4])
      expect(new Set(t.map((x) => x.player)).size).toBe(4)
    }
  })
})
