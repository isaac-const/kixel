import { Doc, readPatch, writePatch, type Frame, type Ref, type Cont, type Note, type Patch, type Cmd, type Layer } from './doc'
import { Renderer, type Cam } from './gl'
import { PALETTES } from './data'
import { initUI, type MenuItem } from './ui'
import { encodeGif } from './gif'
import { initHome } from './home'
import { initPlayers } from './player'
import * as W from './workspaces'
import * as shp from './shapes'
import { buildAseprite, buildSvg, buildSheet, buildGpl, buildGodotTres, serializeProject, parseProject, parseAseprite, unb64 } from './exporters'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const doc = new Doc()
const glc = $<HTMLCanvasElement>('gl'), ov = $<HTMLCanvasElement>('ov'), octx = ov.getContext('2d')!
let R: Renderer
try { R = new Renderer(glc) } catch (e) { document.body.innerHTML = `<p style="padding:24px;color:#fff;font:16px system-ui">Este navegador não tem WebGL2: ${(e as Error).message}</p>`; throw e }

// ================================================================ estado
const PALETTE = ['#1a1c2c', '#5d275d', '#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#257179', '#29366f', '#3b5dc9', '#41a6f6', '#73eff7', '#f4f4f4', '#94b0c2', '#566c86', '#333c57']
const hex2rgba = (h: string): number[] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255]
const hexOf = (c: number[]) => '#' + c.slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join('')
const store = { get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* sem armazenamento */ } } }
const S = {
  color: hex2rgba(PALETTE[3]), tool: 'pencil', brush: 1,
  sel: null as Frame | null, selRef: null as Ref | null, selCont: null as Cont | null, selNote: null as Note | null,
  lastSel: null as Frame | null, hover: null as { wx: number; wy: number } | null, spaceDown: false,
  opacity: 100, opt: { mirror: false, pp: true, snap: true, fill: false, onion: false }, defaultPal: store.get('kixel-pal') || 'sweetie',
  mine: (() => { try { const v = JSON.parse(store.get('kixel-mine') || 'null'); return Array.isArray(v) ? v as string[] : PALETTE.slice(0, 8) } catch { return PALETTE.slice(0, 8) } })()
}
const selSet = new Set<Frame>()
let cam: Cam = { x: 0, y: 0, zoom: 12 }
let cssW = 1, cssH = 1

function syncSel() {
  for (const f of [...selSet]) if (doc.frames.get(f.id) !== f) selSet.delete(f)
  if (S.sel && doc.frames.get(S.sel.id) !== S.sel) S.sel = null
  if (!S.sel && selSet.size) S.sel = [...selSet].pop()!
  if (S.sel && !selSet.has(S.sel)) { selSet.clear(); selSet.add(S.sel) }
  if (S.selRef && !doc.refs.includes(S.selRef)) S.selRef = null
  if (S.selCont && doc.conts.get(S.selCont.id) !== S.selCont) S.selCont = null
  if (S.selNote && !doc.notes.includes(S.selNote)) S.selNote = null
  if (S.sel) S.lastSel = S.sel
}
const selFrames = (): Frame[] => { syncSel(); return [...selSet] }
function selectFrame(f: Frame, add = false) {
  syncSel()
  if (add) { if (selSet.has(f)) { selSet.delete(f); S.sel = [...selSet].pop() ?? null } else { selSet.add(f); S.sel = f } }
  else { selSet.clear(); selSet.add(f); S.sel = f }
  S.selRef = null; S.selCont = null; S.selNote = null; if (S.sel) S.lastSel = S.sel
  invalidate()
}
function selectFrames(list: Frame[]) { selSet.clear(); for (const f of list) selSet.add(f); S.sel = list[list.length - 1] ?? null; S.selRef = null; S.selCont = null; S.selNote = null; if (S.sel) S.lastSel = S.sel; invalidate() }
function selectRef(r: Ref) { selSet.clear(); S.sel = null; S.selCont = null; S.selNote = null; S.selRef = r; invalidate() }
function selectNote(n: Note) { selSet.clear(); S.sel = null; S.selCont = null; S.selRef = null; S.selNote = n; invalidate() }
function selectCont(c: Cont) { selSet.clear(); S.sel = null; S.selRef = null; S.selNote = null; S.selCont = c; invalidate() }
function clearSel() { selSet.clear(); S.sel = null; S.selRef = null; S.selCont = null; S.selNote = null; invalidate() }

// ================================================================ laço de desenho
let dirty = true, continuous = false
const invalidate = () => { dirty = true }
const touch = () => { doc.version++; dirty = true }
const renderTimes: number[] = []
let cpuMs = 0, lastT = 0, lastPanels = 0
let anim: { from: Cam; to: Cam; t0: number; ms: number } | null = null
const benchDt: number[] = [], benchCost: number[] = []
let benchOn = false

function tick(t: number) {
  requestAnimationFrame(tick)
  players.sync(t)   // os players de animação rodam por conta própria, mesmo com a tela parada
  if (anim) {
    const k = Math.min(1, (t - anim.t0) / anim.ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
    cam.x = anim.from.x + (anim.to.x - anim.from.x) * e; cam.y = anim.from.y + (anim.to.y - anim.from.y) * e
    cam.zoom = Math.exp(Math.log(anim.from.zoom) + (Math.log(anim.to.zoom) - Math.log(anim.from.zoom)) * e)
    if (k >= 1) anim = null
    dirty = true
  }
  if (t - lastPanels > 120) { lastPanels = t; ui.panels() }
  if (!dirty && !continuous) return
  dirty = false
  if (benchOn && lastT) benchDt.push(t - lastT)
  lastT = t
  const t0 = performance.now()
  R.render(doc, cam)
  drawOverlay()
  if (benchOn) { R.sync(); benchCost.push(performance.now() - t0) }
  cpuMs = cpuMs * 0.9 + (performance.now() - t0) * 0.1
  renderTimes.push(t)
  while (renderTimes.length && t - renderTimes[0] > 1000) renderTimes.shift()
}
function resize() {
  const st = $('stage'); cssW = Math.max(1, st.clientWidth); cssH = Math.max(1, st.clientHeight)
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  R.resize(cssW, cssH, dpr)
  ov.width = Math.round(cssW * dpr); ov.height = Math.round(cssH * dpr)
  glc.style.width = ov.style.width = cssW + 'px'; glc.style.height = ov.style.height = cssH + 'px'
  invalidate()
}
window.addEventListener('resize', resize)
new ResizeObserver(() => resize()).observe($('stage'))

const w2s = (wx: number, wy: number) => ({ x: (wx - cam.x) * cam.zoom + cssW / 2, y: (wy - cam.y) * cam.zoom + cssH / 2 })
const s2w = (sx: number, sy: number) => ({ x: (sx - cssW / 2) / cam.zoom + cam.x, y: (sy - cssH / 2) / cam.zoom + cam.y })
const LEVELS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128]
const clampZoom = (z: number) => Math.min(128, Math.max(0.004, z))
function zoomAt(sx: number, sy: number, nz: number) {
  anim = null; const w = s2w(sx, sy); cam.zoom = clampZoom(nz)
  cam.x = w.x - (sx - cssW / 2) / cam.zoom; cam.y = w.y - (sy - cssH / 2) / cam.zoom; invalidate()
}
function stepZoom(sx: number, sy: number, dir: 1 | -1) {
  let nz: number
  if (!S.opt.snap) nz = cam.zoom * (dir > 0 ? 1.25 : 0.8)
  else if (dir > 0) nz = cam.zoom < 1 ? Math.min(1, cam.zoom * 1.25) : (LEVELS.find(l => l > cam.zoom + 0.01) ?? 128)
  else nz = cam.zoom <= 1 ? cam.zoom * 0.8 : ([...LEVELS].reverse().find(l => l < cam.zoom - 0.01) ?? 1)
  zoomAt(sx, sy, nz)
}
const snapZoom = () => { if (S.opt.snap && cam.zoom >= 1) zoomAt(cssW / 2, cssH / 2, Math.max(1, Math.round(cam.zoom))) }
function flyTo(x: number, y: number, zoom: number, ms = 350) { anim = { from: { ...cam }, to: { x, y, zoom: clampZoom(zoom) }, t0: performance.now(), ms } }
function fitRect(b: { x: number; y: number; w: number; h: number }, pad = 0.9, animate = true) {
  const z = Math.min(cssW / b.w, cssH / b.h) * pad
  const nz = S.opt.snap && z >= 1 ? Math.max(1, Math.floor(z)) : z
  if (animate) flyTo(b.x + b.w / 2, b.y + b.h / 2, nz); else { anim = null; cam = { x: b.x + b.w / 2, y: b.y + b.h / 2, zoom: clampZoom(nz) }; invalidate() }
}
const fitAll = (animate = true) => { const b = doc.bounds(); if (b) fitRect(boundsOf([b, ...doc.conts.values()]), 0.85, animate) }
const focusFrame = (f: { x: number; y: number; w: number; h: number }) => flyTo(f.x + f.w / 2, f.y + f.h / 2, Math.max(8, (Math.min(cssW, cssH) * 0.7) / Math.max(f.w, f.h)))

// ================================================================ histórico por "fotos" das propriedades
const FK = ['x', 'y', 'name', 'bg', 'palId', 'parent', 'hidden', 'trace', 'activeLayer', 'dur'] as const
const RK = ['x', 'y', 'w', 'h', 'opacity', 'locked', 'above', 'hidden', 'name', 'parent'] as const
const CK = ['x', 'y', 'w', 'h', 'name', 'collapsed', 'anim', 'order', 'pmode'] as const
const NK = ['x', 'y', 'w', 'h', 'text', 'color', 'size'] as const
type Snap = { f: Map<number, any>; r: Map<number, any>; c: Map<number, any>; n: Map<number, any>; z?: string[] }
const pickKeys = (o: any, keys: readonly string[]) => { const out: any = {}; for (const k of keys) out[k] = o[k]; return out }
function snap(fr: Frame[], rf: Ref[], cs: Cont[], z = false, ns: Note[] = []): Snap {
  const s: Snap = { f: new Map(), r: new Map(), c: new Map(), n: new Map() }
  for (const n of ns) s.n.set(n.id, pickKeys(n, NK))
  for (const f of fr) s.f.set(f.id, pickKeys(f, FK)); for (const r of rf) s.r.set(r.id, pickKeys(r, RK)); for (const c of cs) s.c.set(c.id, pickKeys(c, CK))
  if (z) s.z = [...doc.zorder]
  return s
}
function applySnap(s: Snap) {
  for (const [id, st] of s.f) { const f = doc.frames.get(id); if (!f) continue; const mv = st.x !== f.x || st.y !== f.y; for (const k of FK) if (k !== 'x' && k !== 'y') (f as any)[k] = st[k]; if (mv) doc.moveFrame(f, st.x, st.y) }
  for (const [id, st] of s.r) { const r = doc.refs.find(q => q.id === id); if (r) Object.assign(r, st) }
  for (const [id, st] of s.c) { const c = doc.conts.get(id); if (c) Object.assign(c, st) }
  for (const [id, st] of s.n) { const n = doc.notes.find(q => q.id === id); if (n) Object.assign(n, st) }
  if (s.z) doc.zorder = [...s.z]
  touch()
}
function commitSnap(before: Snap, after: Snap) { doc.push({ undo: () => applySnap(before), redo: () => applySnap(after) }) }
/** Roda uma mudança e registra no histórico, fotografando antes e depois. */
function change(fr: Frame[], rf: Ref[], cs: Cont[], fn: () => void, z = false, ns: Note[] = []) { const before = snap(fr, rf, cs, z, ns); fn(); commitSnap(before, snap(fr, rf, cs, z, ns)); touch() }

// ================================================================ edição de pixels (na camada ativa)
type Stroke = { f: Frame; lid: number; buf: Uint8Array; before: Uint8Array; minx: number; miny: number; maxx: number; maxy: number; last: { x: number; y: number } | null; path: { x: number; y: number }[]; erase: boolean }
let stroke: Stroke | null = null
function setPx(s: Stroke, x: number, y: number, c: number[]) {
  const f = s.f
  if (x < 0 || y < 0 || x >= f.w || y >= f.h) return
  const o = (y * f.w + x) * 4, op = S.opacity / 100
  if (op >= 1 && !s.erase) { s.buf[o] = c[0]; s.buf[o + 1] = c[1]; s.buf[o + 2] = c[2]; s.buf[o + 3] = c[3] }
  else if (s.erase) {   // borracha com opacidade: tira só uma parte da opacidade do que já existe
    const a = Math.round(s.before[o + 3] * (1 - op))
    if (a <= 0) { s.buf[o] = s.buf[o + 1] = s.buf[o + 2] = s.buf[o + 3] = 0 } else { s.buf[o] = s.before[o]; s.buf[o + 1] = s.before[o + 1]; s.buf[o + 2] = s.before[o + 2]; s.buf[o + 3] = a }
  } else {   // lápis com opacidade: mistura a cor com o que já estava (sempre a partir do original, então passar duas vezes no mesmo pixel não acumula)
    const sa = (c[3] / 255) * op, da = s.before[o + 3] / 255, oa = sa + da * (1 - sa)
    for (let q = 0; q < 3; q++) s.buf[o + q] = Math.round((c[q] * sa + s.before[o + q] * da * (1 - sa)) / oa)
    s.buf[o + 3] = Math.round(oa * 255)
  }
  if (x < s.minx) s.minx = x; if (y < s.miny) s.miny = y; if (x > s.maxx) s.maxx = x; if (y > s.maxy) s.maxy = y
}
function stamp(s: Stroke, x: number, y: number) {
  const c = s.erase ? [0, 0, 0, 0] : S.color, half = Math.floor((S.brush - 1) / 2)
  for (let j = 0; j < S.brush; j++) for (let i = 0; i < S.brush; i++) {
    const px = x - half + i, py = y - half + j
    setPx(s, px, py, c); if (S.opt.mirror) setPx(s, s.f.w - 1 - px, py, c)
  }
}
function restorePx(s: Stroke, x: number, y: number) {
  const f = s.f, put = (px: number, py: number) => { if (px < 0 || py < 0 || px >= f.w || py >= f.h) return; const o = (py * f.w + px) * 4; s.buf.set(s.before.subarray(o, o + 4), o) }
  put(x, y); if (S.opt.mirror) put(f.w - 1 - x, y)
}
function bresenham(x0: number, y0: number, x1: number, y1: number, cb: (x: number, y: number) => void) {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
  let err = dx + dy, x = x0, y = y0
  for (;;) { cb(x, y); if (x === x1 && y === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x += sx } if (e2 <= dx) { err += dx; y += sy } }
}
function edited(s: Stroke) { if (s.maxx < 0) return; doc.composite(s.f, s.minx, s.miny, s.maxx + 1, s.maxy + 1); R.upload(doc, s.f); invalidate() }
function strokeTo(s: Stroke, x: number, y: number) {
  const from = s.last ?? { x, y }
  bresenham(from.x, from.y, x, y, (px, py) => {
    const L = s.path[s.path.length - 1]
    if (L && L.x === px && L.y === py) return
    stamp(s, px, py); s.path.push({ x: px, y: py })
    if (S.opt.pp && S.brush === 1 && !s.erase && s.path.length >= 3) { // tira os "cantos em L" para um traço mais limpo
      const n = s.path.length, a = s.path[n - 3], b = s.path[n - 2], c = s.path[n - 1]
      if (Math.abs(a.x - c.x) === 1 && Math.abs(a.y - c.y) === 1 && ((b.x === a.x && b.y === c.y) || (b.y === a.y && b.x === c.x))) { restorePx(s, b.x, b.y); s.path.splice(n - 2, 1) }
    }
  })
  s.last = { x, y }
  edited(s)
}
const activeLayerVisible = (f: Frame) => !f.layers || !!f.layers.find(l => l.id === f.activeLayer)?.vis
function newStroke(f: Frame, erase: boolean): Stroke | null {
  if (!activeLayerVisible(f)) { toast('A camada ativa está oculta. Mostre-a (ícone do olho) para desenhar.'); return null }
  const buf = doc.activeBuf(f)
  return { f, lid: f.layers ? f.activeLayer : 1, buf, before: buf.slice(), minx: 1e9, miny: 1e9, maxx: -1, maxy: -1, last: null, path: [], erase }
}
function beginStroke(f: Frame, x: number, y: number, erase: boolean) {
  stroke = newStroke(f, erase)
  if (!stroke) { mode = 'ignore'; return }
  strokeTo(stroke, x, y)
}
function patchCmd(fid: number, lid: number, before: Patch, after: Patch): Cmd {
  const apply = (p: Patch) => { const f = doc.frames.get(fid); if (!f) return; const buf = doc.layerBuf(f, lid); if (!buf) return; writePatch(buf, f.w, p); doc.composite(f, p.x, p.y, p.x + p.w, p.y + p.h); R.upload(doc, f); invalidate() }
  return { undo: () => apply(before), redo: () => apply(after) }
}
function commitStroke() {
  const s = stroke; stroke = null
  if (!s || s.maxx < 0) return
  const w = s.maxx - s.minx + 1, h = s.maxy - s.miny + 1
  doc.push(patchCmd(s.f.id, s.lid, readPatch(s.before, s.f.w, s.minx, s.miny, w, h), readPatch(s.buf, s.f.w, s.minx, s.miny, w, h)))
}
function floodFill(f: Frame, x: number, y: number) {
  const s = newStroke(f, false); if (!s) return
  const buf = s.buf, o0 = (y * f.w + x) * 4, t = [buf[o0], buf[o0 + 1], buf[o0 + 2], buf[o0 + 3]], c = S.color
  if (t[0] === c[0] && t[1] === c[1] && t[2] === c[2] && t[3] === 255) return
  const same = (i: number) => buf[i] === t[0] && buf[i + 1] === t[1] && buf[i + 2] === t[2] && buf[i + 3] === t[3]
  const st = [x, y]
  while (st.length) {
    const cy = st.pop()!, cx = st.pop()!
    if (cx < 0 || cy < 0 || cx >= f.w || cy >= f.h || !same((cy * f.w + cx) * 4)) continue
    setPx(s, cx, cy, c); st.push(cx + 1, cy, cx - 1, cy, cx, cy + 1, cx, cy - 1)
  }
  stroke = s; commitStroke(); edited(s)
}
const pick = (f: Frame, x: number, y: number) => { const o = (y * f.w + x) * 4; if (f.px[o + 3] > 0) setColor([f.px[o], f.px[o + 1], f.px[o + 2], 255]) }
function pickRef(r: Ref, wx: number, wy: number) {
  const u = Math.floor(((wx - r.x) / r.w) * r.nw), v = Math.floor(((wy - r.y) / r.h) * r.nh)
  if (u < 0 || v < 0 || u >= r.nw || v >= r.nh) return
  const d = r.src.getContext('2d')!.getImageData(u, v, 1, 1).data
  setColor([d[0], d[1], d[2], 255])
}

