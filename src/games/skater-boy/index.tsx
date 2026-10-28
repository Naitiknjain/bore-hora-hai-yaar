import { ArrowLeft, ArrowRight, ArrowUp, ChevronsRight, Gem, Heart, Lock, Play, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { CanvasStage, type CanvasHandle } from '../../components/game/CanvasStage'
import { Panel, PauseButton, PauseOverlay } from '../../components/game/GameShell'
import { HudStat } from '../../components/game/TouchControls'
import { Button } from '../../components/ui/Button'
import { Segmented } from '../../components/ui/Controls'
import { usePlayer } from '../../features/player/PlayerContext'
import { useSettings, vibrate } from '../../features/settings/SettingsContext'
import { useGameLoop, useKeyDown, useKeyUp, useVisibilityPause } from '../../hooks/useGameLoop'
import { loadProgress, recordLevel, syncProgress, type LevelProgress } from '../../lib/progress'
import { sfx } from '../../lib/sound'
import { readJSON, writeJSON } from '../../lib/storage'
import { drawScene, type Popup } from './art'
import { getLevel, levelScore, LIVES, start, step, TOTAL_LEVELS, WORLDS, worldOf, type Input, type LevelData, type SkaterState, type World } from './logic'

const W = 800
const H = 400
/** "READY?" pause before each run starts */
const READY_S = 1.1
/** blinking after a respawn */
const BLINK_S = 1.2

type Screen = 'map' | 'play' | 'done' | 'over'

/** gems found per level (best run), kept on this device */
const gemsKey = (player: string) => `skater-gems:${player}`
const loadGems = (player: string) => readJSON<Record<string, number>>(gemsKey(player), {})

const popupColor = (text: string) =>
  text.startsWith('GEM') ? '#4cf0ff' : text.startsWith('COMBO') ? '#ff7ad9' : text === 'CHECKPOINT' ? '#3ee08f' : text === 'GO!' ? '#ffffff' : / (GRIND|SLIDE) /.test(text) ? '#7fe3ff' : '#ffe27a'

const noInput = (): Input => ({ accelerate: false, jump: false, jumpHeld: false, trick: false, spin: false })

/** Round see-through buttons over the bottom corners of the screen, like the old phone games. */
function PadButton({ label, onPress, onRelease, className, children }: { label: string; onPress: () => void; onRelease: () => void; className: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`game-surface absolute bottom-[6%] flex size-[18%] max-h-24 max-w-24 min-h-14 min-w-14 items-center justify-center rounded-full border-2 border-white/40 bg-white/15 text-white shadow-[0_3px_0_0_rgba(0,0,0,0.35)] backdrop-blur-[2px] active:translate-y-[2px] active:bg-white/30 ${className}`}
      onPointerDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
        ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
        onPress()
      }}
      onPointerUp={onRelease}
      onPointerCancel={onRelease}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  )
}

