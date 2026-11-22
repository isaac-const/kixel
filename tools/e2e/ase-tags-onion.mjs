import { open, ok } from './harness.mjs'
import fs from 'node:fs'
const t = await open({ lang: process.argv[2], frame: false })
const { pg } = t
pg.on('dialog', d => d.accept('8x8'))
await pg.setInputFiles('#sheetfile', '/tmp/sheet6.png'); await pg.waitForTimeout(700)
// tags: andar = frames 1..3, atacar = 5..6 (índices na ordem)
await pg.evaluate(() => { const k = [...__app.doc.conts.values()][0]; const fr = __app.doc.members(k.id).frames.sort((a, b) => a.x - b.x); k.tags = [{ id: 1, name: 'andar', ids: fr.slice(0, 3).map(f => f.id) }, { id: 2, name: 'atacar', ids: fr.slice(4, 6).map(f => f.id), loop: 'pingpong' }]; __app.selectCont(k) })
await pg.waitForTimeout(300)
const [file] = await Promise.all([pg.waitForEvent('download', { timeout: 20000 }), pg.click('#aseanim')]); ok('baixou .aseprite', !!file)
const path = '/tmp/tags-out.aseprite'; fs.copyFileSync(await file.path(), path)
// reimporta
await pg.setInputFiles('#asefile', path); await pg.waitForTimeout(900)
const res = await pg.evaluate(() => [...__app.doc.conts.values()].map(k => ({ name: k.name, tags: (k.tags || []).map(t => [t.name, t.ids.length, t.loop || '']) })))
const imp = res[res.length - 1]
ok('importou com as 2 tags', imp.tags.length === 2 && imp.tags[0][0] === 'andar' && imp.tags[0][1] === 3 && imp.tags[1][0] === 'atacar' && imp.tags[1][1] === 2 && imp.tags[1][2] === 'pingpong', JSON.stringify(imp))
// duração em lote pelo organizador
await pg.evaluate(() => { const k = [...__app.doc.conts.values()][0]; __app.selectCont(k) })
await pg.click('#animtl'); await pg.waitForTimeout(300)
await (await pg.$$('#tl .tlc'))[0].click(); await (await pg.$$('#tl .tlc'))[1].click({ modifiers: ['Shift'] })
await pg.fill('#tl .tldur input', '200'); await pg.click('#tl .tldurgo'); await pg.waitForTimeout(200)
const durs = await pg.evaluate(() => { const k = [...__app.doc.conts.values()][0]; return __app.doc.members(k.id).frames.sort((a, b) => a.x - b.x).map(f => f.dur ?? 0) })
ok('duração 200ms nos 2 selecionados', durs[0] === 200 && durs[1] === 200 && !durs[2], JSON.stringify(durs))
await pg.keyboard.press('Escape')
// onion skin com 2 frames e seguintes
await pg.evaluate(() => { const k = [...__app.doc.conts.values()][0]; const f = __app.doc.members(k.id).frames.sort((a, b) => a.x - b.x)[2]; __app.selectFrame(f); __app.S.opt.onion = true; __app.S.opt.onionNext = true; __app.S.onionN = 2; __app.ui.ctxSync(); __app.fitAll(false) })
await pg.keyboard.press('b'); await pg.waitForTimeout(400); await pg.screenshot({ path: '/tmp/shots/v17-onion.png' })
await t.done()
