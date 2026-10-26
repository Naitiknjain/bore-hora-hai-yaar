import { ArrowLeft, Check, Clock, Compass, Grid3x3, Heart, Lightbulb, Lock, Palette, Play, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Button } from '../../components/ui/Button'
import { usePlayer } from '../../features/player/PlayerContext'
import { useSettings, vibrate } from '../../features/settings/SettingsContext'
import { useVisibilityPause } from '../../hooks/useGameLoop'
import { useStopwatch } from '../../hooks/useStopwatch'
import { loadProgress, recordLevel, syncProgress, type LevelProgress } from '../../lib/progress'
import { formatDuration } from '../../lib/scoring'
import { sfx } from '../../lib/sound'
import { blocker, exitRay, getLevel, headDir, HEARTS, removableArrows, TOTAL_LEVELS, type Arrow, type Dir, type Level } from './logic'

const HINTS_PER_LEVEL = 3
const SLIDE: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }

type Screen = 'levels' | 'playing'

type ArrowState = 'idle' | 'leaving' | 'bump' | 'blocker' | 'hint'
export type ArrowTheme = 'paper' | 'neon'

/** Colours for the two board themes: "paper" (eye comfort, like a printed puzzle) and "neon". */
const THEMES: Record<ArrowTheme, { board: string; dot: string; ink: (a: Arrow) => string; blocked: string; width: number }> = {
  paper: { board: '#f4ecdc', dot: '#e3d6bd', ink: () => '#5c4433', blocked: '#e63946', width: 0.12 },
  neon: { board: '#070b16', dot: '#1c2540', ink: (a) => a.color, blocked: '#ff4d5e', width: 0.14 },
}

const LEAVE_V0 = 7 // cells per second when the arrow starts moving
const LEAVE_ACC = 55 // cells per second^2: it speeds up as it slides out, like the reference
const BUMP_MS = 320

/** Point at distance s along a polyline. */
function pointAt(pts: [number, number][], s: number): [number, number] {
  let rest = Math.max(0, s)
  for (let i = 1; i < pts.length; i += 1) {
    const [x0, y0] = pts[i - 1]
    const [x1, y1] = pts[i]
    const len = Math.hypot(x1 - x0, y1 - y0)
    if (rest <= len) return [x0 + ((x1 - x0) * rest) / len, y0 + ((y1 - y0) * rest) / len]
    rest -= len
  }
  return pts[pts.length - 1]
}

/**
 * Drives how far (in cells) an arrow has travelled along its own path: forward and out when leaving,
 * forward to the blocker and back for a blocked tap.
 */
function useTravel(state: ArrowState, total: number, bumpBy: number, reduced: boolean, onDone: () => void) {
  const [t, setT] = useState(0)
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => {
    if (state !== 'leaving' && state !== 'bump') return
    if (reduced) {
      if (state === 'leaving') {
        const id = window.setTimeout(() => done.current(), 120)
        return () => window.clearTimeout(id)
      }
      return
    }
    let raf = 0
    let start = 0
    const step = (now: number) => {
      if (!start) start = now
      const sec = (now - start) / 1000
      if (state === 'leaving') {
        const d = LEAVE_V0 * sec + 0.5 * LEAVE_ACC * sec * sec
        if (d >= total) {
          setT(total)
          done.current()
          return
        }
        setT(d)
      } else {
        const f = (now - start) / BUMP_MS
        if (f >= 1) {
          setT(0)
          return
        }
        setT(bumpBy * Math.sin(Math.PI * f))
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(raf)
      if (state === 'bump') setT(0)
    }
  }, [state, total, bumpBy, reduced])
  return t
}

interface ArrowShapeProps {
  a: Arrow
  state: ArrowState
  /** cells the arrow can move before touching whatever blocks it (for the bump animation) */
  bumpBy: number
  onTap: () => void
  onGone: () => void
  guide: boolean
  w: number
  h: number
  theme: ArrowTheme
  reduced: boolean
}

