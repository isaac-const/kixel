import { open, ok } from './harness.mjs'
import fs from 'node:fs'
const t = await open({ lang: process.argv[2], frame: false })
const { pg } = t
pg.on('dialog', d => d.accept('8x8'))
const b64 = await pg.evaluate(() => { const c = document.createElement('canvas'); c.width = 48; c.height = 8; const x = c.getContext('2d'); ['#f00', '#0f0', '#00f', '#ff0', '#0ff', '#f0f'].forEach((col, i) => { x.fillStyle = col; x.fillRect(i * 8, 0, 8, 8) }); return c.toDataURL('image/png').split(',')[1] })
fs.writeFileSync('/tmp/sheet6.png', Buffer.from(b64, 'base64'))
await pg.setInputFiles('#sheetfile', '/tmp/sheet6.png'); await pg.waitForTimeout(700)
const K = () => pg.evaluate(() => { const k = [...__app.doc.conts.values()][0]; return { n: [...__app.doc.members(k.id).frames].length, order: k.order, tags: (k.tags || []).map(t => ({ name: t.name, n: t.ids.length })), tag: k.tag } })
ok('6 frames na animação', (await K()).n === 6)
await pg.waitForTimeout(300)
// abrir o organizador pelo botão do player
await pg.click('.aplayer .atags .org'); await pg.waitForTimeout(250)
ok('janela Organizar abriu', await pg.isVisible('#tl .tlcard'))
const cards = () => pg.$$('#tl .tlc')
ok('6 cards', (await cards()).length === 6)
// seleção com Shift: 1..3 -> nova tag
await (await cards())[0].click(); await (await cards())[2].click({ modifiers: ['Shift'] })
ok('3 selecionados', (await pg.$$('#tl .tlc.on')).length === 3)
await pg.click('#tl .tlnew'); await pg.waitForTimeout(150); await pg.keyboard.type('andar'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(150)
let k = await K(); ok('tag "andar" com 3 frames', k.tags.length === 1 && k.tags[0].name === 'andar' && k.tags[0].n === 3, JSON.stringify(k.tags))
// voltar para Todos, selecionar 5 e 6 -> nova tag
await pg.click('#tl .tlt:first-child'); await pg.waitForTimeout(100)
await (await cards())[4].click(); await (await cards())[5].click({ modifiers: ['Control'] }); await pg.click('#tl .tlnew'); await pg.waitForTimeout(150); await pg.keyboard.press('Enter'); await pg.waitForTimeout(150)
k = await K(); ok('segunda tag com 2 frames', k.tags.length === 2 && k.tags[1].n === 2, JSON.stringify(k.tags))
// ordem: em Todos, seleciona o último e leva para o início
await pg.click('#tl .tlt:first-child'); await pg.waitForTimeout(100)
const firstId = await pg.evaluate(() => document.querySelector('#tl .tlc').dataset.id)
await (await cards())[5].click(); const lastId = await pg.evaluate(() => document.querySelectorAll('#tl .tlc')[5].dataset.id)
await pg.click('#tl .tlfirst'); await pg.waitForTimeout(150)
ok('último foi para o início', (await pg.evaluate(() => document.querySelector('#tl .tlc').dataset.id)) === lastId)
// arrastar o primeiro card para depois do terceiro
const ids0 = await pg.evaluate(() => [...document.querySelectorAll('#tl .tlc')].map(c => c.dataset.id))
const b2 = await (await cards())[2].boundingBox()
await pg.dragAndDrop('#tl .tlc:nth-child(1)', '#tl .tlc:nth-child(3)', { targetPosition: { x: b2.width - 4, y: b2.height / 2 } }); await pg.waitForTimeout(200)
const ids1 = await pg.evaluate(() => [...document.querySelectorAll('#tl .tlc')].map(c => c.dataset.id))
ok('arrastar reordena (card 1 foi para depois do 3)', ids1[2] === ids0[0] && ids1[0] === ids0[1], ids0.join() + ' -> ' + ids1.join())
await pg.screenshot({ path: '/tmp/shots/v16-timeline.png' })
// ver só uma tag e voltar
await pg.click('#tl .tltags .tlt:nth-child(2)'); await pg.waitForTimeout(150)
ok('tag "andar" mostra 3 cards', (await cards()).length === 3)
await pg.keyboard.press('Escape'); await pg.waitForTimeout(150)
ok('Esc fecha a janela', !(await pg.isVisible('#tl .tlcard')))
// player: chips e contagem
const chips = await pg.$$eval('.aplayer .atags .tg:not(.org)', b => b.map(x => x.textContent))
ok('player tem chips Todos, andar, Ação 1', chips.length === 3 && chips[1] === 'andar', JSON.stringify(chips))
await pg.screenshot({ path: '/tmp/shots/v16-player.png' })
const count = () => pg.$eval('.aplayer .ahead small', e => e.textContent)
ok('tag ativa toca só 3 frames', /\/ 3$/.test(await count()), await count())
await pg.click('.aplayer .atags .tg:not(.org) >> nth=0'); await pg.waitForTimeout(250)
ok('Todos volta a 6', /\/ 6$/.test(await count()), await count())
// Godot com tags
await pg.click('.aplayer .atags .tg:not(.org) >> nth=1'); await pg.waitForTimeout(150)
await pg.evaluate(() => { const k = [...__app.doc.conts.values()][0]; __app.selectCont(k) }); await pg.waitForTimeout(200)
const dl = []; pg.on('download', d => dl.push(d))
await pg.click('#godotout'); await pg.waitForTimeout(1200)
const tresDl = dl.find(d => d.suggestedFilename().endsWith('.tres')); const tres = tresDl ? fs.readFileSync(await tresDl.path(), 'utf8') : ''
ok('.tres tem as animações default, andar e acao_1', /"name": &"default"/.test(tres) && /"name": &"andar"/.test(tres) && /"name": &"(acao|action|accion)_1"/.test(tres), tres.match(/&"[a-z_0-9]+"/g)?.join(','))
await t.done()
