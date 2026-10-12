import { useEffect } from 'react'
import { useBlocker } from 'react-router'

/**
 * While `active`, in-app navigation is blocked until confirmed and the browser warns
 * before unloading. Returns the blocker so the caller can render a confirmation dialog.
 */
export function useLeaveGuard(active: boolean) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => active && currentLocation.pathname !== nextLocation.pathname)

  useEffect(() => {
    if (!active) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [active])

  return blocker
}
