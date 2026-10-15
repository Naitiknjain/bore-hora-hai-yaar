import { beltLayout, isLocked, TRUCK_CAPACITY, type LoopState, type Side } from './logic'

export const BLOCK_COLORS = ['#ff4d5e', '#4d7cff', '#ffd23f', '#3ee08f', '#b06bff', '#ff8a3d', '#ff5d8f', '#4cc9f0']
export const BLOCK_NAMES = ['Red', 'Blue', 'Yellow', 'Green', 'Purple', 'Orange', 'Pink', 'Sky']

export const BOARD_W = 360
const STEP = 35
const LEFT_X = 22
const RIGHT_X = 338
const ROW_H = 104 // space for a row of upright trucks above / below the loop
const H_TRUCK = { w: 132, h: 50 }
const V_TRUCK = { w: 60, h: 92 }

/** All screen geometry for a board with `truckCount` docks (matches logic.beltLayout). */
export function boardGeometry(truckCount: number) {
  const l = beltLayout(truckCount)
  const topY = 26 + (l.top ? ROW_H : 0)
  const bottomY = topY + STEP * (l.sidePoints + 1)
  const height = bottomY + 26 + (l.bottom ? ROW_H : 0)
  const xAt = (i: number) => LEFT_X + ((RIGHT_X - LEFT_X) * (i + 1)) / (l.topPoints + 1)
  const pts: [number, number][] = []
  for (let i = 0; i < l.topPoints; i += 1) pts.push([xAt(i), topY])
  for (let i = 0; i < l.sidePoints; i += 1) pts.push([RIGHT_X, topY + STEP * (i + 1)])
  for (let i = 0; i < l.topPoints; i += 1) pts.push([xAt(l.topPoints - 1 - i), bottomY])
  for (let j = 0; j < l.sidePoints; j += 1) pts.push([LEFT_X, bottomY - STEP * (j + 1)])
  const trucks = l.truckPos.map((p, i) => {
    const side = l.truckSide[i]
    const [px, py] = pts[p]
    if (side === 'right') return { side, x: RIGHT_X - 22 - H_TRUCK.w, y: py - 25, ...H_TRUCK }
    if (side === 'left') return { side, x: LEFT_X + 22, y: py - 25, ...H_TRUCK }
    if (side === 'top') return { side, x: px - V_TRUCK.w / 2, y: topY - 22 - V_TRUCK.h, ...V_TRUCK }
    return { side, x: px - V_TRUCK.w / 2, y: bottomY + 22, ...V_TRUCK }
  })
  return { layout: l, pts, topY, bottomY, height, trucks }
}

export interface BeltItem {
  id: number
  color: number
  pos: number
}

interface TruckProps {
  index: number
  side: Side
  x: number
  y: number
  w: number
  h: number
  blocks: number[]
  hidden: boolean
  done: boolean
  doneColor?: number
  locked: boolean
  lockColor?: number
  shake: boolean
  highlight: boolean
  justAdded: boolean
  onClick: () => void
}

