// Download of a document as it reads after a verified meeting change: the new sentence in place of
// the old one, without any markup, and the edit history at the bottom. Rendered as a clean page and
// handed to the browser's print dialog, where "Opslaan als PDF" saves it. No extra library needed.
import { formatDate } from '../../format'
import type { HistoryEntry } from '../../types'
import type { GmDocument } from './types'

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

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

export function downloadUpdatedDocument(original: GmDocument, change: GmDocument) {
  const m = change.meeting!
  const history = historyAfterChange(original, change)
  const e = escapeHtml
  const html = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<title>${e(original.filename.replace(/\.[a-z]+$/i, ''))}</title>
<style>
  @page { size: A4; margin: 22mm 20mm; }
  body { margin: 0; color: #1f2328; font: 11pt/1.6 Georgia, 'Times New Roman', serif; }
  header { display: flex; justify-content: space-between; padding-bottom: 8pt; border-bottom: 2px solid #1f2328; font-family: Arial, sans-serif; }
  .dept { font-size: 10pt; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
  .muted { color: #59636e; font-size: 8.5pt; }
  .ref { text-align: right; }
  h1 { margin: 18pt 0 10pt; font-size: 18pt; line-height: 1.25; }
  table { width: 100%; border-collapse: collapse; font: 8.5pt/1.4 Arial, sans-serif; }
  th, td { padding: 4pt 6pt; border: 1px solid #d8dee4; text-align: left; vertical-align: top; }
  th { background: #f6f8fa; color: #59636e; font-weight: 600; width: 18%; }
  .meta { margin-bottom: 14pt; }
  p { margin: 0 0 8pt; text-align: justify; }
  h2 { margin: 18pt 0 6pt; font: 700 10pt Arial, sans-serif; text-transform: uppercase; letter-spacing: .06em; }
  footer { margin-top: 18pt; padding-top: 6pt; border-top: 1px solid #d8dee4; color: #8c959f; font: 8pt Arial, sans-serif; display: flex; justify-content: space-between; }
</style>
</head>
<body>
<header>
  <div><div class="dept">${e(original.folder.split('/')[0].trim())}</div><div class="muted">${e(original.layer)} · ${e(original.country)}</div></div>
  <div class="ref muted"><div>Ref. ${e(original.id.toUpperCase())}</div><div>Versie ${e(formatDate(m.verifiedAt))}</div></div>
</header>
<h1>${e(original.title)}</h1>
<table class="meta"><tbody>
  <tr><th>Status</th><td>${e(original.status)}</td><th>Eigenaar</th><td>${e(original.owner ?? '—')}</td></tr>
  <tr><th>Opgesteld</th><td>${e(formatDate(original.created))}</td><th>Laatst herzien</th><td>${e(formatDate(m.verifiedAt))}</td></tr>
  <tr><th>Locatie</th><td colspan="3">${e(original.folder)}</td></tr>
</tbody></table>
${updatedParagraphs(original, change).map((p) => `<p>${e(p)}</p>`).join('\n')}
<h2>Wijzigingsgeschiedenis</h2>
<table><thead><tr><th>Datum</th><th>Door</th><th>Soort</th><th style="width:auto">Wijziging</th></tr></thead><tbody>
${history.map((h) => `<tr><td>${e(formatDate(h.date))}</td><td>${e(h.author)}</td><td>${e(h.change)}</td><td>${e(h.summary)}</td></tr>`).join('\n')}
</tbody></table>
<footer><span>Intern document · fictieve demodata</span><span>Bijgewerkt via Graffify</span></footer>
</body>
</html>`

  // Print from a hidden frame; the browser's print dialog offers "Opslaan als PDF".
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none'
  frame.srcdoc = html
  frame.onload = () => {
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
    window.setTimeout(() => frame.remove(), 1000)
  }
  document.body.appendChild(frame)
}
