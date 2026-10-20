import { useEffect, useMemo, useState } from 'react'
import {
  busFactorPerson,
  canSee,
  expertsFor,
  firstName,
  SOURCE_LABEL,
  sentence,
  topicForQuery,
  VIEWERS,
  when,
  type Evidence,
  type Expert,
  type Topic,
  type Viewer,
} from '../people/model'
import { resetDemo, usePeopleData } from '../people/store'
import type { ViewProps } from '../types'
import { InterviewModal } from './people/InterviewModal'
import { VerificationCard } from './people/VerificationCard'

const VIEWER_KEY = 'tectonic.viewer'

function loadViewer(): Viewer {
  try {
    return VIEWERS.find((v) => v.id === localStorage.getItem(VIEWER_KEY)) ?? VIEWERS[0]
  } catch {
    return VIEWERS[0]
  }
}

const initials = (name: string) =>
  name
    .split(' ')
    .filter((w) => w[0] === w[0]?.toUpperCase())
    .map((w) => w[0])
    .slice(0, 2)
    .join('')

/**
 * "Wie weet het?": the right person to ask about a topic, with one sentence why.
 * Expertise comes from work signals; details the viewer may not see are replaced by a lock.
 */
export function PeopleView({ query }: ViewProps) {
  const { data, confirmed, rejected } = usePeopleData()
  const [viewer, setViewer] = useState(loadViewer)
  const [picked, setPicked] = useState<string | null>(null)
  const [interview, setInterview] = useState<{ person: string; topic: Topic } | null>(null)
  const [verifying, setVerifying] = useState(false)

  const asked = useMemo(() => topicForQuery(query, data.topics), [query, data.topics])
  useEffect(() => setPicked(null), [query])
  const topic = asked ?? data.topics.find((t) => t.id === picked) ?? null

  function changeViewer(id: string) {
    const next = VIEWERS.find((v) => v.id === id) ?? VIEWERS[0]
    setViewer(next)
    try {
      localStorage.setItem(VIEWER_KEY, next.id)
    } catch {
      /* storage unavailable */
    }
  }

  return (
    <div className="people">
      <div className="people-bar">
        <div className="people-title">
          {topic ? (
            <>
              {!asked && (
                <>
                  <button className="askme-back" onClick={() => setPicked(null)}>
                    Alle onderwerpen
                  </button>
                  <span className="askme-sep">›</span>
                </>
              )}
              <strong>Wie weet het over {topic.label.toLowerCase()}?</strong>
            </>
          ) : (
            <span className="askme-hint">
              {query
                ? 'Geen onderwerp herkend in je vraag. Kies hieronder een onderwerp.'
                : 'Per onderwerp de persoon die het best weet, op basis van meetings, Teams, tickets en documenten. Stel een vraag in de zoekbalk, bv. "wie kent de tankkaart?"'}
            </span>
          )}
        </div>
        <button className="people-tool" onClick={() => setVerifying(true)} title="Mock van de Teams-kaart die de organisator na een meeting krijgt">
          ✓ Verificatie na meeting
        </button>
        <label className="viewer-switch">
          Bekijk als
          <select value={viewer.id} onChange={(e) => changeViewer(e.target.value)}>
            {VIEWERS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {topic ? (
        <TopicDetail
          key={topic.id}
          topic={topic}
          experts={expertsFor(topic.id, data, rejected)}
          busPerson={busFactorPerson(topic.id, data, rejected)?.name ?? null}
          viewer={viewer}
          confirmed={confirmed}
          onInterview={(person) => setInterview({ person, topic })}
        />
      ) : (
        <div className="people-grid">
          {data.topics.map((t) => {
            const [best] = expertsFor(t.id, data, rejected)
            if (!best) return null
            const bus = busFactorPerson(t.id, data, rejected)
            return (
              <button key={t.id} className="topic-card" onClick={() => setPicked(t.id)}>
                <span className="topic-card-label">{t.label}</span>
                <span className="topic-card-person">
                  <span className="avatar-lg" aria-hidden>
                    {initials(best.person.name)}
                  </span>
                  <span>
                    <strong>{best.person.name}</strong>
                    <small>{best.person.role}</small>
                  </span>
                </span>
                <span className="topic-card-why">{sentence(best.person.name, best.headline, canSee(best.headline.signal, viewer))}</span>
                {bus && <span className="bus-badge">Enkel {firstName(bus.name)} kent dit echt</span>}
              </button>
            )
          })}
        </div>
      )}

      <div className="people-foot">
        Op basis van werksignalen, niet van prestaties. Fictieve demodata.{' '}
        <button className="link-button" onClick={resetDemo}>
          Demo resetten
        </button>
      </div>

      {interview && <InterviewModal person={interview.person} topic={interview.topic} onClose={() => setInterview(null)} />}
      {verifying && <VerificationCard data={data} viewer={viewer} preferTopic={topic?.id ?? null} onClose={() => setVerifying(false)} />}
    </div>
  )
}

function TopicDetail(props: {
  topic: Topic
  experts: Expert[]
  busPerson: string | null
  viewer: Viewer
  confirmed: Set<string>
  onInterview: (person: string) => void
}) {
  const { topic, experts, busPerson, viewer, confirmed, onInterview } = props
  const [notice, setNotice] = useState<string | null>(null)
  if (experts.length === 0) return <div className="graph-empty">Nog niemand heeft hier aantoonbaar kennis over.</div>
  const [best, ...rest] = experts

  return (
    <>
      {busPerson && (
        <div className="bus-banner" role="status">
          <span>
            ⚠ <strong>Enkel {firstName(busPerson)} kent dit echt.</strong> Geen recent document of interview legt deze kennis vast.
          </span>
          <button onClick={() => onInterview(busPerson)}>🎙 Start kennisinterview (5 min)</button>
        </div>
      )}
      {notice && (
        <div className="people-notice" role="status">
          {notice}
        </div>
      )}
      <div className="people-detail">
        <TopicGraph topic={topic} experts={experts.slice(0, 7)} />
        <div className="people-cards">
          <h3 className="people-heading">Beste aanspreekpunt</h3>
          <ExpertCard expert={best} viewer={viewer} confirmed={confirmed} big onNotice={setNotice} />
          {rest.length > 0 && <h3 className="people-heading">Ook goed om te vragen</h3>}
          {rest.slice(0, 2).map((e) => (
            <ExpertCard key={e.person.name} expert={e} viewer={viewer} confirmed={confirmed} onNotice={setNotice} />
          ))}
        </div>
      </div>
    </>
  )
}

function ExpertCard(props: { expert: Expert; viewer: Viewer; confirmed: Set<string>; big?: boolean; onNotice: (text: string) => void }) {
  const { expert, viewer, confirmed, big, onNotice } = props
  const name = expert.person.name
  const first = firstName(name)
  const headlineVisible = canSee(expert.headline.signal, viewer)

  return (
    <article className={big ? 'expert-card best' : 'expert-card'}>
      <header>
        <span className="avatar-lg" aria-hidden>
          {initials(name)}
        </span>
        <span className="expert-name">
          <strong>{name}</strong>
          <small>
            {expert.person.role} · {expert.person.team}
          </small>
        </span>
        <span className="expert-actions">
          <button onClick={() => onNotice(`Demo: Teams-chat met ${name} wordt geopend.`)}>💬 Chat</button>
          {big && <button onClick={() => onNotice(`Demo: Teams-oproep naar ${name}.`)}>📞 Bellen</button>}
        </span>
      </header>

      <p className="expert-why">{sentence(name, expert.headline, headlineVisible)}</p>
      <EvidenceDetail evidence={expert.headline} visible={headlineVisible} confirmed={confirmed} />
      {!headlineVisible && <LockedActions first={first} onNotice={onNotice} />}
      {expert.warning && <div className="who-warning">⚠ {expert.warning}</div>}

      {big && expert.more.length > 0 && (
        <ul className="expert-more">
          {expert.more.map((e) => {
            const visible = canSee(e.signal, viewer)
            return (
              <li key={e.signal.id}>
                <span className="source-tag">{visible ? SOURCE_LABEL[e.signal.type] : '🔒 Afgeschermd'}</span>
                {sentence(name, e, visible)}
                {visible && e.signal.type !== 'document' && <small className="source-title"> · {e.signal.title}</small>}
                {!visible && <LockedActions first={first} onNotice={onNotice} />}
              </li>
            )
          })}
        </ul>
      )}
    </article>
  )
}

function EvidenceDetail({ evidence, visible, confirmed }: { evidence: Evidence; visible: boolean; confirmed: Set<string> }) {
  if (!visible) return null
  const { signal, quote } = evidence
  return (
    <div className="evidence">
      <div className="evidence-source">
        {SOURCE_LABEL[signal.type]} · {signal.title} · {when(signal.daysAgo)}
        {confirmed.has(signal.id) && <span className="verified"> ✓ Bevestigd door organisator</span>}
      </div>
      {quote && <blockquote>“{quote}”</blockquote>}
    </div>
  )
}

function LockedActions({ first, onNotice }: { first: string; onNotice: (text: string) => void }) {
  return (
    <span className="locked-actions">
      <button onClick={() => onNotice(`Demo: chat met ${first} geopend. Je hoeft de bron niet te kunnen lezen om te weten wie je moet vragen.`)}>
        Vraag {first}
      </button>
      <button onClick={() => onNotice('Demo: toegangsaanvraag verstuurd naar de eigenaar van de bron.')}>Vraag toegang</button>
    </span>
  )
}

/** Topic in the middle; closer and bigger = knows more. Positions are deterministic. */
function TopicGraph({ topic, experts }: { topic: Topic; experts: Expert[] }) {
  const W = 460
  const H = 400
  const lines = topic.label.split(' & ')
  const cx = W / 2
  const cy = H / 2
  const max = experts[0]?.score ?? 1
  return (
    <svg className="people-graph" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Wie weet het over ${topic.label}`}>
      {experts.map((e, i) => {
        const share = e.score / max
        const angle = (i / experts.length) * Math.PI * 2 - Math.PI / 2 + (i % 2 ? 0.25 : 0)
        const dist = 110 + (1 - share) * 60
        const r = 12 + 18 * Math.sqrt(share)
        const x = cx + Math.cos(angle) * dist
        const y = cy + Math.sin(angle) * dist
        return (
          <g key={e.person.name} className={i === 0 ? 'graph-person best' : 'graph-person'}>
            <title>{`${e.person.name}: score ${e.score.toFixed(1)}`}</title>
            <line x1={cx} y1={cy} x2={x} y2={y} strokeWidth={1 + 4 * share} />
            <circle cx={x} cy={y} r={r} />
            <text x={x} y={y + 4} textAnchor="middle" className="graph-initials">
              {initials(e.person.name)}
            </text>
            <text x={x} y={y + r + 14} textAnchor="middle" className="graph-name">
              {firstName(e.person.name)}
            </text>
          </g>
        )
      })}
      <circle cx={cx} cy={cy} r={50} className="graph-topic" />
      {lines.map((line, i) => (
        <text key={line} x={cx} y={cy + 4 + (i - (lines.length - 1) / 2) * 14} textAnchor="middle" className="graph-topic-label">
          {lines.length > 1 && i === 0 ? `${line} &` : line}
        </text>
      ))}
    </svg>
  )
}
