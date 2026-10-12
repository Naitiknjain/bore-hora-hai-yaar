import { ArrowDown, ArrowLeft, ArrowRight, ChevronsDown, RotateCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { CanvasStage, type CanvasHandle } from '../../components/game/CanvasStage'
import { PauseButton, PauseOverlay, ResultsScreen, StartScreen, useResultRecorder } from '../../components/game/GameShell'
import { HudStat, TouchButton } from '../../components/game/TouchControls'
import { usePlayer } from '../../features/player/PlayerContext'
import { useSettings, vibrate } from '../../features/settings/SettingsContext'
import { useGameLoop, useKeyDown, useKeyUp, useVisibilityPause } from '../../hooks/useGameLoop'
import { useResults } from '../../hooks/useResults'
import { createRng, randomSeed } from '../../lib/random'
import { sfx } from '../../lib/sound'
import type { StoredResult } from '../../types'
import { cells, COLORS, COLS, ghostY, gravityMs, hardDrop, HIDDEN, lock, newGame, ROWS, rotate, tryMove, type PieceType, type TetrisState } from './logic'

const CELL = 24
const W = COLS * CELL
const H = ROWS * CELL
const LOCK_DELAY = 500
const MAX_LOCK_RESETS = 15

type Phase = 'menu' | 'playing' | 'over'

function drawBlock(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, size = CELL, alpha = 1) {
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(x + 1, y + 1, size - 2, size - 2, 4)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.fillRect(x + 3, y + 3, size - 6, 3)
  ctx.globalAlpha = 1
}

function NextPreview({ type }: { type: PieceType }) {
  const cs = cells(type, 0)
  const minX = Math.min(...cs.map((c) => c[0]))
  const maxX = Math.max(...cs.map((c) => c[0]))
  const minY = Math.min(...cs.map((c) => c[1]))
  const maxY = Math.max(...cs.map((c) => c[1]))
  const size = 16
  return (
    <svg viewBox={`0 0 ${(maxX - minX + 1) * size} ${(maxY - minY + 1) * size}`} className="h-10 w-auto max-w-full" role="img" aria-label={`Next piece: ${type}`}>
      {cs.map(([x, y]) => (
        <rect key={`${x}${y}`} x={(x - minX) * size + 1} y={(y - minY) * size + 1} width={size - 2} height={size - 2} rx={3} fill={COLORS[type]} />
      ))}
    </svg>
  )
}

export default function Tetris() {
  const navigate = useNavigate()
  const { player } = usePlayer()
  const { showTouchControls } = useSettings()
  const results = useResults()
  const { beginRun, finishRun } = useResultRecorder()
  const rng = useRef(createRng(randomSeed()))
  const game = useRef<TetrisState>(newGame(rng.current))
  const gravityAcc = useRef(0)
  const lockTimer = useRef<number | null>(null)
  const lockResets = useRef(0)
  const softDrop = useRef(false)
  const flash = useRef(0)
  const ended = useRef(false)
  const stage = useRef<CanvasHandle>(null)
  const [phase, setPhase] = useState<Phase>('menu')
  const [paused, setPaused] = useState(false)
  const [hud, setHud] = useState({ score: 0, lines: 0, level: 1, next: game.current.next })
  const [result, setResult] = useState<StoredResult | null>(null)

  const best = Math.max(0, ...results.filter((r) => r.gameId === 'tetris' && r.playerKey === player?.id).map((r) => r.metrics.score))

  const syncHud = () => {
    const s = game.current
    setHud((h) => (h.score === s.score && h.lines === s.lines && h.level === s.level && h.next === s.next ? h : { score: s.score, lines: s.lines, level: s.level, next: s.next }))
  }

  function start() {
    game.current = newGame(rng.current)
    gravityAcc.current = 0
    lockTimer.current = null
    lockResets.current = 0
    ended.current = false
    setResult(null)
    setPaused(false)
    syncHud()
    setPhase('playing')
    beginRun('classic')
  }

  function afterLock(res: { state: TetrisState; cleared: number }) {
    game.current = res.state
    lockTimer.current = null
    lockResets.current = 0
    gravityAcc.current = 0
    if (res.cleared) {
      flash.current = 1
      sfx.match()
      if (res.cleared === 4) vibrate([40, 30, 40])
    } else sfx.hit()
    syncHud()
    if (res.state.over && !ended.current) {
      ended.current = true
      sfx.lose()
      void finishRun({ board: 'classic', metrics: { score: res.state.score, lines: res.state.lines } }).then(setResult)
      setPhase('over')
    }
  }

  function onGroundMoved() {
    // moving/rotating on the ground resets the lock delay a limited number of times
    if (lockTimer.current !== null && lockResets.current < MAX_LOCK_RESETS) {
      lockTimer.current = 0
      lockResets.current += 1
    }
  }

  const act = {
    left: () => {
      const n = tryMove(game.current, -1, 0)
      if (n) {
        game.current = n
        onGroundMoved()
      }
    },
    right: () => {
      const n = tryMove(game.current, 1, 0)
      if (n) {
        game.current = n
        onGroundMoved()
      }
    },
    rotate: (dir: 1 | -1 = 1) => {
      const n = rotate(game.current, dir)
      if (n) {
        game.current = n
        sfx.click()
        onGroundMoved()
      }
    },
    soft: () => {
      const n = tryMove(game.current, 0, 1)
      if (n) {
        game.current = { ...n, score: n.score + 1 }
        gravityAcc.current = 0
        syncHud()
      }
    },
    hard: () => afterLock(hardDrop(game.current, rng.current)),
  }

  useGameLoop((dt) => {
    const s = game.current
    if (s.over || ended.current) return
    const interval = softDrop.current ? Math.min(40, gravityMs(s.level)) : gravityMs(s.level)
    gravityAcc.current += dt * 1000
    const grounded = !tryMove(s, 0, 1)
    if (grounded) {
      lockTimer.current = (lockTimer.current ?? 0) + dt * 1000
      if (lockTimer.current >= LOCK_DELAY) afterLock(lock(game.current, rng.current))
    } else {
      lockTimer.current = null
      while (gravityAcc.current >= interval) {
        gravityAcc.current -= interval
        const n = tryMove(game.current, 0, 1)
        if (!n) break
        game.current = softDrop.current ? { ...n, score: n.score + 1 } : n
      }
      if (softDrop.current) syncHud()
    }
    flash.current = Math.max(0, flash.current - dt * 4)
    draw()
  }, phase === 'playing' && !paused)

  function draw() {
    const ctx = stage.current?.ctx()
    if (!ctx) return
    const s = game.current
    ctx.fillStyle = '#0b1020'
    ctx.fillRect(0, 0, W, H)
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'
    for (let x = 1; x < COLS; x += 1) {
      ctx.beginPath()
      ctx.moveTo(x * CELL, 0)
      ctx.lineTo(x * CELL, H)
      ctx.stroke()
    }
    for (let y = 1; y < ROWS; y += 1) {
      ctx.beginPath()
      ctx.moveTo(0, y * CELL)
      ctx.lineTo(W, y * CELL)
      ctx.stroke()
    }
    s.board.forEach((row, y) => row.forEach((c, x) => c && y >= HIDDEN && drawBlock(ctx, x * CELL, (y - HIDDEN) * CELL, COLORS[c])))
    if (!s.over) {
      const gy = ghostY(s)
      for (const [dx, dy] of cells(s.piece.type, s.piece.rotation)) {
        const yy = gy + dy - HIDDEN
        if (yy >= 0) drawBlock(ctx, (s.piece.x + dx) * CELL, yy * CELL, COLORS[s.piece.type], CELL, 0.2)
      }
      for (const [dx, dy] of cells(s.piece.type, s.piece.rotation)) {
        const yy = s.piece.y + dy - HIDDEN
        if (yy >= 0) drawBlock(ctx, (s.piece.x + dx) * CELL, yy * CELL, COLORS[s.piece.type])
      }
    }
    if (flash.current > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flash.current * 0.15})`
      ctx.fillRect(0, 0, W, H)
    }
  }

  useEffect(() => {
    if (phase === 'playing') draw()
  })

  useKeyDown((e) => {
    if (phase !== 'playing') return false
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      setPaused((p) => !p)
      return true
    }
    if (paused) return false
    switch (e.key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        act.left()
        return true
      case 'ArrowRight':
      case 'd':
      case 'D':
        act.right()
        return true
      case 'ArrowUp':
      case 'x':
      case 'X':
      case 'w':
      case 'W':
        act.rotate(1)
        return true
      case 'z':
      case 'Z':
        act.rotate(-1)
        return true
      case 'ArrowDown':
      case 's':
      case 'S':
        softDrop.current = true
        return true
      case ' ':
        if (!e.repeat) act.hard()
        return true
    }
    return false
  }, phase === 'playing')

  useKeyUp((e) => {
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') softDrop.current = false
  }, phase === 'playing')

  useVisibilityPause(() => setPaused(true), phase === 'playing')

  if (phase === 'menu') {
    return (
      <StartScreen
        onStart={start}
        instructions={
          <ul className="list-disc space-y-1 pl-5">
            <li>←/→ move, ↑ or X rotate, Z rotate back, ↓ soft drop, Space hard drop, P pause.</li>
            <li>On touch screens use the buttons below the board.</li>
            <li>Fill a whole row to clear it. 1/2/3/4 lines = 100/300/500/800 × level.</li>
            <li>Every 10 lines the level - and falling speed - goes up. Stack reaches the top = game over.</li>
          </ul>
        }
      />
    )
  }

  if (phase === 'over') {
    return (
      <ResultsScreen
        title="Stack full! Game over"
        emoji="🟦"
        result={result}
        onReplay={start}
        stats={
          <>
            <HudStat label="Score" value={hud.score.toLocaleString()} />
            <HudStat label="Lines" value={hud.lines} />
            <HudStat label="Level" value={hud.level} />
          </>
        }
      />
    )
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center">
      <div className="flex w-full items-start justify-center gap-3">
        <div className="w-full max-w-[min(100%,calc(62dvh*0.5))] flex-1">
          <CanvasStage ref={stage} width={W} height={H} maxHeight={showTouchControls ? '58dvh' : '76dvh'} label={`Tetris board. Score ${hud.score}`}>
            <PauseOverlay open={paused} onResume={() => setPaused(false)} onRestart={start} onHome={() => navigate('/games')} />
          </CanvasStage>
        </div>
        <div className="flex w-24 shrink-0 flex-col gap-2 sm:w-32">
          <div className="rounded-2xl bg-ink-800 p-2 text-center">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Next</div>
            <div className="mt-1 flex h-12 items-center justify-center">
              <NextPreview type={hud.next} />
            </div>
          </div>
          <HudStat label="Score" value={hud.score.toLocaleString()} accent="#4cc9f0" />
          <HudStat label="Lines" value={hud.lines} />
          <HudStat label="Level" value={hud.level} />
          <HudStat label="Best" value={Math.max(best, hud.score).toLocaleString()} />
          <PauseButton onClick={() => setPaused(true)} />
        </div>
      </div>
      {showTouchControls && (
        <div className="mt-3 grid w-full max-w-sm grid-cols-5 gap-2">
          <TouchButton label="Move left" onPress={act.left}>
            <ArrowLeft className="size-6" />
          </TouchButton>
          <TouchButton label="Rotate" onPress={() => act.rotate(1)}>
            <RotateCw className="size-6" />
          </TouchButton>
          <TouchButton label="Move right" onPress={act.right}>
            <ArrowRight className="size-6" />
          </TouchButton>
          <TouchButton label="Soft drop (hold)" onPress={() => (softDrop.current = true)} onRelease={() => (softDrop.current = false)}>
            <ArrowDown className="size-6" />
          </TouchButton>
          <TouchButton label="Hard drop" onPress={act.hard}>
            <ChevronsDown className="size-6" />
          </TouchButton>
        </div>
      )}
    </div>
  )
}
