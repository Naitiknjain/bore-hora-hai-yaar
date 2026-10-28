import { GROUND, surfaceAt, type LevelData, type Obstacle, type SkaterState, type World } from './logic'

/**
 * Pixel-art renderer for Skater Boy. The whole scene is drawn into a small 400x200 buffer with plain
 * rectangles and a 3x5 bitmap font, then blown up 2x without smoothing - chunky, like the old phone games.
 * All art here is original.
 */

export const LW = 400
export const LH = 200
/** world units per buffer pixel */
const PX = 2
/** where the rider sits on screen (world units from the left edge) */
export const CAM_X = 220
const INK = '#140f24'

let buf: HTMLCanvasElement | null = null
let g: CanvasRenderingContext2D
const skies = new Map<World, HTMLCanvasElement>()

const R = (x: number, y: number, w: number, h: number, c: string) => {
  g.fillStyle = c
  g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)))
}
/** a list of rectangles drawn with a 1px dark outline around the whole group */
type Part = [number, number, number, number, string]
const outlined = (parts: Part[]) => {
  for (const [x, y, w, h] of parts) R(x - 1, y - 1, w + 2, h + 2, INK)
  for (const [x, y, w, h, c] of parts) R(x, y, w, h, c)
}
/** cheap deterministic noise for decoration */
const hash = (n: number) => {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// ---------------------------------------------------------------------------
// 3x5 bitmap font
// ---------------------------------------------------------------------------
const GLYPHS: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', '0': '111101101101111', '1': '010110010010111', '2': '110001010100111', '3': '110001010001110',
  '4': '101101111001001', '5': '111100110001110', '6': '011100111101111', '7': '111001010010010', '8': '111101111101111',
  '9': '111101111001110', '+': '000010111010000', '-': '000000111000000', '/': '001001010100100', '!': '010010010000010',
  ':': '000010000010000', '.': '000000000000010', '?': '110001010000010', ' ': '000000000000000',
}
export function textWidth(s: string, scale = 2) {
  return s.length * 4 * scale - scale
}
export function text(s: string, x: number, y: number, scale = 2, color = '#fff', align: 'left' | 'center' | 'right' = 'left') {
  const str = s.toUpperCase()
  const width = textWidth(str, scale)
  const x0 = Math.round(align === 'center' ? x - width / 2 : align === 'right' ? x - width : x)
  const y0 = Math.round(y)
  const pass = (ox: number, oy: number, c: string) => {
    for (let i = 0; i < str.length; i += 1) {
      const glyph = GLYPHS[str[i]] ?? GLYPHS['?']
      for (let b = 0; b < 15; b += 1) {
        if (glyph[b] === '1') R(x0 + i * 4 * scale + (b % 3) * scale + ox, y0 + Math.floor(b / 3) * scale + oy, scale, scale, c)
      }
    }
  }
  for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) pass(ox, oy, INK)
  pass(0, 0, color)
}
const bitmap = (rows: string[], x: number, y: number, scale: number, color: string, outline = true) => {
  const pass = (ox: number, oy: number, c: string) =>
    rows.forEach((row, r) => [...row].forEach((ch, col) => ch === '#' && R(x + col * scale + ox, y + r * scale + oy, scale, scale, c)))
  if (outline) for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) pass(ox, oy, INK)
  pass(0, 0, color)
}
const HEART = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...']
const GEM = ['..#..', '.###.', '#####', '.###.', '..#..']

// ---------------------------------------------------------------------------
// Backgrounds
// ---------------------------------------------------------------------------
const THEME: Record<World, { sky: string[]; top: string; seam: string; body: string; speck: string; pit: string }> = {
  town: { sky: ['#3d9be9', '#58b0f0', '#79c4f5', '#9ad6f8', '#bfe6fb', '#dff3fd'], top: '#c7ccd8', seam: '#9aa1b3', body: '#4a4f63', speck: '#3c4054', pit: '#0e0c1c' },
  forest: { sky: ['#4fb6e3', '#6fc6ea', '#93d6ee', '#b6e4ef', '#d6f0ec', '#ecf8e6'], top: '#5ccf5a', seam: '#3fae45', body: '#8a5a35', speck: '#6d4528', pit: '#120b08' },
  cemetery: { sky: ['#0f0a28', '#160f36', '#1e1545', '#271b55', '#312264', '#3c2a72'], top: '#4b6b3e', seam: '#36522c', body: '#3a3050', speck: '#2c2440', pit: '#07050f' },
}