function ArrowShape({ a, state, bumpBy, onTap, onGone, guide, w, h, theme, reduced }: ArrowShapeProps) {
  const T = THEMES[theme]
  const centers = a.cells.map((c): [number, number] => [c.x + 0.5, c.y + 0.5])
  const dir = headDir(a)
  const [dx, dy] = SLIDE[dir]
  const [hx, hy] = centers[centers.length - 1]
  const bodyLen = centers.length - 1
  const ray = exitRay(a, w, h)
  // distance until the whole arrow (head first, tail last) has left the board
  const total = ray.length + 1 + bodyLen + 0.6
  const t = useTravel(state, total, bumpBy, reduced, onGone)
  // the arrow travels along its own path, then straight on: draw that path and show a dash of the body's length
  const path = [...centers, [hx + dx * (total + 1), hy + dy * (total + 1)] as [number, number]]
  const pts = path.map((p) => p.join(',')).join(' ')
  const moving = t > 0
  const headX = hx + dx * t
  const headY = hy + dy * t
  const tip = [headX + dx * 0.36, headY + dy * 0.36]
  const l = [headX - dy * 0.24, headY + dx * 0.24]
  const r = [headX + dy * 0.24, headY - dx * 0.24]
  const [tx, ty] = pointAt(path, t)
  const color = state === 'blocker' ? T.blocked : T.ink(a)
  const bodyPts = centers.map((p) => p.join(',')).join(' ')
  const fading = reduced && state === 'leaving'
  return (
    <g className={reduced && state === 'bump' ? 'animate-shake' : ''} style={{ opacity: fading ? 0 : 1, transition: fading ? 'opacity 0.12s' : undefined }}>
      {guide && state !== 'leaving' && ray.length > 0 && (
        <line x1={hx} y1={hy} x2={hx + dx * (ray.length + 0.5)} y2={hy + dy * (ray.length + 0.5)} stroke={color} strokeWidth={0.05} strokeDasharray="0.12 0.14" opacity={0.5} />
      )}
      {state === 'hint' && <polyline points={bodyPts} fill="none" stroke={theme === 'paper' ? '#f4a261' : a.color} strokeWidth={0.55} strokeLinecap="round" strokeLinejoin="round" opacity={0.45} className="motion-safe:animate-pulse" />}
      <polyline
        points={moving ? pts : bodyPts}
        fill="none"
        stroke={color}
        strokeWidth={T.width}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={moving ? `${bodyLen} ${bodyLen + total + 4}` : undefined}
        strokeDashoffset={moving ? -t : undefined}
        style={theme === 'neon' ? { filter: `drop-shadow(0 0 0.12px ${color})` } : undefined}
      />
      <polygon points={`${tip.join(',')} ${l.join(',')} ${r.join(',')}`} fill={color} />
      <circle cx={moving ? tx : centers[0][0]} cy={moving ? ty : centers[0][1]} r={0.07} fill={color} />
      {/* generous invisible hit area */}
      <polyline
        points={bodyPts}
        fill="none"
        stroke="transparent"
        strokeWidth={0.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ pointerEvents: state === 'leaving' ? 'none' : 'stroke', cursor: 'pointer' }}
        onClick={onTap}
        role="button"
        aria-label={`Arrow pointing ${dir}`}
      />
    </g>
  )
}

/** How far an arrow can move before it touches the first cell that blocks it (0 if the blocker is right in front). */
function bumpDistance(a: Arrow, arrows: Arrow[], w: number, h: number) {
  const taken = new Set<string>()
  for (const o of arrows) for (const c of o.cells) taken.add(`${c.x},${c.y}`)
  const ray = exitRay(a, w, h)
  const i = ray.findIndex((c) => taken.has(`${c.x},${c.y}`))
  return Math.max(0.25, (i < 0 ? ray.length : i) + 0.3)
}

const THEME_KEY = 'bhhy:arrowgo:theme'
function loadTheme(): ArrowTheme {
  try {
    return localStorage.getItem(THEME_KEY) === 'neon' ? 'neon' : 'paper'
  } catch {
    return 'paper'
  }
}

