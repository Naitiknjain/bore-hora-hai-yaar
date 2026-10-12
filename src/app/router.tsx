import { createBrowserRouter, type RouteObject } from 'react-router'
import { AppShell } from '../components/layout/AppShell'
import { GamePage } from '../features/home/GamePage'
import { GamesPage, HomePage } from '../features/home/HomePage'
import { NotFoundPage, RouteErrorPage } from '../features/home/NotFoundPage'
import { GameLeaderboardPage, LeaderboardIndexPage } from '../features/leaderboards/LeaderboardPages'
import { RecoverPage } from '../features/player/RecoverPage'
import { ProfilePage } from '../features/profile/ProfilePage'
import { SettingsPage } from '../features/settings/SettingsPage'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'games', element: <GamesPage /> },
      { path: 'games/:gameId', element: <GamePage /> },
      { path: 'leaderboards', element: <LeaderboardIndexPage /> },
      { path: 'leaderboards/:gameId', element: <GameLeaderboardPage /> },
      { path: 'profile', element: <ProfilePage /> },
      { path: 'recover', element: <RecoverPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]

export const createAppRouter = () => createBrowserRouter(routes)
