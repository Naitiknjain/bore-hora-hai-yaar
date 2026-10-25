import { useMemo } from 'react'
import { BLOCK_NAMES, BlockGradients, MiniCube } from './art/Block3D'
import { ArtDefs } from './art/defs'
import { Track } from './art/Track'
import { TruckGradients, TruckSprite } from './art/TruckSprite'
import { boardLayout, isLocked, type LoopState } from './logic'

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

// small deterministic scatter so each conveyor cube looks like a little pile of cubes
const PILE: [number, number][] = [
  [-8, -6],
  [0, -9],
  [7, -5],
  [-5, 1],
  [3, 0],
  [-1, -3],
]

export function LoopBoard({ state, items, hidden, tickMs, shakeTruck, highlightTrucks, justAdded, onTruck }: Props) {
  // geometry depends only on the number of docks: compute once so static layers never re-render
  const b = useMemo(() => boardLayout(state.trucks.length), [state.trucks.length])
  return (
    <svg
      viewBox={`0 0 ${b.width} ${b.height}`}
      className="game-surface mx-auto block max-h-[min(64dvh,calc(100dvh-330px))] min-h-[260px] w-full"
      role="group"
      aria-label="Chakkar Cubes board"
    >
      <ArtDefs />
      <defs>
        <BlockGradients />
        <TruckGradients />
      </defs>
      <Track x={b.loop.x} y={b.loop.y} w={b.loop.w} h={b.loop.h} radius={b.loop.r} points={b.points} />

      {state.trucks.map((t, i) => {
        const spot = b.trucks[i]
        if (t.inactive) {
          // free parking spot for the Extra Truck ability
          return (
            <rect
              key={i}
              x={spot.x + spot.w * 0.07}
              y={spot.y}
              width={spot.w * 0.86}
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
        const locked = isLocked(state, t)
        const label = t.done
          ? `Truck ${i + 1}: complete`
          : locked
            ? `Truck ${i + 1}: curtain closed until ${BLOCK_NAMES[t.lock ?? 0]} is sorted`
            : `Truck ${i + 1}: ${t.blocks.length ? `top ${BLOCK_NAMES[t.blocks[t.blocks.length - 1]]}, ${t.blocks.length} of 4` : 'empty'}`
        const highlight = highlightTrucks.includes(i)
        return (
          <g
            key={i}
            role="button"
            tabIndex={t.done ? -1 : 0}
            aria-label={label}
            onClick={() => onTruck(i)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onTruck(i))}
            className={`outline-none ${shakeTruck === i ? 'animate-shake' : ''} ${justAdded === i ? 'animate-pop' : ''}`}
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
      })}

      {/* cubes riding the conveyor */}
      {items.map((it) => {
        const [x, y] = b.points[it.pos]
        return (
          <g key={it.id} style={{ transform: `translate(${x}px, ${y}px)`, transition: `transform ${tickMs}ms linear` }} aria-hidden>
            {PILE.map(([dx, dy], k) => (
              <MiniCube key={k} x={dx - 3.5} y={dy} s={7.5} color={it.color} />
            ))}
          </g>
        )
      })}
    </svg>
  )
}
