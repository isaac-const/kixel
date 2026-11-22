import { defineConfig, type Plugin } from 'vite'
import fs from 'node:fs'

// Recebe os resultados do teste de estresse (para medir no celular via adb) e grava em bench.log
const bench = (): Plugin => {
  const mw = (req: any, res: any) => {
    let b = ''
    req.on('data', (d: Buffer) => (b += d))
    req.on('end', () => { fs.appendFileSync('bench.log', b + '\n'); res.end('ok') })
  }
  return { name: 'bench', configureServer: s => void s.middlewares.use('/__bench', mw), configurePreviewServer: s => void s.middlewares.use('/__bench', mw) }
}
// Desenvolvimento: guarda os textos que ainda não têm tradução (modo ?probe) em i18n-missing.log
const i18n = (): Plugin => {
  const mw = (req: any, res: any) => { let b = ''; req.on('data', (d: Buffer) => (b += d)); req.on('end', () => { try { for (const t of JSON.parse(b)) fs.appendFileSync('i18n-missing.log', t + '\n') } catch { /* ignora */ } res.end('ok') }) }
  return { name: 'i18n', configureServer: s => void s.middlewares.use('/__i18n', mw), configurePreviewServer: s => void s.middlewares.use('/__i18n', mw) }
}
export default defineConfig({ server: { host: true, port: 5190 }, preview: { port: 5191, host: true }, plugins: [bench(), i18n()] })
