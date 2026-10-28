import { useCallback, useEffect, useState, type RefObject } from 'react'

/**
 * Fullscreen for a game page, done inside the page ("immersive" mode): the game element covers the
 * whole browser window. The browser's own Fullscreen API is deliberately not used - every browser
 * then shows its own "swipe down / press Esc to exit full screen" notice, which websites cannot hide.
 * Escape (or the exit button) leaves immersive mode.
 */
export function useFullscreen(target: RefObject<HTMLElement | null>, _orientation?: 'landscape') {
  const [immersive, setImmersive] = useState(false)

  // immersive mode: Escape leaves it, like real fullscreen
  useEffect(() => {
    if (!immersive) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setImmersive(false)
    window.addEventListener('keydown', onKey)
    // the page behind must not scroll while the game covers the window
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [immersive])

  const enter = useCallback(async () => {
    if (target.current) setImmersive(true)
  }, [target])

  const exit = useCallback(async () => setImmersive(false), [])

  const toggle = useCallback(() => (immersive ? exit() : enter()), [immersive, enter, exit])

  // `native` stays for callers that style real fullscreen differently; it is never on now
  return { active: immersive, native: false, immersive, toggle }
}
