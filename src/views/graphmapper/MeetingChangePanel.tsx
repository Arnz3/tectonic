import { useEffect } from 'react'
import { PdfPage } from './PdfPage'
import { formatDate } from '../../format'
import { allDocuments } from './meetings'
import type { GmDocument as Document } from './types'
import { creatorOf } from './data'

/**
 * A change from a meeting, shown inside the original document: the overruled sentence is struck
 * through and the verified sentence from the meeting sits right next to it.
 */
export function MeetingChangePanel({ doc, onOpenDoc, onClose }: { doc: Document; onOpenDoc: (id: string) => void; onClose: () => void }) {
  const m = doc.meeting!
  const original = allDocuments.find((d) => d.id === m.replaces)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const change = (
    <span className="doc-change">
      <del className="doc-del">{m.oldSentence || m.oldValue}</del>{' '}
      <ins className="doc-ins">{m.newSentence || m.newValue}</ins>
      <span className="doc-note">
        Aangepast in {m.title} · {formatDate(m.date)} · ✓ geverifieerd door {m.verifiedBy}
      </span>
    </span>
  )

  return (
    <aside className="gm-panel meeting-panel" aria-label="Wijziging uit meeting">
      <div className="gm-panel-header">
        <h2>{original?.title ?? doc.title}</h2>
        <button className="gm-close" onClick={onClose} aria-label="Sluiten">
          ✕
        </button>
      </div>
      <p className="meeting-panel-sub">Origineel document, met de wijziging uit de meeting erin aangeduid.</p>

      <div className="meeting-change">
        <div className="meeting-change-label">Gewijzigd in {m.title}</div>
        <div className="meeting-change-values">
          <span className="meeting-old">{m.oldValue}</span>
          <span aria-hidden>→</span>
          <span className="meeting-new">{m.newValue}</span>
        </div>
        <blockquote className="meeting-quote">
          “{m.line}”<footer>
            {m.speaker} · {formatDate(m.date)} · ✓ geverifieerd door {m.verifiedBy}
          </footer>
        </blockquote>
      </div>

      {original && (
        <>
          <h3>Origineel document</h3>
          <dl className="gm-meta origin-meta">
            <dt>Bestand</dt>
            <dd>{original.filename}</dd>
            <dt>Opgesteld door</dt>
            <dd>{creatorOf(original)}</dd>
            <dt>Opgesteld op</dt>
            <dd>{formatDate(original.created)}</dd>
            <dt>Eigenaar</dt>
            <dd>{original.owner ?? <span className="gm-warning">Geen eigenaar</span>}</dd>
            <dt>Laatst herzien</dt>
            <dd>
              {formatDate(original.modified)}
              {original.history[0] && ` door ${original.history[0].author}`}
            </dd>
            <dt>Map</dt>
            <dd>{original.folder}</dd>
            <dt>Status nu</dt>
            <dd>
              <span className="origin-replaced">Overschreven door {m.title}</span>
            </dd>
          </dl>
        </>
      )}

      <h3>Wijziging</h3>
      <dl className="gm-meta origin-meta">
        <dt>Gezegd door</dt>
        <dd>
          {m.speaker} in {m.title}
        </dd>
        <dt>Datum</dt>
        <dd>{formatDate(m.date)}</dd>
        <dt>Geverifieerd door</dt>
        <dd>
          <span className="meeting-verified">✓ {m.verifiedBy}</span> · {formatDate(m.verifiedAt)}
        </dd>
      </dl>

      <h3>Document</h3>
      {original && <PdfPage doc={original} mark={{ sentence: m.oldSentence, node: change }} />}

      {original && (
        <button className="meeting-replaces" onClick={() => onOpenDoc(original.id)}>
          <span className="group-dot" style={{ background: 'var(--danger)' }} aria-hidden />
          <span className="group-text">
            <span className="group-name">Open het originele bestand</span>
            <span className="group-meta">
              {original.filename} · {original.owner ?? 'Geen eigenaar'} · {formatDate(original.modified)}
            </span>
          </span>
          <span className="group-chev" aria-hidden>
            ›
          </span>
        </button>
      )}
    </aside>
  )
}
