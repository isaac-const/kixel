// Organizador de frames e tags: uma janela grande para montar a ordem de uma animação com muitos frames
// (seleção múltipla, arrastar, mover em bloco, inverter) e para criar tags (ações como "andar" e "atacar").
import type { Doc, Cont, Frame, Tag } from './doc'
import { icon } from './icons'
import { tr } from './i18n'

export type TLCtx = {
  doc: Doc; cname(c: Cont): string; animFrames(c: Cont): Frame[]
  tagOf(c: Cont): Tag | undefined; setTag(c: Cont, id: number | undefined): void
  tagAdd(c: Cont, ids: number[], name?: string): Tag; tagEdit(c: Cont, id: number, fn: (t: Tag) => Tag): void; tagDelete(c: Cont, id: number): void
  setLoop(c: Cont, m: 'pingpong' | 'reverse' | undefined): void; effLoop(c: Cont): 'pingpong' | 'reverse' | undefined
  reorder(k: Cont, ids: number[] | undefined): void; pick(f: Frame): void; uploads(): number
  setDur(ids: number[], ms: number | undefined): void
  undo(): void; redo(): void; toast(msg: string): void
}

const TAG_COLORS = ['#4de3b5', '#ffb454', '#6ea8ff', '#ff7ab6', '#b69cff', '#a3e635', '#ff8a5c', '#5eead4']
export const tagColor = (c: Cont, id: number) => TAG_COLORS[Math.max(0, (c.tags ?? []).findIndex(t => t.id === id)) % TAG_COLORS.length]

