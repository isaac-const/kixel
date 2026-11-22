// Modelo do documento: quadros de pixel art numa tela infinita, com camadas por quadro, contêineres e referências.
// Unidade do mundo = 1 pixel de arte. Cada quadro guarda o RGBA composto numa fatia de uma página de atlas
// (ou numa textura própria, quando passa de 64 px). Camadas só existem depois que a pessoa cria a segunda.

import { tr } from './i18n'
export const PAGE = 2048
export type Cls = 16 | 32 | 64
export const BIG = 0 as const
export const MAX_SIDE = 2048

export type Blend = 'normal' | 'multiply' | 'screen' | 'overlay' | 'add'
/** Mistura de um canal (0 a 255): b = fundo, s = camada de cima. */
function blendCh(m: Blend, b: number, s: number): number {
  switch (m) {
    case 'multiply': return (b * s) / 255
    case 'screen': return 255 - ((255 - b) * (255 - s)) / 255
    case 'overlay': return b < 128 ? (2 * b * s) / 255 : 255 - (2 * (255 - b) * (255 - s)) / 255
    case 'add': return Math.min(255, b + s)
    default: return s
  }
}
export type Layer = { id: number; name: string; vis: boolean; px: Uint8Array; op?: number; blend?: Blend; lock?: boolean }  // op: opacidade 0 a 1 (padrão 1)

export type Frame = {
  id: number; x: number; y: number; w: number; h: number
  cls: Cls | typeof BIG; page: number; slot: number
  px: Uint8Array            // composto (é o que a GPU mostra)
  trace: boolean            // fundo transparente sem xadrez (modo decalque)
  _q: number
  name?: string
  dur?: number              // duração do frame na animação (ms); sem valor = a do FPS escolhido
  bg?: string               // cor de fundo sólida; sem valor = transparente (xadrez)
  palId?: string            // paleta deste quadro
  parent?: number           // contêiner
  hidden?: boolean
  layers?: Layer[]          // de baixo para cima; sem valor = uma camada implícita (a própria px)
  activeLayer: number       // id da camada ativa (1 = a implícita)
}

export type Ref = {
  id: number; name: string
  x: number; y: number; w: number; h: number
  opacity: number
  src: HTMLCanvasElement
  nw: number; nh: number
  dirty: boolean
  pinned: boolean
  locked: boolean
  above: boolean            // desenhada por cima dos quadros
  hidden: boolean
  parent?: number
}

export type Cont = { id: number; name: string; x: number; y: number; w: number; h: number; collapsed?: boolean; anim?: boolean; fps?: number; speed?: number; paused?: boolean; order?: number[]; pmode?: 'world' }

export type Note = { id: number; text: string; x: number; y: number; w: number; h: number; color: string; size: number }  // tudo em unidades do mundo (escala com o zoom, como as imagens)

type Page = { data: Uint8Array; free: number[]; used: number }
const clsFor = (n: number): Cls | typeof BIG => (n <= 16 ? 16 : n <= 32 ? 32 : n <= 64 ? 64 : BIG)

export class Doc {
  frames = new Map<number, Frame>()
  refs: Ref[] = []
  conts = new Map<number, Cont>()
  notes: Note[] = []
  zorder: string[] = []            // 'f:ID', 'r:ID', 'c:ID', de trás para frente
  nextId = 1
  nextLayer = 2
  pages: Record<Cls, Page[]> = { 16: [], 32: [], 64: [] }
  private grid = new Map<number, Frame[]>()
  private CELL = 128
  private stamp = 1
  version = 0

