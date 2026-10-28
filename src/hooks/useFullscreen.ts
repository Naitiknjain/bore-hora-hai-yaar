import { useCallback, useEffect, useState, type RefObject } from 'react'

type LockableOrientation = ScreenOrientation & { lock?: (o: 'landscape' | 'portrait') => Promise<void>; unlock?: () => void }

const unlockOrientation = () => {
  try {
    ;(screen.orientation as LockableOrientation | undefined)?.unlock?.()
  } catch {
    /* not locked / not supported */
  }
}

/**
 * Fullscreen for a game page. Uses the real Fullscreen API where it exists (Android, desktop) so landscape
 * games can turn the phone sideways (browsers only allow an orientation lock while fullscreen). On browsers
 * without it for web pages (iPhone Safari) it falls back to "immersive" mode: the element covers the window.
 */
export function useFullscreen(target: RefObject<HTMLElement | null>, orientation?: 'landscape') {
  const [native, setNative] = useState(false)
  const [immersive, setImmersive] = useState(false)
  const supported = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen && document.fullscreenEnabled !== false

  useEffect(() => {
    const onChange = () => {
      const on = document.fullscreenElement === target.current && !!target.current
      setNative(on)
      // leaving fullscreen (button, back gesture or swipe) gives the phone its normal rotation back
      if (!document.fullscreenElement) unlockOrientation()
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [target])

  // leaving the page always leaves fullscreen
  useEffect(
    () => () => {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
      unlockOrientation()
    },
    [],
  )

  // immersive mode: Escape leaves it, like real fullscreen, and the page behind must not scroll
  useEffect(() => {
    if (!immersive) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setImmersive(false)
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [immersive])

  const enter = useCallback(async () => {
    const el = target.current
    if (!el) return
    if (supported) {
      try {
        await el.requestFullscreen({ navigationUI: 'hide' })
        // phones only allow an orientation lock while fullscreen; desktops and iPads refuse it, which is fine
        if (orientation) await (screen.orientation as LockableOrientation | undefined)?.lock?.(orientation)?.catch(() => {})
        return
      } catch {
        /* fall through to immersive mode */
      }
    }
    setImmersive(true)
  }, [target, supported, orientation])

  const exit = useCallback(async () => {
    setImmersive(false)
    unlockOrientation()
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {})
  }, [])

  const active = native || immersive
  const toggle = useCallback(() => (active ? exit() : enter()), [active, enter, exit])

  return { active, native, immersive, toggle }
}
