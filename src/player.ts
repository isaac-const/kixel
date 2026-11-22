// Player de animação na tela: um contêiner com "Player na tela" ligado ganha uma janelinha ao lado dele
// que toca os quadros de dentro (pausar, passo a passo, velocidade, FPS), com miniaturas para mudar a ordem.
import type { Doc, Cont, Frame } from './doc'
import { icon } from './icons'

export type PlayerCtx = {
  doc: Doc; stage: HTMLElement
  animFrames(c: Cont): Frame[]; cname(c: Cont): string
  w2s(x: number, y: number): { x: number; y: number }; stageSize(): { w: number; h: number }; zoom(): number
  uploads(): number; touch(): void; hex2rgba(h: string): number[]
  reorder(k: Cont, ids: number[] | undefined): void; pick(f: Frame): void
}
const SPEEDS = [0.25, 0.5, 1, 2, 4]
const fmtSpeed = (s: number) => (s < 1 ? String(s).replace('0.', '.') : String(s)) + '×'
type P = { el: HTMLElement; cv: HTMLCanvasElement; view: HTMLElement; film: HTMLElement; title: HTMLElement; count: HTMLElement; play: HTMLElement; spd: HTMLElement; mode: HTMLElement; fps: HTMLInputElement; none: HTMLElement; idx: number; t: number; key: string; fkey: string; tkey: string; w: number; h: number; pos: string; dragId: number; sizeKey: string }