// ================================================================ quadros: criar, apagar, duplicar, redimensionar
const fname = (f: Frame) => f.name || 'Quadro ' + f.id
const cname = (c: Cont) => c.name || 'Contêiner ' + c.id
/** Menor número livre: se o Quadro 1 for apagado, o próximo quadro novo volta a ser Quadro 1. */
const freeName = (base: string, used: Set<string>) => { let n = 1; while (used.has(`${base} ${n}`)) n++; return `${base} ${n}` }
const nextFrameName = () => freeName('Quadro', new Set([...doc.frames.values()].map(fname)))
const nextContName = () => freeName('Contêiner', new Set([...doc.conts.values()].map(cname)))
type FrameRec = { dur?: number; id: number; x: number; y: number; w: number; h: number; name?: string; bg?: string; palId?: string; parent?: number; hidden?: boolean; trace: boolean; activeLayer: number; px: Uint8Array; layers?: Layer[]; z: number }
const frameRec = (f: Frame): FrameRec => ({ dur: f.dur, id: f.id, x: f.x, y: f.y, w: f.w, h: f.h, name: f.name, bg: f.bg, palId: f.palId, parent: f.parent, hidden: f.hidden, trace: f.trace, activeLayer: f.activeLayer, px: f.px.slice(), layers: f.layers?.map(l => ({ ...l, px: l.px.slice() })), z: doc.zorder.indexOf('f:' + f.id) })
function restoreFrame(r: FrameRec): Frame {
  const g = doc.addFrame(r.x, r.y, r.w, r.h, r.id)
  Object.assign(g, { name: r.name, dur: r.dur, bg: r.bg, palId: r.palId, parent: r.parent, hidden: r.hidden, trace: r.trace, activeLayer: r.activeLayer })
  if (r.layers) g.layers = r.layers.map(l => ({ ...l, px: l.px.slice() }))
  g.px.set(r.px)
  doc.dropKey('f:' + g.id); doc.zorder.splice(r.z < 0 ? doc.zorder.length : Math.min(r.z, doc.zorder.length), 0, 'f:' + g.id)
  R.upload(doc, g); return g
}
function killFrame(f: Frame) { doc.removeFrame(f); R.freeFrame(doc, f) }
const dropAll = (recs: FrameRec[]) => { for (let i = 0; i < recs.length; i++) { const f = doc.frames.get(recs[i].id); if (f) { recs[i] = frameRec(f); killFrame(f) } } touch() }
const bringAll = (recs: FrameRec[]) => { for (const r of recs) restoreFrame(r); touch() }
const addCmd = (recs: FrameRec[]): Cmd => ({ undo: () => dropAll(recs), redo: () => bringAll(recs) })
const delCmd = (recs: FrameRec[]): Cmd => ({ undo: () => bringAll(recs), redo: () => dropAll(recs) })
function newFrame(x: number, y: number, w: number, h: number = w, select = true, name?: string): Frame {
  const nm = name ?? nextFrameName()
  const f = doc.addFrame(Math.floor(x), Math.floor(y), w, h)
  f.palId = S.defaultPal; f.name = nm
  R.upload(doc, f)
  doc.push(addCmd([frameRec(f)]))
  if (select) selectFrame(f)
  touch(); return f
}
function deleteSelection() {
  syncSel()
  if (S.selCont && !selSet.size) { ungroup(S.selCont); return }
  if (S.selRef && !selSet.size) { removeRef(S.selRef); return }
  if (S.selNote && !selSet.size) { removeNote(S.selNote); return }
  const list = selFrames(); if (!list.length) return
  const recs = list.map(frameRec)
  for (const f of list) killFrame(f)
  doc.push(delCmd(recs)); clearSel(); touch()
}
function duplicateSelection() {
  const list = selFrames(); if (!list.length) return
  let right = -Infinity, left = Infinity; for (const f of list) { right = Math.max(right, f.x + f.w); left = Math.min(left, f.x) }
  const dx = right - left + gapFor(Math.max(...list.map(f => f.w))), out: Frame[] = [], recs: FrameRec[] = []
  for (const src of list) {
    const g = doc.addFrame(src.x + dx, src.y, src.w, src.h)
    Object.assign(g, { name: src.name ? src.name + ' cópia' : nextFrameName(), dur: src.dur, bg: src.bg, palId: src.palId, trace: src.trace, activeLayer: src.activeLayer, parent: src.parent })
    if (src.layers) g.layers = src.layers.map(l => ({ ...l, px: l.px.slice() }))
    g.px.set(src.px); R.upload(doc, g); out.push(g); recs.push(frameRec(g))
  }
  doc.push(addCmd(recs)); selectFrames(out); touch()
}
/** Muda posição e tamanho de um quadro, mantendo os pixels (de todas as camadas). */
function reshapeFrame(f: Frame, nx: number, ny: number, nw: number, nh: number) {
  nw = Math.max(1, Math.min(2048, Math.round(nw))); nh = Math.max(1, Math.min(2048, Math.round(nh)))
  if (nx === f.x && ny === f.y && nw === f.w && nh === f.h) return
  const bufs = () => (f.layers ? f.layers.map(l => l.px.slice()) : [f.px.slice()])
  const id = f.id, before = { x: f.x, y: f.y, w: f.w, h: f.h, bufs: bufs() }
  R.freeFrame(doc, f); doc.setShape(f, nx, ny, nw, nh); R.upload(doc, f)
  const after = { x: f.x, y: f.y, w: f.w, h: f.h, bufs: bufs() }
  const apply = (s: typeof before) => { const g = doc.frames.get(id); if (!g) return; R.freeFrame(doc, g); doc.setShape(g, s.x, s.y, s.w, s.h, s.bufs.map(b => b.slice())); R.upload(doc, g); invalidate() }
  doc.push({ undo: () => apply(before), redo: () => apply(after) }); touch()
}

// ---------------------------------------------------------------- camadas dentro do quadro
type LState = { arr: Layer[] | undefined; active: number }
const lstate = (f: Frame): LState => ({ arr: f.layers ? [...f.layers] : undefined, active: f.activeLayer })
function layerOp(f: Frame, fn: () => void) {
  const id = f.id, before = lstate(f)
  fn(); doc.composite(f); R.upload(doc, f)
  const after = lstate(f)
  const apply = (s: LState) => { const g = doc.frames.get(id); if (!g) return; g.layers = s.arr ? [...s.arr] : undefined; g.activeLayer = s.active; doc.composite(g); R.upload(doc, g); invalidate() }
  doc.push({ undo: () => apply(before), redo: () => apply(after) }); touch()
}
function layerAdd(f: Frame) {
  layerOp(f, () => {
    const L = doc.ensureLayers(f), i = L.findIndex(l => l.id === f.activeLayer)
    const nl: Layer = { id: doc.nextLayer++, name: 'Camada ' + (L.length + 1), vis: true, px: new Uint8Array(f.w * f.h * 4) }
    L.splice(i + 1, 0, nl); f.activeLayer = nl.id
  })
}
function layerDup(f: Frame) {
  layerOp(f, () => {
    const L = doc.ensureLayers(f), i = L.findIndex(l => l.id === f.activeLayer), src = L[i]
    const nl: Layer = { id: doc.nextLayer++, name: src.name + ' cópia', vis: true, px: src.px.slice() }
    L.splice(i + 1, 0, nl); f.activeLayer = nl.id
  })
}
function layerDel(f: Frame) {
  if (!f.layers || f.layers.length < 2) { toast('Um quadro precisa ter ao menos uma camada.'); return }
  layerOp(f, () => { const L = f.layers!, i = L.findIndex(l => l.id === f.activeLayer); L.splice(i, 1); f.activeLayer = L[Math.max(0, i - 1)].id })
}
function layerMove(f: Frame, dir: 1 | -1) {
  if (!f.layers) return
  const i = f.layers.findIndex(l => l.id === f.activeLayer), j = i + dir
  if (j < 0 || j >= f.layers.length) return
  layerOp(f, () => { const L = f.layers!;[L[i], L[j]] = [L[j], L[i]] })
}
function layerToggle(f: Frame, id: number) {
  const L = f.layers?.find(l => l.id === id); if (!L) return
  const fid = f.id, v = L.vis
  const set = (val: boolean) => { const g = doc.frames.get(fid); const l = g?.layers?.find(q => q.id === id); if (!g || !l) return; l.vis = val; doc.composite(g); R.upload(doc, g); invalidate() }
  set(!v); doc.push({ undo: () => set(v), redo: () => set(!v) }); touch()
}
function layerRename(f: Frame, id: number, name: string) {
  const L = f.layers?.find(l => l.id === id); name = name.trim(); if (!L || !name || L.name === name) return
  const fid = f.id, old = L.name
  const set = (n: string) => { const l = doc.frames.get(fid)?.layers?.find(q => q.id === id); if (l) l.name = n; touch() }
  set(name); doc.push({ undo: () => set(old), redo: () => set(name) })
}
const layerSetActive = (f: Frame, id: number) => { f.activeLayer = id; touch() }

// ================================================================ contêineres
function boundsOf(list: { x: number; y: number; w: number; h: number }[]) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity
  for (const o of list) { a = Math.min(a, o.x); b = Math.min(b, o.y); c = Math.max(c, o.x + o.w); d = Math.max(d, o.y + o.h) }
  return { x: a, y: b, w: c - a, h: d - b }
}
const center = (o: { x: number; y: number; w: number; h: number }) => ({ x: o.x + o.w / 2, y: o.y + o.h / 2 })
function createContainer(x: number, y: number, w: number, h: number, fr: Frame[], rf: Ref[], name?: string): Cont {
  const before = snap(fr, rf, [])
  const c = doc.addCont(Math.round(x), Math.round(y), Math.max(16, Math.round(w)), Math.max(16, Math.round(h)), name ?? nextContName())
  for (const f of fr) f.parent = c.id
  for (const r of rf) r.parent = c.id
  const after = snap(fr, rf, [c]), data = { ...pickKeys(c, CK), id: c.id }
  doc.push({
    undo() { applySnap(before); const k = doc.conts.get(data.id); if (k) doc.removeCont(k); touch() },
    redo() { if (!doc.conts.has(data.id)) doc.addCont(data.x, data.y, data.w, data.h, data.name, data.id); applySnap(after) }
  })
  selectCont(c); touch(); return c
}
function groupSelection(name?: string): Cont | null {
  const list = selFrames(); if (!list.length) { toast('Selecione quadros para agrupar (Shift + clique nos nomes).'); return null }
  const b = boundsOf(list), pad = contPad(list)
  const k = createContainer(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2, list, [], name)
  toast(`${list.length} quadro${list.length > 1 ? 's' : ''} em um contêiner. Arraste o contêiner para mover todos juntos.`)
  return k
}
/** Animação = contêiner com o player ligado: os quadros de dentro tocam em loop ao lado dele. */
function setAnim(k: Cont, on: boolean) { change([], [], [k], () => { k.anim = on || undefined }); toast(on ? 'Player ligado: os quadros do contêiner tocam ao lado dele.' : 'Player desligado.') }
function newAnimation() {
  if (selFrames().length) createAnimation()
  else { setTool('anim'); toast('Arraste sobre os quadros que formam a animação. Eles tocam num player ao lado.') }
}
function createAnimation() {
  if (!selFrames().length) { toast('Selecione os quadros da animação (Shift + clique nos nomes).'); return }
  const k = groupSelection(freeName('Animação', new Set([...doc.conts.values()].map(cname)))); if (k) setAnim(k, true)
}
function ungroup(c: Cont) {
  const m = doc.members(c.id), before = snap(m.frames, m.refs, [c], true), data = { ...pickKeys(c, CK), id: c.id }
  for (const f of m.frames) f.parent = undefined
  for (const r of m.refs) r.parent = undefined
  doc.removeCont(c)
  const after = snap(m.frames, m.refs, [], true)
  doc.push({
    undo() { if (!doc.conts.has(data.id)) doc.addCont(data.x, data.y, data.w, data.h, data.name, data.id); applySnap(before) },
    redo() { applySnap(after); const k = doc.conts.get(data.id); if (k) doc.removeCont(k); touch() }
  })
  clearSel(); touch(); toast('Contêiner desfeito. Os quadros continuam onde estavam.')
}
function fitContainer(c: Cont) {
  const m = doc.members(c.id), items = [...m.frames, ...m.refs]; if (!items.length) return
  const b = boundsOf(items), pad = contPad(items)
  change([], [], [c], () => { c.x = Math.round(b.x - pad); c.y = Math.round(b.y - pad); c.w = Math.round(b.w + pad * 2); c.h = Math.round(b.h + pad * 2) })
}
/** Depois de mover ou redimensionar: o quadro com o centro dentro de um contêiner passa a fazer parte dele. */
function reparent(list: Frame[]) { for (const f of list) f.parent = doc.contAt(f.x + f.w / 2, f.y + f.h / 2)?.id }
function recomputeMembers(c: Cont) {
  for (const f of doc.frames.values()) {
    const cx = f.x + f.w / 2, cy = f.y + f.h / 2, inside = cx >= c.x && cx <= c.x + c.w && cy >= c.y && cy <= c.y + c.h
    if (inside && f.parent === undefined) f.parent = c.id; else if (!inside && f.parent === c.id) f.parent = undefined
  }
}

// ================================================================ notas (texto solto)
const NOTE_COLORS = ['#ffd479', '#8ef0c8', '#ff9ec0', '#8cc8ff', '#c9a8ff', '#e4e4ea']
function createNote(wx: number, wy: number): Note {
  const w = Math.max(8, Math.round((cssW * 0.26) / cam.zoom)), h = Math.max(5, Math.round(w * 0.55)), size = Math.max(0.5, Math.round((15 / cam.zoom) * 10) / 10)
  const n = doc.addNote(Math.round(wx), Math.round(wy), '', NOTE_COLORS[doc.notes.length % NOTE_COLORS.length], undefined, w, h, size)
  doc.push({ undo: () => { doc.removeNote(n); touch() }, redo: () => { doc.insertNote(n); touch() } })
  selectNote(n); touch(); return n
}
function removeNote(n: Note) {
  const z = doc.zorder.indexOf('n:' + n.id)
  doc.removeNote(n)
  doc.push({ undo: () => { doc.insertNote(n, z); touch() }, redo: () => { doc.removeNote(n); touch() } })
  clearSel(); touch()
}
function noteHitW(wx: number, wy: number): Note | null { for (let i = doc.notes.length - 1; i >= 0; i--) { const n = doc.notes[i]; if (wx >= n.x && wx <= n.x + n.w && wy >= n.y && wy <= n.y + n.h) return n } return null }
let noteDrag: { n: Note; ox: number; oy: number; snap0: Snap; moved: boolean } | null = null

