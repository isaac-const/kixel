import { Doc, PAGE, BIG, type Cls, type Frame, type Ref } from './doc'

export type Cam = { x: number; y: number; zoom: number }

const FRAME_VS = `#version 300 es
in vec2 a_c; in vec4 a_rect; in vec4 a_uv; in vec4 a_bg;
uniform vec2 u_cam; uniform float u_zoom; uniform vec2 u_res;
out vec2 v_uv; out vec2 v_world; out vec4 v_bg; out vec2 v_size; out vec2 v_local;
void main(){
  vec2 w = a_rect.xy + a_c * a_rect.zw;
  vec2 s = (w - u_cam) * u_zoom + u_res * 0.5;
  gl_Position = vec4(s.x / u_res.x * 2.0 - 1.0, 1.0 - s.y / u_res.y * 2.0, 0.0, 1.0);
  v_uv = mix(a_uv.xy, a_uv.zw, a_c); v_world = w; v_bg = a_bg; v_size = a_rect.zw; v_local = a_c;
}`
const FRAME_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex; uniform vec3 u_c1; uniform vec3 u_c2; uniform float u_check; uniform float u_zoom;
in vec2 v_uv; in vec2 v_world; in vec4 v_bg; in vec2 v_size; in vec2 v_local; out vec4 o;
void main(){
  vec4 t = texture(u_tex, v_uv);
  vec2 q = floor(v_local * v_size / u_check);   // o xadrez nasce no canto do quadro e anda junto com ele
  vec3 bg = mix(u_c1, u_c2, mod(q.x + q.y, 2.0));
  if (v_bg.a > 1.5) o = vec4(mix(v_bg.rgb, t.rgb, t.a), 1.0);
  else if (v_bg.a > 0.5) o = vec4(t.rgb * t.a, t.a);
  else o = vec4(mix(bg, t.rgb, t.a), 1.0);
  vec2 ls = v_local * v_size; vec2 e2 = min(ls, v_size - ls);
  float line = (1.0 - step(1.0, min(e2.x, e2.y) * u_zoom)) * 0.2 * smoothstep(0.35, 1.2, u_zoom);
  o = o * (1.0 - line) + vec4(vec3(line), line);
}`
const REF_VS = `#version 300 es
in vec2 a_c;
uniform vec4 u_rect; uniform vec2 u_cam; uniform float u_zoom; uniform vec2 u_res;
out vec2 v_uv;
void main(){
  vec2 w = u_rect.xy + a_c * u_rect.zw;
  vec2 s = (w - u_cam) * u_zoom + u_res * 0.5;
  gl_Position = vec4(s.x / u_res.x * 2.0 - 1.0, 1.0 - s.y / u_res.y * 2.0, 0.0, 1.0);
  v_uv = a_c;
}`
const REF_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex; uniform float u_op; in vec2 v_uv; out vec4 o;
void main(){ vec4 t = texture(u_tex, v_uv); o = vec4(t.rgb * t.a, t.a) * u_op; }`

// fundo do quadro: modo 0 = xadrez, 1 = transparente (decalque), 2 = cor sólida
function packBg(b: Float32Array, o: number, f: Frame) {
  if (f.bg) { b[o++] = parseInt(f.bg.slice(1, 3), 16) / 255; b[o++] = parseInt(f.bg.slice(3, 5), 16) / 255; b[o++] = parseInt(f.bg.slice(5, 7), 16) / 255; b[o++] = 2 }
  else { b[o++] = 0; b[o++] = 0; b[o++] = 0; b[o++] = f.trace ? 1 : 0 }
  return o
}

function compile(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const mk = (t: number, s: string) => { const sh = gl.createShader(t)!; gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || 'shader'); return sh }
  const p = gl.createProgram()!
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link')
  return p
}

export class Renderer {
  gl: WebGL2RenderingContext
  W = 1; H = 1; dpr = 1
  private fp: WebGLProgram; private rp: WebGLProgram
  private corner: WebGLBuffer; private inst: WebGLBuffer
  private vaoF: WebGLVertexArrayObject; private vaoR: WebGLVertexArrayObject
  private pageTex = new Map<string, WebGLTexture>()
  private refTex = new Map<number, WebGLTexture>()
  private bigTex = new Map<number, WebGLTexture>()
  private buf = new Float32Array(12 * 4096)
  private uF: Record<string, WebGLUniformLocation | null> = {}
  private uR: Record<string, WebGLUniformLocation | null> = {}
  rendererName = ''
  drawCalls = 0
  visible = 0
  checkOpaque = true

