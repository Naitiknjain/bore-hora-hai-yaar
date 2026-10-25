import { TRUCK_CAPACITY } from '../logic'
import { Block3D, BLOCK_COLORS, shade } from './Block3D'

export function TruckGradients() {
  return (
    <>
      <linearGradient id="cc-truck-body" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#9a7cff" />
        <stop offset="0.5" stopColor="#7350ea" />
        <stop offset="1" stopColor="#5232c4" />
      </linearGradient>
      <linearGradient id="cc-truck-cab" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#a68aff" />
        <stop offset="1" stopColor="#6a47e0" />
      </linearGradient>
      <linearGradient id="cc-truck-bed" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#2f1a86" />
        <stop offset="1" stopColor="#3d27a2" />
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
  facing: 'up' | 'down'
  blocks: number[]
  hidden: boolean
  done: boolean
  locked: boolean
  lockColor?: number
}

/**
 * Chunky toy truck seen from above at a slight angle: wheels poking out of the sides, raised body,
 * recessed load bed with 4 slots, cab with windscreen at the far end, soft ground shadow.
 */
export function TruckSprite({ x, y, w, h, facing, blocks, hidden, done, locked, lockColor }: Props) {
  const up = facing === 'up'
  const bodyX = x + w * 0.1
  const bodyW = w * 0.8
  const r = Math.max(6, w * 0.2)
  const cabH = h * 0.22
  const wall = Math.max(3, w * 0.09)
  const bedY0 = up ? y + wall : y + cabH + wall * 0.4
  const bedY1 = up ? y + h - cabH - wall * 0.4 : y + h - wall
  const bedX = bodyX + wall
  const bedW = bodyW - 2 * wall
  const slotH = (bedY1 - bedY0) / TRUCK_CAPACITY
  // stack bottom sits by the cab; the top of the stack is nearest the belt
  const slotY = (k: number) => (up ? bedY1 - (k + 1) * slotH : bedY0 + k * slotH)
  const wheelW = w * 0.18
  const wheelH = h * 0.13
  const wheelYs = up ? [y + h * 0.16, y + h - cabH - wheelH * 0.2] : [y + cabH - wheelH * 0.8, y + h - h * 0.16 - wheelH]

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
      {/* ground shadow */}
      <rect x={bodyX + 4} y={y + 8} width={bodyW} height={h} rx={r} fill="rgba(6,2,28,0.45)" />
      {/* wheels */}
      {wheelYs.map((wy, i) => (
        <g key={i}>
          <rect x={x} y={wy} width={wheelW} height={wheelH} rx={wheelW * 0.35} fill="#120e22" stroke="#2c2645" strokeWidth={1} />
          <rect x={x + w - wheelW} y={wy} width={wheelW} height={wheelH} rx={wheelW * 0.35} fill="#120e22" stroke="#2c2645" strokeWidth={1} />
          <rect x={x + wheelW * 0.25} y={wy + wheelH * 0.18} width={wheelW * 0.3} height={wheelH * 0.64} rx={wheelW * 0.15} fill="#3a3550" />
          <rect x={x + w - wheelW * 0.55} y={wy + wheelH * 0.18} width={wheelW * 0.3} height={wheelH * 0.64} rx={wheelW * 0.15} fill="#3a3550" />
        </g>
      ))}
      {/* body side (height) and top */}
      <rect x={bodyX} y={y + 5} width={bodyW} height={h - 3} rx={r} fill="#3a2196" />
      <rect x={bodyX} y={y} width={bodyW} height={h - 4} rx={r} fill="url(#cc-truck-body)" />
      <rect x={bodyX + 1.5} y={y + 1.5} width={bodyW - 3} height={h - 7} rx={r - 1.5} fill="none" stroke="rgba(230,220,255,0.45)" strokeWidth={1.5} />
      {/* cab at the far end */}
      {(() => {
        const cy = up ? y + h - cabH - 4 : y
        const glassY = up ? cy + cabH * 0.2 : cy + cabH * 0.38
        return (
          <g>
            <rect x={bodyX + wall * 0.6} y={cy + (up ? 0 : 2)} width={bodyW - wall * 1.2} height={cabH} rx={r * 0.8} fill="url(#cc-truck-cab)" stroke="#4a2db5" strokeWidth={1.2} />
            <rect x={bodyX + bodyW * 0.18} y={glassY} width={bodyW * 0.64} height={cabH * 0.42} rx={Math.min(6, cabH * 0.15)} fill="url(#cc-glass)" />
            <rect x={bodyX + bodyW * 0.24} y={glassY + cabH * 0.06} width={bodyW * 0.22} height={cabH * 0.1} rx={2} fill="rgba(255,255,255,0.8)" />
          </g>
        )
      })()}
      {/* load bed (recessed) */}
      <rect x={bedX} y={bedY0} width={bedW} height={bedY1 - bedY0} rx={Math.max(4, r * 0.55)} fill="url(#cc-truck-bed)" />
      <rect x={bedX} y={bedY0} width={bedW} height={Math.max(2, slotH * 0.12)} rx={2} fill="rgba(0,0,0,0.25)" />
      {/* slot separators */}
      {Array.from({ length: TRUCK_CAPACITY - 1 }, (_, k) => (
        <rect key={k} x={bedX + 3} y={bedY0 + (k + 1) * slotH - 0.6} width={bedW - 6} height={1.2} fill="rgba(255,255,255,0.08)" />
      ))}
      {/* cargo */}
      {groups.map((g) => {
        const y0 = Math.min(slotY(g.from), slotY(g.to))
        const y1 = Math.max(slotY(g.from), slotY(g.to)) + slotH
        return <Block3D key={g.from} x={bedX + 2.5} y={y0 + 2} w={bedW - 5} h={y1 - y0 - 4} color={g.color} hidden={g.hidden} />
      })}
      {done && (
        <g>
          <rect x={bedX} y={bedY0} width={bedW} height={bedY1 - bedY0} rx={Math.max(4, r * 0.55)} fill="rgba(20,10,60,0.45)" />
          <circle cx={bedX + bedW / 2} cy={(bedY0 + bedY1) / 2} r={Math.min(bedW * 0.42, 18)} fill="url(#cc-done)" stroke="#fff" strokeWidth={2.5} />
          <path
            d={`M ${bedX + bedW / 2 - Math.min(bedW * 0.18, 8)} ${(bedY0 + bedY1) / 2} l ${Math.min(bedW * 0.12, 5)} ${Math.min(bedW * 0.13, 5.5)} l ${Math.min(bedW * 0.24, 10.5)} ${-Math.min(bedW * 0.26, 11.5)}`}
            fill="none"
            stroke="#fff"
            strokeWidth={3.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}
      {locked && (
        <g>
          <rect x={bedX} y={bedY0} width={bedW} height={bedY1 - bedY0} rx={Math.max(4, r * 0.55)} fill="url(#curtain)" />
          {Array.from({ length: 5 }, (_, k) => (
            <rect key={k} x={bedX} y={bedY0 + ((bedY1 - bedY0) / 5) * k} width={bedW} height={2} fill="rgba(0,0,0,0.18)" />
          ))}
          {/* padlock in the colour that opens it */}
          {(() => {
            const cx = bedX + bedW / 2
            const cy = (bedY0 + bedY1) / 2
            const s = Math.min(bedW * 0.62, 30)
            const col = BLOCK_COLORS[lockColor ?? 0]
            return (
              <g>
                <path d={`M ${cx - s * 0.28} ${cy - s * 0.05} v ${-s * 0.18} a ${s * 0.28} ${s * 0.28} 0 0 1 ${s * 0.56} 0 v ${s * 0.18}`} fill="none" stroke={shade(col, -0.3)} strokeWidth={s * 0.13} />
                <rect x={cx - s * 0.42} y={cy - s * 0.08} width={s * 0.84} height={s * 0.62} rx={s * 0.14} fill={col} stroke={shade(col, -0.35)} strokeWidth={1.5} />
                <circle cx={cx} cy={cy + s * 0.18} r={s * 0.08} fill={shade(col, -0.55)} />
              </g>
            )
          })()}
        </g>
      )}
    </g>
  )
}
