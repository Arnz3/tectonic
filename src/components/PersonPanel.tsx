import { analysis } from '../analysis'
import { documents } from '../library'

const docById = new Map(documents.map((d) => [d.id, d]))

/** Side panel for a person node: expert score per visible cluster (CLAUDE.md, section 12, M4d). */
export function PersonPanel({ author, docIds, onClose }: { author: string; docIds: string[]; onClose: () => void }) {
  const visible = new Set(docIds)
  const entries = analysis.clusters
    .filter((c) => c.documents.some((d) => visible.has(d)))
    .flatMap((c) => {
      const expert = c.experts.find((e) => e.author === author)
      return expert ? [{ cluster: c, expert }] : []
    })
    .sort((a, b) => b.expert.score - a.expert.score)

  const changedDocs = docIds
    .map((id) => docById.get(id)!)
    .map((doc) => ({ doc, count: doc.history.filter((h) => h.author === author && h.change === 'inhoud').length }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count || a.doc.title.localeCompare(b.doc.title, 'nl'))

  return (
    <aside className="preview-panel" aria-label="Persoon">
      <div className="preview-header">
        <h2>{author}</h2>
        <button className="close" onClick={onClose} aria-label="Sluiten">
          ✕
        </button>
      </div>

      {entries.map(({ cluster, expert }) => (
        <section key={cluster.documents[0]} className="person-cluster">
          <h3>
            Aanspreekpunt voor {cluster.topic}
            <span className="who-score">{expert.score.toFixed(1).replace('.', ',')}</span>
          </h3>
          {expert.warning && <div className="who-warning">⚠ {expert.warning}</div>}
          <ul className="person-reasons">
            {expert.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <div className="who-counts">
            {expert.inhoud} inhoudelijk
            {expert.opmaak > 0 && <small> · {expert.opmaak} opmaak (telt niet mee)</small>}
          </div>
        </section>
      ))}

      <h3>Inhoudelijke wijzigingen in deze weergave</h3>
      <ul className="history">
        {changedDocs.map(({ doc, count }) => (
          <li key={doc.id}>
            <span className={`status status-${doc.status}`}>{count}×</span>
            <span>
              {doc.title}
              <br />
              <small className="path">{doc.status}</small>
            </span>
          </li>
        ))}
      </ul>
    </aside>
  )
}
