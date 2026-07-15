/**
 * Reads the pixel width/height a JPEG's own SOF marker declares. The PDF spec requires an
 * Image XObject's /Width and /Height to match the actual encoded sample dimensions — deriving
 * them from the page point size instead (a fixed px-per-pt ratio) breaks the moment the source
 * image's resolution doesn't happen to match that ratio, e.g. a higher-DPI capture shown at a
 * smaller point size on the page.
 */
function readJpegDimensions(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error('Not a valid JPEG (missing SOI marker)')
  }
  let i = 2
  while (i + 9 <= bytes.length) {
    if (bytes[i] !== 0xff) { i++; continue }
    const marker = bytes[i + 1]!
    // Markers with no length/payload (RST0-7, TEM, and a stray fill 0xFF already skipped above).
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2
      continue
    }
    const length = (bytes[i + 2]! << 8) | bytes[i + 3]!
    // SOF0-SOF15, excluding DHT (C4), JPG extension (C8), and DAC (CC) which share the range.
    const isSofMarker = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isSofMarker) {
      const height = (bytes[i + 5]! << 8) | bytes[i + 6]!
      const width = (bytes[i + 7]! << 8) | bytes[i + 8]!
      return { width, height }
    }
    if (marker === 0xda) break // Start of Scan — no more header markers follow
    i += 2 + length
  }
  throw new Error('Could not find a JPEG SOF marker to read image dimensions from')
}

/**
 * Builds a single-page PDF that embeds a JPEG image.
 * No external dependencies — uses raw PDF syntax.
 */
export function buildPdf(jpegBytes: Uint8Array, widthPt: number, heightPt: number): Uint8Array {
  const enc = new TextEncoder()

  const offsets: number[] = [] // offsets[n] = byte offset of object n
  const parts: Uint8Array[] = []

  const push = (...chunks: (string | Uint8Array)[]) => {
    for (const c of chunks) parts.push(typeof c === 'string' ? enc.encode(c) : c)
  }

  const currentOffset = () => parts.reduce((a, p) => a + p.length, 0)

  const startObj = (n: number) => { offsets[n] = currentOffset(); push(`${n} 0 obj\n`) }
  const endObj = () => push('endobj\n')

  push('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n')  // header + binary hint

  startObj(1)
  push('<< /Type /Catalog /Pages 2 0 R >>\n')
  endObj()

  startObj(2)
  push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n')
  endObj()

  startObj(3)
  push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPt} ${heightPt}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\n`)
  endObj()

  // Image XObject (raw JPEG — /DCTDecode, no re-encoding needed)
  const { width: imgW, height: imgH } = readJpegDimensions(jpegBytes)
  startObj(4)
  push(`<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`)
  push(jpegBytes)
  push('\nendstream\n')
  endObj()

  // Content stream: draw the image to fill the page
  const cs = enc.encode(`q ${widthPt} 0 0 ${heightPt} 0 0 cm /Im0 Do Q`)
  startObj(5)
  push(`<< /Length ${cs.length} >>\nstream\n`)
  push(cs)
  push('\nendstream\n')
  endObj()

  const xrefStart = currentOffset()
  const objCount = offsets.length  // 1-based; object 0 is the free head

  push(`xref\n0 ${objCount + 1}\n`)
  push('0000000000 65535 f \n')
  for (let i = 1; i <= objCount; i++) {
    push((offsets[i] ?? 0).toString().padStart(10, '0') + ' 00000 n \n')
  }
  push(`trailer\n<< /Size ${objCount + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`)

  const total = parts.reduce((a, p) => a + p.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const p of parts) { out.set(p, offset); offset += p.length }
  return out
}
