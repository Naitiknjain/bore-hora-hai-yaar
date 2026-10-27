/** Colour helpers + glossy, dimensional blocks (original artwork drawn in code). */

// the first 8 are the bright starter colours; later levels also use brown, grey, white and black
export const BLOCK_COLORS = ['#ff3b4f', '#3d7bff', '#ffc928', '#2fd67c', '#a35cff', '#ff8a2a', '#ff5fb0', '#35c8f0', '#a8683a', '#9aa3b4', '#f4f1ea', '#3a3646']
export const BLOCK_NAMES = ['Red', 'Blue', 'Yellow', 'Green', 'Purple', 'Orange', 'Pink', 'Sky', 'Brown', 'Grey', 'White', 'Black']

/** Mixes a hex colour towards white (amt > 0) or black (amt < 0). */
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(amt > 0 ? c + (255 - c) * amt : c * (1 + amt)))
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

export function BlockGradients() {
  return (
    <>
      {BLOCK_COLORS.map((c, i) => (
        <linearGradient key={i} id={`cc-block-${i}`} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor={shade(c, 0.35)} />
          <stop offset="0.45" stopColor={c} />
          <stop offset="1" stopColor={shade(c, -0.22)} />
        </linearGradient>
      ))}
    </>
  )
}

interface BlockProps {
  x: number
  y: number
  w: number
  h: number
  color: number
  hidden?: boolean
  /** rotation (degrees) of the drawing it sits in; the block turns back so its thickness still faces down */
  turn?: number
}

/** One block (or a merged run of same-coloured blocks): lit top face, darker side face, gloss. */
export function Block3D({ turn, ...props }: BlockProps) {
  if (!turn) return <Block3DFlat {...props} />
  // inside a quarter-turned truck: draw the block in screen orientation, then turn it to fit the bed
  const cx = props.x + props.w / 2
  const cy = props.y + props.h / 2
  const swap = Math.abs(turn) % 180 === 90
  const w = swap ? props.h : props.w
  const h = swap ? props.w : props.h
  return (
    <g transform={`rotate(${-turn} ${cx} ${cy})`}>
      <Block3DFlat {...props} x={cx - w / 2} y={cy - h / 2} w={w} h={h} />
    </g>
  )
}

function Block3DFlat({ x, y, w, h, color, hidden }: Omit<BlockProps, 'turn'>) {
  const side = Math.max(3, Math.round(h * 0.16)) // visible thickness
  const r = Math.min(7, w * 0.18)
  const base = BLOCK_COLORS[color]
  // light comes from the top of the screen, so the thickness is always drawn below the face
  if (hidden) {
    return (
      <g>
        <rect x={x} y={y + side * 0.6} width={w} height={h - side * 0.6} rx={r} fill="#1b2560" />
        <rect x={x} y={y} width={w} height={h - side} rx={r} fill="url(#hiddenCube)" />
        <rect x={x + 2} y={y + 2} width={w - 4} height={Math.max(2, (h - side) * 0.22)} rx={r * 0.7} fill="rgba(255,255,255,0.12)" />
        <text x={x + w / 2} y={y + (h - side) / 2 + Math.min(w, h) * 0.17} textAnchor="middle" fontSize={Math.min(w, h - side) * 0.5} fontWeight={900} fill="#c9d3ff" fontFamily="'Baloo 2', system-ui">
          ?
        </text>
      </g>
    )
  }
  return (
    <g>
      {/* side face (thickness) */}
      <rect x={x} y={y + side} width={w} height={h - side} rx={r} fill={shade(base, -0.35)} />
      {/* top face */}
      <rect x={x} y={y} width={w} height={h - side} rx={r} fill={`url(#cc-block-${color})`} />
      {/* bevel lip + gloss */}
      <rect x={x + 1.2} y={y + 1.2} width={w - 2.4} height={h - side - 2.4} rx={r - 1} fill="none" stroke={shade(base, 0.5)} strokeOpacity={0.55} strokeWidth={1.2} />
      <rect x={x + w * 0.12} y={y + (h - side) * 0.1} width={w * 0.76} height={Math.max(2, (h - side) * 0.2)} rx={Math.max(1, (h - side) * 0.1)} fill="rgba(255,255,255,0.42)" />
      <circle cx={x + w * 0.2} cy={y + (h - side) * 0.62} r={Math.max(0.8, Math.min(w, h) * 0.05)} fill="rgba(255,255,255,0.35)" />
    </g>
  )
}

/** Tiny cube used for the conveyor stream (SVG fallback; the canvas stream draws its own). */
export function MiniCube({ x, y, s, color }: { x: number; y: number; s: number; color: number }) {
  const base = BLOCK_COLORS[color]
  return (
    <g>
      <rect x={x} y={y + s * 0.25} width={s} height={s * 0.85} rx={s * 0.22} fill={shade(base, -0.38)} />
      <rect x={x} y={y} width={s} height={s * 0.85} rx={s * 0.22} fill={base} />
      <rect x={x + s * 0.18} y={y + s * 0.12} width={s * 0.5} height={s * 0.22} rx={s * 0.1} fill="rgba(255,255,255,0.45)" />
    </g>
  )
}
