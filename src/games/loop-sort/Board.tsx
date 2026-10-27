import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { useSettings } from '../../features/settings/SettingsContext'
import { BLOCK_NAMES, BlockGradients } from './art/Block3D'
import { CubeStream } from './art/CubeStream'
import { ArtDefs } from './art/defs'
import { Track } from './art/Track'
import { KEY_COLORS, TruckGradients, TruckSprite } from './art/TruckSprite'
import { shade } from './art/Block3D'
import { boardLayout, isFrozen, isLocked, isShut, isTied, type LoopState, type Truck, type TruckSpot } from './logic'

export { BLOCK_COLORS, BLOCK_NAMES } from './art/Block3D'

export interface BeltItem {
  id: number
  color: number
  pos: number
}

interface Props {
  state: LoopState
  items: BeltItem[]
  hidden: boolean
  tickMs: number
  shakeTruck: number | null
  highlightTrucks: number[]
  justAdded: number | null
  /** the conveyor is at capacity: the track glows red */
  full?: boolean
  onTruck: (i: number) => void
}

interface TruckButtonProps {
  index: number
  truck: Truck
  spot: TruckSpot
  locked: boolean
  shut: boolean
  tied: boolean
  hidden: boolean
  shake: boolean
  highlight: boolean
  justAdded: boolean
  onTruck: (i: number) => void
}

/** One tappable truck. Memoised: it only re-renders when its own cargo or state changes. */
const TruckButton = memo(function TruckButton({ index: i, truck: t, spot, locked, shut, tied, hidden, shake, highlight, justAdded, onTruck }: TruckButtonProps) {
  // remember how many cubes the truck held, so cubes that just landed can play the settle animation
  const [seen, setSeen] = useState({ blocks: t.blocks, grewFrom: -1 })
  if (seen.blocks !== t.blocks) setSeen({ blocks: t.blocks, grewFrom: t.blocks.length > seen.blocks.length ? seen.blocks.length : -1 })
  const grewFrom = seen.grewFrom
  if (t.inactive) {
    // free parking spot for the Extra Truck ability
    return (
      <rect
        x={spot.x + spot.w * 0.1}
        y={spot.y}
        width={spot.w * 0.8}
        height={spot.h}
        rx={Math.max(6, spot.w * 0.2)}
        fill="rgba(255,255,255,0.03)"
        stroke="rgba(200,185,255,0.22)"
        strokeWidth={1.5}
        strokeDasharray="5 5"
        aria-hidden
      />
    )
  }
  const frozen = isFrozen(t)
  const label = t.done
    ? `Truck ${i + 1}: complete`
    : frozen
      ? `Truck ${i + 1}: frozen until the truck next to it is filled`
      : shut
        ? `Truck ${i + 1}: behind a locked shutter`
      : locked
      ? `Truck ${i + 1}: curtain closed until ${BLOCK_NAMES[t.lock ?? 0]} is sorted`
      : `Truck ${i + 1}: ${t.blocks.length ? `top ${BLOCK_NAMES[t.blocks[t.blocks.length - 1]]}, ${t.blocks.length} of 4` : 'empty'}${t.barrier ? ', barrier (cubes can go in, not out)' : ''}${tied ? ', tied by a rope' : ''}${t.tag !== undefined ? `, only takes ${BLOCK_NAMES[t.tag]}` : ''}${t.key !== undefined ? ', carries a key' : ''}`
  return (
    <g
      role="button"
      tabIndex={t.done ? -1 : 0}
      aria-label={label}
      onClick={() => onTruck(i)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onTruck(i))}
      className={`outline-none ${shake ? 'animate-shake' : ''} ${justAdded ? 'animate-pop' : ''}`}
      style={{ cursor: t.done ? 'default' : 'pointer', transformBox: 'fill-box', transformOrigin: 'center' }}
    >
      {highlight && (
        <rect
          x={spot.x - 4}
          y={spot.y - 4}
          width={spot.w + 8}
          height={spot.h + 12}
          rx={Math.max(8, spot.w * 0.24)}
          fill="none"
          stroke="#ffd23f"
          strokeWidth={3}
          className="motion-safe:animate-pulse"
        />
      )}
      {/* inner group so the tap press doesn't fight the shake/pop animations on the outer one */}
      <g className="cc-truck">
        <TruckSprite {...spot} blocks={t.blocks} hidden={hidden} done={t.done} locked={locked} lockColor={t.lock} settleFrom={grewFrom} barrier={t.barrier} frozen={frozen} thawed={t.thawed} tint={t.tag} keyId={t.key} />
      </g>
    </g>
  )
})

