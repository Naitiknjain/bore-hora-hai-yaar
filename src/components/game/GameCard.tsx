import { Users } from 'lucide-react'
import { Link } from 'react-router'
import type { GameMeta } from '../../types'

export function GameCard({ game, size = 'md' }: { game: GameMeta; size?: 'md' | 'lg' }) {
  return (
    <Link
      to={`/games/${game.id}`}
      className="group relative flex flex-col overflow-hidden rounded-3xl border border-white/5 bg-ink-800 transition duration-200 hover:-translate-y-1 hover:border-white/15 hover:shadow-xl focus-visible:-translate-y-1"
      aria-label={`Play ${game.name}`}
    >
      <div
        className={`relative flex items-center justify-center overflow-hidden ${size === 'lg' ? 'h-40' : 'h-28'}`}
        style={{ background: `linear-gradient(135deg, ${game.colors.from}, ${game.colors.to})` }}
      >
        <div className="bg-dots absolute inset-0 opacity-60" />
        <span
          className={`relative drop-shadow-[0_6px_10px_rgba(0,0,0,0.35)] transition duration-300 group-hover:scale-110 group-hover:-rotate-6 ${size === 'lg' ? 'text-7xl' : 'text-5xl'}`}
          aria-hidden
        >
          {game.emoji}
        </span>
        <span className="absolute left-3 top-3 rounded-full bg-ink-950/50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white backdrop-blur">
          {game.category}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="text-xl font-bold leading-tight text-ink-100">{game.name}</h3>
        <p className="text-sm text-ink-300">{game.tagline}</p>
        <div className="mt-auto flex items-center gap-1.5 pt-2 text-xs font-semibold text-ink-400">
          <Users className="size-3.5" aria-hidden />
          {game.players}
        </div>
      </div>
    </Link>
  )
}
