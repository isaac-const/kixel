import { open, ok } from './harness.mjs'
const t = await open({ lang: process.argv[2] })
const { pg } = t
const tool = () => pg.evaluate(() => __app.S.tool)
const carets = () => pg.$$('#tools .tcaret')
ok('4 grupos na barra', (await carets()).length === 4)
// formas: menu mostra 5 itens e escolher elipse muda o botão
await (await carets())[1].click(); await pg.waitForTimeout(150)
ok('menu de formas com 5 itens', (await pg.$$('.toolmenu button')).length === 5)
await pg.screenshot({ path: '/tmp/shots/v18-menu-formas.png' })
await pg.click('.toolmenu button:nth-child(3)'); await pg.waitForTimeout(150)
ok('escolher elipse ativa a elipse', (await tool()) === 'ellipse')
ok('menu fecha', (await pg.$$('.toolmenu')).length === 0)
ok('botão do grupo passa a ser a elipse e está ativo', await pg.evaluate(() => { const b = document.querySelectorAll('#tools .tgroup')[1].querySelector('button'); return b.dataset.tool === 'ellipse' && b.classList.contains('on') }))
await pg.keyboard.press('b'); await pg.keyboard.press('p')
ok('tecla P ativa o polígono e o botão acompanha', (await tool()) === 'poly' && await pg.evaluate(() => document.querySelectorAll('#tools .tgroup')[1].querySelector('button').dataset.tool === 'poly'))
await pg.keyboard.press('b'); await pg.click('#tools .tgroup:nth-of-type(2) button'); ok('clicar no botão volta à última forma', (await tool()) === 'poly')
// seleção: laço e varinha
await (await carets())[2].click(); await pg.click('.toolmenu button:nth-child(2)'); await pg.waitForTimeout(150)
ok('laço: ferramenta de seleção em modo laço', (await tool()) === 'marquee' && await pg.evaluate(() => __app.S.selMode) === 'lasso')
await pg.keyboard.press('b'); await pg.keyboard.press('w'); await pg.waitForTimeout(100)
ok('tecla W: varinha e botão mostra a varinha', await pg.evaluate(() => __app.S.selMode === 'wand' && document.querySelectorAll('#tools .tgroup')[2].querySelector('button').getAttribute('aria-label').length > 0))
await pg.keyboard.press('b'); await pg.click('#tools .tgroup:nth-of-type(3) button'); await pg.waitForTimeout(100)
ok('clicar no botão de seleção reabre a última (varinha)', await pg.evaluate(() => __app.S.selMode) === 'wand')
// preenchimento e quadros
await (await carets())[0].click(); await pg.click('.toolmenu button:nth-child(2)'); ok('degradê pelo grupo', (await tool()) === 'gradient')
await (await carets())[3].click(); await pg.click('.toolmenu button:nth-child(2)'); ok('contêiner pelo grupo', (await tool()) === 'container')
// fora fecha o menu
await (await carets())[1].click(); await pg.mouse.click(300, 300); await pg.waitForTimeout(100); ok('clicar fora fecha o menu', (await pg.$$('.toolmenu')).length === 0)
ok('lembra a última forma entre sessões', await pg.evaluate(() => localStorage.getItem('kixel-grp-shapes')) === 'poly')
await t.done()
