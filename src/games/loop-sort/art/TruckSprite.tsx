import { TRUCK_CAPACITY } from '../logic'
import { Block3D, BLOCK_COLORS, shade } from './Block3D'

/** Key / padlock colours for Lock & Key (one per key id). */
export const KEY_COLORS = ['#ff8a2a', '#2fd67c', '#35c8f0']

export function TruckGradients() {
  return (
    <>
      <linearGradient id="cc-truck-body" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#8d78d6" />
        <stop offset="0.55" stopColor="#775ebe" />
        <stop offset="1" stopColor="#6650a8" />
      </linearGradient>
      <linearGradient id="cc-truck-cab" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#9280da" />
        <stop offset="1" stopColor="#7f6ac8" />
      </linearGradient>
      <linearGradient id="cc-truck-bed" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#56429a" />
        <stop offset="1" stopColor="#6551ad" />
      </linearGradient>
      <linearGradient id="cc-glass" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#e6f6ff" />
        <stop offset="0.6" stopColor="#9fd6ff" />
        <stop offset="1" stopColor="#6aa8ef" />
      </linearGradient>
      <linearGradient id="cc-ice" x1="0" y1="0" x2="0.6" y2="1">
        <stop offset="0" stopColor="#d6f0ff" />
        <stop offset="0.35" stopColor="#7cc2ff" />
        <stop offset="1" stopColor="#2f6fe4" />
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
  /** how many cubes at the bottom are face down (hidden-cube levels) */
  veiled: number
  done: boolean
  locked: boolean
  lockColor?: number
  /** index of the first cube that just landed (plays the settle animation), or -1 */
  settleFrom?: number
  /** called when the newest landed cube has finished settling */
  onSettled?: () => void
  /** barrier: striped posts in front of the truck (they sink once it is sorted) */
  barrier?: boolean
  /** covered in ice */
  frozen?: boolean
  /** the ice just broke: shards fly off once */
  thawed?: boolean
  /** coloured truck: the whole body is painted in this cube colour */
  tint?: number
  /** carries the key with this id (drawn on the hood) */
  keyId?: number
  /** spawner: groups still waiting to drop in (shown as chips on the hood) */
  queue?: number[][]
  /** screws fastening blocks[k] to blocks[k - 1] */
  screws?: number[]
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
  const turn = facing === 'right' ? 90 : -90
  return (
    <g>
      {[0.24, 0.72].map((f) => (
        <rect key={f} x={x + w * f} y={y + h - 6} width={wheelW} height={10} rx={4} fill="#141026" stroke="#2c2645" strokeWidth={1} />
      ))}
      <g transform={`rotate(${turn} ${cx} ${cy})`}>
        <UprightTruck {...props} x={cx - h / 2} y={cy - w / 2} w={h} h={w} facing="up" turn={turn} />
      </g>
    </g>
  )
}

function UprightTruck({ x, y, w, h, facing, blocks, veiled, done, locked, lockColor, settleFrom = -1, onSettled, barrier, frozen, thawed, tint, keyId, queue, screws, turn }: Props & { facing: 'up' | 'down'; turn?: number }) {
  // a coloured truck is painted in its colour; every other truck is lavender
  const paint = tint === undefined ? null : BLOCK_COLORS[tint]
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

  // merge neighbouring visible blocks of the same colour into one long block (display only); cubes
  // still landing stay separate until they have settled, so each plays its own animation
  const groups: { from: number; to: number; color: number; hidden: boolean; landing: boolean }[] = []
  blocks.forEach((c, k) => {
    const isHidden = k < veiled
    const landing = settleFrom >= 0 && k >= settleFrom
    const last = groups[groups.length - 1]
    if (last && !landing && !last.landing && !isHidden && !last.hidden && last.color === c && last.to === k - 1) last.to = k
    else groups.push({ from: k, to: k, color: c, hidden: isHidden, landing })
  })

  return (
    <g>
      {/* soft ground shadow, then the body's thickness and its lit top */}
      <rect x={bodyX + 3} y={y + depth + 5} width={bodyW} height={topH} rx={r} fill="rgba(6,2,28,0.4)" />
      <rect x={bodyX} y={y + depth} width={bodyW} height={topH} rx={r} fill={paint ? shade(paint, -0.42) : '#46358c'} />
      <rect x={bodyX} y={y} width={bodyW} height={topH} rx={r} fill={paint ? shade(paint, -0.05) : 'url(#cc-truck-body)'} />
      <rect x={bodyX + 1.5} y={y + 1.5} width={bodyW - 3} height={topH - 3} rx={r - 1.5} fill="none" stroke="rgba(236,228,255,0.5)" strokeWidth={1.5} />
      {/* flat hood at the belt end, with a seam towards the bed */}
      <rect x={bodyX + wall * 0.5} y={hoodY + (up ? wall * 0.4 : 0)} width={bodyW - wall} height={hoodH - wall * 0.4} rx={r * 0.7} fill={paint ? shade(paint, 0.28) : 'url(#cc-truck-cab)'} />
      <rect x={bodyX + wall} y={up ? y + hoodH : y + topH - hoodH - 1.2} width={bodyW - 2 * wall} height={1.2} fill="rgba(40,20,120,0.45)" />
      {/* recessed cargo bed */}
      <rect x={bedX} y={bedY0} width={bedW} height={bedY1 - bedY0} rx={bedR} fill={paint ? shade(paint, -0.45) : 'url(#cc-truck-bed)'} />
      <rect x={bedX} y={bedY0} width={bedW} height={Math.max(2, slotH * 0.1)} rx={2} fill="rgba(20,8,70,0.3)" />
      {/* cargo */}
      {!done &&
        groups.map((g) => {
          const y0 = Math.min(slotY(g.from), slotY(g.to))
          const y1 = Math.max(slotY(g.from), slotY(g.to)) + slotH
          return (
            // a landing cube keeps its key while it settles, so cubes landing after it never restart it
            <g
              key={g.landing ? `land-${g.from}` : `${g.from}-${g.to}`}
              className={g.landing ? 'cc-settle' : undefined}
              onAnimationEnd={g.landing && g.to === blocks.length - 1 ? onSettled : undefined}
            >
              <Block3D x={bedX + 2} y={y0 + 1.5} w={bedW - 4} h={y1 - y0 - 3} color={g.color} hidden={g.hidden} turn={turn} />
            </g>
          )
        })}
      {done && (
        // finished: an empty bed with a tick, like the reference
        <path
          d={`M ${bedX + bedW * 0.3} ${(bedY0 + bedY1) / 2} l ${bedW * 0.16} ${bedW * 0.17} l ${bedW * 0.28} ${-bedW * 0.34}`}
          fill="none"
          stroke="#43328e"
          strokeWidth={Math.max(3, bedW * 0.09)}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {barrier && [-1, 1].map((side) => (
          // in front of the truck when there is room; sideways trucks sit close to the belt, so on the hood
          <Bollard key={side} cx={bodyX + bodyW / 2 + side * bodyW * 0.2} cy={turn ? hoodY + hoodH / 2 : up ? y - 9 : y + h + 5} r={Math.max(5, w * 0.085)} down={done} />
        ))}
      {!done &&
        screws?.map((k) => (
          <Screw key={k} cx={bedX + bedW / 2} cy={up ? bedY1 - k * slotH : bedY0 + k * slotH} r={Math.max(7, Math.min(bedW * 0.36, slotH * 0.42))} />
        ))}
      {queue?.length ? (
        // waiting groups as a little stack of cube cards: the next one in front (cube count on it),
        // one card behind it per extra group; kept upright even on sideways trucks
        <g transform={turn ? `rotate(${-turn} ${bodyX + bodyW / 2} ${hoodY + hoodH / 2})` : undefined} aria-hidden>
          {(() => {
            const size = Math.max(16, Math.min(bodyW * 0.62, 24))
            const cx = bodyX + bodyW / 2
            const cy = hoodY + hoodH / 2
            const next = queue[0]
            return (
              <>
                {queue.slice(1).map((g, k) => (
                  <rect
                    key={k}
                    x={cx - size / 2 + (k + 1) * 3.5}
                    y={cy - size / 2 - (k + 1) * 3.5}
                    width={size}
                    height={size}
                    rx={size * 0.22}
                    fill={shade(BLOCK_COLORS[g[g.length - 1]], -0.1)}
                    stroke="#ffffff"
                    strokeWidth={1.2}
                  />
                ))}
                <rect x={cx - size / 2} y={cy - size / 2 + 2} width={size} height={size} rx={size * 0.22} fill="rgba(6,4,24,0.5)" />
                <rect x={cx - size / 2} y={cy - size / 2} width={size} height={size} rx={size * 0.22} fill={BLOCK_COLORS[next[next.length - 1]]} stroke="#ffffff" strokeWidth={1.6} />
                <text x={cx} y={cy + size * 0.22} textAnchor="middle" fontSize={size * 0.64} fontWeight={900} fill="#ffffff" stroke="rgba(20,10,60,0.65)" strokeWidth={2} paintOrder="stroke" fontFamily="'Baloo 2', system-ui">
                  {next.length}
                </text>
              </>
            )
          })()}
        </g>
      ) : null}
      {paint && !locked && <PaintDrop cx={bodyX + bodyW / 2} cy={hoodY + hoodH / 2} s={Math.max(12, Math.min(bodyW * 0.42, hoodH * 1.6))} turn={turn} />}
      {keyId !== undefined && <KeyIcon cx={bodyX + bodyW / 2} cy={hoodY + hoodH / 2} s={Math.max(18, Math.min(bodyW * 0.8, hoodH * 2.2))} color={KEY_COLORS[keyId % KEY_COLORS.length]} />}
      {frozen && <Ice x={bodyX} y={y} w={bodyW} h={topH + depth} r={r} />}
      {thawed && <IceShards cx={bodyX + bodyW / 2} cy={y + topH / 2} spread={Math.max(bodyW, topH * 0.5)} />}
      {locked && <Curtain x={bodyX} y={y} w={bodyW} h={topH} r={r} color={BLOCK_COLORS[lockColor ?? 0]} />}
      {done && <Confetti cx={bodyX + bodyW / 2} cy={y + topH / 2} spread={Math.max(bodyW, topH * 0.6)} />}
    </g>
  )
}

/** A striped post seen from above; once the truck is sorted it sinks, leaving only its socket. */
function Bollard({ cx, cy, r, down }: { cx: number; cy: number; r: number; down: boolean }) {
  return (
    <g aria-hidden>
      <circle cx={cx} cy={cy + 1.5} r={r * 1.3} fill="rgba(6,4,24,0.45)" />
      <circle cx={cx} cy={cy} r={r * 1.25} fill="#1a1536" stroke="#6f62a8" strokeWidth={1.2} />
      {!down && (
        <>
          <circle cx={cx} cy={cy - 1} r={r} fill="#16121f" />
          <circle cx={cx} cy={cy - 1.5} r={r * 0.8} fill="#ffc928" />
          <circle cx={cx} cy={cy - 1.8} r={r * 0.55} fill="#16121f" />
          <circle cx={cx} cy={cy - 2} r={r * 0.34} fill="#ffd84d" />
          <circle cx={cx - r * 0.12} cy={cy - 2.3} r={r * 0.12} fill="#fff6c8" />
        </>
      )}
    </g>
  )
}

/** White paint drop on a coloured truck's hood: "this truck only takes its own colour". */
function PaintDrop({ cx, cy, s, turn }: { cx: number; cy: number; s: number; turn?: number }) {
  return (
    <g aria-hidden transform={turn ? `rotate(${-turn} ${cx} ${cy})` : undefined}>
      <path
        d={`M ${cx} ${cy - s * 0.55} C ${cx + s * 0.1} ${cy - s * 0.3} ${cx + s * 0.42} ${cy - s * 0.02} ${cx + s * 0.42} ${cy + s * 0.18} A ${s * 0.42} ${s * 0.42} 0 1 1 ${cx - s * 0.42} ${cy + s * 0.18} C ${cx - s * 0.42} ${cy - s * 0.02} ${cx - s * 0.1} ${cy - s * 0.3} ${cx} ${cy - s * 0.55} Z`}
        fill="#ffffff"
        stroke="rgba(20,10,60,0.45)"
        strokeWidth={1.2}
      />
      <ellipse cx={cx - s * 0.14} cy={cy + s * 0.12} rx={s * 0.08} ry={s * 0.14} fill="rgba(20,10,60,0.18)" />
    </g>
  )
}

/** A silver screw head pinning two groups together. */
function Screw({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g aria-hidden>
      <circle cx={cx} cy={cy + 1.2} r={r} fill="rgba(6,4,24,0.5)" />
      <circle cx={cx} cy={cy} r={r} fill="#d9dde8" stroke="#6b7086" strokeWidth={1.2} />
      <circle cx={cx - r * 0.25} cy={cy - r * 0.3} r={r * 0.35} fill="rgba(255,255,255,0.7)" />
      <path d={`M ${cx - r * 0.55} ${cy} L ${cx + r * 0.55} ${cy} M ${cx} ${cy - r * 0.55} L ${cx} ${cy + r * 0.55}`} stroke="#555a70" strokeWidth={Math.max(1.2, r * 0.28)} strokeLinecap="round" />
    </g>
  )
}

/** A chunky key lying on the hood. */
function KeyIcon({ cx, cy, s, color }: { cx: number; cy: number; s: number; color: string }) {
  const r = s * 0.2
  const x0 = cx - s / 2
  return (
    <g aria-hidden>
      <g transform="translate(0 1.5)" opacity={0.35}>
        <circle cx={x0 + r} cy={cy} r={r} fill="#100a2a" />
        <rect x={x0 + r * 1.6} y={cy - r * 0.32} width={s - r * 1.8} height={r * 0.64} rx={r * 0.3} fill="#100a2a" />
      </g>
      <circle cx={x0 + r} cy={cy} r={r} fill={color} stroke={shade(color, -0.35)} strokeWidth={1.2} />
      <circle cx={x0 + r} cy={cy} r={r * 0.42} fill={shade(color, -0.45)} />
      <rect x={x0 + r * 1.7} y={cy - r * 0.32} width={s - r * 1.8} height={r * 0.64} rx={r * 0.3} fill={color} stroke={shade(color, -0.35)} strokeWidth={1} />
      {[0.68, 0.86].map((f) => (
        <rect key={f} x={x0 + s * f} y={cy} width={r * 0.5} height={r * 0.85} rx={r * 0.15} fill={color} stroke={shade(color, -0.35)} strokeWidth={1} />
      ))}
      <rect x={x0 + r * 1.9} y={cy - r * 0.22} width={(s - r * 2.2) * 0.6} height={r * 0.16} rx={r * 0.08} fill="rgba(255,255,255,0.55)" />
    </g>
  )
}

/** A clear-blue block of ice over the whole truck, with cracks and a shine. */
function Ice({ x, y, w, h, r }: { x: number; y: number; w: number; h: number; r: number }) {
  return (
    <g aria-hidden>
      <rect x={x - 2} y={y - 2} width={w + 4} height={h + 4} rx={r + 2} fill="url(#cc-ice)" opacity={0.94} stroke="#e8f7ff" strokeWidth={2} />
      <path
        d={`M ${x + w * 0.18} ${y + h * 0.12} l ${w * 0.22} ${h * 0.2} l ${-w * 0.08} ${h * 0.16} l ${w * 0.3} ${h * 0.22} M ${x + w * 0.4} ${y + h * 0.32} l ${w * 0.35} ${-h * 0.08} M ${x + w * 0.62} ${y + h * 0.7} l ${w * 0.2} ${h * 0.18} M ${x + w * 0.32} ${y + h * 0.48} l ${-w * 0.16} ${h * 0.22}`}
        fill="none"
        stroke="rgba(255,255,255,0.75)"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x={x + w * 0.1} y={y + h * 0.05} width={w * 0.16} height={h * 0.88} rx={w * 0.08} fill="rgba(255,255,255,0.22)" />
      <circle cx={x + w * 0.78} cy={y + h * 0.14} r={Math.max(1.5, w * 0.04)} fill="#ffffff" opacity={0.9} />
    </g>
  )
}

const SHARD_COLORS = ['#e8f7ff', '#a9dcff', '#6bb6ff', '#ffffff']

/** Ice shards bursting off the truck; mounts when the ice breaks, so it plays exactly once. */
function IceShards({ cx, cy, spread }: { cx: number; cy: number; spread: number }) {
  return (
    <g aria-hidden pointerEvents="none">
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2 + (i % 2) * 0.25
        const d = spread * (0.4 + ((i * 29) % 10) / 25)
        const s = 4 + (i % 3) * 2
        return (
          <path
            key={i}
            className="cc-confetti"
            d={`M ${cx} ${cy - s} L ${cx + s * 0.8} ${cy + s * 0.5} L ${cx - s * 0.6} ${cy + s * 0.7} Z`}
            fill={SHARD_COLORS[i % SHARD_COLORS.length]}
            style={{ ['--dx' as string]: `${Math.cos(a) * d}px`, ['--dy' as string]: `${Math.sin(a) * d}px`, ['--rot' as string]: `${(i % 2 ? 1 : -1) * (120 + i * 25)}deg` }}
          />
        )
      })}
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
