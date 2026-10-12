import { Search, X } from 'lucide-react'
import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { GameCard } from '../../components/game/GameCard'
import { EmptyState } from '../../components/ui/Controls'
import { CATEGORIES, searchGames } from '../../games/registry'
import type { GameCategory } from '../../types'

/** Search + category filter + grid. State lives in the URL so it survives refresh and sharing. */
export function GameBrowser({ headingId }: { headingId?: string }) {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const rawCat = params.get('category')
  const category: GameCategory | 'All' = CATEGORIES.includes(rawCat as GameCategory) ? (rawCat as GameCategory) : 'All'
  const results = useMemo(() => searchGames(query, category), [query, category])

  function update(next: { q?: string; category?: string }) {
    const p = new URLSearchParams(params)
    if (next.q !== undefined) {
      if (next.q) p.set('q', next.q)
      else p.delete('q')
    }
    if (next.category !== undefined) {
      if (next.category && next.category !== 'All') p.set('category', next.category)
      else p.delete('category')
    }
    setParams(p, { replace: true, preventScrollReset: true })
  }

  return (
    <section aria-labelledby={headingId}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-ink-400" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => update({ q: e.target.value })}
            placeholder="Search games..."
            aria-label="Search games by name"
            className="min-h-12 w-full rounded-2xl border border-ink-700 bg-ink-800 pl-11 pr-10 text-ink-100 placeholder:text-ink-400 focus:border-masala focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => update({ q: '' })}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink-400 hover:text-ink-100"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label="Filter by category">
          {(['All', ...CATEGORIES] as const).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => update({ category: c })}
              className={`min-h-11 shrink-0 rounded-2xl px-4 text-sm font-semibold transition ${
                category === c ? 'bg-masala text-ink-950' : 'bg-ink-800 text-ink-300 hover:bg-ink-700 hover:text-ink-100'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-4 text-sm text-ink-400" aria-live="polite">
        {results.length} {results.length === 1 ? 'game' : 'games'}
      </p>

      {results.length ? (
        <div className="mt-3 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid="game-grid">
          {results.map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
        </div>
      ) : (
        <div className="mt-3">
          <EmptyState icon="🤷" title="Koi game nahi mila">
            Nothing matches "{query}". Try another name or clear the filter.
          </EmptyState>
        </div>
      )}
    </section>
  )
}
