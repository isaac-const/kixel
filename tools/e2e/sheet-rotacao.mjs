import { open, ok } from './harness.mjs'
import fs from 'node:fs'
const t = await open({ lang: process.argv[2], frame: false })
const { pg, px, count, drag, click } = t
pg.on('dialog', d => d.accept(d.defaultValue() === '45' ? '45' : '8x8'))
// folha 24x8 com 3 células 8x8 (cores diferentes) + uma vazia no fim (32x8)
const b64 = await pg.evaluate(() => { const c = document.createElement('canvas'); c.width = 32; c.height = 8; const x = c.getContext('2d'); x.fillStyle = '#f00'; x.fillRect(0, 0, 8, 8); x.fillStyle = '#0f0'; x.fillRect(8, 0, 8, 8); x.fillStyle = '#00f'; x.fillRect(16, 0, 8, 8); return c.toDataURL('image/png').split(',')[1] })
fs.writeFileSync('/tmp/sheet-test.png', Buffer.from(b64, 'base64'))
const before = await pg.evaluate(() => __app.doc.frames.size)
await pg.setInputFiles('#sheetfile', '/tmp/sheet-test.png'); await pg.waitForTimeout(600)
const info = await pg.evaluate(() => ({ n: __app.doc.frames.size, conts: [...__app.doc.conts.values()].map(k => ({ id: k.id, anim: k.anim, name: k.name })), names: [...__app.doc.frames.values()].map(f => f.name) }))
ok('3 quadros novos (a célula vazia foi ignorada)', info.n - before === 3, JSON.stringify(info))
ok('viraram um contêiner de animação', info.conts.length === 1 && info.conts[0].anim, JSON.stringify(info.conts))
// modo vai e volta: lê o canvas do player ao longo do tempo
await pg.evaluate(() => { const k = [...__app.doc.conts.values()][0]; k.fps = 60; k.loop = 'pingpong'; __app.doc.version++ })
const seq = []
for (let i = 0; i < 60; i++) { seq.push(await pg.evaluate(() => { const cv = document.querySelector('.aplayer canvas'); if (!cv) return '?'; const d = cv.getContext('2d').getImageData(0, 0, 1, 1).data; return d[0] > 200 ? 'R' : d[1] > 200 ? 'G' : 'B' })); await pg.waitForTimeout(25) }
const str = seq.join('').replace(/(.)\1+/g, '$1')
ok('vai e volta passa por R G B G R', /RGBGR/.test(str) || /BGRGB/.test(str) || /GRGBG/.test(str), str)
await pg.evaluate(() => { const k = [...__app.doc.conts.values()][0]; k.loop = 'reverse' })
const seq2 = []
for (let i = 0; i < 50; i++) { seq2.push(await pg.evaluate(() => { const cv = document.querySelector('.aplayer canvas'); if (!cv) return '?'; const d = cv.getContext('2d').getImageData(0, 0, 1, 1).data; return d[0] > 200 ? 'R' : d[1] > 200 ? 'G' : 'B' })); await pg.waitForTimeout(25) }
const str2 = seq2.join('').replace(/(.)\1+/g, '$1')
ok('ao contrário passa por B G R B', /BGRB/.test(str2) || /GRBG/.test(str2) || /RBGR/.test(str2), str2)
await pg.screenshot({ path: '/tmp/shots/v15-sheet.png' })
await t.b.close()
// ---- rotação livre (quadro novo, bloco vermelho 4x4 em 2..5)
const r = await open({ lang: process.argv[2] })
let ang = '90'; r.pg.on('dialog', d => d.accept(ang))
await r.pg.evaluate(() => { const f = [...__app.doc.frames.values()].find(g => g.name === 'T'), b = __app.doc.activeBuf(f); for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) b.set([255, 0, 0, 255], (y * 16 + x) * 4); __app.doc.composite(f); __app.R.upload(__app.doc, f) })
const menu = async () => { const p = await r.scr(4, 4); await r.pg.mouse.click(p.x, p.y, { button: 'right' }); await r.pg.waitForTimeout(250); await r.pg.click('.cmenu button:has-text("ângulo"), .cmenu button:has-text("angle"), .cmenu button:has-text("ángulo")'); await r.pg.waitForTimeout(200) }
await r.pg.keyboard.press('m'); await r.drag(2.2, 2.2, 5.8, 5.8, 4)
await menu(); ok('90 graus: continua 4x4 e 16 pixels', JSON.stringify(await r.sel()) === '{"x":2,"y":2,"w":4,"h":4}' && (await r.count()) === 16, JSON.stringify(await r.sel()) + ' ' + await r.count())
ang = '45'; await menu(); const s45 = await r.sel(); ok('45 graus: caixa cresce para 6x6 e perde/ganha poucos pixels', s45.w === 6 && s45.h === 6 && Math.abs((await r.count()) - 16) <= 6, JSON.stringify(s45) + ' ' + await r.count())
await r.pg.screenshot({ path: '/tmp/shots/v15-rot45.png' })
await r.pg.keyboard.press('Control+z'); ok('desfaz volta ao 4x4', (await r.count()) === 16)
await r.done()
