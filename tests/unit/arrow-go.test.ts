// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { blocker, canRemove, depth, exitRay, generateLevel, headDir, pictureFor, solve, TOTAL_LEVELS, type Arrow } from '../../src/games/arrow-go/logic'
import { PICTURES, rasterise } from '../../src/games/arrow-go/pictures'

const arrow = (id: number, cells: [number, number][]): Arrow => ({ id, color: '#fff', cells: cells.map(([x, y]) => ({ x, y })) })

describe('arrow go rules', () => {
  it('uses the final segment as the head direction', () => {
    expect(headDir(arrow(0, [[0, 0], [1, 0]]))).toBe('right')
    expect(headDir(arrow(0, [[1, 1], [1, 0]]))).toBe('up')
    expect(headDir(arrow(0, [[1, 0], [1, 1], [0, 1]]))).toBe('left')
  })

  it('computes the exit lane to the edge', () => {
    const a = arrow(0, [[0, 2], [1, 2]])
    expect(exitRay(a, 4, 4)).toEqual([{ x: 2, y: 2 }, { x: 3, y: 2 }])
  })

  it('blocks removal when another arrow is in the lane, and frees it after that arrow leaves', () => {
    const a = arrow(0, [[0, 0], [1, 0]]) // pointing right
    const b = arrow(1, [[3, 1], [3, 0]]) // sits in a's lane, pointing up (free)
    expect(blocker(a, [a, b], 5, 3)).toBe(1)
    expect(canRemove(b, [a, b], 5, 3)).toBe(true)
    expect(canRemove(a, [a], 5, 3)).toBe(true)
    expect(solve([a, b], 5, 3)).toEqual([1, 0])
  })

  it('treats an arrow curling in front of its own head as blocked', () => {
    const a = arrow(0, [[2, 0], [2, 1], [1, 1], [0, 1], [0, 0], [1, 0]]) // head at (1,0) pointing right into (2,0)
    expect(blocker(a, [a], 4, 3)).toBe(0)
  })

  it('detects unsolvable mutual blocks', () => {
    const a = arrow(0, [[0, 0], [1, 0]]) // points right into c
    const c = arrow(1, [[3, 0], [2, 0]]) // points left into a
    expect(solve([a, c], 4, 1)).toBeNull()
  })
})

describe('arrow go levels', () => {
  it(`generates ${TOTAL_LEVELS} deterministic, solvable picture levels that get bigger and harder`, () => {
    for (let n = 1; n <= TOTAL_LEVELS; n += 1) {
      const l = generateLevel(n)
      expect(l.arrows.length).toBeGreaterThan(1)
      expect(solve(l.arrows, l.width, l.height)).not.toBeNull()
      expect(l.picture.name).toBe(pictureFor(n).name)
      const mask = new Set(l.mask.map((c) => `${c.x},${c.y}`))
      // no overlapping cells, and every arrow lies inside its picture
      const seen = new Set<string>()
      for (const a of l.arrows)
        for (const c of a.cells) {
          const k = `${c.x},${c.y}`
          expect(seen.has(k)).toBe(false)
          seen.add(k)
          expect(mask.has(k)).toBe(true)
        }
      // the arrows fill (almost) the whole picture
      expect(seen.size / mask.size).toBeGreaterThanOrEqual(0.88)
      if (n >= 15) expect(depth(l.arrows, l.width, l.height)).toBeGreaterThanOrEqual(3)
    }
    const first = generateLevel(1)
    const last = generateLevel(TOTAL_LEVELS)
    expect(last.width * last.height).toBeGreaterThan(first.width * first.height * 3)
    expect(generateLevel(7)).toEqual(generateLevel(7))
  })

  it('cycles through 30 different pictures', () => {
    expect(PICTURES).toHaveLength(30)
    expect(new Set(PICTURES.map((p) => p.name)).size).toBe(30)
    for (const p of PICTURES) {
      const grid = rasterise(p, 16, 16)
      const filled = grid.flat().filter(Boolean).length
      // a real silhouette: neither empty nor a full square
      expect(filled).toBeGreaterThan(256 * 0.2)
      expect(filled).toBeLessThan(256 * 0.95)
    }
  })
})
