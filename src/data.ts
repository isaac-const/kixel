// Paletas de consoles e computadores antigos, e tamanhos de tela prontos. Valores de referência públicos.
export type Pal = { id: string; name: string; note: string; colors: string[] }
const rgb = (n: number[]) => n.map(v => '#' + v.toString(16).padStart(6, '0'))
const sms: string[] = []
for (let b = 0; b < 4; b++) for (let g = 0; g < 4; g++) for (let r = 0; r < 4; r++) sms.push('#' + [r, g, b].map(v => (v * 85).toString(16).padStart(2, '0')).join(''))
const gba: string[] = [] // 15 bits: 32 níveis por canal; amostra de 4 níveis de luminosidade por matiz
for (const [r, g, b] of [[31, 0, 0], [31, 16, 0], [31, 31, 0], [16, 31, 0], [0, 31, 0], [0, 31, 16], [0, 31, 31], [0, 16, 31], [0, 0, 31], [16, 0, 31], [31, 0, 31], [31, 0, 16]]) for (const k of [0.35, 0.6, 1]) gba.push('#' + [r, g, b].map(v => Math.round(v * k * 255 / 31).toString(16).padStart(2, '0')).join(''))
for (const v of [0, 6, 12, 18, 24, 31]) gba.push('#' + [v, v, v].map(x => Math.round(x * 255 / 31).toString(16).padStart(2, '0')).join(''))

