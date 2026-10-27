import {
  ArrowLeft,
  Box,
  Boxes,
  Check,
  Heart,
  Infinity as InfinityIcon,
  Lock,
  Play,
  RotateCcw,
  Settings,
  Shield,
  ShieldOff,
  Shuffle,
  Undo2,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog, Modal } from '../../components/ui/Modal'
import { useSettings, vibrate } from '../../features/settings/SettingsContext'
import { useLeaveGuard } from '../../hooks/useLeaveGuard'
import { formatDuration } from '../../lib/scoring'
import { sfx } from '../../lib/sound'
import { ApiError, friendlyError } from '../../lib/supabase'
import { useLoopAccount } from './account'
import { abilityAvailable, afterTick, canContinue, continueAttempt, giveUp, startAttempt, tapTruck, applyAbility, type Attempt } from './attempt'
import { BLOCK_NAMES, LoopBoard, type BeltItem } from './Board'
import { ABILITY_LABELS, CHAKKAR_CONFIG, continuesLeft, usesLeft, type AbilityId } from './config'
import levelsData from './levels.json'
import { canShuffle, conveyorLoad, nextSpareDock, tick, type LevelDef, type LoopState } from './logic'
import { AbilityButton, ChunkyButton, HudPill, Popup, RoundIconButton, SlotPlusIcon, TruckPlusIcon } from './ui'

const LEVELS = levelsData as LevelDef[]

/** Obstacles get a short introduction card on the first level that uses them. */
type Obstacle = 'barrier' | 'ice' | 'lock' | 'tag' | 'rope' | 'carpet' | 'spawner' | 'screw'
const OBSTACLES: Record<Obstacle, { title: string; emoji: string; text: string; has: (l: LevelDef) => boolean }> = {
  barrier: {
    title: 'Barrier',
    emoji: '🚧',
    text: 'Cubes can go into a truck behind a barrier, but they can never come out. Only send it the colour it needs.',
    has: (l) => l.trucks.some((t) => t.barrier),
  },
  ice: {
    title: 'Ice',
    emoji: '🧊',
    text: 'A frozen truck takes no cubes and cannot be tapped. Fill up the truck next to it to break the ice.',
    has: (l) => l.trucks.some((t) => t.ice !== undefined),
  },
  lock: {
    title: 'Lock & Key',
    emoji: '🔑',
    text: 'Trucks behind a shutter are locked. Empty the truck carrying the key of the same colour to open it.',
    has: (l) => l.trucks.some((t) => t.shutter !== undefined),
  },
  tag: {
    title: 'Coloured Truck',
    emoji: '🎨',
    text: 'A coloured truck only takes cubes of its own colour.',
    has: (l) => l.trucks.some((t) => t.tag !== undefined),
  },
  rope: {
    title: 'Rope',
    emoji: '🪢',
    text: 'Tied trucks cannot send cubes out. Sort any one of them and the whole rope comes off.',
    has: (l) => l.trucks.some((t) => t.rope !== undefined),
  },
  carpet: {
    title: 'Carpet',
    emoji: '🧶',
    text: 'Trucks under the carpet are out of play. Every truck you sort rolls the carpet back by one truck.',
    has: (l) => l.trucks.some((t) => t.carpet !== undefined),
  },
  spawner: {
    title: 'Spawner',
    emoji: '📦',
    text: 'A spawner refills itself: each time it is emptied, the next group on its hood drops in.',
    has: (l) => l.trucks.some((t) => t.queue?.length),
  },
  screw: {
    title: 'Screw',
    emoji: '🔩',
    text: 'A screw fastens a group to the cubes beneath it. They always leave the truck together.',
    has: (l) => l.trucks.some((t) => t.screws?.length),
  },
}
const INTRO_LEVEL = Object.fromEntries(
  (Object.keys(OBSTACLES) as Obstacle[]).map((k) => [LEVELS.find(OBSTACLES[k].has)?.n ?? 0, k]),
) as Record<number, Obstacle>
// one belt step; ~170ms gives the reference's calm pace (about 6 s per lap on level 1)
const TICK_MS = 170

type Screen = 'home' | 'levels' | 'play'

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [active])
  return now
}

