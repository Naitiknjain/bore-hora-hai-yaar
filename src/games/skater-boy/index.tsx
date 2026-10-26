import { ArrowLeft, Check, ChevronsRight, Lock, Play, RotateCcw, Sparkles, ArrowUp } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { CanvasStage, type CanvasHandle } from '../../components/game/CanvasStage'
import { PauseButton, PauseOverlay } from '../../components/game/GameShell'
import { HudStat, TouchButton } from '../../components/game/TouchControls'
import { Button } from '../../components/ui/Button'
import { Segmented } from '../../components/ui/Controls'
import { usePlayer } from '../../features/player/PlayerContext'
import { useSettings, vibrate } from '../../features/settings/SettingsContext'
import { useGameLoop, useKeyDown, useKeyUp, useVisibilityPause } from '../../hooks/useGameLoop'
import { loadProgress, recordLevel, syncProgress, type LevelProgress } from '../../lib/progress'
import { sfx } from '../../lib/sound'
import { GROUND, getLevel, levelScore, PLAYER_H, start, step, TOTAL_LEVELS, WORLDS, type LevelData, type SkaterState, type World } from './logic'

const W = 800
const H = 400
const CAM_X = 220

type Screen = 'map' | 'play' | 'done' | 'crash'

const THEME: Record<World, { sky: [string, string]; far: string; near: string; ground: string; top: string }> = {
  town: { sky: ['#4cc9f0', '#bfe9ff'], far: '#7aa7c7', near: '#4d6f8f', ground: '#3a4050', top: '#9aa3c0' },
  forest: { sky: ['#7ed6a5', '#e3f7c8'], far: '#4f9a6a', near: '#2f6b47', ground: '#6b4a2a', top: '#3ee08f' },
  cemetery: { sky: ['#1b1440', '#4a2d6e'], far: '#2e2152', near: '#1a1233', ground: '#2b2440', top: '#7a6aa8' },
}