function skyCanvas(world: World) {
  let c = skies.get(world)
  if (c) return c
  c = document.createElement('canvas')
  c.width = LW
  c.height = LH
  const prev = g
  g = c.getContext('2d')!
  const bands = THEME[world].sky
  const bh = Math.ceil(150 / bands.length)
  bands.forEach((col, i) => {
    R(0, i * bh, LW, bh, col)
    // dithered seam into the next band
    if (i < bands.length - 1) for (let x = (i % 2); x < LW; x += 2) R(x, (i + 1) * bh - 1, 1, 1, bands[i + 1])
  })
  R(0, bands.length * bh, LW, LH, bands[bands.length - 1])
  const disc = (cx: number, cy: number, r: number, col: string) => {
    for (let y = -r; y <= r; y += 1) {
      const w = Math.round(Math.sqrt(r * r - y * y))
      R(cx - w, cy + y, w * 2, 1, col)
    }
  }
  if (world === 'cemetery') {
    for (let i = 0; i < 70; i += 1) R(Math.floor(hash(i) * LW), Math.floor(hash(i + 500) * 120), 1, 1, hash(i + 900) < 0.3 ? '#c9b8ff' : '#ffffff')
    disc(322, 36, 14, '#f3efc8')
    disc(316, 32, 3, '#d8d2a6')
    disc(328, 42, 2, '#d8d2a6')
    disc(326, 28, 2, '#d8d2a6')
  } else if (world === 'town') {
    disc(334, 30, 12, '#ffe9a0')
    disc(334, 30, 9, '#fff6cf')
  } else {
    disc(70, 34, 10, '#fff3c0')
  }
  g = prev
  skies.set(world, c)
  return c
}

/** repeats `draw(x, i)` across the screen for a layer scrolling at `factor` of the camera speed */
const layer = (cam: number, factor: number, spacing: number, draw: (x: number, i: number) => void) => {
  const shift = (cam / PX) * factor
  const first = Math.floor(shift / spacing) - 1
  for (let i = first; i < first + LW / spacing + 3; i += 1) draw(i * spacing - shift, i)
}
const steppedTriangle = (cx: number, base: number, height: number, halfW: number, col: string) => {
  for (let y = 0; y < height; y += 2) {
    const w = Math.max(1, Math.round(halfW * (1 - y / height)))
    R(cx - w, base - y - 2, w * 2, 2, col)
  }
}

