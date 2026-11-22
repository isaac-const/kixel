import { open, ok } from './harness.mjs'
const t = await open({ lang: process.argv[2] })
const { pg, px, count, drag, click } = t
await pg.evaluate(() => { const a = __app, f = [...a.doc.frames.values()].find(g => g.name === 'T'), buf = a.doc.activeBuf(f)
  for (let y = 4; y < 8; y++) for (let x = 4; x < 8; x++) buf.set([200, 100, 50, 255], (y * 16 + x) * 4)
  a.doc.composite(f, 0, 0, 16, 16); a.R.upload(a.doc, f) })
// sombra: clarear e escurecer
await pg.keyboard.press('d'); await pg.waitForTimeout(150)
await click(5, 5); const l1 = await px(5, 5)
ok('sombra clareia', l1[0] + l1[1] + l1[2] > 350, l1.join())
await pg.keyboard.down('Alt'); await click(6, 6); await pg.keyboard.up('Alt'); const d1 = await px(6, 6)
ok('Alt escurece', d1[0] + d1[1] + d1[2] < 350, d1.join())
ok('sombra não pinta o vazio', (await count()) === 16)
await pg.keyboard.press('Control+z'); await pg.keyboard.press('Control+z')
// pontilhado 50% com balde em retângulo? usa lápis grande
await pg.keyboard.press('b'); await pg.evaluate(() => { __app.S.brush = 4; __app.S.dither = 2; __app.ui.ctxSync() })
await click(10, 10); const n = await count(); ok('pontilhado 50% pinta metade do bloco 4x4 (8) além dos 16', n === 24, String(n))
await pg.keyboard.press('Control+z'); await pg.evaluate(() => { __app.S.dither = 0; __app.S.brush = 1; __app.ui.ctxSync() })
// contorno
await pg.evaluate(() => { __app.S.color = [0, 0, 0, 255] })
await pg.click('#adjout'); const n2 = await count(); ok('contorno 4x4 adiciona 16 pixels', n2 === 32, String(n2))
await pg.keyboard.press('Control+z')
// ajustar cores: brilho +30, inverter
await pg.evaluate(() => { const s = document.getElementById('adjl'); s.value = '30'; s.dispatchEvent(new Event('input')) }); await pg.click('#adjgo')
const b = await px(5, 5); ok('brilho +30 clareou', b[0] > 200, b.join())
await pg.keyboard.press('Control+z'); await pg.click('#adjinv'); const iv = await px(5, 5); ok('inverter 200,100,50 -> 55,155,205', iv.join() === '55,155,205,255', iv.join())
await pg.keyboard.press('Control+z')
// rampa
await pg.evaluate(() => { __app.S.color = [200, 100, 50, 255] }); const before = await pg.evaluate(() => __app.S.mine.length)
await pg.click('#palramp'); const after = await pg.evaluate(() => __app.S.mine.length); ok('rampa adicionou 7 tons', after - before === 7, `${before} -> ${after}`)
await pg.screenshot({ path: '/tmp/shots/v13-cores.png' })
await t.done()
