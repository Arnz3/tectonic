import { useEffect, useRef, useState } from 'react'
import { ActivityItem } from '../../components/Activity'
import { contactsForQuery, expertsFor, involvementText, VERDICT_LABEL, type Expert, type Signal, type Topic } from '../../people/model'
import { expertContext, usePeopleData } from '../../people/store'

const MAX_PEOPLE = 6

/**
 * A simple list of people who may know more, for a topic or (without files) for a search query.
 * A click opens what they did on it (meetings, Teams, tickets, documents), newest first.
 */
export function PeopleOverview(props: { topic?: Topic; query?: string; initialOpen?: string | null; heading?: string }) {
  const { topic, query = '', initialOpen = null, heading = 'Personen die hier meer over weten' } = props
  const { data, confirmed, rejected, viewer } = usePeopleData()
  const [open, setOpen] = useState<string | null>(initialOpen)
  const sectionRef = useRef<HTMLElement>(null)
  // Coming from a person in the simple view: show that person right away.
  useEffect(() => {
    if (initialOpen) sectionRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [initialOpen])
  const experts = (
    topic ? expertsFor(topic.id, data, rejected, expertContext(topic.id, confirmed)) : contactsForQuery(query, data, rejected)
  ).slice(0, MAX_PEOPLE)
  if (experts.length === 0) return null

  return (
    <section className="people-overview" ref={sectionRef}>
      <h3 className="people-heading">{heading}</h3>
      <ul>
        {experts.map((e) => {
          const name = e.person.name
          const isOpen = open === name
          // Without a topic: the matching meetings and Teams messages behind this contact.
          const activity = (topic ? data.signals.filter((s) => s.topic === topic.id && !rejected.has(s.id)) : allEvidence(e))
            .filter((s) => s.people.some((p) => p.name === name))
            .sort((a, b) => a.daysAgo - b.daysAgo)
          return (
            <li key={name} className={isOpen ? 'open' : ''}>
              <button className="overview-row" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : name)}>
                <span className="overview-caret" aria-hidden>
                  {isOpen ? '▾' : '▸'}
                </span>
                <strong>{name}</strong>
                <small>{e.person.role}</small>
                <span className={`verdict verdict-${e.verdict}`}>{VERDICT_LABEL[e.verdict]}</span>
              </button>
              {isOpen && (
                <div className="overview-detail">
                  <div className="why-summary">{involvementText(e.involvement)}</div>
                  <ul className="why-list">
                    {activity.map((s) => (
                      <ActivityItem key={s.id} signal={s} name={name} viewer={viewer} />
                    ))}
                  </ul>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function allEvidence(expert: Expert): Signal[] {
  return [expert.headline, ...expert.more].map((e) => e.signal)
}
