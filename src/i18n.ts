// Tradução da interface: o texto-fonte é o português; inglês e espanhol vêm de dicionários.
// O tradutor atua na própria tela (textos, dicas e avisos), então os textos do código continuam em português.
import { EN } from './i18n/en'
import { ES } from './i18n/es'

export type Lang = 'pt' | 'en' | 'es'
export const LANGS: { id: Lang; name: string; locale: string; html: string }[] = [
  { id: 'pt', name: 'Português', locale: 'pt-BR', html: 'pt-BR' },
  { id: 'en', name: 'English', locale: 'en-US', html: 'en' },
  { id: 'es', name: 'Español', locale: 'es-ES', html: 'es' }
]
const DICTS: Record<'en' | 'es', Record<string, string>> = { en: EN, es: ES }

function detect(): Lang {
  try { const s = localStorage.getItem('kixel-lang'); if (s === 'pt' || s === 'en' || s === 'es') return s } catch { /* sem armazenamento */ }
  const n = (navigator.language || 'en').toLowerCase()
  return n.startsWith('pt') ? 'pt' : n.startsWith('es') ? 'es' : 'en'
}
let lang: Lang = detect()
export const getLang = () => lang
export const locale = () => LANGS.find(l => l.id === lang)!.locale
export const missing = new Set<string>()
const listeners: (() => void)[] = []
export const onLang = (fn: () => void) => { listeners.push(fn) }

const KEEP = /^(#[0-9a-f]{3,8}|(?:(?:Ctrl|Shift|Alt|Cmd)\+[\w[\]]+)(?: ?\/ ?(?:(?:Ctrl|Shift|Alt|Cmd)\+)?[\w[\]]+)*|Ctrl|Shift|Alt|Cmd|F\d{1,2}|\?|[\d\s.,:×x%·+\-–/[\]]+)$/i
type Pat = { re: RegExp; to: string; keys: string[]; len: number }
const patCache: Partial<Record<'en' | 'es', Pat[]>> = {}
function patterns(l: 'en' | 'es'): Pat[] {
  if (patCache[l]) return patCache[l]!
  const out: Pat[] = []
  for (const [k, v] of Object.entries(DICTS[l])) {
    if (!/\{~?\w+\}/.test(k)) continue
    const keys: string[] = []
    const src = k.split(/(\{~?\w+\})/).map(part => { const m = /^\{(~?\w+)\}$/.exec(part); if (m) { keys.push(m[1]); return m[1][0] === '~' ? '([\\s\\S]+)' : '([\\s\\S]+?)' } return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }).join('')
    out.push({ re: new RegExp('^' + src + '$'), to: v, keys, len: k.length })
  }
  out.sort((a, b) => b.len - a.len)
  return (patCache[l] = out)
}

/** Traduz um texto em português para o idioma atual. O que não tem tradução volta como estava (e fica em `missing`). */
const probe = new URLSearchParams(location.search).has('probe')   // só para desenvolvimento: no modo português, também confere o que faltaria em inglês
let pending: string[] = [], timer = 0
function report(t: string) { if (!probe) return; pending.push(t); clearTimeout(timer); timer = window.setTimeout(() => { try { navigator.sendBeacon('/__i18n', JSON.stringify(pending)) } catch { /* sem servidor */ } pending = [] }, 400) }
export function tr(s: string): string {
  if (!s || (lang === 'pt' && !probe)) return s
  const L: 'en' | 'es' = lang === 'pt' ? 'en' : lang
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s)!, core = m[2]
  if (!core) return s
  if (KEEP.test(core)) return s   // atalhos, cores em hexadecimal e números não mudam de idioma
  const d = DICTS[L]
  let out: string | undefined = Object.prototype.hasOwnProperty.call(d, core) ? d[core] : undefined
  if (out === undefined) for (const p of patterns(L)) { const r = p.re.exec(core); if (r) { out = p.to.replace(/\{(~?\w+)\}/g, (_, k) => { const v = r[p.keys.indexOf(k) + 1] ?? ''; return k[0] === '~' ? tr(v) : v }); break } }
  if (out === undefined) { if (/[A-Za-zÀ-ÿ]{2,}/.test(core)) { if (!missing.has(core)) report(core); missing.add(core) } return s }
  return lang === 'pt' ? s : m[1] + out + m[3]
}

// ---------------------------------------------------------------- tradução do que está na tela
const ATTRS = ['title', 'aria-label', 'placeholder']
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CANVAS'])
const origText = new WeakMap<Text, string>(), lastText = new WeakMap<Text, string>()
const origAttr = new WeakMap<Element, Record<string, string>>(), lastAttr = new WeakMap<Element, Record<string, string>>()
const noTr = (el: Element | null) => !el || SKIP.has(el.tagName) || !!el.closest('[translate="no"]')

function doText(n: Text) {
  if (noTr(n.parentElement)) return
  const cur = n.data
  if (lastText.get(n) === cur) { const out = tr(origText.get(n)!); if (out !== cur) { n.data = out; lastText.set(n, out) } return }
  origText.set(n, cur); const out = tr(cur); lastText.set(n, out); if (out !== cur) n.data = out
}
function doAttrs(el: Element) {
  if (noTr(el)) return
  const o = origAttr.get(el) ?? {}, l = lastAttr.get(el) ?? {}
  for (const a of ATTRS) {
    const cur = el.getAttribute(a); if (cur == null) continue
    if (l[a] === cur) { const out = tr(o[a]); if (out !== cur) { el.setAttribute(a, out); l[a] = out } continue }
    o[a] = cur; const out = tr(cur); l[a] = out; if (out !== cur) el.setAttribute(a, out)
  }
  origAttr.set(el, o); lastAttr.set(el, l)
}
function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) { doText(root as Text); return }
  if (root.nodeType !== Node.ELEMENT_NODE) return
  doAttrs(root as Element)
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  for (let n = w.nextNode(); n; n = w.nextNode()) { if (n.nodeType === Node.TEXT_NODE) doText(n as Text); else doAttrs(n as Element) }
}

let started = false
export function initI18n() {
  if (started) return; started = true
  document.documentElement.lang = LANGS.find(l => l.id === lang)!.html
  walk(document.body)
  new MutationObserver(ms => {
    for (const m of ms) {
      if (m.type === 'childList') m.addedNodes.forEach(n => walk(n))
      else if (m.type === 'characterData') doText(m.target as Text)
      else if (m.type === 'attributes') doAttrs(m.target as Element)
    }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS })
}
export function setLang(l: Lang) {
  if (l === lang) return
  lang = l
  try { localStorage.setItem('kixel-lang', l) } catch { /* sem armazenamento */ }
  document.documentElement.lang = LANGS.find(x => x.id === l)!.html
  walk(document.body)
  for (const fn of listeners) fn()
}
;(window as any).__i18n = { missing: () => [...missing].sort(), clear: () => missing.clear(), tr, setLang, getLang }
