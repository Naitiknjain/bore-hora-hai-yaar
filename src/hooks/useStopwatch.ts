import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Pausable stopwatch based on performance.now() (immune to wall-clock changes).
 * `elapsed` re-renders ~4x per second while running; `read()` gives the exact value.
 */
export function useStopwatch() {
  const acc = useRef(0)
  const startedAt = useRef<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(false)

  const read = useCallback(() => acc.current + (startedAt.current != null ? performance.now() - startedAt.current : 0), [])

  const start = useCallback(() => {
    if (startedAt.current == null) {
      startedAt.current = performance.now()
      setRunning(true)
    }
  }, [])

  const pause = useCallback(() => {
    if (startedAt.current != null) {
      acc.current += performance.now() - startedAt.current
      startedAt.current = null
      setRunning(false)
      setElapsed(acc.current)
    }
  }, [])

  const reset = useCallback(() => {
    acc.current = 0
    startedAt.current = null
    setRunning(false)
    setElapsed(0)
  }, [])

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setElapsed(read()), 250)
    return () => window.clearInterval(id)
  }, [running, read])

  return { elapsed, running, start, pause, reset, read }
}