  constructor(public canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: true, powerPreference: 'high-performance' })
    if (!gl) throw new Error('WebGL2 indisponível neste navegador')
    this.gl = gl
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    this.rendererName = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'desconhecido'
    this.fp = compile(gl, FRAME_VS, FRAME_FS); this.rp = compile(gl, REF_VS, REF_FS)
    for (const n of ['u_cam', 'u_zoom', 'u_res', 'u_tex', 'u_c1', 'u_c2', 'u_check']) this.uF[n] = gl.getUniformLocation(this.fp, n)
    for (const n of ['u_cam', 'u_zoom', 'u_res', 'u_tex', 'u_rect', 'u_op']) this.uR[n] = gl.getUniformLocation(this.rp, n)
    this.corner = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.corner)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW)
    this.inst = gl.createBuffer()!
    this.vaoF = gl.createVertexArray()!; gl.bindVertexArray(this.vaoF)
    const c = gl.getAttribLocation(this.fp, 'a_c')
    gl.bindBuffer(gl.ARRAY_BUFFER, this.corner); gl.enableVertexAttribArray(c); gl.vertexAttribPointer(c, 2, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst)
    const stride = 12 * 4
    const at = (n: string, size: number, off: number) => { const l = gl.getAttribLocation(this.fp, n); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, stride, off * 4); gl.vertexAttribDivisor(l, 1) }
    at('a_rect', 4, 0); at('a_uv', 4, 4); at('a_bg', 4, 8)
    this.vaoR = gl.createVertexArray()!; gl.bindVertexArray(this.vaoR)
    const c2 = gl.getAttribLocation(this.rp, 'a_c')
    gl.bindBuffer(gl.ARRAY_BUFFER, this.corner); gl.enableVertexAttribArray(c2); gl.vertexAttribPointer(c2, 2, gl.FLOAT, false, 0, 0)
    gl.bindVertexArray(null)
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
  }

  resize(cssW: number, cssH: number, dpr: number) {
    this.dpr = dpr; this.W = Math.max(1, Math.round(cssW * dpr)); this.H = Math.max(1, Math.round(cssH * dpr))
    this.canvas.width = this.W; this.canvas.height = this.H
  }

  private tex(c: Cls, page: number): WebGLTexture {
    const key = c + ':' + page
    let t = this.pageTex.get(key)
    if (!t) {
      const gl = this.gl; t = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, t)
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, PAGE, PAGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      this.pageTex.set(key, t)
    }
    return t
  }
  private bigTexture(f: Frame): WebGLTexture {
    let t = this.bigTex.get(f.id)
    if (!t) {
      const gl = this.gl; t = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, t)
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, f.w, f.h)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      this.bigTex.set(f.id, t)
    }
    return t
  }
  /** Sobe os pixels de um quadro para a GPU (atlas ou textura própria). */
  uploadCount = 0
  upload(doc: Doc, f: Frame) {
    this.uploadCount++
    const gl = this.gl
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    if (f.cls === BIG) { gl.bindTexture(gl.TEXTURE_2D, this.bigTexture(f)); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, f.w, f.h, gl.RGBA, gl.UNSIGNED_BYTE, f.px); return }
    const { sx, sy } = doc.slotRect(f.cls, f.slot)
    gl.bindTexture(gl.TEXTURE_2D, this.tex(f.cls, f.page))
    gl.texSubImage2D(gl.TEXTURE_2D, 0, sx, sy, f.w, f.h, gl.RGBA, gl.UNSIGNED_BYTE, f.px)
  }
  freeFrame(doc: Doc, f: Frame) { // limpa o espaço do atlas (ou apaga a textura própria)
    const gl = this.gl
    if (f.cls === BIG) { const t = this.bigTex.get(f.id); if (t) { gl.deleteTexture(t); this.bigTex.delete(f.id) } return }
    const { sx, sy } = doc.slotRect(f.cls, f.slot)
    gl.bindTexture(gl.TEXTURE_2D, this.tex(f.cls, f.page))
    gl.texSubImage2D(gl.TEXTURE_2D, 0, sx, sy, f.w, f.h, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(f.w * f.h * 4))
  }
  /** Sobe uma página inteira de uma vez (usado na criação em massa). */
  uploadPage(doc: Doc, c: Cls, page: number, maxSlot: number) {
    const gl = this.gl, p = doc.pages[c][page], per = PAGE / c
    const rows = Math.min(per, Math.ceil(maxSlot / per))
    const out = new Uint8Array(PAGE * rows * c * 4)
    for (let s = 0; s < rows * per; s++) {
      const sx = (s % per) * c, sy = Math.floor(s / per) * c
      for (let j = 0; j < c; j++) out.set(p.data.subarray((s * c * c + j * c) * 4, (s * c * c + j * c + c) * 4), ((sy + j - 0) * PAGE + sx) * 4 - 0)
    }
    gl.bindTexture(gl.TEXTURE_2D, this.tex(c, page)); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, PAGE, rows * c, gl.RGBA, gl.UNSIGNED_BYTE, out)
  }

  private refTexture(r: Ref): WebGLTexture {
    const gl = this.gl; let t = this.refTex.get(r.id)
    if (!t) { t = gl.createTexture()!; this.refTex.set(r.id, t); r.dirty = true }
    if (r.dirty) {
      gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, r.src)
      gl.generateMipmap(gl.TEXTURE_2D)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      r.dirty = false
    }
    return t
  }
  dropRef(r: Ref) { const t = this.refTex.get(r.id); if (t) { this.gl.deleteTexture(t); this.refTex.delete(r.id) } }

  private px1 = new Uint8Array(4)
  /** Força a GPU a terminar o quadro (só no teste), para medir o custo real. */
  sync() { this.gl.readPixels(0, 0, 1, 1, this.gl.RGBA, this.gl.UNSIGNED_BYTE, this.px1) }

  viewRect(cam: Cam) {
    const hw = this.W / this.dpr / 2 / cam.zoom, hh = this.H / this.dpr / 2 / cam.zoom
    return { minx: cam.x - hw, miny: cam.y - hh, maxx: cam.x + hw, maxy: cam.y + hh }
  }

  render(doc: Doc, cam: Cam) {
    const gl = this.gl
    gl.viewport(0, 0, this.W, this.H)
    gl.clearColor(0.078, 0.082, 0.1, 1); gl.clear(gl.COLOR_BUFFER_BIT)
    const z = cam.zoom, resX = this.W / this.dpr, resY = this.H / this.dpr
    let calls = 0
    const vr = this.viewRect(cam)
    let prog = 0
    const useRef = () => { if (prog === 1) return; prog = 1
      gl.useProgram(this.rp); gl.bindVertexArray(this.vaoR)
      gl.uniform2f(this.uR.u_cam, cam.x, cam.y); gl.uniform1f(this.uR.u_zoom, z); gl.uniform2f(this.uR.u_res, resX, resY); gl.uniform1i(this.uR.u_tex, 0); gl.activeTexture(gl.TEXTURE0) }
    const useFrame = () => { if (prog === 2) return; prog = 2
      gl.useProgram(this.fp); gl.bindVertexArray(this.vaoF)
      gl.uniform2f(this.uF.u_cam, cam.x, cam.y); gl.uniform1f(this.uF.u_zoom, z); gl.uniform2f(this.uF.u_res, resX, resY); gl.uniform1i(this.uF.u_tex, 0)
      gl.uniform3f(this.uF.u_c1, 0.60, 0.60, 0.62); gl.uniform3f(this.uF.u_c2, 0.76, 0.76, 0.78); gl.uniform1f(this.uF.u_check, 2)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.inst) }
    // quadros e imagens juntos, na ordem de camadas; trechos seguidos de quadros da mesma página de atlas saem numa só chamada
    const vis = doc.query(vr.minx, vr.miny, vr.maxx, vr.maxy) // já exclui quadros ocultos
    this.visible = vis.length
    if (vis.length > 1) { const zs = new Map<Frame, number>(); for (const f of vis) zs.set(f, doc.zOf(f)); vis.sort((a, b) => zs.get(a)! - zs.get(b)!) }
    const refs = doc.refs.filter(r => !r.hidden && !(r.x > vr.maxx || r.x + r.w < vr.minx || r.y > vr.maxy || r.y + r.h < vr.miny)).sort((a, b) => doc.zOfRef(a) - doc.zOfRef(b))
    const seq: (Frame | Ref)[] = []
    { let i = 0, k = 0
      while (i < vis.length || k < refs.length) {
        if (k >= refs.length || (i < vis.length && doc.zOf(vis[i]) < doc.zOfRef(refs[k]))) seq.push(vis[i++]); else seq.push(refs[k++])
      } }
    if (this.buf.length < vis.length * 12) this.buf = new Float32Array(vis.length * 12 * 2)
    const isRef = (o: Frame | Ref): o is Ref => 'src' in o
    const same = (a: Frame, b: Frame) => a.cls !== BIG && b.cls !== BIG && a.cls === b.cls && a.page === b.page
    const flush = (a: number, e: number) => {
      useFrame()
      const f0 = seq[a] as Frame, b = this.buf; let o = 0
      for (let q = a; q < e; q++) {
        const f = seq[q] as Frame
        if (f.cls === BIG) { b[o++] = f.x; b[o++] = f.y; b[o++] = f.w; b[o++] = f.h; b[o++] = 0; b[o++] = 0; b[o++] = 1; b[o++] = 1; o = packBg(b, o, f); continue }
        const { sx, sy } = doc.slotRect(f.cls, f.slot)
        b[o++] = f.x; b[o++] = f.y; b[o++] = f.w; b[o++] = f.h
        b[o++] = sx / PAGE; b[o++] = sy / PAGE; b[o++] = (sx + f.w) / PAGE; b[o++] = (sy + f.h) / PAGE
        o = packBg(b, o, f)
      }
      gl.bufferData(gl.ARRAY_BUFFER, b.subarray(0, o), gl.STREAM_DRAW)
      gl.bindTexture(gl.TEXTURE_2D, f0.cls === BIG ? this.bigTexture(f0) : this.tex(f0.cls, f0.page))
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, e - a); calls++
    }
    for (let a = 0; a < seq.length;) {
      const it = seq[a]
      if (isRef(it)) { useRef(); gl.bindTexture(gl.TEXTURE_2D, this.refTexture(it)); gl.uniform4f(this.uR.u_rect, it.x, it.y, it.w, it.h); gl.uniform1f(this.uR.u_op, it.opacity); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); calls++; a++; continue }
      let e = a + 1; while (e < seq.length && !isRef(seq[e]) && same(seq[e - 1] as Frame, seq[e] as Frame)) e++
      flush(a, e); a = e
    }
    this.drawCalls = calls
  }
}
