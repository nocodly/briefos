// Generates BriefOS icons as valid PNGs (no external deps — raw PNG + zlib).
//   assets/tray-icon.png            16x16 green dot (idle)
//   assets/tray-icon-recording.png  16x16 red dot (recording)
//   assets/icon.png                 256x256 app icon (accent square + dot)
// Run: node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const assetsDir = join(root, 'assets')
mkdirSync(assetsDir, { recursive: true })

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

// pixel(x,y) → [r,g,b,a]
function makePng(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  let p = 0
  for (let y = 0; y < size; y++) {
    raw[p++] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y, size)
      raw[p++] = r
      raw[p++] = g
      raw[p++] = b
      raw[p++] = a
    }
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const GREEN = hex('#0EA874')
const RED = hex('#E53E3E')
const ACCENT = hex('#1A56DB')

// Anti-aliased filled circle.
function dot(color) {
  return (x, y, size) => {
    const c = (size - 1) / 2
    const r = size * 0.42
    const d = Math.hypot(x - c, y - c)
    const a = Math.max(0, Math.min(1, r - d + 0.5))
    return [color[0], color[1], color[2], Math.round(a * 255)]
  }
}

// App icon: rounded accent square with a white dot.
function appIcon(x, y, size) {
  const c = (size - 1) / 2
  const radius = size * 0.22
  // rounded-square mask
  const dx = Math.max(Math.abs(x - c) - (size / 2 - radius), 0)
  const dy = Math.max(Math.abs(y - c) - (size / 2 - radius), 0)
  const inside = Math.hypot(dx, dy) <= radius
  if (!inside) return [0, 0, 0, 0]
  // white dot in the middle
  const dotR = size * 0.16
  const dd = Math.hypot(x - c, y - c)
  if (dd <= dotR) return [255, 255, 255, 255]
  return [ACCENT[0], ACCENT[1], ACCENT[2], 255]
}

writeFileSync(join(assetsDir, 'tray-icon.png'), makePng(16, dot(GREEN)))
writeFileSync(join(assetsDir, 'tray-icon-recording.png'), makePng(16, dot(RED)))
writeFileSync(join(assetsDir, 'icon.png'), makePng(256, appIcon))
console.log('Wrote tray-icon.png, tray-icon-recording.png, icon.png to', assetsDir)
