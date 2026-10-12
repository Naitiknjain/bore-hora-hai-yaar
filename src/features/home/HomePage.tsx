import { Dices, History, Play, Trophy } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { GameCard } from '../../components/game/GameCard'
import { Button, LinkButton } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Controls'
import { GAME_BY_ID, GAMES } from '../../games/registry'
import { getRecentlyPlayed, useResults } from '../../hooks/useResults'
import { usePlayer } from '../player/PlayerContext'
import { GameBrowser } from './GameBrowser'

function PlayerSummary() {
  const { player, backend } = usePlayer()
  const results = useResults()
  const mine = results.filter((r) => r.playerKey === player?.id)
  const pending = mine.filter((r) => r.status === 'pending').length
  const distinctGames = new Set(mine.map((r) => r.gameId)).size
  if (!player) return null
  return (
    <section aria-label="Your summary" className="rounded-3xl border border-white/5 bg-ink-800 p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-gulabi/20 font-display text-2xl font-bold text-gulabi" aria-hidden>
          {player.nickname.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="text-sm text-ink-400">Namaste,</p>
          <p className="truncate font-display text-2xl font-bold leading-tight">{player.nickname}</p>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-2xl bg-ink-900/60 p-3">
          <dt className="text-ink-400">Results saved</dt>
          <dd className="font-display text-2xl font-bold">{mine.length}</dd>
        </div>
        <div className="rounded-2xl bg-ink-900/60 p-3">
          <dt className="text-ink-400">Games tried</dt>
          <dd className="font-display text-2xl font-bold">
            {distinctGames}
            <span className="text-base text-ink-400">/{GAMES.length}</span>
          </dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        {!backend && <Badge>Local-only mode</Badge>}
        {backend && !player.registered && <Badge tone="warn">Profile not synced yet</Badge>}
        {pending > 0 && <Badge tone="warn">{pending} result(s) waiting to sync</Badge>}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <LinkButton to="/profile" variant="secondary" size="sm">
          Profile & stats
        </LinkButton>
        <LinkButton to="/leaderboards" variant="secondary" size="sm" icon={<Trophy className="size-4" />}>
          Leaderboards
        </LinkButton>
      </div>
    </section>
  )
}

export function HomePage() {
  const navigate = useNavigate()
  const featured = GAMES.filter((g) => g.featured).slice(0, 4)
  // subscribing re-renders when results change (a finished game updates "recently played")
  useResults()
  const recent = getRecentlyPlayed()
    .map((r) => GAME_BY_ID[r.id])
    .filter(Boolean)
    .slice(0, 4)

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-[2rem] border border-white/5 bg-ink-800 px-5 py-8 sm:px-10 sm:py-12">
        <div className="bg-dots absolute inset-0" aria-hidden />
        <div className="absolute -right-10 -top-10 hidden text-[10rem] opacity-20 sm:block motion-safe:animate-float" aria-hidden>
          🎮
        </div>
        <div className="relative max-w-2xl">
          <Badge tone="warn">15 games · 0 downloads · 100% timepass</Badge>
          <h1 className="mt-4 text-4xl font-extrabold leading-[1.05] sm:text-6xl">
            Bore ho raha hai, yaar?
            <span className="block text-masala">Chal, ek game ho jaaye.</span>
          </h1>
          <p className="mt-4 max-w-xl text-ink-300 sm:text-lg">
            Ludo with the gang on one phone, a quick Snake run, or a serious Sudoku session. Share the link - koi signup nahi.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <LinkButton to="/games" size="lg" icon={<Play className="size-5" />}>
              Play now
            </LinkButton>
            <Button
              variant="secondary"
              size="lg"
              icon={<Dices className="size-5" />}
              onClick={() => navigate(`/games/${GAMES[Math.floor(Math.random() * GAMES.length)].id}`)}
            >
              Surprise me
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section aria-labelledby="featured-heading">
          <div className="mb-3 flex items-end justify-between">
            <h2 id="featured-heading" className="text-2xl font-bold">
              Featured
            </h2>
            <Link to="/games" className="text-sm font-semibold text-neela hover:underline">
              All games →
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
            {featured.map((g) => (
              <GameCard key={g.id} game={g} />
            ))}
          </div>
        </section>
        <div className="space-y-6">
          <PlayerSummary />
          {recent.length > 0 && (
            <section aria-labelledby="recent-heading" className="rounded-3xl border border-white/5 bg-ink-800 p-5">
              <h2 id="recent-heading" className="flex items-center gap-2 text-lg font-bold">
                <History className="size-5 text-neela" /> Recently played
              </h2>
              <ul className="mt-3 space-y-1">
                {recent.map((g) => (
                  <li key={g.id}>
                    <Link to={`/games/${g.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/5">
                      <span className="text-2xl" aria-hidden>
                        {g.emoji}
                      </span>
                      <span className="font-semibold">{g.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <div>
        <h2 id="all-games-heading" className="mb-4 text-2xl font-bold">
          All games
        </h2>
        <GameBrowser headingId="all-games-heading" />
      </div>
    </div>
  )
}

export function GamesPage() {
  return (
    <div>
      <h1 id="games-heading" className="text-4xl font-extrabold">
        All games
      </h1>
      <p className="mb-6 mt-1 text-ink-300">Pick one. Ya saare khelo, hum judge nahi karenge.</p>
      <GameBrowser headingId="games-heading" />
    </div>
  )
}
