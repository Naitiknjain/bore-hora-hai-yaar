import { CheckCheck, Eraser, Pause, Pencil, RotateCcw, Undo2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { OptionGroup, PauseOverlay, ResultsScreen, StartScreen, useResultRecorder } from '../../components/game/GameShell'
import { Hud, HudStat } from '../../components/game/TouchControls'
import { Button } from '../../components/ui/Button'
import { Segmented, Spinner } from '../../components/ui/Controls'
import { ConfirmDialog } from '../../components/ui/Modal'
import { useKeyDown, useVisibilityPause } from '../../hooks/useGameLoop'
import { useLeaveGuard } from '../../hooks/useLeaveGuard'
import { useStopwatch } from '../../hooks/useStopwatch'
import { createRng, randomSeed } from '../../lib/random'
import { formatDuration } from '../../lib/scoring'
import { sfx } from '../../lib/sound'
import type { Difficulty, StoredResult } from '../../types'
import { box, col, conflicts, generatePuzzle, isSolved, row, type Grid, type Puzzle } from './logic'

type Phase = 'menu' | 'loading' | 'playing' | 'over'
interface UndoEntry {
  i: number
  value: number
  notes: number
}

export default function Sudoku() {
  const navigate = useNavigate()
  const { beginRun, finishRun } = useResultRecorder()
  const watch = useStopwatch()
  const [phase, setPhase] = useState<Phase>('menu')
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null)
  const [values, setValues] = useState<Grid>(Array(81).fill(0))
  const [notes, setNotes] = useState<number[]>(Array(81).fill(0)) // bitmask per cell
  const [selected, setSelected] = useState(40)
  const [noteMode, setNoteMode] = useState(false)
  const [showMistakes, setShowMistakes] = useState(true)
  const [mistakes, setMistakes] = useState(0)
  const [undo, setUndo] = useState<UndoEntry[]>([])
  const [paused, setPaused] = useState(false)
  const [checkMsg, setCheckMsg] = useState<string | null>(null)
  const [revealWrong, setRevealWrong] = useState(false)
  const [confirmRestart, setConfirmRestart] = useState(false)
  const [result, setResult] = useState<StoredResult | null>(null)
  const [finalMs, setFinalMs] = useState(0)
  const blocker = useLeaveGuard(phase === 'playing')
  const rng = useRef(createRng(randomSeed()))

  const clash = useMemo(() => conflicts(values), [values])

  function start() {
    setPhase('loading')
    setResult(null)
    // generation takes a moment on slow phones; yield so the spinner paints first
    window.setTimeout(() => {
      const p = generatePuzzle(difficulty, rng.current)
      setPuzzle(p)
      setValues(p.puzzle.slice())
      setNotes(Array(81).fill(0))
      setMistakes(0)
      setUndo([])
      setCheckMsg(null)
      setRevealWrong(false)
      setSelected(p.puzzle.findIndex((v) => v === 0))
      setPaused(false)
      watch.reset()
      watch.start()
      setPhase('playing')
      beginRun(difficulty)
    }, 30)
  }

  function restartSame() {
    if (!puzzle) return
    setValues(puzzle.puzzle.slice())
    setNotes(Array(81).fill(0))
    setMistakes(0)
    setUndo([])
    setCheckMsg(null)
    setRevealWrong(false)
    watch.reset()
    watch.start()
    setPaused(false)
  }

  const isGiven = (i: number) => !!puzzle && puzzle.puzzle[i] !== 0

  function enter(d: number) {
    if (!puzzle || paused || phase !== 'playing' || isGiven(selected)) return
    const i = selected
    setCheckMsg(null)
    if (noteMode && d) {
      if (values[i]) return
      setUndo((u) => [...u, { i, value: values[i], notes: notes[i] }])
      setNotes((n) => n.map((m, k) => (k === i ? m ^ (1 << d) : m)))
      sfx.click()
      return
    }
    if (values[i] === d) return
    setUndo((u) => [...u, { i, value: values[i], notes: notes[i] }])
    const next = values.slice()
    next[i] = d
    setValues(next)
    if (d) {
      // clear this digit from notes of peers and the cell itself
      setNotes((n) =>
        n.map((m, k) => (k === i ? 0 : row(k) === row(i) || col(k) === col(i) || box(k) === box(i) ? m & ~(1 << d) : m)),
      )
      if (d !== puzzle.solution[i]) {
        setMistakes((m) => m + 1)
        sfx.miss()
      } else sfx.click()
    }
    if (isSolved(next)) finish()
  }

  function finish() {
    watch.pause()
    const ms = Math.round(watch.read())
    setFinalMs(ms)
    sfx.win()
    void finishRun({ board: difficulty, metrics: { timeMs: ms, mistakes } }).then(setResult)
    window.setTimeout(() => setPhase('over'), 500)
  }

  function doUndo() {
    const last = undo[undo.length - 1]
    if (!last || paused) return
    setUndo((u) => u.slice(0, -1))
    setValues((v) => v.map((x, k) => (k === last.i ? last.value : x)))
    setNotes((n) => n.map((x, k) => (k === last.i ? last.notes : x)))
    setSelected(last.i)
  }

  function check() {
    if (!puzzle) return
    const wrong = values.filter((v, i) => v && v !== puzzle.solution[i]).length
    const empty = values.filter((v) => !v).length
    setRevealWrong(true)
    setCheckMsg(wrong ? `${wrong} cell(s) are wrong - highlighted in red.` : `No mistakes so far. ${empty} cell(s) to go.`)
  }

  function pause() {
    if (phase !== 'playing') return
    watch.pause()
    setPaused(true)
  }

  useVisibilityPause(pause, phase === 'playing' && !paused)

  useKeyDown((e) => {
    if (phase !== 'playing' || paused) return false
    if (/^[1-9]$/.test(e.key)) {
      enter(Number(e.key))
      return true
    }
    if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
      enter(0)
      return true
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      doUndo()
      return true
    }
    if (e.key === 'n' || e.key === 'N') {
      setNoteMode((m) => !m)
      return true
    }
    const move: Record<string, number> = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }
    if (move[e.key] !== undefined) {
      const r = row(selected)
      const c = col(selected)
      const nr = (r + (e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0) + 9) % 9
      const nc = (c + (e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0) + 9) % 9
      setSelected(nr * 9 + nc)
      return true
    }
    return false
  }, phase === 'playing')

  if (phase === 'menu' || phase === 'loading') {
    return (
      <StartScreen
        onStart={start}
        startDisabled={phase === 'loading'}
        startLabel={phase === 'loading' ? 'Generating puzzle...' : 'New puzzle'}
        instructions={
          <ul className="list-disc space-y-1 pl-5">
            <li>Fill every row, column and 3×3 box with the digits 1-9, each exactly once.</li>
            <li>Tap a cell, then a number (or type 1-9). Arrow keys move, Backspace erases, N toggles notes, Ctrl+Z undoes.</li>
            <li>Every puzzle is generated fresh and checked to have exactly one solution.</li>
            <li>Leaderboard: fastest solve, then fewest mistakes.</li>
          </ul>
        }
        extra={phase === 'loading' ? <div className="mt-3 text-center"><Spinner label="Checking the puzzle has a unique solution" /></div> : null}
      >
        <OptionGroup label="Difficulty">
          <Segmented<Difficulty>
            label="Difficulty"
            value={difficulty}
            onChange={setDifficulty}
            options={[
              { value: 'easy', label: 'Easy' },
              { value: 'medium', label: 'Medium' },
              { value: 'hard', label: 'Hard' },
            ]}
          />
        </OptionGroup>
      </StartScreen>
    )
  }

  if (phase === 'over' || !puzzle) {
    return (
      <ResultsScreen
        title="Solved! Dimaag ki batti jal gayi 💡"
        emoji="🧩"
        subtitle={`${difficulty} · ${puzzle?.clues ?? 0} clues`}
        result={result}
        onReplay={start}
        replayLabel="New puzzle"
        stats={
          <>
            <HudStat label="Time" value={formatDuration(finalMs)} />
            <HudStat label="Mistakes" value={mistakes} />
            <HudStat label="Difficulty" value={difficulty} />
          </>
        }
      />
    )
  }

  const selVal = values[selected]
  const remaining = (d: number) => 9 - values.filter((v) => v === d).length

  return (
    <div className="mx-auto max-w-5xl">
      <Hud>
        <HudStat label="Time" value={formatDuration(watch.elapsed)} />
        <HudStat label="Mistakes" value={mistakes} accent={mistakes ? '#ff4d5e' : undefined} />
        <HudStat label="Level" value={difficulty} />
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" className="!px-3" aria-label="Restart puzzle" onClick={() => setConfirmRestart(true)}>
            <RotateCcw className="size-5" />
          </Button>
          <Button variant="secondary" className="!px-3" aria-label="Pause" onClick={pause}>
            <Pause className="size-5" />
          </Button>
        </div>
      </Hud>
      <div className="flex flex-col items-center gap-4 lg:flex-row lg:items-start lg:justify-center">
        <div className="relative w-full max-w-[min(100%,34rem)]">
          <div
            role="grid"
            aria-label="Sudoku board"
            className={`grid aspect-square grid-cols-9 overflow-hidden rounded-2xl border-2 border-ink-400 bg-ink-400 ${paused ? 'blur-md' : ''}`}
          >
            {values.map((v, i) => {
              const given = isGiven(i)
              const sel = i === selected
              const related = row(i) === row(selected) || col(i) === col(selected) || box(i) === box(selected)
              const same = v !== 0 && v === selVal
              const wrong = !given && v !== 0 && v !== puzzle.solution[i] && (showMistakes || revealWrong)
              const conflict = clash.has(i)
              const r = row(i)
              const c = col(i)
              const borders = `${c % 3 === 2 && c !== 8 ? 'mr-[2px]' : ''} ${r % 3 === 2 && r !== 8 ? 'mb-[2px]' : ''}`
              let bg = 'bg-ink-850'
              if (related) bg = 'bg-ink-800'
              if (same) bg = 'bg-neela/25'
              if (conflict) bg = 'bg-lal/25'
              if (sel) bg = 'bg-masala/35'
              return (
                <button
                  key={i}
                  type="button"
                  role="gridcell"
                  aria-selected={sel}
                  aria-label={`Row ${r + 1} column ${c + 1}: ${v || 'empty'}${given ? ', given' : ''}${wrong ? ', incorrect' : ''}${conflict ? ', conflict' : ''}`}
                  onClick={() => setSelected(i)}
                  className={`relative m-[0.5px] flex items-center justify-center font-display text-[clamp(1rem,5.2vw,1.9rem)] leading-none ${bg} ${borders}`}
                >
                  {v ? (
                    <span className={given ? 'font-extrabold text-ink-100' : wrong ? 'font-bold text-lal' : 'font-bold text-neela'}>{v}</span>
                  ) : notes[i] ? (
                    <span className="grid h-full w-full grid-cols-3 p-0.5 text-[clamp(0.45rem,2vw,0.7rem)] font-semibold text-ink-300">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                        <span key={d} className="flex items-center justify-center">
                          {notes[i] & (1 << d) ? d : ''}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
          <PauseOverlay open={paused} onResume={() => (setPaused(false), watch.start())} onHome={() => navigate('/games')} />
        </div>

        <div className="w-full max-w-[34rem] lg:w-72">
          <div className="grid grid-cols-9 gap-1.5 lg:grid-cols-3 lg:gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => enter(d)}
                disabled={paused || remaining(d) <= 0}
                aria-label={`Enter ${d}${noteMode ? ' as note' : ''}`}
                className="flex min-h-14 flex-col items-center justify-center rounded-xl bg-ink-700 font-display text-2xl font-bold text-ink-100 hover:bg-ink-600 active:scale-95 disabled:opacity-30 lg:min-h-16 lg:text-3xl"
              >
                {d}
                <span className="text-[10px] font-semibold text-ink-400">{remaining(d)}</span>
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1.5 lg:grid-cols-2">
            <Button variant={noteMode ? 'primary' : 'secondary'} size="sm" aria-pressed={noteMode} onClick={() => setNoteMode((m) => !m)} icon={<Pencil className="size-4" />}>
              Notes
            </Button>
            <Button variant="secondary" size="sm" onClick={() => enter(0)} icon={<Eraser className="size-4" />}>
              Erase
            </Button>
            <Button variant="secondary" size="sm" onClick={doUndo} disabled={!undo.length} icon={<Undo2 className="size-4" />}>
              Undo
            </Button>
            <Button variant="secondary" size="sm" onClick={check} icon={<CheckCheck className="size-4" />}>
              Check
            </Button>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-ink-300">
            <input type="checkbox" className="size-4 accent-[#ffd23f]" checked={showMistakes} onChange={(e) => setShowMistakes(e.target.checked)} />
            Highlight wrong digits immediately
          </label>
          {checkMsg && (
            <p role="status" className="mt-2 rounded-xl bg-ink-800 p-2 text-sm">
              {checkMsg}
            </p>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirmRestart}
        title="Restart this puzzle?"
        message="All your entries and notes will be cleared and the timer reset."
        confirmLabel="Restart"
        onConfirm={() => {
          setConfirmRestart(false)
          restartSame()
        }}
        onCancel={() => setConfirmRestart(false)}
      />
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        danger
        title="Leave this puzzle?"
        message="Your unfinished puzzle will be discarded."
        confirmLabel="Leave"
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      />
    </div>
  )
}