// ================================================================ referências
function addImage(canvas: HTMLCanvasElement, name: string) {
  const aspect = canvas.width / canvas.height, bb = doc.bounds()
  let h = bb ? Math.max(32, Math.min(128, Math.max(bb.w, bb.h) * 0.8)) : (cssH * 0.42) / cam.zoom, w = h * aspect  // do tamanho dos quadros, não da tela
  if (w > 192) { w = 192; h = w / aspect }
  let rx = cam.x - w / 2, ry = cam.y - h / 2
  if (bb) { rx = bb.x + bb.w + 12; ry = bb.y + bb.h / 2 - h / 2 } // ao lado do que já existe
  const r = doc.addRef(canvas, name, rx, ry, w, h)
  doc.push({ undo: () => { doc.removeRef(r); R.dropRef(r); touch() }, redo: () => { doc.insertRef(r); touch() } })
  selectRef(r); fitRect(boundsOf([r]), 0.8); touch()
  toast(`Imagem "${name}" adicionada. Arraste para mover e puxe os cantos para mudar o tamanho.`)
}
function removeRef(r: Ref) {
  const z = doc.zorder.indexOf('r:' + r.id)
  doc.removeRef(r); R.dropRef(r)
  doc.push({ undo: () => { doc.insertRef(r, z); touch() }, redo: () => { doc.removeRef(r); R.dropRef(r); touch() } })
  clearSel(); touch()
}
async function loadImage(blob: Blob, name: string) {
  const bmp = await createImageBitmap(blob)
  const k = Math.min(1, 4096 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
  const x = c.getContext('2d', { willReadFrequently: true })!; x.imageSmoothingQuality = 'high'; x.drawImage(bmp, 0, 0, c.width, c.height)
  addImage(c, name)
}
function demoImage() {
  const c = document.createElement('canvas'); c.width = c.height = 512
  const x = c.getContext('2d', { willReadFrequently: true })!
  const sky = x.createLinearGradient(0, 0, 0, 512); sky.addColorStop(0, '#2b2d6e'); sky.addColorStop(0.55, '#e0627b'); sky.addColorStop(1, '#ffd29a')
  x.fillStyle = sky; x.fillRect(0, 0, 512, 512)
  x.fillStyle = '#fff4d6'; x.beginPath(); x.arc(360, 250, 62, 0, 7); x.fill()
  for (const [col, y0, amp, ph] of [['#4a3f8f', 330, 40, 0], ['#2d2860', 380, 50, 2], ['#1a1740', 430, 35, 4]] as const) {
    x.fillStyle = col; x.beginPath(); x.moveTo(0, 512)
    for (let i = 0; i <= 512; i += 8) x.lineTo(i, y0 + Math.sin(i / 70 + ph) * amp)
    x.lineTo(512, 512); x.fill()
  }
  x.fillStyle = '#0e0d20'; x.fillRect(140, 330, 14, 150); x.beginPath(); x.moveTo(147, 250); x.lineTo(95, 350); x.lineTo(199, 350); x.fill()
  x.beginPath(); x.moveTo(147, 300); x.lineTo(80, 410); x.lineTo(214, 410); x.fill()
  x.fillStyle = '#fff'; for (let i = 0; i < 40; i++) x.fillRect((i * 97) % 512, (i * 53) % 200, 2, 2)
  addImage(c, 'exemplo 512×512')
}
const targetFrame = (): Frame | null => { syncSel(); return S.sel ?? (S.lastSel && doc.frames.get(S.lastSel.id) === S.lastSel ? S.lastSel : null) }
function pixelateRef(r: Ref) {
  const f = targetFrame()
  if (!f) { toast('Clique no nome de um quadro para escolher onde aplicar.'); return }
  if (!activeLayerVisible(f)) { toast('A camada ativa está oculta.'); return }
  const t = document.createElement('canvas'); t.width = f.w; t.height = f.h
  const x = t.getContext('2d', { willReadFrequently: true })!; x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'
  const k = Math.min(f.w / r.nw, f.h / r.nh), dw = r.nw * k, dh = r.nh * k
  x.drawImage(r.src, (f.w - dw) / 2, (f.h - dh) / 2, dw, dh)
  const pal = paletteOf(f).map(hex2rgba), d = x.getImageData(0, 0, f.w, f.h).data
  const buf = doc.activeBuf(f), lid = f.layers ? f.activeLayer : 1
  const before = readPatch(buf, f.w, 0, 0, f.w, f.h), out = new Uint8Array(f.w * f.h * 4)
  for (let i = 0; i < f.w * f.h; i++) {
    if (d[i * 4 + 3] < 128) continue
    let best = pal[0], bd = Infinity
    for (const p of pal) { const dd = (d[i * 4] - p[0]) ** 2 + (d[i * 4 + 1] - p[1]) ** 2 + (d[i * 4 + 2] - p[2]) ** 2; if (dd < bd) { bd = dd; best = p } }
    out.set(best, i * 4)
  }
  buf.set(out); doc.composite(f); R.upload(doc, f)
  doc.push(patchCmd(f.id, lid, before, readPatch(buf, f.w, 0, 0, f.w, f.h))); selectFrame(f); invalidate()
  toast(`Imagem reduzida para ${f.w}×${f.h} com as ${pal.length} cores da paleta do quadro.`)
}
function traceFit(r: Ref) {
  const f = targetFrame()
  if (!f) { toast('Clique no nome de um quadro para escolher onde calcar.'); return }
  change([f], [r], [], () => {
    const k = Math.min(f.w / r.nw, f.h / r.nh)
    r.w = r.nw * k; r.h = r.nh * k; r.x = f.x + (f.w - r.w) / 2; r.y = f.y + (f.h - r.h) / 2
    f.trace = true; f.bg = undefined; r.above = false
  })
  focusFrame(f)
  toast('Imagem encaixada atrás do quadro, que ficou transparente. Baixe a opacidade se precisar ver melhor o desenho.')
}
function pinRef(r: Ref) { $<HTMLImageElement>('pinimg').src = r.src.toDataURL('image/png'); r.pinned = true; $('pin').hidden = false }

// ================================================================ exportar
const exportScale = (f: Frame, v: string) => (v === 'auto' ? Math.max(1, Math.floor(512 / Math.max(f.w, f.h))) : Number(v))
function renderFramePng(f: Frame, k: number, withBg: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = f.w; c.height = f.h
  const img = new ImageData(f.w, f.h); img.data.set(f.px); c.getContext('2d')!.putImageData(img, 0, 0)
  const o = document.createElement('canvas'); o.width = f.w * k; o.height = f.h * k
  const ox = o.getContext('2d')!; ox.imageSmoothingEnabled = false
  if (withBg && f.bg) { ox.fillStyle = f.bg; ox.fillRect(0, 0, o.width, o.height) }
  ox.drawImage(c, 0, 0, o.width, o.height)
  return o
}
function exportPng(scaleVal: string, withBg: boolean) {
  const list = selFrames(); if (!list.length) { toast('Selecione um quadro para exportar.'); return }
  list.forEach((f, i) => setTimeout(() => {
    const k = exportScale(f, scaleVal), o = renderFramePng(f, k, withBg)
    o.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b!); a.download = `${fname(f).replace(/[^\p{L}\p{N}\- ]+/gu, '').trim().replace(/\s+/g, '-') || 'quadro'}-${f.w}x${f.h}${k > 1 ? `-x${k}` : ''}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000) }, 'image/png')
  }, i * 250))
  const f0 = list[0], k0 = exportScale(f0, scaleVal)
  toast(list.length > 1 ? `Baixando ${list.length} imagens PNG.` : `PNG de ${f0.w * k0} × ${f0.h * k0} px baixado.`)
}
async function copyPng(scaleVal: string, withBg: boolean) {
  const f = selFrames()[0]; if (!f) { toast('Selecione um quadro para copiar.'); return }
  const o = renderFramePng(f, exportScale(f, scaleVal), withBg)
  try { const blob: Blob = await new Promise(res => o.toBlob(b => res(b!), 'image/png')); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); toast('Imagem copiada. Cole em outro programa.') } catch { toast('O navegador não deixou copiar. Use "Baixar PNG".') }
}

// ---------------------------------------------------------------- outros formatos e projeto
function download(blob: Blob, name: string) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000) }
const slug = (f: Frame) => fname(f).replace(/[^\p{L}\p{N}\- ]+/gu, '').trim().replace(/\s+/g, '-') || 'quadro'
async function exportAs(fmt: string, scaleVal: string, withBg: boolean, anim: boolean) {
  const list = selFrames()
  if (fmt === 'gpl') {
    const f = targetFrame(), id = f?.palId ?? S.defaultPal, name = id === 'mine' ? 'Minha paleta' : (PALETTES.find(p => p.id === id)?.name ?? id)
    download(new Blob([buildGpl(name, paletteById(id))], { type: 'text/plain' }), `${name.replace(/[^\p{L}\p{N}\- ]+/gu, '').trim().replace(/\s+/g, '-') || 'paleta'}.gpl`); toast(`Paleta "${name}" exportada em .gpl (abre no Aseprite, GIMP e Krita).`); return
  }
  if (!list.length) { toast('Selecione um quadro para exportar.'); return }
  if (fmt === 'png') { exportPng(scaleVal, withBg); return }
  if (fmt === 'svg') { list.forEach((f, i) => setTimeout(() => download(new Blob([buildSvg(f, exportScale(f, scaleVal), withBg)], { type: 'image/svg+xml' }), `${slug(f)}-${f.w}x${f.h}.svg`), i * 250)); toast(list.length > 1 ? `Baixando ${list.length} arquivos SVG.` : 'SVG baixado.'); return }
  if (fmt === 'godot') { exportGodot(null); return }
  if (fmt === 'sheet') {
    const names = list.map(f => slug(f)), sh = buildSheet(list, names, 'spritesheet.png', withBg)
    sh.canvas.toBlob(b => { download(b!, 'spritesheet.png'); setTimeout(() => download(new Blob([sh.json], { type: 'application/json' }), 'spritesheet.json'), 300) }, 'image/png')
    toast(`Sprite sheet com ${list.length} quadro${list.length > 1 ? 's' : ''}: baixando spritesheet.png e spritesheet.json.`); return
  }
  if (fmt === 'ase') {
    if (anim && list.length > 1) {
      if (list.some(f => f.w !== list[0].w || f.h !== list[0].h)) { toast('Para virar animação, todos os quadros precisam ter o mesmo tamanho.'); return }
      download(await buildAseprite(list, true), `animacao-${list[0].w}x${list[0].h}.aseprite`); toast(`Arquivo .aseprite com ${list.length} frames de animação.`); return
    }
    for (let i = 0; i < list.length; i++) { download(await buildAseprite([list[i]], false), `${slug(list[i])}-${list[i].w}x${list[i].h}.aseprite`); await new Promise(r => setTimeout(r, 250)) }
    toast(list.length > 1 ? `${list.length} arquivos .aseprite baixados, com as camadas de cada quadro.` : 'Arquivo .aseprite baixado, com as camadas do quadro.')
  }
}
async function saveProject() {
  const blob = await serializeProject(doc, { mine: S.mine, defaultPal: S.defaultPal })
  download(blob, `${(wsMeta?.name ?? 'projeto').replace(/[^\p{L}\p{N}\- ]+/gu, '').trim().replace(/\s+/g, '-') || 'projeto'}.kixel`); toast(`Projeto salvo: ${doc.frames.size} quadros, ${doc.refs.length} imagens, ${doc.notes.length} notas.`)
}
const loadCanvas = (url: string) => new Promise<HTMLCanvasElement>((res, rej) => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d', { willReadFrequently: true })!.drawImage(im, 0, 0); res(c) }; im.onerror = () => rej(new Error('imagem inválida')); im.src = url })
function resetDoc() {
  for (const f of doc.frames.values()) R.freeFrame(doc, f)
  doc.clearFrames(); for (const r of doc.refs) R.dropRef(r)
  doc.refs = []; doc.conts.clear(); doc.notes = []; doc.zorder = []; doc.nextId = 1; clearSel()
}
async function openProject(file: Blob, quiet = false) {
  let d
  try { d = await parseProject(file) } catch (e) { toast('Não consegui abrir: ' + (e as Error).message); return }
  resetDoc()
  for (const c of d.conts) { const k = doc.addCont(c.x, c.y, c.w, c.h, c.name, c.id); Object.assign(k, { collapsed: c.collapsed, anim: c.anim, fps: c.fps, speed: c.speed, paused: c.paused, order: c.order, pmode: c.pmode }) }
  for (const fr of d.frames) {
    const g = doc.addFrame(fr.x, fr.y, fr.w, fr.h, fr.id)
    Object.assign(g, { name: fr.name, dur: fr.dur, bg: fr.bg, palId: fr.palId, parent: fr.parent, hidden: fr.hidden, trace: !!fr.trace, activeLayer: fr.activeLayer ?? 1 })
    g.px.set(unb64(fr.px))
    if (fr.layers) g.layers = fr.layers.map((l: any) => ({ id: l.id, name: l.name, vis: l.vis, op: l.op, px: unb64(l.px) }))
    R.upload(doc, g)
  }
  for (const n of d.notes ?? []) doc.addNote(n.x, n.y, n.text, n.color, n.id, n.w, n.h)
  const map = new Map<number, number>()
  for (const rr of d.refs) { const r = doc.addRef(await loadCanvas(rr.image), rr.name, rr.x, rr.y, rr.w, rr.h); map.set(rr.id, r.id); Object.assign(r, { opacity: rr.opacity, locked: rr.locked, above: rr.above, hidden: rr.hidden, parent: rr.parent }) }
  doc.nextId = Math.max(doc.nextId, d.nextId); doc.nextLayer = Math.max(doc.nextLayer, d.nextLayer)
  const order: string[] = []
  for (const k of d.zorder) { const kk = k[0] === 'r' ? 'r:' + (map.get(Number(k.slice(2))) ?? -1) : k; if (!order.includes(kk)) order.push(kk) }
  const have = (k: string) => { const id = Number(k.slice(2)); return k[0] === 'f' ? doc.frames.has(id) : k[0] === 'r' ? doc.refs.some(r => r.id === id) : k[0] === 'n' ? doc.notes.some(n => n.id === id) : doc.conts.has(id) }
  doc.zorder = order.filter(have)
  for (const f of doc.frames.values()) if (!doc.zorder.includes('f:' + f.id)) doc.zorder.push('f:' + f.id)
  for (const c of doc.conts.keys()) if (!doc.zorder.includes('c:' + c)) doc.zorder.push('c:' + c)
  for (const n of doc.notes) if (!doc.zorder.includes('n:' + n.id)) doc.zorder.push('n:' + n.id)
  for (const r of doc.refs) if (!doc.zorder.includes('r:' + r.id)) doc.zorder.push('r:' + r.id)
  if (Array.isArray(d.mine)) { S.mine = d.mine; store.set('kixel-mine', JSON.stringify(S.mine)) }
  if (d.defaultPal) S.defaultPal = d.defaultPal
  doc.clearHistory(); touch(); fitAll(false)
  if (!quiet) toast(`Projeto aberto: ${doc.frames.size} quadros, ${doc.refs.length} imagens, ${doc.notes.length} notas.`)
}

// ================================================================ paleta por quadro
const paletteById = (id: string | undefined): string[] => (id === 'mine' ? S.mine : (PALETTES.find(p => p.id === id) ?? PALETTES[0]).colors)
const paletteOf = (f: Frame | null) => paletteById(f?.palId ?? S.defaultPal)

// ================================================================ entrada (mouse, toque e caneta)
type Mode = 'none' | 'shape' | 'pxsel' | 'pxmove' | 'notemove' | 'framedrag' | 'contdrag' | 'marquee' | 'pending' | 'tap' | 'stroke' | 'pan' | 'drag' | 'dragcont' | 'refmove' | 'resize' | 'gesture' | 'ignore'
let mode: Mode = 'none'
const ptrs = new Map<number, { x: number; y: number }>()
let start = { sx: 0, sy: 0, cx: 0, cy: 0, wx: 0, wy: 0 }
let gest = { d: 0, cx: 0, cy: 0, t0: 0, moved: 0 }
let fdrag: { x0: number; y0: number; x1: number; y1: number; kind: 'f' | 'c' } | null = null
let mq: { x0: number; y0: number; x1: number; y1: number; add: boolean } | null = null
let lastPreset = { w: 16, h: 16 }
let pendingFn: (() => void) | null = null, pendingTimer = 0
let dragStart: { f: Frame; x: number; y: number }[] = [], dragSnap: Snap | null = null, dragMoved = false
let contDrag: { c: Cont; frames: Frame[]; refs: Ref[]; cx: number; cy: number; fpos: [number, number][]; rpos: [number, number][]; snap0: Snap } | null = null
let refDrag: { r: Ref; ox: number; oy: number; snap0: Snap } | null = null
type Box = { x: number; y: number; w: number; h: number }
let rs: { kind: 'f' | 'c' | 'r' | 'n'; dir: string; o: Box; n: Box; obj: any; snap0?: Snap } | null = null
const cancelPending = () => { clearTimeout(pendingTimer); pendingFn = null }
function runPending(newMode: Mode = 'stroke') { const fn = pendingFn; cancelPending(); mode = newMode; fn?.() }

type LabelRect = { k: 'f' | 'c' | 'r' | 'n'; id: number; x: number; y: number; w: number; h: number }
let labelRects: LabelRect[] = []
function labelHit(sx: number, sy: number): LabelRect | null { for (let i = labelRects.length - 1; i >= 0; i--) { const l = labelRects[i]; if (sx >= l.x && sx <= l.x + l.w && sy >= l.y && sy <= l.y + l.h) return l } return null }
const HDIRS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
function handleTarget(): { kind: 'f' | 'c' | 'r' | 'n'; obj: any } | null {
  syncSel()
  if (S.selCont) return { kind: 'c', obj: S.selCont }
  if (selSet.size === 1 && S.sel) return { kind: 'f', obj: S.sel }
  if (S.selRef && !S.selRef.locked) return { kind: 'r', obj: S.selRef }
  if (S.selNote) return { kind: 'n', obj: S.selNote }
  return null
}
function handlePoints(o: Box, corners: boolean) {
  const a = w2s(o.x, o.y), b = w2s(o.x + o.w, o.y + o.h), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, small = b.x - a.x < 44 || b.y - a.y < 44
  const pts: Record<string, [number, number]> = { nw: [a.x, a.y], ne: [b.x, a.y], se: [b.x, b.y], sw: [a.x, b.y] }
  if (!corners && !small) Object.assign(pts, { n: [mx, a.y], s: [mx, b.y], e: [b.x, my], w: [a.x, my] })
  return pts
}
function handleHit(sx: number, sy: number): { kind: 'f' | 'c' | 'r' | 'n'; obj: any; dir: string } | null {
  const t = handleTarget(); if (!t) return null
  const pts = handlePoints(t.obj, t.kind === 'r')
  for (const d of HDIRS) { const p = pts[d]; if (p && Math.abs(sx - p[0]) <= 9 && Math.abs(sy - p[1]) <= 9) return { ...t, dir: d } }
  return null
}
const CURSORS: Record<string, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' }

function placeFrame(w: number, h: number, name?: string, at?: { x: number; y: number }, pal?: string): Frame {
  w = Math.max(1, Math.min(2048, Math.round(w))); h = Math.max(1, Math.min(2048, Math.round(h)))
  if (pal) { S.defaultPal = pal; store.set('kixel-pal', pal) }
  let x: number, y: number
  if (at) { x = at.x; y = at.y }
  else {
    syncSel()
    let right = -Infinity, top = 0; for (const f of doc.frames.values()) if (f.x + f.w > right) { right = f.x + f.w; top = f.y }
    const last = S.lastSel && doc.frames.get(S.lastSel.id) === S.lastSel ? S.lastSel : null
    x = S.sel ? S.sel.x + S.sel.w + 8 : last ? last.x + last.w + 8 : isFinite(right) ? right + 8 : Math.round(cam.x - w / 2)
    y = S.sel ? S.sel.y : last ? last.y : isFinite(right) ? top : Math.round(cam.y - h / 2)
    for (let i = 0; i < 300 && doc.query(x, y, x + w, y + h).length; i++) x += w + 8
  }
  const f = newFrame(x, y, w, h, true, name)
  const k = doc.contAt(f.x + w / 2, f.y + h / 2); if (k) f.parent = k.id
  setTool('pencil'); ui.sheet(null)
  if (!at) fitRect({ x: f.x, y: f.y, w: f.w, h: f.h }, 0.7)
  toast(`${name ?? 'Quadro'} · ${w} × ${h}${pal ? ` · paleta ${PALETTES.find(p => p.id === pal)?.name}` : ''}. Pronto para desenhar.`)
  return f
}
function finishFrameDrag() {
  const d = fdrag; fdrag = null; if (!d) return
  const x = Math.min(d.x0, d.x1), y = Math.min(d.y0, d.y1), fw = Math.abs(d.x1 - d.x0), fh = Math.abs(d.y1 - d.y0)
  if (d.kind === 'c') {
    if (fw < 8 || fh < 8) { toast('Arraste na tela para desenhar o contêiner.'); return }
    const inside = doc.query(x, y, x + fw, y + fh).filter(f => { const c = center(f); return c.x >= x && c.x <= x + fw && c.y >= y && c.y <= y + fh })
    const refs = doc.refs.filter(r => { const c = center(r); return !r.hidden && c.x >= x && c.x <= x + fw && c.y >= y && c.y <= y + fh })
    const isAnim = S.tool === 'anim'
    const k = createContainer(x, y, fw, fh, inside, refs, isAnim ? freeName('Animação', new Set([...doc.conts.values()].map(cname))) : undefined)
    if (isAnim) setAnim(k, true)
    setTool('select')
    toast(inside.length ? `Contêiner com ${inside.length} quadro${inside.length > 1 ? 's' : ''}.` : 'Contêiner vazio. Arraste quadros para dentro dele.')
    return
  }
  if (fw >= 2 && fh >= 2) { lastPreset = { w: fw, h: fh }; placeFrame(fw, fh, undefined, { x, y }) }
  else placeFrame(lastPreset.w, lastPreset.h, undefined, { x: d.x0 - Math.floor(lastPreset.w / 2), y: d.y0 - Math.floor(lastPreset.h / 2) })
}
const localPx = (f: Frame, wx: number, wy: number) => ({ x: Math.floor(wx - f.x), y: Math.floor(wy - f.y) })

function beginFrameDrag() { const list = selFrames(); dragStart = list.map(f => ({ f, x: f.x, y: f.y })); dragSnap = snap(list, [], []); dragMoved = false }
function beginContDrag(c: Cont) {
  const m = doc.members(c.id)
  contDrag = { c, frames: m.frames, refs: m.refs, cx: c.x, cy: c.y, fpos: m.frames.map(f => [f.x, f.y]), rpos: m.refs.map(r => [r.x, r.y]), snap0: snap(m.frames, m.refs, [c]) }
  dragMoved = false
}
function beginRefDrag(r: Ref) { refDrag = { r, ox: r.x, oy: r.y, snap0: snap([], [r], []) }; dragMoved = false }
function beginResize(h: { kind: 'f' | 'c' | 'r' | 'n'; obj: any; dir: string }) {
  const o = { x: h.obj.x, y: h.obj.y, w: h.obj.w, h: h.obj.h }
  rs = { kind: h.kind, dir: h.dir, o, n: { ...o }, obj: h.obj, snap0: h.kind === 'c' ? snap([], [], [h.obj]) : h.kind === 'r' ? snap([], [h.obj], []) : h.kind === 'n' ? snap([], [], [], false, [h.obj]) : undefined }
  mode = 'resize'
}
function updateResize(w: { x: number; y: number }) {
  if (!rs) return
  const dx = Math.round(w.x - start.wx), dy = Math.round(w.y - start.wy), o = rs.o, d = rs.dir, min = rs.kind === 'c' ? 16 : rs.kind === 'n' ? 4 : 1
  if (rs.kind === 'r') { // imagem: mantém a proporção
    const aspect = o.w / o.h, sx = d.includes('e') ? 1 : -1
    const nw = Math.max(4, o.w + sx * (w.x - start.wx)), nh = nw / aspect
    rs.n = { w: nw, h: nh, x: d.includes('w') ? o.x + o.w - nw : o.x, y: d.includes('n') ? o.y + o.h - nh : o.y }
    return
  }
  let x = o.x, y = o.y, ww = o.w, hh = o.h
  if (d.includes('e')) ww = Math.max(min, o.w + dx)
  if (d.includes('s')) hh = Math.max(min, o.h + dy)
  if (d.includes('w')) { x = Math.min(o.x + dx, o.x + o.w - min); ww = o.x + o.w - x }
  if (d.includes('n')) { y = Math.min(o.y + dy, o.y + o.h - min); hh = o.y + o.h - y }
  rs.n = { x, y, w: Math.min(ww, 2048), h: Math.min(hh, 2048) }
}
function finishResize() {
  const r = rs; rs = null; if (!r) return
  const n = r.n
  if (r.kind === 'f') { reshapeFrame(r.obj, n.x, n.y, n.w, n.h); reparent([r.obj]); touch() }
  else if (r.kind === 'c') { Object.assign(r.obj, { x: Math.round(n.x), y: Math.round(n.y), w: Math.round(n.w), h: Math.round(n.h) }); commitSnap(r.snap0!, snap([], [], [r.obj])); touch() }
  else if (r.kind === 'n') { Object.assign(r.obj, { x: Math.round(n.x), y: Math.round(n.y), w: Math.round(n.w), h: Math.round(n.h) }); commitSnap(r.snap0!, snap([], [], [], false, [r.obj])); touch() }
  else { Object.assign(r.obj, n); commitSnap(r.snap0!, snap([], [r.obj], [])); touch() }
}

// ================================================================ v4: cores do quadro, alinhar, camadas, importar, salvar sozinho
// ---- cores do quadro (como "Selection colors" do Figma): troca uma cor em todos os pixels
type ColorRow = { rgba: number; n: number }
const packRGBA = (r: number, g: number, b: number, a: number) => ((r << 24) | (g << 16) | (b << 8) | a) >>> 0
const bufsOf = (f: Frame) => (f.layers ? f.layers.map(l => l.px) : [f.px])
function frameColors(frames: Frame[]): ColorRow[] | null {
  let total = 0; for (const f of frames) total += f.w * f.h
  if (total > 1_500_000) return null
  const m = new Map<number, number>()
  for (const f of frames) { const p = f.px; for (let o = 0; o < p.length; o += 4) { const a = p[o + 3]; if (!a) continue; const k = packRGBA(p[o], p[o + 1], p[o + 2], a); m.set(k, (m.get(k) ?? 0) + 1) } }
  return [...m].map(([rgba, n]) => ({ rgba, n })).sort((a, b) => b.n - a.n)
}
function recolorFrames(frames: Frame[], from: number, to: number): number {
  const fr = (from >>> 24) & 255, fg = (from >>> 16) & 255, fb = (from >>> 8) & 255, fa = from & 255
  const tr = (to >>> 24) & 255, tg = (to >>> 16) & 255, tb = (to >>> 8) & 255, ta = to & 255
  let n = 0
  for (const f of frames) {
    let hit = false
    for (const b of bufsOf(f)) for (let o = 0; o < b.length; o += 4) if (b[o] === fr && b[o + 1] === fg && b[o + 2] === fb && b[o + 3] === fa) { b[o] = tr; b[o + 1] = tg; b[o + 2] = tb; b[o + 3] = ta; n++; hit = true }
    if (hit) { if (f.layers) doc.composite(f); R.upload(doc, f) }
  }
  if (n) invalidate()
  return n
}
type BufState = { id: number; bufs: Uint8Array[] }[]
const recolorBegin = (frames: Frame[]): BufState => frames.map(f => ({ id: f.id, bufs: bufsOf(f).map(b => b.slice()) }))
function recolorEnd(before: BufState) {
  const after: BufState = before.flatMap(b => { const f = doc.frames.get(b.id); return f ? [{ id: b.id, bufs: bufsOf(f).map(x => x.slice()) }] : [] })
  const apply = (st: BufState) => { for (const q of st) { const f = doc.frames.get(q.id); if (!f) continue; bufsOf(f).forEach((b, i) => b.set(q.bufs[i])); if (f.layers) doc.composite(f); R.upload(doc, f) } invalidate() }
  doc.push({ undo: () => apply(before), redo: () => apply(after) })
}

// ---- alinhar e distribuir
function alignFrames(kind: 'l' | 'ch' | 'r' | 't' | 'cv' | 'b') {
  const list = selFrames(); if (list.length < 2) { toast('Selecione 2 ou mais quadros para alinhar (Shift + clique).'); return }
  const b = boundsOf(list)
  change(list, [], [], () => { for (const f of list) {
    const x = kind === 'l' ? b.x : kind === 'r' ? b.x + b.w - f.w : kind === 'ch' ? Math.round(b.x + (b.w - f.w) / 2) : f.x
    const y = kind === 't' ? b.y : kind === 'b' ? b.y + b.h - f.h : kind === 'cv' ? Math.round(b.y + (b.h - f.h) / 2) : f.y
    doc.moveFrame(f, x, y) } })
}
function distributeFrames(axis: 'h' | 'v') {
  const list = selFrames(); if (list.length < 3) { toast('Selecione 3 ou mais quadros para distribuir.'); return }
  const key = axis === 'h' ? (f: Frame) => f.x : (f: Frame) => f.y, size = axis === 'h' ? (f: Frame) => f.w : (f: Frame) => f.h
  const sorted = [...list].sort((a, c) => key(a) - key(c)), first = key(sorted[0]), last = key(sorted[sorted.length - 1]) + size(sorted[sorted.length - 1])
  const gap = (last - first - sorted.reduce((a, f) => a + size(f), 0)) / (sorted.length - 1)
  change(list, [], [], () => { let pos = first; for (const f of sorted) { if (axis === 'h') doc.moveFrame(f, Math.round(pos), f.y); else doc.moveFrame(f, f.x, Math.round(pos)); pos += size(f) + gap } })
}
// linhas-guia que grudam ao arrastar (segure Ctrl para desligar)
let guides: { v: { x: number; a: number; b: number }[]; h: { y: number; a: number; b: number }[] } = { v: [], h: [] }
function snapDrag(dx: number, dy: number, off: boolean) {
  guides = { v: [], h: [] }
  if (off || !dragStart.length) return { dx, dy }
  const box = (ddx: number, ddy: number) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const d of dragStart) { x0 = Math.min(x0, d.x + ddx); y0 = Math.min(y0, d.y + ddy); x1 = Math.max(x1, d.x + ddx + d.f.w); y1 = Math.max(y1, d.y + ddy + d.f.h) } return { x0, y0, x1, y1 } }
  const b = box(dx, dy), thr = 6 / cam.zoom, m = 120
  const others = doc.query(b.x0 - m, b.y0 - m, b.x1 + m, b.y1 + m).filter(f => !selSet.has(f)).slice(0, 400)
  let bx = Infinity, by = Infinity
  const mx = [b.x0, (b.x0 + b.x1) / 2, b.x1], my = [b.y0, (b.y0 + b.y1) / 2, b.y1]
  for (const o of others) {
    for (const a of mx) for (const c of [o.x, o.x + o.w / 2, o.x + o.w]) if (Math.abs(c - a) < Math.abs(bx)) bx = c - a
    for (const a of my) for (const c of [o.y, o.y + o.h / 2, o.y + o.h]) if (Math.abs(c - a) < Math.abs(by)) by = c - a
  }
  const ndx = Math.abs(bx) <= thr ? Math.round(dx + bx) : dx, ndy = Math.abs(by) <= thr ? Math.round(dy + by) : dy
  const f = box(ndx, ndy), fx = [f.x0, (f.x0 + f.x1) / 2, f.x1], fy = [f.y0, (f.y0 + f.y1) / 2, f.y1]
  for (const o of others) {
    for (const a of fx) for (const c of [o.x, o.x + o.w / 2, o.x + o.w]) if (Math.abs(c - a) < 0.51) guides.v.push({ x: c, a: Math.min(f.y0, o.y), b: Math.max(f.y1, o.y + o.h) })
    for (const a of fy) for (const c of [o.y, o.y + o.h / 2, o.y + o.h]) if (Math.abs(c - a) < 0.51) guides.h.push({ y: c, a: Math.min(f.x0, o.x), b: Math.max(f.x1, o.x + o.w) })
  }
  return { dx: ndx, dy: ndy }
}

// ---- camadas do quadro: opacidade, mesclar, reordenar
const layersState = (f: Frame) => lstate(f)
function layerOpacityLive(f: Frame, id: number, op: number) {
  const L = f.layers; if (!L) return; const i = L.findIndex(l => l.id === id); if (i < 0) return
  L[i] = { ...L[i], op }; doc.composite(f); R.upload(doc, f); invalidate()
}
function layerCommit(f: Frame, before: LState) {
  const id = f.id, after = lstate(f)
  const apply = (st: LState) => { const g = doc.frames.get(id); if (!g) return; g.layers = st.arr ? [...st.arr] : undefined; g.activeLayer = st.active; doc.composite(g); R.upload(doc, g); invalidate() }
  doc.push({ undo: () => apply(before), redo: () => apply(after) }); touch()
}
function layerMergeDown(f: Frame) {
  const L = f.layers; if (!L) { toast('Só há uma camada.'); return }
  const i = L.findIndex(l => l.id === f.activeLayer); if (i <= 0) { toast('Não há camada abaixo para mesclar.'); return }
  layerOp(f, () => {
    const up = L[i], lo = L[i - 1], out = lo.px.slice(), k = up.op ?? 1
    for (let o = 0; o < out.length; o += 4) {
      const sa = (up.px[o + 3] / 255) * k; if (!sa) continue
      const da = out[o + 3] / 255, oa = sa + da * (1 - sa)
      for (let c = 0; c < 3; c++) out[o + c] = Math.round((up.px[o + c] * sa + out[o + c] * da * (1 - sa)) / oa)
      out[o + 3] = Math.round(oa * 255)
    }
    L.splice(i - 1, 2, { ...lo, px: out }); f.activeLayer = lo.id
  })
}
function layerReorder(f: Frame, id: number, toIndex: number) {
  const L = f.layers; if (!L) return; const from = L.findIndex(l => l.id === id); if (from < 0 || from === toIndex) return
  layerOp(f, () => { const [m] = L.splice(from, 1); L.splice(Math.max(0, Math.min(L.length, toIndex)), 0, m) })
}

// ---- importar: .aseprite, sprite sheet, paleta
function freeSpot() { const b = doc.bounds(); return b ? { x: Math.round(b.x + b.w + 24), y: Math.round(b.y) } : { x: Math.round(cam.x - 8), y: Math.round(cam.y - 8) } }
async function importAseprite(file: File) {
  let a
  try { a = await parseAseprite(await file.arrayBuffer()) } catch (e) { toast('Não consegui abrir o .aseprite: ' + (e as Error).message); return }
  const base = file.name.replace(/\.[^.]+$/, ''), at = freeSpot(), recs: FrameRec[] = [], made: Frame[] = []
  a.frames.forEach((fr, i) => {
    const g = doc.addFrame(at.x + i * (a.w + 8), at.y, a.w, a.h)
    g.name = a.frames.length > 1 ? `${base} ${i + 1}` : base; g.palId = S.defaultPal; if (a.frames.length > 1) g.dur = fr.dur
    if (fr.layers.length <= 1) g.px.set(fr.layers[0]?.px ?? new Uint8Array(a.w * a.h * 4))
    else { g.layers = fr.layers.map(l => ({ id: doc.nextLayer++, name: l.name, vis: l.vis, op: l.op < 1 ? l.op : undefined, px: l.px })); g.activeLayer = g.layers[g.layers.length - 1].id; doc.composite(g) }
    R.upload(doc, g); made.push(g); recs.push(frameRec(g))
  })
  doc.push(addCmd(recs))
  if (made.length > 1) { const b = boundsOf(made); { const pd = contPad(made); createContainer(b.x - pd, b.y - pd, b.w + pd * 2, b.h + pd * 2, made, [], base) } } else selectFrame(made[0])
  fitRect(boundsOf(made), 0.7); touch()
  toast(`${file.name}: ${a.frames.length} frame${a.frames.length > 1 ? 's' : ''}, ${a.frames[0].layers.length} camada${a.frames[0].layers.length > 1 ? 's' : ''}${a.frames.length > 1 ? '. Os frames viraram uma animação no contêiner.' : '.'}`)
}
function sliceSheet(r: Ref, cw: number, ch: number, trim: boolean) {
  cw = Math.round(cw); ch = Math.round(ch)
  if (cw < 1 || ch < 1 || cw > r.nw || ch > r.nh) { toast('Tamanho da célula inválido para esta imagem.'); return }
  const cols = Math.floor(r.nw / cw), rows = Math.floor(r.nh / ch), g2 = r.src.getContext('2d', { willReadFrequently: true })!
  const at = freeSpot(), made: Frame[] = [], recs: FrameRec[] = []
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const d = g2.getImageData(i * cw, j * ch, cw, ch).data
    if (trim) { let any = false; for (let o = 3; o < d.length; o += 4) if (d[o]) { any = true; break } if (!any) continue }
    const g = doc.addFrame(at.x + i * (cw + 4), at.y + j * (ch + 4), cw, ch)
    g.name = `${r.name.replace(/\.[^.]+$/, '')} ${j * cols + i + 1}`; g.palId = S.defaultPal; g.px.set(d); R.upload(doc, g); made.push(g); recs.push(frameRec(g))
  }
  if (!made.length) { toast('Nenhuma célula com pixels nessa grade.'); return }
  doc.push(addCmd(recs))
  const b = boundsOf(made); const pd = contPad(made); createContainer(b.x - pd, b.y - pd, b.w + pd * 2, b.h + pd * 2, made, [], r.name.replace(/\.[^.]+$/, '') + ' (fatiado)')
  fitRect(b, 0.8); touch(); toast(`${made.length} quadros de ${cw} × ${ch} criados, num contêiner. Dá para tocar como animação.`)
}
function parsePalette(text: string): string[] {
  const out: string[] = [], hx = (n: number) => n.toString(16).padStart(2, '0')
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim(); if (!t || /^(GIMP|JASC|Name:|Columns:|#\s|0100$)/i.test(t)) continue
    const rgb = t.match(/^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(?:\s|$)/); if (rgb && +rgb[1] < 256 && +rgb[2] < 256 && +rgb[3] < 256) { out.push('#' + hx(+rgb[1]) + hx(+rgb[2]) + hx(+rgb[3])); continue }
    const h = t.match(/^#?([0-9a-f]{6})(?:[0-9a-f]{2})?$/i); if (h) out.push('#' + h[1].toLowerCase())
  }
  return [...new Set(out)].slice(0, 256)
}
function useCustomPalette(colors: string[], why: string) {
  S.mine = colors; store.set('kixel-mine', JSON.stringify(S.mine)); S.defaultPal = 'mine'; store.set('kixel-pal', 'mine')
  const t = selFrames(); const fr = t.length ? t : (targetFrame() ? [targetFrame()!] : [])
  if (fr.length) change(fr, [], [], () => { for (const f of fr) f.palId = 'mine' })
  ui.panels(true); toast(`${why}: ${colors.length} cores em "Minha paleta".`)
}
async function importPaletteFile(file: File) {
  const cols = parsePalette(await file.text())
  if (!cols.length) { toast('Não achei cores nesse arquivo (aceito: .gpl, .hex, .pal, .txt).'); return }
  useCustomPalette(cols, 'Paleta importada')
}
function extractPalette(r: Ref, n: number) {
  const g = r.src.getContext('2d', { willReadFrequently: true })!, step = Math.max(1, Math.floor(Math.sqrt((r.nw * r.nh) / 40000)))
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>()
  const d = g.getImageData(0, 0, r.nw, r.nh).data
  for (let y = 0; y < r.nh; y += step) for (let x = 0; x < r.nw; x += step) {
    const o = (y * r.nw + x) * 4; if (d[o + 3] < 128) continue
    const k = ((d[o] >> 4) << 8) | ((d[o + 1] >> 4) << 4) | (d[o + 2] >> 4), q = buckets.get(k) ?? { n: 0, r: 0, g: 0, b: 0 }
    q.n++; q.r += d[o]; q.g += d[o + 1]; q.b += d[o + 2]; buckets.set(k, q)
  }
  const top = [...buckets.values()].sort((a, b) => b.n - a.n).slice(0, Math.max(2, Math.min(64, n)))
  const hx = (v: number) => Math.round(v).toString(16).padStart(2, '0')
  useCustomPalette(top.map(q => '#' + hx(q.r / q.n) + hx(q.g / q.n) + hx(q.b / q.n)), 'Paleta extraída da imagem')
}

// ================================================================ área de transferência, ordem, espelhar e girar
let frameClip: FrameRec[] | null = null, pxClip: { w: number; h: number; data: Uint8Array } | null = null, lastCopied: 'frames' | 'px' = 'frames'
function copyFrames() {
  const list = selFrames(); if (!list.length) return false
  frameClip = list.map(frameRec); lastCopied = 'frames'
  toast(`${list.length} quadro${list.length > 1 ? 's copiados' : ' copiado'}. Use Ctrl+V ou "Colar aqui".`); return true
}
function pasteFrames(at?: { x: number; y: number }) {
  if (!frameClip?.length) return
  const mx = Math.min(...frameClip.map(r => r.x)), my = Math.min(...frameClip.map(r => r.y))
  const p = at ?? (S.hover ? { x: Math.round(S.hover.wx), y: Math.round(S.hover.wy) } : { x: Math.round(cam.x), y: Math.round(cam.y) })
  const out: Frame[] = [], recs: FrameRec[] = []
  for (const r of frameClip) {
    const g = doc.addFrame(p.x + (r.x - mx), p.y + (r.y - my), r.w, r.h)
    Object.assign(g, { name: r.name ? r.name + ' cópia' : nextFrameName(), dur: r.dur, bg: r.bg, palId: r.palId, trace: r.trace, activeLayer: r.activeLayer, hidden: r.hidden })
    if (r.layers) g.layers = r.layers.map(l => ({ ...l, px: l.px.slice() }))
    g.px.set(r.px); R.upload(doc, g); const k = doc.contAt(g.x + g.w / 2, g.y + g.h / 2); if (k) g.parent = k.id
    out.push(g); recs.push(frameRec(g))
  }
  doc.push(addCmd(recs)); selectFrames(out); touch(); toast(`${out.length} quadro${out.length > 1 ? 's colados' : ' colado'}.`)
}
function selKeys(): string[] {
  syncSel(); const k = [...selSet].map(f => 'f:' + f.id)
  if (S.selCont) k.push('c:' + S.selCont.id); if (S.selRef) k.push('r:' + S.selRef.id); if (S.selNote) k.push('n:' + S.selNote.id)
  return k
}
function reorder(front: boolean) {
  const keys = selKeys(); if (!keys.length) return
  const set = new Set(keys)
  change(selFrames(), S.selRef ? [S.selRef] : [], S.selCont ? [S.selCont] : [], () => {
    const rest = doc.zorder.filter(k => !set.has(k)), moved = doc.zorder.filter(k => set.has(k))
    doc.zorder = front ? [...rest, ...moved] : [...moved, ...rest]
  }, true, S.selNote ? [S.selNote] : [])
  toast(front ? 'Trazido para frente na lista de camadas.' : 'Enviado para trás na lista de camadas.')
}
type ShapeState = { x: number; y: number; w: number; h: number; bufs: Uint8Array[] }
const shapeState = (f: Frame): ShapeState => ({ x: f.x, y: f.y, w: f.w, h: f.h, bufs: (f.layers ? f.layers.map(l => l.px) : [f.px]).map(b => b.slice()) })
function applyShapeState(id: number, st: ShapeState) { const g = doc.frames.get(id); if (!g) return; R.freeFrame(doc, g); doc.setShape(g, st.x, st.y, st.w, st.h, st.bufs.map(b => b.slice())); R.upload(doc, g); invalidate() }
function xform(buf: Uint8Array, w: number, h: number, kind: 'h' | 'v' | 'r'): Uint8Array {
  const out = new Uint8Array(buf.length)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4
    const d = kind === 'h' ? (y * w + (w - 1 - x)) * 4 : kind === 'v' ? ((h - 1 - y) * w + x) * 4 : (x * h + (h - 1 - y)) * 4
    out[d] = buf[o]; out[d + 1] = buf[o + 1]; out[d + 2] = buf[o + 2]; out[d + 3] = buf[o + 3]
  }
  return out
}
function transformFrames(kind: 'h' | 'v' | 'r') {
  const list = selFrames(); if (!list.length) return
  const steps = list.map(f => {
    const before = shapeState(f), rot = kind === 'r', nw = rot ? f.h : f.w, nh = rot ? f.w : f.h
    const after: ShapeState = { x: rot ? f.x + Math.floor((f.w - nw) / 2) : f.x, y: rot ? f.y + Math.floor((f.h - nh) / 2) : f.y, w: nw, h: nh, bufs: before.bufs.map(b => xform(b, f.w, f.h, kind)) }
    return { id: f.id, before, after }
  })
  for (const st of steps) applyShapeState(st.id, st.after)
  doc.push({ undo: () => { for (const st of steps) applyShapeState(st.id, st.before) }, redo: () => { for (const st of steps) applyShapeState(st.id, st.after) } }); touch()
  toast(kind === 'h' ? 'Espelhado na horizontal.' : kind === 'v' ? 'Espelhado na vertical.' : 'Girado 90°.')
}
function toggleHidden() {
  const fr = selFrames(), rf = S.selRef ? [S.selRef] : []
  if (!fr.length && !rf.length) return
  const hide = fr.length ? !fr.every(f => f.hidden) : !S.selRef!.hidden
  change(fr, rf, [], () => { for (const f of fr) f.hidden = hide || undefined; for (const r of rf) r.hidden = hide })
}
function toggleLock() { const r = S.selRef; if (r) change([], [r], [], () => { r.locked = !r.locked }) }
function removeFromContainer() {
  const fr = selFrames().filter(f => f.parent !== undefined); if (!fr.length) return
  change(fr, [], [], () => { for (const f of fr) f.parent = undefined })
}
function duplicateNote(n: Note) {
  const c = doc.addNote(n.x + n.w + 2, n.y, n.text, n.color, undefined, n.w, n.h, n.size)
  doc.push({ undo: () => { doc.removeNote(c); touch() }, redo: () => { doc.insertNote(c); touch() } }); selectNote(c); touch()
}

// ---------------------------------------------------------------- formas (linha, retângulo, elipse)
let shape: { kind: 'line' | 'rect' | 'ellipse'; x0: number; y0: number; x1: number; y1: number; shift: boolean } | null = null
function drawShape() {
  const s = stroke, sh = shape; if (!s || !sh) return
  s.buf.set(s.before)
  let { x0, y0, x1, y1 } = sh
  if (sh.shift) {
    const dx = x1 - x0, dy = y1 - y0, ax = Math.abs(dx), ay = Math.abs(dy), sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1
    if (sh.kind === 'line') { if (ax > 2 * ay) y1 = y0; else if (ay > 2 * ax) x1 = x0; else { const m = Math.max(ax, ay); x1 = x0 + sx * m; y1 = y0 + sy * m } }
    else { const m = Math.max(ax, ay); x1 = x0 + sx * m; y1 = y0 + sy * m }
  }
  const put = (x: number, y: number) => stamp(s, x, y)
  if (sh.kind === 'line') shp.line(x0, y0, x1, y1, put); else if (sh.kind === 'rect') shp.rect(x0, y0, x1, y1, S.opt.fill, put); else shp.ellipse(x0, y0, x1, y1, S.opt.fill, put)
  edited(s)
}
const clampPx = (f: Frame, p: { x: number; y: number }) => ({ x: Math.max(0, Math.min(f.w - 1, p.x)), y: Math.max(0, Math.min(f.h - 1, p.y)) })

// ---------------------------------------------------------------- seleção de pixels (retângulo, mover, copiar, colar)
type PSel = { f: Frame; x: number; y: number; w: number; h: number }
let psel: PSel | null = null
let pxDrag: { x0: number; y0: number; moved: boolean } | null = null
let pxMove: { float: Uint8Array; base: Uint8Array; ox: number; oy: number; sx: number; sy: number; moved: boolean } | null = null
const inPsel = (p: PSel, x: number, y: number) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h
function pxRegion(buf: Uint8Array, f: Frame, r: PSel) { const out = new Uint8Array(r.w * r.h * 4); for (let j = 0; j < r.h; j++) out.set(buf.subarray(((r.y + j) * f.w + r.x) * 4, ((r.y + j) * f.w + r.x + r.w) * 4), j * r.w * 4); return out }
function pxPut(buf: Uint8Array, f: Frame, data: Uint8Array, w: number, h: number, nx: number, ny: number) {
  for (let j = 0; j < h; j++) { const ty = ny + j; if (ty < 0 || ty >= f.h) continue; for (let i = 0; i < w; i++) { const tx = nx + i; if (tx < 0 || tx >= f.w) continue; const o = (j * w + i) * 4; if (data[o + 3] === 0) continue; buf.set(data.subarray(o, o + 4), (ty * f.w + tx) * 4) } }
}
function pxCopy(cut: boolean) {
  const p = psel; if (!p || doc.frames.get(p.f.id) !== p.f) return false
  const buf = doc.activeBuf(p.f); pxClip = { w: p.w, h: p.h, data: pxRegion(buf, p.f, p) }; lastCopied = 'px'
  if (cut) pxClear()
  toast(cut ? 'Pixels recortados.' : 'Pixels copiados.'); return true
}
function pxClear() {
  const p = psel; if (!p) return
  const s = newStroke(p.f, false); if (!s) return
  for (let j = 0; j < p.h; j++) s.buf.fill(0, ((p.y + j) * p.f.w + p.x) * 4, ((p.y + j) * p.f.w + p.x + p.w) * 4)
  s.minx = p.x; s.miny = p.y; s.maxx = p.x + p.w - 1; s.maxy = p.y + p.h - 1
  stroke = s; commitStroke(); edited(s)
}
function pxPaste() {
  if (!pxClip) return
  const f = psel?.f ?? targetFrame(); if (!f) { toast('Selecione um quadro para colar os pixels.'); return }
  const s = newStroke(f, false); if (!s) return
  let nx = 0, ny = 0
  if (S.hover) { const l = localPx(f, S.hover.wx, S.hover.wy); if (l.x >= 0 && l.y >= 0 && l.x < f.w && l.y < f.h) { nx = l.x; ny = l.y } }
  pxPut(s.buf, f, pxClip.data, pxClip.w, pxClip.h, nx, ny)
  s.minx = Math.max(0, nx); s.miny = Math.max(0, ny); s.maxx = Math.min(f.w - 1, nx + pxClip.w - 1); s.maxy = Math.min(f.h - 1, ny + pxClip.h - 1)
  stroke = s; commitStroke(); edited(s); psel = { f, x: nx, y: ny, w: Math.min(pxClip.w, f.w - nx), h: Math.min(pxClip.h, f.h - ny) }; selectFrame(f)
  toast('Pixels colados. Arraste a seleção para posicionar.')
}

// ---------------------------------------------------------------- animação (um contêiner vira uma sequência, da esquerda para a direita)
const rowOf = (f: Frame) => Math.floor((f.y + f.h / 2) / Math.max(1, f.h))
const byPos = (a: Frame, b: Frame) => rowOf(a) - rowOf(b) || a.x - b.x || a.y - b.y   // linhas de cima para baixo, cada linha da esquerda para a direita
/** Ordem da animação: a que o usuário montou nas miniaturas do player; sem ela, pela posição na tela. */
const animFrames = (c: Cont): Frame[] => {
  const fr = doc.members(c.id).frames.filter(f => !f.hidden).sort(byPos)
  if (!c.order?.length) return fr
  const rank = new Map(c.order.map((id, i) => [id, i]))
  return fr.sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9) || byPos(a, b))
}
function setAnimOrder(k: Cont, ids: number[] | undefined) { change([], [], [k], () => { k.order = ids }); toast(ids ? 'Ordem dos frames atualizada.' : 'Voltou a ordem pela posição na tela.') }
/** Margem do contêiner e espaço entre quadros proporcionais ao tamanho dos quadros. */
const contPad = (items: { w: number; h: number }[]) => Math.max(3, Math.min(8, Math.round(Math.max(...items.map(i => Math.max(i.w, i.h))) * 0.2)))
const gapFor = (size: number) => Math.max(3, Math.min(8, Math.round(size * 0.25)))
const delaysOf = (list: Frame[], fps: number) => list.map(f => f.dur ?? Math.round(1000 / Math.max(1, fps)))
function composedPx(f: Frame, withBg: boolean): Uint8Array {
  if (!withBg || !f.bg) return f.px
  const out = f.px.slice(), bg = hex2rgba(f.bg)
  for (let o = 0; o < out.length; o += 4) if (out[o + 3] < 128) out.set(bg, o)
  return out
}
function animSame(list: Frame[]) { return list.length > 0 && list.every(f => f.w === list[0].w && f.h === list[0].h) }
function exportGif(c: Cont, fps: number, scaleVal: string, withBg: boolean) {
  const list = animFrames(c)
  if (list.length < 2) { toast('A animação precisa de ao menos 2 quadros dentro do contêiner.'); return }
  if (!animSame(list)) { toast('Todos os quadros do contêiner precisam ter o mesmo tamanho para virar GIF.'); return }
  const k = exportScale(list[0], scaleVal)
  const bytes = encodeGif(list.map(f => ({ w: f.w, h: f.h, px: composedPx(f, withBg) })), k, delaysOf(list, fps))
  download(new Blob([bytes as BlobPart], { type: 'image/gif' }), `${cname(c).replace(/[^\p{L}\p{N}\- ]+/gu, '').trim().replace(/\s+/g, '-') || 'animacao'}-${list[0].w * k}x${list[0].h * k}.gif`)
  toast(`GIF com ${list.length} frames a ${fps} fps (${list[0].w * k} × ${list[0].h * k} px).`)
}
function exportGodot(c: Cont | null) {
  const list = c ? animFrames(c) : selFrames().sort((a, b) => rowOf(a) - rowOf(b) || a.x - b.x || a.y - b.y)
  if (!list.length) { toast('Selecione um quadro, ou um contêiner de animação, para exportar.'); return }
  const fps = c?.fps ?? 8, label = c ? cname(c) : fname(list[0])
  const base = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'animacao'
  const names = list.map((_, i) => String(i + 1)), sh = buildSheet(list, names, base + '.png', false)
  const frames = JSON.parse(sh.json).frames, regions = names.map(n => frames[n].frame as { x: number; y: number; w: number; h: number })
  const tres = buildGodotTres(base + '.png', regions, delaysOf(list, fps), fps)
  sh.canvas.toBlob(b => { download(b!, base + '.png'); setTimeout(() => download(new Blob([tres], { type: 'text/plain' }), base + '.tres'), 300) }, 'image/png')
  toast(`Godot: baixando ${base}.png e ${base}.tres. Coloque os dois na pasta do projeto (res://) e use o .tres em um AnimatedSprite2D.`)
}
async function exportAseAnim(c: Cont, fps: number) {
  const list = animFrames(c)
  if (list.length < 2 || !animSame(list)) { toast('Precisa de 2 ou mais quadros do mesmo tamanho dentro do contêiner.'); return }
  download(await buildAseprite(list, true, delaysOf(list, fps)), `${cname(c).replace(/[^\p{L}\p{N}\- ]+/gu, '').trim().replace(/\s+/g, '-') || 'animacao'}-${list[0].w}x${list[0].h}.aseprite`)
  toast(`.aseprite com ${list.length} frames de animação.`)
}
function animAddFrame(c: Cont) {
  const list = animFrames(c), src = list[list.length - 1]
  if (!src) { toast('Coloque ao menos um quadro dentro do contêiner.'); return }
  const animName = nextFrameName()
  const g = doc.addFrame(src.x + src.w + gapFor(src.w), src.y, src.w, src.h)
  if (c.order) c.order = [...c.order, g.id]
  Object.assign(g, { name: animName, bg: src.bg, palId: src.palId, trace: src.trace, activeLayer: src.activeLayer, parent: c.id })
  if (src.layers) g.layers = src.layers.map(l => ({ ...l, px: l.px.slice() }))
  g.px.set(src.px); R.upload(doc, g); doc.push(addCmd([frameRec(g)])); fitContainer(c); selectFrame(g); touch()
  toast(`Frame ${list.length + 1} criado como cópia do anterior. Edite o novo quadro.`)
}

// ---------------------------------------------------------------- menu de botão direito
function menuItems(wx: number, wy: number): MenuItem[] {
  syncSel()
  const fr = selFrames(), n = fr.length, r = S.selRef, k = S.selCont, note = S.selNote, it: MenuItem[] = []
  const sep = () => { if (it.length && !it[it.length - 1].sep) it.push({ sep: true, label: '' }) }
  const add = (label: string, fn: () => void, key?: string, disabled = false) => it.push({ label, fn, key, disabled })
  if (n) {
    add('Copiar', () => copyFrames(), 'Ctrl+C'); add('Colar aqui', () => pasteFrames({ x: Math.round(wx), y: Math.round(wy) }), 'Ctrl+V', !frameClip)
    add('Duplicar', duplicateSelection, 'Ctrl+D'); sep()
    add('Trazer para frente', () => reorder(true), 'Ctrl+]'); add('Enviar para trás', () => reorder(false), 'Ctrl+['); sep()
    add('Agrupar em contêiner', () => void groupSelection(), 'Ctrl+G'); add('Criar animação com estes quadros', createAnimation)
    if (fr.some(f => f.parent !== undefined)) add('Tirar do contêiner', removeFromContainer); sep()
    add('Espelhar na horizontal', () => transformFrames('h'), 'Shift+H'); add('Espelhar na vertical', () => transformFrames('v'), 'Shift+V'); add('Girar 90°', () => transformFrames('r'), 'Shift+R'); sep()
    if (n === 1) add('Renomear', () => ui.renameSelected(), 'F2')
    add(fr.every(f => f.hidden) ? 'Mostrar' : 'Ocultar', toggleHidden, 'Ctrl+Shift+H')
    if (n === 1) add('Ir até o quadro', () => focusFrame(fr[0]), 'Shift+2')
    add('Exportar…', () => ui.openExport()); sep()
    add('Excluir', deleteSelection, 'Delete')
  } else if (k) {
    add('Renomear', () => ui.renameSelected(), 'F2'); add('Ajustar ao conteúdo', () => fitContainer(k))
    add(k.anim ? 'Esconder o player de animação' : 'Mostrar o player de animação', () => setAnim(k, !k.anim)); add('Adicionar frame de animação', () => animAddFrame(k)); add('Exportar GIF', () => exportGif(k, k.fps ?? 8, 'auto', false)); add('Exportar para Godot', () => exportGodot(k)); sep()
    add('Trazer para frente', () => reorder(true), 'Ctrl+]'); add('Enviar para trás', () => reorder(false), 'Ctrl+['); sep()
    add('Desagrupar', () => ungroup(k), 'Ctrl+Shift+G'); add('Excluir contêiner', deleteSelection, 'Delete')
  } else if (r) {
    add(r.locked ? 'Desbloquear' : 'Bloquear', toggleLock, 'Ctrl+Shift+L'); add(r.hidden ? 'Mostrar' : 'Ocultar', toggleHidden, 'Ctrl+Shift+H')
    add(r.above ? 'Mostrar atrás dos quadros' : 'Mostrar na frente dos quadros', () => change([], [r], [], () => { r.above = !r.above })); sep()
    add('Calcar no quadro', () => traceFit(r)); add('Reduzir para pixels', () => pixelateRef(r)); add('Fixar na tela', () => pinRef(r)); sep()
    add('Trazer para frente', () => reorder(true), 'Ctrl+]'); add('Enviar para trás', () => reorder(false), 'Ctrl+['); sep()
    add('Excluir imagem', deleteSelection, 'Delete')
  } else if (note) {
    add('Editar texto', () => ui.editNote(note.id)); add('Duplicar', () => duplicateNote(note)); sep()
    add('Trazer para frente', () => reorder(true), 'Ctrl+]'); add('Enviar para trás', () => reorder(false), 'Ctrl+['); sep()
    add('Excluir nota', deleteSelection, 'Delete')
  } else {
    add('Colar aqui', () => (lastCopied === 'px' && pxClip ? pxPaste() : pasteFrames({ x: Math.round(wx), y: Math.round(wy) })), 'Ctrl+V', !frameClip && !pxClip)
    add('Novo quadro aqui', () => placeFrame(lastPreset.w, lastPreset.h, undefined, { x: Math.round(wx) - Math.floor(lastPreset.w / 2), y: Math.round(wy) - Math.floor(lastPreset.h / 2) }))
    add('Nova nota aqui', () => { const nn = createNote(wx, wy); ui.editNote(nn.id) }); sep()
    add('Voltar à tela inicial', goHome); add('Atalhos de teclado', () => ui.toggleHelp(), '?'); sep()
    add('Selecionar tudo', () => selectFrames([...doc.frames.values()].filter(f => !f.hidden)), 'Ctrl+A'); add('Ver tudo', () => fitAll(), 'Shift+1')
  }
  return it
}
function openContext(cx: number, cy: number, wx: number, wy: number) { ui.showMenu(cx, cy, menuItems(wx, wy)) }

// ---- eventos
ov.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault() })
ov.addEventListener('mouseup', e => { if (e.button === 1) e.preventDefault() })
ov.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault() })