export default function ArrowGo() {
  const { player } = usePlayer()
  const playerKey = player?.id ?? 'anon'
  const [progress, setProgress] = useState<LevelProgress>(() => loadProgress(playerKey, 'arrow-go'))
  const [screen, setScreen] = useState<Screen>('levels')
  const [levelNo, setLevelNo] = useState(1)
  const [level, setLevel] = useState<Level | null>(null)
  const [arrows, setArrows] = useState<Arrow[]>([])
  const [leaving, setLeaving] = useState<Set<number>>(new Set())
  const [bump, setBump] = useState<{ id: number; by: number } | null>(null)
  const [theme, setTheme] = useState<ArrowTheme>(loadTheme)
  const { prefersReducedMotion } = useSettings()
  const [blockerId, setBlockerId] = useState<number | null>(null)
  const [hintId, setHintId] = useState<number | null>(null)
  const [hearts, setHearts] = useState(HEARTS)
  const [hints, setHints] = useState(HINTS_PER_LEVEL)
  const [guide, setGuide] = useState(false)
  const [status, setStatus] = useState<'play' | 'won' | 'failed'>('play')
  const watch = useStopwatch()
  const timers = useRef<number[]>([])

  useEffect(() => {
    let alive = true
    void syncProgress(playerKey, 'arrow-go', Boolean(player?.registered)).then((p) => alive && setProgress(p))
    return () => {
      alive = false
    }
  }, [playerKey, player?.registered])

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms))

  const completed = useMemo(() => new Set(progress.completed), [progress])
  const unlockedUpTo = Math.min(TOTAL_LEVELS, (progress.completed.length ? Math.max(...progress.completed) : 0) + 1)

  function open(n: number) {
    const l = getLevel(n)
    setLevelNo(n)
    setLevel(l)
    setArrows(l.arrows)
    setLeaving(new Set())
    setHearts(HEARTS)
    setHints(HINTS_PER_LEVEL)
    setHintId(null)
    setBlockerId(null)
    setStatus('play')
    watch.reset()
    watch.start()
    setScreen('playing')
  }

  useVisibilityPause(() => watch.pause(), screen === 'playing' && status === 'play')
  // the level is won once the last arrow has finished sliding off the board
  useEffect(() => {
    if (screen !== 'playing' || status !== 'play' || !level || arrows.length) return
    const id = window.setTimeout(() => setStatus('won'), 300)
    return () => window.clearTimeout(id)
  }, [screen, status, level, arrows.length])
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && screen === 'playing' && status === 'play') watch.start()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [screen, status, watch])

  const live = arrows.filter((a) => !leaving.has(a.id))
  const holes = useMemo(() => {
    if (!level) return new Set<string>()
    const filled = new Set(level.arrows.flatMap((a) => a.cells.map((c) => `${c.x},${c.y}`)))
    return new Set(level.mask.map((c) => `${c.x},${c.y}`).filter((k) => !filled.has(k)))
  }, [level])

  function tap(a: Arrow) {
    if (!level || status !== 'play' || leaving.has(a.id)) return
    const b = blocker(a, live, level.width, level.height)
    if (b === null) {
      sfx.whoosh()
      const nextLeaving = new Set(leaving).add(a.id)
      setLeaving(nextLeaving)
      setHintId(null)
      if (live.length === 1) {
        watch.pause()
        sfx.win()
        const next = recordLevel(playerKey, 'arrow-go', level.number, hearts)
        setProgress(next)
        void syncProgress(playerKey, 'arrow-go', Boolean(player?.registered)).then(setProgress)
      }
    } else {
      sfx.miss()
      vibrate(60)
      setBump({ id: a.id, by: bumpDistance(a, live, level.width, level.height) })
      setBlockerId(b === a.id ? null : b)
      later(() => {
        setBump(null)
        setBlockerId(null)
      }, 450)
      const left = hearts - 1
      setHearts(left)
      if (left <= 0) {
        watch.pause()
        sfx.lose()
        later(() => setStatus('failed'), 400)
      }
    }
  }

  function hint() {
    if (!level || hints <= 0 || status !== 'play') return
    const free = removableArrows(live, level.width, level.height)
    if (!free.length) return
    setHints((h) => h - 1)
    setHintId(free[0].id)
    sfx.click()
  }

  if (screen === 'levels') {
    return (
      <div className="mx-auto max-w-3xl rounded-[2rem] bg-[#070b16] p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-3xl font-extrabold text-[#3ee08f]">Arrow Go</h2>
            <p className="text-sm text-ink-300">Tap an arrow to slide it out. Only arrows with a clear lane can leave.</p>
          </div>
          <Button size="lg" icon={<Play className="size-5" />} onClick={() => open(Math.min(unlockedUpTo, TOTAL_LEVELS))}>
            Level {unlockedUpTo}
          </Button>
        </div>
        <ul className="mt-4 space-y-1 rounded-2xl bg-white/[0.03] p-3 text-sm text-ink-300">
          <li>• Every level hides a picture made of arrows - clear them all to reveal it.</li>
          <li>• An arrow slides along its own path and out the way its head points, so its lane to the edge must be clear.</li>
          <li>• Any other arrow in that lane blocks it. Blocked taps cost a ❤️ (3 per level).</li>
          <li>• Guidance shows every lane; hints light up an arrow that can leave right now.</li>
        </ul>
        <div className="mt-5 grid grid-cols-5 gap-2 sm:grid-cols-8 md:grid-cols-10">
          {Array.from({ length: TOTAL_LEVELS }, (_, i) => i + 1).map((n) => {
            const done = completed.has(n)
            const locked = n > unlockedUpTo && !done
            return (
              <button
                key={n}
                type="button"
                disabled={locked}
                onClick={() => open(n)}
                aria-label={`Level ${n}${done ? ', completed' : locked ? ', locked' : ''}`}
                className={`relative flex aspect-square items-center justify-center rounded-xl font-display text-lg font-bold transition ${
                  done ? 'bg-[#3ee08f]/20 text-[#3ee08f]' : locked ? 'bg-white/[0.03] text-ink-500' : 'bg-white/[0.07] text-ink-100 hover:bg-white/[0.12]'
                }`}
              >
                {locked ? <Lock className="size-4" /> : n}
                {done && <Check className="absolute right-1 top-1 size-3" />}
              </button>
            )
          })}
        </div>
        <p className="mt-4 text-center text-xs text-ink-500">
          {progress.completed.length}/{TOTAL_LEVELS} completed · progress {player?.registered ? 'syncs across your devices' : 'is saved on this device'}
        </p>
      </div>
    )
  }

  if (!level) return null
  const pad = 0.4
  const paper = theme === 'paper'
  const T = THEMES[theme]
  // picture cells still covered by an arrow; everything else is revealed in the picture's colour
  const covered = new Set<string>()
  for (const a of live) for (const c of a.cells) covered.add(`${c.x},${c.y}`)
  // the odd picture cell no arrow could fill stays hidden until the end, so it doesn't give the picture away
  if (status !== 'won') for (const k of holes) covered.add(k)
  const btn = `inline-flex size-10 items-center justify-center rounded-xl ${paper ? 'bg-[#5c4433]/10 text-[#5c4433] hover:bg-[#5c4433]/15' : 'bg-white/[0.06] text-ink-200 hover:bg-white/10'}`
  const switchTheme = () => {
    const next = paper ? 'neon' : 'paper'
    setTheme(next)
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {
      /* private mode: theme just isn't remembered */
    }
  }

  return (
    <div
      className={`mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col rounded-[2rem] p-3 sm:p-5 short:p-2 ${paper ? 'text-[#5c4433]' : 'text-ink-100'}`}
      style={{ background: T.board }}
    >
      {/* compact status header like the reference */}
      <div className="flex shrink-0 items-center gap-2">
        <button type="button" onClick={() => setScreen('levels')} aria-label="Level list" className={btn}>
          <ArrowLeft className="size-5" />
        </button>
        <div className="flex-1 text-center">
          <div className={`font-display text-xl font-bold ${paper ? 'text-[#b07a2a]' : 'text-ink-100'}`}>Level {levelNo}</div>
          <div className={`flex items-center justify-center gap-3 text-xs ${paper ? 'text-[#7a6250]' : 'text-ink-300'}`}>
            <span className="flex items-center gap-1" aria-label={`${hearts} hearts left`}>
              {Array.from({ length: HEARTS }, (_, i) => (
                <Heart key={i} className={`size-4 ${i < hearts ? 'fill-[#ff4d5e] text-[#ff4d5e]' : 'text-ink-600'}`} />
              ))}
            </span>
            <span className="flex items-center gap-1 tabular-nums">
              <Clock className="size-3.5" />
              {formatDuration(watch.elapsed)}
            </span>
            <span>{live.length} left</span>
          </div>
        </div>
        <button type="button" onClick={switchTheme} aria-label={paper ? 'Switch to neon theme' : 'Switch to eye comfort theme'} title="Theme" className={btn}>
          <Palette className="size-5" />
        </button>
        <button type="button" onClick={() => open(levelNo)} aria-label="Restart level" className={btn}>
          <RotateCcw className="size-5" />
        </button>
      </div>

      <div className="relative mt-3 min-h-[200px] flex-1">
        <svg
          viewBox={`${-pad} ${-pad} ${level.width + pad * 2} ${level.height + pad * 2}`}
          className="game-surface absolute inset-0 block h-full w-full"
          role="group"
          aria-label={`Arrow board, ${live.length} arrows left`}
        >
          {Array.from({ length: level.height }, (_, y) =>
            Array.from({ length: level.width }, (_, x) => <circle key={`${x},${y}`} cx={x + 0.5} cy={y + 0.5} r={0.04} fill={T.dot} />),
          )}
          {/* the hidden picture: a faint silhouette that fills in as arrows leave */}
          <g aria-hidden>
            {level.mask.map((c) => {
              const shown = !covered.has(`${c.x},${c.y}`)
              return (
                <rect
                  key={`${c.x},${c.y}`}
                  x={c.x + 0.04}
                  y={c.y + 0.04}
                  width={0.92}
                  height={0.92}
                  rx={0.2}
                  fill={level.picture.color}
                  opacity={shown ? 0.9 : paper ? 0.1 : 0.07}
                  style={{ transition: 'opacity 0.45s ease' }}
                />
              )
            })}
          </g>
          {arrows.map((a) => (
            <ArrowShape
              key={a.id}
              a={a}
              w={level.width}
              h={level.height}
              theme={theme}
              reduced={prefersReducedMotion}
              guide={guide}
              bumpBy={bump?.id === a.id ? bump.by : 0}
              onTap={() => tap(a)}
              onGone={() => setArrows((list) => list.filter((x) => x.id !== a.id))}
              state={leaving.has(a.id) ? 'leaving' : bump?.id === a.id ? 'bump' : blockerId === a.id ? 'blocker' : hintId === a.id ? 'hint' : 'idle'}
            />
          ))}
        </svg>

        {status !== 'play' && (
          <div
            className={`absolute inset-0 flex justify-center rounded-3xl p-4 animate-fade-in ${status === 'won' ? 'items-end' : 'items-center bg-[#070b16]/85 backdrop-blur-sm'}`}
            role="dialog"
            aria-modal="true"
            aria-label={status === 'won' ? 'Level complete' : 'Level failed'}
          >
            <div className="w-full max-w-xs rounded-3xl border border-white/10 bg-ink-850 p-6 text-center">
              {status === 'won' ? (
                <>
                  <div className="text-5xl" aria-hidden>
                    ✨
                  </div>
                  <p className="mt-2 font-display text-3xl font-extrabold text-[#3ee08f]">Level {levelNo} clear!</p>
                  <p className="text-sm text-ink-200">You revealed the {level.picture.name.toLowerCase()}.</p>
                  <div className="mt-2 flex justify-center gap-1" aria-label={`${hearts} of ${HEARTS} hearts kept`}>
                    {Array.from({ length: HEARTS }, (_, i) => (
                      <Heart key={i} className={`size-6 ${i < hearts ? 'fill-[#ff4d5e] text-[#ff4d5e]' : 'text-ink-600'}`} />
                    ))}
                  </div>
                  <p className="mt-1 text-sm text-ink-300">Time {formatDuration(watch.read())}</p>
                  <div className="mt-5 grid gap-2">
                    {levelNo < TOTAL_LEVELS ? (
                      <Button onClick={() => open(levelNo + 1)} data-autofocus>
                        Next level
                      </Button>
                    ) : (
                      <p className="font-semibold text-masala">All {TOTAL_LEVELS} levels done - legend!</p>
                    )}
                    <Button variant="secondary" onClick={() => open(levelNo)}>
                      Replay
                    </Button>
                    <Button variant="ghost" onClick={() => setScreen('levels')} icon={<Grid3x3 className="size-4" />}>
                      Levels
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-5xl" aria-hidden>
                    💔
                  </div>
                  <p className="mt-2 font-display text-3xl font-extrabold">Out of hearts</p>
                  <p className="mt-1 text-sm text-ink-300">Think about the order - which arrow has a clear lane?</p>
                  <div className="mt-5 grid gap-2">
                    <Button onClick={() => open(levelNo)} data-autofocus>
                      Try again
                    </Button>
                    <Button variant="ghost" onClick={() => setScreen('levels')}>
                      Levels
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex shrink-0 items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setGuide((g) => !g)}
          aria-pressed={guide}
          className={`flex min-h-12 items-center gap-2 rounded-full px-5 font-semibold ${
            guide ? 'bg-[#4cc9f0] text-ink-950' : paper ? 'bg-[#5c4433]/10 text-[#5c4433]' : 'bg-white/[0.07] text-ink-200'
          }`}
        >
          <Compass className="size-5" /> Guidance
        </button>
        <button
          type="button"
          onClick={hint}
          disabled={hints <= 0 || status !== 'play'}
          className={`relative flex min-h-12 items-center gap-2 rounded-full px-5 font-semibold disabled:opacity-40 ${paper ? 'bg-[#5c4433]/10 text-[#5c4433]' : 'bg-white/[0.07] text-ink-200'}`}
        >
          <Lightbulb className="size-5 text-masala" /> Hint
          <span className="absolute -right-1 -top-1 flex size-6 items-center justify-center rounded-full bg-lal text-xs font-bold text-white">{hints}</span>
        </button>
      </div>
      <p className="mt-2 shrink-0 text-center text-xs text-ink-500 short:hidden">
        Original levels generated for this site · <Link to="/leaderboards/arrow-go" className="underline">leaderboard</Link>
      </p>
    </div>
  )
}
