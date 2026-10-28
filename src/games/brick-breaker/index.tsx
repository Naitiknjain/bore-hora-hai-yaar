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
  atPace, BALL_R, BRICK_H, BRICK_W, buildWall, clampPaddle, DROP_R, H, launch, PADDLE_H, PADDLE_W, PADDLE_Y, splitBalls, START_LIVES, stepBall, stepDrops, W,
  WALLS, WIDE_FACTOR, WIDE_SECONDS, type Ball, type Brick, type Drop, type Power,
} from './logic'

const POWER_LOOK: Record<Power, { color: string; glyph: string; name: string }> = {
  multi: { color: '#3ee08f', glyph: '×3', name: 'Triple ball' },
  wide: { color: '#4cc9f0', glyph: '⟷', name: 'Wide paddle' },
  blast: { color: '#ff8a3d', glyph: '⚡', name: 'Line blast' },
}

type Phase = 'menu' | 'playing' | 'over'

export default function BrickBreaker() {
  const navigate = useNavigate()
  const { player } = usePlayer()
  const { showTouchControls } = useSettings()
  const results = useResults()
  const { beginRun, finishRun } = useResultRecorder()
  const stage = useRef<CanvasHandle>(null)
  const paddleX = useRef(W / 2)
  // no balls = one resting on the paddle, waiting for launch
  const balls = useRef<Ball[]>([])
  const drops = useRef<Drop[]>([])
  /** seconds this wall has been in play (the ball speeds up a little over time) */
  const wallTime = useRef(0)
  /** seconds of wide paddle left */
  const wideLeft = useRef(0)
  /** the next brick hit takes its whole row */
  const blastReady = useRef(false)
  const [power, setPower] = useState<{ wide: number; blast: boolean }>({ wide: 0, blast: false })
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
    resetPowers()
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

  function resetPowers() {
    balls.current = []
    drops.current = []
    wallTime.current = 0
    wideLeft.current = 0
    blastReady.current = false
    setPower({ wide: 0, blast: false })
  }

  const paddleW = () => (wideLeft.current > 0 ? PADDLE_W * WIDE_FACTOR : PADDLE_W)

  function fire() {
    if (!balls.current.length && phase === 'playing' && !paused) {
      balls.current = [launch(paddleX.current, levelRef.current)]
      sfx.jump()
    }
  }

  function catchPower(p: Power) {
    sfx.match()
    vibrate(30)
    if (p === 'multi') balls.current = splitBalls(balls.current.length ? balls.current : [launch(paddleX.current, levelRef.current)])
    if (p === 'wide') wideLeft.current = WIDE_SECONDS
    if (p === 'blast') blastReady.current = true
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
    if (wideLeft.current > 0) wideLeft.current = Math.max(0, wideLeft.current - dt)
    const pw = paddleW()
    if (dir) paddleX.current = clampPaddle(paddleX.current + dir * 520 * dt, pw)
    else paddleX.current = clampPaddle(paddleX.current, pw)
    // capsules keep falling even while the next ball waits on the paddle
    if (drops.current.length) {
      const d = stepDrops(drops.current, paddleX.current, pw, dt)
      drops.current = d.drops
      d.caught.forEach(catchPower)
    }
    if (balls.current.length) {
      wallTime.current += dt
      let gained = 0
      let hitBrick = false
      let hitPaddle = false
      const alive: Ball[] = []
      for (const b of balls.current) {
        const res = stepBall(atPace(b, levelRef.current, wallTime.current), bricks.current, paddleX.current, dt, { paddleW: pw, blast: blastReady.current })
        bricks.current = res.bricks
        gained += res.gained
        hitBrick ||= res.hitBrick
        hitPaddle ||= res.hitPaddle
        if (res.blasted) {
          blastReady.current = false
          sfx.crash()
          vibrate(60)
        }
        for (const br of res.broken) if (br.power) drops.current.push({ x: br.x + BRICK_W / 2, y: br.y + BRICK_H / 2, power: br.power })
        if (!res.lost) alive.push(res.ball)
      }
      balls.current = alive
      if (hitBrick) sfx.point()
      else if (hitPaddle) sfx.hit()
      if (gained) {
        scoreRef.current += gained
        setScore(scoreRef.current)
      }
      // a life is lost only when the last ball falls
      if (!alive.length) {
        sfx.crash()
        vibrate(100)
        livesRef.current -= 1
        setLives(livesRef.current)
        drops.current = []
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
        resetPowers()
        sfx.win()
      }
    }
    // HUD readout of active powers (only re-renders when it changes)
    const wide = Math.ceil(wideLeft.current)
    if (wide !== power.wide || blastReady.current !== power.blast) setPower({ wide, blast: blastReady.current })
    draw()
  }, phase === 'playing' && !paused)

  function draw() {
    const ctx = stage.current?.ctx()
    if (!ctx) return
    ctx.fillStyle = '#0f1528'
    ctx.fillRect(0, 0, W, H)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
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
      if (br.power) {
        // power bricks carry a star: break them to drop a capsule
        ctx.fillStyle = 'rgba(15,21,40,0.8)'
        ctx.font = '700 13px Inter, system-ui'
        ctx.fillText('★', br.x + BRICK_W / 2, br.y + BRICK_H / 2 + 1)
      }
    }
    ctx.globalAlpha = 1
    // falling capsules
    for (const d of drops.current) {
      const look = POWER_LOOK[d.power]
      ctx.fillStyle = look.color
      ctx.beginPath()
      ctx.roundRect(d.x - DROP_R * 1.5, d.y - DROP_R, DROP_R * 3, DROP_R * 2, DROP_R)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.fillStyle = '#0f1528'
      ctx.font = '800 14px Inter, system-ui'
      ctx.fillText(look.glyph, d.x, d.y + 1)
    }
    const pw = paddleW()
    ctx.fillStyle = wideLeft.current > 0 ? '#bfeeff' : '#eef0f8'
    ctx.beginPath()
    ctx.roundRect(paddleX.current - pw / 2, PADDLE_Y - PADDLE_H / 2, pw, PADDLE_H, 7)
    ctx.fill()
    const shown = balls.current.length ? balls.current : [{ x: paddleX.current, y: PADDLE_Y - PADDLE_H / 2 - BALL_R - 1 }]
    for (const b of shown) {
      if (blastReady.current) {
        // a ready line blast makes the ball glow
        ctx.fillStyle = 'rgba(255,138,61,0.35)'
        ctx.beginPath()
        ctx.arc(b.x, b.y, BALL_R * 2.1, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = blastReady.current ? '#ff8a3d' : '#ffd23f'
      ctx.beginPath()
      ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.textBaseline = 'alphabetic'
    if (!balls.current.length) {
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
    if (e.pointerType === 'mouse' || e.buttons || e.type === 'pointerdown') paddleX.current = clampPaddle(stage.current!.toLogical(e.clientX, e.clientY).x, paddleW())
  }

  if (phase === 'menu') {
    return (
      <StartScreen
        onStart={start}
        instructions={
          <ul className="list-disc space-y-1 pl-5">
            <li>Move the paddle with the mouse, ←/→ (A/D), dragging on the board, or the on-screen buttons.</li>
            <li>Space, a click, a tap on the court or Launch serves the ball. Bounce it into the bricks to break them.</li>
            <li>Outlined bricks need two hits. Clear all {WALLS.length} walls to win. The ball slowly speeds up the longer a wall lasts.</li>
            <li>
              Bricks with a ★ drop a power-up - catch it with the paddle: <b>×3</b> triples your balls, <b>⟷</b> widens the paddle for {WIDE_SECONDS} s,{' '}
              <b>⚡</b> makes the next brick you hit take its whole row.
            </li>
            <li>You lose a life when your last ball falls - {START_LIVES} lives in total.</li>
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
        {/* active powers, on the court so the HUD never changes size */}
        <div className="pointer-events-none absolute left-2 top-2 flex gap-1 text-sm font-bold" aria-live="polite">
          {power.wide > 0 && <span className="rounded-full bg-[#4cc9f0] px-2 py-0.5 text-[#0f1528]" title={POWER_LOOK.wide.name}>⟷ {power.wide}s</span>}
          {power.blast && <span className="rounded-full bg-[#ff8a3d] px-2 py-0.5 text-[#0f1528]" title={POWER_LOOK.blast.name}>⚡ ready</span>}
        </div>
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
