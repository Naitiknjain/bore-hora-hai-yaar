import { beltLayout, isLocked, TRUCK_CAPACITY, type LoopState } from './logic'

export const BLOCK_COLORS = ['#ff4d5e', '#4d7cff', '#ffd23f', '#3ee08f', '#b06bff', '#ff8a3d']
export const BLOCK_NAMES = ['Red', 'Blue', 'Yellow', 'Green', 'Purple', 'Orange']

const STEP = 35
const LEFT_X = 22
const RIGHT_X = 338
const TOP_Y = 26
export const BOARD_W = 360

export function boardHeight(truckCount: number) {
  const rows = Math.ceil(truckCount / 2)
  return TOP_Y + STEP + rows * 2 * STEP + 26
}

/** Screen coordinates of every belt position (matches logic.beltLayout ordering). */
export function beltPoints(truckCount: number): [number, number][] {
  const rows = Math.ceil(truckCount / 2)
  const side = rows * 2
  const bottomY = TOP_Y + STEP * (side + 1)
  const pts: [number, number][] = []
  for (const x of [100, 180, 260]) pts.push([x, TOP_Y])
  for (let i = 0; i < side; i += 1) pts.push([RIGHT_X, TOP_Y + STEP * (i + 1)])
  for (const x of [260, 180, 100]) pts.push([x, bottomY])
  for (let j = 0; j < side; j += 1) pts.push([LEFT_X, bottomY - STEP * (j + 1)])
  return pts
}

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
  hintTruck: number | null
  onTruck: (i: number) => void
}

function Truck({ x, y, side, blocks, hidden, done, locked, lockColor, shake, hint, onClick, index }: {
  x: number
  y: number
  side: 'left' | 'right'
  blocks: number[]
  hidden: boolean
  done: boolean
  locked: boolean
  lockColor?: number
  shake: boolean
  hint: boolean
  onClick: () => void
  index: number
}) {
  const w = 132
  const h = 50
  const cabW = 30
  // cab points toward the belt
  const cabX = side === 'right' ? x + w - cabW : x
  const bedX = side === 'right' ? x : x + cabW
  const slotW = (w - cabW - 12) / TRUCK_CAPACITY
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
      className={`outline-none ${shake ? 'animate-shake' : ''}`}
      style={{
        cursor: done ? 'default' : 'pointer',
        transform: done ? `translateX(${side === 'right' ? 220 : -220}px)` : undefined,
        opacity: done ? 0 : 1,
        transition: 'transform 0.7s ease-in, opacity 0.7s ease-in',
      }}
    >
      {hint && <rect x={x - 5} y={y - 5} width={w + 10} height={h + 10} rx={16} fill="none" stroke="#ffd23f" strokeWidth={3} className="motion-safe:animate-pulse" />}
      {/* body */}
      <rect x={bedX} y={y} width={w - cabW} height={h - 8} rx={10} fill="#6a45e6" stroke="#4b2fb3" strokeWidth={2} />
      <rect x={cabX} y={y + 4} width={cabW} height={h - 12} rx={9} fill="#7d5cf0" stroke="#4b2fb3" strokeWidth={2} />
      <rect x={cabX + (side === 'right' ? 10 : 4)} y={y + 10} width={16} height={12} rx={3} fill="#bfe9ff" />
      <circle cx={x + 26} cy={y + h - 6} r={7} fill="#1c2540" />
      <circle cx={x + w - 26} cy={y + h - 6} r={7} fill="#1c2540" />
      <circle cx={x + 26} cy={y + h - 6} r={2.5} fill="#9aa3c0" />
      <circle cx={x + w - 26} cy={y + h - 6} r={2.5} fill="#9aa3c0" />
      {/* slots: bottom of the stack is far from the belt, top is nearest */}
      {Array.from({ length: TRUCK_CAPACITY }, (_, k) => {
        const sx = side === 'right' ? bedX + 6 + k * slotW : bedX + (w - cabW) - 6 - (k + 1) * slotW
        const c = blocks[k]
        const isTop = k === blocks.length - 1
        const concealed = hidden && c !== undefined && !isTop
        return (
          <g key={k}>
            <rect x={sx + 1.5} y={y + 6} width={slotW - 3} height={h - 20} rx={5} fill="#3b2596" />
            {c !== undefined && (
              <>
                <rect x={sx + 2.5} y={y + 7} width={slotW - 5} height={h - 22} rx={4} fill={concealed ? '#2a1a6e' : BLOCK_COLORS[c]} />
                {concealed ? (
                  <text x={sx + slotW / 2} y={y + 24} textAnchor="middle" fontSize={14} fontWeight={800} fill="#a59ae0">
                    ?
                  </text>
                ) : (
                  <rect x={sx + 5} y={y + 9} width={slotW - 10} height={4} rx={2} fill="rgba(255,255,255,0.45)" />
                )}
              </>
            )}
          </g>
        )
      })}
      {locked && (
        <g aria-hidden>
          <rect x={bedX} y={y} width={w - cabW} height={h - 8} rx={10} fill="url(#curtain)" />
          <circle cx={bedX + (w - cabW) / 2} cy={y + (h - 8) / 2} r={11} fill="#0b1020" stroke={BLOCK_COLORS[lockColor ?? 0]} strokeWidth={3} />
          <rect x={bedX + (w - cabW) / 2 - 4} y={y + (h - 8) / 2 - 2} width={8} height={7} rx={1.5} fill={BLOCK_COLORS[lockColor ?? 0]} />
        </g>
      )}
    </g>
  )
}

