import { CloudUpload, KeyRound, LogOut, Pencil, RefreshCw } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Button } from '../../components/ui/Button'
import { Badge, EmptyState } from '../../components/ui/Controls'
import { ConfirmDialog, Modal } from '../../components/ui/Modal'
import { GAME_BY_ID } from '../../games/registry'
import { useResults } from '../../hooks/useResults'
import { syncPending } from '../../lib/offline-sync'
import { formatMs } from '../../lib/scoring'
import { friendlyError } from '../../lib/supabase'
import type { GameId, StoredResult } from '../../types'
import { usePlayer } from '../player/PlayerContext'
import { CodeDisplay, NicknameField } from '../player/PlayerModals'

function describe(r: StoredResult): string {
  const m = r.metrics
  switch (r.gameId) {
    case 'memory-match':
    case 'sudoku':
      return formatMs(m.timeMs)
    case 'typing-racer':
      return `${m.wpm} WPM`
    case 'ludo':
      return `#${m.position} (${m.points} pts)`
    case 'tic-tac-toe':
      return m.result === 1 ? 'Win' : m.result === 0 ? 'Draw' : 'Loss'
    case 'pong':
      return `${m.playerScore}-${m.cpuScore}`
    default:
      return `${m.score ?? '-'} pts`
  }
}

