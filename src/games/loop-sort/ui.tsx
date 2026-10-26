import type { ButtonHTMLAttributes, ReactNode } from 'react'

/**
 * Chakkar Cubes UI kit: chunky, toy-like HUD pills, round 3D ability buttons and popup cards.
 * Original styling (no reference assets), tuned to the dark-purple board.
 */

export function HudPill({ children, tone = 'default', label, testId }: { children: ReactNode; tone?: 'default' | 'danger'; label?: string; testId?: string }) {
  return (
    <div
      className={`flex h-10 shrink-0 items-center gap-1 whitespace-nowrap rounded-2xl border-2 px-2 font-display text-base min-[380px]:gap-1.5 min-[380px]:px-3 min-[380px]:text-lg font-extrabold leading-none text-white shadow-[inset_0_-3px_0_rgba(0,0,0,0.35),0_3px_0_rgba(8,3,30,0.5)] ${
        tone === 'danger' ? 'border-[#ff9aa6] bg-[#d92d48]' : 'border-[#8f78ff] bg-[#1d1458]'
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
      className={`flex size-9 shrink-0 items-center min-[380px]:size-10 justify-center rounded-2xl border-2 border-[#b7a6ff] bg-gradient-to-b from-[#8f6bff] to-[#5b37d6] text-white shadow-[inset_0_-3px_0_rgba(0,0,0,0.3),0_3px_0_rgba(8,3,30,0.55)] transition active:translate-y-0.5 active:shadow-[inset_0_-1px_0_rgba(0,0,0,0.3)] disabled:opacity-40 ${className}`}
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

/** Round, raised ability button with a count badge (∞ in Admin Mode). */
export function AbilityButton({ icon, name, count, active, disabled, ...rest }: AbilityProps) {
  return (
    <button type="button" disabled={disabled} className="group flex min-w-0 flex-col items-center gap-1 disabled:cursor-not-allowed" {...rest}>
      <span
        className={`relative flex size-12 items-center min-[360px]:size-14 justify-center rounded-full border-[3px] text-white transition group-active:translate-y-0.5 min-[380px]:size-16 short:!size-11 ${
          active
            ? 'border-[#fff3b0] bg-gradient-to-b from-[#ffe066] to-[#f0a800] text-[#3a2200] shadow-[0_0_0_4px_rgba(255,210,63,0.35),inset_0_-4px_0_rgba(0,0,0,0.2),0_4px_0_#8a5a00]'
            : 'border-[#c3b3ff] bg-gradient-to-b from-[#9a78ff] to-[#5a34d4] shadow-[inset_0_-4px_0_rgba(0,0,0,0.3),0_4px_0_#2a1870]'
        } ${disabled ? 'opacity-45 saturate-50' : ''}`}
      >
        <span className="pointer-events-none absolute inset-x-3 top-1.5 h-3 rounded-full bg-white/25" aria-hidden />
        {icon}
        <span
          className={`absolute -bottom-1 -right-1 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white px-1 text-xs font-extrabold text-white ${
            count > 0 ? 'bg-[#22c061]' : 'bg-[#8a8aa8]'
          }`}
        >
          {count === Infinity ? '∞' : count}
        </span>
      </span>
      <span className="max-w-full truncate text-[10px] font-bold min-[360px]:text-[11px] short:hidden text-[#e6deff] sm:text-xs">{name}</span>
    </button>
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
    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-3xl bg-[#0d0730]/70 p-4 backdrop-blur-[2px] animate-fade-in" role="dialog" aria-modal="true" aria-label={label}>
      <div className="w-full max-w-[19rem] animate-pop overflow-hidden rounded-[1.75rem] border-[3px] border-[#b7a6ff] bg-gradient-to-b from-[#6c49f0] to-[#3a1fa8] p-1 shadow-[0_10px_0_#1d0f5c,0_20px_40px_rgba(0,0,0,0.5)]">
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
