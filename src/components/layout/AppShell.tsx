import { Gamepad2, Home, Settings, Trophy, User, WifiOff } from 'lucide-react'
import { Suspense, useEffect } from 'react'
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router'
import { usePlayer } from '../../features/player/PlayerContext'
import { IssuedCodeModal, OnboardingModal } from '../../features/player/PlayerModals'
import { Spinner } from '../ui/Controls'

/** Primary navigation. Data-driven so future sections can be appended without touching layout. */
export const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/games', label: 'Games', icon: Gamepad2, end: false },
  { to: '/leaderboards', label: 'Leaderboards', icon: Trophy, end: false },
  { to: '/profile', label: 'Profile', icon: User, end: false },
  { to: '/settings', label: 'Settings', icon: Settings, end: false },
] as const

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="group flex items-center gap-2" aria-label="bore-hora-hai-yaar home">
      <span className="flex size-10 items-center justify-center rounded-2xl bg-masala text-xl shadow-[0_3px_0_0_#c99500] transition group-hover:-rotate-6" aria-hidden>
        😴
      </span>
      {!compact && (
        <span className="font-display text-xl font-extrabold leading-none tracking-tight">
          <span className="text-ink-100">bore-hora</span>
          <span className="text-gulabi">-hai-yaar</span>
        </span>
      )}
    </Link>
  )
}

function OfflineBanner() {
  const { online } = usePlayer()
  if (online) return null
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-santra/15 px-4 py-2 text-center text-sm text-santra">
      <WifiOff className="size-4 shrink-0" />
      Offline mode: games still work, results will sync when you're back online.
    </div>
  )
}

function RelinkBanner() {
  const { needsRelink } = usePlayer()
  if (!needsRelink) return null
  return (
    <div role="status" className="bg-gulabi/15 px-4 py-2 text-center text-sm text-gulabi">
      This browser lost its link to your profile.{' '}
      <Link to="/recover" className="font-semibold underline">
        Enter your player code
      </Link>{' '}
      to reconnect.
    </div>
  )
}

export function AppShell() {
  const { player } = usePlayer()
  const location = useLocation()
  const inGame = /^\/games\/[^/]+/.test(location.pathname)

  useEffect(() => {
    document.title = 'bore-hora-hai-yaar'
  }, [location.pathname])

  return (
    // game pages are exactly one screen tall (no page scroll); the game header replaces the site bar there
    <div className={`flex flex-col ${inGame ? 'h-dvh overflow-hidden' : 'min-h-dvh'}`}>
      <a href="#main" className="sr-only z-50 rounded bg-masala px-3 py-2 text-ink-950 focus:not-sr-only focus:fixed focus:left-2 focus:top-2">
        Skip to content
      </a>
      <header className={inGame ? 'shrink-0' : 'sticky top-0 z-40 border-b border-white/5 bg-ink-900/85 backdrop-blur-md'}>
        <div className={`mx-auto h-16 max-w-6xl items-center justify-between gap-3 px-4 ${inGame ? 'hidden' : 'flex'}`}>
          <Logo />
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                    isActive ? 'bg-white/10 text-ink-100' : 'text-ink-300 hover:bg-white/5 hover:text-ink-100'
                  }`
                }
              >
                <item.icon className="size-4" aria-hidden />
                {item.label}
              </NavLink>
            ))}
          </nav>
          {player && (
            <Link
              to="/profile"
              className="flex max-w-[45%] items-center gap-2 rounded-full bg-ink-800 py-1 pl-1 pr-3 text-sm font-semibold text-ink-100 hover:bg-ink-700 md:hidden"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gulabi/20 text-gulabi">{player.nickname.slice(0, 1).toUpperCase()}</span>
              <span className="truncate">{player.nickname}</span>
            </Link>
          )}
        </div>
        <OfflineBanner />
        <RelinkBanner />
      </header>

      <main
        id="main"
        className={`mx-auto w-full max-w-6xl flex-1 ${inGame ? 'flex min-h-0 flex-col px-3 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-4' : 'px-4 pb-28 pt-6 md:pb-12'}`}
      >
        <Suspense
          fallback={
            <div className="flex min-h-[40vh] items-center justify-center">
              <Spinner />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>

      {!inGame && (
        <footer className="hidden border-t border-white/5 py-6 text-center text-sm text-ink-400 md:block">
          bore-hora-hai-yaar · made for friends with too much free time · all games are original implementations
        </footer>
      )}

      {/* Mobile bottom navigation */}
      {!inGame && (
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-white/5 bg-ink-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
        >
          <div className="grid grid-cols-5">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex min-h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${isActive ? 'text-masala' : 'text-ink-400'}`
                }
              >
                <item.icon className="size-5" aria-hidden />
                <span className="max-w-full truncate px-0.5">{item.label === 'Leaderboards' ? 'Ranks' : item.label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      )}

      <OnboardingModal />
      <IssuedCodeModal />
      <ScrollRestoration />
    </div>
  )
}
