import { TRUCK_CAPACITY } from '../logic'
import { Block3D, BLOCK_COLORS, shade } from './Block3D'

export function TruckGradients() {
  return (
    <>
      <linearGradient id="cc-truck-body" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#9b84f0" />
        <stop offset="0.55" stopColor="#8166e0" />
        <stop offset="1" stopColor="#6c50d0" />
      </linearGradient>
      <linearGradient id="cc-truck-cab" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#a893f4" />
        <stop offset="1" stopColor="#8f78e8" />
      </linearGradient>
      <linearGradient id="cc-truck-bed" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#6248c6" />
        <stop offset="1" stopColor="#7158d6" />
      </linearGradient>
      <linearGradient id="cc-glass" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#e6f6ff" />
        <stop offset="0.6" stopColor="#9fd6ff" />
        <stop offset="1" stopColor="#6aa8ef" />
      </linearGradient>
      <linearGradient id="cc-done" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#6df0a6" />
        <stop offset="1" stopColor="#1fae5f" />
      </linearGradient>
    </>
  )
}

interface Props {
  x: number
  y: number
  w: number
  h: number
  /** Open (loading) end points towards the belt. */
  facing: 'up' | 'down' | 'left' | 'right'
  blocks: number[]
  hidden: boolean
  done: boolean
  locked: boolean
  lockColor?: number
  /** index of the first cube that just landed (plays the settle animation), or -1 */
  settleFrom?: number
}

/**
 * Toy truck seen from straight above, like the reference: a rounded lavender body with a soft
 * thickness below it, a flat hood at the end facing the belt and a recessed cargo bed holding up to
 * 4 cubes. Neighbouring same-colour cubes are drawn as one long block.
 */
export function TruckSprite(props: Props) {
  const { x, y, w, h, facing } = props
  if (facing === 'up' || facing === 'down') return <UprightTruck {...props} facing={facing} />
  // sideways truck: the upright drawing turned a quarter, with its wheels peeking out below
  const cx = x + w / 2
  const cy = y + h / 2
  const wheelW = Math.max(10, w * 0.12)
  return (
    <g>
      {[0.24, 0.72].map((f) => (
        <rect key={f} x={x + w * f} y={y + h - 6} width={wheelW} height={10} rx={4} fill="#141026" stroke="#2c2645" strokeWidth={1} />
      ))}
      <g transform={`rotate(${facing === 'right' ? 90 : -90} ${cx} ${cy})`}>
        <UprightTruck {...props} x={cx - h / 2} y={cy - w / 2} w={h} h={w} facing="up" />
      </g>
    </g>
  )
}

