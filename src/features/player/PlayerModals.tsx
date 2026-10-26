import { Check, Copy, Download, KeyRound, ShieldAlert } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { friendlyError } from '../../lib/supabase'
import { looksLikePlayerCode, usePlayer, validateNickname } from './PlayerContext'
import { handOffRecoveryCode } from './recovery-handoff'

interface NicknameFieldProps {
  value: string
  onChange: (v: string) => void
  id?: string
  /** Called with the full pasted text when a player code is pasted (before the 20-character limit cuts it). */
  onCodePaste?: (code: string) => void
}

export function NicknameField({ value, onChange, id = 'nickname', onCodePaste }: NicknameFieldProps) {
  const [pastedCode, setPastedCode] = useState(false)
  const codeLike = pastedCode || looksLikePlayerCode(value)
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink-200">
        Nickname
      </label>
      <input
        id={id}
        value={value}
        maxLength={20}
        autoComplete="nickname"
        onChange={(e) => {
          setPastedCode(false)
          onChange(e.target.value)
        }}
        onPaste={(e) => {
          const text = e.clipboardData.getData('text')
          if (!looksLikePlayerCode(text)) return
          // never let a secret code become a (public) nickname
          e.preventDefault()
          if (onCodePaste) onCodePaste(text.trim())
          else setPastedCode(true)
        }}
        aria-describedby={`${id}-hint`}
        placeholder="e.g. Pappu Gamer"
        className="min-h-12 w-full rounded-2xl border border-ink-600 bg-ink-900 px-4 text-lg text-ink-100 placeholder:text-ink-500 focus:border-masala focus:outline-none"
      />
      {codeLike ? (
        <p id={`${id}-hint`} role="alert" className="mt-1 text-xs text-lal">
          That looks like a private player code. Never use it as a nickname - to restore a profile, use{' '}
          <Link to="/recover" className="font-semibold underline">
            Recover player
          </Link>
          .
        </p>
      ) : (
        <p id={`${id}-hint`} className="mt-1 text-xs text-ink-400">
          2-20 characters. Nicknames don't need to be unique.
        </p>
      )}
    </div>
  )
}

export function OnboardingModal() {
  const { status, createPlayer, backend } = usePlayer()
  const location = useLocation()
  const navigate = useNavigate()
  const [nick, setNick] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const open = status === 'onboarding' && location.pathname !== '/recover'

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (looksLikePlayerCode(nick)) {
      setError('That is a player code, not a nickname. Use "Use your player code" below to restore your profile.')
      return
    }
    if (!validateNickname(nick)) {
      setError('Nickname must be 2-20 characters (no < or >).')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await createPlayer(nick)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} dismissible={false} title={<>Arre, welcome! 👋</>}>
      <form onSubmit={submit} className="space-y-4">
        <p>
          Bore ho rahe ho? Perfect jagah. Pick a nickname to start playing - no email, no password.
          {backend ? ' We will give you a private player code to use your profile on other devices.' : ''}
        </p>
        <NicknameField
          value={nick}
          onChange={setNick}
          onCodePaste={
            backend
              ? (code) => {
                  handOffRecoveryCode(code)
                  navigate('/recover')
                }
              : undefined
          }
        />
        {error && (
          <p role="alert" className="text-sm text-lal">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? 'Setting up...' : "Let's play"}
        </Button>
        {backend && (
          <p className="text-center text-sm text-ink-300">
            Played before on another device?{' '}
            <Link to="/recover" className="font-semibold text-neela underline-offset-2 hover:underline">
              Use your player code
            </Link>
          </p>
        )}
      </form>
    </Modal>
  )
}

export function CodeDisplay({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }
  function download() {
    const blob = new Blob(
      [`bore-hora-hai-yaar private player code\n\n${code}\n\nKeep this secret. Anyone with this code can play as you.\nUse it on the "Recover player" page to continue on another device.\n`],
      { type: 'text/plain' },
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'bore-hora-hai-yaar-player-code.txt'
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <div className="space-y-2">
      <div className="select-all break-all rounded-2xl border-2 border-dashed border-masala/60 bg-ink-900 px-4 py-3 text-center font-mono text-lg font-bold tracking-wider text-masala sm:text-xl">
        {code}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={copy} icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button variant="secondary" onClick={download} icon={<Download className="size-4" />}>
          Save .txt
        </Button>
      </div>
    </div>
  )
}

export function IssuedCodeModal() {
  const { issuedCode, dismissIssuedCode } = usePlayer()
  const [ack, setAck] = useState(false)
  if (!issuedCode) return null
  return (
    <Modal
      open
      dismissible={false}
      title={
        <span className="flex items-center gap-2">
          <KeyRound className="size-6 text-masala" /> Your private player code
        </span>
      }
      footer={
        <Button
          disabled={!ack}
          onClick={() => {
            setAck(false)
            dismissIssuedCode()
          }}
        >
          Done
        </Button>
      }
    >
      <div className="space-y-4">
        <p>
          This code is the <strong>only</strong> way to use this profile on another device. It is shown just this once.
        </p>
        <CodeDisplay code={issuedCode} />
        <div className="flex gap-2 rounded-2xl bg-lal/10 p-3 text-sm text-ink-200">
          <ShieldAlert className="size-5 shrink-0 text-lal" />
          <p>
            Treat it like a password: don't post it in the group chat. If you lose both this code and this device, the profile cannot be
            recovered. While this device is still linked you can generate a new code from your profile.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-ink-100">
          <input type="checkbox" className="size-5 accent-[#ffd23f]" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          I've saved my code
        </label>
      </div>
    </Modal>
  )
}
