import { open, ok } from './harness.mjs'
const t = await open({ lang: process.argv[2] })
const { pg, px, count, drag, click } = t
const tool = k => pg.keyboard.press(k)
// gradiente linear pontilhado, cor 1 laranja -> cor final azul
await pg.evaluate(() => { __app.S.color = [255, 0, 0, 255]; __app.S.color2 = [0, 0, 255, 255] })
await tool('r'); await pg.waitForTimeout(150)
ok('painel do degradê aparece', await pg.evaluate(() => !document.getElementById('gradrow').hidden))
await drag(.5, 8.5, 15.5, 8.5, 6)
const a = await px(0, 5), b = await px(15, 5)
ok('começo é a cor 1 e fim é a cor final', a.join() === '255,0,0,255' && b.join() === '0,0,255,255', a.join() + ' | ' + b.join())
const mid = await pg.evaluate(() => { const f = [...__app.doc.frames.values()].find(g => g.name === 'T'); let r = 0, bl = 0; for (let x = 6; x < 10; x++) for (let y = 0; y < 16; y++) { const o = (y * 16 + x) * 4; if (f.px[o] === 255) r++; else if (f.px[o + 2] === 255) bl++ } return [r, bl] })
ok('meio mistura as duas cores', mid[0] > 5 && mid[1] > 5, mid.join())
ok('só as duas cores (pontilhado, sem tons)', await pg.evaluate(() => { const f = [...__app.doc.frames.values()].find(g => g.name === 'T'); const s = new Set(); for (let i = 0; i < f.px.length; i += 4) s.add(f.px[i] + ',' + f.px[i + 2]); return s.size === 2 }))
await pg.keyboard.press('Control+z'); ok('desfaz o degradê em um passo', (await count()) === 0, String(await count()))
// faixas
await pg.evaluate(() => { __app.S.gradMode = 'bands' }); await drag(.5, 8.5, 15.5, 8.5, 6)
ok('faixas: 5 tons', await pg.evaluate(() => { const f = [...__app.doc.frames.values()].find(g => g.name === 'T'); const s = new Set(); for (let i = 0; i < f.px.length; i += 4) s.add(f.px[i]); return s.size === 5 }))
await pg.keyboard.press('Control+z'); await pg.evaluate(() => { __app.S.gradMode = 'dither' })
// radial
await pg.evaluate(() => { __app.S.gradKind = 'radial' }); await drag(8, 8, 15, 8, 6)
const c0 = await px(8, 8), c1 = await px(0, 0)
ok('radial: centro cor 1, longe cor final', c0.join() === '255,0,0,255' && c1.join() === '0,0,255,255', c0.join() + ' | ' + c1.join())
await pg.keyboard.press('Control+z')
// seleção limita o degradê
await pg.evaluate(() => { __app.S.gradKind = 'linear' }); await tool('m'); await drag(2, 2, 5, 5, 4)
await tool('r'); await drag(.5, 8.5, 15.5, 8.5, 4)
ok('degradê só dentro da seleção (16 pixels)', (await count()) === 16, String(await count()))
await pg.keyboard.press('Control+z'); await pg.evaluate(() => { __app.psel = null })
// polígono: triângulo fechado clicando no primeiro
await pg.evaluate(() => { __app.S.color = [255, 255, 0, 255]; __app.S.opt.fill = false })
await tool('p'); await click(2, 2); await click(12, 2); await click(7, 12); await click(2, 2)
const n1 = await count(); ok('polígono fechado desenhou contorno', n1 > 25 && (await px(7, 2))[3] === 255 && (await px(7, 12))[3] === 255, String(n1))
ok('interior vazio', (await px(7, 6))[3] === 0)
await pg.keyboard.press('Control+z'); ok('desfaz o polígono em um passo', (await count()) === 0, String(await count()))
// polígono preenchido
await pg.evaluate(() => { __app.S.opt.fill = true }); await tool('p'); await click(2, 2); await click(12, 2); await click(7, 12); await pg.keyboard.press('Enter')
ok('polígono preenchido, interior pintado', (await px(7, 6))[3] === 255 && (await count()) > 50, String(await count()))
await pg.keyboard.press('Control+z'); await pg.evaluate(() => { __app.S.opt.fill = false })
// Esc cancela
await tool('p'); await click(2, 2); await click(12, 2); await pg.keyboard.press('Escape'); ok('Esc cancela o polígono', (await count()) === 0, String(await count()))
// polígono aberto: clique no último ponto
await click(2, 2); await click(12, 2); await click(12, 2)
ok('polígono aberto termina clicando no último', (await px(7, 2))[3] === 255 && (await px(7, 12))[3] === 0)
await pg.keyboard.press('Control+z')
// curva
await tool('c'); await click(1, 12); await click(14, 12); await click(8, 1)
const cn = await count(); ok('curva desenhou e sobe até perto do ponto de controle', cn > 14 && [(await px(7, 6))[3], (await px(8, 6))[3], (await px(7, 7))[3], (await px(8, 7))[3]].some(v => v === 255), String(cn))
await pg.keyboard.press('Control+z'); ok('desfaz a curva em um passo', (await count()) === 0)
await pg.screenshot({ path: '/tmp/shots/v17-formas.png' })
await t.done()
