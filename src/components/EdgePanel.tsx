import type { AnalysisEdge } from '../analysis'
import { formatDate } from '../format'
import { documents } from '../library'
import { relationStyles } from '../views/KnowledgeGraphView'

const docById = new Map(documents.map((d) => [d.id, d]))

export function EdgePanel({ edge, onClose }: { edge: AnalysisEdge; onClose: () => void }) {
  const style = relationStyles[edge.relation]
  const a = docById.get(edge.source)
  const b = docById.get(edge.target)
  const hasStatements = edge.statement_a !== '' || edge.statement_b !== ''

  return (
    <aside className="preview-panel" aria-label="Verband">
      <div className="preview-header">
        <h2>
          <span className="relation-chip" style={{ borderColor: style.color, color: style.color }}>
            {style.label}
          </span>
        </h2>
        <button className="close" onClick={onClose} aria-label="Sluiten">
          ✕
        </button>
      </div>
      <p className="edge-docs">
        {a?.title} ↔ {b?.title}
        <br />
        <small>Gelijkenis {edge.similarity.toFixed(2).replace('.', ',')}</small>
      </p>

      {hasStatements && (
        <div className="statements">
          {[
            { doc: a, text: edge.statement_a },
            { doc: b, text: edge.statement_b },
          ].map(({ doc, text }, i) => (
            <div key={i} className="statement" style={{ borderColor: style.color }}>
              <div className="statement-doc">{doc?.title}</div>
              <div className="statement-meta">
                {doc?.status} · {doc && formatDate(doc.modified)}
              </div>
              <blockquote>{text || <em>Geen letterlijke uitspraak gevonden.</em>}</blockquote>
            </div>
          ))}
        </div>
      )}

      {edge.explanation && (
        <>
          <h3>Uitleg</h3>
          <p>{edge.explanation}</p>
        </>
      )}
    </aside>
  )
}
