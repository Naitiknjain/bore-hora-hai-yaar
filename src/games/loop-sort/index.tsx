import { ArrowLeft, Boxes, Check, Heart, Infinity as InfinityIcon, Lightbulb, Lock, Maximize2, Play, RotateCcw, Shield, ShieldOff, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog, Modal } from '../../components/ui/Modal'
import { vibrate } from '../../features/settings/SettingsContext'
import { useLeaveGuard } from '../../hooks/useLeaveGuard'
import { formatDuration } from '../../lib/scoring'
import { sfx } from '../../lib/sound'
import { ApiError, friendlyError } from '../../lib/supabase'
import { useLoopAccount } from './account'
import { BLOCK_NAMES, LoopBoard, type BeltItem } from './Board'
import levelsData from './levels.json'
import { beltCount, canTap, initialState, isJammed, isWon, solveDepthFirst, tap, tick, type LevelDef, type LoopState, type TapError } from './logic'

const LEVELS = levelsData as LevelDef[]
const TICK_MS = 110
const NORMAL_ABILITY_USES = 1

type Screen = 'home' | 'levels' | 'play'
type Outcome = null | 'won' | 'jammed'

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
  const letters = [
    ['L', '#ffd23f'],
    ['O', '#ff4d5e'],
    ['O', '#3ee08f'],
    ['P', '#4cc9f0'],
  ]
  const letters2 = [
    ['S', '#ff8a3d'],
    ['O', '#ffd23f'],
    ['R', '#ff5d8f'],
    ['T', '#3ee08f'],
  ]
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
    <h2 className="font-display text-6xl font-extrabold leading-[0.9] drop-shadow-[0_6px_0_rgba(20,10,60,0.6)] sm:text-7xl" aria-label="Loop Sort">
      {row(letters)}
      {row(letters2)}
    </h2>
  )
}

