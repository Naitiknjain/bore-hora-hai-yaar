import { forwardRef, useEffect, useImperativeHandle, useRef, type ReactNode } from 'react'
import { useFitSize } from './FitStage'

export interface CanvasHandle {
  ctx: () => CanvasRenderingContext2D | null
  /** Converts a client (pointer) position into logical canvas coordinates. */
  toLogical: (clientX: number, clientY: number) => { x: number; y: number }
  element: () => HTMLCanvasElement | null
}

interface Props {
  width: number
  height: number
  /** Height cap used only outside a sized play area, e.g. '70dvh'. Inside one, the canvas fills the space. */
  maxHeight?: string
  className?: string
  label: string
  children?: ReactNode
  onPointerDown?: (e: React.PointerEvent<HTMLCanvasElement>) => void
  onPointerMove?: (e: React.PointerEvent<HTMLCanvasElement>) => void
  onPointerUp?: (e: React.PointerEvent<HTMLCanvasElement>) => void
}

/**
 * Crisp, responsive canvas: draws in logical units, renders at devicePixelRatio, and scales to the
 * largest size that fits the play area (width and height) while preserving aspect ratio.
 */
export const CanvasStage = forwardRef<CanvasHandle, Props>(function CanvasStage(
  { width, height, maxHeight = '72dvh', className = '', label, children, onPointerDown, onPointerMove, onPointerUp },
  ref,
) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const { box, size } = useFitSize(width / height, maxHeight)

  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    c.width = Math.round(width * dpr)
    c.height = Math.round(height * dpr)
    const ctx = c.getContext('2d')
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
  }, [width, height])

  useImperativeHandle(ref, () => ({
    ctx: () => canvas.current?.getContext('2d') ?? null,
    element: () => canvas.current,
    toLogical: (clientX, clientY) => {
      const rect = canvas.current!.getBoundingClientRect()
      // a game turned sideways by the page (rotated 90deg clockwise): its x runs down the screen, its y right-to-left
      if (canvas.current!.closest('[data-rotated]')) {
        return { x: ((clientY - rect.top) / rect.height) * width, y: ((rect.right - clientX) / rect.width) * height }
      }
      return { x: ((clientX - rect.left) / rect.width) * width, y: ((clientY - rect.top) / rect.height) * height }
    },
  }))

  return (
    <div ref={box} className="flex min-h-0 w-full flex-1 items-center justify-center short:min-w-0 short:self-stretch">
      <div
        className={`relative shrink-0 overflow-hidden rounded-3xl ${className}`}
        style={{ width: size?.w ?? '100%', height: size?.h ?? 'auto', aspectRatio: size ? undefined : `${width} / ${height}` }}
      >
        <canvas
          ref={canvas}
          role="img"
          aria-label={label}
          className="game-surface block h-full w-full"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onContextMenu={(e) => e.preventDefault()}
        />
        {children}
      </div>
    </div>
  )
})
