// Formatos de saída: .aseprite, SVG, sprite sheet + JSON, paleta .gpl e projeto Kixel (.kixel).
import type { Doc, Frame } from './doc'
import { tr } from './i18n'

const enc = new TextEncoder()

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate')) // formato zlib, o que o Aseprite espera
  return new Uint8Array(await new Response(s).arrayBuffer())
}

class W {
  buf = new Uint8Array(1024); n = 0; dv = new DataView(this.buf.buffer)
  private need(k: number) { if (this.n + k > this.buf.length) { const b = new Uint8Array(Math.max(this.buf.length * 2, this.n + k)); b.set(this.buf); this.buf = b; this.dv = new DataView(b.buffer) } }
  u8(v: number) { this.need(1); this.buf[this.n++] = v }
  u16(v: number) { this.need(2); this.dv.setUint16(this.n, v, true); this.n += 2 }
  i16(v: number) { this.need(2); this.dv.setInt16(this.n, v, true); this.n += 2 }
  u32(v: number) { this.need(4); this.dv.setUint32(this.n, v, true); this.n += 4 }
  bytes(b: Uint8Array) { this.need(b.length); this.buf.set(b, this.n); this.n += b.length }
  zero(k: number) { this.need(k); this.n += k }
  str(s: string) { const b = enc.encode(s); this.u16(b.length); this.bytes(b) }
  patch32(at: number, v: number) { this.dv.setUint32(at, v, true) }
  out() { return this.buf.slice(0, this.n) }
}

type L = { name: string; vis: boolean; px: Uint8Array; op?: number; blend?: string }
const ASE_BLEND: Record<string, number> = { normal: 0, multiply: 1, screen: 2, overlay: 3, add: 16 }
const layersOf = (f: Frame): L[] => (f.layers ? f.layers.map(l => ({ name: l.name, vis: l.vis, px: l.px, op: l.op, blend: l.blend })) : [{ name: tr('Camada') + ' 1', vis: true, px: f.px }])

/** Gera um arquivo .aseprite (v1.3, RGBA). Com `animation`, cada quadro vira um frame de tempo (todos com o mesmo tamanho). */
export async function buildAseprite(frames: Frame[], animation: boolean, durationMs: number | number[] = 100): Promise<Blob> {
  const dur = (i: number) => Math.round(Array.isArray(durationMs) ? (durationMs[i] ?? 100) : durationMs)
  const first = frames[0], w = first.w, h = first.h
  const sets: L[][] = animation ? frames.map(f => [{ name: tr('Camada') + ' 1', vis: true, px: f.px }]) : [layersOf(first)]
  const w0 = new W()
  w0.u32(0); w0.u16(0xa5e0); w0.u16(sets.length); w0.u16(w); w0.u16(h); w0.u16(32); w0.u32(1); w0.u16(dur(0))
  w0.u32(0); w0.u32(0); w0.u8(0); w0.zero(3); w0.u16(0); w0.u8(1); w0.u8(1); w0.i16(0); w0.i16(0); w0.u16(0); w0.u16(0); w0.zero(84)
  for (let fi = 0; fi < sets.length; fi++) {
    const layers = sets[fi], chunks: { type: number; data: Uint8Array }[] = []
    if (fi === 0) for (const l of layers) {
      const c = new W(); c.u16(l.vis ? 3 : 2); c.u16(0); c.u16(0); c.u16(0); c.u16(0); c.u16(ASE_BLEND[l.blend ?? 'normal'] ?? 0); c.u8(Math.round((l.op ?? 1) * 255)); c.zero(3); c.str(l.name)
      chunks.push({ type: 0x2004, data: c.out() })
    }
    for (let li = 0; li < layers.length; li++) {
      const c = new W(); c.u16(li); c.i16(0); c.i16(0); c.u8(255); c.u16(2); c.i16(0); c.zero(5); c.u16(w); c.u16(h); c.bytes(await deflate(layers[li].px))
      chunks.push({ type: 0x2005, data: c.out() })
    }
    const start = w0.n
    w0.u32(0); w0.u16(0xf1fa); w0.u16(chunks.length); w0.u16(dur(fi)); w0.zero(2); w0.u32(chunks.length)
    for (const ch of chunks) { w0.u32(ch.data.length + 6); w0.u16(ch.type); w0.bytes(ch.data) }
    w0.patch32(start, w0.n - start)
  }
  w0.patch32(0, w0.n)
  return new Blob([w0.out() as BlobPart], { type: 'application/octet-stream' })
}

