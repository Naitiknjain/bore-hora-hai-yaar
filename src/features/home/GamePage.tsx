import { ArrowLeft, Trophy, Volume2, VolumeX } from 'lucide-react'
import { Component, Suspense, useEffect, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { GameMetaContext } from '../../components/game/GameShell'
import { LinkButton } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Controls'
import { getGame } from '../../games/registry'
import { markRecentlyPlayed } from '../../hooks/useResults'
import { useSettings } from '../settings/SettingsContext'
import { NotFoundPage } from './NotFoundPage'

class GameErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-md rounded-3xl border border-lal/30 bg-ink-800 p-6 text-center">
          <p className="text-5xl" aria-hidden>
            💥
          </p>
          <h2 className="mt-2 text-2xl font-bold">Game crash ho gaya</h2>
          <p className="mt-1 text-ink-300">
            {/chunk|module|import/i.test(this.state.error.message)
              ? 'Could not load this game. Check your connection and try again.'
              : 'Something broke inside the game. Reloading usually fixes it.'}
          </p>
          <button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-2xl bg-masala px-5 py-3 font-semibold text-ink-950">
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export function GamePage() {
  const { gameId } = useParams()
  const game = getGame(gameId)
  const { settings, update } = useSettings()

  useEffect(() => {
    if (!game) return
    markRecentlyPlayed(game.id)
    document.title = `${game.name} · bore-hora-hai-yaar`
  }, [game])

  if (!game) return <NotFoundPage what="game" />
  const GameComponent = game.component

  return (
    <GameMetaContext.Provider value={game}>
      <div className="mb-3 flex items-center gap-2">
        <Link to="/games" className="inline-flex size-11 items-center justify-center rounded-xl bg-ink-800 text-ink-200 hover:bg-ink-700" aria-label="Back to all games">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate font-display text-2xl font-extrabold">
          <span aria-hidden className="mr-1.5">
            {game.emoji}
          </span>
          {game.name}
        </h1>
        <button
          type="button"
          onClick={() => update({ sound: !settings.sound })}
          aria-label={settings.sound ? 'Mute sound' : 'Unmute sound'}
          aria-pressed={!settings.sound}
          className="inline-flex size-11 items-center justify-center rounded-xl bg-ink-800 text-ink-200 hover:bg-ink-700"
        >
          {settings.sound ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
        </button>
        {game.leaderboard && (
          <LinkButton to={`/leaderboards/${game.id}`} variant="secondary" className="!px-3" aria-label={`${game.name} leaderboard`}>
            <Trophy className="size-5" />
          </LinkButton>
        )}
      </div>
      <GameErrorBoundary>
        <Suspense
          fallback={
            <div className="flex min-h-[50vh] items-center justify-center">
              <Spinner label={`Loading ${game.name}`} />
            </div>
          }
        >
          <GameComponent />
        </Suspense>
      </GameErrorBoundary>
    </GameMetaContext.Provider>
  )
}
