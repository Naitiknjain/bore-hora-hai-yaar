import { CheckCircle2, CloudOff, Home, Pause, Play, RotateCcw, Trophy, WifiOff, XCircle } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { recordResult, startServerSession, subscribeResults, getResults, type RecordOptions } from '../../lib/offline-sync'
import type { GameMeta, StoredResult } from '../../types'
import { Button, LinkButton } from '../ui/Button'

export const GameMetaContext = createContext<GameMeta | null>(null)

export function useGameMeta(): GameMeta {
  const meta = useContext(GameMetaContext)
  if (!meta) throw new Error('useGameMeta must be used inside a game page')
  return meta
}

/** Card wrapper used by every start/results screen. */
export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-xl rounded-3xl border border-ink-700 bg-ink-800/90 p-5 shadow-xl sm:p-7 ${className}`}>{children}</div>
}

interface StartScreenProps {
  instructions: ReactNode
  children?: ReactNode
  onStart: () => void
  startLabel?: string
  startDisabled?: boolean
  extra?: ReactNode
}

export function StartScreen({ instructions, children, onStart, startLabel = 'Start', startDisabled, extra }: StartScreenProps) {
  const meta = useGameMeta()
  return (
    <Panel className="animate-pop">
      <div className="flex items-center gap-4">
        <div
          className="flex size-16 shrink-0 items-center justify-center rounded-2xl text-4xl"
          style={{ background: `linear-gradient(135deg, ${meta.colors.from}, ${meta.colors.to})` }}
          aria-hidden
        >
          {meta.emoji}
        </div>
        <div className="min-w-0">
          <h2 className="text-3xl font-extrabold leading-none text-ink-100">{meta.name}</h2>
          <p className="mt-1 text-ink-300">{meta.tagline}</p>
        </div>
      </div>
      <div className="mt-5 rounded-2xl bg-ink-900/60 p-4 text-sm leading-relaxed text-ink-200">
        <h3 className="mb-2 font-display text-base font-bold text-ink-100">How to play</h3>
        {instructions}
      </div>
      {children && <div className="mt-5 space-y-4">{children}</div>}
      <div className="mt-6 flex flex-wrap gap-2">
        <Button size="lg" className="flex-1" onClick={onStart} disabled={startDisabled} icon={<Play className="size-5" />} data-autofocus>
          {startLabel}
        </Button>
        {meta.leaderboard && (
          <LinkButton to={`/leaderboards/${meta.id}`} variant="secondary" size="lg" icon={<Trophy className="size-5" />}>
            <span className="sr-only sm:not-sr-only">Leaderboard</span>
          </LinkButton>
        )}
      </div>
      {extra}
    </Panel>
  )
}

export function OptionGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-400">{label}</div>
      {children}
    </div>
  )
}

interface PauseOverlayProps {
  open: boolean
  onResume: () => void
  onRestart?: () => void
  onHome: () => void
  children?: ReactNode
}

export function PauseOverlay({ open, onResume, onRestart, onHome, children }: PauseOverlayProps) {
  const resumeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (open) resumeRef.current?.focus()
  }, [open])
  if (!open) return null
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center rounded-[inherit] bg-ink-950/80 p-4 backdrop-blur-sm animate-fade-in" role="dialog" aria-modal="true" aria-label="Paused">
      <div className="w-full max-w-xs rounded-3xl border border-ink-600 bg-ink-800 p-5 text-center shadow-2xl">
        <p className="font-display text-3xl font-extrabold">Paused</p>
        <p className="mt-1 text-sm text-ink-300">Chai break? Game wait karega.</p>
        {children}
        <div className="mt-5 grid gap-2">
          <Button ref={resumeRef} onClick={onResume} icon={<Play className="size-5" />}>
            Resume
          </Button>
          {onRestart && (
            <Button variant="secondary" onClick={onRestart} icon={<RotateCcw className="size-5" />}>
              Restart
            </Button>
          )}
          <Button variant="secondary" onClick={onHome} icon={<Home className="size-5" />}>
            Home
          </Button>
        </div>
      </div>
    </div>
  )
}

export function PauseButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Pause"
      className="inline-flex size-11 items-center justify-center rounded-xl bg-ink-700 text-ink-100 hover:bg-ink-600 disabled:opacity-40"
    >
      <Pause className="size-5" />
    </button>
  )
}

/** Shows whether the result reached the shared leaderboard. */
export function SyncBadge({ result }: { result: StoredResult | null }) {
  const [, force] = useState(0)
  useEffect(() => subscribeResults(() => force((n) => n + 1)), [])
  if (!result) return null
  const live = getResults().find((r) => r.submissionId === result.submissionId) ?? result
  const map = {
    synced: { icon: <CheckCircle2 className="size-4" />, text: 'Saved to the online leaderboard', cls: 'text-pudina' },
    pending: { icon: <WifiOff className="size-4" />, text: 'Saved on this device - will sync when online', cls: 'text-masala' },
    rejected: { icon: <XCircle className="size-4" />, text: `Not accepted by the server (${live.error ?? 'invalid'})`, cls: 'text-lal' },
    'local-only': { icon: <CloudOff className="size-4" />, text: 'Saved on this device only', cls: 'text-ink-300' },
  } as const
  const s = map[live.status]
  return (
    <p className={`mt-3 flex items-center justify-center gap-1.5 text-sm ${s.cls}`} role="status">
      {s.icon}
      {s.text}
    </p>
  )
}

interface ResultsProps {
  title: ReactNode
  subtitle?: ReactNode
  emoji?: string
  stats?: ReactNode
  result?: StoredResult | null
  onReplay: () => void
  replayLabel?: string
  children?: ReactNode
}

export function ResultsScreen({ title, subtitle, emoji, stats, result, onReplay, replayLabel = 'Play again', children }: ResultsProps) {
  const meta = useGameMeta()
  return (
    <Panel className="animate-pop text-center">
      {emoji && (
        <div className="text-6xl motion-safe:animate-float" aria-hidden>
          {emoji}
        </div>
      )}
      <h2 className="mt-2 text-3xl font-extrabold text-ink-100 sm:text-4xl">{title}</h2>
      {subtitle && <p className="mt-1 text-ink-300">{subtitle}</p>}
      {stats && <div className="mt-5 grid grid-cols-2 gap-2 text-left sm:grid-cols-3">{stats}</div>}
      {children}
      <SyncBadge result={result ?? null} />
      <div className={`mt-6 grid gap-2 ${meta.leaderboard ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        <Button onClick={onReplay} icon={<RotateCcw className="size-5" />} data-autofocus>
          {replayLabel}
        </Button>
        <LinkButton to="/games" variant="secondary" icon={<Home className="size-5" />}>
          Home
        </LinkButton>
        {meta.leaderboard && (
          <LinkButton to={`/leaderboards/${meta.id}`} variant="secondary" icon={<Trophy className="size-5" />}>
            Leaderboard
          </LinkButton>
        )}
      </div>
    </Panel>
  )
}

/**
 * Result recording helper: requests a server session when a run starts and attaches it
 * to the finished result.
 */
export function useResultRecorder() {
  const meta = useGameMeta()
  const session = useRef<Promise<string | null> | null>(null)

  const beginRun = useCallback(
    (board: string) => {
      session.current = startServerSession(meta.id, board)
    },
    [meta.id],
  )

  const finishRun = useCallback(
    async (opts: Omit<RecordOptions, 'gameId'>): Promise<StoredResult | null> => {
      const sessionId = session.current ? await Promise.race([session.current, new Promise<null>((r) => setTimeout(() => r(null), 1500))]) : null
      session.current = null
      return recordResult({ ...opts, gameId: meta.id, sessionId: opts.localOnly ? null : sessionId })
    },
    [meta.id],
  )

  return { beginRun, finishRun }
}
