import { ArrowLeft, ArrowRight, Rocket } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { CanvasStage, type CanvasHandle } from '../../components/game/CanvasStage'
import { PauseButton, PauseOverlay, ResultsScreen, StartScreen, useResultRecorder } from '../../components/game/GameShell'
import { Hud, HudStat, TouchButton } from '../../components/game/TouchControls'
import { usePlayer } from '../../features/player/PlayerContext'
import { useSettings, vibrate } from '../../features/settings/SettingsContext'
import { useGameLoop, useKeyDown, useKeyUp, useVisibilityPause } from '../../hooks/useGameLoop'
import { useResults } from '../../hooks/useResults'
import { sfx } from '../../lib/sound'
import type { StoredResult } from '../../types'
import {
  BALL_R, BRICK_H, BRICK_W, buildWall, clampPaddle, H, launch, PADDLE_H, PADDLE_W, PADDLE_Y, START_LIVES, stepBall, W, WALLS,
  type Ball, type Brick,
} from './logic'

type Phase = 'menu' | 'playing' | 'over'

export default function BrickBreaker() {
  const navigate = useNavigate()
  const { player } = usePlayer()
  const { showTouchControls } = useSettings()
  const results = useResults()
  const { beginRun, finishRun } = useResultRecorder()
  const stage = useRef<CanvasHandle>(null)
  const paddleX = useRef(W / 2)
  const ball = useRef<Ball | null>(null) // null = resting on the paddle, waiting for launch
  const bricks = useRef<Brick[]>(buildWall(0))
  const keys = useRef(new Set<string>())
  const touchDir = useRef(0)
  const ended = useRef(false)
  const [phase, setPhase] = useState<Phase>('menu')
  const [paused, setPaused] = useState(false)
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(START_LIVES)
  const [level, setLevel] = useState(0)
  const [won, setWon] = useState(false)
  const [result, setResult] = useState<StoredResult | null>(null)
  const scoreRef = useRef(0)
  const livesRef = useRef(START_LIVES)
  const levelRef = useRef(0)

  const best = Math.max(0, ...results.filter((r) => r.gameId === 'brick-breaker' && r.playerKey === player?.id).map((r) => r.metrics.score))

  function start() {
    bricks.current = buildWall(0)
    ball.current = null
    paddleX.current = W / 2
    scoreRef.current = 0
    livesRef.current = START_LIVES
    levelRef.current = 0
    ended.current = false
    setScore(0)
    setLives(START_LIVES)
    setLevel(0)
    setWon(false)
    setResult(null)
    setPaused(false)
    setPhase('playing')
    beginRun('classic')
  }

  function fire() {
    if (!ball.current && phase === 'playing' && !paused) {
      ball.current = launch(paddleX.current, levelRef.current)
      sfx.jump()
    }
  }

  function end(didWin: boolean) {
    if (ended.current) return
    ended.current = true
    setWon(didWin)
    if (didWin) sfx.win()
    else sfx.lose()
    void finishRun({ board: 'classic', metrics: { score: scoreRef.current, level: levelRef.current + 1 } }).then(setResult)
    setPhase('over')
  }

  useGameLoop((dt) => {
    if (ended.current) return
    const dir = (keys.current.has('arrowright') || keys.current.has('d') ? 1 : 0) - (keys.current.has('arrowleft') || keys.current.has('a') ? 1 : 0) + touchDir.current
    if (dir) paddleX.current = clampPaddle(paddleX.current + dir * 520 * dt)
    if (ball.current) {
      const res = stepBall(ball.current, bricks.current, paddleX.current, dt)
      ball.current = res.ball
      bricks.current = res.bricks
      if (res.hitBrick) sfx.point()
      else if (res.hitPaddle) sfx.hit()
      if (res.gained) {
        scoreRef.current += res.gained
        setScore(scoreRef.current)
      }
      if (res.lost) {
        sfx.crash()
        vibrate(100)
        livesRef.current -= 1
        setLives(livesRef.current)
        ball.current = null
        if (livesRef.current <= 0) {
          draw()
          end(false)
          return
        }
      }
      if (!bricks.current.length) {
        if (levelRef.current + 1 >= WALLS.length) {
          draw()
          end(true)
          return
        }
        levelRef.current += 1
        setLevel(levelRef.current)
        bricks.current = buildWall(levelRef.current)
        ball.current = null
        sfx.win()
      }
    }
    draw()
  }, phase === 'playing' && !paused)

  function draw() {
    const ctx = stage.current?.ctx()
    if (!ctx) return
    ctx.fillStyle = '#0f1528'
    ctx.fillRect(0, 0, W, H)
    for (const br of bricks.current) {
      ctx.globalAlpha = br.hp < br.maxHp ? 0.55 : 1
      ctx.fillStyle = br.color
      ctx.beginPath()
      ctx.roundRect(br.x, br.y, BRICK_W, BRICK_H, 4)
      ctx.fill()
      if (br.maxHp > 1) {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'
        ctx.lineWidth = 2
        ctx.stroke()
      }
    }
    ctx.globalAlpha = 1
    ctx.fillStyle = '#eef0f8'
    ctx.beginPath()
    ctx.roundRect(paddleX.current - PADDLE_W / 2, PADDLE_Y - PADDLE_H / 2, PADDLE_W, PADDLE_H, 7)
    ctx.fill()
    const b = ball.current ?? { x: paddleX.current, y: PADDLE_Y - PADDLE_H / 2 - BALL_R - 1 }
    ctx.fillStyle = '#ffd23f'
    ctx.beginPath()
    ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2)
    ctx.fill()
    if (!ball.current) {
      ctx.fillStyle = 'rgba(238,240,248,0.75)'
      ctx.font = '600 18px Inter, system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(showTouchControls ? 'Tap the screen to serve' : 'Press Space or click to launch', W / 2, H / 2 + 60)
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
    if (e.key === ' ' || e.key === 'ArrowUp') {
      fire()
      return true
    }
    const k = e.key.toLowerCase()
    if (['arrowleft', 'arrowright', 'a', 'd'].includes(k)) {
      keys.current.add(k)
      return true
    }
    return false
  }, phase === 'playing')
  useKeyUp((e) => {
    keys.current.delete(e.key.toLowerCase())
  }, phase === 'playing')
  useVisibilityPause(() => {
    keys.current.clear()
    touchDir.current = 0
    setPaused(true)
  }, phase === 'playing')

  const followPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (paused) return
    if (e.pointerType === 'mouse' || e.buttons || e.type === 'pointerdown') paddleX.current = clampPaddle(stage.current!.toLogical(e.clientX, e.clientY).x)
  }

  if (phase === 'menu') {
    return (
      <StartScreen
        onStart={start}
        instructions={
          <ul className="list-disc space-y-1 pl-5">
            <li>Move the paddle with the mouse, ←/→ (A/D), dragging on the board, or the on-screen buttons.</li>
            <li>Space, a click, a tap on the court or Launch serves the ball. Bounce it into the bricks to break them.</li>
            <li>Outlined bricks need two hits. Clear all {WALLS.length} walls to win.</li>
            <li>Miss the ball and you lose a life - {START_LIVES} lives in total.</li>
          </ul>
        }
      />
    )
  }

  if (phase === 'over') {
    return (
      <ResultsScreen
        title={won ? 'Saari deewarein gir gayi! 🧱' : 'Game over'}
        emoji={won ? '🏆' : '💔'}
        result={result}
        onReplay={start}
        stats={
          <>
            <HudStat label="Score" value={score.toLocaleString()} />
            <HudStat label="Wall" value={`${level + 1}/${WALLS.length}`} />
            <HudStat label="Best" value={Math.max(best, score).toLocaleString()} />
          </>
        }
      />
    )
  }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col short:max-w-none short:flex-row short:items-center">
      <Hud>
        <HudStat label="Score" value={score.toLocaleString()} accent="#a77dff" />
        <HudStat label="Lives" value={'❤️'.repeat(Math.max(0, lives)) || '-'} />
        <HudStat label="Wall" value={`${level + 1}/${WALLS.length}`} />
        <div className="ml-auto">
          <PauseButton onClick={() => setPaused(true)} />
        </div>
      </Hud>
      <CanvasStage
        ref={stage}
        width={W}
        height={H}
        maxHeight={showTouchControls ? '58dvh' : '74dvh'}
        label={`Brick breaker. Score ${score}, ${lives} lives`}
        onPointerDown={(e) => {
          followPointer(e)
          fire() // a click or a tap on the court serves the ball (no-op while it is already moving)
        }}
        onPointerMove={followPointer}
      >
        <PauseOverlay open={paused} onResume={() => setPaused(false)} onRestart={start} onHome={() => navigate('/games')} />
      </CanvasStage>
      {showTouchControls && (
        <div className="mx-auto mt-3 grid w-full max-w-sm shrink-0 grid-cols-3 gap-2 short:order-first short:mx-0 short:mr-3 short:mt-0 short:w-36 short:grid-cols-2">
          <TouchButton label="Move left" onPress={() => (touchDir.current = -1)} onRelease={() => (touchDir.current = 0)}>
            <ArrowLeft className="size-7" />
          </TouchButton>
          <TouchButton label="Launch ball" onPress={fire} className="short:order-first short:col-span-2">
            <Rocket className="size-6" />
          </TouchButton>
          <TouchButton label="Move right" onPress={() => (touchDir.current = 1)} onRelease={() => (touchDir.current = 0)}>
            <ArrowRight className="size-7" />
          </TouchButton>
        </div>
      )}
    </div>
  )
}
