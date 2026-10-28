import { useCallback, useEffect, useState, type RefObject } from 'react'

const PORTRAIT_PHONE = '(orientation: portrait) and (pointer: coarse)'

/** True while a touch device is held upright. */
function usePortraitPhone() {
  const [portrait, setPortrait] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(PORTRAIT_PHONE).matches)
  useEffect(() => {
    const mq = window.matchMedia?.(PORTRAIT_PHONE)
    if (!mq) return
    const onChange = () => setPortrait(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return portrait
}

/**
 * Fullscreen for a game page, done inside the page ("immersive" mode): the game element covers the
 * whole browser window. The browser's own Fullscreen API is deliberately not used - every browser
 * then shows its own "swipe down / press Esc to exit full screen" notice, which websites cannot hide.
 * Escape (or the exit button) leaves immersive mode.
 *
 * Landscape games on a phone held upright are turned sideways by the page itself (`rotated`), since
 * only real fullscreen may rotate the screen. Turning the phone sideways switches back to normal.
 */
export function useFullscreen(target: RefObject<HTMLElement | null>, orientation?: 'landscape') {
  const [immersive, setImmersive] = useState(false)
  const portrait = usePortraitPhone()
  const rotated = immersive && orientation === 'landscape' && portrait

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
  return { active: immersive, native: false, immersive, rotated, toggle }
}