/** SVG com um retângulo por trecho horizontal de pixels da mesma cor. */
export function buildSvg(f: Frame, scale: number, withBg: boolean): string {
  const { w, h, px } = f, hex = (o: number) => '#' + [px[o], px[o + 1], px[o + 2]].map(v => v.toString(16).padStart(2, '0')).join('')
  const out: string[] = []
  if (withBg && f.bg) out.push(`<rect width="${w}" height="${h}" fill="${f.bg}"/>`)
  for (let y = 0; y < h; y++) {
    let x = 0
    while (x < w) {
      const o = (y * w + x) * 4
      if (px[o + 3] === 0) { x++; continue }
      const col = hex(o), a = px[o + 3]; let x2 = x + 1
      while (x2 < w) { const o2 = (y * w + x2) * 4; if (px[o2 + 3] !== a || hex(o2) !== col) break; x2++ }
      out.push(`<rect x="${x}" y="${y}" width="${x2 - x}" height="1" fill="${col}"${a < 255 ? ` fill-opacity="${(a / 255).toFixed(3)}"` : ''}/>`)
      x = x2
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w * scale}" height="${h * scale}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">\n${out.join('\n')}\n</svg>\n`
}

/** Junta os quadros numa imagem só (linhas de altura variável) e devolve também o JSON no formato do Aseprite. */
export function buildSheet(frames: Frame[], names: string[], imageName: string, withBg: boolean) {
  const total = frames.reduce((a, f) => a + f.w * f.h, 0), maxW = Math.max(...frames.map(f => f.w))
  const rowW = Math.max(maxW, Math.ceil(Math.sqrt(total) * 1.2))
  const pos: { x: number; y: number }[] = []
  let x = 0, y = 0, rowH = 0, sheetW = 0
  for (const f of frames) {
    if (x > 0 && x + f.w > rowW) { x = 0; y += rowH; rowH = 0 }
    pos.push({ x, y }); x += f.w; rowH = Math.max(rowH, f.h); sheetW = Math.max(sheetW, x)
  }
  const sheetH = y + rowH, c = document.createElement('canvas'); c.width = sheetW; c.height = sheetH
  const g = c.getContext('2d')!
  const json: any = { frames: {}, meta: { app: 'Kixel', version: '0.1', image: imageName, format: 'RGBA8888', size: { w: sheetW, h: sheetH }, scale: '1' } }
  frames.forEach((f, i) => {
    const t = document.createElement('canvas'); t.width = f.w; t.height = f.h
    const tg = t.getContext('2d')!
    if (withBg && f.bg) { tg.fillStyle = f.bg; tg.fillRect(0, 0, f.w, f.h) }
    const id = new ImageData(f.w, f.h); id.data.set(f.px); const t2 = document.createElement('canvas'); t2.width = f.w; t2.height = f.h; t2.getContext('2d')!.putImageData(id, 0, 0)
    tg.drawImage(t2, 0, 0); g.drawImage(t, pos[i].x, pos[i].y)
    json.frames[names[i]] = { frame: { x: pos[i].x, y: pos[i].y, w: f.w, h: f.h }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: f.w, h: f.h }, sourceSize: { w: f.w, h: f.h }, duration: 100 }
  })
  return { canvas: c, json: JSON.stringify(json, null, 2) }
}

/** Paleta no formato GIMP (.gpl), aceito por Aseprite, GIMP, Krita e outros. */
export function buildGpl(name: string, colors: string[]): string {
  const lines = colors.map((h, i) => `${parseInt(h.slice(1, 3), 16).toString().padStart(3)} ${parseInt(h.slice(3, 5), 16).toString().padStart(3)} ${parseInt(h.slice(5, 7), 16).toString().padStart(3)}\t${h.toUpperCase()}`)
  void lines.length
  return `GIMP Palette\nName: ${name}\nColumns: 8\n#\n${lines.join('\n')}\n`
}

