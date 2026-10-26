import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

/**
 * True when the play area gives `el` a real height: it is `flex-1` in a flex column, or stretched to the
 * full height of a flex row (the side-by-side layout on short landscape screens).
 */
function inSizedFlex(el: HTMLElement) {
  const parent = el.parentElement
  if (!parent) return false
  const cs = getComputedStyle(parent)
  if (!cs.display.includes('flex')) return false
  if (cs.flexDirection.startsWith('column')) return true
  const self = getComputedStyle(el).alignSelf
  return self === 'stretch' || (self === 'auto' && (cs.alignItems === 'stretch' || cs.alignItems === 'normal'))
}

/**
 * Measures the space a board may use and returns the largest width/height with the given aspect ratio
 * (width / height) that fits it. The box grows to fill its parent when the parent is a flex column
 * with a definite height (the game page play area); otherwise it sizes from the width, capped by `maxHeight`.
 */
export function useFitSize(aspect: number, maxHeight = '72dvh') {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      let availH = r.height
      if (!inSizedFlex(el) || availH < 80) {
        // not inside a sized play area: behave like a normal responsive block
        const probe = document.createElement('div')
        probe.style.height = maxHeight
        document.body.appendChild(probe)
        availH = probe.getBoundingClientRect().height
        probe.remove()
      }
      const w = Math.max(1, Math.min(r.width, availH * aspect))
      const next = { w: Math.floor(w), h: Math.floor(w / aspect) }
      setSize((s) => (s && s.w === next.w && s.h === next.h ? s : next))
    }
    measure()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    ro?.observe(el)
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
    }
  }, [aspect, maxHeight])

  return { box, size }
}

/** Live width/height of a flex-1 play-area box (null until measured). `box` is a callback ref, so it works for late-mounting elements. */
export function useBoxSize() {
  const [el, box] = useState<HTMLDivElement | null>(null)
  const [rect, setRect] = useState<{ w: number; h: number } | null>(null)
  useLayoutEffect(() => {
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      const next = { w: Math.floor(r.width), h: Math.floor(r.height) }
      setRect((s) => (s && s.w === next.w && s.h === next.h ? s : next))
    }
    measure()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    ro?.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [el])
  return { box, rect }
}

interface FitStageProps {
  /** width / height of the board */
  aspect: number
  maxHeight?: string
  className?: string
  innerClassName?: string
  innerStyle?: CSSProperties
  children: ReactNode
}

/** Centers a fixed-aspect board inside the available play area and scales it to fit (no cropping, no scrolling). */
export function FitStage({ aspect, maxHeight, className = '', innerClassName = '', innerStyle, children }: FitStageProps) {
  const { box, size } = useFitSize(aspect, maxHeight)
  return (
    <div ref={box} className={`flex min-h-0 w-full flex-1 items-center justify-center short:self-stretch ${className}`}>
      <div
        className={`relative shrink-0 ${innerClassName}`}
        style={{ width: size?.w ?? '100%', height: size?.h ?? 'auto', aspectRatio: size ? undefined : String(aspect), ...innerStyle }}
      >
        {children}
      </div>
    </div>
  )
}