function drawBackdrop(world: World, cam: number, t: number) {
  g.drawImage(skyCanvas(world), 0, 0)
  const H0 = 150
  if (world === 'town') {
    layer(cam, 0.08, 140, (x, i) => {
      const y = 22 + hash(i) * 40
      R(x, y, 34, 6, '#ffffff')
      R(x + 6, y - 4, 18, 4, '#ffffff')
      R(x + 4, y + 6, 26, 2, '#d6ecfb')
    })
    layer(cam, 0.22, 44, (x, i) => {
      const h = 34 + Math.floor(hash(i) * 46)
      const w = 30 + Math.floor(hash(i + 7) * 10)
      R(x, H0 - h, w, h, '#7fa3c4')
      R(x, H0 - h, w, 2, '#9bbad6')
      for (let wy = H0 - h + 5; wy < H0 - 6; wy += 6) for (let wx = x + 4; wx < x + w - 4; wx += 6) R(wx, wy, 3, 3, hash(i * 31 + wx + wy) < 0.25 ? '#ffe9a0' : '#b7d3ea')
    })
    layer(cam, 0.5, 96, (x, i) => {
      if (hash(i + 3) < 0.5) {
        outlined([[x + 10, H0 - 38, 2, 38, '#3b4a63'], [x + 6, H0 - 40, 10, 3, '#3b4a63'], [x + 7, H0 - 37, 3, 2, '#ffe27a']])
      } else {
        outlined([[x + 4, H0 - 9, 22, 9, '#3fa34d'], [x + 8, H0 - 14, 14, 6, '#3fa34d']])
        R(x + 9, H0 - 13, 4, 2, '#5cc96a')
      }
    })
  } else if (world === 'forest') {
    layer(cam, 0.12, 120, (x, i) => {
      const h = 40 + hash(i) * 30
      steppedTriangle(x + 60, H0, h, 64, '#7bb1a5')
      steppedTriangle(x + 60, H0 - h + 12, 12, 13, '#e8f3f0')
    })
    layer(cam, 0.3, 22, (x, i) => {
      const h = 26 + hash(i) * 16
      steppedTriangle(x + 11, H0, h, 10, '#3f8a6b')
    })
    layer(cam, 0.55, 70, (x, i) => {
      if (hash(i + 11) < 0.35) return
      const h = 44 + hash(i) * 20
      R(x + 33, H0 - 12, 4, 12, '#5b3a29')
      steppedTriangle(x + 35, H0 - 8, h * 0.45, 17, '#2b6a4f')
      steppedTriangle(x + 35, H0 - 8 - h * 0.3, h * 0.45, 13, '#2b6a4f')
      steppedTriangle(x + 35, H0 - 8 - h * 0.6, h * 0.4, 9, '#2b6a4f')
    })
  } else {
    // twinkling stars on top of the cached sky
    for (let i = 0; i < 6; i += 1) {
      if (Math.sin(t * 3 + i * 1.7) > 0.6) R(Math.floor(hash(i * 13) * LW), Math.floor(hash(i * 17) * 110), 1, 1, '#ffffff')
    }
    layer(cam, 0.12, 110, (x, i) => {
      const h = 18 + hash(i) * 20
      for (let y = 0; y < h; y += 2) {
        const w = Math.round(60 * Math.sqrt(1 - y / h))
        R(x + 55 - w, H0 - y - 2, w * 2, 2, '#2a1f55')
      }
    })
    layer(cam, 0.3, 80, (x, i) => {
      if (hash(i + 5) < 0.4) return
      const h = 34 + hash(i) * 14
      R(x + 20, H0 - h, 3, h, '#1c1440')
      R(x + 12, H0 - h + 8, 9, 2, '#1c1440')
      R(x + 10, H0 - h + 4, 2, 5, '#1c1440')
      R(x + 23, H0 - h + 12, 8, 2, '#1c1440')
      R(x + 30, H0 - h + 7, 2, 6, '#1c1440')
    })
    layer(cam, 0.5, 8, (x, i) => {
      if (Math.floor(i / 12) % 3 === 2) return
      R(x, H0 - 14, 2, 14, '#120c26')
      R(x, H0 - 16, 2, 1, '#120c26')
      if (i % 12 === 0) R(x, H0 - 11, 96, 2, '#120c26')
    })
    // a bat crossing now and then
    const bx = ((t * 40) % (LW + 200)) - 100
    const flap = Math.sin(t * 18) > 0
    R(bx, 50 + Math.sin(t * 2) * 6, 3, 2, '#0a0718')
    R(bx - 3, 49 + Math.sin(t * 2) * 6 + (flap ? -1 : 1), 3, 1, '#0a0718')
    R(bx + 3, 49 + Math.sin(t * 2) * 6 + (flap ? -1 : 1), 3, 1, '#0a0718')
  }
}

