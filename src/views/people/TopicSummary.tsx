import { analysis } from '../../analysis'
import { formatDate } from '../../format'
import { documents } from '../../library'
import { expertsFor, firstName, sentence, canSee, VERDICT_LABEL, type Topic as PeopleTopic } from '../../people/model'
import { expertContext, usePeopleData } from '../../people/store'
import { LANES, type Topic } from '../askme/askmeData'

const docById = new Map(documents.map((d) => [d.id, d]))
const laneLabel = new Map(LANES.map((l) => [l.id, l.label]))
const laneOrder = new Map(LANES.map((l, i) => [l.id, i]))
const MAX_PEOPLE = 3

/**
 * The simple view of a topic: only the most trustworthy files and the people who know most.
 * "Hoe kom ik eraan?" opens the advanced view (timeline with every source, all people).
 */
export function TopicSummary(props: {
  topic?: Topic
  peopleTopic?: PeopleTopic
  onOpenDoc: (id: string) => void
  onAdvanced: (person?: string) => void
}) {
  const { topic, peopleTopic, onOpenDoc, onAdvanced } = props
  const { data, confirmed, rejected, viewer } = usePeopleData()

  const best = (topic?.docs ?? [])
    .filter((d) => d.trust === 'best')
    .sort(
      (a, b) =>
        Number(!(a.id in analysis.recommended)) - Number(!(b.id in analysis.recommended)) ||
        (laneOrder.get(a.lane) ?? 9) - (laneOrder.get(b.lane) ?? 9),
    )

  const experts = peopleTopic ? expertsFor(peopleTopic.id, data, rejected, expertContext(peopleTopic.id, confirmed)) : []
  // Only people likely to have the right answer; when there are none, the strongest one.
  const likely = experts.filter((e) => e.verdict === 'likely')
  const top = (likely.length > 0 ? likely : experts.slice(0, 1)).slice(0, MAX_PEOPLE)

  return (
    <div className="topic-summary">
      <section>
        <h3 className="people-heading">Aanbevolen bestanden</h3>
        {best.length === 0 ? (
          <div className="summary-empty">Geen aanbevolen bestand over dit onderwerp: deze kennis zit vooral bij mensen.</div>
        ) : (
          <ul className="summary-list">
            {best.map((d) => {
              const doc = docById.get(d.id)
              const reasons = analysis.recommended[d.id]
              return (
                <li key={d.id}>
                  <button className="summary-doc" onClick={() => onOpenDoc(d.id)}>
                    <span className="summary-check" aria-hidden>
                      ✓
                    </span>
                    <span className="summary-main">
                      <strong>{d.title}</strong>
                      <small>
                        {reasons ? 'Aanbevolen' : `Meest betrouwbaar · ${laneLabel.get(d.lane)}`}
                        {doc && ` · ${doc.owner ?? 'Geen eigenaar'} · gewijzigd ${formatDate(doc.modified)}`}
                      </small>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {top.length > 0 && (
        <section>
          <h3 className="people-heading">Wie weet het meest</h3>
          <ul className="summary-list">
            {top.map((e) => (
              <li key={e.person.name}>
                <button className="summary-person" onClick={() => onAdvanced(e.person.name)}>
                  <span className="summary-main">
                    <strong>{e.person.name}</strong>
                    <small>{sentence(e.person.name, e.headline, canSee(e.headline.signal, viewer))}</small>
                  </span>
                  <span className={`verdict verdict-${e.verdict}`}>{VERDICT_LABEL[e.verdict]}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="summary-actions">
        <button className="primary-action" onClick={() => onAdvanced()}>
          Hoe kom ik eraan?
        </button>
        <span className="askme-hint">
          Toont de tijdlijn met alle {topic?.docs.length ?? 0} bronnen{experts.length > 0 && `, en wat ${experts.length === 1 ? firstName(experts[0].person.name) : `alle ${experts.length} personen`} erover deden`}.
        </span>
      </div>
    </div>
  )
}
