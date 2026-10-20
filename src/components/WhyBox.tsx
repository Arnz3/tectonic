import {
  canSee,
  expertsFor,
  firstName,
  involvementText,
  VERDICT_LABEL,
  type Involvement,
  type Signal,
} from '../people/model'
import { expertContext, usePeopleData } from '../people/store'
import type { Document } from '../types'
import { ActivityItem } from './Activity'

const MAX_PEOPLE = 3
const MAX_ITEMS = 4

/** The people behind this document: the owner first, then whoever made the most content changes. */
function peopleOf(doc: Document): string[] {
  const counts = new Map<string, number>()
  for (const h of doc.history) if (h.change === 'inhoud') counts.set(h.author, (counts.get(h.author) ?? 0) + 1)
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'nl')).map(([name]) => name)
  return [...new Set([...(doc.owner ? [doc.owner] : []), ...ranked])].slice(0, MAX_PEOPLE)
}

/**
 * "Waarom deze info interessant is": what the people behind this document did elsewhere on the
 * same topic (other documents, meetings, Teams, tickets). Metadata only; hidden sources stay locked.
 */
export function WhyBox({ doc }: { doc: Document }) {
  const { data, confirmed, rejected, viewer } = usePeopleData()
  const topic = data.topics.find((t) => t.id === doc.topic)
  const known = new Set(data.people.map((p) => p.name))
  const names = peopleOf(doc).filter((n) => known.has(n))
  if (!topic || names.length === 0) return null

  const experts = expertsFor(topic.id, data, rejected, expertContext(topic.id, confirmed))
  const thisDocDaysAgo = data.signals.find((s) => s.id === doc.id)?.daysAgo ?? 0
  const onTopic = data.signals.filter((s) => s.topic === topic.id && !rejected.has(s.id) && s.id !== doc.id)

  return (
    <section className="why-box">
      <h3>Waarom deze info interessant is</h3>
      <p className="why-sub">Wie aan dit document werkte, en wat die nog over {topic.label.toLowerCase()} deed.</p>
      {names.map((name) => {
        const person = data.people.find((p) => p.name === name)!
        const expert = experts.find((e) => e.person.name === name)
        const mine = onTopic.filter((s) => s.people.some((p) => p.name === name))
        const docs = mine.filter((s) => s.type === 'document')
        const other = mine.filter((s) => s.type !== 'document').sort((a, b) => a.daysAgo - b.daysAgo)
        // This document counts too.
        const days = [thisDocDaysAgo, ...mine.map((s) => s.daysAgo)]
        const involvement: Involvement = {
          signals: mine.length + 1,
          bySource: mine.reduce<Involvement['bySource']>((acc, s) => ({ ...acc, [s.type]: (acc[s.type] ?? 0) + 1 }), { document: 1 }),
          firstDaysAgo: Math.max(...days),
          lastDaysAgo: Math.min(...days),
        }
        return (
          <article key={name} className="why-person">
            <header>
              <strong>{name}</strong>
              <small>
                {doc.owner === name ? 'eigenaar' : 'inhoudelijke wijzigingen'} · {person.role}
              </small>
              {expert && <span className={`verdict verdict-${expert.verdict}`}>{VERDICT_LABEL[expert.verdict]}</span>}
            </header>
            <div className="why-summary">{involvementText(involvement)}</div>
            <ul className="why-list">
              {docs.length > 0 && <DocsLine first={firstName(name)} docs={docs} topic={topic.label.toLowerCase()} visible={(s) => canSee(s, viewer)} />}
              {other.slice(0, MAX_ITEMS).map((s) => (
                <ActivityItem key={s.id} signal={s} name={name} viewer={viewer} />
              ))}
              {other.length > MAX_ITEMS && <li className="why-more">en nog {other.length - MAX_ITEMS} andere signalen</li>}
              {mine.length === 0 && <li className="why-more">Geen andere signalen over dit onderwerp.</li>}
            </ul>
          </article>
        )
      })}
    </section>
  )
}

function DocsLine({ first, docs, topic, visible }: { first: string; docs: Signal[]; topic: string; visible: (s: Signal) => boolean }) {
  const shown = docs.filter(visible)
  const hidden = docs.length - shown.length
  return (
    <li>
      <span className="source-tag">Documenten</span>
      {first} bewerkte nog {docs.length} {docs.length === 1 ? 'ander document' : 'andere documenten'} over {topic}
      {shown.length > 0 && `: ${shown.map((s) => s.title).join(', ')}`}
      {hidden > 0 && ` (${hidden} afgeschermd)`}
    </li>
  )
}
