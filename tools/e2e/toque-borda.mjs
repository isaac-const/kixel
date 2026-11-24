// Toque em tela de celular emulada: com ferramenta de desenho, o pixel da borda (perto das alças do quadro) é desenhado.
const PW = process.env.PW_CORE || '/tmp/pw/node_modules/playwright-core/index.mjs'
const { chromium } = await import(PW)
const ok = (n, c, x = '') => console.log(c ? 'OK  ' : 'FAIL', n, x)
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const ctx = await b.newContext({ viewport: { width: 360, height: 760 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
const pg = await ctx.newPage(), errs = []; pg.on('pageerror', e => errs.push(e.message))
await pg.goto('http://127.0.0.1:5191/?fresh=1'); await pg.waitForTimeout(1200)
await pg.evaluate(() => { const a = __app, f = [...a.doc.frames.values()][0]; a.selectFrame(f); a.fitAll(false) }); await pg.waitForTimeout(300)
const g = await pg.evaluate(() => { const a = __app, f = [...a.doc.frames.values()][0], c = a.cam, o = document.getElementById('ov').getBoundingClientRect(); const s = (x, y) => ({ x: o.left + (x - c.x) * c.zoom + o.width / 2, y: o.top + (y - c.y) * c.zoom + o.height / 2 }); return { tl: s(f.x, f.y), br: s(f.x + f.w, f.y + f.h), w: f.w, h: f.h } })
const px = (x, y) => pg.evaluate(([x, y]) => { const f = [...__app.doc.frames.values()][0], o = (y * f.w + x) * 4; return f.px[o] === 239 && f.px[o + 1] === 125 && f.px[o + 2] === 87 ? 255 : 0 }, [x, y])
const cell = (g.br.x - g.tl.x) / g.w, mx = (g.tl.x + g.br.x) / 2
// meio da borda de baixo (onde fica a alça), meio da borda de cima, canto
await pg.touchscreen.tap(mx, g.br.y - 4); await pg.waitForTimeout(250)
ok('toque no meio da última fileira desenha', (await px(8, 15)) === 255 || (await px(7, 15)) === 255)
await pg.touchscreen.tap(mx, g.tl.y + 4); await pg.waitForTimeout(250)
ok('toque no meio da primeira fileira desenha', (await px(8, 0)) === 255 || (await px(7, 0)) === 255)
await pg.touchscreen.tap(g.tl.x + 4, g.tl.y + 4); await pg.waitForTimeout(250)
ok('toque no canto desenha', (await px(0, 0)) === 255)
// polígono por toque com ponto na borda: 3 toques + fechar no primeiro
const total = () => pg.evaluate(() => { const f = [...__app.doc.frames.values()][0]; let n = 0; for (let i = 0; i < f.px.length; i += 4) if (f.px[i] === 239 && f.px[i + 1] === 125 && f.px[i + 2] === 87) n++; return n })   // pixels da cor atual (laranja)
const n0 = await total()
await pg.evaluate(() => __app.setTool('poly'))
for (const [x, y] of [[mx - 3 * cell, g.tl.y + 4 * cell], [mx + 3 * cell, g.tl.y + 4 * cell], [mx, g.br.y - 3]]) { await pg.touchscreen.tap(x, y); await pg.waitForTimeout(250) }
await pg.touchscreen.tap(mx - 3 * cell, g.tl.y + 4 * cell); await pg.waitForTimeout(300)
const n1 = await total(); ok('polígono por toque fechado (triângulo com 3 lados)', n1 - n0 > 20, String(n1 - n0))
ok('sem erros', errs.length === 0, errs.join())
await b.close()
