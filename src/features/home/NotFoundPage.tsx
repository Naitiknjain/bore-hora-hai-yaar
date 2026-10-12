import { isRouteErrorResponse, useRouteError } from 'react-router'
import { LinkButton } from '../../components/ui/Button'

export function NotFoundPage({ what = 'page' }: { what?: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <p className="font-display text-8xl font-extrabold text-masala">404</p>
      <h1 className="mt-2 text-3xl font-bold">Yeh {what} toh exist hi nahi karta</h1>
      <p className="mt-2 text-ink-300">The link might be old or mistyped. Chalo, kuch aur khelte hain.</p>
      <LinkButton to="/games" className="mt-6" size="lg">
        Browse games
      </LinkButton>
    </div>
  )
}

/** Router-level error element (also catches failed lazy chunk loads). */
export function RouteErrorPage() {
  const error = useRouteError()
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="text-6xl" aria-hidden>
        🫠
      </p>
      <h1 className="mt-2 text-3xl font-bold">Kuch toh gadbad hai</h1>
      <p className="mt-2 text-ink-300">Something went wrong while loading this page.</p>
      <button type="button" onClick={() => window.location.reload()} className="mt-6 rounded-2xl bg-masala px-6 py-3 font-semibold text-ink-950">
        Reload
      </button>
    </div>
  )
}