export function initTimeline(c: TLCtx) {
  const el = document.createElement('div'); el.id = 'tl'; el.hidden = true
  el.innerHTML = `<div class="tlcard" role="dialog" aria-label="Organizar frames e tags">
    <header><h3></h3><span class="sp"></span><button class="tlundo" data-i="undo" title="Desfazer (Ctrl+Z)" aria-label="Desfazer"></button><button class="tlredo" data-i="redo" title="Refazer (Ctrl+Shift+Z)" aria-label="Refazer"></button><button class="tlclose" data-i="close" title="Fechar (Esc)" aria-label="Fechar"></button></header>
    <div class="tlbody">
      <aside class="tltags"><h5>Ações (tags)</h5><div class="tllist"></div><button class="tlnew" data-i="plus" title="Cria uma tag com os frames selecionados">Nova tag</button><p class="hint">Uma tag é um grupo de frames que toca como uma ação. Escolha a tag para o player e as exportações usarem só ela.</p></aside>
      <main>
        <div class="tlbar">
          <button class="tlfirst" data-i="arrll" title="Levar a seleção para o início" aria-label="Levar a seleção para o início"></button>
          <button class="tlleft" data-i="arrl" title="Mover a seleção uma posição para trás ([)" aria-label="Mover para trás"></button>
          <button class="tlright" data-i="arrr" title="Mover a seleção uma posição para frente (])" aria-label="Mover para frente"></button>
          <button class="tllast" data-i="arrrr" title="Levar a seleção para o fim" aria-label="Levar a seleção para o fim"></button>
          <span class="sep"></span>
          <button class="tlrev" title="Inverte a ordem de todos os frames mostrados">Inverter ordem</button>
          <button class="tlpos" title="Volta a usar a posição dos quadros na tela">Ordem pela tela</button>
          <span class="sp"></span>
          <label class="tldur" title="Quanto tempo cada frame selecionado fica na tela. Vazio usa o FPS."><input type="number" min="10" step="5" placeholder="ms" aria-label="Duração dos selecionados em milissegundos" /><button class="tldurgo">Definir duração</button></label>
          <select class="tladd" aria-label="Adicionar a seleção a uma tag"></select>
          <button class="tlrm" title="Tira os frames selecionados da tag atual">Tirar da tag</button>
          <label class="tlloop" title="Como esta tag (ou a animação inteira) toca"><select class="tlloops" aria-label="Modo de reprodução"><option value="">Em sequência</option><option value="pingpong">Vai e volta</option><option value="reverse">Ao contrário</option></select></label>
        </div>
        <div class="tlinfo"></div>
        <div class="tlgrid" tabindex="0" aria-label="Frames da animação"></div>
      </main>
    </div></div>`
  document.body.append(el)
  const q = <T extends HTMLElement>(s: string) => el.querySelector(s) as T
  for (const b of el.querySelectorAll<HTMLElement>('[data-i]')) b.insertAdjacentHTML('afterbegin', icon(b.dataset.i!))
  q('.tlcard').addEventListener('keydown', e => { e.stopPropagation() }, false)

  let k: Cont | null = null, sel = new Set<number>(), anchor: number | null = null, drag: number[] = [], renameId = 0
  const live = () => (k && c.doc.conts.get(k.id) === k ? k : null)
  const viewOf = (kk: Cont) => { const all = c.animFrames(kk), t = c.tagOf(kk); return { all, tag: t, view: t ? all.filter(f => t.ids.includes(f.id)) : all } }
  const close = () => { el.hidden = true; k = null; sel.clear() }

  function thumb(f: Frame): HTMLCanvasElement {
    const cv = document.createElement('canvas'); cv.width = f.w; cv.height = f.h
    const id = new ImageData(f.w, f.h); id.data.set(f.px); cv.getContext('2d')!.putImageData(id, 0, 0); return cv
  }

  function render() {
    const kk = live(); if (!kk) { close(); return }
    const { all, tag, view } = viewOf(kk)
    q('h3').textContent = `${tr('Organizar frames')} · ${c.cname(kk)}`; q('h3').translate = false
    for (const id of [...sel]) if (!view.some(f => f.id === id)) sel.delete(id)
    // tags
    const list = q('.tllist'); list.replaceChildren()
    const item = (id: number | undefined, name: string, n: number, color: string) => {
      const row = document.createElement('div'); row.className = 'tlt' + ((id === tag?.id) || (id === undefined && !tag) ? ' on' : '')
      const dot = document.createElement('i'); dot.style.background = color
      const nm = document.createElement('span'); nm.className = 't'; nm.textContent = name; nm.translate = id === undefined
      const cnt = document.createElement('small'); cnt.textContent = String(n)
      row.append(dot, nm, cnt)
      row.onclick = () => { c.setTag(kk, id); sel.clear(); anchor = null; render() }
      if (id !== undefined) {
        if (renameId === id) {
          const inp = document.createElement('input'); inp.value = name; inp.maxLength = 24; nm.replaceWith(inp)
          const done = (ok: boolean) => { renameId = 0; const v = inp.value.trim(); if (ok && v && v !== name) c.tagEdit(kk, id, t => ({ ...t, name: v })); render() }
          inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') done(true); else if (e.key === 'Escape') done(false) }
          inp.onblur = () => { if (renameId) done(true) }; inp.onclick = e => e.stopPropagation()
          setTimeout(() => { inp.focus(); inp.select() }, 0)
        } else nm.ondblclick = e => { e.stopPropagation(); renameId = id; render() }
        const ed = document.createElement('button'); ed.className = 'mini'; ed.title = 'Renomear'; ed.setAttribute('aria-label', 'Renomear'); ed.innerHTML = icon('pencil'); ed.onclick = e => { e.stopPropagation(); renameId = id; render() }
        const del = document.createElement('button'); del.className = 'mini'; del.title = 'Excluir tag'; del.setAttribute('aria-label', 'Excluir tag'); del.innerHTML = icon('close'); del.onclick = e => { e.stopPropagation(); c.tagDelete(kk, id); render() }
        row.append(ed, del)
      }
      list.append(row)
    }
    item(undefined, 'Todos os frames', all.length, '#8d93a5')
    ;(kk.tags ?? []).forEach(t => item(t.id, t.name, all.filter(f => t.ids.includes(f.id)).length, tagColor(kk, t.id)))
    // seleção para adicionar a uma tag
    const add = q<HTMLSelectElement>('.tladd'); add.replaceChildren(new Option(tr('Adicionar à tag…'), '')); (add.firstChild as HTMLOptionElement).translate = false
    for (const t of kk.tags ?? []) { const o = new Option(t.name, String(t.id)); o.translate = false; add.add(o) }
    add.disabled = !sel.size || !(kk.tags ?? []).length
    q('.tldurgo').toggleAttribute('disabled', !sel.size)
    q('.tlrm').toggleAttribute('disabled', !tag || !sel.size)
    q('.tlpos').toggleAttribute('disabled', !kk.order || !!tag)
    q<HTMLSelectElement>('.tlloops').value = c.effLoop(kk) ?? ''
    const none = !sel.size
    for (const s of ['.tlfirst', '.tlleft', '.tlright', '.tllast']) q(s).toggleAttribute('disabled', none)
    q('.tlundo').toggleAttribute('disabled', false)
    q('.tlinfo').textContent = tag ? `${tr('Mostrando só a tag')} “${tag.name}”: ${view.length} / ${all.length}` : `${all.length} ${tr(all.length === 1 ? 'frame' : 'frames')}`
    q('.tlinfo').translate = false
    // grade
    const grid = q('.tlgrid'); grid.replaceChildren()
    view.forEach((f, i) => {
      const card = document.createElement('div'); card.className = 'tlc' + (sel.has(f.id) ? ' on' : ''); card.draggable = true; card.dataset.id = String(f.id); card.translate = false
      const cv = thumb(f); card.append(cv)
      const num = document.createElement('i'); num.textContent = String(i + 1); card.append(num)
      const dots = document.createElement('span'); dots.className = 'dots'
      for (const t of kk.tags ?? []) if (t.ids.includes(f.id)) { const d = document.createElement('b'); d.style.background = tagColor(kk, t.id); d.title = t.name; dots.append(d) }
      card.append(dots)
      if (f.dur) { const du = document.createElement('small'); du.textContent = f.dur + 'ms'; card.append(du) }
      card.title = `${i + 1}. ${f.name ?? ''}`
      card.onclick = e => {
        if (e.shiftKey && anchor !== null) { const a = view.findIndex(x => x.id === anchor), lo = Math.min(a, i), hi = Math.max(a, i); if (!e.ctrlKey && !e.metaKey) sel.clear(); for (let j = lo; j <= hi; j++) sel.add(view[j].id) }
        else if (e.ctrlKey || e.metaKey) { sel.has(f.id) ? sel.delete(f.id) : sel.add(f.id); anchor = f.id }
        else { sel = new Set([f.id]); anchor = f.id; c.pick(f) }
        render()
      }
      card.ondragstart = e => {
        if (!sel.has(f.id)) { sel = new Set([f.id]); anchor = f.id }
        drag = view.filter(x => sel.has(x.id)).map(x => x.id); e.dataTransfer?.setData('text/plain', 'frames'); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
        setTimeout(() => { for (const x of grid.querySelectorAll('.tlc')) if (drag.includes(Number((x as HTMLElement).dataset.id))) x.classList.add('ghost') }, 0)
      }
      card.ondragend = () => { drag = []; for (const x of grid.querySelectorAll('.ghost,.dropL,.dropR')) x.classList.remove('ghost', 'dropL', 'dropR') }
      card.ondragover = e => {
        if (!drag.length) return; e.preventDefault()
        const r = card.getBoundingClientRect(), left = e.clientX < r.left + r.width / 2
        for (const x of grid.querySelectorAll('.dropL,.dropR')) x.classList.remove('dropL', 'dropR')
        card.classList.add(left ? 'dropL' : 'dropR')
      }
      card.ondrop = e => {
        e.preventDefault(); if (!drag.length) return
        const r = card.getBoundingClientRect(), after = e.clientX >= r.left + r.width / 2, moved = drag; drag = []
        if (moved.includes(f.id) && moved.length === 1) { render(); return }
        const rest = view.map(x => x.id).filter(id => !moved.includes(id)); let at = rest.indexOf(f.id)
        if (at < 0) { render(); return }   // soltou em cima de um dos frames arrastados
        if (after) at++
        rest.splice(at, 0, ...moved); c.reorder(kk, rest); render()
      }
      grid.append(card)
    })
    if (!view.length) { const p = document.createElement('p'); p.className = 'tlempty'; p.textContent = tag ? 'Esta tag está vazia. Volte para "Todos os frames", selecione frames e use "Adicionar à tag…".' : 'Este contêiner ainda não tem frames.'; grid.append(p) }
    grid.ondragover = e => { if (drag.length) e.preventDefault() }
    grid.ondrop = e => { if (e.target !== grid || !drag.length) return; e.preventDefault(); const moved = drag; drag = []; c.reorder(kk, [...view.map(x => x.id).filter(id => !moved.includes(id)), ...moved]); render() }
  }

  // ---- ações da barra
  const idsInView = () => { const kk = live(); return kk ? viewOf(kk).view.map(f => f.id) : [] }
  function moveBlock(mode: 'first' | 'last' | 'left' | 'right') {
    const kk = live(); if (!kk || !sel.size) return
    const ids = idsInView(), chosen = ids.filter(id => sel.has(id)), rest = ids.filter(id => !sel.has(id)); let out: number[]
    if (mode === 'first') out = [...chosen, ...rest]
    else if (mode === 'last') out = [...rest, ...chosen]
    else {
      out = [...ids]
      if (mode === 'left') for (let i = 1; i < out.length; i++) { if (sel.has(out[i]) && !sel.has(out[i - 1])) [out[i - 1], out[i]] = [out[i], out[i - 1]] }
      else for (let i = out.length - 2; i >= 0; i--) { if (sel.has(out[i]) && !sel.has(out[i + 1])) [out[i + 1], out[i]] = [out[i], out[i + 1]] }
    }
    if (out.join() === ids.join()) return
    c.reorder(kk, out); render()
  }
  q('.tlfirst').onclick = () => moveBlock('first'); q('.tllast').onclick = () => moveBlock('last'); q('.tlleft').onclick = () => moveBlock('left'); q('.tlright').onclick = () => moveBlock('right')
  q('.tlrev').onclick = () => { const kk = live(); if (!kk) return; const ids = idsInView(); if (ids.length > 1) { c.reorder(kk, [...ids].reverse()); render() } }
  q('.tlpos').onclick = () => { const kk = live(); if (kk) { c.reorder(kk, undefined); render() } }
  q('.tlnew').onclick = () => { const kk = live(); if (!kk) return; const t = c.tagAdd(kk, [...sel]); renameId = t.id; sel.clear(); render() }
  q<HTMLSelectElement>('.tladd').onchange = e => {
    const kk = live(), v = Number((e.target as HTMLSelectElement).value); if (!kk || !v || !sel.size) return
    const chosen = idsInView().filter(id => sel.has(id)); c.tagEdit(kk, v, t => ({ ...t, ids: [...new Set([...t.ids, ...chosen])] })); c.toast(`${chosen.length} ${chosen.length === 1 ? 'frame adicionado à tag' : 'frames adicionados à tag'}`); render()
  }
  q('.tlrm').onclick = () => { const kk = live(), t = kk && c.tagOf(kk); if (!kk || !t) return; c.tagEdit(kk, t.id, x => ({ ...x, ids: x.ids.filter(id => !sel.has(id)) })); sel.clear(); render() }
  q<HTMLSelectElement>('.tlloops').onchange = e => { const kk = live(); if (kk) { c.setLoop(kk, ((e.target as HTMLSelectElement).value || undefined) as Cont['loop']); render() } }
  q('.tldurgo').onclick = () => {
    const kk = live(); if (!kk || !sel.size) { c.toast('Selecione frames primeiro.'); return }
    const v = Math.round(Number(q<HTMLInputElement>('.tldur input').value)), ms = v >= 10 ? v : undefined
    c.setDur(idsInView().filter(id => sel.has(id)), ms); render()
  }
  q('.tlundo').onclick = () => { c.undo(); render() }; q('.tlredo').onclick = () => { c.redo(); render() }
  q('.tlclose').onclick = close
  el.addEventListener('pointerdown', e => { if (e.target === el) close() })
  // com a janela aberta, as teclas são dela (mesmo se o foco foi parar no fundo): captura antes dos atalhos do editor
  window.addEventListener('keydown', e => {
    if (el.hidden) return
    const mod = e.ctrlKey || e.metaKey, tgt = e.target as HTMLElement
    if (el.contains(tgt) && (tgt.tagName === 'INPUT' || tgt.tagName === 'SELECT')) return
    e.stopPropagation()
    if (e.key === 'Escape') { close(); return }
    if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); sel = new Set(idsInView()); render(); return }
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? c.redo() : c.undo(); render(); return }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); c.redo(); render(); return }
    if (e.key === '[') { moveBlock('left'); return }
    if (e.key === ']') { moveBlock('right'); return }
  }, true)

  return {
    open(kk: Cont) { k = kk; sel = new Set(); anchor = null; renameId = 0; el.hidden = false; render(); q('.tlgrid').focus() },
    refresh() { if (!el.hidden) render() },
  }
}
