// A small PDF writer for plain text documents: standard fonts, A4 pages, word wrap, page footer.
// Enough for a downloadable document without adding a PDF library to the project.

type Font = 'F1' | 'F2' | 'F3' // Helvetica, Helvetica-Bold, Times-Roman
type Rgb = [number, number, number]

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 56
const FOOTER_Y = 36

// Windows-1252 bytes for the characters outside Latin-1 that Dutch documents use.
const CP1252: Record<string, number> = {
  '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99,
}
const REPLACE: Record<string, string> = { '→': '->', '✓': 'v', '←': '<-' }

function encode(s: string): string {
  let out = ''
  for (const ch of s) {
    const c = REPLACE[ch] ?? ch
    for (const k of c) {
      const code = k.codePointAt(0)!
      if (CP1252[k] !== undefined) out += String.fromCharCode(CP1252[k])
      else if (code >= 0x20 && code <= 0xff) out += k
      else out += '?'
    }
  }
  return out.replace(/[\\()]/g, (m) => `\\${m}`)
}

// Approximate glyph widths (in em) of Helvetica; Times is a little narrower.
function charWidth(ch: string): number {
  if (ch === ' ') return 0.278
  if ('il.,;:!|\'`'.includes(ch)) return 0.25
  if ('fjrtI()[]-/'.includes(ch)) return 0.34
  if ('mwMW@%'.includes(ch)) return 0.86
  if (/[A-Z]/.test(ch)) return 0.68
  if (/[0-9€]/.test(ch)) return 0.556
  return 0.54
}
export function textWidth(s: string, font: Font, size: number): number {
  let w = 0
  for (const ch of s) w += charWidth(ch)
  return w * size * (font === 'F3' ? 0.9 : font === 'F2' ? 1.06 : 1)
}

function wrap(s: string, font: Font, size: number, maxWidth: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of s.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word
    if (line && textWidth(next, font, size) > maxWidth) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

export class PdfWriter {
  private pages: string[][] = [[]]
  private y = PAGE_H - MARGIN
  readonly left = MARGIN
  readonly right = PAGE_W - MARGIN
  private footer: (page: number, pages: number) => { left: string; right: string }

  constructor(footer: (page: number, pages: number) => { left: string; right: string }) {
    this.footer = footer
  }

  private get ops() {
    return this.pages[this.pages.length - 1]
  }

  private ensure(height: number) {
    if (this.y - height < FOOTER_Y + 28) {
      this.pages.push([])
      this.y = PAGE_H - MARGIN
    }
  }

  private draw(text: string, x: number, y: number, font: Font, size: number, color: Rgb = [0.12, 0.14, 0.16]) {
    this.ops.push(`BT ${color.join(' ')} rg /${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${encode(text)}) Tj ET`)
  }

  space(h: number) {
    this.y -= h
  }

  /** Wrapped text at the cursor; `indent` shifts it right. */
  text(s: string, opts: { font?: Font; size?: number; leading?: number; color?: Rgb; indent?: number } = {}) {
    const font = opts.font ?? 'F3'
    const size = opts.size ?? 11
    const leading = opts.leading ?? size * 1.45
    const x = this.left + (opts.indent ?? 0)
    for (const line of wrap(s, font, size, this.right - x)) {
      this.ensure(leading)
      this.y -= leading
      this.draw(line, x, this.y, font, size, opts.color)
    }
  }

  /** Two texts on one line: one at the left, one aligned to the right margin. */
  row(leftText: string, rightText: string, opts: { font?: Font; rightFont?: Font; size?: number; color?: Rgb } = {}) {
    const size = opts.size ?? 9
    this.ensure(size * 1.5)
    this.y -= size * 1.5
    this.draw(leftText, this.left, this.y, opts.font ?? 'F1', size, opts.color)
    const rf = opts.rightFont ?? 'F1'
    this.draw(rightText, this.right - textWidth(rightText, rf, size), this.y, rf, size, [0.35, 0.39, 0.43])
  }

  rule(width = 0.6, color: Rgb = [0.85, 0.87, 0.89]) {
    this.y -= 6
    this.ops.push(`${color.join(' ')} RG ${width} w ${this.left} ${this.y.toFixed(2)} m ${this.right} ${this.y.toFixed(2)} l S`)
    this.y -= 4
  }

  /** The finished file. Text is Windows-1252, so every character is one byte. */
  toBlob(): Blob {
    const n = this.pages.length
    const pageContents = this.pages.map((ops, i) => {
      const f = this.footer(i + 1, n)
      const footer = [
        `0.85 0.87 0.89 RG 0.5 w ${this.left} ${FOOTER_Y + 12} m ${this.right} ${FOOTER_Y + 12} l S`,
        `BT 0.55 0.58 0.62 rg /F1 8 Tf ${this.left} ${FOOTER_Y} Td (${encode(f.left)}) Tj ET`,
        `BT 0.55 0.58 0.62 rg /F1 8 Tf ${(this.right - textWidth(f.right, 'F1', 8)).toFixed(2)} ${FOOTER_Y} Td (${encode(f.right)}) Tj ET`,
      ]
      return [...ops, ...footer].join('\n')
    })

    // Objects: 1 catalog, 2 pages, 3-5 fonts, then a page and its content per page.
    const objects: string[] = []
    const kids = pageContents.map((_, i) => `${6 + i * 2} 0 R`).join(' ')
    objects.push('<< /Type /Catalog /Pages 2 0 R >>')
    objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${n} >>`)
    for (const base of ['Helvetica', 'Helvetica-Bold', 'Times-Roman']) {
      objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /${base} /Encoding /WinAnsiEncoding >>`)
    }
    pageContents.forEach((content, i) => {
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${7 + i * 2} 0 R >>`,
      )
      objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
    })

    let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'
    const offsets: number[] = []
    objects.forEach((body, i) => {
      offsets.push(out.length)
      out += `${i + 1} 0 obj\n${body}\nendobj\n`
    })
    const xref = out.length
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
    out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`

    const bytes = new Uint8Array(out.length)
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff
    return new Blob([bytes], { type: 'application/pdf' })
  }
}