/** Where cubes enter/leave a truck: just in front of its open end. */
function mouth(s: TruckSpot, out = 6): [number, number] {
  if (s.facing === 'up') return [s.x + s.w / 2, s.y - out]
  if (s.facing === 'down') return [s.x + s.w / 2, s.y + s.h + out]
  if (s.facing === 'right') return [s.x + s.w + out, s.y + s.h / 2]
  return [s.x - out, s.y + s.h / 2]
}

/** Trucks of one lock / rope, split into the rows they stand in. */
function groupsOf(state: LoopState, spots: TruckSpot[], idOf: (t: Truck) => number | undefined) {
  const groups = new Map<string, { id: number; spots: TruckSpot[] }>()
  state.trucks.forEach((t, i) => {
    const id = idOf(t)
    if (id === undefined) return
    const k = `${id}:${spots[i].row}`
    if (!groups.has(k)) groups.set(k, { id, spots: [] })
    groups.get(k)!.spots.push(spots[i])
  })
  return [...groups.values()]
}

/** Rolling shutters with a padlock over locked trucks; they roll up once the key is collected. */
function Shutters({ state, spots }: { state: LoopState; spots: TruckSpot[] }) {
  return (
    <g aria-hidden pointerEvents="none">
      {groupsOf(state, spots, (t) => t.shutter).map(({ id, spots: g }) => {
        const x = Math.min(...g.map((s) => s.x)) - 3
        const y = Math.min(...g.map((s) => s.y)) - 3
        const w = Math.max(...g.map((s) => s.x + s.w)) + 3 - x
        const h = Math.max(...g.map((s) => s.y + s.h)) + 5 - y
        const open = (state.keys ?? []).includes(id)
        const c = KEY_COLORS[id % KEY_COLORS.length]
        const lw = Math.min(w, h) * 0.3
        const cx = x + w / 2
        const cy = y + h / 2
        return (
          <g key={`${id}-${x}-${y}`} className={open ? 'cc-roll' : undefined} style={{ transformBox: 'fill-box', transformOrigin: 'top' }}>
            <rect x={x + 2} y={y + 6} width={w} height={h} rx={10} fill="rgba(6,4,24,0.45)" />
            <rect x={x} y={y} width={w} height={h} rx={10} fill="#4b3c96" stroke="#9d8fe0" strokeWidth={2} />
            {Array.from({ length: Math.floor((h - 10) / 8) }, (_, k) => (
              <rect key={k} x={x + 4} y={y + 6 + k * 8} width={w - 8} height={4} rx={2} fill="#5d4db0" stroke="#3a2d7c" strokeWidth={0.8} />
            ))}
            <rect x={x} y={y + h - 8} width={w} height={8} rx={4} fill="#3a2d7c" />
            {/* padlock */}
            <path d={`M ${cx - lw * 0.3} ${cy - lw * 0.1} v ${-lw * 0.22} a ${lw * 0.3} ${lw * 0.3} 0 0 1 ${lw * 0.6} 0 v ${lw * 0.22}`} fill="none" stroke={shade(c, -0.3)} strokeWidth={lw * 0.14} />
            <rect x={cx - lw * 0.48} y={cy - lw * 0.12} width={lw * 0.96} height={lw * 0.78} rx={lw * 0.2} fill={c} stroke={shade(c, -0.35)} strokeWidth={1.5} />
            <rect x={cx - lw * 0.36} y={cy - lw * 0.04} width={lw * 0.3} height={lw * 0.12} rx={lw * 0.06} fill="rgba(255,255,255,0.45)" />
            <circle cx={cx} cy={cy + lw * 0.22} r={lw * 0.1} fill={shade(c, -0.55)} />
            <rect x={cx - lw * 0.04} y={cy + lw * 0.24} width={lw * 0.08} height={lw * 0.18} fill={shade(c, -0.55)} />
          </g>
        )
      })}
    </g>
  )
}

