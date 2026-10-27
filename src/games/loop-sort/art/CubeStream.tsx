import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import type { TruckSpot } from '../logic'
import { BLOCK_COLORS, shade } from './Block3D'

/**
 * Canvas layer for the conveyor, matching the reference's look: every run of same-coloured cubes on
 * the belt is one solid, shaded bar that bends with the loop. Purely visual: game state comes from `items`.
 *  - bars glide between conveyor positions every animation frame (no stepping)
 *  - a group leaving a truck pours out as a trickle of small cubes and the bar grows as they land
 *  - cubes picked up by a truck peel off the bar as small cubes streaming into the truck
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
  /** cubes inside this area are in the tunnel and not drawn */
  tunnel?: { x: number; y: number; w: number; h: number }
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
const GHOST_MS = 300
/** small cubes per conveyor cube when it pours out of / into a truck */
const TRICKLE = 6
const TRICKLE_GAP_MS = 40
/** half the width of a bar on the belt, in board units */
const BAR_HALF = 15
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

/** Point just inside a truck's open end (the end facing the belt); `depth` 0 = edge, 1 = far end. */
function mouthOf(spot: TruckSpot, depth: number): [number, number] {
  const cx = spot.x + spot.w / 2
  const cy = spot.y + spot.h / 2
  switch (spot.facing) {
    case 'up':
      return [cx, spot.y + spot.h * depth]
    case 'down':
      return [cx, spot.y + spot.h * (1 - depth)]
    case 'right':
      return [spot.x + spot.w * (1 - depth), cy]
    default:
      return [spot.x + spot.w * depth, cy]
  }
}

type At = (f: number) => { x: number; y: number; ux: number; uy: number }

/** One solid bar of cubes from belt position `from` to `to`, following the curve, shaded like a raised block. */
function drawBar(ctx: CanvasRenderingContext2D, at: At, from: number, to: number, color: number) {
  const f = COLOR_FACES[color] ?? COLOR_FACES[0]
  const pts: [number, number][] = []
  for (let u = from; u < to; u += 0.2) {
    const p = at(u)
    pts.push([p.x, p.y])
  }
  const e = at(to)
  pts.push([e.x, e.y])
  if (pts.length < 2) return
  const path = (dy: number) => {
    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1] + dy)
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1] + dy)
  }
  ctx.lineJoin = 'round'
  ctx.lineCap = 'butt'
  // contact shadow, darker side wall, lit top face, soft highlight along the top
  ctx.strokeStyle = 'rgba(12,4,48,0.45)'
  ctx.lineWidth = BAR_HALF * 2
  path(4)
  ctx.stroke()
  ctx.strokeStyle = f.side
  path(2)
  ctx.stroke()
  ctx.strokeStyle = f.top
  ctx.lineWidth = BAR_HALF * 2 - 4
  path(-0.5)
  ctx.stroke()
  ctx.strokeStyle = f.hi
  ctx.globalAlpha = 0.35
  ctx.lineWidth = 3
  path(-BAR_HALF * 0.45)
  ctx.stroke()
  ctx.globalAlpha = 1
}

export function CubeStream({ svgRef, width, height, points, trucks, tunnel, items, tickMs, reducedMotion }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tracked = useRef(new Map<number, Tracked>())
  const ghosts = useRef<Ghost[]>([])
  const tickAt = useRef(0)
  const frame = useRef(0)
  const scale = useRef({ s: 1, dpr: 1 })
  const props = useRef({ points, trucks, tunnel, tickMs, reducedMotion })
  props.current = { points, trucks, tunnel, tickMs, reducedMotion }

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
    // group the belt cubes into runs of one colour standing next to each other: each run is one bar
    const segs: { base: number; color: number; grow: number }[] = []
    for (const it of tracked.current.values()) {
      if (!pts[it.pos]) continue
      const advanced = it.prev !== it.pos && (it.prev + 1) % n === it.pos
      const grow = it.fresh && !still ? Math.min(1, Math.max(0, (now - it.born) / ms)) : 1
      segs.push({ base: advanced ? it.prev + t : it.pos, color: it.color, grow })
    }
    segs.sort((p, q) => p.base - q.base)
    const runs: { from: number; to: number; color: number }[] = []
    for (const g of segs) {
      const last = runs[runs.length - 1]
      // the newest cube of a run is still filling up as its small cubes land
      const lead = 0.5 * g.grow
      if (last && last.color === g.color && g.base - last.to < 1.05) last.to = g.base + lead
      else runs.push({ from: g.base - 0.5, to: g.base + lead, color: g.color })
    }
    // a run crossing the loop's start point continues at the other end
    if (runs.length > 1) {
      const first = runs[0]
      const last = runs[runs.length - 1]
      if (first.color === last.color && first.from + n - last.to < 0.05) {
        last.to = first.to + n
        runs.shift()
      }
    }
    const hole = props.current.tunnel
    if (hole) {
      // everything except the tunnel
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, width, height)
      ctx.rect(hole.x, hole.y, hole.w, hole.h)
      ctx.clip('evenodd')
    }
    for (const r of runs) drawBar(ctx, at, r.from, r.to, r.color)
    if (hole) ctx.restore()
    // small cubes pouring between trucks and the belt, sorted top-to-bottom so lower ones overlap upper ones
    const draws: { x: number; y: number; s: number; c: number; a: number }[] = []
    // cubes flying into the truck that picked them up
    ghosts.current = ghosts.current.filter((g) => now - g.start < GHOST_MS)
    for (const g of ghosts.current) {
      if (now < g.start) continue
      const k = (now - g.start) / GHOST_MS
      const e = k * (2 - k) // ease out: quick start, gentle landing
      const r = clusterOf(g.seed)[0]
      draws.push({ x: g.from[0] + (g.to[0] - g.from[0]) * e + r.v * 0.25, y: g.from[1] + (g.to[1] - g.from[1]) * e, s: 6.5, c: g.color, a: 1 })
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
        const to = mouthOf(spot, 0.3)
        for (let i = 0; i < TRICKLE; i += 1) ghosts.current.push({ color: old.color, from, to, start: now + i * TRICKLE_GAP_MS, seed: id * 8 + i })
      }
      // a cube just put on the belt pours out of its truck as a trickle of small cubes
      for (const it of items) {
        if (prev.has(it.id)) continue
        const spot = props.current.trucks.find((tr) => tr.pos === it.pos)
        if (!spot) continue
        const to = props.current.points[it.pos]
        for (let i = 0; i < TRICKLE; i += 1) ghosts.current.push({ color: it.color, from: mouthOf(spot, 0.05), to, start: now + i * TRICKLE_GAP_MS * 0.6, seed: it.id * 8 + i })
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
