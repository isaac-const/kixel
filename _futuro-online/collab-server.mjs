// Relé de colaboração do Kixel: salas em memória, sincronização por objeto (último a gravar vence) e cursores.
import { WebSocketServer } from 'ws'
import os from 'node:os'

const rooms = new Map() // code -> { objs: Map(key -> json string), z: string|null, clients: Map(id -> {ws, name, color, n}), counter: number }
const COLORS = ['#ff6b8b', '#4de3b5', '#ffb454', '#6bb7ff', '#c79bff', '#f2e35b', '#ff8c5a', '#7ae582']

export function lanIps() {
  const out = []
  for (const list of Object.values(os.networkInterfaces())) for (const i of list ?? []) if (i.family === 'IPv4' && !i.internal) out.push(i.address)
  return out
}

export function attachCollab(httpServer, path = '/__collab') {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 * 1024 })
  httpServer.on('upgrade', (req, socket, head) => {
    if (!req.url || !req.url.startsWith(path)) return
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req))
  })
  wss.on('connection', ws => {
    let room = null, me = null, roomCode = ''
    const send = (w, o) => { if (w.readyState === 1) w.send(typeof o === 'string' ? o : JSON.stringify(o)) }
    const peers = () => [...room.clients.values()].map(c => ({ id: c.id, name: c.name, color: c.color }))
    const broadcast = (o, except) => { const s = JSON.stringify(o); for (const c of room.clients.values()) if (c !== except) send(c.ws, s) }
    ws.on('message', raw => {
      let m; try { m = JSON.parse(raw.toString()) } catch { return }
      if (m.t === 'hello') {
        const code = String(m.room || '').slice(0, 32).toUpperCase(); if (!code) return
        roomCode = code; room = rooms.get(code) ?? { objs: new Map(), z: null, clients: new Map(), counter: 0 }; rooms.set(code, room)
        room.counter++
        me = { id: 'p' + room.counter + '-' + Math.random().toString(36).slice(2, 6), ws, name: String(m.name || 'Convidado').slice(0, 24), color: COLORS[(room.counter - 1) % COLORS.length], n: room.counter }
        room.clients.set(me.id, me)
        send(ws, { t: 'state', you: me.n, id: me.id, color: me.color, empty: room.objs.size === 0, objs: [...room.objs.values()].map(s => JSON.parse(s)), z: room.z, peers: peers() })
        broadcast({ t: 'peers', peers: peers() }, me)
        return
      }
      if (!room || !me) return
      if (m.t === 'put') { room.objs.set(m.k + ':' + m.id, JSON.stringify(m)); broadcast({ ...m, from: me.id }, me) }
      else if (m.t === 'del') { room.objs.delete(m.k + ':' + m.id); broadcast({ ...m, from: me.id }, me) }
      else if (m.t === 'z') { room.z = m.z; broadcast({ t: 'z', z: m.z }, me) }
      else if (m.t === 'cur') broadcast({ t: 'cur', id: me.id, x: m.x, y: m.y }, me)
      else if (m.t === 'name') { me.name = String(m.name || '').slice(0, 24) || me.name; broadcast({ t: 'peers', peers: peers() }) }
    })
    ws.on('close', () => {
      if (!room || !me) return
      room.clients.delete(me.id)
      if (room.clients.size) broadcast({ t: 'peers', peers: peers() })
      else setTimeout(() => { const r = rooms.get(roomCode); if (r && !r.clients.size) rooms.delete(roomCode) }, 10 * 60 * 1000)
    })
  })
  return wss
}