// ------------------------------------------------------------------ projeto (.kixel)
export const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s) }
const unb64 = (s: string) => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u }
const gz = async (data: Uint8Array, mode: 'gzip') => new Uint8Array(await new Response(new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream(mode))).arrayBuffer())
const ungz = async (data: Uint8Array) => new Uint8Array(await new Response(new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer())

export async function serializeProject(doc: Doc, extra: Record<string, unknown>): Promise<Blob> {
  const data = {
    kixel: 1, ...extra, nextId: doc.nextId, nextLayer: doc.nextLayer, zorder: doc.zorder,
    frames: [...doc.frames.values()].map(f => ({ id: f.id, x: f.x, y: f.y, w: f.w, h: f.h, name: f.name, dur: f.dur, bg: f.bg, palId: f.palId, parent: f.parent, hidden: f.hidden, trace: f.trace, activeLayer: f.activeLayer, px: b64(f.px), layers: f.layers?.map(l => ({ id: l.id, name: l.name, vis: l.vis, op: l.op, blend: l.blend, lock: l.lock, px: b64(l.px) })) })),
    conts: [...doc.conts.values()], notes: doc.notes,
    refs: doc.refs.map(r => ({ id: r.id, name: r.name, x: r.x, y: r.y, w: r.w, h: r.h, opacity: r.opacity, locked: r.locked, above: r.above, hidden: r.hidden, parent: r.parent, image: r.src.toDataURL('image/png') }))
  }
  return new Blob([await gz(enc.encode(JSON.stringify(data)), 'gzip') as BlobPart], { type: 'application/octet-stream' })
}

export type ProjectData = { kixel: number; nextId: number; nextLayer: number; zorder: string[]; frames: any[]; conts: any[]; refs: any[]; notes?: any[]; [k: string]: any }
export async function parseProject(blob: Blob): Promise<ProjectData> {
  const raw = new Uint8Array(await blob.arrayBuffer())
  const text = raw[0] === 0x1f && raw[1] === 0x8b ? new TextDecoder().decode(await ungz(raw)) : new TextDecoder().decode(raw)
  const d = JSON.parse(text)
  if (d?.kixel !== 1) throw new Error('Arquivo não é um projeto do Kixel.')
  return d
}
export { unb64 }

// ------------------------------------------------------------------ importar .aseprite
export type AseLayer = { name: string; vis: boolean; op: number; px: Uint8Array; blend?: string }
export type AseFrame = { dur: number; layers: AseLayer[] }
export type AseFile = { w: number; h: number; frames: AseFrame[] }
const inflate = async (data: Uint8Array) => new Uint8Array(await new Response(new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer())

export async function parseAseprite(buf: ArrayBuffer): Promise<AseFile> {
  const dv = new DataView(buf), u8 = new Uint8Array(buf)
  if (dv.byteLength < 128 || dv.getUint16(4, true) !== 0xa5e0) throw new Error('Arquivo não é um .aseprite válido.')
  const nFrames = dv.getUint16(6, true), w = dv.getUint16(8, true), h = dv.getUint16(10, true), depth = dv.getUint16(12, true), transIdx = dv.getUint8(28)
  if (![8, 16, 32].includes(depth)) throw new Error('Formato de cor não suportado.')
  const pal: number[][] = []   // r, g, b, a
  const metas: { name: string; vis: boolean; op: number; group: boolean; blend?: string }[] = []
  const frames: AseFrame[] = []
  let pos = 128
  for (let fi = 0; fi < nFrames; fi++) {
    const fstart = pos, fsize = dv.getUint32(pos, true), magic = dv.getUint16(pos + 4, true)
    if (magic !== 0xf1fa) throw new Error('Quadro corrompido.')
    const oldN = dv.getUint16(pos + 6, true), dur = dv.getUint16(pos + 8, true), newN = dv.getUint32(pos + 12, true)
    const count = newN || oldN; pos += 16
    const cels = new Map<number, Uint8Array>()
    const mk = () => new Uint8Array(w * h * 4)
    const paint = (dst: Uint8Array, cx: number, cy: number, cw: number, ch: number, src: Uint8Array) => {
      for (let y = 0; y < ch; y++) { const ty = cy + y; if (ty < 0 || ty >= h) continue
        for (let x = 0; x < cw; x++) { const tx = cx + x; if (tx < 0 || tx >= w) continue
          const i = (y * cw + x), o = (ty * w + tx) * 4
          if (depth === 32) { dst[o] = src[i * 4]; dst[o + 1] = src[i * 4 + 1]; dst[o + 2] = src[i * 4 + 2]; dst[o + 3] = src[i * 4 + 3] }
          else if (depth === 16) { dst[o] = dst[o + 1] = dst[o + 2] = src[i * 2]; dst[o + 3] = src[i * 2 + 1] }
          else { const v = src[i]; if (v === transIdx) continue; const c = pal[v] ?? [0, 0, 0, 255]; dst[o] = c[0]; dst[o + 1] = c[1]; dst[o + 2] = c[2]; dst[o + 3] = c[3] } } }
    }
    for (let c = 0; c < count; c++) {
      const csize = dv.getUint32(pos, true), type = dv.getUint16(pos + 4, true), d = pos + 6
      if (type === 0x2004) {
        const flags = dv.getUint16(d, true), ltype = dv.getUint16(d + 2, true), op = dv.getUint8(d + 12), bm = dv.getUint16(d + 10, true), nlen = dv.getUint16(d + 16, true)
        metas.push({ name: new TextDecoder().decode(u8.subarray(d + 18, d + 18 + nlen)), vis: !!(flags & 1), op: op / 255, group: ltype === 1, blend: bm === 1 ? 'multiply' : bm === 2 ? 'screen' : bm === 3 ? 'overlay' : bm === 16 ? 'add' : undefined })
      } else if (type === 0x2019) {
        const first = dv.getUint32(d + 4, true), last = dv.getUint32(d + 8, true); let q = d + 20
        for (let i = first; i <= last; i++) { const fl = dv.getUint16(q, true); pal[i] = [dv.getUint8(q + 2), dv.getUint8(q + 3), dv.getUint8(q + 4), dv.getUint8(q + 5)]; q += 6; if (fl & 1) q += 2 + dv.getUint16(q, true) }
      } else if (type === 0x2005) {
        const li = dv.getUint16(d, true), cx = dv.getInt16(d + 2, true), cy = dv.getInt16(d + 4, true), ctype = dv.getUint16(d + 7, true), body = d + 16
        const bpp = depth / 8
        if (ctype === 0 || ctype === 2) {
          const cw = dv.getUint16(body, true), ch = dv.getUint16(body + 2, true)
          const raw = ctype === 0 ? u8.subarray(body + 4, body + 4 + cw * ch * bpp) : await inflate(u8.subarray(body + 4, pos + csize))
          const dst = cels.get(li) ?? mk(); paint(dst, cx, cy, cw, ch, raw); cels.set(li, dst)
        } else if (ctype === 1) { // célula ligada a outro frame
          const src = frames[dv.getUint16(body, true)]?.layers.find((_, k) => k === li)
          if (src) cels.set(li, src.px.slice())
        }
      }
      pos += csize
    }
    const layers: AseLayer[] = []
    metas.forEach((m, i) => { if (!m.group) layers.push({ name: m.name, vis: m.vis, op: m.op, blend: m.blend, px: cels.get(i) ?? mk() }) })
    frames.push({ dur: dur || 100, layers })
    pos = fstart + fsize
  }
  return { w, h, frames }
}

// ------------------------------------------------------------------ Godot 4: SpriteFrames (.tres) apontando para a imagem (sprite sheet)
export function buildGodotTres(png: string, regions: { x: number; y: number; w: number; h: number }[], durations: number[], fps: number, anim = 'default'): string {
  const base = 1000 / Math.max(1, fps), n = regions.length
  const subs = regions.map((r, i) => `[sub_resource type="AtlasTexture" id="AtlasTexture_${i + 1}"]\natlas = ExtResource("1_sheet")\nregion = Rect2(${r.x}, ${r.y}, ${r.w}, ${r.h})\n`).join('\n')
  const frames = regions.map((_, i) => `{\n"duration": ${+(durations[i] / base).toFixed(4)},\n"texture": SubResource("AtlasTexture_${i + 1}")\n}`).join(', ')
  return `[gd_resource type="SpriteFrames" load_steps=${n + 2} format=3]\n\n[ext_resource type="Texture2D" path="res://${png}" id="1_sheet"]\n\n${subs}\n[resource]\nanimations = [{\n"frames": [${frames}],\n"loop": true,\n"name": &"${anim}",\n"speed": ${fps.toFixed(1)}\n}]\n`
}
