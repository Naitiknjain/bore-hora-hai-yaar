import { useCallback, useEffect, useState, type RefObject } from 'react'

type LockableOrientation = ScreenOrientation & { lock?: (o: 'landscape' | 'portrait') => Promise<void> }

/**
 * Fullscreen for a game page. Uses the real Fullscreen API where it exists (Android, desktop); on browsers
 * without it for web pages (iPhone Safari) it falls back to "immersive" mode: the element covers the window.
 */
export function useFullscreen(target: RefObject<HTMLElement | null>, orientation?: 'landscape') {
  const [native, setNative] = useState(false)
  const [immersive, setImmersive] = useState(false)
  const supported = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen && document.fullscreenEnabled !== false

  useEffect(() => {
    const onChange = () => setNative(document.fullscreenElement === target.current && !!target.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [target])

  // leaving the page always leaves fullscreen
  useEffect(
    () => () => {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    },
    [],
  )

  // immersive mode: Escape leaves it, like real fullscreen
  useEffect(() => {
    if (!immersive) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setImmersive(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [immersive])

  const enter = useCallback(async () => {
    const el = target.current
    if (!el) return
    if (supported) {
      try {
        await el.requestFullscreen({ navigationUI: 'hide' })
        // phones only allow an orientation lock while fullscreen; ignore browsers that refuse it
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
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {})
  }, [])

  const active = native || immersive
  const toggle = useCallback(() => (active ? exit() : enter()), [active, enter, exit])

  return { active, native, immersive, toggle }
}
