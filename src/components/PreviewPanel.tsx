import { formatDate } from '../format'
import type { Document } from '../types'

const countryLabel: Record<Document['country'], string> = { BE: 'België', NL: 'Nederland', DE: 'Duitsland' }

export function PreviewPanel({ doc, onClose }: { doc: Document; onClose: () => void }) {
  return (
    <aside className="preview-panel" aria-label="Voorbeeld">
      <div className="preview-header">
        <h2>{doc.title}</h2>
        <button className="close" onClick={onClose} aria-label="Sluiten">
          ✕
        </button>
      </div>

      <dl className="preview-meta">
        <dt>Bestand</dt>
        <dd>{doc.filename}</dd>
        <dt>Map</dt>
        <dd>{doc.folder}</dd>
        <dt>Land</dt>
        <dd>{countryLabel[doc.country]}</dd>
        <dt>Onderwerp</dt>
        <dd>{doc.topic}</dd>
        <dt>Laag</dt>
        <dd>{doc.layer}</dd>
        <dt>Status</dt>
        <dd>
          <span className={`status status-${doc.status}`}>{doc.status}</span>
        </dd>
        <dt>Eigenaar</dt>
        <dd>{doc.owner ?? <span className="warning">Geen eigenaar</span>}</dd>
        <dt>Gemaakt</dt>
        <dd>{formatDate(doc.created)}</dd>
        <dt>Gewijzigd</dt>
        <dd>{formatDate(doc.modified)}</dd>
      </dl>

      <h3>Inhoud</h3>
      <div className="preview-text">{doc.text}</div>

      <h3>Wijzigingsgeschiedenis</h3>
      <ul className="history">
        {doc.history.map((h, i) => (
          <li key={i}>
            <span className={`change change-${h.change}`}>{h.change}</span>
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
