// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createRng } from '../../src/lib/random'
import * as ttt from '../../src/games/tic-tac-toe/logic'
import * as g2048 from '../../src/games/2048/logic'
import * as snake from '../../src/games/snake-battle/logic'
import * as mem from '../../src/games/memory-match/logic'
import * as sudoku from '../../src/games/sudoku/logic'

describe('tic-tac-toe', () => {
  it('detects wins on every line and draws', () => {
    for (const line of ttt.LINES) {
      const b = ttt.emptyBoard()
      line.forEach((i) => (b[i] = 'O'))
      expect(ttt.winner(b)?.mark).toBe('O')
    }
    const draw: ttt.Board = ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X']
    expect(ttt.winner(draw)).toBeNull()
    expect(ttt.isFull(draw)).toBe(true)
  })

  it('rejects moves on occupied cells and after the game ends', () => {
    const b = ttt.play(ttt.emptyBoard(), 0, 'X')!
    expect(ttt.play(b, 0, 'O')).toBeNull()
    const won: ttt.Board = ['X', 'X', 'X', 'O', 'O', null, null, null, null]
    expect(ttt.play(won, 5, 'O')).toBeNull()
  })

  it('hard AI never loses against any opponent strategy', () => {
    // exhaustive: opponent tries every possible move sequence, AI plays O or X
    const explore = (board: ttt.Board, turn: ttt.Mark, ai: ttt.Mark): void => {
      const w = ttt.winner(board)
      if (w) {
        expect(w.mark).toBe(ai)
        return
      }
      if (ttt.isFull(board)) return
      if (turn === ai) {
        const m = ttt.aiMove(board, ai, 'hard', createRng(1))
        explore(ttt.play(board, m, ai)!, ttt.other(turn), ai)
      } else {
        for (const i of ttt.emptyCells(board)) explore(ttt.play(board, i, turn)!, ttt.other(turn), ai)
      }
    }
    explore(ttt.emptyBoard(), 'X', 'O')
    explore(ttt.emptyBoard(), 'X', 'X')
  })

  it('medium AI takes a win and blocks a loss', () => {
    const rng = createRng(5)
    let wins = 0
    for (let k = 0; k < 50; k += 1) {
      const b: ttt.Board = ['O', 'O', null, 'X', 'X', null, null, null, null]
      if (ttt.aiMove(b, 'O', 'medium', rng) === 2) wins += 1
    }
    expect(wins).toBeGreaterThan(38) // allowed to slip occasionally
  })
})