ov.addEventListener('pointerdown', e => {
  ui.closeRename()
  ov.setPointerCapture(e.pointerId)
  const rc = ov.getBoundingClientRect(), sx = e.clientX - rc.left, sy = e.clientY - rc.top
  ptrs.set(e.pointerId, { x: sx, y: sy })
  if (ptrs.size === 2) {
    if (mode === 'pending' || mode === 'tap') cancelPending()
    if (mode === 'stroke' || mode === 'shape') commitStroke()
    shape = null; pxDrag = null; pxMove = null; fdrag = null; mq = null; rs = null; mode = 'gesture'
    const [a, b] = [...ptrs.values()]
    gest = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, t0: performance.now(), moved: 0 }
    return
  }
  if (ptrs.size > 1) return
  const w = s2w(sx, sy); start = { sx, sy, cx: cam.x, cy: cam.y, wx: w.x, wy: w.y }
  dragMoved = false; anim = null
  if (e.button === 1) { e.preventDefault(); mode = 'pan'; return }
  if (e.button === 2 && !((S.tool === 'pencil' || S.tool === 'eraser') && doc.hit(w.x, w.y))) { mode = 'ignore'; return }   // botão direito abre o menu (nos pincéis, sobre um quadro, apaga)
  if (S.spaceDown || S.tool === 'hand') { mode = 'pan'; return }
  syncSel()
  const free = S.tool !== 'frame' && S.tool !== 'container' && S.tool !== 'anim'
  if (S.tool === 'note') {
    const hitN = noteHitW(w.x, w.y)
    if (hitN) { selectNote(hitN); ui.editNote(hitN.id) } else { const n = createNote(w.x, w.y); setTool('select'); ui.editNote(n.id) }
    mode = 'ignore'; invalidate(); ui.panels(true); return
  }
  const hd = free ? handleHit(sx, sy) : null           // 1) alças de redimensionar do que está selecionado
  if (hd) { beginResize(hd); invalidate(); return }
  const lb = free ? labelHit(sx, sy) : null            // 2) nomes clicáveis
  if (lb) {
    if (lb.k === 'f') { const f = doc.frames.get(lb.id)!; if (e.shiftKey) selectFrame(f, true); else if (!selSet.has(f)) selectFrame(f); mode = 'drag'; beginFrameDrag() }
    else if (lb.k === 'c') { const c = doc.conts.get(lb.id)!; selectCont(c); mode = 'dragcont'; beginContDrag(c) }
    else if (lb.k === 'n') { const n = doc.notes.find(q => q.id === lb.id)!; selectNote(n); noteDrag = { n, ox: n.x, oy: n.y, snap0: snap([], [], [], false, [n]), moved: false }; mode = 'notemove' }
    else { const r = doc.refs.find(q => q.id === lb.id)!; selectRef(r); if (!r.locked) { mode = 'refmove'; beginRefDrag(r) } else mode = 'ignore' }
    invalidate(); ui.panels(true); return
  }
  const nh = free ? noteHitW(w.x, w.y) : null
  if (nh && !doc.hit(w.x, w.y)) { selectNote(nh); noteDrag = { n: nh, ox: nh.x, oy: nh.y, snap0: snap([], [], [], false, [nh]), moved: false }; mode = 'notemove'; invalidate(); ui.panels(true); return }
  const f = doc.hit(w.x, w.y)
  switch (S.tool) {
    case 'pencil': case 'eraser':
      if (f) {
        selectFrame(f)
        const begin = () => { const p = localPx(f, w.x, w.y); beginStroke(f, p.x, p.y, S.tool === 'eraser' || e.button === 2) }
        if (e.pointerType === 'touch') { mode = 'pending'; pendingFn = begin; pendingTimer = window.setTimeout(() => { if (mode === 'pending' && ptrs.size === 1) runPending() }, 70) } // espera: pode ser o início de um gesto de 2 dedos
        else { mode = 'stroke'; begin() }
      } else mode = 'pan'
      break
    case 'line': case 'rect': case 'ellipse':
      if (f) {
        selectFrame(f); const p = clampPx(f, localPx(f, w.x, w.y))
        stroke = newStroke(f, false)
        if (!stroke) { mode = 'ignore'; break }
        shape = { kind: S.tool as 'line' | 'rect' | 'ellipse', x0: p.x, y0: p.y, x1: p.x, y1: p.y, shift: e.shiftKey }; drawShape(); mode = 'shape'
      } else mode = 'pan'
      break
    case 'marquee':
      if (f) {
        const p = localPx(f, w.x, w.y)
        if (psel && psel.f === f && inPsel(psel, p.x, p.y)) {
          const s2 = newStroke(f, false)
          if (!s2) { mode = 'ignore'; break }
          const float = pxRegion(s2.buf, f, psel), base = s2.before.slice()
          for (let j = 0; j < psel.h; j++) base.fill(0, ((psel.y + j) * f.w + psel.x) * 4, ((psel.y + j) * f.w + psel.x + psel.w) * 4)
          s2.minx = psel.x; s2.miny = psel.y; s2.maxx = psel.x + psel.w - 1; s2.maxy = psel.y + psel.h - 1
          stroke = s2; pxMove = { float, base, ox: psel.x, oy: psel.y, sx: p.x, sy: p.y, moved: false }; mode = 'pxmove'
        } else { selectFrame(f); const c = clampPx(f, p); pxDrag = { x0: c.x, y0: c.y, moved: false }; psel = { f, x: c.x, y: c.y, w: 1, h: 1 }; mode = 'pxsel' }
      } else { psel = null; mode = 'pan' }
      break
    case 'frame': { const gx = Math.round(w.x), gy = Math.round(w.y); fdrag = { x0: gx, y0: gy, x1: gx, y1: gy, kind: 'f' }; mode = 'framedrag'; break }
    case 'container': case 'anim': { const gx = Math.round(w.x), gy = Math.round(w.y); fdrag = { x0: gx, y0: gy, x1: gx, y1: gy, kind: 'c' }; mode = 'contdrag'; break }
    case 'fill': case 'picker': {
      const act = () => {
        if (S.tool === 'fill') { if (f) { selectFrame(f); const p = localPx(f, w.x, w.y); floodFill(f, p.x, p.y) } }
        else if (f) { const p = localPx(f, w.x, w.y); pick(f, p.x, p.y) } else { const r = doc.hitRef(w.x, w.y); if (r) pickRef(r, w.x, w.y) }
      }
      if (e.pointerType === 'touch') { mode = 'tap'; pendingFn = act } else { act(); mode = 'ignore' }
      break
    }
    default: { // selecionar
      const r = doc.hitRef(w.x, w.y)
      if (f) {
        if (e.shiftKey) { selectFrame(f, true); mode = selSet.has(f) ? 'drag' : 'ignore'; if (mode === 'drag') beginFrameDrag() }
        else { if (!selSet.has(f)) selectFrame(f); mode = 'drag'; beginFrameDrag() }
      } else if (r) { selectRef(r); if (!r.locked) { mode = 'refmove'; beginRefDrag(r) } else mode = 'ignore' }
      else if (e.pointerType === 'touch') { clearSel(); mode = 'pan' }
      else { if (!e.shiftKey) clearSel(); mq = { x0: w.x, y0: w.y, x1: w.x, y1: w.y, add: e.shiftKey }; mode = 'marquee' }
    }
  }
  invalidate(); ui.syncZoom(); ui.panels(true)
})

