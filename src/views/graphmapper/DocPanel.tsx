import { useEffect } from 'react'
import { analysis } from '../../analysis'
import { formatDate } from '../../format'
import { PdfPage } from './PdfPage'
import type { GmDocument } from './types'

const COUNTRY: Record<GmDocument['country'], string> = { BE: 'België', NL: 'Nederland', DE: 'Duitsland' }

/** Side panel of the graph mapper: a document as an official PDF page, with why it can be trusted. */
export function DocPanel({ doc, onClose }: { doc: GmDocument; onClose: () => void }) {
  const reasons = analysis.recommended[doc.id]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <aside className="gm-panel" aria-label="Document">
      <div className="gm-panel-header">
        <h2>{doc.title}</h2>
        <button className="gm-close" onClick={onClose} aria-label="Sluiten">
          ✕
        </button>
      </div>

      <dl className="gm-meta">
        <dt>Status</dt>
        <dd>
          <span className={`gm-status gm-status-${doc.status}`}>{doc.status}</span>
        </dd>
        <dt>Eigenaar</dt>
        <dd>{doc.owner ?? <span className="gm-warning">Geen eigenaar</span>}</dd>
        <dt>Gewijzigd</dt>
        <dd>{formatDate(doc.modified)}</dd>
        <dt>Land</dt>
        <dd>{COUNTRY[doc.country]}</dd>
        <dt>Map</dt>
        <dd>{doc.folder}</dd>
      </dl>

      {reasons && (
        <div className="gm-recommended-box">
          <div className="gm-recommended-title">Waarom betrouwbaar</div>
          <ul>
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <h3>Document</h3>
      <PdfPage doc={doc} />

      <h3>Wijzigingsgeschiedenis</h3>
      <ul className="gm-history">
        {doc.history.map((h, i) => (
          <li key={i}>
            <span className={`gm-change gm-change-${h.change}`}>{h.change}</span>
            <span>
              <strong>{h.author}</strong> · {formatDate(h.date)}
              <br />
              {h.summary}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  )
}