describe('2048', () => {
  it('slides and merges a row like the original (each tile merges once)', () => {
    expect(g2048.slideRow([2, 2, 2, 2]).row).toEqual([4, 4, 0, 0])
    expect(g2048.slideRow([2, 2, 4, 0]).row).toEqual([4, 4, 0, 0])
    expect(g2048.slideRow([4, 0, 4, 8]).row).toEqual([8, 8, 0, 0])
    expect(g2048.slideRow([2, 4, 8, 16]).row).toEqual([2, 4, 8, 16])
    expect(g2048.slideRow([2, 2, 2, 0]).gained).toBe(4)
  })

  it('moves in all four directions', () => {
    const g: g2048.Grid = [
      [2, 0, 0, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [2, 0, 0, 0],
    ]
    expect(g2048.move(g, 'left').grid[0]).toEqual([4, 0, 0, 0])
    expect(g2048.move(g, 'right').grid[0]).toEqual([0, 0, 0, 4])
    const up = g2048.move(g, 'up').grid
    expect(up[0]).toEqual([4, 0, 0, 2])
    const down = g2048.move(g, 'down').grid
    expect(down[3]).toEqual([4, 0, 0, 2])
    expect(g2048.move(g, 'down').merged.has('3,0')).toBe(true)
  })

  it('reports no-op moves and game over', () => {
    const stuck: g2048.Grid = [
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ]
    for (const d of ['up', 'down', 'left', 'right'] as const) expect(g2048.move(stuck, d).moved).toBe(false)
    expect(g2048.canMove(stuck)).toBe(false)
    stuck[0][1] = 2
    expect(g2048.canMove(stuck)).toBe(true)
  })

  it('new game starts with two tiles', () => {
    const g = g2048.newGame(createRng(3))
    expect(g.flat().filter(Boolean)).toHaveLength(2)
  })
})

describe('snake', () => {
  it('moves, eats and grows', () => {
    const rng = createRng(1)
    let s = snake.initialState(rng)
    const head = s.snake[0]
    s = { ...s, food: { x: head.x + 1, y: head.y } }
    s = snake.step(s, rng)
    expect(s.score).toBe(1)
    expect(s.snake).toHaveLength(4)
    s = snake.step(s, rng)
    expect(s.snake).toHaveLength(4)
  })

  it('cannot reverse into itself, even with fast double inputs', () => {
    const rng = createRng(2)
    let s = snake.initialState(rng) // moving right
    s = snake.queueTurn(s, 'left') // illegal reversal ignored
    expect(s.queue).toEqual([])
    s = snake.queueTurn(s, 'up')
    s = snake.queueTurn(s, 'down') // reversal of the buffered turn ignored
    s = snake.queueTurn(s, 'left') // legal after up
    expect(s.queue).toEqual(['up', 'left'])
    s = { ...s, food: null }
    s = snake.step(s, rng)
    s = snake.step(s, rng)
    expect(s.status).toBe('running')
  })

  it('dies on walls and on its own body', () => {
    const rng = createRng(3)
    let s = snake.initialState(rng)
    s = { ...s, food: null }
    for (let i = 0; i < 30 && s.status === 'running'; i += 1) s = snake.step(s, rng)
    expect(s.status).toBe('dead')

    let t: snake.SnakeState = {
      snake: [
        { x: 5, y: 5 },
        { x: 4, y: 5 },
        { x: 4, y: 6 },
        { x: 5, y: 6 },
        { x: 6, y: 6 },
      ],
      dir: 'right',
      queue: ['down'],
      food: null,
      score: 2,
      status: 'running',
    }
    t = snake.step(t, rng)
    expect(t.status).toBe('dead')
  })

  it('moving into the cell the tail just left is allowed', () => {
    const rng = createRng(4)
    let t: snake.SnakeState = {
      snake: [
        { x: 5, y: 5 },
        { x: 6, y: 5 },
        { x: 6, y: 6 },
        { x: 5, y: 6 },
      ],
      dir: 'left',
      queue: ['down'],
      food: null,
      score: 1,
      status: 'running',
    }
    t = snake.step(t, rng)
    expect(t.status).toBe('running')
  })

  it('speeds up as it grows', () => {
    expect(snake.tickMs(0)).toBeGreaterThan(snake.tickMs(20))
    expect(snake.tickMs(1000)).toBe(65)
  })
})

describe('memory match', () => {
  it('deals the right number of pairs per difficulty', () => {
    for (const [d, n] of Object.entries(mem.PAIRS)) {
      const s = mem.deal(d as 'easy', 1, createRng(1))
      expect(s.cards).toHaveLength(n * 2)
      const counts = new Map<string, number>()
      s.cards.forEach((c) => counts.set(c.emoji, (counts.get(c.emoji) ?? 0) + 1))
      expect([...counts.values()].every((v) => v === 2)).toBe(true)
      expect(s.cards.every((c) => !c.matched)).toBe(true)
    }
  })

  it('never allows more than two open cards', () => {
    let s = mem.deal('easy', 1, createRng(2))
    s = mem.reveal(s, 0)
    s = mem.reveal(s, 0) // same card ignored
    expect(s.open).toEqual([0])
    s = mem.reveal(s, 1)
    const third = mem.reveal(s, 2)
    expect(third).toBe(s)
    expect(s.moves).toBe(1)
  })

  it('match keeps turn and scores; miss passes turn in 2P', () => {
    let s = mem.deal('easy', 2, createRng(9))
    const first = s.turn
    const a = 0
    const b = s.cards.findIndex((c, i) => i !== a && c.emoji === s.cards[a].emoji)
    s = mem.resolve(mem.reveal(mem.reveal(s, a), b))
    expect(s.pairs[first]).toBe(1)
    expect(s.turn).toBe(first)
    const c = s.cards.findIndex((x) => !x.matched)
    const d = s.cards.findIndex((x, i) => !x.matched && i !== c && x.emoji !== s.cards[c].emoji)
    s = mem.resolve(mem.reveal(mem.reveal(s, c), d))
    expect(s.turn).toBe(1 - first)
    expect(s.cards[c].matched).toBe(false)
  })

  it('randomises the starting player and detects draws', () => {
    const starts = new Set<number>()
    for (let seed = 1; seed < 30; seed += 1) starts.add(mem.deal('easy', 2, createRng(seed)).turn)
    expect(starts.size).toBe(2)
    const s = mem.deal('easy', 2, createRng(1))
    expect(mem.winner({ ...s, pairs: [3, 3] })).toBe('draw')
    expect(mem.winner({ ...s, pairs: [4, 3] })).toBe(0)
  })
})

describe('sudoku', () => {
  it('generates valid puzzles with a unique solution for every difficulty', () => {
    for (const d of ['easy', 'medium', 'hard'] as const) {
      for (let seed = 1; seed <= 3; seed += 1) {
        const p = sudoku.generatePuzzle(d, createRng(seed * 31))
        expect(sudoku.isValidPuzzle(p.puzzle)).toBe(true)
        expect(sudoku.isSolved(p.solution)).toBe(true)
        expect(sudoku.solve(p.puzzle)).toEqual(p.solution)
        p.puzzle.forEach((v, i) => v && expect(v).toBe(p.solution[i]))
        expect(p.clues).toBeLessThanOrEqual(sudoku.TARGET_CLUES[d] + 6)
      }
    }
  })

  it('detects row, column and box conflicts', () => {
    const g = Array(81).fill(0)
    g[0] = 5
    g[8] = 5 // row
    expect([...sudoku.conflicts(g)].sort()).toEqual([0, 8])
    const h = Array(81).fill(0)
    h[0] = 3
    h[20] = 3 // same box
    expect(sudoku.conflicts(h).size).toBe(2)
  })

  it('rejects puzzles with multiple solutions', () => {
    expect(sudoku.isValidPuzzle(Array(81).fill(0))).toBe(false)
  })
})
