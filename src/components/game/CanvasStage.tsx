import { forwardRef, useEffect, useImperativeHandle, useRef, type ReactNode } from 'react'

export interface CanvasHandle {
  ctx: () => CanvasRenderingContext2D | null
  /** Converts a client (pointer) position into logical canvas coordinates. */
  toLogical: (clientX: number, clientY: number) => { x: number; y: number }
  element: () => HTMLCanvasElement | null
}

interface Props {
  width: number
  height: number
  /** Max CSS height, e.g. '70dvh'. The canvas keeps its aspect ratio. */
  maxHeight?: string
  className?: string
  label: string
  children?: ReactNode
  onPointerDown?: (e: React.PointerEvent<HTMLCanvasElement>) => void
  onPointerMove?: (e: React.PointerEvent<HTMLCanvasElement>) => void
  onPointerUp?: (e: React.PointerEvent<HTMLCanvasElement>) => void
}

/**
 * Crisp, responsive canvas: draws in logical units, renders at devicePixelRatio,
 * and scales with CSS to fit the available width while preserving aspect ratio.
 */
export const CanvasStage = forwardRef<CanvasHandle, Props>(function CanvasStage(
  { width, height, maxHeight = '72dvh', className = '', label, children, onPointerDown, onPointerMove, onPointerUp },
  ref,
) {
  const canvas = useRef<HTMLCanvasElement>(null)

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
      return { x: ((clientX - rect.left) / rect.width) * width, y: ((clientY - rect.top) / rect.height) * height }
    },
  }))

  return (
    <div className={`relative mx-auto w-full overflow-hidden rounded-3xl ${className}`} style={{ maxWidth: `min(100%, calc(${maxHeight} * ${width / height}))` }}>
      <canvas
        ref={canvas}
        role="img"
        aria-label={label}
        className="game-surface block h-auto w-full"
        style={{ aspectRatio: `${width} / ${height}` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
      />
      {children}
    </div>
  )
})
