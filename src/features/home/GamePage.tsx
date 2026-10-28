import { ArrowLeft, Maximize, Minimize, Trophy, Volume2, VolumeX } from 'lucide-react'
import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { GameMetaContext } from '../../components/game/GameShell'
import { LinkButton } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Controls'
import { getGame } from '../../games/registry'
import { useFullscreen } from '../../hooks/useFullscreen'
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

/** Space kept clear at the bottom for the badge Netlify adds to free-plan sites (it can't be removed there). */
const BADGE_SPACE = '68px'

function useHostBadge() {
  const [present, setPresent] = useState(false)
  useEffect(() => {
    const check = () => setPresent(!!document.querySelector('script[data-nf-variant="public"]'))
    check()
    const t = window.setTimeout(check, 1500)
    return () => window.clearTimeout(t)
  }, [])
  return present
}

const headerBtn = 'inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-ink-800 text-ink-200 hover:bg-ink-700 short:size-9'

export function GamePage() {
  const { gameId } = useParams()
  const game = getGame(gameId)
  const { settings, update } = useSettings()
  const root = useRef<HTMLDivElement>(null)
  const fullscreen = useFullscreen(root, game?.orientation)
  const badge = useHostBadge()

  useEffect(() => {
    if (!game) return
    markRecentlyPlayed(game.id)
    document.title = `${game.name} · bore-hora-hai-yaar`
  }, [game])

  if (!game) return <NotFoundPage what="game" />
  const GameComponent = game.component

  return (
    <GameMetaContext.Provider value={game}>
      {/* One screen tall: header, then the game fills the rest. Fullscreen/immersive make this element cover the screen. */}
      <div
        ref={root}
        data-fullscreen={fullscreen.active || undefined}
        data-rotated={fullscreen.rotated || undefined}
        className={`flex min-h-0 flex-1 flex-col bg-ink-950 ${
          fullscreen.rotated
            ? 'fixed left-[100dvw] top-0 z-[60] h-[100dvw] w-[100dvh] origin-top-left rotate-90 px-3 pt-2'
            : fullscreen.immersive
              ? 'fixed inset-0 z-[60] px-3 pt-[max(0.5rem,env(safe-area-inset-top))]'
              : ''
        } ${fullscreen.native ? 'px-3 pt-[max(0.5rem,env(safe-area-inset-top))]' : ''}`}
        style={
          fullscreen.rotated
            ? {
                // turned sideways the host badge (bottom-right of the phone) lands on the right end of the game,
                // so the room for it moves there; the phone's notch is now on the left
                paddingBottom: '0.75rem',
                paddingLeft: 'max(0.75rem, env(safe-area-inset-top))',
                paddingRight: badge ? BADGE_SPACE : '0.75rem',
              }
            : {
                // the host badge is outside the page in real fullscreen, so only reserve room for it otherwise
                paddingBottom: badge && !fullscreen.native ? `max(${BADGE_SPACE}, env(safe-area-inset-bottom))` : 'max(0.75rem, env(safe-area-inset-bottom))',
              }
        }
      >
      <div className="mb-2 flex shrink-0 items-center gap-2 short:mb-1">
        <Link to="/games" className={headerBtn} aria-label="Back to all games">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate font-display text-xl font-extrabold sm:text-2xl short:text-lg">
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
          className={headerBtn}
        >
          {settings.sound ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
        </button>
        <button
          type="button"
          onClick={() => void fullscreen.toggle()}
          aria-label={fullscreen.active ? 'Exit fullscreen' : 'Fullscreen'}
          aria-pressed={fullscreen.active}
          className={headerBtn}
        >
          {fullscreen.active ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
        </button>
        {game.leaderboard && !fullscreen.active && (
          <LinkButton to={`/leaderboards/${game.id}`} variant="secondary" className="!size-10 !min-h-0 !px-0 short:!size-9" aria-label={`${game.name} leaderboard`}>
            <Trophy className="size-5" />
          </LinkButton>
        )}
      </div>
      {/* play area: games stretch into it; start/results screens scroll inside it when taller than the screen */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
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
      </div>
      </div>
    </GameMetaContext.Provider>
  )
}
