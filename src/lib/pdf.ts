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
  const imgW = Math.round(widthPt / 0.75)
  const imgH = Math.round(heightPt / 0.75)
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
