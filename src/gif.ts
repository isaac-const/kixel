// Codificador de GIF animado (89a): paleta global, transparência, laço infinito.
export type GifFrame = { w: number; h: number; px: Uint8Array }

class Bits {
  out: number[] = []; cur = 0; n = 0
  put(code: number, size: number) { this.cur |= code << this.n; this.n += size; while (this.n >= 8) { this.out.push(this.cur & 255); this.cur >>>= 8; this.n -= 8 } }
  flush() { if (this.n > 0) this.out.push(this.cur & 255); this.cur = 0; this.n = 0 }
}

function lzw(idx: Uint8Array, minCode: number): number[] {
  const clear = 1 << minCode, eoi = clear + 1, b = new Bits()
  let nbits = minCode + 1, maxcode = (1 << nbits) - 1, free = eoi + 1, dict = new Map<number, number>()
  const emit = (c: number) => { b.put(c, nbits); if (free > maxcode) { nbits++; maxcode = (1 << nbits) - 1 } }
  const reset = () => { dict = new Map(); free = eoi + 1; nbits = minCode + 1; maxcode = (1 << nbits) - 1 }
  b.put(clear, nbits)
  let prefix = idx[0]
  for (let i = 1; i < idx.length; i++) {
    const k = idx[i], key = prefix * 256 + k, hit = dict.get(key)
    if (hit !== undefined) { prefix = hit; continue }
    emit(prefix)
    if (free < 4096) dict.set(key, free++)
    else { b.put(clear, nbits); reset() }
    prefix = k
  }
  emit(prefix); b.put(eoi, nbits); b.flush()
  return b.out
}

export function encodeGif(frames: GifFrame[], scale: number, delayMs: number | number[], loop = true): Uint8Array {
  const w = frames[0].w * scale, h = frames[0].h * scale
  // paleta: cores opacas únicas (se passar de 255, reduz para 6 níveis por canal)
  const uniq = new Map<number, number>(); let transparent = false
  const rgb = (p: Uint8Array, o: number) => (p[o] << 16) | (p[o + 1] << 8) | p[o + 2]
  for (const f of frames) for (let o = 0; o < f.px.length; o += 4) { if (f.px[o + 3] < 128) transparent = true; else uniq.set(rgb(f.px, o), 0) }
  const q = uniq.size > (transparent ? 255 : 256)
  const quant = (v: number) => Math.round(Math.round((v / 255) * 5) * 51)
  const key = (p: Uint8Array, o: number) => (q ? (quant(p[o]) << 16) | (quant(p[o + 1]) << 8) | quant(p[o + 2]) : rgb(p, o))
  const pal: number[] = []; const index = new Map<number, number>()
  if (transparent) pal.push(0)
  for (const f of frames) for (let o = 0; o < f.px.length; o += 4) if (f.px[o + 3] >= 128) { const c = key(f.px, o); if (!index.has(c)) { index.set(c, pal.length); pal.push(c) } }
  let bits = 1; while ((1 << bits) < Math.max(2, pal.length)) bits++
  const minCode = Math.max(2, bits), size = 1 << bits
  const out: number[] = []
  const u16 = (v: number) => out.push(v & 255, (v >> 8) & 255)
  out.push(...[...'GIF89a'].map(c => c.charCodeAt(0)))
  u16(w); u16(h); out.push(0x80 | 0x70 | (bits - 1), 0, 0)
  for (let i = 0; i < size; i++) { const c = pal[i] ?? 0; out.push((c >> 16) & 255, (c >> 8) & 255, c & 255) }
  if (loop) out.push(0x21, 0xff, 0x0b, ...[...'NETSCAPE2.0'].map(c => c.charCodeAt(0)), 3, 1, 0, 0, 0)
  const delayOf = (i: number) => Math.max(2, Math.round((Array.isArray(delayMs) ? (delayMs[i] ?? 100) : delayMs) / 10))
  for (const [fi, f] of frames.entries()) {
    const delay = delayOf(fi)
    const ind = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = (Math.floor(y / scale) * f.w + Math.floor(x / scale)) * 4
      ind[y * w + x] = f.px[o + 3] < 128 ? 0 : index.get(key(f.px, o))!
    }
    out.push(0x21, 0xf9, 4, (2 << 2) | (transparent ? 1 : 0)); u16(delay); out.push(0, 0)
    out.push(0x2c); u16(0); u16(0); u16(w); u16(h); out.push(0)
    out.push(minCode)
    const data = lzw(ind, minCode)
    for (let i = 0; i < data.length; i += 255) { const n = Math.min(255, data.length - i); out.push(n); for (let j = 0; j < n; j++) out.push(data[i + j]) }
    out.push(0)
  }
  out.push(0x3b)
  return new Uint8Array(out)
}
