// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createRng } from '../../src/lib/random'
import * as tetris from '../../src/games/tetris/logic'
import * as pong from '../../src/games/pong/logic'
import * as brick from '../../src/games/brick-breaker/logic'
import * as flappy from '../../src/games/flappy-style/logic'
import * as dino from '../../src/games/dino-run/logic'
import * as typing from '../../src/games/typing-racer/logic'

describe('tetris', () => {
  it('uses a 7-bag: every piece appears once per 7 spawns', () => {
    const rng = createRng(1)
    let s = tetris.newGame(rng)
    const seen: string[] = [s.piece.type]
    for (let i = 0; i < 6; i += 1) {
      s = tetris.hardDrop(s, rng).state
      seen.push(s.piece.type)
    }
    expect(new Set(seen).size).toBe(7)
  })

  it('moves, rotates within walls and blocks illegal moves', () => {
    const rng = createRng(2)
    let s = tetris.newGame(rng)
    for (let i = 0; i < 12; i += 1) s = tetris.tryMove(s, -1, 0) ?? s
    expect(tetris.tryMove(s, -1, 0)).toBeNull()
    const rotated = tetris.rotate(s, 1)
    if (s.piece.type !== 'O') expect(rotated).not.toBeNull()
  })

  it('clears full lines and scores by level', () => {
    const rng = createRng(3)
    const s = tetris.newGame(rng)
    const board = s.board.map((r) => r.slice())
    const bottom = tetris.TOTAL_ROWS - 1
    for (let x = 0; x < tetris.COLS; x += 1) board[bottom][x] = x < 6 || x > 9 ? 'Z' : null
    // vertical I piece fills nothing; craft an I lying horizontally on the gap columns 6-9
    const st: tetris.TetrisState = { ...s, board, piece: { type: 'I', rotation: 0, x: 6, y: bottom - 1 } }
    const r = tetris.lock(st, rng)
    expect(r.cleared).toBe(1)
    expect(r.state.score).toBe(100)
    expect(r.state.board[bottom].every((c) => c === null)).toBe(true)
  })

  it('ends the game when the stack reaches the top', () => {
    const rng = createRng(4)
    let s = tetris.newGame(rng)
    for (let i = 0; i < 60 && !s.over; i += 1) s = tetris.hardDrop(s, rng).state
    expect(s.over).toBe(true)
  })

  it('speeds up with level', () => {
    expect(tetris.gravityMs(1)).toBe(1000)
    expect(tetris.gravityMs(10)).toBeLessThan(tetris.gravityMs(2))
  })
})

describe('pong', () => {
  it('bounces off walls and paddles, and scores when a paddle misses', () => {
    const rng = createRng(1)
    let s = pong.initialState(rng)
    s = { ...s, serveTimer: 0, ball: { x: 100, y: pong.H / 2, vx: -300, vy: 0 }, left: pong.H / 2 }
    let hit = false
    for (let i = 0; i < 60; i += 1) {
      const r = pong.stepBall(s, 1 / 60)
      s = r.state
      if (r.hit) hit = true
    }
    expect(hit).toBe(true)
    expect(s.ball.vx).toBeGreaterThan(0)
    s = { ...s, ball: { x: 100, y: 10, vx: -300, vy: 0 }, left: pong.H - 40 }
    let scored: 0 | 1 | null = null
    for (let i = 0; i < 120 && scored === null; i += 1) {
      const r = pong.stepBall(s, 1 / 60)
      s = r.state
      scored = r.scored
    }
    expect(scored).toBe(1)
    expect(s.score[1]).toBe(1)
  })

  it('hard AI predicts wall bounces', () => {
    const y = pong.predictY({ x: 100, y: 50, vx: 300, vy: -300 }, 600)
    expect(y).toBeGreaterThan(0)
    expect(y).toBeLessThan(pong.H)
  })
})

describe('brick breaker', () => {
  it('breaks bricks and awards points; 2-hit bricks need two hits', () => {
    const wall = brick.buildWall(0)
    expect(wall.length).toBe(50)
    const target = wall[0]
    const ball = { x: target.x + 10, y: target.y + brick.BRICK_H + 12, vx: 0, vy: -300 }
    const r = brick.stepBall(ball, [target], brick.W / 2, 0.1)
    expect(r.hitBrick).toBe(true)
    expect(r.bricks).toHaveLength(0)
    expect(r.gained).toBe(target.points)
    const tough = { ...target, hp: 2, maxHp: 2 }
    const r2 = brick.stepBall(ball, [tough], brick.W / 2, 0.1)
    expect(r2.bricks[0].hp).toBe(1)
  })

  it('loses the ball below the paddle', () => {
    const r = brick.stepBall({ x: 20, y: brick.H - 5, vx: 0, vy: 400 }, [], brick.W - 40, 0.2)
    expect(r.lost).toBe(true)
  })
})