ov.addEventListener('pointermove', e => {
  const rc = ov.getBoundingClientRect(), sx = e.clientX - rc.left, sy = e.clientY - rc.top
  const wpos = s2w(sx, sy); S.hover = { wx: wpos.x, wy: wpos.y }
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: sx, y: sy })
  if (mode === 'gesture' && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2
    cam.x -= (cx - gest.cx) / cam.zoom; cam.y -= (cy - gest.cy) / cam.zoom
    if (gest.d > 0) zoomAt(cx, cy, cam.zoom * (d / gest.d))
    gest.moved += Math.abs(cx - gest.cx) + Math.abs(cy - gest.cy) + Math.abs(d - gest.d); gest.d = d; gest.cx = cx; gest.cy = cy
    invalidate(); return
  }
  if (!ptrs.has(e.pointerId) || ptrs.size !== 1) { // sem botão: só o cursor
    if (e.pointerType !== 'touch' && !S.spaceDown && S.tool !== 'hand') {
      const tools = S.tool !== 'frame' && S.tool !== 'container' && S.tool !== 'anim', hd = tools ? handleHit(sx, sy) : null
      ov.style.cursor = hd ? CURSORS[hd.dir] : tools && labelHit(sx, sy) ? 'pointer' : ui.toolCursor(S.tool)
    }
    invalidate(); return
  }
  const w = s2w(sx, sy)
  if (mode === 'pending' && Math.hypot(sx - start.sx, sy - start.sy) > 4) runPending()
  if (mode === 'tap' && Math.hypot(sx - start.sx, sy - start.sy) > 10) { cancelPending(); mode = 'ignore' }
  switch (mode) {
    case 'shape': if (shape && stroke) { const p = clampPx(stroke.f, localPx(stroke.f, w.x, w.y)); shape.x1 = p.x; shape.y1 = p.y; shape.shift = e.shiftKey; drawShape() } break
    case 'pxsel': if (pxDrag && psel) {
      const c = clampPx(psel.f, localPx(psel.f, w.x, w.y)); pxDrag.moved = true
      psel.x = Math.min(pxDrag.x0, c.x); psel.y = Math.min(pxDrag.y0, c.y); psel.w = Math.abs(c.x - pxDrag.x0) + 1; psel.h = Math.abs(c.y - pxDrag.y0) + 1
    } break
    case 'pxmove': if (pxMove && stroke && psel) {
      const l = localPx(psel.f, w.x, w.y), nx = pxMove.ox + (l.x - pxMove.sx), ny = pxMove.oy + (l.y - pxMove.sy), s2 = stroke, f = psel.f
      if (nx !== psel.x || ny !== psel.y) pxMove.moved = true
      s2.buf.set(pxMove.base); pxPut(s2.buf, f, pxMove.float, psel.w, psel.h, nx, ny)
      s2.minx = Math.max(0, Math.min(s2.minx, nx)); s2.miny = Math.max(0, Math.min(s2.miny, ny)); s2.maxx = Math.min(f.w - 1, Math.max(s2.maxx, nx + psel.w - 1)); s2.maxy = Math.min(f.h - 1, Math.max(s2.maxy, ny + psel.h - 1))
      psel.x = nx; psel.y = ny; edited(s2)
    } break
    case 'notemove': if (noteDrag) { noteDrag.n.x = noteDrag.ox + (w.x - start.wx); noteDrag.n.y = noteDrag.oy + (w.y - start.wy); noteDrag.moved = true } break
    case 'framedrag': case 'contdrag': if (fdrag) { fdrag.x1 = Math.round(w.x); fdrag.y1 = Math.round(w.y) } break
    case 'marquee': if (mq) { mq.x1 = w.x; mq.y1 = w.y } break
    case 'resize': updateResize(w); break
    case 'pan': cam.x = start.cx - (sx - start.sx) / cam.zoom; cam.y = start.cy - (sy - start.sy) / cam.zoom; break
    case 'stroke': {
      const evs = (e as PointerEvent).getCoalescedEvents?.() ?? []
      for (const ce of evs.length ? evs : [e]) { const q = s2w(ce.clientX - rc.left, ce.clientY - rc.top), p = localPx(stroke!.f, q.x, q.y); strokeTo(stroke!, Math.max(-1, Math.min(stroke!.f.w, p.x)), Math.max(-1, Math.min(stroke!.f.h, p.y))) }
      break
    }
    case 'drag': {
      const rdx = Math.round(w.x - start.wx), rdy = Math.round(w.y - start.wy)
      if (rdx || rdy || dragMoved) { const sn = snapDrag(rdx, rdy, e.ctrlKey || e.metaKey); for (const d of dragStart) if (doc.frames.get(d.f.id) === d.f) doc.moveFrame(d.f, d.x + sn.dx, d.y + sn.dy); dragMoved = true }
      break
    }
    case 'dragcont': if (contDrag) {
      const dx = Math.round(w.x - start.wx), dy = Math.round(w.y - start.wy), cd = contDrag
      cd.c.x = cd.cx + dx; cd.c.y = cd.cy + dy
      cd.frames.forEach((f, i) => doc.moveFrame(f, cd.fpos[i][0] + dx, cd.fpos[i][1] + dy))
      cd.refs.forEach((r, i) => { r.x = cd.rpos[i][0] + dx; r.y = cd.rpos[i][1] + dy })
      dragMoved = dx !== 0 || dy !== 0
    } break
    case 'refmove': if (refDrag) { refDrag.r.x = refDrag.ox + (w.x - start.wx); refDrag.r.y = refDrag.oy + (w.y - start.wy); dragMoved = true } break
  }
  invalidate()
})

