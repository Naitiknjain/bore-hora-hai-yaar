// Generates the Arrow Go levels with a long search for hard boards and writes src/games/arrow-go/levels.json.
// Usage: npx vite-node scripts/generate-arrow-levels.ts [effort]   (default effort 6)
import { writeFileSync } from 'node:fs'
import { depth, difficulty, generateLevel, packLevel, removableArrows, solve, TOTAL_LEVELS, type Level } from '../src/games/arrow-go/logic'

const effort = Number(process.argv[2] ?? 6)
const levels: Level[] = []
const t0 = Date.now()
for (let n = 1; n <= TOTAL_LEVELS; n += 1) {
  const l = generateLevel(n, effort)
  if (!solve(l.arrows, l.width, l.height)) throw new Error(`level ${n} is not solvable`)
  levels.push(l)
  const t = difficulty(n)
  const free = removableArrows(l.arrows, l.width, l.height).length
  process.stdout.write(`level ${n}: ${l.width}x${l.height}, ${l.arrows.length} arrows, free ${free}/${t.maxFree}, rounds ${depth(l.arrows, l.width, l.height)}/${t.minDepth}\n`)
}
writeFileSync(new URL('../src/games/arrow-go/levels.json', import.meta.url), JSON.stringify(levels.map(packLevel)))
console.log(`wrote ${levels.length} levels in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