function Truck({ index, side, x, y, w, h, blocks, hidden, done, doneColor, locked, lockColor, shake, highlight, justAdded, onClick }: TruckProps) {
  const horizontal = side === 'left' || side === 'right'
  const cab = horizontal ? 30 : 28
  // the cab (and the top of the stack) faces the conveyor
  const cabRect =
    side === 'right' ? { x: x + w - cab, y: y + 4, w: cab, h: h - 12 }
    : side === 'left' ? { x, y: y + 4, w: cab, h: h - 12 }
    : side === 'top' ? { x: x + 4, y: y + h - cab, w: w - 8, h: cab }
    : { x: x + 4, y, w: w - 8, h: cab }
  const bed =
    side === 'right' ? { x, y, w: w - cab, h: h - 8 }
    : side === 'left' ? { x: x + cab, y, w: w - cab, h: h - 8 }
    : side === 'top' ? { x, y, w, h: h - cab }
    : { x, y: y + cab, w, h: h - cab }
  const slot = (k: number) => {
    if (horizontal) {
      const sw = (bed.w - 12) / TRUCK_CAPACITY
      const sx = side === 'right' ? bed.x + 6 + k * sw : bed.x + bed.w - 6 - (k + 1) * sw
      return { x: sx + 1.5, y: bed.y + 6, w: sw - 3, h: bed.h - 12 }
    }
    const sh = (bed.h - 10) / TRUCK_CAPACITY
    const sy = side === 'top' ? bed.y + 5 + k * sh : bed.y + bed.h - 5 - (k + 1) * sh
    return { x: bed.x + 6, y: sy + 1.5, w: bed.w - 12, h: sh - 3 }
  }
  const label = done
    ? `Truck ${index + 1}: complete`
    : locked
      ? `Truck ${index + 1}: curtain closed until ${BLOCK_NAMES[lockColor ?? 0]} is sorted`
      : `Truck ${index + 1}: ${blocks.length ? `top ${BLOCK_NAMES[blocks[blocks.length - 1]]}, ${blocks.length} of ${TRUCK_CAPACITY}` : 'empty'}`
  return (
    <g
      role="button"
      tabIndex={done ? -1 : 0}
      aria-label={label}
      onClick={onClick}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick())}
      className={`outline-none ${shake ? 'animate-shake' : ''} ${justAdded ? 'animate-pop' : ''}`}
      style={{ cursor: done ? 'default' : 'pointer', transformBox: 'fill-box', transformOrigin: 'center' }}
    >
      {highlight && <rect x={x - 5} y={y - 5} width={w + 10} height={h + 10} rx={16} fill="none" stroke="#ffd23f" strokeWidth={3} className="motion-safe:animate-pulse" />}
      <rect x={bed.x} y={bed.y} width={bed.w} height={bed.h} rx={10} fill={done ? '#3b2c8a' : '#6a45e6'} stroke="#4b2fb3" strokeWidth={2} />
      <rect x={cabRect.x} y={cabRect.y} width={cabRect.w} height={cabRect.h} rx={9} fill={done ? '#4a3a9a' : '#7d5cf0'} stroke="#4b2fb3" strokeWidth={2} />
      <rect x={cabRect.x + cabRect.w / 2 - 7} y={cabRect.y + cabRect.h / 2 - 6} width={14} height={11} rx={3} fill="#bfe9ff" opacity={done ? 0.5 : 1} />
      {Array.from({ length: TRUCK_CAPACITY }, (_, k) => {
        const r = slot(k)
        const c = blocks[k]
        const isTop = k === blocks.length - 1
        const concealed = hidden && c !== undefined && !isTop
        return (
          <g key={k}>
            <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={5} fill="#3b2596" />
            {c !== undefined && (
              <>
                <rect x={r.x + 1} y={r.y + 1} width={r.w - 2} height={r.h - 2} rx={4} fill={concealed ? 'url(#hiddenCube)' : BLOCK_COLORS[c]} />
                {concealed ? (
                  <text x={r.x + r.w / 2} y={r.y + r.h / 2 + 5} textAnchor="middle" fontSize={13} fontWeight={800} fill="#d9d1ff">
                    ?
                  </text>
                ) : (
                  <rect x={r.x + 3} y={r.y + 3} width={Math.max(2, r.w - 6)} height={3.5} rx={1.75} fill="rgba(255,255,255,0.45)" />
                )}
              </>
            )}
          </g>
        )
      })}
      {done && (
        <g aria-hidden>
          <circle cx={bed.x + bed.w / 2} cy={bed.y + bed.h / 2} r={13} fill={BLOCK_COLORS[doneColor ?? 0]} stroke="#fff" strokeWidth={2.5} />
          <path
            d={`M ${bed.x + bed.w / 2 - 6} ${bed.y + bed.h / 2} l 4 4.5 l 8 -9`}
            fill="none"
            stroke="#fff"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}
      {locked && (
        <g aria-hidden>
          <rect x={bed.x} y={bed.y} width={bed.w} height={bed.h} rx={10} fill="url(#curtain)" />
          <circle cx={bed.x + bed.w / 2} cy={bed.y + bed.h / 2} r={11} fill="#0b1020" stroke={BLOCK_COLORS[lockColor ?? 0]} strokeWidth={3} />
          <rect x={bed.x + bed.w / 2 - 4} y={bed.y + bed.h / 2 - 2} width={8} height={7} rx={1.5} fill={BLOCK_COLORS[lockColor ?? 0]} />
        </g>
      )}
    </g>
  )
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

