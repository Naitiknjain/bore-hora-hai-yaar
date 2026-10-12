import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { CanvasStage, type CanvasHandle } from '../../components/game/CanvasStage'
import { PauseButton, PauseOverlay, ResultsScreen, StartScreen, useResultRecorder } from '../../components/game/GameShell'
import { Hud, HudStat } from '../../components/game/TouchControls'
import { usePlayer } from '../../features/player/PlayerContext'
import { vibrate } from '../../features/settings/SettingsContext'
import { useGameLoop, useKeyDown, useVisibilityPause } from '../../hooks/useGameLoop'
import { useResults } from '../../hooks/useResults'
import { createRng, randomSeed } from '../../lib/random'
import { sfx } from '../../lib/sound'
import type { StoredResult } from '../../types'
import { BIRD_R, BIRD_X, flap, GAP, GROUND, H, initial, PIPE_W, step, W, type FlappyState } from './logic'

type Phase = 'menu' | 'playing' | 'over'

export default function UdtaPanchi() {
  const navigate = useNavigate()
  const { player } = usePlayer()
  const results = useResults()
  const { beginRun, finishRun } = useResultRecorder()
  const rng = useRef(createRng(randomSeed()))
  const game = useRef<FlappyState>(initial())
  const stage = useRef<CanvasHandle>(null)
  const deathTimer = useRef(0)
  const ended = useRef(false)
  const [phase, setPhase] = useState<Phase>('menu')
  const [paused, setPaused] = useState(false)
  const [score, setScore] = useState(0)
  const [result, setResult] = useState<StoredResult | null>(null)

  const best = Math.max(0, ...results.filter((r) => r.gameId === 'flappy-style' && r.playerKey === player?.id).map((r) => r.metrics.score))

  function start() {
    game.current = initial()
    deathTimer.current = 0
    ended.current = false
    setScore(0)
    setResult(null)
    setPaused(false)
    setPhase('playing')
    beginRun('classic')
  }

  function doFlap() {
    if (phase !== 'playing' || paused || game.current.dead) return
    game.current = flap(game.current, rng.current)
    sfx.jump()
  }

  useGameLoop((dt) => {
    if (ended.current) return
    if (game.current.dead) {
      deathTimer.current += dt
      // let the bird fall to the ground briefly before results
      if (deathTimer.current > 0.7) {
        ended.current = true
        void finishRun({ board: 'classic', metrics: { score: game.current.score } }).then(setResult)
        setPhase('over')
        return
      }
      draw()
      return
    }
    const res = step(game.current, dt, rng.current)
    game.current = res.state
    if (res.scored) {
      sfx.point()
      setScore(res.state.score)
    }
    if (res.state.dead) {
      sfx.crash()
      vibrate(120)
    }
    draw()
  }, phase === 'playing' && !paused)

  function draw() {
    const ctx = stage.current?.ctx()
    if (!ctx) return
    const s = game.current
    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND)
    sky.addColorStop(0, '#1f7a8c')
    sky.addColorStop(1, '#ffb36b')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, W, H)
    // sun + distant skyline
    ctx.fillStyle = 'rgba(255,230,150,0.8)'
    ctx.beginPath()
    ctx.arc(270, 170, 40, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(30,40,70,0.35)'
    const off = (s.t * 20) % 120
    for (let i = -1; i < 5; i += 1) {
      const x = i * 120 - off
      ctx.fillRect(x + 10, GROUND - 90, 40, 90)
      ctx.beginPath()
      ctx.arc(x + 30, GROUND - 90, 20, Math.PI, 0)
      ctx.fill()
      ctx.fillRect(x + 70, GROUND - 60, 36, 60)
    }
    // pillars
    for (const p of s.pipes) {
      const top = p.gapY - GAP / 2
      const bottom = p.gapY + GAP / 2
      ctx.fillStyle = '#3ee08f'
      ctx.fillRect(p.x, 0, PIPE_W, top)
      ctx.fillRect(p.x, bottom, PIPE_W, GROUND - bottom)
      ctx.fillStyle = '#2bb673'
      ctx.fillRect(p.x + PIPE_W - 12, 0, 12, top)
      ctx.fillRect(p.x + PIPE_W - 12, bottom, 12, GROUND - bottom)
      ctx.fillStyle = '#ffd23f'
      ctx.fillRect(p.x - 6, top - 18, PIPE_W + 12, 18)
      ctx.fillRect(p.x - 6, bottom, PIPE_W + 12, 18)
    }
    // ground
    ctx.fillStyle = '#7a4b12'
    ctx.fillRect(0, GROUND, W, H - GROUND)
    ctx.fillStyle = '#ff8a3d'
    const g = (s.t * 155) % 24
    for (let x = -g; x < W; x += 24) ctx.fillRect(x, GROUND, 12, 10)
    // bird (an original round "panchi")
    const tilt = Math.max(-0.5, Math.min(1.1, s.vy / 600))
    ctx.save()
    ctx.translate(BIRD_X, s.y)
    ctx.rotate(tilt)
    ctx.fillStyle = '#ff5d8f'
    ctx.beginPath()
    ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffd23f'
    ctx.beginPath()
    ctx.ellipse(-4, 4 + Math.sin(s.t * 20) * 3, 9, 5, -0.3, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(6, -5, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#0b1020'
    ctx.beginPath()
    ctx.arc(7.5, -5, 2.3, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ff8a3d'
    ctx.beginPath()
    ctx.moveTo(BIRD_R - 2, -1)
    ctx.lineTo(BIRD_R + 9, 3)
    ctx.lineTo(BIRD_R - 2, 7)
    ctx.fill()
    ctx.restore()
    // score
    ctx.fillStyle = '#fff'
    ctx.strokeStyle = 'rgba(11,16,32,0.6)'
    ctx.lineWidth = 6
    ctx.font = '800 54px "Baloo 2", system-ui'
    ctx.textAlign = 'center'
    ctx.strokeText(String(s.score), W / 2, 90)
    ctx.fillText(String(s.score), W / 2, 90)
    if (!s.started) {
      ctx.font = '700 22px "Baloo 2", system-ui'
      ctx.strokeText('Tap / Space to flap', W / 2, H / 2 + 60)
      ctx.fillText('Tap / Space to flap', W / 2, H / 2 + 60)
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
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      if (!e.repeat) doFlap()
      return true
    }
    return false
  }, phase === 'playing')
  useVisibilityPause(() => setPaused(true), phase === 'playing')

  if (phase === 'menu') {
    return (
      <StartScreen
        onStart={start}
        instructions={
          <ul className="list-disc space-y-1 pl-5">
            <li>Tap, click, or press Space / ↑ to flap.</li>
            <li>Fly through the gaps between the pillars - each pillar passed is 1 point.</li>
            <li>Touching a pillar or the ground ends the run.</li>
          </ul>
        }
      />
    )
  }

  if (phase === 'over') {
    return (
      <ResultsScreen
        title={score > best ? 'Naya record! 🎉' : 'Dhadaam!'}
        emoji="🐦"
        result={result}
        onReplay={start}
        stats={
          <>
            <HudStat label="Score" value={game.current.score} />
            <HudStat label="Best" value={Math.max(best, game.current.score)} />
          </>
        }
      />
    )
  }

  return (
    <div className="mx-auto max-w-md">
      <Hud>
        <HudStat label="Score" value={score} accent="#ffd23f" />
        <HudStat label="Best" value={Math.max(best, score)} />
        <div className="ml-auto">
          <PauseButton onClick={() => setPaused(true)} />
        </div>
      </Hud>
      <CanvasStage ref={stage} width={W} height={H} maxHeight="74dvh" label={`Udta Panchi. Score ${score}`} onPointerDown={doFlap}>
        <PauseOverlay open={paused} onResume={() => setPaused(false)} onRestart={start} onHome={() => navigate('/games')} />
      </CanvasStage>
    </div>
  )
}