  // ---------- atlas ----------
  private perPage(c: Cls) { const per = PAGE / c; return per * per }
  allocSlot(c: Cls): { page: number; slot: number } {
    const pages = this.pages[c]
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i]
      if (p.free.length) return { page: i, slot: p.free.pop()! }
      if (p.used < this.perPage(c)) return { page: i, slot: p.used++ }
    }
    pages.push({ data: new Uint8Array(this.perPage(c) * c * c * 4), free: [], used: 0 })
    const p = pages[pages.length - 1]
    return { page: pages.length - 1, slot: p.used++ }
  }
  slotRect(c: Cls | typeof BIG, slot: number) { if (c === BIG) return { sx: 0, sy: 0 }; const per = PAGE / c; return { sx: (slot % per) * c, sy: Math.floor(slot / per) * c } }
  private allocPx(w: number, h: number) {
    const cls = clsFor(Math.max(w, h))
    if (cls === BIG) return { cls, page: -1, slot: -1, px: new Uint8Array(w * h * 4) }
    const a = this.allocSlot(cls), off = a.slot * cls * cls * 4
    const px = this.pages[cls][a.page].data.subarray(off, off + w * h * 4); px.fill(0)
    return { cls, page: a.page, slot: a.slot, px }
  }

  // ---------- quadros ----------
  addFrame(x: number, y: number, w: number, h: number, id?: number): Frame {
    w = Math.max(1, Math.min(MAX_SIDE, Math.round(w))); h = Math.max(1, Math.min(MAX_SIDE, Math.round(h)))
    const a = this.allocPx(w, h)
    const f: Frame = { id: id ?? this.nextId++, x, y, w, h, cls: a.cls, page: a.page, slot: a.slot, px: a.px, trace: false, _q: 0, activeLayer: 1 }
    if (id && id >= this.nextId) this.nextId = id + 1
    this.frames.set(f.id, f); this.gridAdd(f); this.zorder.push('f:' + f.id)
    this.version++
    return f
  }
  removeFrame(f: Frame) {
    this.gridRemove(f); this.frames.delete(f.id)
    if (f.cls !== BIG) this.pages[f.cls][f.page].free.push(f.slot)
    this.dropKey('f:' + f.id); this.version++
  }
  moveFrame(f: Frame, x: number, y: number) { this.gridRemove(f); f.x = x; f.y = y; this.gridAdd(f); this.version++ }

  /** Muda posição e tamanho. Os pixels de cada camada são mantidos (ancorados no mundo). Com `bufs`, restaura os dados exatos. */
  setShape(f: Frame, nx: number, ny: number, nw: number, nh: number, bufs?: Uint8Array[]) {
    nw = Math.max(1, Math.min(MAX_SIDE, Math.round(nw))); nh = Math.max(1, Math.min(MAX_SIDE, Math.round(nh)))
    const ox = f.x, oy = f.y, ow = f.w, oh = f.h
    const olds = (f.layers ? f.layers.map(l => l.px) : [f.px]).map(b => b.slice())
    this.gridRemove(f)
    if (f.cls !== BIG) this.pages[f.cls][f.page].free.push(f.slot)
    const a = this.allocPx(nw, nh)
    f.cls = a.cls; f.page = a.page; f.slot = a.slot; f.px = a.px; f.x = nx; f.y = ny; f.w = nw; f.h = nh
    const make = (i: number) => {
      const out = new Uint8Array(nw * nh * 4)
      if (bufs) { out.set(bufs[i]); return out }
      const dx = nx - ox, dy = ny - oy, src = olds[i]
      const i0 = Math.max(0, -dx), i1 = Math.min(nw, ow - dx)
      if (i1 > i0) for (let j = 0; j < nh; j++) { const sj = j + dy; if (sj < 0 || sj >= oh) continue; out.set(src.subarray((sj * ow + i0 + dx) * 4, (sj * ow + i1 + dx) * 4), (j * nw + i0) * 4) }
      return out
    }
    if (f.layers) { f.layers.forEach((l, i) => { l.px = make(i) }); this.composite(f) } else f.px.set(make(0))
    this.gridAdd(f); this.version++
  }

  // ---------- camadas do quadro ----------
  layerBuf(f: Frame, id: number): Uint8Array | null { return f.layers ? (f.layers.find(l => l.id === id)?.px ?? null) : id === 1 ? f.px : null }
  activeBuf(f: Frame): Uint8Array { return this.layerBuf(f, f.activeLayer) ?? (f.layers ? f.layers[f.layers.length - 1].px : f.px) }
  ensureLayers(f: Frame) { if (!f.layers) { f.layers = [{ id: 1, name: tr('Camada') + ' 1', vis: true, px: f.px.slice() }]; f.activeLayer = 1 } return f.layers }
  /** Recompõe as camadas visíveis em f.px (só a região pedida). */
  composite(f: Frame, x0 = 0, y0 = 0, x1 = f.w, y1 = f.h) {
    if (!f.layers) return
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(f.w, x1); y1 = Math.min(f.h, y1)
    const L = f.layers.filter(l => l.vis), out = f.px
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const o = (y * f.w + x) * 4; let r = 0, g = 0, b = 0, a = 0
      for (const l of L) {
        const la = l.px[o + 3]; if (!la) continue
        const sa = (la / 255) * (l.op ?? 1), k = 1 - sa
        let cr = l.px[o], cg = l.px[o + 1], cb = l.px[o + 2]
        if (l.blend && l.blend !== 'normal' && a > 0) {   // mescla com o que está embaixo: a cor da fonte muda conforme o fundo, na proporção da opacidade do fundo
          const br = r / a, bg = g / a, bb = b / a
          cr = cr + (blendCh(l.blend, br, cr) - cr) * a; cg = cg + (blendCh(l.blend, bg, cg) - cg) * a; cb = cb + (blendCh(l.blend, bb, cb) - cb) * a
        }
        r = cr * sa + r * k; g = cg * sa + g * k; b = cb * sa + b * k; a = sa + a * k
      }
      if (a > 0) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); out[o + 3] = Math.round(a * 255) } else { out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0 }
    }
  }

  // ---------- ordem das camadas do documento ----------
  dropKey(k: string) { const i = this.zorder.indexOf(k); if (i >= 0) this.zorder.splice(i, 1) }
  keyOf(kind: 'f' | 'r' | 'c', id: number) { return kind + ':' + id }

  // ---------- índice espacial ----------
  private key(cx: number, cy: number) { return (cx + 32768) * 65536 + (cy + 32768) }
  private cells(f: Frame, fn: (k: number) => void) {
    const C = this.CELL
    for (let cx = Math.floor(f.x / C); cx <= Math.floor((f.x + f.w) / C); cx++)
      for (let cy = Math.floor(f.y / C); cy <= Math.floor((f.y + f.h) / C); cy++) fn(this.key(cx, cy))
  }
  private gridAdd(f: Frame) { this.cells(f, k => { let a = this.grid.get(k); if (!a) this.grid.set(k, (a = [])); a.push(f) }) }
  private gridRemove(f: Frame) {
    this.cells(f, k => { const a = this.grid.get(k); if (!a) return; const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); if (!a.length) this.grid.delete(k) })
  }
  query(minx: number, miny: number, maxx: number, maxy: number, withHidden = false): Frame[] {
    const C = this.CELL, s = ++this.stamp, out: Frame[] = []
    const cw = Math.floor(maxx / C) - Math.floor(minx / C) + 1, ch = Math.floor(maxy / C) - Math.floor(miny / C) + 1
    const test = (f: Frame) => { if (f._q !== s) { f._q = s; if ((withHidden || !f.hidden) && f.x < maxx && f.x + f.w > minx && f.y < maxy && f.y + f.h > miny) out.push(f) } }
    if (cw * ch > this.grid.size * 2) { for (const a of this.grid.values()) for (const f of a) test(f) }
    else for (let cx = Math.floor(minx / C); cx <= Math.floor(maxx / C); cx++) for (let cy = Math.floor(miny / C); cy <= Math.floor(maxy / C); cy++) { const a = this.grid.get(this.key(cx, cy)); if (a) for (const f of a) test(f) }
    return out
  }
  /** Posição do quadro na ordem de camadas (maior = mais à frente). O mapa é refeito só quando a ordem muda. */
  private zmap = new Map<number, number>(); private zmapR = new Map<number, number>(); private zv = -1; private zl = -1
  private zsync() {
    if (this.zv !== this.version || this.zl !== this.zorder.length) {
      this.zmap.clear(); this.zmapR.clear(); const z = this.zorder
      for (let i = 0; i < z.length; i++) { const c = z[i].charCodeAt(0); if (c === 102) this.zmap.set(Number(z[i].slice(2)), i); else if (c === 114) this.zmapR.set(Number(z[i].slice(2)), i) }
      this.zv = this.version; this.zl = z.length
    }
  }
  zOf(f: Frame): number { this.zsync(); return this.zmap.get(f.id) ?? -1 }
  zOfRef(r: Ref): number { this.zsync(); return r.above ? 1e9 : (this.zmapR.get(r.id) ?? -1) }
  hit(wx: number, wy: number): Frame | null {
    let best: Frame | null = null, bz = -2
    for (const f of this.query(wx, wy, wx + 0.001, wy + 0.001)) if (wx >= f.x && wx < f.x + f.w && wy >= f.y && wy < f.y + f.h) { const z = this.zOf(f); if (!best || z > bz) { best = f; bz = z } }
    return best
  }
  bounds() {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity
    for (const f of this.frames.values()) { a = Math.min(a, f.x); b = Math.min(b, f.y); c = Math.max(c, f.x + f.w); d = Math.max(d, f.y + f.h) }
    for (const r of this.refs) { a = Math.min(a, r.x); b = Math.min(b, r.y); c = Math.max(c, r.x + r.w); d = Math.max(d, r.y + r.h) }
    for (const k of this.conts.values()) { a = Math.min(a, k.x); b = Math.min(b, k.y); c = Math.max(c, k.x + k.w); d = Math.max(d, k.y + k.h) }
    return isFinite(a) ? { x: a, y: b, w: c - a, h: d - b } : null
  }

  // ---------- referências ----------
  addRef(src: HTMLCanvasElement, name: string, x: number, y: number, w: number, h: number): Ref {
    const r: Ref = { id: this.nextId++, name, x, y, w, h, opacity: 1, src, nw: src.width, nh: src.height, dirty: true, pinned: false, locked: false, above: false, hidden: false }
    this.refs.push(r); this.zorder.unshift('r:' + r.id); this.version++   // entra atrás dos quadros; dá para reordenar
    return r
  }
  insertRef(r: Ref, z?: number) { r.dirty = true; this.refs.push(r); this.dropKey('r:' + r.id); if (z == null || z > this.zorder.length) this.zorder.push('r:' + r.id); else this.zorder.splice(z, 0, 'r:' + r.id); this.version++ }
  removeRef(r: Ref) { this.refs = this.refs.filter(q => q !== r); this.dropKey('r:' + r.id); this.version++ }
  hitRef(wx: number, wy: number): Ref | null {
    for (let i = this.refs.length - 1; i >= 0; i--) { const r = this.refs[i]; if (!r.hidden && wx >= r.x && wx < r.x + r.w && wy >= r.y && wy < r.y + r.h) return r }
    return null
  }

  // ---------- notas (texto solto na tela) ----------
  addNote(x: number, y: number, text = '', color = '#ffd479', id?: number, w = 24, h = 14, size = 1.2): Note {
    const n: Note = { id: id ?? this.nextId++, text, x, y, w, h, color, size }
    if (id && id >= this.nextId) this.nextId = id + 1
    this.notes.push(n); this.dropKey('n:' + n.id); this.zorder.push('n:' + n.id); this.version++
    return n
  }
  insertNote(n: Note, z?: number) { this.notes.push(n); this.dropKey('n:' + n.id); if (z == null || z < 0 || z > this.zorder.length) this.zorder.push('n:' + n.id); else this.zorder.splice(z, 0, 'n:' + n.id); this.version++ }
  removeNote(n: Note) { this.notes = this.notes.filter(q => q !== n); this.dropKey('n:' + n.id); this.version++ }

  // ---------- contêineres ----------
  addCont(x: number, y: number, w: number, h: number, name?: string, id?: number): Cont {
    const c: Cont = { id: id ?? this.nextId++, name: name ?? '', x, y, w, h }
    if (id && id >= this.nextId) this.nextId = id + 1
    this.conts.set(c.id, c); this.dropKey('c:' + c.id); this.zorder.push('c:' + c.id); this.version++
    return c
  }
  removeCont(c: Cont) { this.conts.delete(c.id); this.dropKey('c:' + c.id); this.version++ }
  members(cid: number): { frames: Frame[]; refs: Ref[] } {
    const frames: Frame[] = [], refs: Ref[] = []
    for (const f of this.frames.values()) if (f.parent === cid) frames.push(f)
    for (const r of this.refs) if (r.parent === cid) refs.push(r)
    return { frames, refs }
  }
  /** Contêiner mais interno que contém o ponto (para adotar quadros soltos dentro dele). */
  contAt(wx: number, wy: number): Cont | null {
    let best: Cont | null = null
    for (const c of this.conts.values()) if (wx >= c.x && wx <= c.x + c.w && wy >= c.y && wy <= c.y + c.h && (!best || c.w * c.h < best.w * best.h)) best = c
    return best
  }

  // ---------- histórico (desfazer) ----------
  private undoStack: Cmd[] = []
  private redoStack: Cmd[] = []
  push(c: Cmd) { this.undoStack.push(c); if (this.undoStack.length > 500) this.undoStack.shift(); this.redoStack.length = 0 }
  undo(): boolean { const c = this.undoStack.pop(); if (!c) return false; c.undo(); this.redoStack.push(c); this.version++; return true }
  redo(): boolean { const c = this.redoStack.pop(); if (!c) return false; c.redo(); this.undoStack.push(c); this.version++; return true }
  clearHistory() { this.undoStack.length = 0; this.redoStack.length = 0 }
  get historySize() { return this.undoStack.length }
  clearFrames() {
    for (const f of [...this.frames.values()]) this.removeFrame(f)
    this.clearHistory()
  }
}

export type Cmd = { undo(): void; redo(): void }

/** Região retangular de pixels de um buffer (largura do buffer = bw). */
export type Patch = { x: number; y: number; w: number; h: number; data: Uint8Array }
export function readPatch(buf: Uint8Array, bw: number, x: number, y: number, w: number, h: number): Patch {
  const data = new Uint8Array(w * h * 4)
  for (let j = 0; j < h; j++) data.set(buf.subarray(((y + j) * bw + x) * 4, ((y + j) * bw + x + w) * 4), j * w * 4)
  return { x, y, w, h, data }
}
export function writePatch(buf: Uint8Array, bw: number, p: Patch) {
  for (let j = 0; j < p.h; j++) buf.set(p.data.subarray(j * p.w * 4, (j + 1) * p.w * 4), ((p.y + j) * bw + p.x) * 4)
}