function finishDrag() {
  if (mode === 'drag' && dragMoved && dragSnap) {
    const moved = dragStart.map(d => d.f).filter(f => doc.frames.get(f.id) === f)
    reparent(moved); commitSnap(dragSnap, snap(moved, [], [])); touch()
  }
  if (mode === 'dragcont' && contDrag && dragMoved) { commitSnap(contDrag.snap0, snap(contDrag.frames, contDrag.refs, [contDrag.c])); touch() }
  if (mode === 'refmove' && refDrag && dragMoved) { commitSnap(refDrag.snap0, snap([], [refDrag.r], [])); touch() }
  dragSnap = null; contDrag = null; refDrag = null; dragStart = []; guides = { v: [], h: [] }
}
function finishMarquee() {
  const m = mq; mq = null; if (!m) return
  const x0 = Math.min(m.x0, m.x1), y0 = Math.min(m.y0, m.y1), x1 = Math.max(m.x0, m.x1), y1 = Math.max(m.y0, m.y1)
  if ((x1 - x0) * cam.zoom < 4 && (y1 - y0) * cam.zoom < 4) return
  const hits = doc.query(x0, y0, x1, y1)
  selectFrames(m.add ? [...new Set([...selFrames(), ...hits])] : hits)
}
const up = (e: PointerEvent) => {
  const wasGesture = mode === 'gesture'
  ptrs.delete(e.pointerId)
  if (wasGesture) {
    if (ptrs.size < 2) {
      if (performance.now() - gest.t0 < 320 && gest.moved < 14) { doc.undo(); invalidate(); toast('Desfeito (toque com 2 dedos)') }
      snapZoom(); mode = ptrs.size ? 'ignore' : 'none'
    }
    return
  }
  if (mode === 'framedrag' || mode === 'contdrag') finishFrameDrag()
  else if (mode === 'notemove') { if (noteDrag?.moved) { noteDrag.n.x = Math.round(noteDrag.n.x); noteDrag.n.y = Math.round(noteDrag.n.y); commitSnap(noteDrag.snap0, snap([], [], [], false, [noteDrag.n])); touch() } noteDrag = null }
  else if (mode === 'marquee') finishMarquee()
  else if (mode === 'resize') finishResize()
  else if (mode === 'pending') { runPending(); commitStroke() }
  else if (mode === 'tap') runPending('ignore')
  else if (mode === 'stroke') commitStroke()
  else if (mode === 'shape') { commitStroke(); shape = null }
  else if (mode === 'pxsel') { if (pxDrag && !pxDrag.moved) psel = null; pxDrag = null }
  else if (mode === 'pxmove') { if (pxMove?.moved) commitStroke(); else stroke = null; pxMove = null }
  else if (mode === 'drag' || mode === 'dragcont' || mode === 'refmove') finishDrag()
  mode = ptrs.size ? 'ignore' : 'none'
  invalidate(); ui.syncZoom(); ui.panels(true)
}
ov.addEventListener('pointerup', up); ov.addEventListener('pointercancel', up)
ov.addEventListener('pointerleave', () => { if (!ptrs.size) { S.hover = null; invalidate() } })
ov.addEventListener('contextmenu', e => {
  e.preventDefault()
  const rc = ov.getBoundingClientRect(), sx = e.clientX - rc.left, sy = e.clientY - rc.top, w = s2w(sx, sy)
  if (mode === 'gesture' || mode === 'stroke') return
  const f = doc.hit(w.x, w.y)
  if (f && (S.tool === 'pencil' || S.tool === 'eraser')) return   // nos pincéis, o botão direito apaga
  const lb = labelHit(sx, sy)
  if (lb) { if (lb.k === 'f') { const q = doc.frames.get(lb.id)!; if (!selSet.has(q)) selectFrame(q) } else if (lb.k === 'c') selectCont(doc.conts.get(lb.id)!); else if (lb.k === 'n') selectNote(doc.notes.find(q => q.id === lb.id)!); else selectRef(doc.refs.find(q => q.id === lb.id)!) }
  else if (f) { if (!selSet.has(f)) selectFrame(f) }
  else { const nn = noteHitW(w.x, w.y), rr = doc.hitRef(w.x, w.y); if (nn) selectNote(nn); else if (rr) selectRef(rr); else clearSel() }
  ui.panels(true); openContext(e.clientX, e.clientY, w.x, w.y)
})
ov.addEventListener('dblclick', e => {
  const rc = ov.getBoundingClientRect(), sx = e.clientX - rc.left, sy = e.clientY - rc.top
  const nd = labelHit(sx, sy)?.k === 'n' ? null : noteHitW(s2w(sx, sy).x, s2w(sx, sy).y)
  if (nd) { selectNote(nd); ui.editNote(nd.id); return }
  const lb = labelHit(sx, sy)
  if (lb?.k === 'n') { ui.editNote(lb.id); return }
  if (lb) { ui.renameOnStage(lb.k, lb.id, lb.x, lb.y + 2, Math.max(130, lb.w)); return }
  const w = s2w(sx, sy), f = doc.hit(w.x, w.y)
  if (f && S.tool === 'select') focusFrame(f)
})
let wheelAcc = 0, snapT = 0
const snapDeb = () => { clearTimeout(snapT); snapT = window.setTimeout(snapZoom, 160) }
ov.addEventListener('wheel', e => {
  e.preventDefault()
  const rc = ov.getBoundingClientRect(), sx = e.clientX - rc.left, sy = e.clientY - rc.top
  if (e.ctrlKey) { zoomAt(sx, sy, cam.zoom * Math.exp(-e.deltaY * 0.01)); snapDeb(); return }
  if (e.shiftKey || e.deltaX) { cam.x += (e.shiftKey ? e.deltaY : e.deltaX) / cam.zoom; invalidate(); return }
  wheelAcc += e.deltaY
  if (Math.abs(wheelAcc) >= 50) { stepZoom(sx, sy, wheelAcc < 0 ? 1 : -1); wheelAcc = 0 }
}, { passive: false })