function HappyTruck() {
  return (
    <svg viewBox="0 0 220 150" className="mx-auto h-36 w-auto motion-safe:animate-float" role="img" aria-label="Smiling purple truck">
      <rect x="62" y="6" width="26" height="22" rx="4" fill="#ff4d5e" />
      <rect x="92" y="2" width="26" height="26" rx="4" fill="#ffd23f" />
      <rect x="122" y="8" width="26" height="20" rx="4" fill="#4d7cff" />
      <rect x="30" y="28" width="160" height="88" rx="28" fill="#6a45e6" stroke="#4b2fb3" strokeWidth="5" />
      <rect x="44" y="40" width="132" height="34" rx="14" fill="#8f73f5" />
      <circle cx="88" cy="58" r="13" fill="#fff" />
      <circle cx="132" cy="58" r="13" fill="#fff" />
      <circle cx="91" cy="60" r="6" fill="#0b1020" />
      <circle cx="129" cy="60" r="6" fill="#0b1020" />
      <path d="M86 86 Q110 106 134 86" stroke="#0b1020" strokeWidth="6" fill="#ff5d8f" strokeLinecap="round" />
      <circle cx="62" cy="122" r="17" fill="#1c2540" />
      <circle cx="158" cy="122" r="17" fill="#1c2540" />
      <circle cx="62" cy="122" r="7" fill="#ff8a3d" />
      <circle cx="158" cy="122" r="7" fill="#ff8a3d" />
    </svg>
  )
}

function Title() {
  const palette = ['#ffd23f', '#ff4d5e', '#3ee08f', '#4cc9f0', '#ff8a3d', '#ff5d8f', '#b06bff']
  const letters = [...'CHAKKAR'].map((ch, i) => [ch, palette[i % palette.length]])
  const letters2 = [...'CUBES'].map((ch, i) => [ch, palette[(i + 3) % palette.length]])
  const row = (ls: string[][]) => (
    <span className="flex justify-center gap-0.5">
      {ls.map(([ch, c], i) => (
        <span key={i} className="inline-block" style={{ color: c, WebkitTextStroke: '5px #2a1a6e', paintOrder: 'stroke fill', transform: `rotate(${(i % 2 ? 1 : -1) * 4}deg)` }}>
          {ch}
        </span>
      ))}
    </span>
  )
  return (
    <h2 className="font-display text-5xl font-extrabold leading-[0.95] drop-shadow-[0_6px_0_rgba(20,10,60,0.6)] min-[380px]:text-6xl sm:text-7xl" aria-label="Chakkar Cubes">
      {row(letters)}
      {row(letters2)}
    </h2>
  )
}

function LivesPill({ lives, max, nextLifeAt, admin, compact }: { lives: number; max: number; nextLifeAt: number | null; admin: boolean; compact?: boolean }) {
  const now = useNow(nextLifeAt !== null && !admin && !compact)
  if (compact)
    // in-level HUD: just the heart and the count, same chunky style as the other pills
    return (
      <HudPill label={admin ? 'Lives: unlimited' : `Lives: ${lives} of ${max}`}>
        <Heart className="size-5 fill-[#ff4d5e] text-[#ff4d5e]" aria-hidden />
        {admin ? <InfinityIcon className="size-5" aria-hidden /> : lives}
      </HudPill>
    )
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-[#2a1a6e]/80 px-3 py-1.5 text-sm font-bold text-white" aria-live="polite">
      <Heart className="size-5 fill-[#ff4d5e] text-[#ff4d5e]" aria-hidden />
      {admin ? (
        <span className="flex items-center gap-1">
          <InfinityIcon className="size-4" aria-label="Unlimited" />
        </span>
      ) : (
        <span>
          {lives}/{max}
        </span>
      )}
      {!admin && nextLifeAt !== null && <span className="font-medium text-[#c9bfff]">+1 in {formatDuration(Math.max(0, nextLifeAt - now))}</span>}
      {!admin && nextLifeAt === null && <span className="font-medium text-[#c9bfff]">Full</span>}
    </div>
  )
}

