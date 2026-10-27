import { memo } from 'react'
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
  /** Part of the loop that runs through a hidden tunnel (not drawn); its ends get caps. */
  tunnel?: { x: number; y: number; w: number; h: number }
}

const rr = (x: number, y: number, w: number, h: number, r: number) => {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2))
  return { x, y, width: w, height: h, rx: rad, ry: rad }
}

/**
 * Raised conveyor loop: floor shadow, lit outer rim, recessed channel, inner rim lip and
 * engraved direction arrows. Pure decoration (no pointer events).
 */
export const Track = memo(function Track({ x, y, w, h, radius, width = 34, points, tunnel }: TrackProps) {
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
  const maskId = tunnel ? `cc-tunnel-${Math.round(tunnel.x)}-${Math.round(tunnel.y)}-${Math.round(tunnel.h)}` : undefined
  return (
    <g aria-hidden style={{ pointerEvents: 'none' }}>
      {tunnel && (
        <mask id={maskId} maskUnits="userSpaceOnUse" x={-50} y={-50} width={w + 400} height={h + 600}>
          <rect x={-50} y={-50} width={w + 400} height={h + 600} fill="#fff" />
          <rect x={tunnel.x} y={tunnel.y} width={tunnel.w} height={tunnel.h} fill="#000" />
        </mask>
      )}
      <g mask={maskId ? `url(#${maskId})` : undefined}>
      {/* ground shadow under the whole loop */}
      <rect {...rr(x - half - 6, y - half + 6, w + rim + 12, h + rim + 18, radius + half + 8)} fill="rgba(8,3,30,0.18)" />
      <rect {...rr(x - half - 1, y - half + 9, w + rim + 2, h + rim + 8, radius + half + 3)} fill="rgba(8,3,30,0.25)" />
      <rect {...rr(x - half + 3, y - half + 11, w + rim - 6, h + rim, radius + half)} fill={CC.shadow} />
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
      <rect {...rr(x, y + 2, w, h, radius)} fill="none" stroke="rgba(16,14,50,0.35)" strokeWidth={width - 8} />
      <rect {...rr(x, y, w, h, radius)} fill="none" stroke={CC.channel} strokeWidth={width - 12} />
      {/* bright lips on the outer and inner edges */}
      <rect {...rr(x - half + 1.5, y - half + 1.5, w + rim - 3, h + rim - 3, radius + half - 1.5)} fill="none" stroke="rgba(184,180,216,0.9)" strokeWidth={2.5} />
      <rect {...rr(x + half - 1.5, y + half - 1.5, w - rim + 3, h - rim + 3, Math.max(6, radius - half + 1.5))} fill="none" stroke="rgba(184,180,216,0.85)" strokeWidth={2} />
      <rect {...rr(x - width / 2, y - width / 2, w + width, h + width, radius + width / 2)} fill="none" stroke="rgba(14,12,48,0.75)" strokeWidth={1.5} />
      <rect {...rr(x + width / 2, y + width / 2, w - width, h - width, Math.max(4, radius - width / 2))} fill="none" stroke="rgba(14,12,48,0.75)" strokeWidth={1.5} />
      {/* engraved direction arrows */}
      {arrows.map((a, i) => (
        <path
          key={i}
          d="M -3.5 -4.5 L 3.5 0 L -3.5 4.5 Z"
          transform={`translate(${a.mx} ${a.my}) rotate(${a.angle})`}
          fill="rgba(70,64,130,0.55)"
        />
      ))}
      </g>
      {/* end caps where the track enters and leaves the tunnel */}
      {tunnel &&
        [y, y + h].map((cy) => (
          <g key={cy}>
            <rect x={tunnel.x + tunnel.w - 10} y={cy - half + 6} width={16} height={rim} rx={7} fill={CC.rimDark} />
            <rect x={tunnel.x + tunnel.w - 10} y={cy - half} width={16} height={rim} rx={7} fill="url(#cc-rim)" stroke="rgba(184,180,216,0.9)" strokeWidth={2} />
          </g>
        ))}
    </g>
  )
})