function LivesPill({ lives, max, nextLifeAt, admin }: { lives: number; max: number; nextLifeAt: number | null; admin: boolean }) {
  const now = useNow(nextLifeAt !== null && !admin)
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

  // --- play state ---
  const [level, setLevel] = useState<LevelDef | null>(null)
  const [board, setBoard] = useState<LoopState | null>(null)
  const [items, setItems] = useState<BeltItem[]>([])
  const [outcome, setOutcome] = useState<Outcome>(null)
  const [tapped, setTapped] = useState(false)
  const [shake, setShake] = useState<number | null>(null)
  const [hintTruck, setHintTruck] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [uses, setUses] = useState({ undo: 0, space: 0, hint: 0 })
  const [confirm, setConfirm] = useState<null | 'restart' | 'leave'>(null)
  const history = useRef<LoopState[]>([])
  const nextId = useRef(1)
  const idle = useRef(0)
  const boardRef = useRef<LoopState | null>(null)
  boardRef.current = board

  const playing = screen === 'play' && outcome === null
  const costsLife = playing && tapped && !admin
  const blocker = useLeaveGuard(costsLife)

  const completed = useMemo(() => new Set(account.completed), [account.completed])
  const highest = account.completed.length ? Math.max(...account.completed) : 0
  const unlockedUpTo = Math.min(LEVELS.length, highest + 1)
  const nextLevel = Math.min(LEVELS.length, Math.max(1, ...Array.from({ length: LEVELS.length }, (_, i) => i + 1).filter((n) => !completed.has(n)).slice(0, 1)))
  const canStartNormal = admin || account.lives > 0
  const usesLeft = (k: keyof typeof uses) => (admin ? Infinity : NORMAL_ABILITY_USES - uses[k])

  const itemsFromBelt = useCallback((s: LoopState): BeltItem[] => {
    const out: BeltItem[] = []
    s.belt.forEach((c, pos) => c !== null && out.push({ id: nextId.current++, color: c, pos }))
    return out
  }, [])

  function startLevel(n: number) {
    const def = LEVELS[n - 1]
    if (!def) return
    if (!admin && account.lives <= 0) {
      setMessage('No lives left - wait for the next one.')
      return
    }
    void selectLevel(n)
    const s = initialState(def)
    setLevel(def)
    setBoard(s)
    setItems([])
    setOutcome(null)
    setTapped(false)
    setUses({ undo: 0, space: 0, hint: 0 })
    setHintTruck(null)
    setMessage(null)
    history.current = []
    idle.current = 0
    setScreen('play')
  }

  const fail = useCallback(
    (lvl: number) => {
      record('fail', lvl)
    },
    [record],
  )

  // belt motor
  useEffect(() => {
    if (!playing || !board || beltCount(board) === 0) return
    const t = window.setInterval(() => {
      const s = boardRef.current
      if (!s) return
      const r = tick(s)
      setItems((list) => {
        const moved = list.map((it) => ({ ...it, pos: (it.pos + 1) % s.belt.length }))
        if (!r.absorbed.length) return moved
        const gone = new Set(r.absorbed.map((a) => r.state.trucks[a.truck].pos))
        return moved.filter((it) => !gone.has(it.pos))
      })
      if (r.absorbed.length) {
        idle.current = 0
        sfx.point()
      } else idle.current += 1
      if (r.completed.length) {
        sfx.match()
        vibrate(40)
      }
      boardRef.current = r.state
      setBoard(r.state)
    }, TICK_MS)
    return () => window.clearInterval(t)
  }, [playing, board === null, board ? beltCount(board) === 0 : true]) // eslint-disable-line react-hooks/exhaustive-deps

  // outcome checks
  useEffect(() => {
    if (!playing || !board || !level) return
    if (isWon(board)) {
      setOutcome('won')
      sfx.win()
      record('complete', level.n)
      return
    }
    const settled = beltCount(board) === 0 || idle.current >= board.belt.length
    if (settled && tapped && isJammed(board)) {
      setOutcome('jammed')
      sfx.lose()
      vibrate([80, 40, 80])
      if (!admin) fail(level.n)
    }
  }, [board, playing, level, tapped, admin, record, fail])

  function onTruck(i: number) {
    if (!board || !playing) return
    const err: TapError | null = canTap(board, i)
    if (err) {
      sfx.miss()
      setShake(i)
      window.setTimeout(() => setShake(null), 400)
      setMessage(
        err === 'belt-full'
          ? 'Belt is full! Wait for cubes to drop or free some space.'
          : err === 'locked'
            ? `Curtain closed - sort ${BLOCK_NAMES[board.trucks[i].lock ?? 0]} first.`
            : err === 'empty'
              ? 'This truck is empty.'
              : 'That truck is done.',
      )
      return
    }
    history.current.push(board)
    const r = tap(board, i)
    sfx.whoosh()
    const fresh: BeltItem[] = []
    r.state.belt.forEach((c, pos) => {
      if (c !== null && board.belt[pos] === null) fresh.push({ id: nextId.current++, color: c, pos })
    })
    idle.current = 0
    setItems((list) => [...list, ...fresh])
    setBoard(r.state)
    setTapped(true)
    setHintTruck(null)
    setMessage(null)
  }

  function undo() {
    const prev = history.current.pop()
    if (!prev || usesLeft('undo') <= 0) return
    setUses((u) => ({ ...u, undo: u.undo + 1 }))
    idle.current = 0
    setBoard(prev)
    setItems(itemsFromBelt(prev))
    setMessage('Undone.')
  }

  function extraSpace() {
    if (!board || usesLeft('space') <= 0) return
    setUses((u) => ({ ...u, space: u.space + 1 }))
    setBoard({ ...board, capacity: board.capacity + 2 })
    setMessage('Belt extended by 2 slots for this level.')
  }

  function hint() {
    if (!board || !level || usesLeft('hint') <= 0) return
    if (beltCount(board) > 0 && idle.current < board.belt.length) {
      setMessage('Wait for the belt to settle, then ask for a hint.')
      return
    }
    const path = solveDepthFirst(level, 40000, board)
    setUses((u) => ({ ...u, hint: u.hint + 1 }))
    if (!path || !path.length) {
      setMessage('No winning path from here - try Undo or restart.')
      return
    }
    setHintTruck(path[0])
    setMessage(`Try truck ${path[0] + 1}.`)
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

  const shell = 'mx-auto max-w-2xl overflow-hidden rounded-[2rem] bg-gradient-to-b from-[#5b3fd6] via-[#4227b0] to-[#2a1a6e] p-4 text-white sm:p-6'

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
            <li>Tap a truck to send its top cubes onto the looping belt.</li>
            <li>Cubes drop into the first truck they pass that is empty or has the same colour on top.</li>
            <li>Four of one colour completes a truck. Clear every cube to win.</li>
            <li>The belt only holds a few loads. If it jams with nowhere to go, you lose a life.</li>
            <li>From level 6 only the top cube of each truck is visible. Curtains open when their colour is sorted.</li>
            <li>Abilities per level: Undo, +2 belt space and a Hint (unlimited in Admin Mode).</li>
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
  if (!level || !board) return null
  const count = beltCount(board)
  return (
    <div className={shell}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => (costsLife ? setConfirm('leave') : setScreen('home'))}
          aria-label="Back to Loop Sort home"
          className="inline-flex size-10 items-center justify-center rounded-xl bg-black/20 hover:bg-black/30"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="rounded-full bg-black/25 px-3 py-1 font-display text-lg font-bold">Level {level.n}</div>
        <div className="flex items-center gap-1.5 rounded-full bg-black/25 px-3 py-1 text-sm font-bold" aria-label={`Belt ${count} of ${board.capacity}`}>
          <Boxes className="size-4" /> {count}/{board.capacity}
        </div>
        <div className="ml-auto">
          <LivesPill lives={account.lives} max={account.maxLives} nextLifeAt={account.nextLifeAt} admin={admin} />
        </div>
      </div>

      <div className="relative mt-3">
        <LoopBoard state={board} items={items} hidden={level.hidden} tickMs={TICK_MS} shakeTruck={shake} hintTruck={hintTruck} onTruck={onTruck} />
        {outcome && (
          <div className="absolute inset-0 flex items-center justify-center rounded-3xl bg-[#2a1a6e]/80 p-4 backdrop-blur-sm animate-fade-in" role="dialog" aria-modal="true" aria-label={outcome === 'won' ? 'Level complete' : 'Belt jammed'}>
            <div className="w-full max-w-xs rounded-3xl bg-white p-6 text-center text-[#2a1a6e] shadow-2xl">
              {outcome === 'won' ? (
                <>
                  <p className="text-5xl" aria-hidden>
                    🎉
                  </p>
                  <p className="mt-1 font-display text-3xl font-extrabold">Level {level.n} done!</p>
                  <div className="mt-4 grid gap-2">
                    {level.n < LEVELS.length && (
                      <Button onClick={() => startLevel(level.n + 1)} data-autofocus disabled={!canStartNormal}>
                        Next level
                      </Button>
                    )}
                    <Button variant="secondary" onClick={() => setScreen('home')}>
                      Home
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-5xl" aria-hidden>
                    🚧
                  </p>
                  <p className="mt-1 font-display text-3xl font-extrabold">Belt jammed!</p>
                  <p className="mt-1 text-sm">{admin ? 'Admin Mode: no life lost.' : `You lost a life. ${account.lives} left.`}</p>
                  <div className="mt-4 grid gap-2">
                    <Button onClick={() => startLevel(level.n)} disabled={!admin && account.lives <= 0} data-autofocus>
                      {!admin && account.lives <= 0 ? 'No lives left' : 'Try again'}
                    </Button>
                    <Button variant="secondary" onClick={() => setScreen('home')}>
                      Home
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <p className="mt-2 min-h-6 text-center text-sm text-[#e6e0ff]" aria-live="polite">
        {message}
      </p>

      <div className="mt-2 grid grid-cols-4 gap-2">
        {(
          [
            ['undo', 'Undo', <Undo2 key="u" className="size-5" />, undo, history.current.length === 0],
            ['space', '+2 Space', <Maximize2 key="s" className="size-5" />, extraSpace, false],
            ['hint', 'Hint', <Lightbulb key="h" className="size-5" />, hint, false],
          ] as const
        ).map(([key, label, icon, fn, disabledExtra]) => {
          const left = usesLeft(key)
          return (
            <button
              key={key}
              type="button"
              onClick={fn}
              disabled={!playing || left <= 0 || disabledExtra}
              className="relative flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-2xl bg-white/90 text-xs font-bold text-[#2a1a6e] shadow-[0_4px_0_0_rgba(0,0,0,0.25)] active:translate-y-0.5 disabled:opacity-40"
            >
              {icon}
              {label}
              <span className="absolute -right-1 -top-1 flex min-w-6 items-center justify-center rounded-full bg-[#ff4d5e] px-1 text-[11px] text-white">
                {left === Infinity ? '∞' : left}
              </span>
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => (costsLife ? setConfirm('restart') : startLevel(level.n))}
          className="flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-2xl bg-black/25 text-xs font-bold text-white"
        >
          <RotateCcw className="size-5" />
          Restart
        </button>
      </div>

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
        title="Leave Loop Sort?"
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
