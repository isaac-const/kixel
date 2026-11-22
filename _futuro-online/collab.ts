// Colaboração em tempo real: cada objeto (quadro, contêiner, nota, imagem) é enviado inteiro quando muda; o último a gravar vence.
import type { Doc, Frame } from './doc'
import { b64, unb64 } from './exporters'

export type Peer = { id: string; name: string; color: string }
export type CollabCtx = {
  doc: Doc
  R: { upload(doc: Doc, f: Frame): void; freeFrame(doc: Doc, f: Frame): void; dropRef(r: any): void; uploadCount: number }
  resetDoc(): void; invalidate(): void; touch(): void; onStatus(): void
  loadCanvas(url: string): Promise<HTMLCanvasElement>
}

const hashBuf = (u: Uint8Array) => {
  let h = 2166136261
  if (u.byteOffset % 4 === 0 && u.byteLength % 4 === 0) { const w = new Uint32Array(u.buffer, u.byteOffset, u.byteLength >> 2); for (let i = 0; i < w.length; i++) h = Math.imul(h ^ w[i], 16777619) }
  else for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u[i], 16777619)
  return h >>> 0
}

export function createCollab(c: CollabCtx) {
  const { doc, R } = c
  let ws: WebSocket | null = null, room: string | null = null, name = 'Convidado', selfId = '', color = '#4de3b5'
  let peers: Peer[] = [], ready = false, retry = 0
  const cursors = new Map<string, { x: number; y: number; t: number }>()
  const sent = new Map<string, string>(), imgSent = new Set<number>()
  let sentZ = '', lastUp = -1, lastVer = -1, lastCur = 0

  const send = (o: unknown) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)) }
  const frameMeta = (f: Frame) => ({ x: f.x, y: f.y, w: f.w, h: f.h, name: f.name, bg: f.bg, palId: f.palId, parent: f.parent, hidden: f.hidden, trace: f.trace, activeLayer: f.activeLayer, dur: f.dur })
  const frameSig = (f: Frame) => JSON.stringify(frameMeta(f)) + '|' + (f.layers ? f.layers.map(l => l.id + ':' + l.name + ':' + l.vis + ':' + (l.op ?? 1) + ':' + hashBuf(l.px)).join(',') : hashBuf(f.px))
  const frameData = (f: Frame) => ({ ...frameMeta(f), ...(f.layers ? { layers: f.layers.map(l => ({ id: l.id, name: l.name, vis: l.vis, op: l.op, px: b64(l.px) })) } : { px: b64(f.px) }) })
  const refMeta = (r: any) => ({ name: r.name, x: r.x, y: r.y, w: r.w, h: r.h, opacity: r.opacity, locked: r.locked, above: r.above, hidden: r.hidden, parent: r.parent })

  /** Olha o que mudou desde a última vez e manda só isso. */
  function scan() {
    if (!ready || !ws) return
    if (R.uploadCount === lastUp && doc.version === lastVer) return
    lastUp = R.uploadCount; lastVer = doc.version
    const live = new Set<string>()
    const put = (k: string, id: number, sig: string, d: unknown) => { const key = k + ':' + id; live.add(key); if (sent.get(key) !== sig) { sent.set(key, sig); send({ t: 'put', k, id, d }) } }
    for (const f of doc.frames.values()) { const sig = frameSig(f), key = 'f:' + f.id; live.add(key); if (sent.get(key) !== sig) { sent.set(key, sig); send({ t: 'put', k: 'f', id: f.id, d: frameData(f) }) } }
    for (const k of doc.conts.values()) put('c', k.id, JSON.stringify(k), k)
    for (const n of doc.notes) put('n', n.id, JSON.stringify(n), n)
    for (const r of doc.refs) { const meta = refMeta(r), sig = JSON.stringify(meta), key = 'r:' + r.id; live.add(key); if (sent.get(key) !== sig || !imgSent.has(r.id)) { sent.set(key, sig); send({ t: 'put', k: 'r', id: r.id, d: imgSent.has(r.id) ? meta : { ...meta, image: r.src.toDataURL('image/png') } }); imgSent.add(r.id) } }
    for (const key of [...sent.keys()]) if (!live.has(key)) { sent.delete(key); const [k, id] = key.split(':'); send({ t: 'del', k, id: Number(id) }) }
    const z = JSON.stringify(doc.zorder); if (z !== sentZ) { sentZ = z; send({ t: 'z', z: doc.zorder }) }
  }

  async function applyPut(m: { k: string; id: number; d: any }) {
    const { k, id, d } = m
    if (k === 'f') {
      let f = doc.frames.get(id)
      if (!f) f = doc.addFrame(d.x, d.y, d.w, d.h, id)
      else if (f.w !== d.w || f.h !== d.h) { R.freeFrame(doc, f); doc.setShape(f, d.x, d.y, d.w, d.h) }
      else if (f.x !== d.x || f.y !== d.y) doc.moveFrame(f, d.x, d.y)
      Object.assign(f, { name: d.name, bg: d.bg, palId: d.palId, parent: d.parent, hidden: d.hidden, trace: !!d.trace, activeLayer: d.activeLayer ?? 1, dur: d.dur })
      if (d.layers) { f.layers = d.layers.map((l: any) => ({ id: l.id, name: l.name, vis: l.vis, op: l.op, px: unb64(l.px) })); doc.composite(f) }
      else { f.layers = undefined; f.px.set(unb64(d.px)) }
      R.upload(doc, f); sent.set('f:' + id, frameSig(f))
    } else if (k === 'c') {
      const e = doc.conts.get(id); if (e) Object.assign(e, d); else { const n = doc.addCont(d.x, d.y, d.w, d.h, d.name, id); n.collapsed = d.collapsed }
      sent.set('c:' + id, JSON.stringify(doc.conts.get(id)))
    } else if (k === 'n') {
      const e = doc.notes.find(q => q.id === id); if (e) Object.assign(e, d); else doc.addNote(d.x, d.y, d.text, d.color, id, d.w, d.h, d.size)
      sent.set('n:' + id, JSON.stringify(doc.notes.find(q => q.id === id)))
    } else if (k === 'r') {
      let r = doc.refs.find(q => q.id === id)
      if (!r) {
        if (!d.image) return
        const cv = await c.loadCanvas(d.image); r = doc.addRef(cv, d.name, d.x, d.y, d.w, d.h)
        doc.dropKey('r:' + r.id); r.id = id; doc.zorder.push('r:' + id); imgSent.add(id)
      }
      Object.assign(r, refMeta(d)); sent.set('r:' + id, JSON.stringify(refMeta(r)))
    }
  }
  function applyDel(k: string, id: number) {
    sent.delete(k + ':' + id)
    if (k === 'f') { const f = doc.frames.get(id); if (f) { doc.removeFrame(f); R.freeFrame(doc, f) } }
    else if (k === 'c') { const e = doc.conts.get(id); if (e) doc.removeCont(e) }
    else if (k === 'n') { const e = doc.notes.find(q => q.id === id); if (e) doc.removeNote(e) }
    else if (k === 'r') { const e = doc.refs.find(q => q.id === id); if (e) { doc.removeRef(e); R.dropRef(e) } }
  }
  function applyZ(z: string[]) {
    const have = (key: string) => { const id = Number(key.slice(2)); return key[0] === 'f' ? doc.frames.has(id) : key[0] === 'c' ? doc.conts.has(id) : key[0] === 'n' ? doc.notes.some(n => n.id === id) : doc.refs.some(r => r.id === id) }
    const next = z.filter(have), all = [...doc.zorder]
    for (const key of all) if (!next.includes(key) && have(key)) next.push(key)
    doc.zorder = next; sentZ = JSON.stringify(doc.zorder)
  }

  async function onMessage(m: any) {
    if (m.t === 'state') {
      selfId = m.id; color = m.color; peers = m.peers
      if (m.empty) { sent.clear(); imgSent.clear(); sentZ = '' }
      else {
        c.resetDoc(); sent.clear(); imgSent.clear()
        for (const o of m.objs) await applyPut(o)
        if (m.z) applyZ(m.z)
      }
      doc.nextId = Math.max(doc.nextId, m.you * 1_000_000); doc.nextLayer = Math.max(doc.nextLayer, m.you * 1_000_000)
      ready = true; lastUp = -1; lastVer = -1; retry = 0; c.touch(); c.onStatus(); return
    }
    if (m.t === 'peers') { peers = m.peers; for (const id of [...cursors.keys()]) if (!peers.some(p => p.id === id)) cursors.delete(id); c.onStatus(); return }
    if (m.t === 'cur') { cursors.set(m.id, { x: m.x, y: m.y, t: performance.now() }); c.invalidate(); return }
    if (m.t === 'put') await applyPut(m)
    else if (m.t === 'del') applyDel(m.k, m.id)
    else if (m.t === 'z') applyZ(m.z)
    lastVer = doc.version + 1   // não reenviar o que acabou de chegar
    c.touch(); lastVer = doc.version
  }

  function connect() {
    if (!room) return
    const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/__collab'
    const sock = new WebSocket(url); ws = sock; ready = false
    sock.onopen = () => sock.send(JSON.stringify({ t: 'hello', room, name }))
    let chain = Promise.resolve()
    sock.onmessage = e => { const m = JSON.parse(e.data as string); chain = chain.then(() => onMessage(m)).catch(err => { console.error('colaboração:', err) }) }
    sock.onclose = () => { if (ws === sock) { ws = null; ready = false; c.onStatus(); if (room) setTimeout(() => { if (room && !ws) connect() }, Math.min(8000, 1000 * ++retry)) } }
  }
  return {
    start(code: string, userName: string) { this.stop(); room = code.toUpperCase(); name = userName || 'Convidado'; connect(); c.onStatus() },
    stop() { const w = ws; room = null; ws = null; ready = false; peers = []; cursors.clear(); sent.clear(); imgSent.clear(); w?.close(); c.onStatus() },
    rename(n: string) { name = n || name; send({ t: 'name', name }) },
    tick: scan,
    cursor(x: number, y: number) { const t = performance.now(); if (t - lastCur > 50) { lastCur = t; send({ t: 'cur', x, y }) } },
    status: () => ({ connected: !!ws && ready, room, peers, selfId, color }),
    cursors: () => { const t = performance.now(), out: { x: number; y: number; name: string; color: string }[] = []; for (const [id, q] of cursors) { const p = peers.find(p => p.id === id); if (p && t - q.t < 10000) out.push({ x: q.x, y: q.y, name: p.name, color: p.color }) } return out }
  }
}
export type Collab = ReturnType<typeof createCollab>
