// Tela inicial: espaços de trabalho (projetos) guardados no navegador.
import type { WsMeta } from './workspaces'
import type { MenuItem } from './ui'
import { icon } from './icons'
import { LANGS, getLang, setLang, onLang, locale, tr } from './i18n'

export type HomeHooks = {
  list(): Promise<WsMeta[]>
  open(id: string): void; create(): void; rename(id: string, name: string): void; duplicate(id: string): void; remove(id: string): void; download(id: string): void
  importFile(file: File): void
  menu(x: number, y: number, items: MenuItem[]): void
}

export function ago(t: number) {
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' }), s = Math.round((t - Date.now()) / 1000), a = Math.abs(s)
  if (a < 45) return tr('agora há pouco')
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute')
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour')
  return rtf.format(Math.round(s / 86400), 'day')
}

export function initHome(h: HomeHooks) {
  const root = document.getElementById('home')!
  root.innerHTML = `
    <header><div class="brand"><img src="/logo.svg" height="30" alt="Kixel" /></div>
      <div class="hactions">
        <select id="hlang" aria-label="Idioma" translate="no"></select>
        <button id="hopen" data-icon="upload">Abrir arquivo .kixel</button>
        <button id="hnew" class="primary" data-icon="plus">Novo espaço de trabalho</button>
        <input id="hfile" type="file" accept=".kixel,application/octet-stream" hidden />
      </div></header>
    <main>
      <h2>Seus espaços de trabalho</h2>
      <p class="sub">Cada espaço é uma tela infinita separada. Tudo fica salvo neste navegador. Para levar para outro lugar, baixe o arquivo .kixel no menu do espaço.</p>
      <div id="wsgrid" role="list"></div>
    </main>`
  const grid = root.querySelector('#wsgrid') as HTMLElement
  const file = root.querySelector('#hfile') as HTMLInputElement
  const $ = (s: string) => root.querySelector(s) as HTMLElement
  root.querySelectorAll<HTMLElement>('[data-icon]').forEach(el => el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon!)))
  const sel = $('#hlang') as HTMLSelectElement
  for (const l of LANGS) sel.add(new Option(l.name, l.id)); sel.value = getLang(); sel.onchange = () => setLang(sel.value as 'pt' | 'en' | 'es'); onLang(() => { sel.value = getLang() })
  $('#hnew').onclick = () => h.create()
  $('#hopen').onclick = () => file.click()
  file.onchange = () => { const f = file.files?.[0]; if (f) h.importFile(f); file.value = '' }

  async function refresh() {
    const items = await h.list()
    grid.replaceChildren()
    const add = document.createElement('button'); add.className = 'wscard add'; add.innerHTML = `<span class="plus">${icon('plus')}</span><b>Novo espaço de trabalho</b>`; add.onclick = () => h.create(); grid.append(add)
    for (const m of items) {
      const card = document.createElement('div'); card.className = 'wscard'; card.tabIndex = 0; card.setAttribute('role', 'listitem')
      const th = document.createElement('div'); th.className = 'thumb'
      if (m.thumb) { const im = document.createElement('img'); im.src = m.thumb; im.alt = ''; th.append(im) } else th.innerHTML = '<span>vazio</span>'
      const info = document.createElement('div'); info.className = 'winfo'
      const name = document.createElement('b'); name.translate = false; name.textContent = m.name
      const meta = document.createElement('small'); meta.textContent = `${m.frames} quadro${m.frames === 1 ? '' : 's'} · editado ${ago(m.updated)}`
      info.append(name, meta)
      const more = document.createElement('button'); more.className = 'more'; more.innerHTML = icon('dots'); more.title = 'Mais ações'; more.setAttribute('aria-label', 'Mais ações')
      const items2 = (): MenuItem[] => [
        { label: 'Abrir', fn: () => h.open(m.id) }, { label: 'Renomear', fn: () => { const n = prompt(tr('Novo nome do espaço de trabalho'), m.name); if (n && n.trim()) h.rename(m.id, n.trim()) } },
        { label: 'Duplicar', fn: () => h.duplicate(m.id) }, { label: 'Baixar arquivo .kixel', fn: () => h.download(m.id) }, { sep: true, label: '' },
        { label: 'Excluir', fn: () => { if (confirm(tr(`Excluir "${m.name}"? Isso não pode ser desfeito.`))) h.remove(m.id) } }
      ]
      more.onclick = e => { e.stopPropagation(); const r = more.getBoundingClientRect(); h.menu(r.left, r.bottom + 4, items2()) }
      card.oncontextmenu = e => { e.preventDefault(); h.menu(e.clientX, e.clientY, items2()) }
      card.onclick = () => h.open(m.id)
      card.onkeydown = e => { if (e.key === 'Enter') h.open(m.id) }
      card.append(th, info, more); grid.append(card)
    }
  }
  return { refresh }
}
