/**
 * Shared SVG paint for Chakkar Cubes (original artwork, drawn in code).
 * Rendered once per board; ids are prefixed with `cc-` to avoid clashes.
 */
export const CC = {
  rimLight: '#9c86dc',
  rim: '#7159ad',
  rimDark: '#3b2c78',
  channel: '#343166',
  channelLight: '#3a376e',
  floor: '#2f2968',
  shadow: 'rgba(6, 4, 24, 0.5)',
}

export function ArtDefs() {
  return (
    <defs>
      {/* soft drop shadow for raised objects */}
      <filter id="cc-shadow" x="-20%" y="-20%" width="140%" height="160%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="5" />
        <feOffset dy="7" result="b" />
        <feColorMatrix in="b" type="matrix" values="0 0 0 0 0.03  0 0 0 0 0.01  0 0 0 0 0.12  0 0 0 0.6 0" />
        <feMerge>
          <feMergeNode />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="cc-blur-8">
        <feGaussianBlur stdDeviation="8" />
      </filter>
      {/* raised rim: lit from the top */}
      <linearGradient id="cc-rim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={CC.rimLight} />
        <stop offset="0.45" stopColor={CC.rim} />
        <stop offset="1" stopColor={CC.rimDark} />
      </linearGradient>
      {/* recessed belt channel */}
      <linearGradient id="cc-channel" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#2c2a5a" />
        <stop offset="1" stopColor={CC.channelLight} />
      </linearGradient>
      {/* floor inside / outside the loop */}
      <radialGradient id="cc-floor" cx="0.5" cy="0.45" r="0.7">
        <stop offset="0" stopColor="#332c6e" />
        <stop offset="1" stopColor="#29245e" />
      </radialGradient>
      <pattern id="cc-floor-dots" width="16" height="16" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="1" fill="rgba(255,255,255,0.05)" />
      </pattern>
      {/* hidden cube: quilted pattern */}
      <pattern id="hiddenCube" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="8" height="8" fill="#2c3f8f" />
        <rect width="4" height="8" fill="#334aa3" />
        <rect width="8" height="1" fill="#1f2d6b" />
      </pattern>
      <pattern id="curtain" width="8" height="8" patternUnits="userSpaceOnUse">
        <rect width="8" height="8" fill="#c0265a" />
        <rect width="4" height="8" fill="#e23b73" />
      </pattern>
    </defs>
  )
}
