import { ArrowLeft, Check, Clock, Compass, Grid3x3, Heart, Lightbulb, Lock, Play, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Button } from '../../components/ui/Button'
import { usePlayer } from '../../features/player/PlayerContext'
import { vibrate } from '../../features/settings/SettingsContext'
import { useVisibilityPause } from '../../hooks/useGameLoop'
import { useStopwatch } from '../../hooks/useStopwatch'
import { loadProgress, recordLevel, syncProgress, type LevelProgress } from '../../lib/progress'
import { formatDuration } from '../../lib/scoring'
import { sfx } from '../../lib/sound'
import { blocker, exitRay, getLevel, headDir, HEARTS, removableArrows, TOTAL_LEVELS, type Arrow, type Dir, type Level } from './logic'

const HINTS_PER_LEVEL = 3
const SLIDE: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }

type Screen = 'levels' | 'playing'

function ArrowShape({ a, state, onTap, guide, w, h }: { a: Arrow; state: 'idle' | 'leaving' | 'shake' | 'blocker' | 'hint'; onTap: () => void; guide: boolean; w: number; h: number }) {
  const pts = a.cells.map((c) => `${c.x + 0.5},${c.y + 0.5}`).join(' ')
  const head = a.cells[a.cells.length - 1]
  const dir = headDir(a)
  const [dx, dy] = SLIDE[dir]
  const hx = head.x + 0.5
  const hy = head.y + 0.5
  // arrowhead triangle
  const tip = [hx + dx * 0.42, hy + dy * 0.42]
  const l = [hx - dy * 0.28 + dx * 0.02, hy + dx * 0.28 + dy * 0.02]
  const r = [hx + dy * 0.28 + dx * 0.02, hy - dx * 0.28 + dy * 0.02]
  const dist = w + h + 2
  const color = state === 'blocker' ? '#ff4d5e' : a.color
  const ray = guide ? exitRay(a, w, h) : []
  return (
    <g
      style={{
        transform: state === 'leaving' ? `translate(${dx * dist}px, ${dy * dist}px)` : undefined,
        transition: state === 'leaving' ? 'transform 0.45s cubic-bezier(.5,0,.9,.5), opacity 0.45s' : undefined,
        opacity: state === 'leaving' ? 0 : 1,
      }}
      className={state === 'shake' ? 'animate-shake' : ''}
    >
      {ray.length > 0 && (
        <line x1={hx} y1={hy} x2={ray[ray.length - 1].x + 0.5 + dx * 0.5} y2={ray[ray.length - 1].y + 0.5 + dy * 0.5} stroke={a.color} strokeWidth={0.05} strokeDasharray="0.12 0.14" opacity={0.55} />
      )}
      {state === 'hint' && <polyline points={pts} fill="none" stroke={a.color} strokeWidth={0.55} strokeLinecap="round" strokeLinejoin="round" opacity={0.35} className="motion-safe:animate-pulse" />}
      <polyline points={pts} fill="none" stroke={color} strokeWidth={0.16} strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 0.12px ${color})` }} />
      <polygon points={`${tip.join(',')} ${l.join(',')} ${r.join(',')}`} fill={color} />
      <circle cx={a.cells[0].x + 0.5} cy={a.cells[0].y + 0.5} r={0.09} fill={color} />
      {/* generous invisible hit area */}
      <polyline
        points={pts}
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

export default function ArrowGo() {
  const { player } = usePlayer()
  const playerKey = player?.id ?? 'anon'
  const [progress, setProgress] = useState<LevelProgress>(() => loadProgress(playerKey, 'arrow-go'))
  const [screen, setScreen] = useState<Screen>('levels')
  const [levelNo, setLevelNo] = useState(1)
  const [level, setLevel] = useState<Level | null>(null)
  const [arrows, setArrows] = useState<Arrow[]>([])
  const [leaving, setLeaving] = useState<Set<number>>(new Set())
  const [shake, setShake] = useState<number | null>(null)
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
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && screen === 'playing' && status === 'play') watch.start()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [screen, status, watch])

  const live = arrows.filter((a) => !leaving.has(a.id))

  function tap(a: Arrow) {
    if (!level || status !== 'play' || leaving.has(a.id)) return
    const b = blocker(a, live, level.width, level.height)
    if (b === null) {
      sfx.whoosh()
      const nextLeaving = new Set(leaving).add(a.id)
      setLeaving(nextLeaving)
      setHintId(null)
      later(() => setArrows((list) => list.filter((x) => x.id !== a.id)), 480)
      if (live.length === 1) {
        watch.pause()
        sfx.win()
        const next = recordLevel(playerKey, 'arrow-go', level.number, hearts)
        setProgress(next)
        void syncProgress(playerKey, 'arrow-go', Boolean(player?.registered)).then(setProgress)
        later(() => setStatus('won'), 500)
      }
    } else {
      sfx.miss()
      vibrate(60)
      setShake(a.id)
      setBlockerId(b === a.id ? null : b)
      later(() => {
        setShake(null)
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
          <li>• Each arrow moves in the direction its head points - along a straight lane to the edge.</li>
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

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col rounded-[2rem] bg-[#070b16] p-3 sm:p-5 short:p-2">
      {/* compact status header like the reference */}
      <div className="flex shrink-0 items-center gap-2">
        <button type="button" onClick={() => setScreen('levels')} aria-label="Level list" className="inline-flex size-10 items-center justify-center rounded-xl bg-white/[0.06] text-ink-200 hover:bg-white/10">
          <ArrowLeft className="size-5" />
        </button>
        <div className="flex-1 text-center">
          <div className="font-display text-xl font-bold text-ink-100">Level {levelNo}</div>
          <div className="flex items-center justify-center gap-3 text-xs text-ink-300">
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
        <button type="button" onClick={() => open(levelNo)} aria-label="Restart level" className="inline-flex size-10 items-center justify-center rounded-xl bg-white/[0.06] text-ink-200 hover:bg-white/10">
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
            Array.from({ length: level.width }, (_, x) => <circle key={`${x},${y}`} cx={x + 0.5} cy={y + 0.5} r={0.04} fill="#1c2540" />),
          )}
          {arrows.map((a) => (
            <ArrowShape
              key={a.id}
              a={a}
              w={level.width}
              h={level.height}
              guide={guide && !leaving.has(a.id)}
              onTap={() => tap(a)}
              state={leaving.has(a.id) ? 'leaving' : shake === a.id ? 'shake' : blockerId === a.id ? 'blocker' : hintId === a.id ? 'hint' : 'idle'}
            />
          ))}
        </svg>

        {status !== 'play' && (
          <div className="absolute inset-0 flex items-center justify-center rounded-3xl bg-[#070b16]/85 p-4 backdrop-blur-sm animate-fade-in" role="dialog" aria-modal="true" aria-label={status === 'won' ? 'Level complete' : 'Level failed'}>
            <div className="w-full max-w-xs rounded-3xl border border-white/10 bg-ink-850 p-6 text-center">
              {status === 'won' ? (
                <>
                  <div className="text-5xl" aria-hidden>
                    ✨
                  </div>
                  <p className="mt-2 font-display text-3xl font-extrabold text-[#3ee08f]">Level {levelNo} clear!</p>
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
          className={`flex min-h-12 items-center gap-2 rounded-full px-5 font-semibold ${guide ? 'bg-[#4cc9f0] text-ink-950' : 'bg-white/[0.07] text-ink-200'}`}
        >
          <Compass className="size-5" /> Guidance
        </button>
        <button
          type="button"
          onClick={hint}
          disabled={hints <= 0 || status !== 'play'}
          className="relative flex min-h-12 items-center gap-2 rounded-full bg-white/[0.07] px-5 font-semibold text-ink-200 disabled:opacity-40"
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