export function ProfilePage() {
  const { player, backend, online, rename, rotateCode, forgetDevice, retryRegistration } = usePlayer()
  const results = useResults()
  const [editing, setEditing] = useState(false)
  const [nick, setNick] = useState(player?.nickname ?? '')
  const [msg, setMsg] = useState<string | null>(null)
  const [newCode, setNewCode] = useState<string | null>(null)
  const [confirmRotate, setConfirmRotate] = useState(false)
  const [confirmForget, setConfirmForget] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!player) {
    return (
      <EmptyState icon="🙋" title="No player yet">
        Pick a nickname to start - or <Link to="/recover" className="text-neela underline">recover with your code</Link>.
      </EmptyState>
    )
  }

  const mine = results.filter((r) => r.playerKey === player.id)
  const pending = mine.filter((r) => r.status === 'pending').length
  const byGame = new Map<GameId, StoredResult[]>()
  mine.forEach((r) => byGame.set(r.gameId, [...(byGame.get(r.gameId) ?? []), r]))

  async function saveNick(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      await rename(nick)
      setEditing(false)
    } catch (err) {
      setMsg(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  async function doRotate() {
    setConfirmRotate(false)
    setBusy(true)
    setMsg(null)
    try {
      setNewCode(await rotateCode())
    } catch (err) {
      setMsg(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/5 bg-ink-800 p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex size-16 items-center justify-center rounded-3xl bg-gulabi/20 font-display text-4xl font-bold text-gulabi" aria-hidden>
            {player.nickname.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-3xl font-extrabold">{player.nickname}</h1>
            <p className="text-sm text-ink-400">Playing since {new Date(player.createdAt).toLocaleDateString()}</p>
          </div>
          <Button variant="secondary" size="sm" icon={<Pencil className="size-4" />} onClick={() => (setNick(player.nickname), setEditing(true))}>
            Change nickname
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {!backend && <Badge>Local-only mode (no backend configured)</Badge>}
          {backend && player.registered && <Badge tone="ok">Online profile</Badge>}
          {backend && !player.registered && <Badge tone="warn">Not registered online yet</Badge>}
          {pending > 0 && <Badge tone="warn">{pending} result(s) waiting to sync</Badge>}
        </div>
        {msg && (
          <p role="alert" className="mt-3 text-sm text-lal">
            {msg}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {backend && !player.registered && (
            <Button size="sm" disabled={!online || busy} icon={<CloudUpload className="size-4" />} onClick={() => retryRegistration().catch((e) => setMsg(friendlyError(e)))}>
              Register online now
            </Button>
          )}
          {pending > 0 && (
            <Button size="sm" variant="secondary" disabled={!online} icon={<RefreshCw className="size-4" />} onClick={() => void syncPending()}>
              Sync now
            </Button>
          )}
        </div>
      </section>

      {backend && player.registered && (
        <section className="rounded-3xl border border-white/5 bg-ink-800 p-5 sm:p-7">
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <KeyRound className="size-5 text-masala" /> Private player code
          </h2>
          <p className="mt-2 text-sm text-ink-300">
            Your code was shown once when you joined. It is never stored in readable form, so we can't show it again. Lost it? Generate a new
            one while this device is still linked - the old code stops working immediately.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" disabled={busy || !online} onClick={() => setConfirmRotate(true)}>
              Generate a new code
            </Button>
            <Link to="/recover" className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-neela hover:underline">
              Switch to another player with a code →
            </Link>
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-2xl font-bold">Your stats on this device</h2>
        {byGame.size === 0 ? (
          <EmptyState icon="🎯" title="Abhi tak kuch nahi khela">
            Finish a game and your results show up here.
          </EmptyState>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...byGame.entries()].map(([id, list]) => {
              const g = GAME_BY_ID[id]
              const last = list[list.length - 1]
              return (
                <li key={id} className="rounded-2xl border border-white/5 bg-ink-800 p-4">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl" aria-hidden>
                      {g.emoji}
                    </span>
                    <span className="font-bold">{g.name}</span>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-1 text-sm">
                    <dt className="text-ink-400">Results</dt>
                    <dd className="text-right font-semibold">{list.length}</dd>
                    <dt className="text-ink-400">Last</dt>
                    <dd className="text-right font-semibold">{describe(last)}</dd>
                    <dt className="text-ink-400">Unsynced</dt>
                    <dd className="text-right font-semibold">{list.filter((r) => r.status === 'pending').length}</dd>
                  </dl>
                  {g.leaderboard && (
                    <Link to={`/leaderboards/${id}`} className="mt-2 inline-block text-sm font-semibold text-neela hover:underline">
                      Leaderboard →
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="rounded-3xl border border-lal/20 bg-ink-800 p-5">
        <h2 className="text-lg font-bold">Forget this device</h2>
        <p className="mt-1 text-sm text-ink-300">
          Removes your profile, unsynced results and settings from this browser.
          {backend && player.registered ? ' Your online profile stays - you can come back with your player code.' : ' Without a backend this cannot be undone.'}
        </p>
        <Button variant="danger" size="sm" className="mt-3" icon={<LogOut className="size-4" />} onClick={() => setConfirmForget(true)}>
          Forget this device
        </Button>
      </section>

      <Modal open={editing} onClose={() => setEditing(false)} title="Change nickname" size="sm">
        <form onSubmit={saveNick} className="space-y-4">
          <NicknameField id="rename" value={nick} onChange={setNick} />
          <Button type="submit" className="w-full" disabled={busy}>
            Save
          </Button>
        </form>
      </Modal>

      <Modal open={newCode != null} onClose={() => setNewCode(null)} title="Your new player code">
        {newCode && (
          <div className="space-y-3">
            <p>Save this now - it replaces your old code and will not be shown again.</p>
            <CodeDisplay code={newCode} />
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmRotate}
        title="Generate a new code?"
        message="Your current code will stop working on other devices that haven't used it yet. Devices already linked stay linked."
        confirmLabel="Generate"
        onConfirm={doRotate}
        onCancel={() => setConfirmRotate(false)}
      />
      <ConfirmDialog
        open={confirmForget}
        danger
        title="Forget this device?"
        message={pending > 0 ? `You have ${pending} unsynced result(s) that will be lost.` : 'You can recover your online profile later with your player code.'}
        confirmLabel="Forget"
        onConfirm={() => {
          setConfirmForget(false)
          void forgetDevice()
        }}
        onCancel={() => setConfirmForget(false)}
      />
    </div>
  )
}
