import type { ReactNode } from 'react'
import { formatDate } from '../../format'
import type { GmDocument as Document } from './types'

const COUNTRY: Record<Document['country'], string> = { BE: 'België', NL: 'Nederland', DE: 'Duitsland' }
const LAYER: Record<Document['layer'], string> = { wet: 'Regelgeving', sector: 'Sectorregeling', procedure: 'Procedure', klant: 'Klantafspraak' }

/**
 * A document rendered as an official PDF page in a viewer: letterhead, reference, metadata,
 * body text and footer. All content is plain text. `mark` replaces one literal sentence with a node.
 */
export function PdfPage({ doc, mark }: { doc: Document; mark?: { sentence: string; node: ReactNode } }) {
  const paragraphs = doc.text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  // The first paragraph is the document's own title line; the page header shows it instead.
  const body = paragraphs[0]?.startsWith(doc.title.split(' ')[0]) ? paragraphs.slice(1) : paragraphs
  const department = doc.folder.split('/')[0].trim()
  const watermark = doc.status === 'verouderd' ? 'VEROUDERD' : doc.status === 'concept' ? 'CONCEPT' : null
  const pdfName = doc.filename.replace(/\.[a-z]+$/i, '.pdf')
  let marked = false

  const renderParagraph = (p: string, i: number) => {
    if (mark && !marked && p.includes(mark.sentence)) {
      marked = true
      const at = p.indexOf(mark.sentence)
      return (
        <p key={i}>
          {p.slice(0, at)}
          {mark.node}
          {p.slice(at + mark.sentence.length)}
        </p>
      )
    }
    return <p key={i}>{p}</p>
  }
  const rendered = body.map(renderParagraph)

  return (
    <div className="pdf-viewer">
      <div className="pdf-toolbar">
        <span className="pdf-file">
          <span className="pdf-icon" aria-hidden>
            PDF
          </span>
          {pdfName}
        </span>
        <span className="pdf-tools">1 / 1 · 100%</span>
      </div>
      <div className="pdf-canvas">
        <article className="pdf-page">
          {watermark && (
            <div className="pdf-watermark" aria-hidden>
              {watermark}
            </div>
          )}
          <header className="pdf-letterhead">
            <div>
              <div className="pdf-dept">{department}</div>
              <div className="pdf-kind">
                {LAYER[doc.layer]} · {COUNTRY[doc.country]}
              </div>
            </div>
            <div className="pdf-ref">
              <div>Ref. {doc.id.toUpperCase()}</div>
              <div>Versie {formatDate(doc.modified)}</div>
            </div>
          </header>

          <h1 className="pdf-title">{doc.title}</h1>

          <table className="pdf-meta">
            <tbody>
              <tr>
                <th>Status</th>
                <td>{doc.status}</td>
                <th>Eigenaar</th>
                <td>{doc.owner ?? '—'}</td>
              </tr>
              <tr>
                <th>Opgesteld</th>
                <td>{formatDate(doc.created)}</td>
                <th>Laatst herzien</th>
                <td>{formatDate(doc.modified)}</td>
              </tr>
              <tr>
                <th>Locatie</th>
                <td colSpan={3}>{doc.folder}</td>
              </tr>
            </tbody>
          </table>

          <div className="pdf-body">
            {mark && !marked && <p>{mark.node}</p>}
            {rendered}
          </div>

          <footer className="pdf-footer">
            <span>Intern document · fictieve demodata</span>
            <span>Pagina 1 van 1</span>
          </footer>
        </article>
      </div>
    </div>
  )
}
