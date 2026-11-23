// Rasterização de formas em pixels (linha, retângulo, elipse).
export type Put = (x: number, y: number) => void

export function line(x0: number, y0: number, x1: number, y1: number, put: Put) {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
  let err = dx + dy, x = x0, y = y0
  for (;;) { put(x, y); if (x === x1 && y === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x += sx } if (e2 <= dx) { err += dx; y += sy } }
}

export function rect(x0: number, y0: number, x1: number, y1: number, filled: boolean, put: Put) {
  const a = Math.min(x0, x1), b = Math.min(y0, y1), c = Math.max(x0, x1), d = Math.max(y0, y1)
  for (let y = b; y <= d; y++) for (let x = a; x <= c; x++) if (filled || x === a || x === c || y === b || y === d) put(x, y)
}

export function ellipse(x0: number, y0: number, x1: number, y1: number, filled: boolean, put: Put) {
  const a = Math.min(x0, x1), b = Math.min(y0, y1), c = Math.max(x0, x1), d = Math.max(y0, y1)
  const w = c - a + 1, h = d - b + 1, rx = w / 2, ry = h / 2, cx = a + rx - 0.5, cy = b + ry - 0.5
  const inside = (x: number, y: number) => x >= a && x <= c && y >= b && y <= d && ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0001
  for (let y = b; y <= d; y++) for (let x = a; x <= c; x++) {
    if (!inside(x, y)) continue
    if (filled || !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) put(x, y)
  }
}

/** Curva de Bézier quadrática (dois pontos e um de controle), traçada em segmentos de reta ligados. */
export function curve(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, put: Put) {
  const n = Math.max(2, Math.ceil((Math.hypot(cx - x0, cy - y0) + Math.hypot(x1 - cx, y1 - cy)) * 1.5))
  let px = x0, py = y0
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t, x = Math.round(u * u * x0 + 2 * u * t * cx + t * t * x1), y = Math.round(u * u * y0 + 2 * u * t * cy + t * t * y1)
    line(px, py, x, y, put); px = x; py = y
  }
}

/** Polígono por pontos. Fechado liga o último ao primeiro; preenchido usa a regra par-ímpar linha a linha. */
export function polygon(pts: { x: number; y: number }[], closed: boolean, filled: boolean, put: Put) {
  if (!pts.length) return
  if (filled && pts.length >= 3) {
    const ys = pts.map(p => p.y), top = Math.min(...ys), bot = Math.max(...ys)
    for (let y = top; y <= bot; y++) {
      const xs: number[] = []
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length]
        if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x))
      }
      xs.sort((p, q) => p - q)
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.round(xs[k]); x <= Math.round(xs[k + 1]); x++) put(x, y)
    }
  }
  for (let i = 0; i + 1 < pts.length; i++) line(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, put)
  if (closed && pts.length > 2) line(pts[pts.length - 1].x, pts[pts.length - 1].y, pts[0].x, pts[0].y, put)
  if (pts.length === 1) put(pts[0].x, pts[0].y)
}
