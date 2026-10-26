/**
 * Original picture silhouettes for Arrow Go levels. Each picture is a little geometry program in a unit
 * square (x right, y down), so it can be rasterised at any grid size: small grids for early levels,
 * dense ones later. The arrows of a level fill the picture; clearing them reveals it in colour.
 */

type Shape = (x: number, y: number) => boolean
type P = [number, number]

const circle = (cx: number, cy: number, r: number): Shape => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r
const ellipse = (cx: number, cy: number, rx: number, ry: number, rot = 0): Shape => {
  const c = Math.cos(rot)
  const s = Math.sin(rot)
  return (x, y) => {
    const dx = x - cx
    const dy = y - cy
    const u = dx * c + dy * s
    const v = -dx * s + dy * c
    return (u / rx) ** 2 + (v / ry) ** 2 <= 1
  }
}
const rect = (x0: number, y0: number, x1: number, y1: number): Shape => (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1
const poly = (pts: P[]): Shape => (x, y) => {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const [xi, yi] = pts[i]
    const [xj, yj] = pts[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
const union = (...s: Shape[]): Shape => (x, y) => s.some((f) => f(x, y))
const minus = (a: Shape, ...b: Shape[]): Shape => (x, y) => a(x, y) && !b.some((f) => f(x, y))
const both = (a: Shape, b: Shape): Shape => (x, y) => a(x, y) && b(x, y)
const ring = (cx: number, cy: number, r: number, w: number) => minus(circle(cx, cy, r), circle(cx, cy, r - w))
const mirror = (pts: P[]): P[] => pts.map(([x, y]) => [1 - x, y])

function starPoints(n: number, cx: number, cy: number, ro: number, ri: number): P[] {
  const pts: P[] = []
  for (let i = 0; i < n * 2; i += 1) {
    const r = i % 2 ? ri : ro
    const a = -Math.PI / 2 + (i * Math.PI) / n
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
  }
  return pts
}

export interface Picture {
  name: string
  /** width / height of the picture */
  aspect: number
  /** colour the picture is revealed in */
  color: string
  shape: Shape
}

export const PICTURES: Picture[] = [
  { name: 'Heart', aspect: 1.1, color: '#ff4d6d', shape: union(circle(0.29, 0.34, 0.25), circle(0.71, 0.34, 0.25), poly([[0.06, 0.42], [0.94, 0.42], [0.5, 0.96]])) },
  { name: 'Star', aspect: 1, color: '#ffc928', shape: poly(starPoints(5, 0.5, 0.54, 0.5, 0.21)) },
  {
    name: 'House',
    aspect: 1,
    color: '#ff8a3d',
    shape: minus(union(poly([[0.02, 0.48], [0.5, 0.04], [0.98, 0.48]]), rect(0.14, 0.46, 0.86, 0.97), rect(0.66, 0.1, 0.8, 0.36)), rect(0.42, 0.7, 0.58, 0.97)),
  },
  { name: 'Tree', aspect: 0.8, color: '#2fd67c', shape: union(poly([[0.5, 0.02], [0.96, 0.72], [0.04, 0.72]]), rect(0.4, 0.7, 0.6, 0.99)) },
  { name: 'Fish', aspect: 1.35, color: '#35c8f0', shape: minus(union(ellipse(0.42, 0.5, 0.38, 0.3), poly([[0.7, 0.5], [0.99, 0.18], [0.99, 0.82]])), circle(0.24, 0.42, 0.05)) },
  {
    name: 'Cat',
    aspect: 1,
    color: '#a35cff',
    shape: minus(union(circle(0.5, 0.58, 0.4), poly([[0.12, 0.4], [0.16, 0.02], [0.44, 0.24]]), poly(mirror([[0.12, 0.4], [0.16, 0.02], [0.44, 0.24]]))), circle(0.36, 0.52, 0.06), circle(0.64, 0.52, 0.06)),
  },
  {
    name: 'Trophy',
    aspect: 1,
    color: '#ffb703',
    shape: union(rect(0.22, 0.03, 0.78, 0.28), ellipse(0.5, 0.28, 0.28, 0.25), rect(0.44, 0.5, 0.56, 0.74), rect(0.26, 0.74, 0.74, 0.94), ring(0.2, 0.24, 0.15, 0.07), ring(0.8, 0.24, 0.15, 0.07)),
  },
  {
    name: 'Rocket',
    aspect: 0.75,
    color: '#ff5d8f',
    shape: minus(union(ellipse(0.5, 0.44, 0.2, 0.43), poly([[0.33, 0.58], [0.06, 0.95], [0.38, 0.84]]), poly(mirror([[0.33, 0.58], [0.06, 0.95], [0.38, 0.84]]))), circle(0.5, 0.36, 0.07)),
  },
  { name: 'Mushroom', aspect: 1, color: '#ff3b4f', shape: union(both(ellipse(0.5, 0.5, 0.48, 0.44), rect(0, 0, 1, 0.5)), rect(0.34, 0.48, 0.66, 0.97)) },
  {
    name: 'Umbrella',
    aspect: 1,
    color: '#3d7bff',
    shape: union(both(ellipse(0.5, 0.48, 0.48, 0.44), rect(0, 0, 1, 0.48)), rect(0.46, 0.46, 0.54, 0.86), both(ring(0.62, 0.84, 0.12, 0.08), rect(0, 0.84, 1, 1))),
  },
  { name: 'Apple', aspect: 1, color: '#ff3b4f', shape: union(circle(0.37, 0.58, 0.32), circle(0.63, 0.58, 0.32), rect(0.47, 0.1, 0.54, 0.3), ellipse(0.66, 0.14, 0.14, 0.06, -0.5)) },
  { name: 'Bell', aspect: 1, color: '#ffc928', shape: union(poly([[0.22, 0.78], [0.3, 0.32], [0.5, 0.1], [0.7, 0.32], [0.78, 0.78]]), rect(0.1, 0.76, 0.9, 0.86), circle(0.5, 0.92, 0.07), circle(0.5, 0.08, 0.06)) },
  { name: 'Crown', aspect: 1.25, color: '#ffb703', shape: poly([[0.03, 0.92], [0.03, 0.2], [0.27, 0.52], [0.5, 0.06], [0.73, 0.52], [0.97, 0.2], [0.97, 0.92]]) },
  { name: 'Gem', aspect: 1.1, color: '#35c8f0', shape: poly([[0.22, 0.06], [0.78, 0.06], [0.99, 0.34], [0.5, 0.97], [0.01, 0.34]]) },
  { name: 'Moon', aspect: 1, color: '#ffd166', shape: minus(circle(0.5, 0.5, 0.47), circle(0.7, 0.36, 0.38)) },
  { name: 'Sun', aspect: 1, color: '#ff9f1c', shape: union(circle(0.5, 0.5, 0.27), poly(starPoints(10, 0.5, 0.5, 0.5, 0.3))) },
  {
    name: 'Boat',
    aspect: 1.1,
    color: '#3d7bff',
    shape: union(poly([[0.02, 0.66], [0.98, 0.66], [0.8, 0.94], [0.2, 0.94]]), rect(0.47, 0.05, 0.54, 0.66), poly([[0.55, 0.08], [0.55, 0.6], [0.92, 0.6]]), poly([[0.46, 0.2], [0.46, 0.6], [0.14, 0.6]])),
  },
  { name: 'Car', aspect: 1.5, color: '#ff3b4f', shape: union(rect(0.03, 0.42, 0.97, 0.74), poly([[0.2, 0.44], [0.32, 0.12], [0.7, 0.12], [0.82, 0.44]]), circle(0.26, 0.78, 0.15), circle(0.74, 0.78, 0.15)) },
  { name: 'Key', aspect: 1.7, color: '#ffc928', shape: union(ring(0.24, 0.5, 0.23, 0.12), rect(0.44, 0.42, 0.97, 0.58), rect(0.74, 0.58, 0.82, 0.8), rect(0.87, 0.58, 0.95, 0.72)) },
  { name: 'Leaf', aspect: 1, color: '#2fd67c', shape: union(ellipse(0.52, 0.46, 0.46, 0.25, -Math.PI / 4), poly([[0.18, 0.78], [0.24, 0.72], [0.05, 0.98], [0.02, 0.95]])) },
  {
    name: 'Butterfly',
    aspect: 1.2,
    color: '#ff5fb0',
    shape: union(ellipse(0.27, 0.32, 0.25, 0.23), ellipse(0.73, 0.32, 0.25, 0.23), ellipse(0.3, 0.72, 0.18, 0.17), ellipse(0.7, 0.72, 0.18, 0.17), rect(0.46, 0.12, 0.54, 0.92)),
  },
  {
    name: 'Ghost',
    aspect: 0.85,
    color: '#a35cff',
    shape: minus(union(circle(0.5, 0.42, 0.4), rect(0.1, 0.42, 0.9, 0.86), circle(0.2, 0.86, 0.1), circle(0.5, 0.86, 0.1), circle(0.8, 0.86, 0.1)), circle(0.36, 0.42, 0.07), circle(0.64, 0.42, 0.07)),
  },
  {
    name: 'Anchor',
    aspect: 1,
    color: '#3d7bff',
    shape: union(rect(0.45, 0.14, 0.55, 0.9), ring(0.5, 0.1, 0.1, 0.06), rect(0.26, 0.24, 0.74, 0.32), both(ring(0.5, 0.52, 0.42, 0.1), rect(0, 0.6, 1, 1)), poly([[0.02, 0.66], [0.2, 0.56], [0.14, 0.74]]), poly(mirror([[0.02, 0.66], [0.2, 0.56], [0.14, 0.74]]))),
  },
  { name: 'Music note', aspect: 0.8, color: '#ff8a2a', shape: union(ellipse(0.3, 0.82, 0.24, 0.16, -0.35), rect(0.46, 0.08, 0.56, 0.82), poly([[0.56, 0.08], [0.94, 0.28], [0.94, 0.44], [0.56, 0.26]])) },
  {
    name: 'Smiley',
    aspect: 1,
    color: '#ffc928',
    shape: minus(circle(0.5, 0.5, 0.48), circle(0.34, 0.38, 0.08), circle(0.66, 0.38, 0.08), both(ring(0.5, 0.5, 0.31, 0.09), rect(0, 0.58, 1, 1))),
  },
  {
    name: 'Flower',
    aspect: 0.85,
    color: '#ff5fb0',
    shape: union(
      ...Array.from({ length: 6 }, (_, i) => circle(0.5 + Math.cos((i * Math.PI) / 3) * 0.22, 0.32 + Math.sin((i * Math.PI) / 3) * 0.22, 0.15)),
      rect(0.46, 0.5, 0.54, 0.99),
      ellipse(0.68, 0.8, 0.16, 0.07, -0.4),
    ),
  },
  {
    name: 'Bird',
    aspect: 1.3,
    color: '#35c8f0',
    shape: minus(union(ellipse(0.44, 0.6, 0.33, 0.26), circle(0.72, 0.36, 0.17), poly([[0.86, 0.32], [0.99, 0.4], [0.86, 0.46]]), poly([[0.16, 0.56], [0.0, 0.34], [0.04, 0.72]])), circle(0.75, 0.32, 0.04)),
  },
  {
    name: 'Turtle',
    aspect: 1.4,
    color: '#2fd67c',
    shape: union(both(ellipse(0.48, 0.6, 0.38, 0.46), rect(0, 0, 1, 0.66)), circle(0.9, 0.56, 0.1), circle(0.22, 0.7, 0.09), circle(0.74, 0.7, 0.09), rect(0.1, 0.56, 0.86, 0.68)),
  },
  {
    name: 'Cupcake',
    aspect: 0.9,
    color: '#ff5fb0',
    shape: union(poly([[0.16, 0.56], [0.84, 0.56], [0.72, 0.97], [0.28, 0.97]]), circle(0.28, 0.5, 0.16), circle(0.5, 0.38, 0.22), circle(0.72, 0.5, 0.16), circle(0.5, 0.1, 0.08)),
  },
  { name: 'Lightning', aspect: 0.75, color: '#ffd23f', shape: poly([[0.58, 0.01], [0.1, 0.56], [0.44, 0.56], [0.3, 0.99], [0.9, 0.38], [0.56, 0.38], [0.76, 0.01]]) },
]

/** Rasterises a picture into grid cells (3x3 supersampling, a cell counts when at least 4 samples hit). */
export function rasterise(p: Picture, width: number, height: number): boolean[][] {
  const grid: boolean[][] = []
  for (let y = 0; y < height; y += 1) {
    const row: boolean[] = []
    for (let x = 0; x < width; x += 1) {
      let hits = 0
      for (let sy = 0; sy < 3; sy += 1) for (let sx = 0; sx < 3; sx += 1) if (p.shape((x + (sx + 0.5) / 3) / width, (y + (sy + 0.5) / 3) / height)) hits += 1
      row.push(hits >= 4)
    }
    grid.push(row)
  }
  return grid
}
