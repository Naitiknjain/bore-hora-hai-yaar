import { RotateCcw, Settings2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { OptionGroup, ResultsScreen, StartScreen, useResultRecorder } from '../../components/game/GameShell'
import { Button } from '../../components/ui/Button'
import { Segmented } from '../../components/ui/Controls'
import { usePlayer } from '../../features/player/PlayerContext'
import { createRng, randomSeed } from '../../lib/random'
import { sfx } from '../../lib/sound'
import type { Difficulty, StoredResult } from '../../types'
import { aiMove, emptyBoard, isFull, other, play, winner, type Board, type Mark } from './logic'

type Mode = 'cpu' | 'local'
type Phase = 'menu' | 'playing' | 'over'

export default function TicTacToe() {
  const { player } = usePlayer()
  const { beginRun, finishRun } = useResultRecorder()
  const [phase, setPhase] = useState<Phase>('menu')
  const [mode, setMode] = useState<Mode>('cpu')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [humanMark, setHumanMark] = useState<Mark>('X')
  const [board, setBoard] = useState<Board>(emptyBoard)
  const [turn, setTurn] = useState<Mark>('X')
  const [tally, setTally] = useState({ X: 0, O: 0, draw: 0 })
  const [result, setResult] = useState<StoredResult | null>(null)
  const rng = useRef(createRng(randomSeed()))
  const ended = useRef(false)
  const overTimer = useRef<number | undefined>(undefined)

  const w = winner(board)
  const draw = !w && isFull(board)
  const cpuMark = other(humanMark)
  const cpuTurn = mode === 'cpu' && phase === 'playing' && turn === cpuMark && !w && !draw

  function start() {
    setBoard(emptyBoard())
    setTurn('X')
    ended.current = false
    window.clearTimeout(overTimer.current)
    setResult(null)
    setPhase('playing')
    if (mode === 'cpu') beginRun(difficulty)
  }

  function move(i: number) {
    if (phase !== 'playing') return
    const next = play(board, i, turn)
    if (!next) {
      sfx.miss()
      return
    }
    sfx.click()
    setBoard(next)
    setTurn(other(turn))
  }

  // computer move
  useEffect(() => {
    if (!cpuTurn) return
    const t = window.setTimeout(() => move(aiMove(board, cpuMark, difficulty, rng.current)), 420)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cpuTurn, board])

  // game end (runs once per finished game: depends on primitive values, not the winner object)
  const winnerMark = w?.mark ?? null
  useEffect(() => {
    if (phase !== 'playing' || (!winnerMark && !draw) || ended.current) return
    ended.current = true
    const outcome = winnerMark ?? 'draw'
    setTally((t) => ({ ...t, [outcome]: t[outcome] + 1 }))
    if (mode === 'cpu') {
      const res = winnerMark ? (winnerMark === humanMark ? 1 : -1) : 0
      if (res === 1) sfx.win()
      else if (res === -1) sfx.lose()
      else sfx.click()
      void finishRun({ board: difficulty, metrics: { result: res } }).then(setResult)
    } else {
      sfx.win()
    }
    overTimer.current = window.setTimeout(() => setPhase('over'), 900)
  }, [winnerMark, draw, phase, mode, humanMark, difficulty, finishRun])

  if (phase === 'menu') {
    return (
      <StartScreen
        onStart={start}
        instructions={
          <ul className="list-disc space-y-1 pl-5">
            <li>Take turns placing X and O. X always goes first.</li>
            <li>Three in a row - across, down or diagonal - wins.</li>
            <li>Full board with no line is a draw. Hard mode never loses.</li>
          </ul>
        }
      >
        <OptionGroup label="Mode">
          <Segmented<Mode>
            label="Mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'cpu', label: 'vs Computer' },
              { value: 'local', label: '2 Players' },
            ]}
          />
        </OptionGroup>
        {mode === 'cpu' && (
          <>
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
            <OptionGroup label="You play as">
              <Segmented<Mark>
                label="Your mark"
                value={humanMark}
                onChange={setHumanMark}
                options={[
                  { value: 'X', label: 'X (first)' },
                  { value: 'O', label: 'O (second)' },
                ]}
              />
            </OptionGroup>
          </>
        )}
      </StartScreen>
    )
  }

  const names: Record<Mark, string> =
    mode === 'cpu'
      ? { [humanMark]: player?.nickname ?? 'You', [cpuMark]: 'Computer' } as Record<Mark, string>
      : { X: 'Player X', O: 'Player O' }

  if (phase === 'over') {
    const title = w ? (mode === 'cpu' ? (w.mark === humanMark ? 'Jeet gaye! 🎉' : 'Computer jeet gaya') : `${names[w.mark]} wins!`) : "It's a draw"
    return (
      <ResultsScreen
        title={title}
        emoji={w ? (mode === 'cpu' && w.mark !== humanMark ? '🤖' : '🏆') : '🤝'}
        subtitle={mode === 'cpu' ? `Difficulty: ${difficulty}` : 'Local match'}
        result={mode === 'cpu' ? result : null}
        onReplay={start}
        stats={
          <>
            <TallyBox label={names.X} value={tally.X} />
            <TallyBox label={names.O} value={tally.O} />
            <TallyBox label="Draws" value={tally.draw} />
          </>
        }
      >
        <Button variant="ghost" size="sm" className="mt-3" icon={<Settings2 className="size-4" />} onClick={() => setPhase('menu')}>
          Change mode
        </Button>
      </ResultsScreen>
    )
  }

  const status = w ? `${names[w.mark]} wins!` : draw ? 'Draw!' : cpuTurn ? 'Computer is thinking...' : `${names[turn]}'s turn (${turn})`

  return (
    <div className="mx-auto flex max-w-md flex-col items-center">
      <p className="mb-4 font-display text-2xl font-bold" aria-live="polite">
        {status}
      </p>
      <div role="grid" aria-label="Tic-tac-toe board" className="grid w-full max-w-[min(100%,26rem)] grid-cols-3 gap-2.5">
        {board.map((cell, i) => {
          const inLine = w?.line.includes(i)
          return (
            <button
              key={i}
              type="button"
              role="gridcell"
              aria-label={`Cell ${i + 1}: ${cell ?? 'empty'}`}
              disabled={cell !== null || !!w || draw || cpuTurn}
              onClick={() => move(i)}
              className={`flex aspect-square items-center justify-center rounded-3xl font-display text-6xl font-extrabold transition sm:text-7xl ${
                inLine ? 'bg-masala/25' : 'bg-ink-800 hover:enabled:bg-ink-700'
              } disabled:cursor-default`}
            >
              {cell && <span className={`animate-pop ${cell === 'X' ? 'text-neela' : 'text-gulabi'}`}>{cell}</span>}
            </button>
          )
        })}
      </div>
      <div className="mt-5 flex gap-2">
        <Button variant="secondary" icon={<RotateCcw className="size-4" />} onClick={start}>
          Restart
        </Button>
        <Button variant="ghost" onClick={() => setPhase('menu')}>
          Menu
        </Button>
      </div>
    </div>
  )
}

function TallyBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-ink-900/60 px-3 py-2">
      <div className="truncate text-xs font-semibold uppercase text-ink-400">{label}</div>
      <div className="font-display text-2xl font-bold">{value}</div>
    </div>
  )
}