function drawGround(level: LevelData, cam: number) {
  const th = THEME[level.world]
  // anything not covered by ground is a dark pit
  R(0, 151, LW, LH, th.pit)
  for (const s of level.segments) {
    const x0 = Math.floor((s.x0 - cam) / PX)
    const x1 = Math.ceil((s.x1 - cam) / PX)
    if (x1 < -2 || x0 > LW + 2) continue
    if (s.h1 === s.h0) {
      const top = Math.round((GROUND - s.h0) / PX)
      R(x0, top, x1 - x0, LH - top, th.body)
      // world-anchored decoration so it scrolls with the ground
      const wx0 = Math.max(s.x0, cam - 20)
      const wx1 = Math.min(s.x1, cam + LW * PX + 20)
      for (let wx = Math.ceil(wx0 / 14) * 14; wx < wx1; wx += 14) {
        const sx = (wx - cam) / PX
        const n = hash(wx)
        if (n < 0.5) R(sx, top + 6 + Math.floor(n * 30), 2, 1, th.speck)
        if (level.world === 'town' && wx % 42 === 0) R(sx, top, 1, 3, th.seam)
        if (level.world !== 'town' && n > 0.6) R(sx, top - 1 - (n > 0.85 ? 1 : 0), 1, 1 + (n > 0.85 ? 1 : 0), th.seam)
      }
      R(x0, top, x1 - x0, 3, th.top)
      R(x0, top + 3, x1 - x0, 1, th.seam)
      // cliff edges
      R(x0, top, 1, LH - top, th.speck)
      R(x1 - 1, top, 1, LH - top, th.speck)
    } else {
      // a wooden kicker ramp, drawn column by column
      for (let x = x0; x < x1; x += 1) {
        const wx = cam + (x + 0.5) * PX
        const h = s.h0 + ((s.h1 - s.h0) * (wx - s.x0)) / Math.max(1, s.x1 - s.x0)
        const top = Math.round((GROUND - h) / PX)
        const base = Math.round((GROUND - s.h0) / PX)
        R(x, base, 1, LH - base, th.body)
        R(x, top, 1, base - top, (x - x0) % 6 === 0 ? '#9a6232' : '#c98a4b')
        R(x, top, 1, 1, '#f0c48a')
      }
      R(x1 - 1, Math.round((GROUND - s.h1) / PX), 2, Math.round((s.h1 - s.h0) / PX) + 1, '#ffd23f')
      R(x0, Math.round((GROUND - s.h0) / PX), x1 - x0, 1, th.top)
    }
  }
}

