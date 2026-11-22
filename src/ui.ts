import { hydrateIcons, icon } from './icons'
import { LANGS, getLang, setLang, locale, tr } from './i18n'
import { openPicker, closePicker } from './picker'
import { PALETTES, PRESETS } from './data'
import type { Frame, Ref, Cont } from './doc'

export type MenuItem = { label: string; key?: string; fn?: () => void; disabled?: boolean; sep?: boolean }
export type UI = {
  setWsName(n: string): void
  saved(d: Date): void; toggleHelp(): void
  showMenu(x: number, y: number, items: MenuItem[], anchor?: HTMLElement, touch?: boolean): void; openExport(): void
  init(): void; panels(force?: boolean): void; sheet(n: 'left' | 'right' | null): void; closeRename(): void; syncZoom(): void
  toolCursor(t: string): string; renameOnStage(k: 'f' | 'c' | 'r', id: number, x: number, y: number, w: number): void; renameSelected(): void; editNote(id: number): void; editingNote(): number
  ctxSync(): void; toast(m: string): void; colorChanged(): void; toolChanged(t: string): void
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const TOOLS: [string, string, string, string][] = [
  ['select', 'Selecionar', 'V', 'Selecionar e mover'], ['hand', 'Mão', 'H', 'Mão: mover a tela (ou segure Espaço)'], ['-', '', '', ''],
  ['pencil', 'Lápis', 'B', 'Lápis'], ['eraser', 'Borracha', 'E', 'Borracha'], ['shade', 'Sombra', 'D', 'Sombra: clareia ou escurece o que já está pintado (Alt inverte)'], ['fill', 'Balde', 'G', 'Balde de tinta'], ['picker', 'Conta-gotas', 'I', 'Conta-gotas'], ['-', '', '', ''],
  ['line', 'Linha', 'L', 'Linha (Shift trava o ângulo)'], ['rect', 'Retângulo', 'U', 'Retângulo (Shift faz quadrado)'], ['ellipse', 'Elipse', 'O', 'Elipse (Shift faz círculo)'], ['marquee', 'Seleção', 'M', 'Seleção de pixels: arraste para selecionar e mover'], ['-', '', '', ''],
  ['frame', 'Quadro', 'F', 'Quadro: escolha um tamanho ou arraste na tela'], ['container', 'Contêiner', 'S', 'Contêiner: agrupa quadros'], ['anim', 'Animação', 'A', 'Animação: arraste sobre os quadros para criar um player que toca em loop'], ['note', 'Nota', 'T', 'Nota: clique na tela para escrever um comentário']
]
const DRAW = ['pencil', 'eraser', 'shade', 'fill', 'picker', 'line', 'rect', 'ellipse']
const HELP: [string, [string, string][]][] = [
  ['Ferramentas', [['Selecionar', 'V'], ['Mão (ou segure Espaço)', 'H'], ['Lápis', 'B'], ['Borracha', 'E'], ['Balde', 'G'], ['Conta-gotas', 'I'], ['Linha', 'L'], ['Retângulo', 'U'], ['Elipse', 'O'], ['Seleção de pixels', 'M'], ['Laço', 'Q'], ['Varinha mágica', 'W'], ['Quadro', 'F'], ['Contêiner', 'S'], ['Animação', 'A'], ['Nota', 'T']]],
  ['Desenho', [['Pincel menor / maior', '[  ]'], ['Espelho horizontal', 'X'], ['Espelho vertical', 'Y'], ['Cor da paleta', '1 a 0'], ['Travar ângulo, quadrado, círculo', 'Shift'], ['Apagar com o botão direito', 'Lápis / Borracha']]],
  ['Quadros e seleção', [['Selecionar vários', 'Shift + clique'], ['Selecionar tudo', 'Ctrl+A'], ['Agrupar em contêiner', 'Ctrl+G'], ['Desagrupar', 'Ctrl+Shift+G'], ['Duplicar', 'Ctrl+D'], ['Copiar / Colar', 'Ctrl+C / V'], ['Renomear', 'F2'], ['Excluir', 'Delete'], ['Mover 1 pixel', 'Setas'], ['Sem grudar nas guias', 'Ctrl ao arrastar']]],
  ['Cores',[['Sombra: clarear / escurecer','D / Alt'],['Pontilhado','Painel Ferramenta'],['Contorno, ajustar cores','Painel Cor']]],
  ['Seleção de pixels (M)', [['Esticar ou amassar', 'Arraste as alças'], ['Manter a proporção', 'Shift + alça'], ['Mover a seleção', 'Arrastar / setas'], ['Arrastar uma cópia', 'Alt + arrastar'], ['Espelhar horizontal / vertical', 'Shift+H / V'], ['Girar 90°', 'Shift+R'], ['Selecionar tudo / desmarcar', 'Ctrl+A / Ctrl+D'], ['Inverter a seleção', 'Ctrl+Shift+I'], ['Laço, varinha mágica', 'Q, W'], ['Somar à seleção', 'Shift + clique']]],
  ['Ordem e forma', [['Trazer para frente', 'Ctrl+]'], ['Enviar para trás', 'Ctrl+['], ['Espelhar horizontal / vertical', 'Shift+H / V'], ['Girar 90°', 'Shift+R'], ['Ocultar', 'Ctrl+Shift+H'], ['Bloquear imagem', 'Ctrl+Shift+L']]],
  ['Tela', [['Ver tudo', 'Shift+1'], ['Ir até o quadro', 'Shift+2'], ['Zoom', 'Roda do mouse'], ['Mover a tela', 'Botão do meio / Espaço'], ['Menu do que está sob o cursor', 'Botão direito']]],
  ['Arquivo', [['Desfazer / Refazer', 'Ctrl+Z / Ctrl+Shift+Z'], ['Salvar projeto', 'Ctrl+S'], ['Abrir projeto', 'Ctrl+O'], ['Salva sozinho no navegador', 'a cada poucos segundos'], ['Esta ajuda', '?']]]
]
const MAXROWS = 250

export function initUI(c: any): UI {
  const { doc, S, selSet, core, store, hex2rgba, hexOf } = c
  const show = (id: string, on: boolean) => { $(id).hidden = !on }
  const val = (id: string) => $<HTMLInputElement>(id)
  const setVal = (id: string, v: string) => { const e = val(id); if (document.activeElement !== e) e.value = v }
  const frameList = (): Frame[] => core.selFrames()
  let toastT = 0
  const toast = (msg: string) => { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = window.setTimeout(() => t.classList.remove('show'), 3200) }

  // ------------------------------------------------------------ ferramentas
  const tb = $('tools')
  for (const [id, , key, title] of TOOLS) { if (id === '-') { const sp = document.createElement('span'); sp.className = 'tsep'; tb.appendChild(sp); continue } const b = document.createElement('button'); b.dataset.tool = id; b.innerHTML = icon(id) + `<kbd translate="no">${key}</kbd>`; b.title = `${title} (${key})`; b.setAttribute('aria-label', title); b.onclick = () => core.setTool(id); tb.appendChild(b) }
  const toolCursor = (t: string) => (t === 'hand' ? 'grab' : ['pencil', 'eraser', 'shade', 'fill', 'picker', 'frame', 'container', 'anim', 'note', 'line', 'rect', 'ellipse', 'marquee'].includes(t) ? 'crosshair' : 'default')
  function toolChanged(t: string) {
    show('fillrow', t === 'rect' || t === 'ellipse'); show('onionrow', DRAW.includes(t)); show('tolrow', t === 'fill'); ctxSync()
    for (const b of tb.querySelectorAll('button')) b.classList.toggle('on', (b as HTMLElement).dataset.tool === t)
    const d = TOOLS.find(x => x[0] === t); if (d) $('ctool').innerHTML = icon(t) + `<span>${d[1]}</span>`
    show('presets', t === 'frame'); show('props', t !== 'frame')
    if (t === 'frame' && matchMedia('(max-width:900px)').matches) sheet('right')
    $('ov').style.cursor = toolCursor(t)
    panels(true)
  }
  const sheet = (name: 'left' | 'right' | null) => { document.body.classList.toggle('sheet-left', name === 'left'); document.body.classList.toggle('sheet-right', name === 'right') }
  for (const b of document.querySelectorAll<HTMLButtonElement>('#mtop [data-sheet]')) b.onclick = () => sheet(b.dataset.sheet as 'left' | 'right')
  $('scrim').onclick = () => sheet(null)
  for (const b of document.querySelectorAll<HTMLElement>('[data-close]')) b.onclick = () => sheet(null)

  // ------------------------------------------------------------ paleta (uma por quadro)
  const pals = [$('palette'), $('palette2')], palsel = $<HTMLSelectElement>('palsel')
  const curFrame = (): Frame | null => { core.syncSel(); return S.sel ?? (S.lastSel && doc.frames.get(S.lastSel.id) === S.lastSel ? S.lastSel : null) }
  let palKey = ''
  function renderPalette() {
    const f = curFrame(), id = f?.palId ?? S.defaultPal, colors: string[] = core.paletteById(id)
    const key = `${id}|${colors.join(',')}|${S.mine.length}`
    if (key === palKey) return
    palKey = key
    palsel.replaceChildren(); for (const p of PALETTES) { const o = new Option(`${p.name} · ${p.colors.length}`, p.id); o.translate = false; palsel.add(o) }; palsel.add(new Option(`Minha paleta · ${S.mine.length}`, 'mine')); palsel.value = id
    const info = PALETTES.find(p => p.id === id)
    $('palnote').textContent = (id === 'mine' ? 'Use + para guardar a cor atual. Shift + clique numa cor a remove. ' : info ? info.note + '. ' : '') + 'A paleta vale só para o quadro selecionado. Quadros novos herdam a do último quadro usado.'
    palsel.title = $('palnote').textContent || ''
    for (const pal of pals) {
      pal.replaceChildren()
      colors.forEach((h, i) => {
        const b = document.createElement('button'); b.style.background = h; b.dataset.hex = h; b.title = `${h}${i < 10 ? ` (tecla ${(i + 1) % 10})` : ''}`; b.setAttribute('aria-label', 'Cor ' + h)
        b.onclick = e => { if (id === 'mine' && e.shiftKey) { S.mine.splice(i, 1); store.set('kixel-mine', JSON.stringify(S.mine)); palKey = ''; renderPalette(); return } core.setColor(hex2rgba(h)) }
        pal.appendChild(b)
      })
    }
    colorChanged()
  }
  function colorChanged() {
    const h = hexOf(S.color); $('cpick').style.background = h; setVal('hex', h.slice(1))
    for (const pal of pals) for (const b of pal.querySelectorAll('button')) b.classList.toggle('on', (b as HTMLElement).dataset.hex === h)
  }
  palsel.onchange = () => {
    const id = palsel.value, targets: Frame[] = frameList().length ? frameList() : (curFrame() ? [curFrame()!] : [])
    S.defaultPal = id; store.set('kixel-pal', id)
    if (targets.length) core.change(targets, [], [], () => { for (const f of targets) f.palId = id })
    palKey = ''; renderPalette(); toast(id === 'mine' ? 'Minha paleta' : `Paleta ${PALETTES.find(p => p.id === id)?.name}`)
  }
  $('paladd').onclick = () => {
    const h = hexOf(S.color); if (!S.mine.includes(h)) S.mine.push(h); store.set('kixel-mine', JSON.stringify(S.mine))
    const f = curFrame(); if (f) core.change([f], [], [], () => { f.palId = 'mine' }); S.defaultPal = 'mine'; palKey = ''; renderPalette(); toast('Cor guardada em Minha paleta')
  }
  $('cpick').onclick = () => openPicker($('cpick'), { hex: hexOf(S.color), swatches: core.paletteOf(curFrame()), onInput: h => core.setColor(hex2rgba(h)), onCommit: h => core.setColor(hex2rgba(h)) })
  val('hex').onchange = () => { const v = '#' + val('hex').value.replace('#', '').trim(); if (/^#[0-9a-fA-F]{6}$/.test(v)) core.setColor(hex2rgba(v.toLowerCase())); else val('hex').value = hexOf(S.color).slice(1) }

  // ------------------------------------------------------------ novo quadro (presets)
  {
    const box = $('pgroups')
    for (const g of PRESETS) {
      const d = document.createElement('details'); d.className = 'pg'; d.open = !!g.open
      const sm = document.createElement('summary'); sm.textContent = g.name; d.append(sm)
      for (const it of g.items) {
        const b = document.createElement('button'); b.className = 'pr'; b.innerHTML = `<span>${it.name}</span><em>${it.w} × ${it.h}</em>`
        b.onclick = () => { core.setLastPreset(it.w, it.h); val('fw').value = String(it.w); val('fh').value = String(it.h); core.placeFrame(it.w, it.h, g.id === 'comum' ? undefined : it.name, undefined, it.pal) }
        d.append(b)
      }
      box.append(d)
    }
    const make = () => { const w = Number(val('fw').value), h = Number(val('fh').value); if (w >= 1 && h >= 1) { core.setLastPreset(w, h); core.placeFrame(w, h) } else toast('Informe largura e altura de 1 a 2048.') }
    $('fcreate').onclick = make
    for (const id of ['fw', 'fh']) $(id).addEventListener('keydown', e => { if ((e as KeyboardEvent).key === 'Enter') make() })
  }

  // ------------------------------------------------------------ barra de contexto e zoom
  $('undo').onclick = () => { doc.undo(); core.invalidate() }
  $('redo').onclick = () => { doc.redo(); core.invalidate() }
  const st = () => core.stageSize()
  $('zin').onclick = () => { core.stepZoom(st().w / 2, st().h / 2, 1); syncZoom() }
  $('zout').onclick = () => { core.stepZoom(st().w / 2, st().h / 2, -1); syncZoom() }
  $('fit').onclick = () => core.fitAll()
  $('emptygo').onclick = () => core.setTool('frame')
  $('addanim').onclick = () => core.newAnimation()
  $('mkanim').onclick = () => core.newAnimation()
  $('addcont').onclick = () => { const l = frameList(); if (l.length) core.groupSelection(); else core.setTool('container') }
  function syncZoom() { $('zlabel').textContent = Math.round(core.getCam().zoom * 100) + '%' }
  function ctxSync() {
    setVal('cbrushin', String(S.brush)); setVal('copin', String(S.opacity))
    for (const b of document.querySelectorAll<HTMLElement>('.tgl[data-opt]')) b.setAttribute('aria-pressed', String(!!S.opt[b.dataset.opt as string]))
    for (const b of document.querySelectorAll<HTMLElement>('#selmode [data-selmode]')) b.classList.toggle('on', b.dataset.selmode === S.selMode)
    for (const r of document.querySelectorAll<HTMLInputElement>('input.tol')) r.value = String(S.tol)
    for (const v of document.querySelectorAll<HTMLElement>('.tolv')) v.textContent = S.tol + '%'
    $('selhint').textContent = S.selMode === 'wand' ? 'Clique numa cor para selecionar os pixels parecidos que se tocam. Shift soma, Alt pega todos do quadro.' : S.selMode === 'lasso' ? 'Arraste para contornar à mão. Shift soma à seleção.' : 'Arraste para selecionar um retângulo.'
    show('tolrow2', S.selMode === 'wand'); show('tolrow', S.tool === 'fill'); show('shaderow', S.tool === 'shade')
    for (const b of document.querySelectorAll<HTMLElement>('#shademode [data-shade]')) b.classList.toggle('on', b.dataset.shade === S.shade)
    const dsel = $<HTMLSelectElement>('dither'); if (dsel) dsel.value = String(S.dither)
  }
  for (const b of document.querySelectorAll<HTMLElement>('#shademode [data-shade]')) b.onclick = () => { S.shade = b.dataset.shade; ctxSync() }
  $<HTMLSelectElement>('dither').onchange = e => { S.dither = Number((e.target as HTMLSelectElement).value) }
  $('adjgo').onclick = () => { core.adjustColors(Number(val('adjh').value), Number(val('adjs').value), Number(val('adjl').value)); for (const id of ['adjh', 'adjs', 'adjl']) val(id).value = '0'; adjSync() }
  function adjSync() { $('adjhv').textContent = val('adjh').value + '°'; $('adjsv').textContent = val('adjs').value + '%'; $('adjlv').textContent = val('adjl').value + '%' }
  for (const id of ['adjh', 'adjs', 'adjl']) val(id).oninput = adjSync
  $('adjinv').onclick = () => core.invertColors()
  $('adjout').onclick = () => core.outlineAuto()
  $('palramp').onclick = () => {
    let n = 0; for (const h of core.colorRamp(S.color)) if (!S.mine.includes(h)) { S.mine.push(h); n++ }
    store.set('kixel-mine', JSON.stringify(S.mine)); const f = curFrame(); if (f) core.change([f], [], [], () => { f.palId = 'mine' }); S.defaultPal = 'mine'; palKey = ''; renderPalette(); toast(n ? 'Rampa de tons guardada em Minha paleta' : 'Esses tons já estão em Minha paleta')
  }
  for (const b of document.querySelectorAll<HTMLElement>('#selmode [data-selmode]')) b.onclick = () => { S.selMode = b.dataset.selmode; ctxSync(); core.invalidate() }
  for (const r of document.querySelectorAll<HTMLInputElement>('input.tol')) r.oninput = () => { S.tol = Number(r.value); ctxSync() }
  // botões ligar/desligar (pixel perfect, espelho, zoom nítido, sombra do frame anterior, preencher formas)
  for (const b of document.querySelectorAll<HTMLButtonElement>('.tgl[data-opt]')) b.onclick = () => { const k = b.dataset.opt as string; S.opt[k] = !S.opt[k]; if (k === 'snap') core.snapZoom(); core.invalidate(); ctxSync() }
  // número editável: digitando, ou rolando o mouse com o ponteiro em cima
  function numberField(box: HTMLElement, input: HTMLInputElement, get: () => number, set: (v: number) => void, min: number, max: number, step: number) {
    const put = (v: number) => { set(Math.max(min, Math.min(max, Math.round(v)))); ctxSync() }
    input.onchange = () => put(Number(input.value) || min)
    box.addEventListener('wheel', e => { e.preventDefault(); const d = (e as WheelEvent).deltaY < 0 ? 1 : -1; put(get() + d * ((e as WheelEvent).shiftKey ? 1 : step)) }, { passive: false })
  }
  numberField($('nfbrush'), val('cbrushin'), () => S.brush, v => { S.brush = v }, 1, 32, 1)
  numberField($('nfop'), val('copin'), () => S.opacity, v => { S.opacity = v }, 1, 100, 5)

  // ------------------------------------------------------------ propriedades: quadro
  const single = (): Frame | null => (selSet.size === 1 ? S.sel : null)
  val('fname').onchange = () => { const f = single(); if (f) core.change([f], [], [], () => { f.name = val('fname').value.trim() || undefined }) }
  const moveFrameTo = () => { const f = single(); if (!f) return; const x = Math.round(Number(val('px').value)), y = Math.round(Number(val('py').value)); if (Number.isNaN(x) || Number.isNaN(y)) return; core.change([f], [], [], () => doc.moveFrame(f, x, y)) }
  val('px').onchange = moveFrameTo; val('py').onchange = moveFrameTo
  const sizeFrame = () => { const f = single(); if (!f) return; const w = Math.round(Number(val('pw').value)), h = Math.round(Number(val('ph').value)); if (w >= 1 && h >= 1) core.reshapeFrame(f, f.x, f.y, w, h) }
  val('pw').onchange = sizeFrame; val('ph').onchange = sizeFrame
  $('dup').onclick = () => core.duplicateSelection()
  $('del').onclick = () => core.deleteSelection()
  $('group').onclick = () => core.groupSelection()
  // fundo
  const setBg = (bg: string | undefined) => { const l = frameList(); core.change(l, [], [], () => { for (const f of l) { f.bg = bg; if (bg) f.trace = false } }) }
  $('fbg').onclick = () => {
    const l = frameList(); if (!l.length) return
    let before: any = null
    const cur = l[0].bg ?? '#ffffff'
    openPicker($('fbg'), { hex: cur, swatches: core.paletteOf(l[0]), onInput: h => { if (!before) before = core.snap(l, [], []); for (const f of l) { f.bg = h; f.trace = false } core.touch() },
      onCommit: h => { if (before) { for (const f of l) { f.bg = h; f.trace = false } core.commitSnap(before, core.snap(l, [], [])); before = null; core.touch() } else if (l.some(f => f.bg !== h)) setBg(h) } })
  }
  $('fbgnone').onclick = () => setBg(undefined)
  // camadas do quadro
  $('ladd').onclick = () => { const f = single(); if (f) core.layerAdd(f) }
  $('ldup').onclick = () => { const f = single(); if (f) core.layerDup(f) }
  $('ldel').onclick = () => { const f = single(); if (f) core.layerDel(f) }
  $('lup').onclick = () => { const f = single(); if (f) core.layerMove(f, 1) }
  $('ldown').onclick = () => { const f = single(); if (f) core.layerMove(f, -1) }

  // ------------------------------------------------------------ propriedades: contêiner e referência
  const cont = (): Cont | null => S.selCont
  val('cname').onchange = () => { const k = cont(); if (k) core.change([], [], [k], () => { k.name = val('cname').value.trim() }) }
  const moveCont = () => {
    const k = cont(); if (!k) return; const x = Math.round(Number(val('cx').value)), y = Math.round(Number(val('cy').value)); if (Number.isNaN(x) || Number.isNaN(y)) return
    const m = doc.members(k.id), dx = x - k.x, dy = y - k.y
    core.change(m.frames, m.refs, [k], () => { k.x = x; k.y = y; for (const f of m.frames) doc.moveFrame(f, f.x + dx, f.y + dy); for (const r of m.refs) { r.x += dx; r.y += dy } })
  }
  val('cx').onchange = moveCont; val('cy').onchange = moveCont
  const sizeCont = () => { const k = cont(); if (!k) return; const w = Math.round(Number(val('cw').value)), h = Math.round(Number(val('ch').value)); if (w >= 8 && h >= 8) core.change([], [], [k], () => { k.w = w; k.h = h }) }
  val('cw').onchange = sizeCont; val('ch').onchange = sizeCont
  $('cfit').onclick = () => { const k = cont(); if (k) core.fitContainer(k) }
  $('cungroup').onclick = () => { const k = cont(); if (k) core.ungroup(k) }

  const ref = (): Ref | null => S.selRef
  val('rname').onchange = () => { const r = ref(); if (r) core.change([], [r], [], () => { r.name = val('rname').value.trim() || r.name }) }
  let opBefore: any = null
  val('refop').oninput = () => { const r = ref(); if (!r) return; if (!opBefore) opBefore = core.snap([], [r], []); r.opacity = Number(val('refop').value) / 100; $('refopv').textContent = val('refop').value + '%'; core.invalidate() }
  val('refop').onchange = () => { const r = ref(); if (r && opBefore) core.commitSnap(opBefore, core.snap([], [r], [])); opBefore = null }
  $('reflock').onclick = () => { const r = ref(); if (r) core.change([], [r], [], () => { r.locked = !r.locked }) }
  $('refabove').onclick = () => { const r = ref(); if (r) core.change([], [r], [], () => { r.above = !r.above }) }
  let rtab = 'img'
  for (const b of document.querySelectorAll<HTMLButtonElement>('#rtabs [data-rtab]')) b.onclick = () => { rtab = b.dataset.rtab!; panels(true) }
  $('sltrim').onclick = () => $('sltrim').setAttribute('aria-pressed', String($('sltrim').getAttribute('aria-pressed') !== 'true'))
  $('reffit').onclick = () => { const r = ref(); if (r) core.traceFit(r) }
  $('refpix').onclick = () => { const r = ref(); if (r) core.pixelateRef(r) }
  $('refpin').onclick = () => { const r = ref(); if (r) core.pinRef(r) }
  $('refdel').onclick = () => { const r = ref(); if (r) core.removeRef(r) }
  $('refload').onclick = () => val('reffile').click()
  val('reffile').onchange = e => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void core.loadImage(f, f.name); (e.target as HTMLInputElement).value = '' }
  $('refdemo').onclick = () => core.demoImage()
  $('pinclose').onclick = () => { $('pin').hidden = true }
  { // janela de referência fixa: arrastável
    const pin = $('pin'), bar = pin.querySelector('.pinbar') as HTMLElement
    let d: { x: number; y: number; l: number; t: number } | null = null
    bar.addEventListener('pointerdown', e => { if ((e.target as HTMLElement).closest('button')) return; bar.setPointerCapture(e.pointerId); const r = pin.getBoundingClientRect(); d = { x: e.clientX, y: e.clientY, l: r.left, t: r.top } })
    bar.addEventListener('pointermove', e => { if (!d) return; pin.style.left = d.l + e.clientX - d.x + 'px'; pin.style.top = d.t + e.clientY - d.y + 'px'; pin.style.right = 'auto'; pin.style.bottom = 'auto' })
    bar.addEventListener('pointerup', () => { d = null })
  }

  // ------------------------------------------------------------ exportar
  $('export').onclick = () => void core.exportAs(val('efmt').value, val('escale').value, val('ebg').checked, val('eanim').checked)
  $('ecopy').onclick = () => void core.copyPng(val('escale').value, val('ebg').checked)
  val('escale').onchange = () => panels(true); val('efmt').onchange = () => panels(true)

  // ------------------------------------------------------------ desempenho
  for (const b of document.querySelectorAll<HTMLButtonElement>('.stress [data-n]')) b.onclick = () => core.spawn(Number(b.dataset.n))
  $('clear').onclick = () => { doc.clearFrames(); core.clearSel(); core.invalidate() }
  $('bench').onclick = () => void core.runBench(10)

  // ------------------------------------------------------------ renomear (no canvas e na árvore)
  let renameEl: HTMLInputElement | null = null
  const nameOf = (k: 'f' | 'c' | 'r' | 'n', id: number): string => (k === 'n' ? ((noteOf(id)?.text || 'Nota vazia').split('\n')[0].slice(0, 40)) : k === 'f' ? core.fname(doc.frames.get(id)) : k === 'c' ? core.cname(doc.conts.get(id)) : (doc.refs.find((r: Ref) => r.id === id)?.name ?? ''))
  function commitName(k: 'f' | 'c' | 'r', id: number, v: string) {
    v = v.trim()
    if (k === 'f') { const f = doc.frames.get(id); if (f) core.change([f], [], [], () => { f.name = v || undefined }) }
    else if (k === 'c') { const q = doc.conts.get(id); if (q) core.change([], [], [q], () => { q.name = v }) }
    else { const r = doc.refs.find((q: Ref) => q.id === id); if (r && v) core.change([], [r], [], () => { r.name = v }) }
    panels(true)
  }
  function attachRename(inp: HTMLInputElement, k: 'f' | 'c' | 'r', id: number, onClose?: () => void) {
    let done = false
    const close = (ok: boolean) => { if (done) return; done = true; if (ok) commitName(k, id, inp.value); inp.remove(); if (renameEl === inp) renameEl = null; onClose?.() }
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') close(true); else if (e.key === 'Escape') close(false) })
    inp.addEventListener('blur', () => close(true))
    inp.addEventListener('pointerdown', e => e.stopPropagation())
    inp.addEventListener('dblclick', e => e.stopPropagation())
    inp.value = k === 'f' && !doc.frames.get(id)?.name ? core.fname(doc.frames.get(id)) : nameOf(k, id)
    let selected = false
    const grab = () => { if (!inp.isConnected || done) return; if (document.activeElement !== inp) inp.focus(); if (!selected) { inp.select(); selected = true } }
    grab(); setTimeout(grab, 0); requestAnimationFrame(grab); setTimeout(grab, 60)   // garante o foco mesmo se a lista for redesenhada logo depois do clique
  }
  function renameOnStage(k: 'f' | 'c' | 'r', id: number, x: number, y: number, w: number) {
    closeRename()
    const inp = document.createElement('input'); inp.className = 'rename-in'; inp.style.left = x + 'px'; inp.style.top = y + 'px'; inp.style.width = w + 'px'; inp.spellcheck = false
    $('stage').appendChild(inp); renameEl = inp; attachRename(inp, k, id)
  }
  function closeRename() { renameEl?.blur(); renameEl = null }
  function renameSelected() {
    core.syncSel()
    const id = S.selCont ? 'cname' : S.selRef ? 'rname' : 'fname'
    if (id === 'fname' && selSet.size !== 1) return
    const e = val(id); e.focus(); e.select()
  }

  // ------------------------------------------------------------ ajuda e estado de salvamento
  let helpEl: HTMLElement | null = null
  function toggleHelp() {
    if (helpEl) { helpEl.remove(); helpEl = null; return }
    const w = document.createElement('div'); w.id = 'helpwin'
    w.innerHTML = `<div class="card" role="dialog" aria-label="Atalhos de teclado"><h3>Atalhos de teclado</h3><p class="s">Aperte ? ou Esc para fechar. Em celular, use os botões e os gestos: 2 dedos movem e dão zoom, toque rápido com 2 dedos desfaz.</p><div class="cols">${HELP.map(([t, rows]) => `<div><h5>${t}</h5>${rows.map(([a, k]) => `<div class="k"><span>${a}</span><kbd translate="no">${k}</kbd></div>`).join('')}</div>`).join('')}</div></div>`
    w.onclick = e => { if (e.target === w) toggleHelp() }
    document.body.append(w); helpEl = w
  }
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && helpEl) toggleHelp() }, true)
  { const b = document.createElement('button'); b.className = 'help'; b.innerHTML = icon('keyboard'); b.title = 'Atalhos de teclado (?)'; b.setAttribute('aria-label', 'Atalhos de teclado'); b.onclick = toggleHelp; $('zoombox').append(b) }
  const saved = (d: Date) => { $('savestat').textContent = 'salvo às ' + d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) }

  // ------------------------------------------------------------ alinhar, importar, fatiar
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-al]')) b.onclick = () => core.alignFrames(b.dataset.al)
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-di]')) b.onclick = () => core.distributeFrames(b.dataset.di)
  $('aseload').onclick = () => val('asefile').click()
  val('asefile').onchange = e => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void core.importAseprite(f); (e.target as HTMLInputElement).value = '' }
  $('palimport').onclick = () => val('palfile').click()
  val('palfile').onchange = e => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void core.importPaletteFile(f); (e.target as HTMLInputElement).value = ''; palKey = '' }
  $('slgo').onclick = () => { const r = S.selRef; if (r) core.sliceSheet(r, Number(val('slw').value), Number(val('slh').value), $('sltrim').getAttribute('aria-pressed') === 'true') }
  $('xgo').onclick = () => { const r = S.selRef; if (r) { core.extractPalette(r, Number(val('xn').value) || 16); palKey = '' } }
  val('fdur').onchange = () => { const f = single(); const v = Math.round(Number(val('fdur').value)); if (f) core.change([f], [], [], () => { f.dur = v >= 10 ? v : undefined }) }
  // opacidade da camada
  let lopBefore: any = null
  val('lop').oninput = () => { const f = single(); if (!f?.layers) return; if (!lopBefore) lopBefore = core.layersState(f); core.layerOpacityLive(f, f.activeLayer, Number(val('lop').value) / 100); $('lopv').textContent = val('lop').value + '%' }
  val('lop').onchange = () => { const f = single(); if (f && lopBefore) core.layerCommit(f, lopBefore); lopBefore = null; layKey = ''; panels(true) }
  $('lmerge').onclick = () => { const f = single(); if (f) core.layerMergeDown(f) }

  // ------------------------------------------------------------ cores do quadro (como "Selection colors" do Figma)
  let selKey = '', selToken: any = null
  const hex6 = (c: number) => '#' + [(c >>> 24) & 255, (c >>> 16) & 255, (c >>> 8) & 255].map(v => v.toString(16).padStart(2, '0')).join('')
  const rgbaOf = (hex: string, a: number) => (((parseInt(hex.slice(1, 3), 16) << 24) | (parseInt(hex.slice(3, 5), 16) << 16) | (parseInt(hex.slice(5, 7), 16) << 8) | a) >>> 0)
  function buildSelColors(frames: Frame[]) {
    const box = $('selcols'); box.replaceChildren()
    const rows: { rgba: number; n: number }[] | null = core.frameColors(frames)
    if (!rows) { box.innerHTML = '<p class="hint">Quadro grande demais para listar as cores.</p>'; return }
    if (!rows.length) { box.innerHTML = '<p class="hint">Sem pixels pintados.</p>'; return }
    for (const row of rows.slice(0, 24)) {
      let cur = row.rgba
      const el = document.createElement('div'); el.className = 'scol'
      const cp = document.createElement('button'); cp.className = 'swbtn'; cp.style.background = hex6(cur); cp.setAttribute('aria-label', 'Cor'); cp.title = 'Abrir o seletor de cor'
      const hx = document.createElement('input'); hx.className = 'hx'; hx.value = hex6(cur).slice(1); hx.maxLength = 7; hx.spellcheck = false; hx.setAttribute('aria-label', 'Hex')
      const al = document.createElement('input'); al.className = 'al'; al.type = 'number'; al.min = '0'; al.max = '100'; al.value = String(Math.round(((cur & 255) / 255) * 100)); al.setAttribute('aria-label', 'Opacidade em %')
      const n = document.createElement('small'); n.textContent = row.n.toLocaleString(locale()) + ' px'; n.title = 'Quantidade de pixels com esta cor'
      const apply = (to: number, live: boolean) => {
        if (to === cur) return
        if (!selToken) selToken = core.recolorBegin(frames)
        core.recolorFrames(frames, cur, to); cur = to
        if (!live) (document.activeElement as HTMLElement | null)?.blur()
        hx.value = hex6(cur).slice(1); al.value = String(Math.round(((cur & 255) / 255) * 100)); cp.style.background = hex6(cur)
        if (!live) { core.recolorEnd(selToken); selToken = null; selKey = ''; panels(true) }
      }
      cp.onclick = () => openPicker(cp, { hex: hex6(cur), alpha: cur & 255, withAlpha: true, swatches: core.paletteOf(frames[0]),
        onInput: (h, a) => apply(rgbaOf(h, a), true),
        onCommit: (h, a) => { apply(rgbaOf(h, a), true); if (selToken) { core.recolorEnd(selToken); selToken = null } selKey = ''; panels(true) } })
      hx.onchange = () => { const v = '#' + hx.value.replace('#', '').trim(); if (/^#[0-9a-fA-F]{6}$/.test(v)) apply(rgbaOf(v.toLowerCase(), cur & 255), false); else hx.value = hex6(cur).slice(1) }
      al.onchange = () => { const pct = Math.max(0, Math.min(100, Number(al.value) || 0)); apply(rgbaOf(hex6(cur), Math.round((pct / 100) * 255)), false) }
      el.append(cp, hx, al, n); box.append(el)
    }
    if (rows.length > 24) { const m = document.createElement('p'); m.className = 'hint'; m.textContent = `+ ${rows.length - 24} cores menos usadas`; box.append(m) }
  }

  // ------------------------------------------------------------ espaço de trabalho: nome, início e compartilhar
  // menu principal (como o do Figma): o logo abre; o primeiro item volta para a tela inicial
  $('homebtn').onclick = () => {
    if (menuEl && menuAnchor === $('homebtn')) { closeMenu(); return }   // clicar de novo no logo fecha o menu
    const r = $('homebtn').getBoundingClientRect()
    showMenu(r.left, r.bottom + 6, [
      { label: 'Voltar para a tela inicial', fn: () => core.goHome() }, { sep: true, label: '' },
      { label: 'Novo espaço de trabalho', fn: () => core.newWorkspace() },
      { label: 'Abrir arquivo .kixel…', key: 'Ctrl+O', fn: () => val('projfile').click() },
      { label: 'Baixar arquivo .kixel', key: 'Ctrl+S', fn: () => void core.saveProject() },
      { label: 'Importar .aseprite…', fn: () => val('asefile').click() }, { sep: true, label: '' },
      { label: 'Desfazer', key: 'Ctrl+Z', fn: () => { doc.undo(); core.invalidate() } }, { label: 'Refazer', key: 'Ctrl+Shift+Z', fn: () => { doc.redo(); core.invalidate() } },
      { label: 'Selecionar tudo', key: 'Ctrl+A', fn: () => core.selectFrames([...doc.frames.values()].filter((f: Frame) => !f.hidden)) }, { label: 'Ver tudo', key: 'Shift+1', fn: () => core.fitAll() }, { sep: true, label: '' },
      { label: 'Atalhos de teclado', key: '?', fn: () => toggleHelp() }, { sep: true, label: '' },
      { label: 'Idioma', disabled: true }, ...LANGS.map(l => ({ label: (getLang() === l.id ? '✓  ' : '     ') + l.name, fn: () => setLang(l.id) }))
    ], $('homebtn'))
  }
  val('wsname').onchange = () => core.renameWs(val('wsname').value)
  val('wsname').addEventListener('keydown', e => { e.stopPropagation(); if ((e as KeyboardEvent).key === 'Enter') val('wsname').blur() })
  const setWsName = (n: string) => { val('wsname').value = n }

  // ------------------------------------------------------------ menu de botão direito
  let menuEl: HTMLElement | null = null, menuAnchor: HTMLElement | null = null
  const closeMenu = () => { menuEl?.remove(); menuEl = null; menuAnchor = null }
  function showMenu(x: number, y: number, items: MenuItem[], anchor?: HTMLElement, touch = false) {
    closeMenu(); closeRename(); menuAnchor = anchor ?? null
    let armed = !touch   // menu do toque longo: ignora o clique gerado ao levantar o dedo
    if (touch) window.addEventListener('pointerup', () => setTimeout(() => { armed = true }, 120), { once: true })
    const m = document.createElement('div'); m.className = 'cmenu'; m.setAttribute('role', 'menu')
    for (const it of items) {
      if (it.sep) { m.append(document.createElement('hr')); continue }
      const b = document.createElement('button'); b.disabled = !!it.disabled; b.setAttribute('role', 'menuitem')
      b.innerHTML = `<span>${it.label}</span>${it.key ? `<kbd translate="no">${it.key}</kbd>` : ''}`
      b.onclick = () => { if (!armed) return; closeMenu(); it.fn?.() }
      m.append(b)
    }
    document.body.append(m); menuEl = m
    const r = m.getBoundingClientRect()
    const ty = touch ? (y - r.height - 18 >= 6 ? y - r.height - 18 : y + 30) : y   // no toque, o menu aparece longe do dedo
    m.style.left = Math.max(6, Math.min(x, innerWidth - r.width - 6)) + 'px'; m.style.top = Math.max(6, Math.min(ty, innerHeight - r.height - 6)) + 'px'
  }
  window.addEventListener('pointerdown', e => { if (menuEl && !menuEl.contains(e.target as Node) && !(menuAnchor && menuAnchor.contains(e.target as Node))) closeMenu() }, true)
  window.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu() }, true)
  window.addEventListener('blur', closeMenu); window.addEventListener('resize', closeMenu)
  function openExport() { tab = 'exportar'; sheet(matchMedia('(max-width:900px)').matches ? 'right' : null); panels(true) }

  // ------------------------------------------------------------ animação (contêiner = sequência de quadros; o player fica na tela, em player.ts)
  const fpsOf = (k: Cont) => k.fps ?? 8
  function syncAnim() {
    const k = S.selCont as Cont | null; if (!k) return
    const list: Frame[] = core.animFrames(k), same = core.animSame(list)
    $('animnote').textContent = !k.anim ? 'Ligue o player para ver os quadros do contêiner tocando em loop, ao lado dele, na tela.' : list.length < 2 ? 'Jogue 2 ou mais quadros de mesmo tamanho dentro do contêiner. Eles tocam no player em ordem de posição.' : same ? `${list.length} frames. Ordem: de cima para baixo, da esquerda para a direita.` : 'Os quadros têm tamanhos diferentes: igualem para exportar.'
    $('animtoggle').setAttribute('aria-pressed', String(!!k.anim)); show('animopts', true); show('orderrow', !!k.order)
    if (document.activeElement !== val('fps')) val('fps').value = String(fpsOf(k))
    const can = list.length >= 2 && same
    for (const id of ['gifout', 'aseanim', 'godotout']) $(id).toggleAttribute('disabled', !can)
  }
  $('animtoggle').onclick = () => { const k = S.selCont; if (k) core.setAnim(k, !k.anim) }
  val('fps').onchange = () => { const k = S.selCont; if (k) { k.fps = Math.max(1, Math.min(120, Number(val('fps').value) || 8)); core.touch() } }
  $('animorder').onclick = () => { const k = S.selCont; if (k) core.setAnimOrder(k, undefined) }
  $('animnew').onclick = () => { const k = S.selCont; if (k) core.animAddFrame(k) }
  $('gifout').onclick = () => { const k = S.selCont; if (k) core.exportGif(k, fpsOf(k), val('gifscale').value, false) }
  $('aseanim').onclick = () => { const k = S.selCont; if (k) void core.exportAseAnim(k, fpsOf(k)) }
  $('godotout').onclick = () => { const k = S.selCont; if (k) core.exportGodot(k) }

  // ------------------------------------------------------------ notas
  let noteEd: HTMLTextAreaElement | null = null, noteEdId = 0
  const editingNote = () => (noteEd ? noteEdId : 0)
  function editNote(id: number) {
    closeRename(); noteEd?.blur()
    const n = noteOf(id); if (!n) return
    const a = core.w2s(n.x, n.y), z = core.getCam().zoom
    const ta = document.createElement('textarea'); ta.className = 'note-in'; ta.value = n.text; ta.spellcheck = false
    ta.style.cssText += `;left:${a.x}px;top:${a.y}px;width:${n.w * z}px;height:${n.h * z}px;background:${n.color};font-size:${Math.max(10, n.size * z)}px;padding:${Math.max(4, n.size * z * 0.6)}px`
    $('stage').appendChild(ta); noteEd = ta; noteEdId = id; core.invalidate()
    let done = false
    const close = (ok: boolean) => { if (done) return; done = true; const v = ta.value; ta.remove(); noteEd = null; if (ok && v !== n.text) core.change([], [], [], () => { n.text = v }, false, [n]); core.invalidate(); treeKeyReset() }
    ta.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') close(false) })
    ta.addEventListener('blur', () => close(true)); ta.addEventListener('pointerdown', e => e.stopPropagation()); ta.addEventListener('wheel', e => e.stopPropagation())
    setTimeout(() => { ta.focus(); ta.select() }, 0)
  }
  const treeKeyReset = () => { treeKey = '' }
  const nsel = () => S.selNote
  val('ntext').oninput = () => {}
  $('ntext').addEventListener('change', () => { const n = nsel(); const v = (val('ntext') as unknown as HTMLTextAreaElement).value; if (n && v !== n.text) core.change([], [], [], () => { n.text = v }, false, [n]) })
  val('nw').onchange = () => { const n = nsel(); const v = Number(val('nw').value); if (n && v >= 4) core.change([], [], [], () => { n.w = Math.round(v) }, false, [n]) }
  val('nh').onchange = () => { const n = nsel(); const v = Number(val('nh').value); if (n && v >= 4) core.change([], [], [], () => { n.h = Math.round(v) }, false, [n]) }
  val('nsize').onchange = () => { const n = nsel(); const v = Number(val('nsize').value); if (n && v > 0) core.change([], [], [], () => { n.size = v }, false, [n]) }
  $('ndel').onclick = () => { const n = nsel(); if (n) core.removeNote(n) }
  $('addnote').onclick = () => core.setTool('note')
  { const box = $('ncolors'); for (const col of core.NOTE_COLORS) { const b = document.createElement('button'); b.style.background = col; b.dataset.c = col; b.setAttribute('aria-label', 'Cor ' + col); b.onclick = () => { const n = nsel(); if (n) core.change([], [], [], () => { n.color = col }, false, [n]) }; box.append(b) } }
  // projeto
  val('projfile').onchange = e => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void core.importProjectFile(f); (e.target as HTMLInputElement).value = '' }

  // ------------------------------------------------------------ árvore de camadas: quadros, referências e contêineres juntos
  let treeKey = '', thumbs = new Map<number, HTMLCanvasElement>()
  const noteOf = (id: number) => doc.notes.find((n: any) => n.id === id)
  const parentOf = (k: string): number | undefined => { const id = Number(k.slice(2)); return k[0] === 'f' ? doc.frames.get(id)?.parent : k[0] === 'r' ? doc.refs.find((r: Ref) => r.id === id)?.parent : undefined }
  const exists = (k: string) => { const id = Number(k.slice(2)); return k[0] === 'n' ? !!noteOf(id) : k[0] === 'f' ? doc.frames.has(id) : k[0] === 'r' ? doc.refs.some((r: Ref) => r.id === id) : doc.conts.has(id) }
  function drawThumb(cv: HTMLCanvasElement, f: Frame) {
    if (f.w * f.h > 262144) { if (!cv.width || cv.width === 24) { cv.width = 48; cv.height = Math.max(1, Math.round(48 * f.h / f.w)) } }
    else if (cv.width !== f.w || cv.height !== f.h) { cv.width = f.w; cv.height = f.h }
    if (f.w * f.h > 262144) return
    const img = new ImageData(f.w, f.h); img.data.set(f.px); cv.getContext('2d')!.putImageData(img, 0, 0)
  }
  const ab = (ic: string, title: string, on: boolean, fn: () => void) => { const b = document.createElement('button'); b.className = 'ab' + (on ? ' keep' : ''); b.innerHTML = icon(ic); b.title = title; b.setAttribute('aria-label', title); b.onclick = e => { e.stopPropagation(); fn() }; b.ondblclick = e => e.stopPropagation(); return b }
  function moveItem(key: string, target: string, pos: 'above' | 'below' | 'into') {
    if (key === target) return
    const kind = key[0], id = Number(key.slice(2)), tid = Number(target.slice(2))
    const f = kind === 'f' ? doc.frames.get(id) : undefined, r = kind === 'r' ? doc.refs.find((q: Ref) => q.id === id) : undefined
    const cn = kind === 'c' ? doc.conts.get(id) : undefined
    if (cn && target[0] === 'f' && doc.frames.get(tid)?.parent === id) return
    let destCont: Cont | undefined = pos === 'into' ? doc.conts.get(tid) : undefined
    if (!destCont && target[0] !== 'c') destCont = doc.conts.get(parentOf(target) ?? -1)
    if (cn) destCont = undefined
    const fr = f ? [f] : [], rf = r ? [r] : [], cs: Cont[] = [...(cn ? [cn] : []), ...(destCont ? [destCont] : [])]
    core.change(fr, rf, cs, () => {
      doc.dropKey(key)
      const t = doc.zorder.indexOf(target)
      doc.zorder.splice(t < 0 ? doc.zorder.length : pos === 'below' ? t : t + 1, 0, key)
      const item = f ?? r
      if (item) {
        item.parent = destCont?.id
        if (destCont) { const pd = Math.max(3, Math.min(8, Math.round(Math.max(item.w, item.h) * 0.2))); const b = { x: Math.min(destCont.x, item.x - pd), y: Math.min(destCont.y, item.y - pd), x2: Math.max(destCont.x + destCont.w, item.x + item.w + pd), y2: Math.max(destCont.y + destCont.h, item.y + item.h + pd) }; destCont.x = Math.round(b.x); destCont.y = Math.round(b.y); destCont.w = Math.round(b.x2 - b.x); destCont.h = Math.round(b.y2 - b.y) }
      }
    }, true)
  }
  let dragKey = ''
  function buildTree() {
    const tree = $('tree'); tree.replaceChildren(); thumbs = new Map()
    const order: string[] = [...doc.zorder].reverse().filter(exists)
    let rows = 0
    const add = (k: string, depth: number) => {
      if (rows >= MAXROWS) return
      rows++
      const kind = k[0] as 'f' | 'r' | 'c' | 'n', id = Number(k.slice(2))
      const el = document.createElement('div'); el.className = 'tr'; el.style.setProperty('--d', String(depth)); el.draggable = true; el.dataset.key = k; el.setAttribute('role', 'treeitem')
      let on = false, off = false, extra = ''
      if (kind === 'f') {
        const f = doc.frames.get(id)!; on = selSet.has(f); off = !!f.hidden; extra = `${f.w}×${f.h}`
        const cv = document.createElement('canvas'); drawThumb(cv, f); thumbs.set(id, cv); el.append(cv)
      } else if (kind === 'n') {
        const n = noteOf(id)!; on = S.selNote === n
        const ic = document.createElement('span'); ic.className = 'ic'; ic.innerHTML = icon('note'); el.append(ic)
      } else if (kind === 'r') {
        const r = doc.refs.find((q: Ref) => q.id === id)!; on = S.selRef === r; off = !!r.hidden; extra = `${r.nw}×${r.nh}`
        const ic = document.createElement('span'); ic.className = 'ic'; ic.innerHTML = icon('image'); el.append(ic)
      } else {
        const cn = doc.conts.get(id)!; on = S.selCont === cn
        const ch = document.createElement('span'); ch.className = 'ic'; ch.innerHTML = icon(cn.collapsed ? 'chevr' : 'chevd'); ch.style.cursor = 'pointer'
        ch.onclick = e => { e.stopPropagation(); core.change([], [], [cn], () => { cn.collapsed = !cn.collapsed }) }
        const ic = document.createElement('span'); ic.className = 'ic'; ic.innerHTML = icon(cn.anim ? 'film' : 'folder'); el.append(ch, ic)
        extra = String(doc.members(id).frames.length)
      }
      if (on) el.classList.add('on'); if (off) el.classList.add('off')
      const t = document.createElement('span'); t.className = 't'; t.translate = false; t.textContent = nameOf(kind, id); el.append(t)
      const e = document.createElement('span'); e.className = 'e'; e.textContent = extra; el.append(e)
      if (kind === 'f') { const f = doc.frames.get(id)!; el.append(ab(f.hidden ? 'eyeoff' : 'eye', f.hidden ? 'Mostrar' : 'Ocultar', !!f.hidden, () => core.change([f], [], [], () => { f.hidden = !f.hidden || undefined }))) }
      if (kind === 'r') {
        const r = doc.refs.find((q: Ref) => q.id === id)!
        el.append(ab(r.locked ? 'lock' : 'unlock', r.locked ? 'Desbloquear' : 'Bloquear', r.locked, () => core.change([], [r], [], () => { r.locked = !r.locked })))
        el.append(ab(r.hidden ? 'eyeoff' : 'eye', r.hidden ? 'Mostrar' : 'Ocultar', r.hidden, () => core.change([], [r], [], () => { r.hidden = !r.hidden })))
      }
      el.oncontextmenu = ev => {
        ev.preventDefault()
        if (kind === 'f') { const q = doc.frames.get(id)!; if (!selSet.has(q)) core.selectFrame(q) } else if (kind === 'c') core.selectCont(doc.conts.get(id)!); else if (kind === 'n') core.selectNote(noteOf(id)!); else core.selectRef(doc.refs.find((q: Ref) => q.id === id)!)
        panels(true); const cm = core.getCam(); core.openContext(ev.clientX, ev.clientY, cm.x, cm.y)
      }
      el.onclick = ev => {
        if (kind === 'f') { const f = doc.frames.get(id)!; core.selectFrame(f, ev.shiftKey); if (!ev.shiftKey) core.focusFrame(f) }
        else if (kind === 'c') core.selectCont(doc.conts.get(id)!)
        else if (kind === 'n') { const n = noteOf(id)!; core.selectNote(n); core.fitRect(core.boundsOf([n]), 0.6) }
        else { const r = doc.refs.find((q: Ref) => q.id === id)!; core.selectRef(r); core.fitRect(core.boundsOf([r]), 0.7) }
        panels(true)
      }
      el.ondblclick = () => {
        if (kind === 'n') { editNote(id); return }
        const inp = document.createElement('input'); inp.className = 'ren'; inp.spellcheck = false
        el.draggable = false; t.replaceWith(inp); attachRename(inp, kind, id, () => { treeKey = ''; panels(true) })
      }
      el.ondragstart = ev => { dragKey = k; ev.dataTransfer!.setData('text/plain', k); ev.dataTransfer!.effectAllowed = 'move'; setTimeout(() => el.classList.add('dragging'), 0) }
      el.ondragend = () => { dragKey = ''; el.classList.remove('dragging'); clearDrop() }
      el.ondragover = ev => { if (!dragKey) return; ev.preventDefault(); const p = dropPos(ev, el, kind); clearDrop(); el.classList.add(p === 'above' ? 'dropb' : p === 'below' ? 'dropa' : 'dropi') }
      el.ondragleave = () => { el.classList.remove('dropb', 'dropa', 'dropi') }
      el.ondrop = ev => { ev.preventDefault(); const p = dropPos(ev, el, kind), key = dragKey; dragKey = ''; clearDrop(); if (key) { moveItem(key, k, p); treeKey = ''; panels(true) } }
      tree.append(el)
      if (kind === 'c' && !doc.conts.get(id)!.collapsed) for (const ck of order) if (parentOf(ck) === id) add(ck, depth + 1)
    }
    for (const k of order) if (parentOf(k) === undefined || !doc.conts.has(parentOf(k)!)) add(k, 0)
    if (!order.length) { const m = document.createElement('div'); m.className = 'more'; m.textContent = 'Nada aqui ainda. Use a ferramenta Quadro (F).'; tree.append(m) }
    else if (rows >= MAXROWS) { const m = document.createElement('div'); m.className = 'more'; m.textContent = `Mostrando ${MAXROWS} de ${order.length.toLocaleString(locale())} itens`; tree.append(m) }
    $('lcount').textContent = `· ${order.length.toLocaleString(locale())}`
  }
  const dropPos = (ev: DragEvent, el: HTMLElement, kind: string): 'above' | 'below' | 'into' => {
    const r = el.getBoundingClientRect(), y = (ev.clientY - r.top) / r.height
    if (kind === 'c' && dragKey[0] !== 'c' && y > 0.28 && y < 0.72) return 'into'
    return y < 0.5 ? 'above' : 'below'
  }
  const clearDrop = () => { for (const e of $('tree').querySelectorAll('.dropb,.dropa,.dropi')) e.classList.remove('dropb', 'dropa', 'dropi') }

  // ------------------------------------------------------------ camadas do quadro selecionado
  let layKey = '', dragLayer = 0
  function buildLayers(f: Frame) {
    const box = $('llist'); box.replaceChildren()
    { const act = f.layers?.find((q: any) => q.id === f.activeLayer); val('lop').disabled = !f.layers; if (document.activeElement !== val('lop')) { val('lop').value = String(Math.round((act?.op ?? 1) * 100)); $('lopv').textContent = val('lop').value + '%' } }
    const L = f.layers ?? [{ id: 1, name: tr('Camada') + ' 1', vis: true }]
    for (const l of [...L].reverse()) {
      const el = document.createElement('div'); el.className = 'ly' + (l.id === f.activeLayer ? ' on' : '') + (l.vis ? '' : ' off')
      const t = document.createElement('span'); t.className = 't'; t.translate = false; t.textContent = l.name
      el.append(ab(l.vis ? 'eye' : 'eyeoff', l.vis ? 'Ocultar camada' : 'Mostrar camada', !l.vis, () => core.layerToggle(f, l.id)), t)
      el.draggable = !!f.layers
      el.ondragstart = ev => { dragLayer = l.id; ev.dataTransfer!.setData('text/plain', 'layer'); ev.dataTransfer!.effectAllowed = 'move' }
      el.ondragend = () => { dragLayer = 0; for (const q of box.querySelectorAll('.dropi')) q.classList.remove('dropi') }
      el.ondragover = ev => { if (dragLayer) { ev.preventDefault(); el.classList.add('dropi') } }
      el.ondragleave = () => el.classList.remove('dropi')
      el.ondrop = ev => { ev.preventDefault(); el.classList.remove('dropi'); const id = dragLayer; dragLayer = 0; if (id && f.layers) { const to = f.layers.findIndex(q => q.id === l.id); core.layerReorder(f, id, to) } }
      el.onclick = () => { core.layerSetActive(f, l.id); panels(true) }
      el.ondblclick = () => {
        const inp = document.createElement('input'); inp.className = 'ren'; inp.value = l.name; inp.spellcheck = false; t.replaceWith(inp)
        let done = false; const end = (ok: boolean) => { if (done) return; done = true; if (ok) core.layerRename(f, l.id, inp.value); layKey = ''; panels(true) }
        inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') end(true); else if (e.key === 'Escape') end(false) }; inp.onblur = () => end(true); inp.onpointerdown = e => e.stopPropagation()
        setTimeout(() => { inp.focus(); inp.select() }, 0)
      }
      box.append(el)
    }
  }

  // ------------------------------------------------------------ painel contextual
  let tab = 'cor'
  for (const b of document.querySelectorAll<HTMLButtonElement>('#tabs [data-tab]')) b.onclick = () => { tab = b.dataset.tab!; panels(true) }
  function panels(force = false) {
    core.syncSel()
    const frames = frameList(), nF = frames.length, f1 = single(), k = S.selCont as Cont | null, r = S.selRef as Ref | null, draw = DRAW.includes(S.tool)
    const note = S.selNote as any, none = !nF && !k && !r && !note
    const tabs = nF > 0
    if (!tabs) tab = 'cor'
    if (tab === 'camadas' && nF !== 1) tab = 'cor'
    show('tabs', tabs); $('tabs').querySelector<HTMLElement>('[data-tab=camadas]')!.hidden = nF !== 1
    for (const b of document.querySelectorAll<HTMLElement>('#tabs [data-tab]')) b.classList.toggle('on', b.dataset.tab === tab)
    show('s-frame', tabs && tab === 'quadro'); show('s-bg', tabs && tab === 'quadro'); show('s-layers', nF === 1 && tab === 'camadas')
    show('s-cont', !!k); show('s-ref', !!r); show('s-note', !!note)
    show('s-align', tabs && tab === 'quadro' && nF >= 2); show('s-sel', tabs && tab === 'cor')
    show('s-color', none || (tabs && tab === 'cor') || (!tabs && draw)); show('s-tool', draw && (!tabs || tab === 'cor')); show('s-psel', S.tool === 'marquee' && (!tabs || tab === 'cor')); show('s-adjust', nF >= 1 && (!tabs || tab === 'cor')); show('s-refadd', none); show('s-export', (tabs && tab === 'exportar'))
    // árvore
    const key = `${doc.version}|${doc.zorder.length}|${[...selSet].map((x: Frame) => x.id).join(',')}|${S.selCont?.id ?? 0}|${S.selRef?.id ?? 0}`
    if (key !== treeKey && !document.querySelector('#tree input.ren')) { treeKey = key; buildTree() }
    else for (const x of selSet as Set<Frame>) { const cv = thumbs.get(x.id); if (cv) drawThumb(cv, x) }
    // cores do quadro
    if (tabs && tab === 'cor') {
      const sk = `${frames.map((x: Frame) => x.id).join()}|${core.uploadCount()}`
      if ((sk !== selKey || force) && !document.querySelector('#selcols input:focus') && !selToken) { selKey = sk; buildSelColors(frames) }
    }
    // paleta e cor
    if (S.sel?.palId && S.sel.palId !== S.defaultPal) { S.defaultPal = S.sel.palId; store.set('kixel-pal', S.defaultPal) }
    renderPalette()
    // quadro
    if (nF) {
      $('qtitle').textContent = nF === 1 ? 'Quadro' : `${nF} quadros`
      val('fname').disabled = nF !== 1; val('px').disabled = val('py').disabled = val('pw').disabled = val('ph').disabled = nF !== 1
      if (f1) { setVal('fname', core.fname(f1)); setVal('px', String(f1.x)); setVal('py', String(f1.y)); setVal('pw', String(f1.w)); setVal('ph', String(f1.h)) }
      else { setVal('fname', 'Vários'); for (const id of ['px', 'py', 'pw', 'ph']) setVal(id, '') }
      $('group').hidden = false; show('durrow', !!f1 && f1.parent !== undefined); if (f1) setVal('fdur', f1.dur ? String(f1.dur) : '')
      { const bg = f1?.bg ?? frames[0].bg; $('fbg').style.background = bg ?? 'repeating-conic-gradient(#c2c2c6 0 25%, #9a9a9e 0 50%) 0 0/8px 8px' }
      const sw = $('bgsw'), cols: string[] = core.paletteOf(f1 ?? frames[0]).slice(0, 16), swKey = cols.join()
      if (sw.dataset.k !== swKey) { sw.dataset.k = swKey; sw.replaceChildren(); for (const h of cols) { const b = document.createElement('button'); b.style.background = h; b.title = 'Fundo ' + h; b.setAttribute('aria-label', 'Fundo ' + h); b.onclick = () => { val('fbg').value = h; const l = frameList(); core.change(l, [], [], () => { for (const f of l) { f.bg = h; f.trace = false } }) }; sw.append(b) } }
      $('fbgnone').classList.toggle('on', !(f1 ?? frames[0]).bg)
      const info = nF === 1 ? `${core.fname(f1!)} · ${f1!.w} × ${f1!.h} px` : `${nF} quadros: um PNG para cada`
      $('einfo').textContent = info
      $('etitle').textContent = nF === 1 ? 'Exportar PNG' : `Exportar ${nF} PNG`
      const sc = val('escale').value; $('esize').textContent = nF === 1 ? `Sai com ${f1!.w * core.exportScale(f1!, sc)} × ${f1!.h * core.exportScale(f1!, sc)} px (${core.exportScale(f1!, sc)}×)` : 'Um arquivo por quadro'
      $('ecopy').hidden = nF !== 1
    }
    if (f1) {
      const lk = `${f1.id}|${f1.activeLayer}|${(f1.layers ?? []).map((l: any) => l.id + l.name + l.vis + (l.op ?? 1)).join(',')}`
      if ((lk !== layKey || force) && !document.querySelector('#llist input.ren')) { layKey = lk; buildLayers(f1) }
    }
    // nota
    if (note) {
      const ta = $('ntext') as unknown as HTMLTextAreaElement; if (document.activeElement !== ta && ta.value !== note.text) ta.value = note.text
      setVal('nw', String(note.w)); setVal('nh', String(note.h)); setVal('nsize', String(note.size))
      for (const b of $('ncolors').querySelectorAll('button')) b.classList.toggle('on', (b as HTMLElement).dataset.c === note.color)
    }
    // exportar: opções conforme o formato
    if (nF || true) {
      const fmt = val('efmt').value, notes: Record<string, string> = { png: 'Imagem comum, ampliada na escala escolhida, sem suavizar.', ase: 'Abre no Aseprite com as camadas do quadro. Vários quadros do mesmo tamanho podem virar uma animação.', sheet: 'Junta os quadros selecionados numa imagem só e gera um JSON com as posições (formato do Aseprite, aceito em Godot, Phaser e outros).', svg: 'Imagem vetorial: cada pixel vira um retângulo. Pode ser ampliada sem perder nitidez.', gpl: 'Paleta do quadro em .gpl (Aseprite, GIMP, Krita). Não precisa de quadro selecionado.' }
      $('efmtnote').textContent = notes[fmt]
      show('escalerow', fmt === 'png' || fmt === 'svg'); show('ebgrow', fmt !== 'gpl' && fmt !== 'ase'); show('eanimrow', false)
      show('eanimrow', fmt === 'ase' && nF > 1); $('ecopy').hidden = nF !== 1 || fmt !== 'png'
      if (fmt === 'ase') { show('ebgrow', nF > 1) ; for (const l of $('ebgrow').querySelectorAll('label')) (l as HTMLElement).hidden = l.id !== 'eanimrow' }
      else for (const l of $('ebgrow').querySelectorAll('label')) (l as HTMLElement).hidden = l.id === 'eanimrow'
      $('export').lastChild!.textContent = fmt === 'gpl' ? 'Baixar paleta' : 'Baixar'
    }
    // contêiner
    syncAnim()
    if (k) { setVal('cname', core.cname(k)); setVal('cx', String(k.x)); setVal('cy', String(k.y)); setVal('cw', String(k.w)); setVal('ch', String(k.h)) }
    // referência
    if (r) {
      setVal('rname', r.name); const pc = Math.round(r.opacity * 100); setVal('refop', String(pc)); $('refopv').textContent = pc + '%'
      $('reflock').setAttribute('aria-pressed', String(r.locked)); $('refabove').setAttribute('aria-pressed', String(r.above))
      for (const b of document.querySelectorAll<HTMLElement>('#rtabs [data-rtab]')) b.classList.toggle('on', b.dataset.rtab === rtab)
      show('r-img', rtab === 'img'); show('r-use', rtab === 'use')
    }
    // barra
    $('empty').hidden = !!(doc.frames.size || doc.refs.length || doc.notes.length || doc.conts.size) || document.body.dataset.view !== 'editor'
    syncZoom()
    const info = core.perfInfo()
    if (!$('perf').hasAttribute('open')) return
    $('stats').innerHTML = `<b>${info.idle ? 'ocioso' : info.fps + ' fps'}</b> · render ${info.cpuMs.toFixed(1)} ms · quadros ${doc.frames.size.toLocaleString(locale())} · visíveis ${info.visible.toLocaleString(locale())} · chamadas ${info.calls} · zoom ${Math.round(info.zoom * 100)}%<br><span class="dim" translate="no">${info.gpu}</span>`
  }

  return { setWsName, saved, toggleHelp, showMenu, openExport, editNote, editingNote, init() { hydrateIcons(); ctxSync(); renderPalette(); toolChanged(S.tool); panels(true) }, panels, sheet, closeRename, syncZoom, toolCursor, renameOnStage, renameSelected, ctxSync, toast, colorChanged, toolChanged }
}
