import { KeyRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/Controls'
import { friendlyError } from '../../lib/supabase'
import { usePlayer } from './PlayerContext'

export function RecoverPage() {
  const { backend, recover, player, online, status } = usePlayer()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!backend) {
    return (
      <EmptyState icon="🔌" title="Recovery needs the online backend">
        This copy of the site runs in local-only mode, so profiles live only in this browser and can't be moved to another device.
      </EmptyState>
    )
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (code.replace(/[^a-z0-9]/gi, '').length < 16) {
      setError('That looks too short. Codes look like BHHY-XXXX-XXXX-XXXX-XXXX.')
      return
    }
    setBusy(true)
    try {
      await recover(code)
      navigate('/profile', { replace: true })
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-3xl border border-white/5 bg-ink-800 p-6">
        <h1 className="flex items-center gap-2 text-3xl font-extrabold">
          <KeyRound className="size-7 text-masala" /> Recover player
        </h1>
        <p className="mt-2 text-ink-300">Enter the private code you saved when you created your profile. This browser will be linked to that player.</p>
        {status === 'ready' && player && (
          <p className="mt-3 rounded-2xl bg-santra/10 p-3 text-sm text-santra">
            This browser is currently <strong>{player.nickname}</strong>. Recovering switches to the other player
            {player.registered ? '' : ' and results that never synced stay attached to the old local profile'}.
          </p>
        )}
        <form onSubmit={submit} className="mt-5 space-y-4">
          <div>
            <label htmlFor="code" className="mb-1.5 block text-sm font-semibold">
              Player code
            </label>
            <input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="BHHY-XXXX-XXXX-XXXX-XXXX"
              className="min-h-12 w-full rounded-2xl border border-ink-600 bg-ink-900 px-4 font-mono text-lg tracking-wider text-ink-100 placeholder:text-ink-500 focus:border-masala focus:outline-none"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-lal">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={busy || !online}>
            {busy ? 'Checking...' : online ? 'Recover' : 'You are offline'}
          </Button>
        </form>
        <p className="mt-4 text-xs text-ink-400">
          For security, only a few attempts are allowed every 15 minutes. If you lost the code and no longer have the original device, the profile
          cannot be recovered.
        </p>
      </div>
    </div>
  )
}