function drawObstacle(level: LevelData, o: Obstacle, cam: number, t: number) {
  const x = (o.x - cam) / PX
  const w = o.w / PX
  if (x + w < -4 || x > LW + 4) return
  const base = Math.round((GROUND - (surfaceAt(level, o.x + o.w / 2) ?? 0)) / PX)
  const h = o.h / PX
  const y = base - h
  switch (o.kind) {
    case 'cone': {
      const rows: Part[] = [[x - 1, base - 2, w + 2, 2, '#c4501a']]
      for (let r = 2; r < h; r += 2) {
        const rw = Math.max(2, w * (1 - (r - 2) / h))
        rows.push([x + (w - rw) / 2, base - r - 2, rw, 2, '#ff7a1a'])
      }
      outlined(rows)
      R(x + w * 0.2, base - h * 0.5, w * 0.6, 2, '#ffffff')
      break
    }
    case 'bin':
      outlined([[x, y + 3, w, h - 3, '#2fa84f'], [x - 1, y, w + 2, 3, '#1f7a38']])
      for (let i = 3; i < w - 1; i += 4) R(x + i, y + 5, 1, h - 7, '#1f7a38')
      break
    case 'bench':
      outlined([[x, y, w, 2, '#b5703c'], [x, y + 3, w, 2, '#b5703c'], [x + 2, y + 5, 2, h - 5, '#5b3a29'], [x + w - 4, y + 5, 2, h - 5, '#5b3a29']])
      R(x, y, w, 1, '#e0a36a')
      break
    case 'rail': {
      const posts: Part[] = [[x, y, w, 3, '#c9d1e0']]
      for (let px = 2; px < w - 1; px += 20) posts.push([x + px, y + 3, 2, h - 3, '#7d879c'])
      posts.push([x + w - 3, y + 3, 2, h - 3, '#7d879c'])
      outlined(posts)
      R(x, y, w, 1, '#ffffff')
      R(x, y + 2, w, 1, '#8f99ae')
      break
    }
    case 'log':
      outlined([[x + 1, y, w - 2, h, '#8b5a2b'], [x, y + 1, w, h - 2, '#8b5a2b']])
      R(x + 2, y + 1, w - 6, 1, '#a8733f')
      R(x + w - 6, y + 2, 5, h - 4, '#d9a066')
      R(x + w - 4, y + h / 2 - 1, 2, 2, '#a8733f')
      break
    case 'trunk': {
      outlined([[x + 1, y, w - 2, h, '#7a4e2b'], [x, y + 1, w, h - 2, '#7a4e2b']])
      R(x + 1, y, w - 2, 2, '#9a6a3d')
      for (let i = 4; i < w - 8; i += 9) R(x + i, y + 4 + (i % 3) * 2, 5, 1, '#5b3a1f')
      for (let i = 10; i < w - 12; i += 37) R(x + i, y - 1, 6, 2, '#5ccf5a')
      R(x + w - 6, y + 2, 5, h - 4, '#d9a066')
      R(x + w - 4, y + h / 2 - 1, 2, 2, '#a8733f')
      break
    }
    case 'rock':
      outlined([[x + 2, y, w - 4, h, '#8a91a6'], [x, y + 3, w, h - 3, '#8a91a6']])
      R(x + 3, y + 1, w / 2 - 2, 2, '#b2b8c8')
      R(x + 1, base - 3, w - 2, 2, '#6c7387')
      break
    case 'stump':
      outlined([[x, y, w, h, '#6b4a2a'], [x - 2, base - 3, w + 4, 3, '#6b4a2a']])
      R(x, y, w, 3, '#d9a066')
      R(x + w / 2 - 1, y + 1, 2, 1, '#a8733f')
      break
    case 'tomb':
      outlined([[x, y + 3, w, h - 3, '#9aa3c0'], [x + 2, y + 1, w - 4, 2, '#9aa3c0'], [x + 4, y, w - 8, 1, '#9aa3c0']])
      R(x + w - 3, y + 3, 3, h - 3, '#6f7896')
      R(x + w / 2 - 1, y + 4, 2, 8, '#5b6380')
      R(x + w / 2 - 3, y + 6, 6, 2, '#5b6380')
      break
    case 'coffin':
      outlined([[x + 3, y, w - 6, h, '#6b3f2a'], [x, y + 2, w, h - 4, '#6b3f2a']])
      R(x + 3, y, w - 6, 1, '#8a5a3c')
      R(x + w / 2 - 1, y + 2, 2, h - 4, '#d9a066')
      R(x + w / 2 - 4, y + 4, 8, 2, '#d9a066')
      break
    case 'pumpkin': {
      outlined([[x + 2, y + 2, w - 4, h - 2, '#ff8a1d'], [x, y + 4, w, h - 6, '#ff8a1d'], [x + w / 2 - 1, y - 1, 2, 3, '#3f8a3a']])
      const glow = Math.sin(t * 6) > 0 ? '#ffe27a' : '#ffc94a'
      R(x + 3, y + 5, 2, 2, glow)
      R(x + w - 5, y + 5, 2, 2, glow)
      R(x + 4, y + h - 5, w - 8, 2, glow)
      R(x + 2, y + 3, 1, h - 5, '#d96a0f')
      R(x + w - 3, y + 3, 1, h - 5, '#d96a0f')
      break
    }
    case 'slab': {
      const parts: Part[] = [[x, y, w, 4, '#a7a0c0']]
      for (let px = 3; px < w - 6; px += 30) parts.push([x + px, y + 4, 6, h - 4, '#7a7396'])
      parts.push([x + w - 9, y + 4, 6, h - 4, '#7a7396'])
      outlined(parts)
      R(x, y, w, 1, '#d0cae6')
      for (let i = 9; i < w - 4; i += 23) R(x + i, y + 1, 1, 3, '#7a7396')
      break
    }
  }
}

