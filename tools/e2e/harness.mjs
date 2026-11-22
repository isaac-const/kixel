// Ajudantes para testes no Chromium (Playwright). Uso nos testes: import { open, ok } from './harness.mjs'
// Requer playwright-core: PW_CORE=/caminho/playwright-core/index.mjs (padrão /tmp/pw/node_modules/...). Servidor: npx vite --port 5191 --host 127.0.0.1
const PW = process.env.PW_CORE || '/tmp/pw/node_modules/playwright-core/index.mjs'
const { chromium } = await import(PW)
export const ok = (n, c, x = '') => console.log(c ? 'OK  ' : 'FAIL', n, x)
export async function open({ lang, w = 1440, h = 900, frame = true } = {}) {
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  const ctx = await b.newContext({ viewport: { width: w, height: h } })
  if (lang) await ctx.addInitScript(l => localStorage.setItem('kixel-lang', l), lang)
  const pg = await ctx.newPage(), errs = []
  pg.on('pageerror', e => errs.push(e.message))
  await pg.goto('http://127.0.0.1:5191/?fresh=1'); await pg.waitForTimeout(1000)
  // quadro 16x16 chamado T em (0,0), já selecionado (o espaço novo traz um quadro de exemplo à parte)
  if (frame) await pg.evaluate(() => { const a = __app, f = a.newFrame(0, 0, 16, 16, false, 'T'); a.selectFrame(f); a.fitAll(false) })
  await pg.waitForTimeout(300)
  const scr = (x, y) => pg.evaluate(([x, y]) => { const c = __app.cam, r = document.getElementById('ov').getBoundingClientRect(); return { x: r.left + (x - c.x) * c.zoom + r.width / 2, y: r.top + (y - c.y) * c.zoom + r.height / 2 } }, [x, y])
  const T = () => `[...__app.doc.frames.values()].find(g=>g.name==='T')`
  const px = (x, y) => pg.evaluate(`(()=>{const f=${T()},o=(${y}*f.w+${x})*4;return [...f.px.slice(o,o+4)]})()`)
  const count = () => pg.evaluate(`(()=>{const f=${T()};let n=0;for(let i=3;i<f.px.length;i+=4)if(f.px[i])n++;return n})()`)
  const drag = async (x0, y0, x1, y1, steps = 5) => { const a = await scr(x0, y0), c = await scr(x1, y1); await pg.mouse.move(a.x, a.y); await pg.mouse.down(); await pg.mouse.move(c.x, c.y, { steps }); await pg.mouse.up() }
  const click = async (x, y) => { const p = await scr(x + .5, y + .5); await pg.mouse.move(p.x, p.y); await pg.mouse.down(); await pg.mouse.up() }
  const sel = () => pg.evaluate(() => { const p = __app.psel; return p && { x: p.x, y: p.y, w: p.w, h: p.h } })
  const done = async () => { const miss = await pg.evaluate(() => window.__i18n?.missing?.() ?? []); await b.close(); console.log('erros:', errs, 'sem tradução:', miss.length); return { errs, miss } }
  return { b, pg, errs, scr, px, count, drag, click, sel, done }
}
