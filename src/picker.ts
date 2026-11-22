import { icon } from './icons'
// Seletor de cor do Kixel: quadrado de saturação/brilho, matiz, opacidade, hex, conta-gotas e cores da paleta.
export type PickerOpts = {
  hex: string; alpha?: number; withAlpha?: boolean; swatches?: string[]
  onInput: (hex: string, alpha: number) => void   // enquanto arrasta
  onCommit: (hex: string, alpha: number) => void  // ao soltar, digitar ou escolher
}

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
function hsv2rgb(h: number, s: number, v: number): [number, number, number] {
  const f = (n: number) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)) }
  return [Math.round(f(5) * 255), Math.round(f(3) * 255), Math.round(f(1) * 255)]
}
function rgb2hsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
  let h = 0
  if (d) h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, mx ? d / mx : 0, mx]
}
const toHex = (r: number, g: number, b: number) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
const parse = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16) || 0, parseInt(hex.slice(3, 5), 16) || 0, parseInt(hex.slice(5, 7), 16) || 0]

let pop: HTMLElement | null = null, off: (() => void) | null = null
export function closePicker() { off?.(); off = null; pop?.remove(); pop = null }
export const pickerOpen = () => !!pop

export function openPicker(anchor: HTMLElement, o: PickerOpts) {
  closePicker()
  const W = 216, H = 140
  let [h, s, v] = rgb2hsv(...parse(o.hex)), a = o.alpha ?? 255, dirty = false
  const el = document.createElement('div'); el.className = 'cpop'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Seletor de cor')
  el.innerHTML = `<canvas class="sv" width="${W}" height="${H}"></canvas><i class="svh"></i>
    <div class="trk hue"><i></i></div>
    ${o.withAlpha ? '<div class="trk alp"><b></b><i></i></div>' : ''}
    <div class="crow"><span class="prev"><b></b></span><label><i>#</i><input class="hexin" maxlength="7" spellcheck="false" aria-label="Hex" /></label>${o.withAlpha ? '<label class="al"><input class="alin" type="number" min="0" max="100" aria-label="Opacidade em %" /><i>%</i></label>' : ''}${(window as any).EyeDropper ? '<button class="eye" title="Pegar cor da tela" aria-label="Pegar cor da tela"></button>' : ''}</div>
    ${o.swatches?.length ? '<div class="sws"></div>' : ''}`
  document.body.append(el); pop = el
  const sv = el.querySelector('canvas.sv') as HTMLCanvasElement, svh = el.querySelector('.svh') as HTMLElement
  const hue = el.querySelector('.hue') as HTMLElement, hueT = hue.firstElementChild as HTMLElement
  const alp = el.querySelector('.alp') as HTMLElement | null, alpB = alp?.querySelector('b') as HTMLElement | null, alpT = alp?.querySelector('i') as HTMLElement | null
  const hexin = el.querySelector('.hexin') as HTMLInputElement, alin = el.querySelector('.alin') as HTMLInputElement | null
  const prev = el.querySelector('.prev b') as HTMLElement, eye = el.querySelector('.eye') as HTMLButtonElement | null
  if (eye) eye.innerHTML = icon('picker')
  const ctx = sv.getContext('2d')!
  const cur = () => toHex(...hsv2rgb(h, s, v))
  const drawSV = () => {
    ctx.fillStyle = `hsl(${h},100%,50%)`; ctx.fillRect(0, 0, W, H)
    let g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
    g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, '#000'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  }
  const sync = (skipHex = false) => {
    const c = cur()
    svh.style.left = s * W + 'px'; svh.style.top = (1 - v) * H + 'px'; svh.style.background = c
    hueT.style.left = (h / 360) * 100 + '%'; hueT.style.background = `hsl(${h},100%,50%)`
    if (alpB && alpT) { alpB.style.background = `linear-gradient(90deg, transparent, ${c})`; alpT.style.left = (a / 255) * 100 + '%' }
    prev.style.background = c; prev.style.opacity = String(a / 255)
    if (!skipHex && document.activeElement !== hexin) hexin.value = c.slice(1)
    if (alin && document.activeElement !== alin) alin.value = String(Math.round((a / 255) * 100))
  }
  const fireInput = () => { dirty = true; o.onInput(cur(), a) }
  const fireCommit = () => { dirty = false; o.onCommit(cur(), a) }
  const drag = (node: HTMLElement, fn: (x: number, y: number, r: DOMRect) => void) => {
    node.addEventListener('pointerdown', e => {
      node.setPointerCapture(e.pointerId); const r = node.getBoundingClientRect(); fn(e.clientX - r.left, e.clientY - r.top, r)
      const mv = (ev: PointerEvent) => fn(ev.clientX - r.left, ev.clientY - r.top, r)
      const up = () => { node.removeEventListener('pointermove', mv); node.removeEventListener('pointerup', up); node.removeEventListener('pointercancel', up); fireCommit() }
      node.addEventListener('pointermove', mv); node.addEventListener('pointerup', up); node.addEventListener('pointercancel', up); e.preventDefault()
    })
  }
  drag(sv, (x, y, r) => { s = clamp(x / r.width); v = 1 - clamp(y / r.height); sync(); fireInput() })
  drag(hue, (x, _y, r) => { h = clamp(x / r.width) * 359.999; drawSV(); sync(); fireInput() })
  if (alp) drag(alp, (x, _y, r) => { a = Math.round(clamp(x / r.width) * 255); sync(); fireInput() })
  const setFromHex = (hex: string) => { [h, s, v] = rgb2hsv(...parse(hex)); drawSV(); sync() }
  hexin.addEventListener('input', () => { const t = '#' + hexin.value.replace('#', ''); if (/^#[0-9a-fA-F]{6}$/.test(t)) { setFromHex(t.toLowerCase()); fireInput() } })
  hexin.addEventListener('change', () => { const t = '#' + hexin.value.replace('#', '').trim(); if (/^#[0-9a-fA-F]{6}$/.test(t)) { setFromHex(t.toLowerCase()); fireCommit() } else hexin.value = cur().slice(1) })
  hexin.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') hexin.blur() })
  alin?.addEventListener('change', () => { a = Math.round(clamp(Number(alin.value) / 100) * 255); sync(); fireCommit() })
  alin?.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') alin.blur() })
  eye?.addEventListener('click', async () => { try { const r = await new (window as any).EyeDropper().open(); setFromHex(r.sRGBHex.toLowerCase()); fireInput(); fireCommit() } catch { /* cancelado */ } })
  const sws = el.querySelector('.sws') as HTMLElement | null
  if (sws) for (const c of o.swatches ?? []) { const b = document.createElement('button'); b.style.background = c; b.title = c; b.setAttribute('aria-label', 'Cor ' + c); b.onclick = () => { setFromHex(c); fireInput(); fireCommit() }; sws.append(b) }
  drawSV(); sync()
  // posição: ao lado do botão, sem sair da tela
  const place = () => {
    const r = anchor.getBoundingClientRect(), pw = el.offsetWidth, ph = el.offsetHeight
    let x = r.left - pw - 10; if (x < 8) x = Math.min(innerWidth - pw - 8, r.right + 10)
    el.style.left = Math.max(8, x) + 'px'; el.style.top = Math.max(8, Math.min(r.top - 8, innerHeight - ph - 8)) + 'px'
  }
  place()
  const outside = (e: PointerEvent) => { if (!el.contains(e.target as Node) && !anchor.contains(e.target as Node)) closePicker() }
  const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); closePicker() } }
  window.addEventListener('pointerdown', outside, true); window.addEventListener('keydown', esc, true); window.addEventListener('resize', closePicker)
  off = () => { window.removeEventListener('pointerdown', outside, true); window.removeEventListener('keydown', esc, true); window.removeEventListener('resize', closePicker); if (dirty) o.onCommit(cur(), a) }
}