export function initPlayers(c: PlayerCtx) {
  const layer = document.createElement('div'); layer.id = 'players'; c.stage.append(layer)
  const map = new Map<number, P>()
  const cont = (id: number) => c.doc.conts.get(id)

  function make(k: Cont): P {
    const el = document.createElement('div'); el.className = 'aplayer'; el.setAttribute('role', 'group'); el.setAttribute('aria-label', 'Player de animação')
    el.innerHTML = `<div class="ahead"><b></b><small></small><button class="mode" aria-pressed="false" title="Tamanho da janela: ligado, o sprite acompanha o zoom do canvas (tamanho real). Desligado, a janela tem tamanho fixo na tela." aria-label="Acompanhar o zoom">${icon('pin')}</button></div>
      <div class="aview"><canvas width="16" height="16"></canvas><div class="none">Jogue quadros de mesmo tamanho dentro do contêiner</div></div>
      <div class="afilm" aria-label="Ordem dos frames: arraste para mudar"></div>
      <div class="actl">
        <button class="prev" title="Frame anterior" aria-label="Frame anterior">${icon('skipb')}</button>
        <button class="play" title="Tocar ou pausar" aria-label="Tocar ou pausar"></button>
        <button class="next" title="Próximo frame" aria-label="Próximo frame">${icon('skipf')}</button>
        <label class="fp" title="Quadros por segundo"><input type="number" min="1" max="60" aria-label="Quadros por segundo" /><i>fps</i></label>
      </div>
      <div class="aspd"><span>Velocidade</span><span class="spd"><button class="slow" title="Mais devagar" aria-label="Mais devagar">−</button><em></em><button class="fast" title="Mais rápido" aria-label="Mais rápido">+</button></span></div>`
    layer.append(el)
    const q = (s: string) => el.querySelector(s) as HTMLElement
    const p: P = { el, cv: q('canvas') as HTMLCanvasElement, view: q('.aview'), film: q('.afilm'), title: q('.ahead b'), count: q('.ahead small'), play: q('.play'), spd: q('.spd em'), mode: q('.mode'), fps: q('.fp input') as HTMLInputElement, none: q('.none'), idx: 0, t: performance.now(), key: '', fkey: '', tkey: '', w: 0, h: 0, pos: '', dragId: 0, sizeKey: '' }
    const step = (d: number) => { const k2 = cont(k.id); if (!k2) return; const n = c.animFrames(k2).length; if (!n) return; k2.paused = true; p.idx = (p.idx + d + n) % n; p.t = performance.now(); p.key = ''; c.touch() }
    q('.prev').onclick = () => step(-1); q('.next').onclick = () => step(1)
    p.play.onclick = () => { const k2 = cont(k.id); if (k2) { k2.paused = !k2.paused; p.t = performance.now(); c.touch() } }
    const speed = (d: number) => { const k2 = cont(k.id); if (!k2) return; let i = SPEEDS.indexOf(k2.speed ?? 1); if (i < 0) i = 2; k2.speed = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, i + d))]; c.touch() }
    q('.slow').onclick = () => speed(-1); q('.fast').onclick = () => speed(1)
    p.mode.onclick = () => { const k2 = cont(k.id); if (k2) { k2.pmode = k2.pmode === 'world' ? undefined : 'world'; p.sizeKey = ''; c.touch() } }
    p.fps.onchange = () => { const k2 = cont(k.id); if (k2) { k2.fps = Math.max(1, Math.min(60, Number(p.fps.value) || 8)); c.touch() } }
    p.fps.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') p.fps.blur() })
    return p
  }

  function drawInto(cv: HTMLCanvasElement, f: Frame) {
    if (cv.width !== f.w || cv.height !== f.h) { cv.width = f.w; cv.height = f.h }
    const img = new ImageData(f.w, f.h)
    if (f.bg) { const bg = c.hex2rgba(f.bg); img.data.set(f.px); for (let o = 0; o < img.data.length; o += 4) if (img.data[o + 3] < 128) img.data.set(bg, o) } else img.data.set(f.px)
    cv.getContext('2d')!.putImageData(img, 0, 0)
  }

  /** Miniaturas dos frames: clique para ir até o frame, arraste para mudar a ordem. */
  function buildFilm(p: P, k: Cont, list: Frame[]) {
    p.film.replaceChildren()
    list.forEach((f, i) => {
      const th = document.createElement('div'); th.className = 'th'; th.draggable = true; th.dataset.id = String(f.id); th.title = `${i + 1}. ${f.name ?? 'Quadro'}`
      th.innerHTML = `<canvas width="${f.w}" height="${f.h}"></canvas><i>${i + 1}</i>`
      th.onclick = () => { const k2 = cont(k.id); if (!k2) return; k2.paused = true; p.idx = i; p.t = performance.now(); p.key = ''; c.pick(f); c.touch() }
      th.ondragstart = e => { p.dragId = f.id; e.dataTransfer?.setData('text/plain', String(f.id)); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move' }
      th.ondragend = () => { p.dragId = 0; for (const x of p.film.querySelectorAll('.over')) x.classList.remove('over') }
      th.ondragover = e => { if (p.dragId) { e.preventDefault(); th.classList.add('over') } }
      th.ondragleave = () => th.classList.remove('over')
      th.ondrop = e => {
        e.preventDefault(); th.classList.remove('over'); const from = p.dragId; p.dragId = 0
        const k2 = cont(k.id); if (!k2 || !from || from === f.id) return
        const ids = c.animFrames(k2).map(x => x.id).filter(id => id !== from), at = ids.indexOf(f.id)
        ids.splice(at < 0 ? ids.length : at, 0, from); c.reorder(k2, ids)
        p.idx = ids.indexOf(from); p.key = ''
      }
      p.film.append(th)
    })
  }

  function sync(now: number) {
    const live = [...c.doc.conts.values()].filter(k => k.anim)
    for (const [id, p] of map) if (!live.some(k => k.id === id)) { p.el.remove(); map.delete(id) }
    const st = c.stageSize(), up = c.uploads(), z = c.zoom()
    for (const k of live) {
      const p = map.get(k.id) ?? (map.set(k.id, make(k)), map.get(k.id)!)
      const list = c.animFrames(k), n = list.length, speed = k.speed ?? 1, fps = k.fps ?? 8, world = k.pmode === 'world'
      if (p.idx >= n) p.idx = 0
      // reprodução (cada frame pode ter a sua duração; a velocidade multiplica tudo)
      if (n > 1 && !k.paused) { const delay = (list[p.idx].dur ?? 1000 / fps) / speed; if (now - p.t >= delay) { p.idx = (p.idx + 1) % n; p.t = now } } else p.t = now
      const f = list[p.idx]
      // tamanho: fixo na tela, ou acompanhando o zoom (sprite no tamanho real do canvas)
      const sizeKey = world ? `w|${z}|${f?.w}|${f?.h}` : 's'
      if (sizeKey !== p.sizeKey) {
        p.sizeKey = sizeKey; p.el.classList.toggle('world', world)
        if (world && f) { const pw = Math.max(40, Math.round(f.w * z)), ph = Math.max(40, Math.round(f.h * z)); p.view.style.width = pw + 'px'; p.view.style.height = ph + 'px'; p.el.style.width = Math.max(224, pw + 20) + 'px' }
        else { p.view.style.width = ''; p.view.style.height = ''; p.el.style.width = '' }
      }
      p.w = p.el.offsetWidth; p.h = p.el.offsetHeight
      // posição: ao lado do contêiner (à direita; senão à esquerda; senão acima); nunca sai da tela no modo fixo
      const tl = c.w2s(k.x, k.y), br = c.w2s(k.x + k.w, k.y + k.h)
      const off = br.x < 0 || tl.x > st.w || br.y < 0 || tl.y > st.h
      let left: number, top: number
      if (world) { left = br.x + 4 * z + 6; top = tl.y }
      else {
        top = Math.max(8, Math.min(tl.y, st.h - p.h - 8))
        if (br.x + 12 + p.w <= st.w - 8) left = br.x + 12
        else if (tl.x - p.w - 12 >= 8) left = tl.x - p.w - 12
        else if (tl.y - p.h - 10 >= 8) { left = tl.x; top = tl.y - p.h - 10 }
        else left = st.w - p.w - 12
        left = Math.max(8, Math.min(left, st.w - p.w - 8)); top = Math.max(8, Math.min(top, st.h - p.h - 8))
      }
      const pos = off ? 'off' : `${Math.round(left)},${Math.round(top)}`
      if (pos !== p.pos) { p.pos = pos; p.el.style.display = off ? 'none' : ''; p.el.style.transform = `translate(${Math.round(left)}px,${Math.round(top)}px)` }
      if (off) continue
      const fkey = list.map(x => x.id).join()
      if (fkey !== p.fkey) { p.fkey = fkey; p.tkey = ''; buildFilm(p, k, list) }
      if (up + '|' + fkey !== p.tkey) { p.tkey = up + '|' + fkey; const cvs = p.film.querySelectorAll('canvas'); list.forEach((x, i) => { if (cvs[i]) drawInto(cvs[i] as HTMLCanvasElement, x) }) }
      const key = `${f?.id}|${up}|${p.idx}|${n}|${k.paused}|${speed}|${fps}|${world}|${c.cname(k)}`
      if (key === p.key) continue
      p.key = key
      p.none.style.display = n ? 'none' : ''
      if (f) drawInto(p.cv, f)
      p.title.textContent = c.cname(k); p.count.textContent = n ? `${p.idx + 1} / ${n}` : '0 / 0'
      p.play.innerHTML = icon(k.paused ? 'play' : 'pause'); p.spd.textContent = fmtSpeed(speed); p.mode.setAttribute('aria-pressed', String(world))
      p.film.querySelectorAll('.th').forEach((t, i) => t.classList.toggle('on', i === p.idx))
      if (document.activeElement !== p.fps) p.fps.value = String(fps)
    }
  }
  return { sync }
}