// ---------------------------------------------------------------------------
// The skater (built from parts so it can crouch, push, spin and tumble)
// ---------------------------------------------------------------------------
const C = { cap: '#e94f37', capShade: '#a3311f', skin: '#f4c49a', hair: '#5b3a29', shirt: '#2ec4b6', shirtShade: '#1d8a80', pants: '#33449a', pantsShade: '#222e6b', shoe: '#f5f5f5', deck: '#ff7b29', grip: '#2a2a3a', wood: '#c98a4b', wheel: '#ffe27a' }

interface Pose {
  crouch: number
  arms: 'down' | 'out' | 'up'
  push: number
  /** horizontal squash for a spin (cos of the spin angle) */
  fx: number
  /** quarter turns, for a tumble */
  q: number
  board: boolean
  flip: number
}

function drawSkater(cx: number, feet: number, p: Pose) {
  const legH = 7 - p.crouch
  const pivotY = -11
  const map = (x: number, y: number): [number, number] => {
    let X = x * p.fx
    let Y = y - pivotY
    for (let i = 0; i < p.q; i += 1) [X, Y] = [-Y, X]
    return [cx + X, feet + Y + pivotY]
  }
  const parts: Part[] = []
  const add = (x: number, y: number, w: number, h: number, c: string) => {
    const [ax, ay] = map(x, y)
    const [bx, by] = map(x + w, y + h)
    parts.push([Math.min(ax, bx), Math.min(ay, by), Math.max(1, Math.abs(bx - ax)), Math.max(1, Math.abs(by - ay)), c])
  }
  const pushX = Math.round(4 * p.push)
  const pushY = Math.round(3 * p.push)
  // legs and shoes
  add(-4 - pushX, -legH, 3, legH + pushY, C.pantsShade)
  add(1, -legH, 3, legH, C.pants)
  add(-5 - pushX, pushY - 2, 4, 2, C.shoe)
  add(1, -2, 4, 2, C.shoe)
  add(-4, -legH - 1, 8, 2, C.pants)
  // body
  add(-4, -legH - 7, 8, 7, C.shirt)
  add(-4, -legH - 7, 2, 7, C.shirtShade)
  if (p.arms === 'down') {
    add(-6, -legH - 6, 2, 5, C.shirtShade)
    add(4, -legH - 6, 2, 5, C.shirt)
    add(-6, -legH - 1, 2, 2, C.skin)
    add(4, -legH - 1, 2, 2, C.skin)
  } else if (p.arms === 'out') {
    add(-8, -legH - 6, 4, 2, C.shirtShade)
    add(4, -legH - 6, 4, 2, C.shirt)
    add(-10, -legH - 6, 2, 2, C.skin)
    add(8, -legH - 6, 2, 2, C.skin)
  } else {
    add(-6, -legH - 12, 2, 6, C.shirtShade)
    add(4, -legH - 12, 2, 6, C.shirt)
    add(-6, -legH - 14, 2, 2, C.skin)
    add(4, -legH - 14, 2, 2, C.skin)
  }
  // head and cap
  add(-3, -legH - 13, 7, 6, C.skin)
  add(-3, -legH - 12, 2, 3, C.hair)
  add(2, -legH - 11, 1, 2, INK)
  add(-4, -legH - 15, 8, 3, C.cap)
  add(-4, -legH - 13, 8, 1, C.capShade)
  add(4, -legH - 13, 3, 1, C.capShade)
  outlined(parts)

  if (!p.board) return
  // the board: flips end over end during a flip trick, lifting a little off the feet
  const c = Math.cos(p.flip)
  const lift = Math.round(3 * Math.sin(Math.min(Math.PI, p.flip / 2)))
  const bp: Part[] = []
  const addB = (x: number, y: number, w: number, h: number, col: string) => {
    const [ax, ay] = map(x, y - lift)
    const [bx, by] = map(x + w, y + h - lift)
    bp.push([Math.min(ax, bx), Math.min(ay, by), Math.max(1, Math.abs(bx - ax)), Math.max(1, Math.abs(by - ay)), col])
  }
  if (Math.abs(c) < 0.45) {
    addB(-8, 0, 16, 1, C.wood)
  } else {
    addB(-8, 0, 16, 2, c > 0 ? C.deck : C.grip)
    addB(-9, -1, 2, 1, C.deck)
    addB(7, -1, 2, 1, C.deck)
    if (c > 0) {
      addB(-6, 2, 2, 2, C.wheel)
      addB(4, 2, 2, 2, C.wheel)
    } else {
      addB(-6, -2, 2, 2, C.wheel)
      addB(4, -2, 2, 2, C.wheel)
    }
  }
  outlined(bp)
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
export interface Popup {
  text: string
  age: number
  color: string
}
export interface View {
  level: LevelData
  s: SkaterState
  levelNo: number
  score: number
  pushing: boolean
  blink: boolean
  popups: Popup[]
  ready: number
}

export function drawScene(ctx: CanvasRenderingContext2D, v: View, outW: number, outH: number) {
  if (!buf) {
    buf = document.createElement('canvas')
    buf.width = LW
    buf.height = LH
  }
  const bctx = buf.getContext('2d')
  if (!bctx) return
  g = bctx
  const { level, s } = v
  const cam = s.x - CAM_X
  drawBackdrop(level.world, cam, s.t)
  drawGround(level, cam)

  // checkpoints and finish
  for (const cp of level.checkpoints ?? []) {
    const x = (cp - cam) / PX
    if (x < -10 || x > LW + 10) continue
    const top = Math.round((GROUND - (surfaceAt(level, cp) ?? 0)) / PX)
    const passed = s.checkpoint >= cp
    outlined([[x, top - 24, 1, 24, '#e6e6f0'], [x + 1, top - 24 + (Math.sin(s.t * 8) > 0 ? 0 : 1), 8, 5, passed ? '#3ee08f' : '#ff4d4d']])
  }
  const fx = (level.length - cam) / PX
  if (fx > -40 && fx < LW + 40) {
    const top = Math.round((GROUND - (surfaceAt(level, level.length) ?? 0)) / PX)
    outlined([[fx - 2, top - 34, 2, 34, '#e6e6f0'], [fx + 30, top - 34, 2, 34, '#e6e6f0'], [fx, top - 34, 30, 8, '#ffffff']])
    for (let i = 0; i < 15; i += 1) R(fx + i * 2, top - 34 + ((i % 2) * 4), 2, 4, INK)
  }

  for (const o of level.obstacles) drawObstacle(level, o, cam, s.t)

  // coins and gems
  level.coins.forEach((c, i) => {
    if (s.coins.has(i)) return
    const x = (c.x - cam) / PX
    if (x < -6 || x > LW + 6) return
    const y = (GROUND - c.h) / PX
    const w = [5, 3, 1, 3][Math.floor(s.t * 8 + i) % 4]
    outlined([[x - w / 2, y - 2, w, 5, '#ffd23f']])
    if (w > 1) R(x - w / 2, y - 2, 1, 2, '#fff3a0')
  })
  level.gems?.forEach((c, i) => {
    if (s.gems.has(i)) return
    const x = Math.round((c.x - cam) / PX)
    if (x < -8 || x > LW + 8) return
    const y = Math.round((GROUND - c.h) / PX + Math.sin(s.t * 3 + i) * 1.5)
    bitmap(['...#...', '..###..', '.#####.', '#######', '.#####.', '..###..', '...#...'], x - 3, y - 3, 1, '#4cf0ff')
    R(x - 1, y - 2, 1, 1, '#ffffff')
    if (Math.sin(s.t * 4 + i * 2) > 0.8) {
      R(x + 4, y - 5, 1, 3, '#ffffff')
      R(x + 3, y - 4, 3, 1, '#ffffff')
    }
  })

  // the rider
  const feet = Math.round((GROUND - s.h) / PX)
  const sx = CAM_X / PX
  if (s.status === 'bailed' || s.status === 'crashed') {
    const k = 1 - Math.max(0, s.bailTimer) / 1.1
    drawSkater(sx + k * 14, Math.min(feet, LH + 20), { crouch: 0, arms: 'up', push: 0, fx: 1, q: 1 + Math.min(2, Math.floor(k * 6)) % 4, board: false, flip: 0 })
    // the board keeps rolling away
    outlined([[sx + 10 + k * 60, feet - 1, 16, 2, C.deck]])
    text('OUCH!', sx + 6, feet - 44 - k * 8, 2, '#ff5d5d', 'center')
  } else if (!v.blink || Math.floor(s.t * 12) % 2 === 0) {
    const airborne = !s.grounded && !s.grind
    const pose: Pose = {
      crouch: s.grind ? 1 : airborne ? (s.vy > 0 ? 3 : 2) : 0,
      arms: s.grind ? 'out' : airborne ? (s.vy > 200 ? 'up' : 'out') : 'down',
      push: v.pushing && s.grounded ? (Math.sin(s.t * 12) + 1) / 2 : 0,
      fx: s.trick?.kind === 'spin' ? (Math.abs(Math.cos(s.spin)) < 0.2 ? 0.2 * Math.sign(Math.cos(s.spin) || 1) : Math.cos(s.spin)) : 1,
      q: 0,
      board: true,
      flip: s.trick?.kind === 'flip' ? s.rotation : 0,
    }
    drawSkater(sx, feet - 4, pose)
    if (s.grind) {
      // sparks off the rail
      for (let i = 0; i < 3; i += 1) {
        const n = hash(Math.floor(s.t * 30) * 3 + i)
        R(sx - 8 - n * 8, feet - 1 - n * 4, 1, 1, n > 0.5 ? '#ffe27a' : '#ffffff')
      }
    }
  }

  drawHud(v)

  ctx.imageSmoothingEnabled = false
  ctx.drawImage(buf, 0, 0, outW, outH)
}

function drawHud(v: View) {
  const { s, level } = v
  for (let i = 0; i < 3; i += 1) bitmap(HEART, 6 + i * 17, 6, 2, i < s.lives ? '#ff3b5c' : '#4a4060')
  bitmap(GEM, 60, 7, 2, '#4cf0ff')
  text(`${s.gems.size}/3`, 74, 7, 2, '#ffffff')
  text(`LV ${v.levelNo}`, 200, 4, 2, '#ffffff', 'center')
  // progress bar with checkpoint ticks and the rider's position
  const bx = 150
  const bw = 100
  R(bx - 1, 16, bw + 2, 5, INK)
  R(bx, 17, bw, 3, '#3a3456')
  R(bx, 17, Math.round(bw * Math.min(1, s.x / level.length)), 3, '#ffd23f')
  for (const cp of level.checkpoints ?? []) R(bx + Math.round((bw * cp) / level.length), 15, 1, 7, s.checkpoint >= cp ? '#3ee08f' : '#ffffff')
  R(bx + Math.round(bw * Math.min(1, s.x / level.length)) - 1, 14, 3, 3, C.cap)
  text(String(v.score), 362, 7, 2, '#ffe27a', 'right')

  v.popups.forEach((p, i) => {
    const a = p.age < 0.9 ? 1 : Math.max(0, 1 - (p.age - 0.9) / 0.4)
    if (a <= 0) return
    g.globalAlpha = a
    text(p.text, 200, 34 + i * 13 - p.age * 8, 2, p.color, 'center')
    g.globalAlpha = 1
  })

  if (v.ready > 0) {
    R(0, 80, LW, 34, 'rgba(20,15,36,0.55)')
    text(`LEVEL ${v.levelNo}`, 200, 84, 2, '#ffe27a', 'center')
    text('READY?', 200, 96, 3, '#ffffff', 'center')
  }
}
