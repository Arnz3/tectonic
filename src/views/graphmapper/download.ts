// Download of a document as it reads after a verified meeting change: the new sentence in place of
// the old one, without any markup, and the edit history at the bottom. Saved as a real PDF file.
import { formatDate } from '../../format'
import type { HistoryEntry } from '../../types'
import { PdfWriter } from './pdf'
import type { GmDocument } from './types'

const COUNTRY: Record<GmDocument['country'], string> = { BE: 'België', NL: 'Nederland', DE: 'Duitsland' }
const LAYER: Record<GmDocument['layer'], string> = { wet: 'Regelgeving', sector: 'Sectorregeling', procedure: 'Procedure', klant: 'Klantafspraak' }

/** The edit history after the change: the verified meeting change first, then the original history. */
export function historyAfterChange(original: GmDocument, change: GmDocument): HistoryEntry[] {
  const m = change.meeting!
  return [
    {
      author: m.verifiedBy,
      date: m.verifiedAt,
      change: 'inhoud',
      summary: `${m.oldValue} → ${m.newValue}, besproken in ${m.title} (${m.speaker}) en geverifieerd door ${m.verifiedBy}`,
    },
    ...original.history,
  ]
}

/** The original text with the overruled sentence replaced, without the document's own title line. */
export function updatedParagraphs(original: GmDocument, change: GmDocument): string[] {
  const m = change.meeting!
  const text = m.oldSentence && original.text.includes(m.oldSentence) ? original.text.replace(m.oldSentence, m.newSentence) : original.text
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  return paragraphs[0]?.startsWith(original.title.split(' ')[0]) ? paragraphs.slice(1) : paragraphs
}

const MUTED: [number, number, number] = [0.35, 0.39, 0.43]

export function buildUpdatedPdf(original: GmDocument, change: GmDocument): Blob {
  const m = change.meeting!
  const pdf = new PdfWriter((page, pages) => ({ left: 'Intern document · fictieve demodata · bijgewerkt via Graffify', right: `Pagina ${page} van ${pages}` }))

  // Letterhead
  pdf.row(original.folder.split('/')[0].trim().toUpperCase(), `Ref. ${original.id.toUpperCase()}`, { font: 'F2', size: 10 })
  pdf.row(`${LAYER[original.layer]} · ${COUNTRY[original.country]}`, `Versie ${formatDate(m.verifiedAt)}`, { size: 8.5, color: MUTED })
  pdf.rule(1.4, [0.12, 0.14, 0.16])

  // Title and metadata
  pdf.space(10)
  pdf.text(original.title, { font: 'F2', size: 18, leading: 24 })
  pdf.space(6)
  pdf.text(`Status: ${original.status}   ·   Eigenaar: ${original.owner ?? '—'}   ·   Locatie: ${original.folder}`, { font: 'F1', size: 8.5, color: MUTED })
  pdf.text(`Opgesteld: ${formatDate(original.created)}   ·   Laatst herzien: ${formatDate(m.verifiedAt)}`, { font: 'F1', size: 8.5, color: MUTED })
  pdf.rule()
  pdf.space(4)

  // Body, with the new sentence in place of the old one
  for (const p of updatedParagraphs(original, change)) {
    pdf.text(p, { font: 'F3', size: 11, leading: 15.5 })
    pdf.space(6)
  }

  // Edit history
  pdf.space(8)
  pdf.text('WIJZIGINGSGESCHIEDENIS', { font: 'F2', size: 9.5 })
  pdf.rule()
  for (const h of historyAfterChange(original, change)) {
    pdf.text(`${formatDate(h.date)}  ·  ${h.author}  ·  ${h.change}`, { font: 'F2', size: 9, leading: 13 })
    pdf.text(h.summary, { font: 'F1', size: 9, leading: 12.5, color: MUTED, indent: 12 })
    pdf.space(4)
  }

  return pdf.toBlob()
}

/** Downloads the updated document as "<file>_bijgewerkt.pdf". */
export function downloadUpdatedDocument(original: GmDocument, change: GmDocument) {
  const url = URL.createObjectURL(buildUpdatedPdf(original, change))
  const a = document.createElement('a')
  a.href = url
  a.download = `${original.filename.replace(/\.[a-z]+$/i, '')}_bijgewerkt.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