export function LoopBoard({ state, items, hidden, tickMs, shakeTruck, highlightTrucks, justAdded, onTruck }: Props) {
  const g = boardGeometry(state.trucks.length)
  const { pts, topY, bottomY, height } = g
  return (
    <svg viewBox={`0 0 ${BOARD_W} ${height}`} className="game-surface mx-auto block max-h-[min(60dvh,calc(100dvh-352px))] min-h-[240px] w-full" role="group" aria-label="Chakkar Cubes board">
      <defs>
        <pattern id="curtain" width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill="#c0265a" />
          <rect width="4" height="8" fill="#e23b73" />
        </pattern>
        <pattern id="hiddenCube" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="#2a1a6e" />
          <rect width="3" height="6" fill="#3a2a8e" />
        </pattern>
      </defs>
      {/* conveyor loop */}
      <rect x={LEFT_X} y={topY} width={RIGHT_X - LEFT_X} height={bottomY - topY} rx={34} fill="none" stroke="#3b2596" strokeWidth={30} />
      <rect x={LEFT_X} y={topY} width={RIGHT_X - LEFT_X} height={bottomY - topY} rx={34} fill="none" stroke="#5a3fd0" strokeWidth={22} />
      <rect
        x={LEFT_X}
        y={topY}
        width={RIGHT_X - LEFT_X}
        height={bottomY - topY}
        rx={34}
        fill="none"
        stroke="#7d5cf0"
        strokeWidth={1.5}
        strokeDasharray="6 10"
        className="motion-safe:[animation:belt_1s_linear_infinite]"
      />
      {/* chutes */}
      {g.layout.truckPos.map((p, i) =>
        state.trucks[i].done || state.trucks[i].inactive ? null : (
          <circle key={`ch${i}`} cx={pts[p][0]} cy={pts[p][1]} r={13} fill="none" stroke={isLocked(state, state.trucks[i]) ? '#c0265a' : '#ffd23f'} strokeWidth={2} opacity={0.6} />
        ),
      )}
      {/* trucks (spare docks stay hidden until Extra Truck opens them) */}
      {state.trucks.map((t, i) =>
        t.inactive ? null : (
          <Truck
            key={i}
            index={i}
            {...g.trucks[i]}
            blocks={t.blocks}
            hidden={hidden}
            done={t.done}
            doneColor={t.doneColor}
            locked={isLocked(state, t)}
            lockColor={t.lock}
            shake={shakeTruck === i}
            highlight={highlightTrucks.includes(i)}
            justAdded={justAdded === i}
            onClick={() => onTruck(i)}
          />
        ),
      )}
      {/* cubes riding the conveyor: each conveyor cube is drawn as a little pile */}
      {items.map((it) => {
        const [x, y] = pts[it.pos]
        return (
          <g key={it.id} style={{ transform: `translate(${x}px, ${y}px)`, transition: `transform ${tickMs}ms linear` }} aria-hidden>
            {[
              [-6, -6],
              [1, -7],
              [-7, 1],
              [1, 1],
              [-2, -2],
            ].map(([dx, dy], k) => (
              <rect key={k} x={dx} y={dy} width={7} height={7} rx={1.5} fill={BLOCK_COLORS[it.color]} stroke="rgba(0,0,0,0.25)" strokeWidth={0.8} />
            ))}
          </g>
        )
      })}
    </svg>
  )
}