function UprightTruck({ x, y, w, h, facing, blocks, hidden, done, locked, lockColor, settleFrom = -1 }: Props & { facing: 'up' | 'down' }) {
  const up = facing === 'up'
  const bodyX = x + w * 0.05
  const bodyW = w * 0.9
  const r = Math.max(7, w * 0.2)
  const depth = Math.max(4, h * 0.035) // visible thickness of the body
  const topH = h - depth
  const hoodH = topH * 0.17
  const wall = Math.max(3, w * 0.08)
  // the hood is the end that faces the belt: cubes leave and arrive there
  const bedY0 = up ? y + hoodH + wall * 0.5 : y + wall
  const bedY1 = up ? y + topH - wall : y + topH - hoodH - wall * 0.5
  const bedX = bodyX + wall
  const bedW = bodyW - 2 * wall
  const bedR = Math.max(4, r * 0.55)
  const slotH = (bedY1 - bedY0) / TRUCK_CAPACITY
  // the bottom of the stack sits at the far end; its top is nearest the hood/belt
  const slotY = (k: number) => (up ? bedY1 - (k + 1) * slotH : bedY0 + k * slotH)
  const hoodY = up ? y : y + topH - hoodH

  // merge neighbouring visible blocks of the same colour into one long block (display only)
  const groups: { from: number; to: number; color: number; hidden: boolean }[] = []
  blocks.forEach((c, k) => {
    const isHidden = hidden && k !== blocks.length - 1
    const last = groups[groups.length - 1]
    if (last && !isHidden && !last.hidden && last.color === c && last.to === k - 1) last.to = k
    else groups.push({ from: k, to: k, color: c, hidden: isHidden })
  })

  return (
    <g>
      {/* soft ground shadow, then the body's thickness and its lit top */}
      <rect x={bodyX + 3} y={y + depth + 5} width={bodyW} height={topH} rx={r} fill="rgba(6,2,28,0.4)" />
      <rect x={bodyX} y={y + depth} width={bodyW} height={topH} rx={r} fill="#4a2fae" />
      <rect x={bodyX} y={y} width={bodyW} height={topH} rx={r} fill="url(#cc-truck-body)" />
      <rect x={bodyX + 1.5} y={y + 1.5} width={bodyW - 3} height={topH - 3} rx={r - 1.5} fill="none" stroke="rgba(236,228,255,0.5)" strokeWidth={1.5} />
      {/* flat hood at the belt end, with a seam towards the bed */}
      <rect x={bodyX + wall * 0.5} y={hoodY + (up ? wall * 0.4 : 0)} width={bodyW - wall} height={hoodH - wall * 0.4} rx={r * 0.7} fill="url(#cc-truck-cab)" />
      <rect x={bodyX + wall} y={up ? y + hoodH : y + topH - hoodH - 1.2} width={bodyW - 2 * wall} height={1.2} fill="rgba(40,20,120,0.45)" />
      {/* recessed cargo bed */}
      <rect x={bedX} y={bedY0} width={bedW} height={bedY1 - bedY0} rx={bedR} fill="url(#cc-truck-bed)" />
      <rect x={bedX} y={bedY0} width={bedW} height={Math.max(2, slotH * 0.1)} rx={2} fill="rgba(20,8,70,0.3)" />
      {/* cargo */}
      {!done &&
        groups.map((g) => {
          const y0 = Math.min(slotY(g.from), slotY(g.to))
          const y1 = Math.max(slotY(g.from), slotY(g.to)) + slotH
          const landed = settleFrom >= 0 && g.to >= settleFrom
          return (
            // a new key restarts the settle animation each time more cubes land in this group
            <g key={landed ? `${g.from}-${blocks.length}` : g.from} className={landed ? 'cc-settle' : undefined}>
              <Block3D x={bedX + 2} y={y0 + 1.5} w={bedW - 4} h={y1 - y0 - 3} color={g.color} hidden={g.hidden} />
            </g>
          )
        })}
      {done && (
        // finished: an empty bed with a tick, like the reference
        <path
          d={`M ${bedX + bedW * 0.3} ${(bedY0 + bedY1) / 2} l ${bedW * 0.16} ${bedW * 0.17} l ${bedW * 0.28} ${-bedW * 0.34}`}
          fill="none"
          stroke="#4d2fb4"
          strokeWidth={Math.max(3, bedW * 0.09)}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {locked && <Curtain x={bodyX} y={y} w={bodyW} h={topH} r={r} color={BLOCK_COLORS[lockColor ?? 0]} />}
      {done && <Confetti cx={bodyX + bodyW / 2} cy={y + topH / 2} spread={Math.max(bodyW, topH * 0.6)} />}
    </g>
  )
}

const CONFETTI_COLORS = ['#ffd23f', '#ff5d8f', '#4cc9f0', '#3ee08f', '#ffffff', '#ff8a3d']

/** A short burst of confetti; it mounts when the truck is completed, so it plays exactly once. */
function Confetti({ cx, cy, spread }: { cx: number; cy: number; spread: number }) {
  return (
    <g aria-hidden pointerEvents="none">
      {Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2 + (i % 3) * 0.3
        const d = spread * (0.45 + ((i * 37) % 10) / 22)
        return (
          <rect
            key={i}
            className="cc-confetti"
            x={cx - 2}
            y={cy - 3}
            width={4}
            height={6}
            rx={1}
            fill={CONFETTI_COLORS[i % CONFETTI_COLORS.length]}
            style={{ ['--dx' as string]: `${Math.cos(a) * d}px`, ['--dy' as string]: `${Math.sin(a) * d - spread * 0.15}px`, ['--rot' as string]: `${(i % 2 ? 1 : -1) * (180 + i * 20)}deg` }}
          />
        )
      })}
    </g>
  )
}

/** A cloth in the unlocking colour draped over the whole truck, with a box badge (the reference's curtain). */
function Curtain({ x, y, w, h, r, color }: { x: number; y: number; w: number; h: number; r: number; color: string }) {
  const folds = 4
  const hem = `M ${x} ${y + h - r} ${Array.from({ length: folds }, (_, i) => {
    const x0 = x + (w / folds) * i
    return `Q ${x0 + w / folds / 2} ${y + h + 5} ${x0 + w / folds} ${y + h - r * 0.4}`
  }).join(' ')} L ${x + w} ${y + r} Q ${x + w} ${y - 3} ${x + w - r} ${y - 3} L ${x + r} ${y - 3} Q ${x} ${y - 3} ${x} ${y + r} Z`
  const s = Math.min(w * 0.42, 30)
  const cx = x + w / 2
  const cy = y + h / 2
  return (
    <g>
      <path d={hem} fill={color} stroke={shade(color, -0.3)} strokeWidth={1.5} />
      {/* vertical folds */}
      {Array.from({ length: folds - 1 }, (_, i) => (
        <rect key={i} x={x + (w / folds) * (i + 1) - 1.5} y={y + 4} width={3} height={h - 8} rx={1.5} fill={shade(color, -0.18)} opacity={0.55} />
      ))}
      <rect x={x + 3} y={y} width={w * 0.3} height={h * 0.85} rx={r * 0.6} fill="rgba(255,255,255,0.18)" />
      {/* box badge */}
      <rect x={cx - s / 2} y={cy - s / 2} width={s} height={s} rx={s * 0.22} fill={shade(color, -0.28)} />
      <path
        d={`M ${cx - s * 0.26} ${cy - s * 0.1} L ${cx} ${cy - s * 0.24} L ${cx + s * 0.26} ${cy - s * 0.1} L ${cx + s * 0.26} ${cy + s * 0.2} L ${cx} ${cy + s * 0.32} L ${cx - s * 0.26} ${cy + s * 0.2} Z M ${cx - s * 0.26} ${cy - s * 0.1} L ${cx} ${cy + s * 0.04} L ${cx + s * 0.26} ${cy - s * 0.1} M ${cx} ${cy + s * 0.04} L ${cx} ${cy + s * 0.32}`}
        fill="none"
        stroke={shade(color, 0.55)}
        strokeWidth={Math.max(1.5, s * 0.07)}
        strokeLinejoin="round"
      />
    </g>
  )
}