describe('udta panchi', () => {
  it('falls without flapping and dies on the ground', () => {
    const rng = createRng(1)
    let s = flappy.flap(flappy.initial(), rng)
    for (let i = 0; i < 300 && !s.dead; i += 1) s = flappy.step(s, 1 / 60, rng).state
    expect(s.dead).toBe(true)
  })

  it('scores when passing a pillar', () => {
    const rng = createRng(2)
    let s = flappy.flap(flappy.initial(), rng)
    s = { ...s, pipes: [{ x: flappy.BIRD_X - flappy.PIPE_W / 2 + 1, gapY: s.y, passed: false }] }
    const r = flappy.step({ ...s, vy: -100 }, 1 / 60, rng)
    expect(r.scored).toBe(true)
    expect(r.state.score).toBe(1)
  })
})

describe('dino run', () => {
  it('jumps only from the ground and speeds up', () => {
    const rng = createRng(1)
    let s = dino.initial()
    s = dino.jump(s)
    expect(s.vy).toBeLessThan(0)
    const again = dino.jump(dino.step(s, 1 / 60, false, rng))
    expect(again.vy).not.toBe(dino.JUMP_V)
    let t = dino.initial()
    for (let i = 0; i < 120; i += 1) t = { ...dino.step(t, 1 / 60, false, rng), obstacles: [] }
    expect(t.speed).toBeGreaterThan(dino.START_SPEED)
  })

  it('collides with cacti, ducks under mid birds', () => {
    const rng = createRng(2)
    const base = dino.initial()
    let s = { ...base, obstacles: [dino.makeObstacle('cactus-l', dino.DINO_X + 40)], nextGap: 9999 }
    for (let i = 0; i < 30 && !s.dead; i += 1) s = dino.step(s, 1 / 60, false, rng)
    expect(s.dead).toBe(true)
    let d = { ...base, obstacles: [dino.makeObstacle('bird-mid', dino.DINO_X + 60)], nextGap: 9999 }
    for (let i = 0; i < 40; i += 1) d = dino.step(d, 1 / 60, true, rng)
    expect(d.dead).toBe(false)
  })
})

describe('typing racer', () => {
  it('tracks the correct prefix and computes WPM/accuracy', () => {
    expect(typing.correctPrefix('hello world', 'hello wq')).toBe(7)
    expect(typing.stats(250, 260, 10, 60000)).toEqual({ wpm: 50, accuracy: 96.2 })
  })

  it('rivals match difficulty and finish exactly at their computed time', () => {
    const rng = createRng(3)
    for (const d of ['easy', 'medium', 'hard'] as const) {
      const rivals = typing.makeRivals(d, rng)
      const [lo, hi] = typing.RIVAL_WPM[d]
      rivals.forEach((r) => expect(r.wpm).toBeGreaterThanOrEqual(lo) && expect(r.wpm).toBeLessThanOrEqual(hi))
      const len = 50
      const finish = typing.rivalFinishMs(rivals[0], len)
      expect(typing.rivalProgress(rivals[0], finish, len, 1)).toBeCloseTo(1)
      expect(typing.rivalProgress(rivals[0], finish * 0.5, len, 1)).toBeLessThan(1)
    }
    expect(typing.SENTENCES.hard.every((s) => s.length > typing.SENTENCES.easy[0].length)).toBe(true)
  })

  it('ranks the player against rivals that finished earlier', () => {
    const rivals = [
      { name: 'a', color: '', wpm: 60 },
      { name: 'b', color: '', wpm: 30 },
    ]
    const len = 100
    expect(typing.finalPosition(rivals, len, typing.rivalFinishMs(rivals[0], len) - 1)).toBe(1)
    expect(typing.finalPosition(rivals, len, typing.rivalFinishMs(rivals[0], len) + 1)).toBe(2)
    expect(typing.finalPosition(rivals, len, typing.rivalFinishMs(rivals[1], len) + 1)).toBe(3)
  })
})
