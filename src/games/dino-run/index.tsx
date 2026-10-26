import { ArrowDown, ArrowUp } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { CanvasStage, type CanvasHandle } from '../../components/game/CanvasStage'
import { PauseButton, PauseOverlay, ResultsScreen, StartScreen, useResultRecorder } from '../../components/game/GameShell'
import { Hud, HudStat, TouchButton } from '../../components/game/TouchControls'
import { usePlayer } from '../../features/player/PlayerContext'
import { vibrate } from '../../features/settings/SettingsContext'
import { useGameLoop, useKeyDown, useKeyUp, useVisibilityPause } from '../../hooks/useGameLoop'
import { useResults } from '../../hooks/useResults'
import { createRng, randomSeed } from '../../lib/random'
import { sfx } from '../../lib/sound'
import type { StoredResult } from '../../types'
import { DINO_X, DUCK, GROUND_Y, H, initial, jump, onGround, score as scoreOf, STAND, step, W, type DinoState } from './logic'

type Phase = 'menu' | 'playing' | 'over'

export default function DinoRun() {
  const navigate = useNavigate()
  const { player } = usePlayer()
  const results = useResults()
  const { beginRun, finishRun } = useResultRecorder()
  const rng = useRef(createRng(randomSeed()))
  const game = useRef<DinoState>(initial())
  const ducking = useRef(false)
  const stage = useRef<CanvasHandle>(null)
  const lastMilestone = useRef(0)
  const ended = useRef(false)
  const [phase, setPhase] = useState<Phase>('menu')
  const [paused, setPaused] = useState(false)
  const [score, setScore] = useState(0)
  const [result, setResult] = useState<StoredResult | null>(null)

  const best = Math.max(0, ...results.filter((r) => r.gameId === 'dino-run' && r.playerKey === player?.id).map((r) => r.metrics.score))

  function start() {
    game.current = initial()
    ducking.current = false
    lastMilestone.current = 0
    ended.current = false
    setScore(0)
    setResult(null)
    setPaused(false)
    setPhase('playing')
    beginRun('classic')
  }

  function doJump() {
    if (phase !== 'playing' || paused) return
    const before = game.current
    game.current = jump(game.current)
    if (game.current !== before) sfx.jump()
  }

  useGameLoop((dt) => {
    if (ended.current) return
    game.current = step(game.current, dt, ducking.current, rng.current)
    const sc = scoreOf(game.current)
    if (sc !== score) setScore(sc)
    if (Math.floor(sc / 100) > lastMilestone.current) {
      lastMilestone.current = Math.floor(sc / 100)
      sfx.point()
    }
    draw()
    if (game.current.dead) {
      ended.current = true
      sfx.crash()
      vibrate(150)
      void finishRun({ board: 'classic', metrics: { score: sc } }).then(setResult)
      setPhase('over')
    }
  }, phase === 'playing' && !paused)

  function draw() {
    const ctx = stage.current?.ctx()
    if (!ctx) return
    const s = game.current
    ctx.fillStyle = '#e9ecf5'
    ctx.fillRect(0, 0, W, H)
    // clouds
    ctx.fillStyle = '#d3d8e8'
    for (let i = 0; i < 4; i += 1) {
      const x = ((i * 230 - s.distance * 0.15) % (W + 200) + W + 200) % (W + 200) - 100
      ctx.beginPath()
      ctx.ellipse(x, 50 + (i % 2) * 25, 34, 10, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    // ground line + pebbles
    ctx.fillStyle = '#3a4670'
    ctx.fillRect(0, GROUND_Y, W, 2)
    for (let i = 0; i < 30; i += 1) {
      const x = ((i * 53 - s.distance) % W + W) % W
      ctx.fillRect(x, GROUND_Y + 6 + (i % 3) * 5, 3 + (i % 4), 2)
    }
    // obstacles
    for (const o of s.obstacles) {
      if (o.kind.startsWith('cactus')) {
        ctx.fillStyle = '#2b8a57'
        const parts = o.kind === 'cactus-group' ? 3 : 1
        const pw = o.w / parts
        for (let p = 0; p < parts; p += 1) {
          const x = o.x + p * pw
          const h = o.h - (p === 1 ? 0 : parts > 1 ? 8 : 0)
          ctx.beginPath()
          ctx.roundRect(x + pw * 0.25, GROUND_Y - h, pw * 0.5, h, 4)
          ctx.fill()
          ctx.fillRect(x, GROUND_Y - h * 0.65, pw * 0.25, 4)
          ctx.fillRect(x, GROUND_Y - h * 0.65 - 10, 4, 10)
          ctx.fillRect(x + pw * 0.75, GROUND_Y - h * 0.5, pw * 0.25, 4)
          ctx.fillRect(x + pw - 4, GROUND_Y - h * 0.5 - 10, 4, 10)
        }
      } else {
        const flapUp = Math.floor(s.t * 8) % 2 === 0
        ctx.fillStyle = '#7a4b9a'
        ctx.beginPath()
        ctx.ellipse(o.x + o.w / 2, o.y + o.h / 2, o.w / 2 - 4, 8, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.moveTo(o.x + 12, o.y + o.h / 2)
        ctx.lineTo(o.x + 22, flapUp ? o.y - 4 : o.y + o.h + 4)
        ctx.lineTo(o.x + 30, o.y + o.h / 2)
        ctx.fill()
        ctx.fillStyle = '#ff8a3d'
        ctx.beginPath()
        ctx.moveTo(o.x, o.y + o.h / 2)
        ctx.lineTo(o.x + 8, o.y + o.h / 2 - 3)
        ctx.lineTo(o.x + 8, o.y + o.h / 2 + 3)
        ctx.fill()
      }
    }
    // dino (original chunky design)
    const duck = s.ducking && onGround(s)
    const size = duck ? DUCK : STAND
    const top = s.y - size.h
    ctx.fillStyle = s.dead ? '#ff4d5e' : '#283353'
    ctx.beginPath()
    ctx.roundRect(DINO_X, top + (duck ? 4 : 14), size.w - (duck ? 14 : 12), size.h - (duck ? 10 : 24), 8)
    ctx.fill()
    ctx.beginPath()
    ctx.roundRect(DINO_X + size.w - (duck ? 22 : 26), top, duck ? 22 : 26, duck ? 16 : 20, 6)
    ctx.fill()
    ctx.fillRect(DINO_X - 8, top + (duck ? 8 : 20), 10, 6)
    ctx.fillStyle = '#fff'
    ctx.fillRect(DINO_X + size.w - 10, top + 4, 5, 5)
    ctx.fillStyle = '#283353'
    const legPhase = onGround(s) && !s.dead ? Math.floor(s.t * 14) % 2 : 0
    ctx.fillRect(DINO_X + 8, s.y - 10, 6, legPhase ? 10 : 6)
    ctx.fillRect(DINO_X + 20, s.y - 10, 6, legPhase ? 6 : 10)
    // score
    ctx.fillStyle = '#3a4670'
    ctx.font = '700 18px Inter, system-ui'
    ctx.textAlign = 'right'
    ctx.fillText(String(scoreOf(s)).padStart(5, '0'), W - 16, 28)
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
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      doJump()
      return true
    }
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      ducking.current = true
      return true
    }
    return false
  }, phase === 'playing')
  useKeyUp((e) => {
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') ducking.current = false
  }, phase === 'playing')
  useVisibilityPause(() => {
    ducking.current = false
    setPaused(true)
  }, phase === 'playing')

  if (phase === 'menu') {
    return (
      <StartScreen
        onStart={start}
        instructions={
          <ul className="list-disc space-y-1 pl-5">
            <li>The dino runs on its own. Space / ↑ / tap the board to jump.</li>
            <li>↓ or the Duck button (hold) to duck under flying birds. Ducking in the air drops you faster.</li>
            <li>It gets faster the longer you survive. Any hit ends the run.</li>
          </ul>
        }
      />
    )
  }

  if (phase === 'over') {
    return (
      <ResultsScreen
        title={scoreOf(game.current) > best ? 'Naya high score!' : 'Ouch! Cactus wins'}
        emoji="🦖"
        result={result}
        onReplay={start}
        stats={
          <>
            <HudStat label="Score" value={scoreOf(game.current)} />
            <HudStat label="Best" value={Math.max(best, scoreOf(game.current))} />
          </>
        }
      />
    )
  }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col short:max-w-none short:flex-row short:items-center">
      <Hud>
        <HudStat label="Score" value={score} accent="#ff8a3d" />
        <HudStat label="Best" value={Math.max(best, score)} />
        <div className="ml-auto">
          <PauseButton onClick={() => setPaused(true)} />
        </div>
      </Hud>
      <CanvasStage ref={stage} width={W} height={H} label={`Dino run. Score ${score}`} onPointerDown={doJump}>
        <PauseOverlay open={paused} onResume={() => setPaused(false)} onRestart={start} onHome={() => navigate('/games')} />
      </CanvasStage>
      <div className="mx-auto mt-3 grid w-full max-w-sm shrink-0 grid-cols-2 gap-3 short:order-first short:mx-0 short:mr-3 short:mt-0 short:w-28 short:grid-cols-1">
        <TouchButton label="Jump" onPress={doJump} className="min-h-16">
          <ArrowUp className="size-7" /> <span className="ml-1 font-semibold">Jump</span>
        </TouchButton>
        <TouchButton label="Duck (hold)" onPress={() => (ducking.current = true)} onRelease={() => (ducking.current = false)} className="min-h-16">
          <ArrowDown className="size-7" /> <span className="ml-1 font-semibold">Duck</span>
        </TouchButton>
      </div>
    </div>
  )
}