// colar imagem: só vale com Ctrl+V de verdade (no Linux o botão do meio também dispara "paste")
let lastPasteKey = 0
let nudgeBefore: Snap | null = null, nudgeTimer = 0, nudgeList: Frame[] = []
window.addEventListener('keydown', e => {
  const tg = e.target as HTMLInputElement
  const typing = tg?.tagName === 'TEXTAREA' || (tg?.tagName === 'INPUT' && !['checkbox', 'range', 'color', 'button', 'file'].includes(tg.type))
  if (typing) { if (e.key === 'Escape' || (e.key === 'Enter' && tg.tagName === 'INPUT')) tg.blur(); return }  // Enter confirma e devolve o foco: Ctrl+Z volta a desfazer o desenho
  if (tg?.tagName === 'SELECT' && !(e.ctrlKey || e.metaKey)) return
  if (tg && (tg.tagName === 'SELECT' || tg.tagName === 'INPUT') && e.key === 'Escape') tg.blur()
  if (e.code === 'Space') { S.spaceDown = true; ov.style.cursor = 'grab'; e.preventDefault(); return }
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey
  if (mod && k === 'v') { lastPasteKey = performance.now(); return }
  if (mod && k === 's') { e.preventDefault(); void saveProject(); return }
  if (mod && k === 'o') { e.preventDefault(); $<HTMLInputElement>('projfile').click(); return }
  if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? doc.redo() : doc.undo(); invalidate(); return }
  if (mod && k === 'y') { e.preventDefault(); doc.redo(); invalidate(); return }
  if (mod && k === 'd') { e.preventDefault(); duplicateSelection(); return }
  if (mod && k === 'a') { e.preventDefault(); selectFrames([...doc.frames.values()].filter(f => !f.hidden)); return }
  if (mod && k === 'g') { e.preventDefault(); if (e.shiftKey) { syncSel(); if (S.selCont) ungroup(S.selCont) } else groupSelection(); return }
  if (e.key === 'F2') { e.preventDefault(); ui.renameSelected(); return }
  if (e.key === 'Escape' && psel) { psel = null; invalidate(); return }
  if (e.key === 'Escape') { if (S.tool === 'frame' || S.tool === 'container' || S.tool === 'anim') setTool('select'); else clearSel(); return }
  if ((e.key === 'Delete' || e.key === 'Backspace') && S.tool === 'marquee' && psel) { e.preventDefault(); pxClear(); return }
  if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelection(); return }
  if (e.shiftKey && (e.key === '!' || e.code === 'Digit1')) { fitAll(); return }
  if (e.shiftKey && (e.key === '@' || e.code === 'Digit2')) { if (S.sel) focusFrame(S.sel); return }
  if (mod && e.shiftKey && k === 'h') { e.preventDefault(); toggleHidden(); return }
  if (mod && e.shiftKey && k === 'l') { e.preventDefault(); toggleLock(); return }
  if (mod && (e.key === ']' || e.key === '[')) { e.preventDefault(); reorder(e.key === ']'); return }
  if (mod && k === 'c') { if (S.tool === 'marquee' && psel) { e.preventDefault(); pxCopy(false) } else if (copyFrames()) e.preventDefault(); return }
  if (mod && k === 'x') { if (S.tool === 'marquee' && psel) { e.preventDefault(); pxCopy(true) } return }
  if (!mod && e.shiftKey && k === 'h') { transformFrames('h'); return }
  if (!mod && e.shiftKey && k === 'v') { transformFrames('v'); return }
  if (!mod && e.shiftKey && k === 'r') { transformFrames('r'); return }
  if ((e.key === 'Delete' || e.key === 'Backspace') && S.tool === 'marquee' && psel) { e.preventDefault(); pxClear(); return }
  if (e.key === '?' || e.key === 'F1') { e.preventDefault(); ui.toggleHelp(); return }
  const map: Record<string, string> = { l: 'line', u: 'rect', o: 'ellipse', m: 'marquee', v: 'select', b: 'pencil', e: 'eraser', g: 'fill', i: 'picker', h: 'hand', f: 'frame', s: 'container', a: 'anim', t: 'note' }
  if (!mod && map[k]) { setTool(map[k]); return }
  if (k === 'x') { S.opt.mirror = !S.opt.mirror; ui.ctxSync(); toast('Espelho ' + (S.opt.mirror ? 'ligado' : 'desligado')); return }
  if (k === '[') { S.brush = Math.max(1, S.brush - 1); ui.ctxSync(); toast('Pincel ' + S.brush + '×' + S.brush); return }
  if (k === ']') { S.brush = Math.min(32, S.brush + 1); ui.ctxSync(); toast('Pincel ' + S.brush + '×' + S.brush); return }
  if (/^[0-9]$/.test(e.key)) { const i = e.key === '0' ? 9 : Number(e.key) - 1, pal = paletteOf(S.sel ?? S.lastSel); if (pal[i]) setColor(hex2rgba(pal[i])); return }
  if (e.key.startsWith('Arrow') && selFrames().length) {
    e.preventDefault(); const d = e.key === 'ArrowLeft' ? [-1, 0] : e.key === 'ArrowRight' ? [1, 0] : e.key === 'ArrowUp' ? [0, -1] : [0, 1]
    const list = selFrames(); if (!nudgeBefore) { nudgeBefore = snap(list, [], []); nudgeList = list }
    for (const f of list) doc.moveFrame(f, f.x + d[0], f.y + d[1])
    clearTimeout(nudgeTimer); nudgeTimer = window.setTimeout(() => { if (nudgeBefore) commitSnap(nudgeBefore, snap(nudgeList.filter(f => doc.frames.get(f.id) === f), [], [])); nudgeBefore = null }, 500) // várias setas = um passo no histórico
    invalidate()
  }
})
window.addEventListener('keyup', e => { if (e.code === 'Space') { S.spaceDown = false; ui.toolChanged(S.tool) } })
window.addEventListener('dragover', e => e.preventDefault())
window.addEventListener('drop', e => { e.preventDefault(); const f = [...(e.dataTransfer?.files ?? [])].find(x => x.type.startsWith('image/')); if (f) void loadImage(f, f.name) })
window.addEventListener('paste', e => {
  if (performance.now() - lastPasteKey > 1500) return   // ignora colagens que não vieram do teclado (ex.: botão do meio)
  const it = [...(e.clipboardData?.items ?? [])].find(x => x.type.startsWith('image/')); const f = it?.getAsFile()
  if (f) { void loadImage(f, 'colado'); return }
  if (lastCopied === 'px' && pxClip) pxPaste(); else pasteFrames()
})

// ================================================================ sobreposição 2D (grade, seleção, nomes, alças)
const ACC = '#4de3b5', ACC_INK = '#07201a', REFC = '#ffb454', MUT = '#8d93a5'
function label(text: string, x: number, y: number, fg: string, bg: string | null, reg?: { k: 'f' | 'c' | 'r' | 'n'; id: number }, maxW = 9999) {
  octx.font = '600 12px "Geist Variable", system-ui, sans-serif'; octx.textBaseline = 'middle'
  let t = text; while (t.length > 3 && octx.measureText(t).width > maxW - 14) t = t.slice(0, -2)
  if (t !== text) t = t.trimEnd() + '…'
  const w = Math.ceil(octx.measureText(t).width) + 14, h = 20, X = Math.round(x), Y = Math.round(y - h)
  if (bg) { octx.fillStyle = bg; octx.beginPath(); octx.roundRect(X, Y, w, h, 6); octx.fill() }
  octx.fillStyle = fg; octx.fillText(t, X + 7, Y + h / 2 + 0.5)
  if (reg) labelRects.push({ k: reg.k, id: reg.id, x: X - 2, y: Y - 2, w: w + 4, h: h + 6 })
}
function handle(cx: number, cy: number) { octx.fillStyle = '#fff'; octx.strokeStyle = ACC; octx.lineWidth = 1.5; octx.beginPath(); octx.rect(Math.round(cx) - 4, Math.round(cy) - 4, 8, 8); octx.fill(); octx.stroke() }
function rectPx(o: Box) { const a = w2s(o.x, o.y); return { x: Math.round(a.x), y: Math.round(a.y), w: Math.round(o.w * cam.zoom), h: Math.round(o.h * cam.zoom) } }
function drawNote(n: Note) {
  const r = rectPx(n), on = S.selNote === n
  if (r.x > cssW || r.y > cssH || r.x + r.w < 0 || r.y + r.h < 0) return
  octx.save(); octx.shadowColor = 'rgba(0,0,0,0.35)'; octx.shadowBlur = Math.min(14, 3 + cam.zoom); octx.shadowOffsetY = 2
  octx.fillStyle = n.color; octx.beginPath(); octx.roundRect(r.x, r.y, r.w, r.h, Math.min(10, cam.zoom * 0.6)); octx.fill(); octx.restore()
  if (ui.editingNote() !== n.id) {
    const fs = Math.max(1, n.size * cam.zoom), pad = fs * 0.6
    if (fs >= 4) {
      octx.save(); octx.beginPath(); octx.rect(r.x, r.y, r.w, r.h); octx.clip()
      octx.font = `500 ${fs}px "Geist Variable", system-ui, sans-serif`; octx.textBaseline = 'top'; octx.fillStyle = n.text ? '#1b1d24' : 'rgba(27,29,36,0.45)'
      let y = r.y + pad; const maxW = r.w - pad * 2
      for (const para of (n.text || 'Nota vazia').split('\n')) {
        let line = ''
        for (const word of para.split(' ')) { const t = line ? line + ' ' + word : word; if (octx.measureText(t).width > maxW && line) { octx.fillText(line, r.x + pad, y); y += fs * 1.4; line = word } else line = t }
        octx.fillText(line, r.x + pad, y); y += fs * 1.4
      }
      octx.restore()
    }
  }
  if (on) { octx.strokeStyle = ACC; octx.lineWidth = 2; octx.strokeRect(r.x, r.y, r.w, r.h); for (const p of Object.values(handlePoints(n, false))) handle(p[0], p[1]) }
  label((n.text.split('\n')[0] || 'Nota').slice(0, 30), r.x, r.y - 4, on ? ACC : MUT, null, { k: 'n', id: n.id }, Math.max(90, r.w))
}
let onion: { id: number; up: number; cv: HTMLCanvasElement } | null = null
function drawOverlay() {
  syncSel()
  const dpr = R.dpr
  octx.setTransform(dpr, 0, 0, dpr, 0, 0); octx.clearRect(0, 0, cssW, cssH)
  labelRects = []
  const z = cam.zoom, vr = R.viewRect(cam)
  { let step = 16; while (step * z < 28) step *= 2   // grade de "+" no fundo, discreta
    const x0 = Math.floor(vr.minx / step) * step, y0 = Math.floor(vr.miny / step) * step
    octx.fillStyle = 'rgba(141,147,165,0.2)'
    for (let wx = x0; wx <= vr.maxx; wx += step) for (let wy = y0; wy <= vr.maxy; wy += step) { if (R.visible < 300 && (doc.hit(wx + 0.01, wy + 0.01) || doc.hitRef(wx + 0.01, wy + 0.01))) continue; const p = w2s(wx, wy), X = Math.round(p.x), Y = Math.round(p.y); octx.fillRect(X - 3, Y, 7, 1); octx.fillRect(X, Y - 3, 1, 7) } }
  for (const c of doc.conts.values()) { // contêineres
    if (c.x > vr.maxx || c.x + c.w < vr.minx || c.y > vr.maxy || c.y + c.h < vr.miny) continue
    const r = rectPx(c), on = S.selCont === c
    octx.strokeStyle = on ? ACC : 'rgba(141,147,165,0.55)'; octx.lineWidth = on ? 2 : 1; octx.setLineDash(on ? [] : [6, 4]); octx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h); octx.setLineDash([])
    label(cname(c), r.x, r.y - 4, on ? ACC_INK : '#cfd3de', on ? ACC : '#2a2c37', { k: 'c', id: c.id }, Math.max(80, r.w))
    if (on) for (const p of Object.values(handlePoints(c, false))) handle(p[0], p[1])
  }
  const hf = S.hover ? doc.hit(S.hover.wx, S.hover.wy) : null
  const gridFrames = new Set<Frame>(selSet); if (hf) gridFrames.add(hf)
  if (z >= 10) for (const f of gridFrames) {
    if (f.w * f.h > 40000) continue
    const a = w2s(f.x, f.y); octx.strokeStyle = 'rgba(255,255,255,0.10)'; octx.lineWidth = 1; octx.beginPath()
    for (let i = 1; i < f.w; i++) { const x = Math.round(a.x + i * z) + 0.5; octx.moveTo(x, a.y); octx.lineTo(x, a.y + f.h * z) }
    for (let j = 1; j < f.h; j++) { const y = Math.round(a.y + j * z) + 0.5; octx.moveTo(a.x, y); octx.lineTo(a.x + f.w * z, y) }
    octx.stroke()
  }
  const near = doc.query(vr.minx, vr.miny, vr.maxx, vr.maxy)   // nomes dos quadros (clicáveis)
  if (z >= 1 && near.length <= 150) for (const f of near) { const a = rectPx(f); label(fname(f), a.x, a.y - 4, selSet.has(f) ? ACC : MUT, null, { k: 'f', id: f.id }, Math.max(70, a.w)) }
  else for (const f of selSet) { const a = rectPx(f); label(fname(f), a.x, a.y - 4, ACC, null, { k: 'f', id: f.id }, Math.max(70, a.w)) }
  for (const f of selSet) { const a = rectPx(f); octx.strokeStyle = ACC; octx.lineWidth = 2; octx.strokeRect(a.x - 1, a.y - 1, a.w + 2, a.h + 2) }
  if (selSet.size === 1 && S.sel && !(rs && rs.kind === 'f')) {
    const f = S.sel, a = rectPx(f)
    for (const p of Object.values(handlePoints(f, false))) handle(p[0], p[1])
    label(`${f.w} × ${f.h}`, a.x + a.w / 2 - 28, a.y + a.h + 30, ACC_INK, ACC)
  } else if (selSet.size > 1) {
    const a = rectPx(boundsOf([...selSet]))
    octx.strokeStyle = ACC; octx.lineWidth = 1; octx.setLineDash([5, 4]); octx.strokeRect(a.x - 4.5, a.y - 4.5, a.w + 9, a.h + 9); octx.setLineDash([])
    label(`${selSet.size} quadros`, a.x + a.w / 2 - 30, a.y + a.h + 30, ACC_INK, ACC)
  }
  if (rs) { const a = rectPx(rs.n), c = rs.kind === 'r' ? REFC : ACC; octx.strokeStyle = c; octx.lineWidth = 2; octx.setLineDash([6, 4]); octx.strokeRect(a.x, a.y, a.w, a.h); octx.setLineDash([]); label(`${Math.round(rs.n.w)} × ${Math.round(rs.n.h)}`, a.x + a.w / 2 - 28, a.y + a.h + 30, ACC_INK, c) }
  if (fdrag) {
    const o = { x: Math.min(fdrag.x0, fdrag.x1), y: Math.min(fdrag.y0, fdrag.y1), w: Math.abs(fdrag.x1 - fdrag.x0), h: Math.abs(fdrag.y1 - fdrag.y0) }, a = rectPx(o)
    octx.fillStyle = 'rgba(77,227,181,0.10)'; octx.fillRect(a.x, a.y, a.w, a.h)
    octx.strokeStyle = ACC; octx.lineWidth = 2; octx.strokeRect(a.x, a.y, a.w, a.h)
    label(`${o.w} × ${o.h}`, a.x + a.w / 2 - 28, a.y + a.h + 30, ACC_INK, ACC)
  }
  if (mq) { const a = rectPx({ x: Math.min(mq.x0, mq.x1), y: Math.min(mq.y0, mq.y1), w: Math.abs(mq.x1 - mq.x0), h: Math.abs(mq.y1 - mq.y0) }); octx.fillStyle = 'rgba(77,227,181,0.08)'; octx.fillRect(a.x, a.y, a.w, a.h); octx.strokeStyle = ACC; octx.lineWidth = 1; octx.strokeRect(a.x + 0.5, a.y + 0.5, a.w, a.h) }
  for (const r of doc.refs) { // imagens de referência
    if (r.hidden || r.x > vr.maxx || r.x + r.w < vr.minx || r.y > vr.maxy || r.y + r.h < vr.miny) continue
    const a = rectPx(r), on = S.selRef === r
    if (on) { octx.strokeStyle = REFC; octx.lineWidth = 2; octx.setLineDash([6, 4]); octx.strokeRect(a.x, a.y, a.w, a.h); octx.setLineDash([]); if (!r.locked) for (const p of Object.values(handlePoints(r, true))) handle(p[0], p[1]) }
    label(r.name + (r.locked ? ' · bloqueada' : ''), a.x, a.y - 4, on ? REFC : MUT, null, { k: 'r', id: r.id }, Math.max(90, a.w))
  }
  if (S.opt.onion && S.sel && S.sel.parent !== undefined && selSet.size === 1) {
    const c = doc.conts.get(S.sel.parent), list = c ? animFrames(c) : [], i = list.indexOf(S.sel), prev = i > 0 ? list[i - 1] : null
    if (prev && prev.w === S.sel.w && prev.h === S.sel.h && prev.w * prev.h <= 262144) {
      if (!onion || onion.id !== prev.id || onion.up !== R.uploadCount) { const cv = document.createElement('canvas'); cv.width = prev.w; cv.height = prev.h; const id = new ImageData(prev.w, prev.h); id.data.set(prev.px); cv.getContext('2d')!.putImageData(id, 0, 0); onion = { id: prev.id, up: R.uploadCount, cv } }
      const a = rectPx(S.sel); octx.save(); octx.imageSmoothingEnabled = false; octx.globalAlpha = 0.35; octx.drawImage(onion.cv, a.x, a.y, a.w, a.h); octx.restore()
    }
  }
  octx.save(); octx.lineWidth = 1; octx.strokeStyle = '#ff4d8d'
  for (const g of guides.v) { const a = w2s(g.x, g.a), b = w2s(g.x, g.b), x = Math.round(a.x) + 0.5; octx.beginPath(); octx.moveTo(x, a.y); octx.lineTo(x, b.y); octx.stroke() }
  for (const g of guides.h) { const a = w2s(g.a, g.y), b = w2s(g.b, g.y), y = Math.round(a.y) + 0.5; octx.beginPath(); octx.moveTo(a.x, y); octx.lineTo(b.x, y); octx.stroke() }
  octx.restore()
  if (psel && doc.frames.get(psel.f.id) === psel.f) {
    const a = rectPx({ x: psel.f.x + psel.x, y: psel.f.y + psel.y, w: psel.w, h: psel.h })
    octx.lineWidth = 1; octx.setLineDash([5, 4]); octx.strokeStyle = '#000'; octx.strokeRect(a.x + 0.5, a.y + 0.5, a.w, a.h); octx.lineDashOffset = 4.5; octx.strokeStyle = '#fff'; octx.strokeRect(a.x + 0.5, a.y + 0.5, a.w, a.h); octx.setLineDash([]); octx.lineDashOffset = 0
    label(`${psel.w} × ${psel.h}`, a.x, a.y + a.h + 24, ACC_INK, ACC)
  }
  for (const n of doc.notes) drawNote(n)
  if (S.hover && hf && ['pencil', 'eraser', 'line', 'rect', 'ellipse'].includes(S.tool) && !S.spaceDown) {
    const p = localPx(hf, S.hover.wx, S.hover.wy), half = Math.floor((S.brush - 1) / 2), a = w2s(hf.x + p.x - half, hf.y + p.y - half)
    octx.strokeStyle = '#fff'; octx.lineWidth = 1; octx.strokeRect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, S.brush * z - 1, S.brush * z - 1)
    if (S.tool === 'pencil') { octx.fillStyle = `rgba(${S.color[0]},${S.color[1]},${S.color[2]},0.55)`; octx.fillRect(a.x, a.y, S.brush * z, S.brush * z) }
  }
}