export function LoopBoard({ state, items, hidden, tickMs, shakeTruck, hintTruck, onTruck }: Props) {
  const n = state.trucks.length
  const layout = beltLayout(n)
  const pts = beltPoints(n)
  const H = boardHeight(n)
  const bottomY = pts[3 + layout.rows * 2][1]
  return (
    <svg viewBox={`0 0 ${BOARD_W} ${H}`} className="game-surface mx-auto block max-h-[64dvh] w-full" role="group" aria-label="Loop Sort board">
      <defs>
        <pattern id="curtain" width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill="#c0265a" />
          <rect width="4" height="8" fill="#e23b73" />
        </pattern>
      </defs>
      {/* conveyor loop */}
      <rect x={LEFT_X} y={TOP_Y} width={RIGHT_X - LEFT_X} height={bottomY - TOP_Y} rx={34} fill="none" stroke="#3b2596" strokeWidth={30} />
      <rect x={LEFT_X} y={TOP_Y} width={RIGHT_X - LEFT_X} height={bottomY - TOP_Y} rx={34} fill="none" stroke="#5a3fd0" strokeWidth={22} />
      <rect
        x={LEFT_X}
        y={TOP_Y}
        width={RIGHT_X - LEFT_X}
        height={bottomY - TOP_Y}
        rx={34}
        fill="none"
        stroke="#7d5cf0"
        strokeWidth={1.5}
        strokeDasharray="6 10"
        className="motion-safe:[animation:belt_1s_linear_infinite]"
      />
      {/* chutes */}
      {layout.truckPos.map((p, i) =>
        state.trucks[i].done ? null : (
          <circle key={`ch${i}`} cx={pts[p][0]} cy={pts[p][1]} r={13} fill="none" stroke={isLocked(state, state.trucks[i]) ? '#c0265a' : '#ffd23f'} strokeWidth={2} opacity={0.6} />
        ),
      )}
      {/* trucks */}
      {state.trucks.map((t, i) => {
        const side = layout.truckSide[i]
        const y = pts[layout.truckPos[i]][1] - 25
        const x = side === 'right' ? RIGHT_X - 22 - 132 : LEFT_X + 22
        return (
          <Truck
            key={i}
            index={i}
            x={x}
            y={y}
            side={side}
            blocks={t.blocks}
            hidden={hidden}
            done={t.done}
            locked={isLocked(state, t)}
            lockColor={t.lock}
            shake={shakeTruck === i}
            hint={hintTruck === i}
            onClick={() => onTruck(i)}
          />
        )
      })}
      {/* cubes riding the belt: each block is drawn as a little pile of cubes */}
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