export default function LoopSort() {
  const { account, pending, error, isOnlineMode, record, enterAdmin, exitAdmin, selectLevel } = useLoopAccount()
  const admin = account.admin
  const [screen, setScreen] = useState<Screen>('home')
  const [pinOpen, setPinOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [pinBusy, setPinBusy] = useState(false)
  const [modeMsg, setModeMsg] = useState<string | null>(null)
  const [switching, setSwitching] = useState(false)

  // --- play state (rules live in attempt.ts; this component animates and records results) ---
  const [level, setLevel] = useState<LevelDef | null>(null)
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [items, setItems] = useState<BeltItem[]>([])
  const [shake, setShake] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [shuffleMode, setShuffleMode] = useState(false)
  const [justAdded, setJustAdded] = useState<number | null>(null)
  const [intro, setIntro] = useState<Obstacle | null>(null)
  const [confirm, setConfirm] = useState<null | 'restart' | 'leave'>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const { settings, update } = useSettings()
  const nextId = useRef(1)
  const idle = useRef(0)
  const recorded = useRef(false)
  const attemptRef = useRef<Attempt | null>(null)
  attemptRef.current = attempt

  const status = attempt?.status
  const inPlay = screen === 'play' && (status === 'playing' || status === 'out-of-space' || status === 'stuck')
  const started = !!attempt && (attempt.history.length > 0 || Object.values(attempt.used).some((n) => n > 0) || attempt.continuesUsed > 0)
  // leaving a started, unfinished level counts as a failed attempt (Normal Mode only)
  const costsLife = inPlay && started && !admin
  const blocker = useLeaveGuard(costsLife)

  const completed = useMemo(() => new Set(account.completed), [account.completed])
  const highest = account.completed.length ? Math.max(...account.completed) : 0
  const unlockedUpTo = Math.min(LEVELS.length, highest + 1)
  const nextLevel = Math.min(LEVELS.length, Math.max(1, ...Array.from({ length: LEVELS.length }, (_, i) => i + 1).filter((n) => !completed.has(n)).slice(0, 1)))
  const canStartNormal = admin || account.lives > 0

  const itemsFromBelt = useCallback((s: LoopState): BeltItem[] => {
    const out: BeltItem[] = []
    s.belt.forEach((c, pos) => c !== null && out.push({ id: nextId.current++, color: c, pos }))
    return out
  }, [])

  /** Commits a new attempt and keeps the animated conveyor cubes in sync with its board. */
  const commit = useCallback(
    (prev: Attempt, next: Attempt, rebuild = false) => {
      if (rebuild) setItems(itemsFromBelt(next.state))
      else if (next.state.belt !== prev.state.belt) {
        const fresh: BeltItem[] = []
        next.state.belt.forEach((c, pos) => {
          if (c !== null && prev.state.belt[pos] === null) fresh.push({ id: nextId.current++, color: c, pos })
        })
        if (fresh.length) setItems((list) => [...list, ...fresh])
      }
      if (next.state.belt !== prev.state.belt) idle.current = 0
      attemptRef.current = next
      setAttempt(next)
    },
    [itemsFromBelt],
  )

  function startLevel(n: number) {
    const def = LEVELS[n - 1]
    if (!def) return
    if (!admin && account.lives <= 0) {
      setMessage('No lives left - wait for the next one.')
      return
    }
    void selectLevel(n)
    const a = startAttempt(def, admin)
    setLevel(def)
    attemptRef.current = a
    setAttempt(a)
    setItems([])
    setMessage(null)
    setShuffleMode(false)
    setJustAdded(null)
    setIntro(INTRO_LEVEL[n] ?? null)
    recorded.current = false
    idle.current = 0
    setScreen('play')
  }

  const fail = useCallback(
    (lvl: number) => {
      record('fail', lvl)
    },
    [record],
  )

  // conveyor motor: runs while playing; pauses while the Out of Space / no-moves screens are open
  const moving = screen === 'play' && status === 'playing' && !!attempt && conveyorLoad(attempt.state) > 0
  useEffect(() => {
    if (!moving) return
    const t = window.setInterval(() => {
      const a = attemptRef.current
      if (!a || a.status !== 'playing') return
      const s = a.state
      const r = tick(s)
      setItems((list) => {
        const moved = list.map((it) => ({ ...it, pos: (it.pos + 1) % s.belt.length }))
        const gone = new Set(r.absorbed.map((x) => r.state.trucks[x.truck].pos))
        const kept = gone.size ? moved.filter((it) => !gone.has(it.pos)) : moved
        // cubes streaming out of trucks appear at the truck's own belt position
        return r.emitted.length ? [...kept, ...r.emitted.map((e) => ({ id: nextId.current++, color: e.color, pos: e.pos }))] : kept
      })
      if (r.emitted.length) idle.current = 0
      if (r.absorbed.length) {
        idle.current = 0
        sfx.point()
      } else idle.current += 1
      if (r.completed.length) {
        sfx.match()
        vibrate(40)
      }
      const settled = conveyorLoad(r.state) === 0 || idle.current >= s.belt.length
      const next = afterTick(a, r.state, settled)
      attemptRef.current = next
      setAttempt(next)
    }, TICK_MS)
    return () => window.clearInterval(t)
  }, [moving])

  // an empty conveyor is already settled: check win / no moves right away
  useEffect(() => {
    if (!attempt || attempt.status !== 'playing' || conveyorLoad(attempt.state) > 0) return
    const next = afterTick(attempt, attempt.state, true)
    if (next.status !== attempt.status) {
      attemptRef.current = next
      setAttempt(next)
    }
  }, [attempt])

  // a win records the completion exactly once
  useEffect(() => {
    if (!attempt || !level || recorded.current) return
    if (attempt.status === 'won') {
      recorded.current = true
      sfx.win()
      record('complete', level.n)
    }
  }, [attempt, level, record])

  function onTruck(i: number) {
    const a = attemptRef.current
    if (!a || a.status !== 'playing') return
    if (shuffleMode) {
      if (!canShuffle(a.state, i)) {
        sfx.miss()
        setMessage('Pick a truck with at least two different colours to shuffle.')
        return
      }
      commit(a, applyAbility(a, 'shuffle', { truck: i }))
      setShuffleMode(false)
      setMessage('Shuffled!')
      sfx.flip()
      return
    }
    const next = tapTruck(a, i)
    if (next.status === 'out-of-space') {
      sfx.lose()
      vibrate([80, 40, 80])
      commit(a, next)
      return
    }
    if (next.refused) {
      sfx.miss()
      setShake(i)
      window.setTimeout(() => setShake(null), 400)
      const r = next.refused.reason
      setMessage(
        r === 'locked'
          ? `Curtain closed - sort ${BLOCK_NAMES[a.state.trucks[i].lock ?? 0]} first.`
          : r === 'frozen'
            ? 'Frozen! Fill the truck next to it to break the ice.'
            : r === 'shut'
              ? 'Locked - empty the truck with the key to open the shutter.'
              : r === 'carpet'
                ? 'Under the carpet - sort trucks to roll it back.'
              : r === 'tied'
                ? 'Tied by a rope - sort one of the tied trucks to untie it.'
            : r === 'barrier'
              ? 'A barrier blocks this truck - cubes can go in, but not out.'
              : r === 'empty'
            ? 'This truck is empty.'
            : r === 'done'
              ? 'That truck is done.'
              : 'There is no room on the conveyor for these cubes.',
      )
      commit(a, { ...next, refused: null })
      return
    }
    sfx.whoosh()
    setMessage(null)
    commit(a, next)
  }

  function ability(id: AbilityId) {
    const a = attemptRef.current
    if (!a) return
    if (id === 'shuffle') {
      if (!shuffleMode && !abilityAvailable(a, 'shuffle')) return
      setMessage(shuffleMode ? null : 'Tap a truck to shuffle its cubes.')
      setShuffleMode(!shuffleMode)
      return
    }
    const dock = nextSpareDock(a.state)
    const next = applyAbility(a, id)
    if (next === a) return
    setShuffleMode(false)
    commit(a, next, id === 'undo')
    if (id === 'undo') setMessage('Last tap undone.')
    if (id === 'extraTruck') {
      setJustAdded(dock)
      setMessage('An empty truck joined the loop.')
    }
    if (id === 'extraSlot') setMessage(`The conveyor now holds ${next.state.capacity} cubes.`)
    sfx.click()
  }

  function doContinue() {
    const a = attemptRef.current
    if (!a) return
    const next = continueAttempt(a)
    if (next === a) return
    commit(a, next)
    setMessage(next.history.length > a.history.length ? 'Extra slot added - your move went through.' : 'Extra slot added. That move still does not fit - try another truck.')
  }

  function doGiveUp() {
    const a = attemptRef.current
    if (!a || !level) return
    const next = giveUp(a)
    attemptRef.current = next
    setAttempt(next)
    // existing life-loss logic: a fail event (the server ignores it in Admin Mode)
    fail(level.n)
  }

  function leaveLevel(to: Screen) {
    if (costsLife && level) fail(level.n)
    setConfirm(null)
    setScreen(to)
  }

  async function submitPin(e: FormEvent) {
    e.preventDefault()
    setPinBusy(true)
    setPinError(null)
    try {
      await enterAdmin(pin)
      setPin('')
      setPinOpen(false)
      setModeMsg('Admin Mode on: unlimited lives and abilities, every level unlocked.')
    } catch (err) {
      const code = err instanceof ApiError ? err.code : ''
      setPinError(code === 'invalid_pin' ? 'Wrong PIN.' : friendlyError(err))
    } finally {
      setPinBusy(false)
    }
  }

  async function backToNormal() {
    setSwitching(true)
    try {
      await exitAdmin()
      setModeMsg(`Normal Mode: lives reset to ${account.maxLives}. Your completed levels are kept.`)
    } catch (err) {
      setModeMsg(friendlyError(err))
    } finally {
      setSwitching(false)
    }
  }

  const shell =
    'mx-auto max-w-2xl overflow-hidden rounded-[2rem] bg-[radial-gradient(ellipse_at_50%_35%,#2d2865_0%,#25215a_50%,#1b1839_100%)] p-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] max-[379px]:p-3 sm:p-6'

  // ---------------- HOME ----------------
  if (screen === 'home') {
    return (
      <div className={shell}>
        <div className="flex items-center justify-between gap-2">
          <LivesPill lives={account.lives} max={account.maxLives} nextLifeAt={account.nextLifeAt} admin={admin} />
          {admin ? (
            <Button size="sm" variant="secondary" disabled={switching} onClick={backToNormal} icon={<ShieldOff className="size-4" />}>
              Normal Mode
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => (setPinError(null), setPinOpen(true))} icon={<Shield className="size-4" />}>
              Admin
            </Button>
          )}
        </div>
        {admin && <p className="mt-3 rounded-2xl bg-[#ffd23f] px-3 py-1.5 text-center text-sm font-bold text-[#2a1a6e]">ADMIN MODE</p>}
        <div className="mt-6 text-center">
          <Title />
          <div className="mt-4">
            <HappyTruck />
          </div>
          <Button
            size="lg"
            className="mt-6 min-w-56 !bg-[#3ee08f] !text-[#0b1020] !shadow-[0_5px_0_0_#1f9a5c] text-2xl"
            disabled={!canStartNormal}
            onClick={() => startLevel(admin ? account.currentLevel || nextLevel : nextLevel)}
            icon={<Play className="size-6" />}
          >
            Level {admin ? account.currentLevel || nextLevel : nextLevel}
          </Button>
          {!canStartNormal && <p className="mt-2 text-sm text-[#ffd0d5]">Out of lives. Next life arrives soon - or come back later.</p>}
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="secondary" onClick={() => setScreen('levels')} icon={<Boxes className="size-4" />}>
              Levels
            </Button>
          </div>
        </div>
        {(modeMsg || message) && (
          <p role="status" className="mt-4 rounded-2xl bg-black/20 px-3 py-2 text-center text-sm">
            {modeMsg ?? message}
          </p>
        )}
        <details className="mt-5 rounded-2xl bg-black/15 p-3 text-sm text-[#e6e0ff]">
          <summary className="cursor-pointer font-semibold">How to play</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Tap a truck to send its top group of same-coloured cubes onto the conveyor.</li>
            <li>Cubes drop into the first truck they pass that is empty or has the same colour on top.</li>
            <li>Four of one colour completes a truck. Sort every cube to win.</li>
            <li>The conveyor has limited space. Tap a group that does not fit and you are Out of Space.</li>
            <li>Out of Space: one free continue (+1 slot) per attempt, or give up and lose a life.</li>
            <li>From level 6 only the top cube of each truck is visible. Curtains open when their colour is sorted.</li>
            <li>Abilities: Undo, Shuffle, Extra Truck and +1 Slot, {CHAKKAR_CONFIG.abilitiesPerLevel.undo} each per level (unlimited in Admin Mode).</li>
          </ul>
        </details>
        <p className="mt-3 text-center text-xs text-[#c9bfff]">
          {isOnlineMode
            ? `Lives refill one every ${Math.round(account.regenSeconds / 60)} min (server time). ${pending ? `${pending} result(s) waiting to sync.` : ''}`
            : 'Local-only mode: lives use this device clock and Admin Mode is unavailable.'}
          {error ? ` ${error}` : ''}
        </p>
        <Modal open={pinOpen} onClose={() => setPinOpen(false)} title="Admin PIN" size="sm">
          {isOnlineMode ? (
            <form onSubmit={submitPin} className="space-y-3">
              <p className="text-sm">The PIN is checked on the server. A few wrong tries lock entry for 15 minutes.</p>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                aria-label="Admin PIN"
                className="min-h-12 w-full rounded-2xl border border-ink-600 bg-ink-900 px-4 text-center font-mono text-2xl tracking-[0.4em] text-ink-100 focus:border-masala focus:outline-none"
              />
              {pinError && (
                <p role="alert" className="text-sm text-lal">
                  {pinError}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={pinBusy || pin.length < 4}>
                {pinBusy ? 'Checking...' : 'Unlock Admin Mode'}
              </Button>
            </form>
          ) : (
            <p>Admin Mode needs the online backend so the PIN can be verified securely on the server. This site is running in local-only mode.</p>
          )}
        </Modal>
      </div>
    )
  }

  // ---------------- LEVELS ----------------
  if (screen === 'levels') {
    return (
      <div className={shell}>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setScreen('home')} aria-label="Back" className="inline-flex size-10 items-center justify-center rounded-xl bg-black/20 hover:bg-black/30">
            <ArrowLeft className="size-5" />
          </button>
          <h2 className="flex-1 font-display text-3xl font-extrabold">Levels</h2>
          <LivesPill lives={account.lives} max={account.maxLives} nextLifeAt={account.nextLifeAt} admin={admin} />
        </div>
        {admin && <p className="mt-2 text-sm text-[#ffd23f]">Admin Mode: open any level. Opening a level does not complete it.</p>}
        <div className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-8">
          {LEVELS.map((l) => {
            const done = completed.has(l.n)
            const locked = !admin && l.n > unlockedUpTo && !done
            return (
              <button
                key={l.n}
                type="button"
                disabled={locked || !canStartNormal}
                onClick={() => startLevel(l.n)}
                aria-label={`Level ${l.n}${done ? ', completed' : locked ? ', locked' : ''}`}
                className={`relative flex aspect-square items-center justify-center rounded-2xl font-display text-xl font-bold shadow-[0_3px_0_0_rgba(0,0,0,0.25)] transition active:translate-y-0.5 ${
                  done ? 'bg-[#3ee08f] text-[#0b1020]' : locked ? 'bg-black/20 text-white/40' : 'bg-white/90 text-[#2a1a6e] hover:bg-white'
                }`}
              >
                {locked ? <Lock className="size-4" /> : l.n}
                {done && <Check className="absolute right-1 top-1 size-3.5" />}
              </button>
            )
          })}
        </div>
        <p className="mt-3 text-center text-xs text-[#c9bfff]">
          {account.completed.length}/{LEVELS.length} completed. Level layouts are original and generated for this site.
        </p>
      </div>
    )
  }

  // ---------------- PLAY ----------------
  if (!level || !attempt) return null
  const board = attempt.state
  const count = conveyorLoad(board) // includes cubes still streaming out of a truck (same as the Out of Space check)
  const abilities: { id: AbilityId; icon: ReactNode }[] = [
    { id: 'undo', icon: <Undo2 className="size-7" strokeWidth={3} /> },
    { id: 'shuffle', icon: <Shuffle className="size-7" strokeWidth={3} /> },
    { id: 'extraTruck', icon: <TruckPlusIcon className="size-8" /> },
    { id: 'extraSlot', icon: <SlotPlusIcon className="size-8" /> },
  ]
  const shuffleTargets = shuffleMode ? board.trucks.map((_, i) => i).filter((i) => canShuffle(board, i)) : []
  const leftCont = continuesLeft(attempt.continuesUsed, admin)
  const slotUses = usesLeft('extraSlot', attempt.used.extraSlot, admin)
  const full = count >= board.capacity
  const restart = () => {
    setMenuOpen(false)
    if (costsLife) setConfirm('restart')
    else startLevel(level.n)
  }

  return (
    <div className={`${shell} flex min-h-0 w-full flex-1 flex-col short:p-3`}>
      {/* HUD: level on the left, cube counter in the middle, lives and the gear on the right (like the reference) */}
      <div className="flex shrink-0 items-center justify-between gap-1.5 min-[380px]:gap-2">
        <div className="flex min-w-0 items-center gap-1.5 min-[380px]:gap-2">
        <RoundIconButton label="Back to Chakkar Cubes home" onClick={() => (costsLife ? setConfirm('leave') : setScreen('home'))}>
          <ArrowLeft className="size-5" strokeWidth={2.8} />
        </RoundIconButton>
        <HudPill label={`Level ${level.n}`}>
          <span aria-hidden>
            <span className="max-[359px]:hidden">Level </span>
            <span className="min-[360px]:hidden">Lv </span>
            {level.n}
          </span>
        </HudPill>
        </div>
        <HudPill tone={full ? 'danger' : 'default'} label={`Conveyor ${count} of ${board.capacity} cubes`} testId="conveyor-count">
          <Box className="size-5 max-[399px]:size-4" strokeWidth={2.4} aria-hidden /> {count}/{board.capacity}
        </HudPill>
        <div className="flex min-w-0 items-center gap-1.5 min-[380px]:gap-2">
          <LivesPill lives={account.lives} max={account.maxLives} nextLifeAt={account.nextLifeAt} admin={admin} compact />
          <RoundIconButton label="Game menu" onClick={() => setMenuOpen(true)}>
            <Settings className="size-5" strokeWidth={2.6} />
          </RoundIconButton>
        </div>
      </div>

      {/* board + abilities: stacked on phones, abilities in a column beside the board on wide screens */}
      <div className="mt-3 flex min-h-0 flex-1 flex-col lg:flex-row lg:items-center lg:justify-center lg:gap-8 short:mt-2 short:flex-row short:items-center short:gap-3">
        <div className="relative min-h-[240px] flex-1 lg:min-w-0 lg:self-stretch short:min-h-0 short:min-w-0 short:self-stretch">
          <LoopBoard
            state={board}
            items={items}
            hidden={level.hidden}
            tickMs={TICK_MS}
            shakeTruck={shake}
            highlightTrucks={shuffleTargets}
            justAdded={justAdded}
            full={full}
            onTruck={onTruck}
          />
          {intro && status === 'playing' && (
            <Popup label={`New obstacle: ${OBSTACLES[intro].title}`} emoji={OBSTACLES[intro].emoji} title={OBSTACLES[intro].title}>
              <p className="mt-1 text-xs font-extrabold uppercase tracking-wider text-[#7a5ce0]">New obstacle</p>
              <p className="mt-1 text-sm font-semibold text-[#5b4a9e]">{OBSTACLES[intro].text}</p>
              <div className="mt-4 grid">
                <ChunkyButton onClick={() => setIntro(null)} data-autofocus>
                  Got it
                </ChunkyButton>
              </div>
            </Popup>
          )}
          {status === 'won' && (
            <Popup label="Level complete" emoji="🎉" title={`Level ${level.n} done!`}>
              <p className="mt-1 text-sm font-semibold text-[#5b4a9e]">Saare cubes sorted. Shabaash!</p>
              <div className="mt-4 grid gap-2.5">
                {level.n < LEVELS.length && (
                  <ChunkyButton onClick={() => startLevel(level.n + 1)} data-autofocus disabled={!canStartNormal}>
                    <Play className="size-5" /> Next level
                  </ChunkyButton>
                )}
                <ChunkyButton tone="purple" onClick={() => setScreen('home')}>
                  Home
                </ChunkyButton>
              </div>
            </Popup>
          )}
          {status === 'out-of-space' && attempt.pending && (
            <Popup label="Out of Space" emoji="📦" title="Out of Space!">
              <p className="mt-1 text-sm font-semibold text-[#5b4a9e]">
                {attempt.pending.needed === 1 ? '1 cube needs' : `${attempt.pending.needed} cubes need`} room, but the conveyor has{' '}
                {attempt.pending.free === 1 ? '1 free slot' : `${attempt.pending.free} free slots`}.
              </p>
              <div className="mt-4 grid gap-2.5">
                {canContinue(attempt) && (
                  <ChunkyButton onClick={doContinue} data-autofocus>
                    Continue (+{CHAKKAR_CONFIG.slotsPerContinue} slot)
                    {!admin && <span className="whitespace-nowrap rounded-full bg-white/40 px-2 py-0.5 text-xs">{leftCont} free</span>}
                  </ChunkyButton>
                )}
                {abilityAvailable(attempt, 'extraSlot') && (
                  <ChunkyButton tone="yellow" onClick={() => ability('extraSlot')}>
                    Use +1 Slot ({slotUses === Infinity ? '∞' : slotUses} left)
                  </ChunkyButton>
                )}
                <ChunkyButton tone="red" onClick={doGiveUp}>
                  Give Up{admin ? '' : ' (-1 life)'}
                </ChunkyButton>
              </div>
            </Popup>
          )}
          {status === 'stuck' && (
            <Popup label="No moves left" emoji="🚧" title="No moves left">
              <p className="mt-1 text-sm font-semibold text-[#5b4a9e]">No truck can be tapped and the waiting cubes have nowhere to go.</p>
              <div className="mt-4 grid gap-2.5">
                {abilityAvailable(attempt, 'extraTruck') && <ChunkyButton onClick={() => ability('extraTruck')}>Add an Extra Truck</ChunkyButton>}
                {abilityAvailable(attempt, 'undo') && (
                  <ChunkyButton tone="yellow" onClick={() => ability('undo')}>
                    Undo last tap
                  </ChunkyButton>
                )}
                <ChunkyButton tone="red" onClick={doGiveUp}>
                  Give Up{admin ? '' : ' (-1 life)'}
                </ChunkyButton>
              </div>
            </Popup>
          )}
          {status === 'given-up' && (
            <Popup label="Attempt over" emoji="💔" title="Attempt over">
              <p className="mt-1 text-sm font-semibold text-[#5b4a9e]">{admin ? 'Admin Mode: no life lost.' : `You lost a life. ${account.lives} left.`}</p>
              <div className="mt-4 grid gap-2.5">
                <ChunkyButton onClick={() => startLevel(level.n)} disabled={!admin && account.lives <= 0} data-autofocus>
                  {!admin && account.lives <= 0 ? 'No lives left' : 'Try again'}
                </ChunkyButton>
                <ChunkyButton tone="purple" onClick={() => setScreen('home')}>
                  Home
                </ChunkyButton>
              </div>
            </Popup>
          )}
          {/* status line floats over the bottom of the board so it never pushes the layout */}
          <p className="pointer-events-none absolute inset-x-0 bottom-1 z-10 flex justify-center px-3" aria-live="polite">
            {message && <span className="rounded-full bg-[#120a3a]/85 px-3 py-1 text-center text-sm font-semibold text-[#f2edff] shadow-lg">{message}</span>}
          </p>
        </div>

        {/* abilities */}
        <div className="mt-3 flex shrink-0 justify-center gap-4 px-1 pb-1 min-[380px]:gap-6 lg:mt-0 lg:w-24 lg:flex-col lg:gap-6 lg:px-0 short:mt-0 short:w-16 short:flex-col short:gap-2 short:px-0">
          {abilities.map(({ id, icon }) => {
            const left = usesLeft(id, attempt.used[id], admin)
            const available = abilityAvailable(attempt, id)
            const active = id === 'shuffle' && shuffleMode
            return (
              <AbilityButton
                key={id}
                icon={icon}
                name={ABILITY_LABELS[id]}
                count={left}
                active={active}
                onClick={() => ability(id)}
                disabled={status !== 'playing' || (!available && !active)}
                aria-pressed={id === 'shuffle' ? shuffleMode : undefined}
                aria-label={`${ABILITY_LABELS[id]}, ${left === Infinity ? 'unlimited' : `${left} left`}`}
              />
            )
          })}
        </div>
      </div>

      {/* gear menu */}
      <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title="Game menu" size="sm">
        <div className="grid gap-2.5">
          <ChunkyButton tone="purple" onClick={() => update({ sound: !settings.sound })}>
            {settings.sound ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />} Sound {settings.sound ? 'on' : 'off'}
          </ChunkyButton>
          <ChunkyButton tone="yellow" onClick={restart}>
            <RotateCcw className="size-5" /> Restart level
          </ChunkyButton>
          <ChunkyButton tone="purple" onClick={() => {
              setMenuOpen(false)
              if (costsLife) setConfirm('leave')
              else setScreen('home')
            }}>
            Home
          </ChunkyButton>
          <details className="rounded-2xl bg-ink-900/60 p-3 text-sm text-ink-200">
            <summary className="cursor-pointer font-semibold text-ink-100">How to play</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Tap a truck to send its top group of same-coloured cubes onto the conveyor.</li>
              <li>Cubes drop into the first truck they pass that is empty or has the same colour on top.</li>
              <li>The conveyor has limited space: a group that does not fit means Out of Space.</li>
            </ul>
          </details>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirm !== null}
        danger
        title={confirm === 'restart' ? 'Restart this level?' : 'Leave this level?'}
        message="You've already started this level, so this counts as a failed attempt and costs one life."
        confirmLabel={confirm === 'restart' ? 'Restart (-1 life)' : 'Leave (-1 life)'}
        onConfirm={() => {
          if (confirm === 'restart') {
            fail(level.n)
            setConfirm(null)
            if (account.lives - 1 > 0) startLevel(level.n)
            else setScreen('home')
          } else leaveLevel('home')
        }}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        danger
        title="Leave Chakkar Cubes?"
        message="Leaving a started level counts as a failed attempt and costs one life."
        confirmLabel="Leave (-1 life)"
        onConfirm={() => {
          fail(level.n)
          blocker.proceed?.()
        }}
        onCancel={() => blocker.reset?.()}
      />
    </div>
  )
}
