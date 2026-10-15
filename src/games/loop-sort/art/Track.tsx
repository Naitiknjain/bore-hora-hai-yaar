import { CC } from './defs'

interface TrackProps {
  /** Centre line of the belt (rounded rectangle). */
  x: number
  y: number
  w: number
  h: number
  radius: number
  /** Belt width (channel). The raised rims are drawn either side of it. */
  width?: number
  /** Points along the belt, in travel order, used to place direction arrows. */
  points: [number, number][]
}

const rr = (x: number, y: number, w: number, h: number, r: number) => {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2))
  return { x, y, width: w, height: h, rx: rad, ry: rad }
}

/**
 * Raised conveyor loop: floor shadow, lit outer rim, recessed channel, inner rim lip and
 * engraved direction arrows. Pure decoration (no pointer events).
 */
export function Track({ x, y, w, h, radius, width = 34, points }: TrackProps) {
  const rim = width + 18
  const half = rim / 2
  // arrows halfway between consecutive belt positions, pointing in travel direction
  const arrows = points.map((p, i) => {
    const q = points[(i + 1) % points.length]
    const mx = (p[0] + q[0]) / 2
    const my = (p[1] + q[1]) / 2
    const angle = (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI
    return { mx, my, angle }
  })
  return (
    <g aria-hidden style={{ pointerEvents: 'none' }}>
      {/* ground shadow under the whole loop */}
      <rect {...rr(x - half + 4, y - half + 14, w + rim - 8, h + rim - 4, radius + half)} fill={CC.shadow} filter="url(#cc-blur-8)" />
      {/* floor inside the loop */}
      <rect {...rr(x + half, y + half, w - rim, h - rim, Math.max(8, radius - half))} fill="url(#cc-floor)" />
      <rect {...rr(x + half, y + half, w - rim, h - rim, Math.max(8, radius - half))} fill="url(#cc-floor-dots)" />
      {/* side wall (gives the rim its height) */}
      <rect {...rr(x, y + 6, w, h, radius)} fill="none" stroke={CC.rimDark} strokeWidth={rim} />
      {/* rim top face, lit from above */}
      <rect {...rr(x, y, w, h, radius)} fill="none" stroke="url(#cc-rim)" strokeWidth={rim} />
      {/* recessed belt channel */}
      <rect {...rr(x, y, w, h, radius)} fill="none" stroke="url(#cc-channel)" strokeWidth={width} />
      {/* inner shadow along the top of the channel */}
      <rect {...rr(x, y + 2, w, h, radius)} fill="none" stroke="rgba(20,8,70,0.35)" strokeWidth={width - 8} />
      <rect {...rr(x, y, w, h, radius)} fill="none" stroke={CC.channel} strokeWidth={width - 12} />
      {/* bright lips on the outer and inner edges */}
      <rect {...rr(x - half + 1.5, y - half + 1.5, w + rim - 3, h + rim - 3, radius + half - 1.5)} fill="none" stroke="rgba(214,202,255,0.9)" strokeWidth={2.5} />
      <rect {...rr(x + half - 1.5, y + half - 1.5, w - rim + 3, h - rim + 3, Math.max(6, radius - half + 1.5))} fill="none" stroke="rgba(214,202,255,0.75)" strokeWidth={2} />
      <rect {...rr(x - width / 2, y - width / 2, w + width, h + width, radius + width / 2)} fill="none" stroke="rgba(10,4,40,0.6)" strokeWidth={1.5} />
      <rect {...rr(x + width / 2, y + width / 2, w - width, h - width, Math.max(4, radius - width / 2))} fill="none" stroke="rgba(10,4,40,0.6)" strokeWidth={1.5} />
      {/* engraved direction arrows */}
      {arrows.map((a, i) => (
        <path
          key={i}
          d="M -3.5 -4.5 L 3.5 0 L -3.5 4.5 Z"
          transform={`translate(${a.mx} ${a.my}) rotate(${a.angle})`}
          fill="rgba(30,16,100,0.45)"
        />
      ))}
    </g>
  )
}