function drawScene(ctx: CanvasRenderingContext2D, level: LevelData, s: SkaterState) {
  const th = THEME[level.world]
  const cam = s.x - CAM_X
  const sky = ctx.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0, th.sky[0])
  sky.addColorStop(1, th.sky[1])
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, H)

  if (level.world === 'cemetery') {
    ctx.fillStyle = '#f6f1c9'
    ctx.beginPath()
    ctx.arc(640, 70, 34, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = th.sky[0]
    ctx.beginPath()
    ctx.arc(654, 62, 30, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    for (let i = 0; i < 4; i += 1) {
      const x = ((i * 260 - cam * 0.1) % (W + 200) + W + 200) % (W + 200) - 100
      ctx.beginPath()
      ctx.ellipse(x, 60 + (i % 2) * 30, 50, 14, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // parallax silhouettes
  const layer = (factor: number, color: string, baseY: number, draw: (x: number, i: number) => void, spacing: number) => {
    ctx.fillStyle = color
    const off = (cam * factor) % spacing
    for (let i = -1; i < W / spacing + 2; i += 1) draw(i * spacing - off, i + Math.floor((cam * factor) / spacing))
    void baseY
  }
  if (level.world === 'town') {
    layer(0.25, th.far, GROUND, (x, i) => {
      const hgt = 90 + ((i * 37) % 70)
      ctx.fillRect(x, GROUND - hgt, 70, hgt)
      ctx.fillStyle = 'rgba(255,240,180,0.5)'
      for (let wy = GROUND - hgt + 12; wy < GROUND - 14; wy += 22) for (let wx = x + 10; wx < x + 60; wx += 20) ctx.fillRect(wx, wy, 8, 10)
      ctx.fillStyle = th.far
    }, 110)
    layer(0.5, th.near, GROUND, (x) => {
      ctx.fillRect(x + 40, GROUND - 90, 5, 90)
      ctx.fillRect(x + 30, GROUND - 92, 26, 6)
    }, 220)
  } else if (level.world === 'forest') {
    layer(0.25, th.far, GROUND, (x, i) => {
      const hgt = 120 + ((i * 29) % 60)
      ctx.beginPath()
      ctx.moveTo(x, GROUND)
      ctx.lineTo(x + 40, GROUND - hgt)
      ctx.lineTo(x + 80, GROUND)
      ctx.fill()
    }, 70)
    layer(0.55, th.near, GROUND, (x, i) => {
      const hgt = 90 + ((i * 41) % 50)
      ctx.fillRect(x + 36, GROUND - 40, 10, 40)
      ctx.beginPath()
      ctx.arc(x + 41, GROUND - hgt + 30, 34, 0, Math.PI * 2)
      ctx.fill()
    }, 150)
  } else {
    layer(0.25, th.far, GROUND, (x, i) => {
      const hgt = 60 + ((i * 23) % 50)
      ctx.fillRect(x + 20, GROUND - hgt, 8, hgt)
      ctx.fillRect(x + 8, GROUND - hgt + 14, 32, 7)
    }, 120)
    layer(0.5, th.near, GROUND, (x) => {
      ctx.beginPath()
      ctx.moveTo(x, GROUND)
      ctx.quadraticCurveTo(x + 30, GROUND - 140, x + 10, GROUND - 160)
      ctx.lineTo(x + 18, GROUND - 160)
      ctx.quadraticCurveTo(x + 44, GROUND - 120, x + 30, GROUND)
      ctx.fill()
    }, 260)
  }

  // ground segments
  for (const g of level.segments) {
    const x0 = g.x0 - cam
    const x1 = g.x1 - cam
    if (x1 < -10 || x0 > W + 10) continue
    ctx.fillStyle = th.ground
    ctx.beginPath()
    ctx.moveTo(x0, H)
    ctx.lineTo(x0, GROUND - g.h0)
    ctx.lineTo(x1, GROUND - g.h1)
    ctx.lineTo(x1, H)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = th.top
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.moveTo(x0, GROUND - g.h0 + 2)
    ctx.lineTo(x1, GROUND - g.h1 + 2)
    ctx.stroke()
    if (g.h1 > g.h0) {
      ctx.fillStyle = '#ffd23f'
      ctx.fillRect(x1 - 6, GROUND - g.h1, 6, g.h1)
    }
  }

  // obstacles
  for (const o of level.obstacles) {
    const x = o.x - cam
    if (x + o.w < -10 || x > W + 10) continue
    const base = GROUND - (level.segments.find((g) => o.x + o.w / 2 >= g.x0 && o.x + o.w / 2 <= g.x1)?.h0 ?? 0)
    const y = base - o.h
    switch (o.kind) {
      case 'cone':
        ctx.fillStyle = '#ff8a3d'
        ctx.beginPath()
        ctx.moveTo(x, base)
        ctx.lineTo(x + o.w / 2, y)
        ctx.lineTo(x + o.w, base)
        ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.fillRect(x + 6, base - o.h * 0.5, o.w - 12, 4)
        break
      case 'bin':
        ctx.fillStyle = '#3ee08f'
        ctx.fillRect(x, y + 4, o.w, o.h - 4)
        ctx.fillStyle = '#2bb673'
        ctx.fillRect(x - 2, y, o.w + 4, 6)
        break
      case 'bench':
        ctx.fillStyle = '#a0522d'
        ctx.fillRect(x, y, o.w, 8)
        ctx.fillRect(x + 4, y, 5, o.h)
        ctx.fillRect(x + o.w - 9, y, 5, o.h)
        break
      case 'log':
        ctx.fillStyle = '#8b5a2b'
        ctx.beginPath()
        ctx.roundRect(x, y, o.w, o.h, 12)
        ctx.fill()
        ctx.fillStyle = '#d9a066'
        ctx.beginPath()
        ctx.ellipse(x + o.w - 6, y + o.h / 2, 6, o.h / 2 - 2, 0, 0, Math.PI * 2)
        ctx.fill()
        break
      case 'rock':
        ctx.fillStyle = '#7d8597'
        ctx.beginPath()
        ctx.ellipse(x + o.w / 2, base - o.h / 2, o.w / 2, o.h / 2, 0, 0, Math.PI * 2)
        ctx.fill()
        break
      case 'stump':
        ctx.fillStyle = '#6b4a2a'
        ctx.fillRect(x, y, o.w, o.h)
        ctx.fillStyle = '#d9a066'
        ctx.fillRect(x, y, o.w, 6)
        break
      case 'tomb':
        ctx.fillStyle = '#9aa3c0'
        ctx.beginPath()
        ctx.roundRect(x, y, o.w, o.h, [14, 14, 2, 2])
        ctx.fill()
        ctx.fillStyle = '#5b6380'
        ctx.fillRect(x + o.w / 2 - 2, y + 8, 4, 16)
        ctx.fillRect(x + o.w / 2 - 7, y + 13, 14, 4)
        break
      case 'coffin':
        ctx.fillStyle = '#5a3a2a'
        ctx.beginPath()
        ctx.moveTo(x, base)
        ctx.lineTo(x + 8, y)
        ctx.lineTo(x + o.w - 8, y)
        ctx.lineTo(x + o.w, base)
        ctx.fill()
        break
      case 'pumpkin':
        ctx.fillStyle = '#ff8a3d'
        ctx.beginPath()
        ctx.ellipse(x + o.w / 2, base - o.h / 2, o.w / 2, o.h / 2, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#1a1233'
        ctx.fillRect(x + 8, base - o.h * 0.6, 4, 4)
        ctx.fillRect(x + o.w - 12, base - o.h * 0.6, 4, 4)
        break
    }
  }

  // coins
  level.coins.forEach((c, i) => {
    if (s.coins.has(i)) return
    const x = c.x - cam
    if (x < -20 || x > W + 20) return
    ctx.fillStyle = '#ffd23f'
    ctx.beginPath()
    ctx.ellipse(x, GROUND - c.h, 8 * Math.abs(Math.cos(s.t * 4 + i)) + 2, 9, 0, 0, Math.PI * 2)
    ctx.fill()
  })

  // finish flag
  const fx = level.length - cam
  if (fx > -40 && fx < W + 40) {
    ctx.fillStyle = '#eef0f8'
    ctx.fillRect(fx, GROUND - 120, 5, 120)
    for (let r = 0; r < 3; r += 1)
      for (let c = 0; c < 4; c += 1) {
        ctx.fillStyle = (r + c) % 2 ? '#0b1020' : '#fff'
        ctx.fillRect(fx + 5 + c * 10, GROUND - 120 + r * 10, 10, 10)
      }
  }

  // skater (original cartoon)
  const px = CAM_X
  const py = GROUND - s.h
  ctx.save()
  ctx.translate(px, py)
  if (s.status === 'crashed') ctx.rotate(1.2)
  // board (spins during tricks)
  ctx.save()
  ctx.translate(0, -5)
  ctx.scale(1, Math.cos(s.rotation))
  ctx.fillStyle = '#ff5d8f'
  ctx.beginPath()
  ctx.roundRect(-22, -3, 44, 6, 3)
  ctx.fill()
  ctx.restore()
  ctx.fillStyle = '#1c2540'
  ctx.beginPath()
  ctx.arc(-14, 0, 4, 0, Math.PI * 2)
  ctx.arc(14, 0, 4, 0, Math.PI * 2)
  ctx.fill()
  // legs, body, head
  const crouch = s.grounded ? 0 : 6
  ctx.strokeStyle = '#283353'
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-8, -9)
  ctx.lineTo(-4, -24 + crouch)
  ctx.moveTo(8, -9)
  ctx.lineTo(4, -24 + crouch)
  ctx.stroke()
  ctx.fillStyle = '#ff8a3d'
  ctx.beginPath()
  ctx.roundRect(-10, -PLAYER_H + 8 + crouch, 20, 22, 6)
  ctx.fill()
  ctx.strokeStyle = '#f2c094'
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(-8, -PLAYER_H + 14 + crouch)
  ctx.lineTo(-20, -PLAYER_H + 22 + crouch - (s.grounded ? 0 : 10))
  ctx.moveTo(8, -PLAYER_H + 14 + crouch)
  ctx.lineTo(20, -PLAYER_H + 22 + crouch - (s.grounded ? 0 : 10))
  ctx.stroke()
  ctx.fillStyle = '#f2c094'
  ctx.beginPath()
  ctx.arc(0, -PLAYER_H + 1 + crouch, 9, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#4cc9f0'
  ctx.beginPath()
  ctx.arc(0, -PLAYER_H - 1 + crouch, 9, Math.PI, 0)
  ctx.fill()
  ctx.fillRect(0, -PLAYER_H - 3 + crouch, 14, 4)
  ctx.restore()

  // progress bar
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.fillRect(20, 16, W - 40, 6)
  ctx.fillStyle = '#ffd23f'
  ctx.fillRect(20, 16, (W - 40) * Math.min(1, s.x / level.length), 6)
}

export default function SkaterBoy() {
  const navigate = useNavigate()
  const { player } = usePlayer()
  const { showTouchControls } = useSettings()
  const playerKey = player?.id ?? 'anon'
  const [progress, setProgress] = useState<LevelProgress>(() => loadProgress(playerKey, 'skater-boy'))
  const [screen, setScreen] = useState<Screen>('map')
  const [world, setWorld] = useState<World>('town')
  const [levelNo, setLevelNo] = useState(1)
  const [paused, setPaused] = useState(false)
  const [hud, setHud] = useState({ score: 0, coins: 0, msg: '' })
  const [final, setFinal] = useState<{ score: number; best: boolean; reason?: string } | null>(null)
  const level = useRef<LevelData>(getLevel(1))
  const sim = useRef<SkaterState>(start(level.current))
  const input = useRef({ accelerate: false, jump: false, jumpHeld: false, trick: false })
  const stage = useRef<CanvasHandle>(null)
  const msgTimer = useRef(0)

  useEffect(() => {
    let alive = true
    void syncProgress(playerKey, 'skater-boy', Boolean(player?.registered)).then((p) => alive && setProgress(p))
    return () => {
      alive = false
    }
  }, [playerKey, player?.registered])

  const completed = useMemo(() => new Set(progress.completed), [progress])
  const unlocked = Math.min(TOTAL_LEVELS, (progress.completed.length ? Math.max(...progress.completed) : 0) + 1)

  function play(n: number) {
    level.current = getLevel(n)
    sim.current = start(level.current)
    input.current = { accelerate: false, jump: false, jumpHeld: false, trick: false }
    setLevelNo(n)
    setWorld(level.current.world)
    setHud({ score: 0, coins: 0, msg: '' })
    setFinal(null)
    setPaused(false)
    setScreen('play')
  }

  useGameLoop((dt) => {
    const before = sim.current
    if (before.status !== 'riding') return
    const s = step(level.current, before, input.current, dt)
    input.current.jump = false
    input.current.trick = false
    sim.current = s
    if (!before.grounded && s.grounded) sfx.hit()
    if (before.grounded && !s.grounded && s.vy > 0) sfx.jump()
    if (s.coins.size !== before.coins.size) sfx.point()
    if (s.lastMessage) {
      msgTimer.current = 1.2
      sfx.match()
    }
    msgTimer.current = Math.max(0, msgTimer.current - dt)
    const score = levelScore(s)
    setHud((h) => (h.score === score && h.coins === s.coins.size && (s.lastMessage ? h.msg === s.lastMessage : msgTimer.current > 0 || !h.msg) ? h : { score, coins: s.coins.size, msg: s.lastMessage ?? (msgTimer.current > 0 ? h.msg : '') }))
    const ctx = stage.current?.ctx()
    if (ctx) drawScene(ctx, level.current, s)
    if (s.status === 'crashed') {
      sfx.crash()
      vibrate(150)
      setFinal({ score, best: false, reason: s.crashReason })
      setScreen('crash')
    } else if (s.status === 'finished') {
      sfx.win()
      const prev = progress.best[String(levelNo)] ?? 0
      const next = recordLevel(playerKey, 'skater-boy', levelNo, score)
      setProgress(next)
      void syncProgress(playerKey, 'skater-boy', Boolean(player?.registered)).then(setProgress)
      setFinal({ score, best: score > prev })
      setScreen('done')
    }
  }, screen === 'play' && !paused)

  useEffect(() => {
    if (screen === 'play') {
      const ctx = stage.current?.ctx()
      if (ctx) drawScene(ctx, level.current, sim.current)
    }
  })

  const press = {
    jump: () => {
      input.current.jump = true
      input.current.jumpHeld = true
    },
    jumpUp: () => (input.current.jumpHeld = false),
    trick: () => (input.current.trick = true),
    boost: (v: boolean) => (input.current.accelerate = v),
  }

  useKeyDown((e) => {
    if (screen !== 'play') return false
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      setPaused((p) => !p)
      return true
    }
    if (e.repeat) return [' ', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(e.key)
    switch (e.key) {
      case ' ':
      case 'ArrowUp':
      case 'w':
      case 'W':
        press.jump()
        return true
      case 'ArrowRight':
      case 'd':
      case 'D':
        press.boost(true)
        return true
      case 'x':
      case 'X':
      case 'k':
      case 'K':
      case 'ArrowDown':
        press.trick()
        return true
    }
    return false
  }, screen === 'play')
  useKeyUp((e) => {
    if ([' ', 'ArrowUp', 'w', 'W'].includes(e.key)) press.jumpUp()
    if (['ArrowRight', 'd', 'D'].includes(e.key)) press.boost(false)
  }, screen === 'play')
  useVisibilityPause(() => {
    input.current = { accelerate: false, jump: false, jumpHeld: false, trick: false }
    setPaused(true)
  }, screen === 'play')

  if (screen === 'map') {
    const w = WORLDS.find((x) => x.id === world)!
    return (
      <div className="mx-auto max-w-3xl rounded-[2rem] border border-white/5 bg-ink-800 p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-3xl font-extrabold">🛹 Skater Boy</h2>
            <p className="text-sm text-ink-300">90 original levels inspired by the classic skateboard runner. Land clean, pull tricks, reach the flag.</p>
          </div>
          <Button size="lg" icon={<Play className="size-5" />} onClick={() => play(unlocked)}>
            Level {unlocked}
          </Button>
        </div>
        <ul className="mt-4 grid gap-1 rounded-2xl bg-ink-900/60 p-3 text-sm text-ink-300 sm:grid-cols-2">
          <li>⬆️ Space / ↑ / Jump - ollie (hold for height)</li>
          <li>➡️ → / D / Boost (hold) - go faster for long gaps</li>
          <li>✨ X / ↓ / Trick (in the air) - kickflip for points</li>
          <li>⚠️ Landing mid-trick, hitting obstacles or gaps = crash</li>
        </ul>
        <div className="mt-4">
          <Segmented<World> label="World" value={world} onChange={setWorld} options={WORLDS.map((x) => ({ value: x.id, label: x.name }))} />
        </div>
        <div className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-10">
          {Array.from({ length: w.to - w.from + 1 }, (_, i) => w.from + i).map((n) => {
            const done = completed.has(n)
            const locked = n > unlocked && !done
            return (
              <button
                key={n}
                type="button"
                disabled={locked}
                onClick={() => play(n)}
                aria-label={`Level ${n}${done ? `, completed, best ${progress.best[String(n)] ?? 0}` : locked ? ', locked' : ''}`}
                className={`relative flex aspect-square items-center justify-center rounded-xl font-display text-lg font-bold ${
                  done ? 'bg-santra/25 text-santra' : locked ? 'bg-ink-900 text-ink-500' : 'bg-ink-700 text-ink-100 hover:bg-ink-600'
                }`}
              >
                {locked ? <Lock className="size-4" /> : n}
                {done && <Check className="absolute right-1 top-1 size-3" />}
              </button>
            )
          })}
        </div>
        <p className="mt-3 text-center text-xs text-ink-400">
          {progress.completed.length}/{TOTAL_LEVELS} levels · total best score {Object.values(progress.best).reduce((a, b) => a + b, 0).toLocaleString()}
        </p>
      </div>
    )
  }

  if (screen === 'done' || screen === 'crash') {
    const ok = screen === 'done'
    return (
      <div className="mx-auto max-w-md rounded-3xl border border-white/5 bg-ink-800 p-6 text-center animate-pop">
        <div className="text-6xl" aria-hidden>
          {ok ? '🏁' : '🤕'}
        </div>
        <h2 className="mt-2 text-3xl font-extrabold">{ok ? `Level ${levelNo} complete!` : 'Bail!'}</h2>
        <p className="mt-1 text-ink-300">{ok ? (final?.best ? 'New personal best for this level' : 'Smooth ride') : final?.reason}</p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-left">
          <HudStat label="Score" value={(final?.score ?? 0).toLocaleString()} />
          <HudStat label="Best" value={(progress.best[String(levelNo)] ?? 0).toLocaleString()} />
        </div>
        <div className="mt-6 grid gap-2">
          {ok && levelNo < TOTAL_LEVELS && (
            <Button onClick={() => play(levelNo + 1)} data-autofocus icon={<ChevronsRight className="size-5" />}>
              Next level
            </Button>
          )}
          <Button variant={ok ? 'secondary' : 'primary'} onClick={() => play(levelNo)} icon={<RotateCcw className="size-5" />} data-autofocus={!ok || undefined}>
            {ok ? 'Replay' : 'Retry'}
          </Button>
          <Button variant="ghost" onClick={() => setScreen('map')} icon={<ArrowLeft className="size-4" />}>
            Level map
          </Button>
        </div>
        <p className="mt-3 text-xs text-ink-400">Progress {player?.registered ? 'syncs to your profile' : 'is saved on this device'}.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col short:max-w-none short:flex-row short:items-center">
      <div className="mb-2 flex shrink-0 flex-wrap items-center gap-2 short:order-last short:mb-0 short:ml-3 short:w-28 short:flex-col short:flex-nowrap short:items-stretch short:self-start">
        <HudStat label={WORLDS.find((x) => x.id === world)!.name} value={`Lv ${levelNo}`} />
        <HudStat label="Score" value={hud.score.toLocaleString()} accent="#ff8a3d" />
        <HudStat label="Coins" value={hud.coins} accent="#ffd23f" />
        <span className="min-w-0 flex-1 truncate text-center font-display text-lg font-bold text-masala" aria-live="polite">
          {hud.msg}
        </span>
        <PauseButton onClick={() => setPaused(true)} />
      </div>
      <CanvasStage
        ref={stage}
        width={W}
        height={H}
        maxHeight={showTouchControls ? '50dvh' : '70dvh'}
        label={`Skater Boy level ${levelNo}`}
        onPointerDown={() => !showTouchControls && press.jump()}
        onPointerUp={() => press.jumpUp()}
      >
        <PauseOverlay open={paused} onResume={() => setPaused(false)} onRestart={() => play(levelNo)} onHome={() => navigate('/games')}>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setScreen('map')}>
            Level map
          </Button>
        </PauseOverlay>
      </CanvasStage>
      {showTouchControls && (
        <div className="mx-auto mt-3 grid w-full max-w-lg shrink-0 grid-cols-3 gap-3 short:order-first short:mx-0 short:mr-3 short:mt-0 short:w-24 short:grid-cols-1">
          <TouchButton label="Boost (hold)" onPress={() => press.boost(true)} onRelease={() => press.boost(false)} className="min-h-16">
            <ChevronsRight className="size-7" />
          </TouchButton>
          <TouchButton label="Trick" onPress={press.trick} className="min-h-16">
            <Sparkles className="size-7" />
          </TouchButton>
          <TouchButton label="Jump (hold for height)" onPress={press.jump} onRelease={press.jumpUp} className="min-h-16 !bg-santra !text-ink-950">
            <ArrowUp className="size-7" />
          </TouchButton>
        </div>
      )}
    </div>
  )
}
