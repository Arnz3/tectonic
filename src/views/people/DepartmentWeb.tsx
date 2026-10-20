import { useState } from 'react'
import { countsText, departments, departmentWeb, firstName, VERDICT_LABEL, type DepartmentPerson, type DepartmentTopic } from '../../people/model'
import { expertContext, usePeopleData } from '../../people/store'

const W = 760
const H = 540
const CX = W / 2
const CY = H / 2
const PEOPLE_R = 115
const TOPIC_R = 210

type Selection = { kind: 'person' | 'topic'; id: string } | null

const initials = (name: string) =>
  name
    .split(' ')
    .filter((w) => w[0] === w[0]?.toUpperCase())
    .map((w) => w[0])
    .slice(0, 2)
    .join('')

/**
 * Per department a web of people and the topics they work on, with counts only. Another
 * department sees who to ask about a topic without access to the files or meetings.
 */
export function DepartmentWeb() {
  const { data, confirmed, rejected } = usePeopleData()
  const teams = departments(data)
  const [team, setTeam] = useState(teams.includes('Klantendienst') ? 'Klantendienst' : teams[0])
  const [selected, setSelected] = useState<Selection>(null)
  const web = departmentWeb(team, data, rejected, (topic) => expertContext(topic, confirmed))

  function pickTeam(next: string) {
    setTeam(next)
    setSelected(null)
  }

  return (
    <div className="department">
      <div className="department-tabs" role="tablist" aria-label="Afdeling">
        {teams.map((t) => (
          <button key={t} role="tab" aria-selected={t === team} className={t === team ? 'active' : ''} onClick={() => pickTeam(t)}>
            {t}
          </button>
        ))}
      </div>
      <p className="askme-hint">
        Wie in {team} met welke onderwerpen bezig is, op basis van meetings, documenten, Teams en tickets. Alleen aantallen: je hebt geen toegang
        nodig tot hun bestanden of meetings.
      </p>

      {web.people.length === 0 ? (
        <div className="summary-empty">Nog geen signalen voor deze afdeling.</div>
      ) : (
        <div className="department-layout">
          <Web web={web} selected={selected} onSelect={setSelected} />
          <Details web={web} selected={selected} />
        </div>
      )}

      <section>
        <h3 className="people-heading">Onderwerpen en aanbevolen contactpersoon</h3>
        <table className="department-table">
          <thead>
            <tr>
              <th>Onderwerp</th>
              <th>Contactpersoon in {team}</th>
              <th>Activiteit van die persoon</th>
            </tr>
          </thead>
          <tbody>
            {web.topics.map((t) => (
              <tr key={t.topic.id} className={selected?.kind === 'topic' && selected.id === t.topic.id ? 'selected' : ''}>
                <td>
                  <button className="link-button" onClick={() => setSelected({ kind: 'topic', id: t.topic.id })}>
                    {t.topic.label}
                  </button>
                </td>
                <td>
                  {t.contact ? (
                    <>
                      <strong>{t.contact.person.name}</strong>{' '}
                      <span className={`verdict verdict-${t.contact.verdict}`}>{VERDICT_LABEL[t.contact.verdict]}</span>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td>{t.contact ? countsText(web.people.find((p) => p.person.name === t.contact!.person.name)?.byTopic[t.topic.id] ?? {}) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

function layout(web: ReturnType<typeof departmentWeb>) {
  const n = web.people.length
  const people = web.people.map((p, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2
    return { ...p, angle, x: CX + Math.cos(angle) * PEOPLE_R, y: CY + Math.sin(angle) * PEOPLE_R }
  })
  // A topic sits near the people who work on it (weighted mean direction), spread evenly to avoid overlap.
  const wanted = web.topics.map((t) => {
    let sx = 0
    let sy = 0
    for (const p of people) {
      const w = Object.values(p.byTopic[t.topic.id] ?? {}).reduce((a, b) => a + (b ?? 0), 0)
      sx += Math.cos(p.angle) * w
      sy += Math.sin(p.angle) * w
    }
    return { t, angle: Math.atan2(sy, sx) }
  })
  wanted.sort((a, b) => a.angle - b.angle)
  const start = wanted[0]?.angle ?? 0
  const topics = wanted.map(({ t }, i) => {
    const angle = start + (i / wanted.length) * Math.PI * 2
    return { ...t, angle, x: CX + Math.cos(angle) * TOPIC_R, y: CY + Math.sin(angle) * TOPIC_R }
  })
  return { people, topics }
}

function Web({ web, selected, onSelect }: { web: ReturnType<typeof departmentWeb>; selected: Selection; onSelect: (s: Selection) => void }) {
  const { people, topics } = layout(web)
  const maxPerson = Math.max(...people.map((p) => p.total), 1)
  const maxTopic = Math.max(...topics.map((t) => t.total), 1)
  const active = (person: string, topic: string) =>
    !selected || (selected.kind === 'person' ? selected.id === person : selected.id === topic)

  return (
    <svg className="department-web" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Wie in ${web.team} met welke onderwerpen bezig is`}>
      {people.flatMap((p) =>
        topics
          .filter((t) => p.byTopic[t.topic.id])
          .map((t) => {
            const count = Object.values(p.byTopic[t.topic.id]).reduce((a, b) => a + (b ?? 0), 0)
            return (
              <line
                key={`${p.person.name}|${t.topic.id}`}
                x1={p.x}
                y1={p.y}
                x2={t.x}
                y2={t.y}
                className={active(p.person.name, t.topic.id) ? 'web-edge' : 'web-edge dim'}
                strokeWidth={1 + count * 1.2}
              >
                <title>{`${p.person.name} · ${t.topic.label}: ${countsText(p.byTopic[t.topic.id])}`}</title>
              </line>
            )
          }),
      )}
      {people.map((p) => (
        <line key={`c-${p.person.name}`} x1={CX} y1={CY} x2={p.x} y2={p.y} className="web-spoke" />
      ))}
      <circle cx={CX} cy={CY} r={46} className="web-team" />
      <text x={CX} y={CY + 4} textAnchor="middle" className="web-team-label">
        {web.team}
      </text>

      {topics.map((t) => {
        const r = 7 + 11 * Math.sqrt(t.total / maxTopic)
        const right = Math.cos(t.angle) >= 0
        const isSel = selected?.kind === 'topic' && selected.id === t.topic.id
        return (
          <g key={t.topic.id} className={isSel ? 'web-topic selected' : 'web-topic'} onClick={() => onSelect(isSel ? null : { kind: 'topic', id: t.topic.id })}>
            <title>{`${t.topic.label}: ${t.total} signalen in ${web.team}`}</title>
            <circle cx={t.x} cy={t.y} r={r} />
            <text x={t.x + (right ? r + 6 : -r - 6)} y={t.y + 4} textAnchor={right ? 'start' : 'end'}>
              {t.topic.label}
            </text>
          </g>
        )
      })}
      {people.map((p) => {
        const r = 14 + 12 * Math.sqrt(p.total / maxPerson)
        const isSel = selected?.kind === 'person' && selected.id === p.person.name
        return (
          <g key={p.person.name} className={isSel ? 'web-person selected' : 'web-person'} onClick={() => onSelect(isSel ? null : { kind: 'person', id: p.person.name })}>
            <title>{`${p.person.name}: ${p.total} signalen`}</title>
            <circle cx={p.x} cy={p.y} r={r} />
            <text x={p.x} y={p.y + 4} textAnchor="middle" className="web-initials">
              {initials(p.person.name)}
            </text>
            <text x={p.x} y={p.y + r + 13} textAnchor="middle" className="web-name">
              {firstName(p.person.name)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function Details({ web, selected }: { web: ReturnType<typeof departmentWeb>; selected: Selection }) {
  if (!selected) {
    return (
      <aside className="department-details">
        <strong>Klik op een persoon of onderwerp</strong>
        <p className="askme-hint">Dikkere lijn = meer meetings, documenten, Teams-berichten of tickets over dat onderwerp.</p>
      </aside>
    )
  }
  if (selected.kind === 'person') {
    const p = web.people.find((x) => x.person.name === selected.id)
    return p ? <PersonDetails p={p} web={web} /> : null
  }
  const t = web.topics.find((x) => x.topic.id === selected.id)
  return t ? <TopicDetails t={t} web={web} /> : null
}

function PersonDetails({ p, web }: { p: DepartmentPerson; web: ReturnType<typeof departmentWeb> }) {
  return (
    <aside className="department-details">
      <strong>{p.person.name}</strong>
      <small>{p.person.role}</small>
      <ul className="why-list">
        {web.topics
          .filter((t) => p.byTopic[t.topic.id])
          .map((t) => (
            <li key={t.topic.id}>
              <span className="source-tag">{t.topic.label}</span>
              {countsText(p.byTopic[t.topic.id])}
              {t.contact?.person.name === p.person.name && <span className="verified"> · aanbevolen contact</span>}
            </li>
          ))}
      </ul>
    </aside>
  )
}

function TopicDetails({ t, web }: { t: DepartmentTopic; web: ReturnType<typeof departmentWeb> }) {
  const involved = web.people.filter((p) => p.byTopic[t.topic.id])
  return (
    <aside className="department-details">
      <strong>{t.topic.label}</strong>
      {t.contact && (
        <p className="department-contact">
          Vraag het aan <strong>{t.contact.person.name}</strong>
          <br />
          <span className={`verdict verdict-${t.contact.verdict}`}>{VERDICT_LABEL[t.contact.verdict]}</span>
        </p>
      )}
      <ul className="why-list">
        {involved.map((p) => (
          <li key={p.person.name}>
            <span className="source-tag">{firstName(p.person.name)}</span>
            {countsText(p.byTopic[t.topic.id])}
          </li>
        ))}
      </ul>
    </aside>
  )
}