// ================================================================ ferramentas, cor e interface (ui.ts)
function toast(msg: string) { ui.toast(msg) }
function setColor(c: number[]) { S.color = c; ui.colorChanged() }
function setTool(t: string) { if (t !== 'marquee') psel = null; S.tool = t; ui.toolChanged(t) }

// ================================================================ estresse e medição
const rnd = (() => { let s = 123456789; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) })()
function spawn(n: number) {
  const t0 = performance.now()
  doc.clearFrames(); clearSel()
  const cols = Math.ceil(Math.sqrt(n)), step = 20
  const touched = new Set<string>()
  for (let i = 0; i < n; i++) {
    const f = doc.addFrame((i % cols) * step, Math.floor(i / cols) * step, 16, 16)
    const a = hex2rgba(PALETTE[1 + Math.floor(rnd() * 14)]), b = hex2rgba(PALETTE[1 + Math.floor(rnd() * 14)])
    for (let y = 1; y < 15; y++) for (let x = 1; x < 8; x++) {
      const r = rnd(); if (r < 0.45) continue
      const c = r < 0.75 ? a : b, o = (y * 16 + x) * 4, o2 = (y * 16 + 15 - x) * 4
      f.px.set(c, o); f.px.set(c, o2)
    }
    touched.add(f.cls + ':' + f.page)
  }
  for (const k of touched) { const [c, p] = k.split(':').map(Number); R.uploadPage(doc, c as 16, p, doc.pages[c as 16][p].used) }
  fitAll(false); invalidate()
  toast(`${n.toLocaleString('pt-BR')} quadros criados em ${Math.round(performance.now() - t0)} ms`)
}
function pct(a: number[], p: number) { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0 }
async function runBench(seconds = 10) {
  if (benchOn) return
  if (!doc.frames.size) spawn(5000)
  const b = doc.bounds()!, saved = { ...cam }, N = doc.frames.size
  const zFit = Math.min(cssW / b.w, cssH / b.h) * 0.9
  continuous = true; benchOn = true; benchDt.length = 0; benchCost.length = 0; anim = null
  const t0 = performance.now(); let visSum = 0, visN = 0
  await new Promise<void>(res => {
    const step = () => {
      const u = (performance.now() - t0) / (seconds * 1000)
      if (u >= 1) return res()
      const zoomK = (1 - Math.cos(u * Math.PI * 4)) / 2
      cam.zoom = Math.exp(Math.log(zFit) + (Math.log(16) - Math.log(zFit)) * zoomK)
      cam.x = b.x + b.w / 2 + b.w * 0.33 * Math.sin(u * Math.PI * 2.6)
      cam.y = b.y + b.h / 2 + b.h * 0.33 * Math.cos(u * Math.PI * 2.0)
      visSum += R.visible; visN++
      invalidate(); requestAnimationFrame(step)
    }
    step()
  })
  benchOn = false; continuous = false
  const costs = benchCost.slice(2), dts = benchDt.slice(2), avg = dts.reduce((a, c) => a + c, 0) / Math.max(1, dts.length)
  const result = {
    quando: new Date().toISOString(), quadros: N, segundos: seconds, amostras: dts.length,
    fps_medio: +(1000 / avg).toFixed(1), ms_medio: +avg.toFixed(2), ms_p50: +pct(dts, 50).toFixed(2), ms_p95: +pct(dts, 95).toFixed(2), ms_p99: +pct(dts, 99).toFixed(2), ms_max: +Math.max(...dts).toFixed(1),
    quadros_acima_de_20ms: dts.filter(d => d > 20).length, quadros_acima_de_33ms: dts.filter(d => d > 33).length,
    custo_ms_medio: +(costs.reduce((a, c) => a + c, 0) / Math.max(1, costs.length)).toFixed(2), custo_ms_p95: +pct(costs, 95).toFixed(2), custo_ms_p99: +pct(costs, 99).toFixed(2), custo_ms_max: +Math.max(...costs).toFixed(1),
    capacidade_fps: +(1000 / (costs.reduce((a, c) => a + c, 0) / Math.max(1, costs.length))).toFixed(0),
    visiveis_medio: Math.round(visSum / Math.max(1, visN)), chamadas_de_desenho: R.drawCalls, cpu_ms_por_render: +cpuMs.toFixed(2),
    dpr: R.dpr, tela: `${cssW}x${cssH}`, gpu: R.rendererName, ua: navigator.userAgent
  }
  cam = saved; invalidate(); ui.syncZoom()
  $('benchout').innerHTML = `<b>${result.fps_medio} fps</b> na tela · custo por quadro: médio ${result.custo_ms_medio} ms, p95 ${result.custo_ms_p95} ms, pior ${result.custo_ms_max} ms (cabe ${result.capacidade_fps} fps) · ${result.quadros_acima_de_20ms} quadros acima de 20 ms · ${N.toLocaleString('pt-BR')} quadros`
  try { navigator.sendBeacon('/__bench', JSON.stringify(result)) } catch { /* sem servidor */ }
  ;(window as any).__benchResult = result
  return result
}
const perfInfo = () => ({ fps: renderTimes.length > 1 ? renderTimes.length : 0, idle: !dirty && !continuous && renderTimes.length <= 1, cpuMs, visible: R.visible, calls: R.drawCalls, gpu: R.rendererName, zoom: cam.zoom })

// ================================================================ início
const ui = initUI({
  doc, S, selSet, store, hex2rgba, hexOf, PALETTE,
  core: {
    invalidate, touch, syncSel, selFrames, selectFrame, selectFrames, selectRef, selectCont, clearSel, selectNote, snap, commitSnap, change,
    fname, cname, flyTo, focusFrame, fitRect, fitAll, stepZoom, snapZoom, getCam: () => cam, stageSize: () => ({ w: cssW, h: cssH }),
    placeFrame, setLastPreset: (w: number, h: number) => { lastPreset = { w, h } }, deleteSelection, duplicateSelection, groupSelection, ungroup, fitContainer, reshapeFrame,
    layerAdd, layerDup, layerDel, layerMove, layerToggle, layerRename, layerSetActive, loadImage, demoImage, removeRef, traceFit, pixelateRef, pinRef,
    openContext, uploadCount: () => R.uploadCount, frameColors, recolorFrames, recolorBegin, recolorEnd, alignFrames, distributeFrames, layersState, layerOpacityLive, layerCommit, layerMergeDown, layerReorder, importAseprite, sliceSheet, importPaletteFile, extractPalette, newAnimation, setAnimOrder, setAnim, exportGodot, importProjectFile, newWorkspace: () => void createWorkspace(), goHome, renameWs, exportPng, exportAs, animFrames, exportGif, exportAseAnim, animAddFrame, animSame, saveProject, openProject, copyPng, exportScale, removeNote, NOTE_COLORS, setTool, setColor, toast, paletteById, paletteOf, boundsOf, spawn, runBench, perfInfo, w2s, hit: () => labelRects
  }
})

// ================================================================ espaços de trabalho (tela inicial), salvamento e colaboração
const noAuto = /[?&](auto|fresh)=/.test(location.search)   // modo de teste: abre direto o editor, sem salvar
let wsMeta: W.WsMeta | null = null, saving = false, lastSaveKey = ''
const setView = (v: 'home' | 'editor') => { document.body.dataset.view = v; $('home').hidden = v !== 'home'; if (v === 'editor') requestAnimationFrame(() => { resize(); invalidate() }) }
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function buildThumb(): string | undefined {
  const b = doc.bounds(); if (!b) return undefined
  const tw = 320, th = 200, k = Math.min(tw / b.w, th / b.h) * 0.9, cv = document.createElement('canvas'); cv.width = tw; cv.height = th
  const g = cv.getContext('2d')!; g.imageSmoothingEnabled = false
  const ox = (tw - b.w * k) / 2 - b.x * k, oy = (th - b.h * k) / 2 - b.y * k
  const list = [...doc.frames.values()].filter(f => !f.hidden)
  for (const f of list) {
    g.fillStyle = f.bg ?? '#2a2c37'; g.fillRect(ox + f.x * k, oy + f.y * k, f.w * k, f.h * k)
    if (list.length > 300 || f.w * f.h > 262144) continue
    const t = document.createElement('canvas'); t.width = f.w; t.height = f.h; const id = new ImageData(f.w, f.h); id.data.set(f.px); t.getContext('2d')!.putImageData(id, 0, 0)
    g.drawImage(t, ox + f.x * k, oy + f.y * k, f.w * k, f.h * k)
  }
  return cv.toDataURL('image/png')
}
async function autosave(force = false) {
  if (noAuto || saving || !wsMeta) return
  const key = doc.version + ':' + R.uploadCount + ':' + doc.frames.size
  if (!force && key === lastSaveKey) return
  if (!force && mode !== 'none' && mode !== 'ignore') return
  saving = true; lastSaveKey = key
  try {
    const blob = await serializeProject(doc, { mine: S.mine, defaultPal: S.defaultPal })
    wsMeta = { ...wsMeta, updated: Date.now(), frames: doc.frames.size, thumb: buildThumb() }
    await W.putWs(wsMeta, blob); ui.saved(new Date())
  } catch { /* sem armazenamento */ }
  saving = false
}
setInterval(() => void autosave(), 2000)
window.addEventListener('pagehide', () => void autosave(true))
async function leaveCurrent() { if (!wsMeta) return; while (saving) await sleep(40); await autosave(true); while (saving) await sleep(40); void 0 }

function makeStarterWorkspace() { makeStarter(); cam = { x: 0, y: 0, zoom: Math.max(1, Math.floor(Math.min(cssW, cssH) / 24)) } }
async function enterWorkspace(id: string) {
  const meta = await W.getMeta(id)
  if (!meta) { toast('Espaço de trabalho não encontrado.'); location.hash = '#/'; return }
  await leaveCurrent()
  resetDoc(); doc.clearHistory()
  const blob = await W.getBlob(id)
  wsMeta = meta; lastSaveKey = ''
  setView('editor'); resize()
  if (blob) { await openProject(blob, true); lastSaveKey = doc.version + ':' + R.uploadCount + ':' + doc.frames.size } else makeStarterWorkspace()
  ui.setWsName(meta.name); invalidate()
}
async function showHome() {
  await leaveCurrent(); wsMeta = null; setView('home')
  const old = await W.legacyAutosave().catch(() => undefined)   // projeto salvo antes da tela inicial existir
  if (old && !(await W.listWs()).length) { const now = Date.now(); await W.putWs({ id: W.newId(), name: 'Projeto recuperado', created: now, updated: now, frames: 0 }, old); await W.dropLegacy() }
  await home.refresh()
}
async function createWorkspace() {
  const list = await W.listWs(), now = Date.now(), id = W.newId()
  let n = 1; const names = new Set(list.map(m => m.name)); let name = 'Sem título'; while (names.has(name)) name = `Sem título ${++n}`
  await W.putWs({ id, name, created: now, updated: now, frames: 0 }); location.hash = '#/w/' + id
}
function goHome() { location.hash = '#/' }
function renameWs(name: string) {
  name = name.trim() || 'Sem título'; ui.setWsName(name)
  if (wsMeta) { wsMeta = { ...wsMeta, name }; void W.putMeta(wsMeta) }
}
async function importProjectFile(f: File) {
  try { await parseProject(f) } catch (e) { toast('Não consegui abrir: ' + (e as Error).message); return }
  const now = Date.now(), id = W.newId()
  await W.putWs({ id, name: f.name.replace(/\.[^.]+$/, ''), created: now, updated: now, frames: 0 }, f); location.hash = '#/w/' + id
}
const players = initPlayers({ doc, stage: $('stage'), animFrames, cname, w2s, stageSize: () => ({ w: cssW, h: cssH }), zoom: () => cam.zoom, uploads: () => R.uploadCount, touch, hex2rgba, reorder: setAnimOrder, pick: f => selectFrame(f) })
const home = initHome({
  list: W.listWs, open: id => { location.hash = '#/w/' + id }, create: () => void createWorkspace(),
  rename: async (id, name) => { const m = await W.getMeta(id); if (m) { await W.putMeta({ ...m, name }); await home.refresh() } },
  duplicate: async id => { const m = await W.getMeta(id), b = await W.getBlob(id); if (!m) return; const now = Date.now(); await W.putWs({ ...m, id: W.newId(), name: m.name + ' (cópia)', created: now, updated: now }, b); await home.refresh() },
  remove: async id => { await W.delWs(id); await home.refresh() },
  download: async id => { const m = await W.getMeta(id), b = await W.getBlob(id); if (m && b) download(b, `${m.name.replace(/[^\p{L}\p{N}\- ]+/gu, '').trim().replace(/\s+/g, '-') || 'projeto'}.kixel`); else toast('Esse espaço ainda não tem nada salvo.') },
  importFile: f => void importProjectFile(f),
  menu: (x, y, items) => ui.showMenu(x, y, items)
})
async function route() {
  const w = location.hash.match(/^#\/w\/([\w]+)/)
  if (w) await enterWorkspace(w[1]); else await showHome()
}
if (noAuto) setView('editor'); else { window.addEventListener('hashchange', () => void route()); void route() }
resize()
void document.fonts.load('600 12px "Geist Variable"').then(() => invalidate())
function makeStarter() {
  const f = newFrame(-8, -8, 16, 16, false); selectFrame(f)
  const rows = ['................', '.....bbbbbb.....', '....bffffffb....', '...bffeffeffb...', '...bffeffeffb...', '...bffffffffb...', '...bfrrffrrfb...', '....bfrrrrfb....', '.....bbbbbb.....']
  const cmap: Record<string, string> = { b: PALETTE[0], f: PALETTE[4], e: PALETTE[0], r: PALETTE[2] }
  rows.forEach((row, y) => [...row].forEach((ch, x) => { const c = cmap[ch]; if (c) f.px.set(hex2rgba(c), ((y + 3) * 16 + x) * 4) }))
  R.upload(doc, f); doc.clearHistory()
}
makeStarter()
setTool('pencil'); ui.init()
cam = { x: 0, y: 0, zoom: Math.max(1, Math.floor(Math.min(cssW, cssH) / 24)) }
;(window as any).__app = { R, doc, get cam() { return cam }, spawn, fitAll, newFrame, setTool, demoImage, selSet, S, ui, createContainer, groupSelection, reshapeFrame, layerAdd, selectFrame, selectFrames, selectRef, selectNote, selectCont, loadImage, addImage, runBench }
;(window as any).__runBench = runBench
requestAnimationFrame(tick)
{
  const q = new URLSearchParams(location.search), n = Number(q.get('auto'))
  if (n > 0) { spawn(n); setTimeout(async () => { await runBench(Number(q.get('s')) || 10); document.title = 'bench-pronto' }, 1500) }
  else toast('Dica: B lápis · E borracha · G balde · F quadro · S contêiner · Shift + clique seleciona vários · Espaço move a tela.')
}
