import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react'
import type { ReactNode } from 'react'
import type { SwipeDir } from '../../hooks/useGameLoop'

/** Big press-and-hold friendly button for touch controls (fires on pointerdown for zero latency). */
export function TouchButton({
  label,
  children,
  onPress,
  onRelease,
  className = '',
}: {
  label: string
  children: ReactNode
  onPress: () => void
  onRelease?: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`game-surface flex min-h-14 min-w-14 items-center justify-center rounded-2xl bg-ink-700 text-ink-100 shadow-[0_3px_0_0_#141b31] active:translate-y-[2px] active:bg-ink-600 active:shadow-none ${className}`}
      onPointerDown={(e) => {
        e.preventDefault()
        ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
        onPress()
      }}
      onPointerUp={() => onRelease?.()}
      onPointerCancel={() => onRelease?.()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onPress()
        }
      }}
      onKeyUp={() => onRelease?.()}
    >
      {children}
    </button>
  )
}

export function DPad({ onDirection, className = '' }: { onDirection: (d: SwipeDir) => void; className?: string }) {
  const cls = 'size-16'
  return (
    <div className={`mx-auto grid w-max grid-cols-3 gap-2 ${className}`} aria-label="Direction pad">
      <span />
      <TouchButton label="Up" className={cls} onPress={() => onDirection('up')}>
        <ArrowUp className="size-7" />
      </TouchButton>
      <span />
      <TouchButton label="Left" className={cls} onPress={() => onDirection('left')}>
        <ArrowLeft className="size-7" />
      </TouchButton>
      <TouchButton label="Down" className={cls} onPress={() => onDirection('down')}>
        <ArrowDown className="size-7" />
      </TouchButton>
      <TouchButton label="Right" className={cls} onPress={() => onDirection('right')}>
        <ArrowRight className="size-7" />
      </TouchButton>
    </div>
  )
}

export function Hud({ children }: { children: ReactNode }) {
  return <div className="mx-auto mb-3 flex w-full max-w-3xl flex-wrap items-center gap-2">{children}</div>
}

export function HudStat({ label, value, accent }: { label: string; value: ReactNode; accent?: string }) {
  return (
    <div className="min-w-[4.5rem] rounded-2xl bg-ink-800 px-3 py-1.5" aria-live="polite">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">{label}</div>
      <div className="font-display text-lg font-bold leading-tight tabular-nums" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
    </div>
  )
}
