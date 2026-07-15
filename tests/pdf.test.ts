import { describe, expect, it } from 'vitest'
import { buildPdf } from '@/lib/pdf.ts'

// SOI + minimal JFIF APP0 + a SOF0 marker declaring 400x200px — no scan data, since buildPdf
// never decodes pixel data, only reads the SOF header for the image's real dimensions.
const FAKE_JPEG = new Uint8Array([
  0xff, 0xd8, // SOI
  0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x02, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, // APP0/JFIF
  0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0xc8, 0x01, 0x90, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, // SOF0: 400x200
])

describe('buildPdf', () => {
  it('produces a parseable single-page PDF skeleton', () => {
    const bytes = buildPdf(FAKE_JPEG, 450, 225)
    const text = new TextDecoder('latin1').decode(bytes)

    expect(text.startsWith('%PDF-1.4\n')).toBe(true)
    expect(text).toContain('/Type /Catalog')
    expect(text).toContain('/Type /Pages /Kids [3 0 R] /Count 1')
    expect(text).toContain('/MediaBox [0 0 450 225]')
    expect(text).toContain('/Filter /DCTDecode')
    expect(text).toContain(`/Length ${FAKE_JPEG.length}`)
    expect(text).toContain('q 450 0 0 225 0 0 cm /Im0 Do Q')
    expect(text).toContain('trailer')
    // Characterization: objCount derives from offsets.length (6, incl. the unused
    // 0 slot), so the trailer declares /Size 7 with one padding xref entry.
    expect(text).toContain('/Size 7 /Root 1 0 R')
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
  })

  it('embeds the JPEG bytes verbatim', () => {
    const bytes = buildPdf(FAKE_JPEG, 100, 100)
    const haystack = Array.from(bytes)
    const needle = Array.from(FAKE_JPEG)
    let found = false
    outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
      for (let j = 0; j < needle.length; j++) {
        if (haystack[i + j] !== needle[j]) continue outer
      }
      found = true
      break
    }
    expect(found).toBe(true)
  })

  it('declares the image XObject size from the JPEG\'s own SOF marker, independent of the page point size', () => {
    const text = new TextDecoder('latin1').decode(buildPdf(FAKE_JPEG, 300, 150))
    expect(text).toContain('/Width 400 /Height 200')
    // A different page size doesn't change the source image's declared pixel dimensions —
    // display size (MediaBox / cm scale) and source resolution are independent.
    const text2 = new TextDecoder('latin1').decode(buildPdf(FAKE_JPEG, 900, 900))
    expect(text2).toContain('/Width 400 /Height 200')
  })

  it('throws on a JPEG with no SOF marker', () => {
    const noSof = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) // SOI + EOI only
    expect(() => buildPdf(noSof, 100, 100)).toThrow(/SOF marker/)
  })

  it('xref offsets point at the matching "n 0 obj" headers', () => {
    const bytes = buildPdf(FAKE_JPEG, 100, 100)
    const text = new TextDecoder('latin1').decode(bytes)
    const xref = /xref\n0 (\d+)\n([\s\S]+?)trailer/.exec(text)
    expect(xref).not.toBeNull()
    const lines = xref![2]!.trimEnd().split('\n')
    // free head + objects 1..5 + one zero padding entry (see /Size quirk above)
    expect(lines).toHaveLength(7)
    for (let n = 1; n <= 5; n++) {
      const offset = parseInt(lines[n]!.slice(0, 10), 10)
      expect(text.slice(offset, offset + `${n} 0 obj`.length)).toBe(`${n} 0 obj`)
    }
    expect(lines[6]!.startsWith('0000000000')).toBe(true)
  })
})
