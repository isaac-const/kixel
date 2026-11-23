import { open, ok } from './harness.mjs'
import fs from 'node:fs'
const t = await open({ lang: process.argv[2] })
const { pg } = t
await pg.evaluate(() => { const a = __app
  const mk = (x, name, x0, y0, x1, y1) => { const f = a.newFrame(x, 0, 16, 16, false, name), buf = a.doc.activeBuf(f)
    for (let y = y0; y <= y1; y++) for (let xx = x0; xx <= x1; xx++) buf.set([200, 50, 50, 255], (y * 16 + xx) * 4)
    a.doc.composite(f, 0, 0, 16, 16); a.R.upload(a.doc, f); return f }
  const f1 = [...a.doc.frames.values()].find(g => g.name === 'T'), b1 = a.doc.activeBuf(f1)
  for (let y = 4; y <= 7; y++) for (let x = 4; x <= 9; x++) b1.set([200, 50, 50, 255], (y * 16 + x) * 4)
  a.doc.composite(f1, 0, 0, 16, 16); a.R.upload(a.doc, f1)
  const f2 = mk(40, 'U', 2, 2, 3, 3), f3 = mk(80, 'V', 0, 0, 15, 15)
  a.selectFrames([f1, f2, f3]) })
// painel de exportar: opções aparecem só no sprite sheet
await pg.evaluate(() => { const s = document.getElementById('efmt'); s.value = 'sheet'; s.dispatchEvent(new Event('change')) }); await pg.waitForTimeout(200)
ok('opções do sprite sheet visíveis', await pg.evaluate(() => !document.getElementById('sheetopts').hidden))
const run = async (pad, cols, trim) => {
  await pg.evaluate(([p, c, tr]) => { document.getElementById('spad').value = p; document.getElementById('scols').value = c; document.getElementById('strim').checked = tr }, [pad, cols, trim])
  const dl = []; const h = d => dl.push(d); pg.on('download', h)
  await pg.evaluate(() => document.getElementById('export').click()); await pg.waitForTimeout(1200); pg.off('download', h)
  const json = dl.find(d => d.suggestedFilename().endsWith('.json')), png = dl.find(d => d.suggestedFilename().endsWith('.png'))
  const j = JSON.parse(fs.readFileSync(await json.path(), 'utf8')); return { j, png }
}
const a = await run(0, 0, false)
const sz = Object.values(a.j.frames).map(f => f.frame.w + 'x' + f.frame.h).join()
ok('sem corte: 16x16 em todos', sz === '16x16,16x16,16x16', sz)
const b = await run(2, 2, true), fr = Object.values(b.j.frames)
ok('corte: 6x4, 2x2 e 16x16', fr.map(f => f.frame.w + 'x' + f.frame.h).join() === '6x4,2x2,16x16', fr.map(f => f.frame.w + 'x' + f.frame.h).join())
ok('corte guarda o deslocamento original', fr[0].spriteSourceSize.x === 4 && fr[0].spriteSourceSize.y === 4 && fr[0].trimmed === true && fr[0].sourceSize.w === 16, JSON.stringify(fr[0].spriteSourceSize))
ok('margem de 2 px na borda e entre quadros (2 colunas)', fr[0].frame.x === 2 && fr[0].frame.y === 2 && fr[1].frame.x === 2 + 6 + 2 && fr[2].frame.x === 2 && fr[2].frame.y > fr[0].frame.y, fr.map(f => f.frame.x + ',' + f.frame.y).join(' '))
ok('tamanho da imagem confere', b.j.meta.size.w === 2 + 16 + 2 && b.j.meta.size.h === 2 + 4 + 2 + 16 + 2, JSON.stringify(b.j.meta.size))
// paleta do desenho
await pg.evaluate(() => { __app.S.mine = [] }); 
await pg.evaluate(() => { document.getElementById('xn').value = 8; document.getElementById('palframe').click() }); const mine = await pg.evaluate(() => __app.S.mine)
ok('paleta do desenho pega a cor do quadro', mine.includes('#c83232'), mine.join())
await t.done()
