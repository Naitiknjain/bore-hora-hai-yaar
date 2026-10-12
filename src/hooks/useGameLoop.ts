import { useEffect, useRef } from 'react'

/**
 * requestAnimationFrame loop with a clamped delta (seconds). Stops when `running` is false
 * and automatically cancels on unmount, so switching games never leaks frames.
 */
export function useGameLoop(callback: (dt: number, now: number) => void, running: boolean) {
  const cb = useRef(callback)
  cb.current = callback

  useEffect(() => {
    if (!running) return
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      cb.current(dt, now)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [running])
}

/** Calls `onHidden` when the tab is hidden (used to auto-pause games and timers). */
export function useVisibilityPause(onHidden: () => void, active = true) {
  const cb = useRef(onHidden)
  cb.current = onHidden
  useEffect(() => {
    if (!active) return
    const handler = () => {
      if (document.visibilityState === 'hidden') cb.current()
    }
    document.addEventListener('visibilitychange', handler)
    window.addEventListener('blur', handler)
    return () => {
      document.removeEventListener('visibilitychange', handler)
      window.removeEventListener('blur', handler)
    }
  }, [active])
}

/** Keydown listener with cleanup. Handler receives the event; return true to preventDefault. */
export function useKeyDown(handler: (e: KeyboardEvent) => boolean | void, active = true) {
  const cb = useRef(handler)
  cb.current = handler
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && !target.dataset.gameInput) return
      if (cb.current(e)) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])
}

export function useKeyUp(handler: (e: KeyboardEvent) => boolean | void, active = true) {
  const cb = useRef(handler)
  cb.current = handler
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (cb.current(e)) e.preventDefault()
    }
    window.addEventListener('keyup', onKey)
    return () => window.removeEventListener('keyup', onKey)
  }, [active])
}

export type SwipeDir = 'up' | 'down' | 'left' | 'right'

/** Detects swipe gestures on an element (pointer events, works for touch and mouse). */
export function useSwipe(ref: React.RefObject<HTMLElement | null>, onSwipe: (dir: SwipeDir) => void, enabled = true, threshold = 24) {
  const cb = useRef(onSwipe)
  cb.current = onSwipe
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    let start: { x: number; y: number; id: number } | null = null
    const down = (e: PointerEvent) => {
      start = { x: e.clientX, y: e.clientY, id: e.pointerId }
    }
    const up = (e: PointerEvent) => {
      if (!start || start.id !== e.pointerId) return
      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      start = null
      if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return
      cb.current(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up')
    }
    const cancel = () => {
      start = null
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', cancel)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', cancel)
    }
  }, [ref, enabled, threshold])
}
