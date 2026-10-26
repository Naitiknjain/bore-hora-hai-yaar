import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import type { TruckSpot } from '../logic'
import { BLOCK_COLORS, shade } from './Block3D'

/**
 * Canvas layer that draws the cubes riding the conveyor as a dense, smoothly moving stream of
 * small cubes (each conveyor cube = a little cluster spread along the belt, so neighbours merge
 * into one continuous "snake"). Purely visual: game state comes from `items`.
 *  - cubes glide between conveyor positions every animation frame (no stepping)
 *  - cubes leaving a truck swell in; cubes picked up by a truck fly into it
 *  - with reduced motion everything is drawn statically at its current position
 */
export interface StreamItem {
  id: number
  color: number
  pos: number
}

interface Props {
  svgRef: RefObject<SVGSVGElement | null>
  /** viewBox size of the board */
  width: number
  height: number
  points: [number, number][]
  trucks: TruckSpot[]
  items: StreamItem[]
  tickMs: number
  reducedMotion: boolean
}

interface Tracked {
  pos: number
  prev: number
  color: number
  born: number
  fresh: boolean
}

interface Ghost {
  color: number
  from: [number, number]
  to: [number, number]
  start: number
  seed: number
}

const CLUSTER = 40
const GHOST_MS = 260
const COLOR_FACES = BLOCK_COLORS.map((c) => ({ top: c, side: shade(c, -0.38), hi: shade(c, 0.55) }))