export default function SkaterBoy() {
  const navigate = useNavigate()
  const { player } = usePlayer()
  const { showTouchControls } = useSettings()
  const playerKey = player?.id ?? 'anon'
  const [progress, setProgress] = useState<LevelProgress>(() => loadProgress(playerKey, 'skater-boy'))
  const [gemsFound, setGemsFound] = useState(() => loadGems(playerKey))
  const [screen, setScreen] = useState<Screen>('map')
  // open the map on the world of the next level to play
  const [world, setWorld] = useState<World>(() => worldOf(Math.min(TOTAL_LEVELS, Math.max(0, ...progress.completed) + 1)))
  const [levelNo, setLevelNo] = useState(1)
  const [paused, setPaused] = useState(false)
  const [final, setFinal] = useState<{ score: number; best: boolean; gems: number; lives: number; reason?: string } | null>(null)
  const level = useRef<LevelData>(getLevel(1))
  const sim = useRef<SkaterState>(start(level.current))
  const input = useRef<Input>(noInput())
  const stage = useRef<CanvasHandle>(null)
  const popups = useRef<Popup[]>([])
  const ready = useRef(READY_S)
  const blink = useRef(0)

  useEffect(() => {
    let alive = true
    void syncProgress(playerKey, 'skater-boy', Boolean(player?.registered)).then((p) => alive && setProgress(p))
    setGemsFound(loadGems(playerKey))
    return () => {
      alive = false
    }
  }, [playerKey, player?.registered])

  const completed = useMemo(() => new Set(progress.completed), [progress])
  const unlocked = Math.min(TOTAL_LEVELS, (progress.completed.length ? Math.max(...progress.completed) : 0) + 1)
  const totalGems = Object.values(gemsFound).reduce((a, b) => a + b, 0)

  function play(n: number) {
    level.current = getLevel(n)
    sim.current = start(level.current)
    input.current = noInput()
    popups.current = []
    ready.current = READY_S
    blink.current = 0
    setLevelNo(n)
    setWorld(level.current.world)
    setFinal(null)
    setPaused(false)
    setScreen('play')
  }

  const render = () => {
    const ctx = stage.current?.ctx()
    if (!ctx) return
    drawScene(
      ctx,
      { level: level.current, s: sim.current, levelNo, score: levelScore(sim.current), pushing: input.current.accelerate, blink: blink.current > 0, popups: popups.current, ready: ready.current },
      W,
      H,
    )
  }

  const addPopup = (text: string) => {
    popups.current = [...popups.current.slice(-3), { text, age: 0, color: popupColor(text) }]
  }

  useGameLoop((dt) => {
    for (const p of popups.current) p.age += dt
    popups.current = popups.current.filter((p) => p.age < 1.3)
    if (ready.current > 0) {
      ready.current = Math.max(0, ready.current - dt)
      input.current.jump = false
      input.current.trick = false
      input.current.spin = false
      if (ready.current === 0) addPopup('GO!')
      render()
      return
    }
    const before = sim.current
    if (before.status === 'finished' || before.status === 'crashed') return
    const s = step(level.current, before, input.current, dt)
    input.current.jump = false
    input.current.trick = false
    input.current.spin = false
    sim.current = s
    blink.current = Math.max(0, blink.current - dt)
    for (const e of s.events) addPopup(e)
    if (s.status === 'riding') {
      if (!before.grounded && s.grounded) sfx.hit()
      if ((before.grounded || before.grind) && !s.grounded && !s.grind && s.vy > 0) sfx.jump()
      if (s.coins.size !== before.coins.size) sfx.point()
      if (s.gems.size !== before.gems.size) sfx.match()
      if (!before.grind && s.grind) sfx.flip()
      if (s.events.some((e) => /\+\d+$/.test(e))) sfx.click()
      if (before.status === 'bailed') {
        blink.current = BLINK_S
        sfx.whoosh()
      }
    }
    if (before.status === 'riding' && s.status === 'bailed') {
      sfx.crash()
      vibrate(150)
    }
    render()
    if (s.status === 'crashed') {
      sfx.lose()
      setFinal({ score: levelScore(s), best: false, gems: s.gems.size, lives: 0, reason: s.crashReason })
      setScreen('over')
    } else if (s.status === 'finished') {
      sfx.win()
      const score = levelScore(s)
      const prev = progress.best[String(levelNo)] ?? 0
      const next = recordLevel(playerKey, 'skater-boy', levelNo, score)
      setProgress(next)
      void syncProgress(playerKey, 'skater-boy', Boolean(player?.registered)).then(setProgress)
      const gems = { ...loadGems(playerKey) }
      gems[levelNo] = Math.max(gems[levelNo] ?? 0, s.gems.size)
      writeJSON(gemsKey(playerKey), gems)
      setGemsFound(gems)
      setFinal({ score, best: score > prev, gems: s.gems.size, lives: s.lives })
      setScreen('done')
    }
  }, screen === 'play' && !paused)

  useEffect(() => {
    if (screen === 'play') render()
  })

  const press = {
    jump: () => {
      input.current.jump = true
      input.current.jumpHeld = true
    },
    jumpUp: () => (input.current.jumpHeld = false),
    trick: () => (input.current.trick = true),
    push: (v: boolean) => {
      // pressing push in the air spins
      if (v && !input.current.accelerate && !sim.current.grounded) input.current.spin = true
      input.current.accelerate = v
    },
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
        press.push(true)
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
    if (['ArrowRight', 'd', 'D'].includes(e.key)) press.push(false)
  }, screen === 'play')
  useVisibilityPause(() => {
    input.current = noInput()
    setPaused(true)
  }, screen === 'play')

  if (screen === 'map') {
    const w = WORLDS.find((x) => x.id === world)!
    return (
      <div className="mx-auto w-full max-w-3xl rounded-[2rem] border border-white/5 bg-ink-800 p-4 sm:p-6 short:p-3">
        <div className="flex flex-wrap items-end justify-between gap-3 short:gap-2">
          <div>
            <h2 className="font-display text-3xl font-extrabold short:text-2xl">🛹 Skater Boy</h2>
            <p className="text-sm text-ink-300 short:hidden">90 free levels. Ollie the gaps, grind the rails, find the 3 gems in every level.</p>
          </div>
          <Button size="lg" icon={<Play className="size-5" />} onClick={() => play(unlocked)}>
            Level {unlocked}
          </Button>
        </div>
        <ul className="mt-4 grid gap-1 rounded-2xl bg-ink-900/60 p-3 text-sm text-ink-300 sm:grid-cols-2 short:mt-2 short:p-2 short:text-xs">
          <li>⬆️ Jump (hold for height) · in the air: flip trick</li>
          <li>➡️ Push (hold) to speed up · in the air: 360 spin</li>
          <li>🛤️ Land on rails, benches and logs to grind them</li>
          <li>❤️ 3 lives - a bail sends you back to the last flag</li>
        </ul>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 short:mt-2">
          <Segmented<World> label="World" value={world} onChange={setWorld} options={WORLDS.map((x) => ({ value: x.id, label: x.name }))} />
          <span className="flex items-center gap-1 text-sm text-ink-300">
            <Gem className="size-4 text-[#4cf0ff]" /> {totalGems}/{TOTAL_LEVELS * 3}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-6 gap-2 sm:grid-cols-10 short:mt-2 short:grid-cols-15 short:gap-1">
          {Array.from({ length: w.to - w.from + 1 }, (_, i) => w.from + i).map((n) => {
            const done = completed.has(n)
            const locked = n > unlocked && !done
            const found = gemsFound[n] ?? 0
            return (
              <button
                key={n}
                type="button"
                disabled={locked}
                onClick={() => play(n)}
                aria-label={`Level ${n}${done ? `, completed, ${found} of 3 gems, best ${progress.best[String(n)] ?? 0}` : locked ? ', locked' : ''}`}
                className={`relative flex aspect-square flex-col items-center justify-center rounded-xl border-2 font-display text-lg font-bold short:aspect-auto short:h-10 short:rounded-lg short:text-sm ${
                  done ? 'border-santra/60 bg-santra/20 text-santra' : locked ? 'border-transparent bg-ink-900 text-ink-500' : 'border-white/10 bg-ink-700 text-ink-100 hover:bg-ink-600'
                }`}
              >
                {locked ? <Lock className="size-4" /> : n}
                {done && (
                  <span className="mt-0.5 flex gap-0.5" aria-hidden>
                    {[0, 1, 2].map((k) => (
                      <span key={k} className={`size-1.5 rotate-45 ${k < found ? 'bg-[#4cf0ff]' : 'bg-ink-900/70'}`} />
                    ))}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <p className="mt-3 text-center text-xs text-ink-400 short:mt-2">
          {progress.completed.length}/{TOTAL_LEVELS} levels · total best score {Object.values(progress.best).reduce((a, b) => a + b, 0).toLocaleString()}
        </p>
      </div>
    )
  }

  if (screen === 'done' || screen === 'over') {
    const ok = screen === 'done'
    return (
      <Panel className="max-w-md text-center animate-pop">
        <div className="text-6xl short:text-4xl" aria-hidden>
          {ok ? '🏁' : '💥'}
        </div>
        <h2 className="mt-2 text-3xl font-extrabold short:mt-1 short:text-2xl">{ok ? `Level ${levelNo} clear!` : 'Game over'}</h2>
        <p className="mt-1 text-ink-300">{ok ? (final?.best ? 'New personal best for this level' : 'Smooth ride') : `${final?.reason ?? 'Bail!'} - out of lives`}</p>
        <div className="mt-3 flex items-center justify-center gap-2" aria-label={`${final?.gems ?? 0} of 3 gems`}>
          {[0, 1, 2].map((k) => (
            <Gem key={k} className={`size-7 ${k < (final?.gems ?? 0) ? 'fill-[#4cf0ff]/40 text-[#4cf0ff]' : 'text-ink-600'}`} />
          ))}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-left short:mt-3">
          <HudStat label="Score" value={(final?.score ?? 0).toLocaleString()} />
          <HudStat label="Best" value={(progress.best[String(levelNo)] ?? 0).toLocaleString()} />
          <HudStat
            label="Lives"
            value={
              <span className="flex gap-0.5">
                {Array.from({ length: LIVES }, (_, k) => (
                  <Heart key={k} className={`size-4 ${k < (final?.lives ?? 0) ? 'fill-[#ff3b5c] text-[#ff3b5c]' : 'text-ink-600'}`} />
                ))}
              </span>
            }
          />
        </div>
        <div className="mt-6 grid gap-2 short:mt-3 short:grid-cols-3">
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
        <p className="mt-3 text-xs text-ink-400 short:mt-2">Progress {player?.registered ? 'syncs to your profile' : 'is saved on this device'}.</p>
      </Panel>
    )
  }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col">
      <CanvasStage
        ref={stage}
        width={W}
        height={H}
        maxHeight="78dvh"
        label={`Skater Boy level ${levelNo}`}
        onPointerDown={() => !showTouchControls && press.jump()}
        onPointerUp={() => press.jumpUp()}
      >
        <div className="absolute right-[1.5%] top-[2%]">
          <PauseButton onClick={() => setPaused(true)} />
        </div>
        {showTouchControls && !paused && (
          <>
            <PadButton label="Push (hold) - spin in the air" onPress={() => press.push(true)} onRelease={() => press.push(false)} className="left-[3%]">
              <ArrowRight className="size-1/2" strokeWidth={3} />
            </PadButton>
            <PadButton label="Jump (hold for height) - flip in the air" onPress={press.jump} onRelease={press.jumpUp} className="right-[3%]">
              <ArrowUp className="size-1/2" strokeWidth={3} />
            </PadButton>
          </>
        )}
        <PauseOverlay open={paused} onResume={() => setPaused(false)} onRestart={() => play(levelNo)} onHome={() => navigate('/games')}>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setScreen('map')}>
            Level map
          </Button>
        </PauseOverlay>
      </CanvasStage>
    </div>
  )
}
