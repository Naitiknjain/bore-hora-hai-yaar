import { memo, useCallback, useMemo, useRef } from 'react'
import { useSettings } from '../../features/settings/SettingsContext'
import { BLOCK_NAMES, BlockGradients } from './art/Block3D'
import { CubeStream } from './art/CubeStream'
import { ArtDefs } from './art/defs'
import { Track } from './art/Track'
import { TruckGradients, TruckSprite } from './art/TruckSprite'
import { boardLayout, isLocked, type LoopState, type Truck, type TruckSpot } from './logic'

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
  onTruck: (i: number) => void
}

interface TruckButtonProps {
  index: number
  truck: Truck
  spot: TruckSpot
  locked: boolean
  hidden: boolean
  shake: boolean
  highlight: boolean
  justAdded: boolean
  onTruck: (i: number) => void
}

/** One tappable truck. Memoised: it only re-renders when its own cargo or state changes. */
const TruckButton = memo(function TruckButton({ index: i, truck: t, spot, locked, hidden, shake, highlight, justAdded, onTruck }: TruckButtonProps) {
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
  const label = t.done
    ? `Truck ${i + 1}: complete`
    : locked
      ? `Truck ${i + 1}: curtain closed until ${BLOCK_NAMES[t.lock ?? 0]} is sorted`
      : `Truck ${i + 1}: ${t.blocks.length ? `top ${BLOCK_NAMES[t.blocks[t.blocks.length - 1]]}, ${t.blocks.length} of 4` : 'empty'}`
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
      <TruckSprite {...spot} blocks={t.blocks} hidden={hidden} done={t.done} locked={locked} lockColor={t.lock} />
    </g>
  )
})

/** Static board art (defs + raised track). Never changes during a level. */
const BoardBase = memo(function BoardBase({ loop, points }: { loop: { x: number; y: number; w: number; h: number; r: number }; points: [number, number][] }) {
  return (
    <>
      <ArtDefs />
      <defs>
        <BlockGradients />
        <TruckGradients />
      </defs>
      <Track x={loop.x} y={loop.y} w={loop.w} h={loop.h} radius={loop.r} points={points} />
    </>
  )
})

export function LoopBoard({ state, items, hidden, tickMs, shakeTruck, highlightTrucks, justAdded, onTruck }: Props) {
  // geometry depends only on the number of docks (cached), so static layers never re-render
  const b = useMemo(() => boardLayout(state.trucks.length), [state.trucks.length])
  const svgRef = useRef<SVGSVGElement>(null)
  const { prefersReducedMotion } = useSettings()
  // stable handler so memoised trucks are not re-rendered just because the parent did
  const onTruckRef = useRef(onTruck)
  onTruckRef.current = onTruck
  const handleTruck = useCallback((i: number) => onTruckRef.current(i), [])
  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${b.width} ${b.height}`}
        className="game-surface mx-auto block max-h-[calc(100dvh-324px)] min-h-[240px] min-[380px]:max-h-[calc(100dvh-342px)] sm:max-h-[calc(100dvh-354px)] lg:max-h-[min(760px,calc(100dvh-262px))] w-full"
        role="group"
        aria-label="Chakkar Cubes board"
      >
        <BoardBase loop={b.loop} points={b.points} />
        {state.trucks.map((t, i) => (
          <TruckButton
            key={i}
            index={i}
            truck={t}
            spot={b.trucks[i]}
            locked={isLocked(state, t)}
            hidden={hidden}
            shake={shakeTruck === i}
            highlight={highlightTrucks.includes(i)}
            justAdded={justAdded === i}
            onTruck={handleTruck}
          />
        ))}
      </svg>
      {/* cubes riding the conveyor: canvas stream on top of the board */}
      <CubeStream
        svgRef={svgRef}
        width={b.width}
        height={b.height}
        points={b.points}
        trucks={b.trucks}
        items={items}
        tickMs={tickMs}
        reducedMotion={prefersReducedMotion}
      />
    </div>
  )
}
