import { RotateCcw } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { ResultsScreen, StartScreen, useResultRecorder } from '../../components/game/GameShell'
import { Hud, HudStat } from '../../components/game/TouchControls'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/Modal'
import { usePlayer } from '../../features/player/PlayerContext'
import { useKeyDown, useSwipe, type SwipeDir } from '../../hooks/useGameLoop'
import { useResults } from '../../hooks/useResults'
import { createRng, randomSeed } from '../../lib/random'
import { sfx } from '../../lib/sound'
import type { StoredResult } from '../../types'
import { addRandomTile, canMove, maxTile, move, newGame, type Grid } from './logic'

const TILE: Record<number, string> = {
  2: 'bg-[#2a3354] text-ink-100',
  4: 'bg-[#33406b] text-ink-100',
  8: 'bg-santra text-ink-950',
  16: 'bg-[#ff7043] text-white',
  32: 'bg-gulabi text-white',
  64: 'bg-lal text-white',
  128: 'bg-masala text-ink-950',
  256: 'bg-[#ffc400] text-ink-950',
  512: 'bg-pudina text-ink-950',
  1024: 'bg-neela text-ink-950',
  2048: 'bg-baingan text-white',
}

type Phase = 'menu' | 'playing' | 'over'

const KEYMAP: Record<string, SwipeDir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  W: 'up',
  S: 'down',
  A: 'left',
  D: 'right',
}

export default function Game2048() {
  const { player } = usePlayer()
  const results = useResults()
  const { beginRun, finishRun } = useResultRecorder()
  const rng = useRef(createRng(randomSeed()))
  const [phase, setPhase] = useState<Phase>('menu')
  const [grid, setGrid] = useState<Grid>(() => newGame(rng.current))
  const [score, setScore] = useState(0)
  const [fresh, setFresh] = useState<string | null>(null)
  const [merged, setMerged] = useState<Set<string>>(new Set())
  const [won, setWon] = useState(false)
  const [showWin, setShowWin] = useState(false)
  const [confirmRestart, setConfirmRestart] = useState(false)
  const [result, setResult] = useState<StoredResult | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)

  const best = useMemo(
    () => Math.max(0, score, ...results.filter((r) => r.gameId === '2048' && r.playerKey === player?.id).map((r) => r.metrics.score)),
    [results, player?.id, score],
  )

  function start() {
    setGrid(newGame(rng.current))
    setScore(0)
    setWon(false)
    setShowWin(false)
    setResult(null)
    setFresh(null)
    setMerged(new Set())
    setPhase('playing')
    beginRun('classic')
  }

  function doMove(dir: SwipeDir) {
    if (phase !== 'playing' || showWin) return
    const res = move(grid, dir)
    if (!res.moved) return
    const next = res.grid
    const pos = addRandomTile(next, rng.current)
    const nextScore = score + res.gained
    setGrid(next)
    setScore(nextScore)
    setMerged(res.merged)
    setFresh(pos ? `${pos[0]},${pos[1]}` : null)
    if (res.gained) sfx.match()
    else sfx.click()
    if (!won && maxTile(next) >= 2048) {
      setWon(true)
      setShowWin(true)
      sfx.win()
    }
    if (!canMove(next)) {
      sfx.lose()
      void finishRun({ board: 'classic', metrics: { score: nextScore, maxTile: maxTile(next) } }).then(setResult)
      window.setTimeout(() => setPhase('over'), 700)
    }
  }

  useKeyDown((e) => {
    const dir = KEYMAP[e.key]
    if (!dir || phase !== 'playing') return false
    doMove(dir)
    return true
  }, phase === 'playing')

  useSwipe(boardRef, doMove, phase === 'playing')

  if (phase === 'menu') {
    return (
      <StartScreen
        onStart={start}
        instructions={
          <ul className="list-disc space-y-1 pl-5">
            <li>Use arrow keys, WASD, or swipe on the board to slide all tiles.</li>
            <li>Two equal tiles that touch merge into one (2+2 = 4). Each tile merges once per move.</li>
            <li>A new 2 or 4 appears after every move. Reach 2048 to win - then keep going if you like.</li>
            <li>The game ends when no move is possible.</li>
          </ul>
        }
      />
    )
  }

  if (phase === 'over') {
    return (
      <ResultsScreen
        title={won ? 'Shabaash! 2048 done' : 'No moves left'}
        emoji={won ? '🏆' : '🧱'}
        result={result}
        onReplay={start}
        stats={
          <>
            <HudStat label="Score" value={score.toLocaleString()} />
            <HudStat label="Best tile" value={maxTile(grid)} />
            <HudStat label="Best score" value={best.toLocaleString()} />
          </>
        }
      />
    )
  }

  return (
    <div className="mx-auto max-w-md">
      <Hud>
        <HudStat label="Score" value={score.toLocaleString()} accent="#ffd23f" />
        <HudStat label="Best" value={best.toLocaleString()} />
        <div className="ml-auto">
          <Button variant="secondary" icon={<RotateCcw className="size-4" />} onClick={() => setConfirmRestart(true)}>
            Restart
          </Button>
        </div>
      </Hud>
      <div ref={boardRef} className="game-surface relative rounded-3xl bg-ink-800 p-2.5" role="grid" aria-label={`2048 board, score ${score}`}>
        <div className="grid grid-cols-4 gap-2.5">
          {grid.flatMap((row, r) =>
            row.map((v, c) => {
              const key = `${r},${c}`
              const anim = key === fresh ? 'animate-pop' : merged.has(key) ? 'animate-pop' : ''
              return (
                <div
                  key={key}
                  role="gridcell"
                  aria-label={v ? String(v) : 'empty'}
                  className={`flex aspect-square items-center justify-center rounded-2xl font-display font-extrabold ${
                    v ? `${TILE[v] ?? 'bg-white text-ink-950'} ${anim}` : 'bg-ink-900/70'
                  } ${v >= 1024 ? 'text-2xl sm:text-3xl' : v >= 128 ? 'text-3xl sm:text-4xl' : 'text-4xl sm:text-5xl'}`}
                >
                  {v || ''}
                </div>
              )
            }),
          )}
        </div>
        {showWin && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-3xl bg-ink-950/80 p-4 text-center backdrop-blur-sm animate-fade-in">
            <p className="font-display text-4xl font-extrabold text-masala">2048! 🎉</p>
            <p className="text-ink-200">Tum toh champion nikle. Keep going for a bigger score?</p>
            <div className="flex gap-2">
              <Button onClick={() => setShowWin(false)} data-autofocus>
                Keep going
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  void finishRun({ board: 'classic', metrics: { score, maxTile: maxTile(grid) } }).then(setResult)
                  setPhase('over')
                }}
              >
                Finish
              </Button>
            </div>
          </div>
        )}
      </div>
      <p className="mt-3 text-center text-sm text-ink-400">Swipe the board or use arrow keys / WASD.</p>
      <ConfirmDialog
        open={confirmRestart}
        title="Start a new game?"
        message="Your current board will be lost."
        confirmLabel="Restart"
        onConfirm={() => {
          setConfirmRestart(false)
          start()
        }}
        onCancel={() => setConfirmRestart(false)}
      />
    </div>
  )
}