export const PALETTES: Pal[] = [
  { id: 'sweetie', name: 'Sweetie 16', note: '16 cores, uso geral', colors: ['#1a1c2c', '#5d275d', '#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#257179', '#29366f', '#3b5dc9', '#41a6f6', '#73eff7', '#f4f4f4', '#94b0c2', '#566c86', '#333c57'] },
  { id: 'gb', name: 'Game Boy', note: '4 tons de verde (DMG)', colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'] },
  { id: 'gbp', name: 'Game Boy Pocket', note: '4 tons de cinza', colors: ['#000000', '#555555', '#aaaaaa', '#ffffff'] },
  { id: 'nes', name: 'NES', note: '54 cores da paleta do 2C02', colors: rgb([0x7C7C7C, 0x0000FC, 0x0000BC, 0x4428BC, 0x940084, 0xA80020, 0xA81000, 0x881400, 0x503000, 0x007800, 0x006800, 0x005800, 0x004058, 0x000000, 0xBCBCBC, 0x0078F8, 0x0058F8, 0x6844FC, 0xD800CC, 0xE40058, 0xF83800, 0xE45C10, 0xAC7C00, 0x00B800, 0x00A800, 0x00A844, 0x008888, 0xF8F8F8, 0x3CBCFC, 0x6888FC, 0x9878F8, 0xF878F8, 0xF85898, 0xF87858, 0xFCA044, 0xF8B800, 0xB8F818, 0x58D854, 0x58F898, 0x00E8D8, 0x787878, 0xFCFCFC, 0xA4E4FC, 0xB8B8F8, 0xD8B8F8, 0xF8B8F8, 0xF8A4C0, 0xF0D0B0, 0xFCE0A8, 0xF8D878, 0xD8F878, 0xB8F8B8, 0xB8F8D8, 0xF8D8F8]) },
  { id: 'sms', name: 'Master System', note: '64 cores (2 bits por canal)', colors: sms },
  { id: 'gba', name: 'GBA (15 bits)', note: 'amostra da cor de 15 bits', colors: gba },
  { id: 'pico8', name: 'PICO-8', note: '16 cores', colors: rgb([0x000000, 0x1D2B53, 0x7E2553, 0x008751, 0xAB5236, 0x5F574F, 0xC2C3C7, 0xFFF1E8, 0xFF004D, 0xFFA300, 0xFFEC27, 0x00E436, 0x29ADFF, 0x83769C, 0xFF77A8, 0xFFCCAA]) },
  { id: 'c64', name: 'Commodore 64', note: '16 cores', colors: rgb([0x000000, 0xFFFFFF, 0x68372B, 0x70A4B2, 0x6F3D86, 0x588D43, 0x352879, 0xB8C76F, 0x6F4F25, 0x433900, 0x9A6759, 0x444444, 0x6C6C6C, 0x9AD284, 0x6C5EB5, 0x959595]) },
  { id: 'zx', name: 'ZX Spectrum', note: '15 cores', colors: rgb([0x000000, 0x0000D7, 0xD70000, 0xD700D7, 0x00D700, 0x00D7D7, 0xD7D700, 0xD7D7D7, 0x0000FF, 0xFF0000, 0xFF00FF, 0x00FF00, 0x00FFFF, 0xFFFF00, 0xFFFFFF]) },
  { id: 'ega', name: 'EGA', note: '16 cores do PC antigo', colors: rgb([0x000000, 0x0000AA, 0x00AA00, 0x00AAAA, 0xAA0000, 0xAA00AA, 0xAA5500, 0xAAAAAA, 0x555555, 0x5555FF, 0x55FF55, 0x55FFFF, 0xFF5555, 0xFF55FF, 0xFFFF55, 0xFFFFFF]) },
  { id: 'cga', name: 'CGA', note: '4 cores', colors: ['#000000', '#55ffff', '#ff55ff', '#ffffff'] },
]

export type Preset = { name: string; w: number; h: number; pal?: string }
export type PresetGroup = { id: string; name: string; items: Preset[]; open?: boolean }
export const PRESETS: PresetGroup[] = [
  { id: 'comum', name: 'Tamanhos comuns', open: true, items: [{ name: '8 × 8', w: 8, h: 8 }, { name: '16 × 16', w: 16, h: 16 }, { name: '24 × 24', w: 24, h: 24 }, { name: '32 × 32', w: 32, h: 32 }, { name: '48 × 48', w: 48, h: 48 }, { name: '64 × 64', w: 64, h: 64 }, { name: '128 × 128', w: 128, h: 128 }] },
  { id: 'portatil', name: 'Portáteis', open: true, items: [{ name: 'Game Boy / Color', pal: 'gb', w: 160, h: 144 }, { name: 'Game Boy Advance', pal: 'gba', w: 240, h: 160 }, { name: 'Nintendo DS (tela)', w: 256, h: 192 }, { name: 'Game Gear', w: 160, h: 144 }, { name: 'Neo Geo Pocket', w: 160, h: 152 }, { name: 'WonderSwan', w: 224, h: 144 }, { name: 'Atari Lynx', w: 160, h: 102 }] },
  { id: 'mesa', name: 'Consoles de mesa', items: [{ name: 'NES', pal: 'nes', w: 256, h: 240 }, { name: 'Super Nintendo', w: 256, h: 224 }, { name: 'Master System', pal: 'sms', w: 256, h: 192 }, { name: 'Mega Drive', w: 320, h: 224 }, { name: 'Atari 2600', w: 160, h: 192 }, { name: 'PlayStation 1', w: 320, h: 240 }, { name: 'Neo Geo', w: 320, h: 224 }] },
  { id: 'comp', name: 'Computadores e fantasia', items: [{ name: 'PICO-8', pal: 'pico8', w: 128, h: 128 }, { name: 'TIC-80', w: 240, h: 136 }, { name: 'Commodore 64', pal: 'c64', w: 320, h: 200 }, { name: 'ZX Spectrum', pal: 'zx', w: 256, h: 192 }, { name: 'MSX', w: 256, h: 192 }, { name: 'DOS VGA', pal: 'ega', w: 320, h: 200 }] },
  { id: 'icones', name: 'Ícones e tiles', items: [{ name: 'Tile 8', w: 8, h: 8 }, { name: 'Tile 16', w: 16, h: 16 }, { name: 'Ícone 32', w: 32, h: 32 }, { name: 'Ícone 48', w: 48, h: 48 }, { name: 'Avatar 64', w: 64, h: 64 }, { name: 'Sprite de personagem 32 × 48', w: 32, h: 48 }] },
]
