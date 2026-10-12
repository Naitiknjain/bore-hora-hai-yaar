// Generates original Loop Sort levels and verifies each one with the solver.
// Usage: npm run levels:generate   (writes src/games/loop-sort/levels.json)
import { writeFileSync } from 'node:fs'
import { generateLevel, replay } from '../src/games/loop-sort/logic.ts'

const TOTAL = Number(process.argv[2] ?? 60)
const levels = []
const t0 = Date.now()
for (let n = 1; n <= TOTAL; n += 1) {
  const level = generateLevel(n)
  if (!replay(level, level.solution)) throw new Error(`level ${n}: stored solution does not win`)
  levels.push(level)
  process.stdout.write(`level ${n}: ${level.trucks.length} trucks, ${level.colors} colours, belt ${level.capacity}, ${level.solution.length} taps\n`)
}
writeFileSync(new URL('../src/games/loop-sort/levels.json', import.meta.url), JSON.stringify(levels))
console.log(`wrote ${levels.length} levels in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
