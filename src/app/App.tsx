import { useState, type ReactNode } from 'react'
import { RouterProvider } from 'react-router'
import { PlayerProvider } from '../features/player/PlayerContext'
import { SettingsProvider } from '../features/settings/SettingsContext'
import { createAppRouter } from './router'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SettingsProvider>
      <PlayerProvider>{children}</PlayerProvider>
    </SettingsProvider>
  )
}

export function App() {
  const [router] = useState(createAppRouter)
  return (
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  )
}
