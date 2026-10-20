import { analysis } from '../../analysis'
import { formatDate } from '../../format'
import { Avatar } from '../../components/Avatar'
import { CallButton } from '../../components/CallButton'
import { FileIcon } from '../../components/FileIcon'
import { documents, libraryItems } from '../../library'
import { expertsFor, firstName, sentence, canSee, VERDICT_LABEL, type Topic as PeopleTopic } from '../../people/model'
import { expertContext, usePeopleData } from '../../people/store'
import { LANES, type Topic } from '../askme/askmeData'

const docById = new Map(documents.map((d) => [d.id, d]))
const fileById = new Map(libraryItems.map((f) => [f.id, f]))
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
        <h3 className="people-heading">
          Aanbevolen bestanden
          {topic && best.length > 0 && (
            <span className="summary-count">
              {best.length} van {topic.docs.length} {topic.docs.length === 1 ? 'bestand' : 'bestanden'}
            </span>
          )}
        </h3>
        {best.length === 0 ? (
          <div className="summary-empty">Geen aanbevolen bestand over dit onderwerp: deze kennis zit vooral bij mensen.</div>
        ) : (
          <div className="tiles-view summary-files">
            {best.map((d) => {
              const doc = docById.get(d.id)
              const file = fileById.get(d.id)
              if (!doc || !file) return null
              const recommended = d.id in analysis.recommended
              return (
                <button key={d.id} className="tile summary-file" onClick={() => onOpenDoc(d.id)} title={doc.title}>
                  <div className="tile-thumb">
                    <FileIcon kind={file.kind} size={56} />
                    <span className={recommended ? 'file-badge' : 'file-badge lane'}>
                      ✓ {recommended ? 'Aanbevolen' : `Beste · ${laneLabel.get(d.lane)}`}
                    </span>
                  </div>
                  <div className="tile-name">{file.name}</div>
                  <div className="tile-meta">{doc.folder}</div>
                  <div className="tile-meta">
                    {formatDate(doc.modified)} · {doc.owner ?? 'Geen eigenaar'}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </section>

      {top.length > 0 && (
        <section>
          <h3 className="people-heading">Wie weet het meest</h3>
          <ul className="summary-list">
            {top.map((e) => (
              <li key={e.person.name} className="summary-contact">
                <button className="summary-person" onClick={() => onAdvanced(e.person.name)}>
                  <Avatar name={e.person.name} size={52} />
                  <span className="summary-main">
                    <strong>
                      {e.person.name} <span className="team-tag">{e.person.team}</span>
                    </strong>
                    <small className="summary-role">{e.person.role}</small>
                    <small>{sentence(e.person.name, e.headline, canSee(e.headline.signal, viewer))}</small>
                  </span>
                  <span className={`verdict verdict-${e.verdict}`}>{VERDICT_LABEL[e.verdict]}</span>
                </button>
                <CallButton name={e.person.name} />
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
          {explainAdvanced(topic?.docs.length ?? 0, experts.length === 1 ? firstName(experts[0].person.name) : `alle ${experts.length} personen`, experts.length)}
        </span>
      </div>
    </div>
  )
}

function explainAdvanced(files: number, who: string, people: number): string {
  const parts = [
    ...(files > 0 ? [`de tijdlijn met ${files === 1 ? 'de enige bron' : `alle ${files} bronnen`}`] : []),
    ...(people > 0 ? [`wat ${who} erover ${people === 1 ? 'deed' : 'deden'}`] : []),
  ]
  return parts.length ? `Toont ${parts.join(', en ')}.` : ''
}
