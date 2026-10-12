import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { CanvasStage, type CanvasHandle } from '../../components/game/CanvasStage'
import { PauseButton, PauseOverlay, ResultsScreen, StartScreen, useResultRecorder } from '../../components/game/GameShell'
import { DPad, Hud, HudStat } from '../../components/game/TouchControls'
import { usePlayer } from '../../features/player/PlayerContext'
import { useSettings, vibrate } from '../../features/settings/SettingsContext'
import { useGameLoop, useKeyDown, useSwipe, useVisibilityPause } from '../../hooks/useGameLoop'
import { useResults } from '../../hooks/useResults'
import { createRng, randomSeed } from '../../lib/random'
import { sfx } from '../../lib/sound'
import type { StoredResult } from '../../types'
import { COLS, initialState, queueTurn, ROWS, step, tickMs, type Dir, type SnakeState } from './logic'

const CELL = 20
const W = COLS * CELL
const H = ROWS * CELL
const KEYS: Record<string, Dir> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
}

type Phase = 'menu' | 'playing' | 'over'

export default function SnakeBattle() {
  const navigate = useNavigate()
  const { player } = usePlayer()
  const { showTouchControls } = useSettings()
  const results = useResults()
  const { beginRun, finishRun } = useResultRecorder()
  const rng = useRef(createRng(randomSeed()))
  const state = useRef<SnakeState>(initialState(rng.current))
  const acc = useRef(0)
  const ended = useRef(false)
  const stage = useRef<CanvasHandle>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>('menu')
  const [paused, setPaused] = useState(false)
  const [score, setScore] = useState(0)
  const [result, setResult] = useState<StoredResult | null>(null)

  const best = Math.max(0, ...results.filter((r) => r.gameId === 'snake-battle' && r.playerKey === player?.id).map((r) => r.metrics.score))

  function start() {
    state.current = initialState(rng.current)
    acc.current = 0
    ended.current = false
    setScore(0)
    setResult(null)
    setPaused(false)
    setPhase('playing')
    beginRun('classic')
  }

  function turn(dir: Dir) {
    if (phase !== 'playing' || paused) return
    state.current = queueTurn(state.current, dir)
  }

  function draw() {
    const ctx = stage.current?.ctx()
    if (!ctx) return
    const s = state.current
    ctx.fillStyle = '#0f1528'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#141b31'
    for (let y = 0; y < ROWS; y += 1)
      for (let x = (y % 2); x < COLS; x += 2) ctx.fillRect(x * CELL, y * CELL, CELL, CELL)
    if (s.food) {
      ctx.fillStyle = '#ff4d5e'
      ctx.beginPath()
      ctx.arc(s.food.x * CELL + CELL / 2, s.food.y * CELL + CELL / 2, CELL * 0.38, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#3ee08f'
      ctx.fillRect(s.food.x * CELL + CELL / 2 - 1, s.food.y * CELL + 2, 3, 5)
    }
    s.snake.forEach((p, i) => {
      const t = i / Math.max(1, s.snake.length - 1)
      ctx.fillStyle = i === 0 ? '#ffd23f' : `hsl(${150 - t * 30} 70% ${55 - t * 18}%)`
      const pad = i === 0 ? 1 : 2
      ctx.beginPath()
      ctx.roundRect(p.x * CELL + pad, p.y * CELL + pad, CELL - pad * 2, CELL - pad * 2, 6)
      ctx.fill()
    })
    const h = s.snake[0]
    ctx.fillStyle = '#0b1020'
    ctx.beginPath()
    ctx.arc(h.x * CELL + CELL / 2, h.y * CELL + CELL / 2, 2.5, 0, Math.PI * 2)
    ctx.fill()
  }

  useGameLoop((dt) => {
    if (ended.current) return
    acc.current += dt * 1000
    const interval = tickMs(state.current.score)
    while (acc.current >= interval && state.current.status === 'running') {
      acc.current -= interval
      const prevScore = state.current.score
      state.current = step(state.current, rng.current)
      if (state.current.score !== prevScore) {
        sfx.point()
        setScore(state.current.score)
      }
    }
    draw()
    if (state.current.status !== 'running') {
      ended.current = true
      const s = state.current
      if (s.status === 'dead') {
        sfx.crash()
        vibrate(120)
      } else sfx.win()
      void finishRun({ board: 'classic', metrics: { score: s.score } }).then(setResult)
      setPhase('over')
    }
  }, phase === 'playing' && !paused)

  useEffect(() => {
    if (phase === 'playing') draw()
  })

  useKeyDown((e) => {
    if (phase !== 'playing') return false
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      setPaused((p) => !p)
      return true
    }
    const d = KEYS[e.key]
    if (!d) return false
    turn(d)
    return true
  }, phase === 'playing')

  useSwipe(wrap, turn, phase === 'playing')
  useVisibilityPause(() => setPaused(true), phase === 'playing')

  if (phase === 'menu') {
    return (
      <StartScreen
        onStart={start}
        instructions={
          <ul className="list-disc space-y-1 pl-5">
            <li>Arrow keys / WASD, swipe on the board, or the on-screen pad to turn.</li>
            <li>Eat the red fruit to grow. Each fruit = 1 point.</li>
            <li>Hitting a wall or your own body ends the run. The snake speeds up as it grows.</li>
            <li>P or Esc pauses.</li>
          </ul>
        }
      />
    )
  }

  if (phase === 'over') {
    return (
      <ResultsScreen
        title={state.current.status === 'won' ? 'Poora board! Legend.' : 'Takkar ho gayi!'}
        emoji="🐍"
        result={result}
        onReplay={start}
        stats={
          <>
            <HudStat label="Score" value={state.current.score} />
            <HudStat label="Length" value={state.current.snake.length} />
            <HudStat label="Best" value={Math.max(best, state.current.score)} />
          </>
        }
      />
    )
  }

  return (
    <div className="mx-auto max-w-xl">
      <Hud>
        <HudStat label="Score" value={score} accent="#3ee08f" />
        <HudStat label="Best" value={Math.max(best, score)} />
        <div className="ml-auto">
          <PauseButton onClick={() => setPaused(true)} />
        </div>
      </Hud>
      <div ref={wrap}>
        <CanvasStage ref={stage} width={W} height={H} maxHeight={showTouchControls ? '52dvh' : '70dvh'} label={`Snake board. Score ${score}`}>
          <PauseOverlay open={paused} onResume={() => setPaused(false)} onRestart={start} onHome={() => navigate('/games')} />
        </CanvasStage>
      </div>
      {showTouchControls && <DPad className="mt-4" onDirection={turn} />}
    </div>
  )
}
