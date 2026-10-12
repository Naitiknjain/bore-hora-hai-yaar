import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'

export interface SegmentOption<T extends string> {
  value: T
  label: ReactNode
  hint?: string
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = 'md',
}: {
  value: T
  options: SegmentOption<T>[]
  onChange: (v: T) => void
  label: string
  size?: 'sm' | 'md'
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex w-full flex-wrap gap-1 rounded-2xl bg-ink-900/70 p-1">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.hint}
            onClick={() => onChange(o.value)}
            className={`flex-1 rounded-xl px-3 font-semibold transition ${size === 'sm' ? 'min-h-9 text-sm' : 'min-h-11'} ${
              active ? 'bg-masala text-ink-950 shadow' : 'text-ink-300 hover:bg-white/5 hover:text-ink-100'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl bg-ink-800 p-4">
      <span>
        <span className="block font-semibold text-ink-100">{label}</span>
        {description && <span className="mt-0.5 block text-sm text-ink-300">{description}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-7 w-12 rounded-full bg-ink-600 transition peer-checked:bg-pudina peer-focus-visible:outline-3 peer-focus-visible:outline-masala" />
        <span className="absolute left-1 top-1 size-5 rounded-full bg-white transition peer-checked:translate-x-5" />
      </span>
    </label>
  )
}

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'warn' | 'ok' | 'info' | 'danger' }) {
  const tones = {
    default: 'bg-white/8 text-ink-200',
    warn: 'bg-masala/15 text-masala',
    ok: 'bg-pudina/15 text-pudina',
    info: 'bg-neela/15 text-neela',
    danger: 'bg-lal/15 text-lal',
  }
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-ink-300">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span>{label}</span>
    </span>
  )
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-ink-600 px-6 py-10 text-center">
      {icon && <div className="text-4xl">{icon}</div>}
      <p className="font-display text-xl font-bold text-ink-100">{title}</p>
      {children && <div className="max-w-md text-sm text-ink-300">{children}</div>}
    </div>
  )
}

export function Stat({ label, value, accent }: { label: string; value: ReactNode; accent?: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-ink-900/60 px-3 py-2">
      <div className="truncate text-[11px] font-semibold uppercase tracking-wider text-ink-400">{label}</div>
      <div className="truncate font-display text-xl font-bold leading-tight" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
    </div>
  )
}
