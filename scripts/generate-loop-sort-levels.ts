// Generates original Loop Sort levels and verifies each one with the solver.
// Usage: npm run levels:generate [total]   (writes src/games/loop-sort/levels.json; default 800)
// Levels are independent, so they are generated in parallel worker processes.
import { fork } from 'node:child_process'
import { availableParallelism } from 'node:os'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { generateLevel, replay, type LevelDef } from '../src/games/loop-sort/logic.ts'

function build(n: number): LevelDef {
  const level = generateLevel(n)
  if (!replay(level, level.solution)) throw new Error(`level ${n}: stored solution does not win`)
  return level
}

if (process.argv[2] === '--worker') {
  // worker: generates every level it is sent and reports it back
  process.on('message', (n: number) => {
    const level = build(n)
    process.send!(level)
  })
} else {
  const TOTAL = Number(process.argv[2] ?? 800)
  const workers = Math.max(1, Math.min(TOTAL, availableParallelism() - 1))
  const levels: LevelDef[] = []
  const t0 = Date.now()
  let next = 1
  let done = 0
  // hand out levels one at a time so slow (late, crowded) levels do not hold up a whole batch
  for (let w = 0; w < workers; w += 1) {
    const child = fork(fileURLToPath(import.meta.url), ['--worker'])
    const feed = () => (next <= TOTAL ? child.send(next++) : child.disconnect())
    child.on('message', (level: LevelDef) => {
      levels[level.n - 1] = level
      done += 1
      const obstacles = [...new Set(level.trucks.flatMap((t) => Object.keys(t).filter((k) => k !== 'blocks')))].join(' ')
      process.stdout.write(`level ${level.n} (${done}/${TOTAL}): ${level.trucks.length} trucks, ${level.colors} colours, belt ${level.capacity}, ${level.solution.length} taps${level.difficulty ? ` [${level.difficulty}]` : ''}${obstacles ? ` {${obstacles}}` : ''}\n`)
      if (done === TOTAL) {
        writeFileSync(new URL('../src/games/loop-sort/levels.json', import.meta.url), JSON.stringify(levels))
        console.log(`wrote ${levels.length} levels in ${((Date.now() - t0) / 1000).toFixed(1)}s with ${workers} workers`)
      }
      feed()
    })
    child.on('exit', (code) => {
      if (code) {
        console.error(`worker failed (exit ${code})`)
        process.exit(1)
      }
    })
    feed()
  }
}
