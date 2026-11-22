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