function rng(seed: number) {
  let a = (seed * 2654435761) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// per-id scatter of the little cubes: along the belt (u), across it (v) and size
const clusterCache = new Map<number, { u: number; v: number; s: number }[]>()
function clusterOf(id: number) {
  let c = clusterCache.get(id)
  if (!c) {
    const r = rng(id + 1)
    // fills the belt width and trails behind its position, so a run of cubes reads as one band
    c = Array.from({ length: CLUSTER }, () => ({ u: -46 + r() * 60, v: (r() - 0.5) * 21, s: 5 + r() * 2.8 }))
    if (clusterCache.size > 4000) clusterCache.clear()
    clusterCache.set(id, c)
  }
  return c
}

function drawCube(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: number, alpha = 1) {
  const f = COLOR_FACES[color] ?? COLOR_FACES[0]
  ctx.globalAlpha = alpha
  ctx.fillStyle = f.side
  ctx.fillRect(x - s / 2, y - s / 2 + s * 0.28, s, s * 0.9)
  ctx.fillStyle = f.top
  ctx.fillRect(x - s / 2, y - s / 2, s, s * 0.82)
  ctx.fillStyle = f.hi
  ctx.fillRect(x - s / 2 + s * 0.15, y - s / 2 + s * 0.12, s * 0.45, s * 0.2)
  ctx.globalAlpha = 1
}

export function CubeStream({ svgRef, width, height, points, trucks, items, tickMs, reducedMotion }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tracked = useRef(new Map<number, Tracked>())
  const ghosts = useRef<Ghost[]>([])
  const tickAt = useRef(0)
  const frame = useRef(0)
  const scale = useRef({ s: 1, dpr: 1 })
  const props = useRef({ points, trucks, tickMs, reducedMotion })
  props.current = { points, trucks, tickMs, reducedMotion }

  const draw = useRef<(now: number) => boolean>(() => false)
  draw.current = (now: number) => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return false
    const { points: pts, tickMs: ms, reducedMotion: still } = props.current
    const { s, dpr } = scale.current
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.setTransform(s * dpr, 0, 0, s * dpr, 0, 0)
    const n = pts.length
    const t = still ? 1 : Math.min(1, (now - tickAt.current) / ms)
    // cubes on the belt, sorted top-to-bottom so lower ones overlap upper ones
    const draws: { x: number; y: number; s: number; c: number; a: number }[] = []
    // point + direction at a fractional conveyor index (follows the curve, wraps around the loop)
    const at = (f: number) => {
      const g = ((f % n) + n) % n
      const i0 = Math.floor(g)
      const i1 = (i0 + 1) % n
      const k = g - i0
      const a = pts[i0]
      const b = pts[i1]
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const len = Math.hypot(dx, dy) || 1
      return { x: a[0] + dx * k, y: a[1] + dy * k, ux: dx / len, uy: dy / len }
    }
    const stepLen = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) || 34
    for (const [id, it] of tracked.current) {
      if (!pts[it.pos]) continue
      const advanced = it.prev !== it.pos && (it.prev + 1) % n === it.pos
      const base = advanced ? it.prev + t : it.pos
      const grow = it.fresh && !still ? Math.min(1, 0.35 + ((now - it.born) / ms) * 0.65) : 1
      for (const c of clusterOf(id)) {
        // spread along the belt path (u) and across it (v), so the stream bends with the corners
        const p = at(base + (c.u * grow) / stepLen)
        draws.push({ x: p.x - p.uy * c.v * grow, y: p.y + p.ux * c.v * grow, s: c.s * grow, c: it.color, a: 1 })
      }
    }
    // cubes flying into the truck that picked them up
    ghosts.current = ghosts.current.filter((g) => now - g.start < GHOST_MS)
    for (const g of ghosts.current) {
      const k = (now - g.start) / GHOST_MS
      const e = k * k
      const x = g.from[0] + (g.to[0] - g.from[0]) * e
      const y = g.from[1] + (g.to[1] - g.from[1]) * e
      for (const c of clusterOf(g.seed).slice(0, 9)) draws.push({ x: x + c.u * (1 - k) * 0.6, y: y + c.v * (1 - k), s: c.s * (1 - k * 0.5), c: g.color, a: 1 - k * 0.6 })
    }
    draws.sort((p, q) => p.y - q.y)
    for (const d of draws) drawCube(ctx, d.x, d.y, d.s, d.c, d.a)
    return !still && (t < 1 || ghosts.current.length > 0 || [...tracked.current.values()].some((it) => it.fresh && now - it.born < ms))
  }

  const kick = () => {
    cancelAnimationFrame(frame.current)
    const loop = (now: number) => {
      if (draw.current(now)) frame.current = requestAnimationFrame(loop)
    }
    frame.current = requestAnimationFrame(loop)
  }

  // follow game state: every change of `items` is one conveyor step (or an undo/restart)
  useLayoutEffect(() => {
    const now = performance.now()
    const prev = tracked.current
    const next = new Map<number, Tracked>()
    for (const it of items) {
      const old = prev.get(it.id)
      next.set(it.id, { pos: it.pos, prev: old ? old.pos : it.pos, color: it.color, born: old ? old.born : now, fresh: !old })
    }
    // a full turnover of ids means undo/restart rebuilt the conveyor: no pick-up animations then
    const continued = items.some((it) => prev.has(it.id)) || items.length === 0
    if (!props.current.reducedMotion && continued) {
      for (const [id, old] of prev) {
        if (next.has(id)) continue
        const spot = props.current.trucks.find((tr) => tr.pos === old.pos || tr.pos === (old.pos + 1) % props.current.points.length)
        if (!spot) continue
        const from = props.current.points[old.pos]
        const to: [number, number] = [spot.x + spot.w / 2, spot.facing === 'up' ? spot.y + spot.h * 0.28 : spot.y + spot.h * 0.72]
        ghosts.current.push({ color: old.color, from, to, start: now, seed: id })
      }
    }
    tracked.current = next
    tickAt.current = now
    kick()
  }, [items])

  // keep the canvas exactly over the rendered SVG, at device resolution
  useEffect(() => {
    const svg = svgRef.current
    const canvas = canvasRef.current
    if (!svg || !canvas) return
    const fit = () => {
      const rect = svg.getBoundingClientRect()
      const parent = canvas.parentElement!.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      // the SVG letterboxes its viewBox (xMidYMid meet): match the drawn area, not the element box
      const k = Math.min(rect.width / width, rect.height / height)
      const w = width * k
      const h = height * k
      canvas.style.left = `${rect.left - parent.left + (rect.width - w) / 2}px`
      canvas.style.top = `${rect.top - parent.top + (rect.height - h) / 2}px`
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      canvas.width = Math.max(1, Math.round(w * dpr))
      canvas.height = Math.max(1, Math.round(h * dpr))
      scale.current = { s: k, dpr }
      draw.current(performance.now())
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(svg)
    return () => ro.disconnect()
  }, [svgRef, width, height])

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute" data-testid="cube-stream" />
}