/** A striped rope across the open ends of tied trucks; it falls away once one of them is sorted. */
function Ropes({ state, spots }: { state: LoopState; spots: TruckSpot[] }) {
  return (
    <g aria-hidden pointerEvents="none">
      {groupsOf(state, spots, (t) => t.rope).map(({ id, spots: g }) => {
        const pts = g.map((s) => mouth(s)).sort((a, b) => a[0] - b[0] || a[1] - b[1])
        const [a, b] = [pts[0], pts[pts.length - 1]]
        const horizontal = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1])
        const ext = (horizontal ? g[0].w : g[0].h) * 0.42
        const p0: [number, number] = horizontal ? [a[0] - ext, a[1]] : [a[0], a[1] - ext]
        const p1: [number, number] = horizontal ? [b[0] + ext, b[1]] : [b[0], b[1] + ext]
        const cut = (state.cut ?? []).includes(id)
        const d = `M ${p0[0]} ${p0[1]} L ${p1[0]} ${p1[1]}`
        return (
          <g key={`${id}-${p0.join()}`} className={cut ? 'cc-drop' : undefined}>
            <path d={d} transform="translate(0 2.5)" stroke="rgba(6,4,24,0.45)" strokeWidth={8} strokeLinecap="round" />
            <path d={d} stroke="#f4efe6" strokeWidth={7} strokeLinecap="round" />
            <path d={d} stroke="#e0433f" strokeWidth={7} strokeDasharray="5 6" />
            <path d={d} stroke="rgba(255,255,255,0.5)" strokeWidth={1.5} transform="translate(0 -1.5)" />
            {[p0, p1].map(([px, py], k) => (
              <g key={k}>
                <circle cx={px} cy={py + 1.5} r={5.5} fill="rgba(6,4,24,0.45)" />
                <circle cx={px} cy={py} r={5} fill="#8a6a3c" stroke="#4a361b" strokeWidth={1.2} />
              </g>
            ))}
          </g>
        )
      })}
    </g>
  )
}

/** Static board art (defs + raised track). Never changes during a level. */
const BoardBase = memo(function BoardBase({
  loop,
  points,
  tunnel,
  full,
}: {
  loop: { x: number; y: number; w: number; h: number; r: number }
  points: [number, number][]
  tunnel?: { x: number; y: number; w: number; h: number }
  full?: boolean
}) {
  return (
    <>
      <ArtDefs />
      <defs>
        <BlockGradients />
        <TruckGradients />
      </defs>
      <Track x={loop.x} y={loop.y} w={loop.w} h={loop.h} radius={loop.r} points={points} tunnel={tunnel} full={full} />
    </>
  )
})

export function LoopBoard({ state, items, hidden, tickMs, shakeTruck, highlightTrucks, justAdded, full, onTruck }: Props) {
  // geometry depends only on the number of docks (cached), so static layers never re-render
  const b = useMemo(() => boardLayout(state.trucks.length, state.style, state.spares), [state.trucks.length, state.style, state.spares])
  const svgRef = useRef<SVGSVGElement>(null)
  const { prefersReducedMotion } = useSettings()
  // stable handler so memoised trucks are not re-rendered just because the parent did
  const onTruckRef = useRef(onTruck)
  onTruckRef.current = onTruck
  const handleTruck = useCallback((i: number) => onTruckRef.current(i), [])
  return (
    // fills the play area's board slot; the SVG keeps its shape (letterboxed) and the cube canvas follows it
    <div className="absolute inset-0">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${b.width} ${b.height}`}
        className="game-surface block h-full w-full"
        role="group"
        aria-label="Chakkar Cubes board"
      >
        <BoardBase loop={b.loop} points={b.points} tunnel={b.tunnel} full={full} />
        {state.trucks.map((t, i) => (
          <TruckButton
            key={i}
            index={i}
            truck={t}
            spot={b.trucks[i]}
            locked={isLocked(state, t)}
            shut={isShut(state, t)}
            tied={isTied(state, t)}
            hidden={hidden}
            shake={shakeTruck === i}
            highlight={highlightTrucks.includes(i)}
            justAdded={justAdded === i}
            onTruck={handleTruck}
          />
        ))}
        <Ropes state={state} spots={b.trucks} />
        <Shutters state={state} spots={b.trucks} />
      </svg>
      {/* cubes riding the conveyor: canvas stream on top of the board */}
      <CubeStream
        svgRef={svgRef}
        width={b.width}
        height={b.height}
        points={b.points}
        trucks={b.trucks}
        tunnel={b.tunnel}
        items={items}
        tickMs={tickMs}
        reducedMotion={prefersReducedMotion}
      />
    </div>
  )
}
