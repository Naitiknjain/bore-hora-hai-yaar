import type { ButtonHTMLAttributes, ReactNode } from 'react'

/**
 * Chakkar Cubes UI kit: chunky, toy-like HUD pills, round 3D ability buttons and popup cards.
 * Original styling drawn in code, in the reference's palette: navy pills with a purple rim, gold-rimmed
 * square ability buttons on a navy board.
 */

export function HudPill({ children, tone = 'default', label, testId }: { children: ReactNode; tone?: 'default' | 'danger'; label?: string; testId?: string }) {
  return (
    <div
      className={`flex h-10 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-xl border-[3px] px-2 font-display text-base min-[380px]:gap-1.5 min-[380px]:text-lg min-[420px]:px-3 font-extrabold leading-none shadow-[inset_0_2px_0_rgba(255,255,255,0.06),0_3px_0_rgba(6,4,24,0.45)] ${
        tone === 'danger' ? 'border-[#ff9aa6] bg-[#c42840] text-white' : 'border-[#8b5de2] bg-[#0c1360] text-[#e4e8f6]'
      }`}
      aria-label={label}
      data-testid={testId}
    >
      {children}
    </div>
  )
}

export function RoundIconButton({ label, children, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`flex size-9 shrink-0 items-center min-[380px]:size-10 justify-center rounded-xl border-2 border-[#b9a4ff] bg-gradient-to-b from-[#8a55f5] to-[#5a28d8] text-white shadow-[inset_0_-3px_0_rgba(0,0,0,0.28),0_3px_0_rgba(6,4,24,0.5)] transition active:translate-y-0.5 active:shadow-[inset_0_-1px_0_rgba(0,0,0,0.3)] disabled:opacity-40 ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

interface AbilityProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode
  name: string
  count: number
  active?: boolean
}

/**
 * Square, gold-rimmed ability button with a green count badge (∞ in Admin Mode), like the reference's
 * bottom bar. Used up or unavailable abilities turn grey. The name is the accessible label and tooltip.
 */
export function AbilityButton({ icon, name, count, active, disabled, ...rest }: AbilityProps) {
  const off = disabled && !active
  return (
    <button type="button" disabled={disabled} title={name} className="group flex min-w-0 justify-center disabled:cursor-not-allowed" {...rest}>
      <span
        className={`relative flex size-13 items-center justify-center rounded-[1.1rem] border-[3px] transition group-active:translate-y-0.5 min-[380px]:size-15 short:!size-12 ${
          active
            ? 'border-[#fff3b0] bg-gradient-to-b from-[#ffe066] to-[#f0a800] text-[#3a2200] shadow-[0_0_0_4px_rgba(255,210,63,0.35),inset_0_-4px_0_rgba(0,0,0,0.2),0_4px_0_#8a5a00]'
            : off
              ? 'border-[#a3a3a3] bg-gradient-to-b from-[#9a9a9a] to-[#6a6a6a] text-[#f2f2f2] shadow-[inset_0_-4px_0_rgba(0,0,0,0.25),0_4px_0_#3a3a3a]'
              : 'border-[#f5b93c] bg-gradient-to-b from-[#9a62f2] via-[#6e39ee] to-[#3a12c4] text-white shadow-[inset_0_-4px_0_rgba(0,0,0,0.25),0_4px_0_#7a4b15]'
        }`}
      >
        <span className="pointer-events-none absolute inset-x-2.5 top-1 h-2.5 rounded-full bg-white/25" aria-hidden />
        {icon}
        <span
          className={`absolute -bottom-1.5 -right-1.5 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white px-1 text-xs font-extrabold text-white ${
            count > 0 ? 'bg-[#2fb84d]' : 'bg-[#8a8aa8]'
          }`}
        >
          {count === Infinity ? '∞' : count}
        </span>
      </span>
    </button>
  )
}

/** Truck seen from the front with a "+1" sign (Extra Truck). */
export function TruckPlusIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path d="M7 5.5h18a3 3 0 0 1 3 3V23a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8.5a3 3 0 0 1 3-3Z" fill="currentColor" />
      <rect x="7.5" y="9" width="17" height="7" rx="2" fill="#3a12c4" opacity="0.55" />
      <text x="16" y="15" textAnchor="middle" fontSize="7" fontWeight="900" fill="currentColor" fontFamily="system-ui">+1</text>
      <circle cx="9" cy="20.5" r="1.8" fill="#ffd23f" />
      <circle cx="23" cy="20.5" r="1.8" fill="#ffd23f" />
      <rect x="6" y="25" width="5" height="3.5" rx="1.2" fill="currentColor" />
      <rect x="21" y="25" width="5" height="3.5" rx="1.2" fill="currentColor" />
    </svg>
  )
}

/** A conveyor slot with a "+1" (one more belt space). */
export function SlotPlusIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="3" y="12" width="26" height="12" rx="6" fill="none" stroke="currentColor" strokeWidth="2.6" />
      <rect x="7" y="14.8" width="6.4" height="6.4" rx="1.6" fill="currentColor" />
      <path d="M21.5 14.2v8M17.5 18.2h8" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  )
}

type ChunkyTone = 'green' | 'yellow' | 'red' | 'purple'
const TONES: Record<ChunkyTone, string> = {
  green: 'from-[#5ff09b] to-[#1fb35f] text-[#063019] shadow-[inset_0_-4px_0_rgba(0,0,0,0.18),0_4px_0_#137a40] border-[#b8ffd5]',
  yellow: 'from-[#ffe066] to-[#f2b300] text-[#3a2200] shadow-[inset_0_-4px_0_rgba(0,0,0,0.15),0_4px_0_#9a6c00] border-[#fff3b0]',
  red: 'from-[#ff7a8a] to-[#e0304c] text-white shadow-[inset_0_-4px_0_rgba(0,0,0,0.2),0_4px_0_#8f1a2c] border-[#ffc2ca]',
  purple: 'from-[#9a78ff] to-[#5a34d4] text-white shadow-[inset_0_-4px_0_rgba(0,0,0,0.25),0_4px_0_#2a1870] border-[#c3b3ff]',
}

export function ChunkyButton({ tone = 'green', children, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ChunkyTone }) {
  return (
    <button
      type="button"
      className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 bg-gradient-to-b px-4 py-2 font-display text-base font-extrabold leading-tight min-[380px]:text-lg transition active:translate-y-0.5 disabled:opacity-45 ${TONES[tone]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

/** Popup card shown over the board (level complete, Out of Space, ...). */
export function Popup({ label, emoji, title, children }: { label: string; emoji: string; title: ReactNode; children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-3xl bg-[#0d0b26]/70 p-4 backdrop-blur-[2px] animate-fade-in" role="dialog" aria-modal="true" aria-label={label}>
      <div className="w-full max-w-[19rem] animate-pop overflow-hidden rounded-[1.75rem] border-[3px] border-[#a98bf0] bg-gradient-to-b from-[#7a5ce0] to-[#4a32a8] p-1 shadow-[0_10px_0_#1a1640,0_20px_40px_rgba(0,0,0,0.5)]">
        <div className="rounded-[1.45rem] bg-gradient-to-b from-[#ffffff] to-[#ece6ff] px-5 pb-5 pt-4 text-center text-[#2a1a6e]">
          <div className="-mt-1 text-5xl drop-shadow-[0_4px_0_rgba(42,26,110,0.2)]" aria-hidden>
            {emoji}
          </div>
          <p className="mt-1 font-display text-[1.75rem] font-extrabold leading-tight">{title}</p>
          {children}
        </div>
      </div>
    </div>
  )
}
