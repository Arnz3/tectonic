import { useState } from 'react'
import {
  busFactorPerson,
  canSee,
  expertsFor,
  firstName,
  involvementText,
  SOURCE_LABEL,
  sentence,
  VERDICT_LABEL,
  VIEWERS,
  when,
  type Evidence,
  type Expert,
  type Topic,
  type Viewer,
} from '../../people/model'
import { expertContext, resetDemo, usePeopleData } from '../../people/store'
import { InterviewModal } from './InterviewModal'
import { VerificationCard } from './VerificationCard'

const VIEWER_KEY = 'tectonic.viewer'

export function loadViewer(): Viewer {
  try {
    return VIEWERS.find((v) => v.id === localStorage.getItem(VIEWER_KEY)) ?? VIEWERS[0]
  } catch {
    return VIEWERS[0]
  }
}

export function saveViewer(viewer: Viewer) {
  try {
    localStorage.setItem(VIEWER_KEY, viewer.id)
  } catch {
    /* storage unavailable */
  }
}

const initials = (name: string) =>
  name
    .split(' ')
    .filter((w) => w[0] === w[0]?.toUpperCase())
    .map((w) => w[0])
    .slice(0, 2)
    .join('')

/** Ranked people for a topic, with the trust context from the document analysis. */
function useExperts(topicId: string) {
  const { data, confirmed, rejected } = usePeopleData()
  return {
    data,
    confirmed,
    experts: expertsFor(topicId, data, rejected, expertContext(topicId, confirmed)),
    bus: busFactorPerson(topicId, data, rejected),
  }
}

/** "Bekijk als" and the verification card mock, shown in the Graffify bar. */
export function PeopleControls({ viewer, onViewer, topicId }: { viewer: Viewer; onViewer: (v: Viewer) => void; topicId: string | null }) {
  const { data } = usePeopleData()
  const [verifying, setVerifying] = useState(false)
  return (
    <>
      <button className="people-tool" onClick={() => setVerifying(true)} title="Mock van de Teams-kaart die de organisator na een meeting krijgt">
        ✓ Verificatie na meeting
      </button>
      <label className="viewer-switch">
        Bekijk als
        <select
          value={viewer.id}
          onChange={(e) => {
            const next = VIEWERS.find((v) => v.id === e.target.value) ?? VIEWERS[0]
            saveViewer(next)
            onViewer(next)
          }}
        >
          {VIEWERS.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
      </label>
      {verifying && <VerificationCard data={data} viewer={viewer} preferTopic={topicId} onClose={() => setVerifying(false)} />}
    </>
  )
}

/** Overview: per topic the best person to ask and one sentence why. */
export function WhoKnowsGrid({ viewer, onOpenTopic }: { viewer: Viewer; onOpenTopic: (id: string) => void }) {
  const { data } = usePeopleData()
  return (
    <section className="people">
      <h3 className="people-heading">Wie weet wat?</h3>
      <div className="people-grid">
        {data.topics.map((t) => (
          <TopicCard key={t.id} topic={t} viewer={viewer} onOpen={() => onOpenTopic(t.id)} />
        ))}
      </div>
      <Footer />
    </section>
  )
}

function TopicCard({ topic, viewer, onOpen }: { topic: Topic; viewer: Viewer; onOpen: () => void }) {
  const { experts, bus } = useExperts(topic.id)
  const [best] = experts
  if (!best) return null
  return (
    <button className="topic-card" onClick={onOpen}>
      <span className="topic-card-label">{topic.label}</span>
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
}

function Footer() {
  return (
    <div className="people-foot">
      Op basis van werksignalen (metadata), niet van prestaties. Fictieve demodata.{' '}
      <button className="link-button" onClick={resetDemo}>
        Demo resetten
      </button>
    </div>
  )
}

/** "Wie weet het?" for one topic: bus factor, the graph and the contact cards. */
export function WhoKnowsTopic({ topic, viewer }: { topic: Topic; viewer: Viewer }) {
  const { experts, bus, confirmed } = useExperts(topic.id)
  const [notice, setNotice] = useState<string | null>(null)
  const [interview, setInterview] = useState<string | null>(null)
  if (experts.length === 0) return <div className="graph-empty">Nog niemand heeft hier aantoonbaar kennis over.</div>
  const [best, ...rest] = experts

  return (
    <section className="people">
      <h3 className="people-heading">Wie weet het?</h3>
      {bus && (
        <div className="bus-banner" role="status">
          <span>
            ⚠ <strong>Enkel {firstName(bus.name)} kent dit echt.</strong> Geen recent document of interview legt deze kennis vast.
          </span>
          <button onClick={() => setInterview(bus.name)}>🎙 Start kennisinterview (5 min)</button>
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
      <Footer />
      {interview && <InterviewModal person={interview} topic={topic} onClose={() => setInterview(null)} />}
    </section>
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

      <dl className="expert-facts">
        <dt>Waarom</dt>
        <dd>{involvementText(expert.involvement)}</dd>
        <dt>Wie</dt>
        <dd>
          <span className={`verdict verdict-${expert.verdict}`}>{VERDICT_LABEL[expert.verdict]}</span>
          {expert.verdictReasons.length > 0 && <small> · {expert.verdictReasons.join(' · ')}</small>}
        </dd>
      </dl>

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

/**
 * Topic in the middle. Size = why (how long and how much someone worked on it),
 * distance and colour = who (chance of the right answer). Positions are deterministic.
 */
function TopicGraph({ topic, experts }: { topic: Topic; experts: Expert[] }) {
  const W = 460
  const H = 460
  const cx = W / 2
  const cy = 225
  const lines = topic.label.split(' & ')
  const maxScore = experts[0]?.score ?? 1
  const maxSignals = Math.max(...experts.map((e) => e.involvement.signals), 1)
  return (
    <figure className="people-graph-wrap">
      <svg className="people-graph" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Wie weet het over ${topic.label}`}>
        <circle cx={cx} cy={cy} r={115} className="graph-ring" />
        <circle cx={cx} cy={cy} r={185} className="graph-ring" />
        {experts.map((e, i) => {
          const share = e.score / maxScore
          const angle = (i / experts.length) * Math.PI * 2 - Math.PI / 2 + (i % 2 ? 0.25 : 0)
          const dist = 105 + (1 - share) * 80
          const r = 8 + 20 * Math.sqrt(e.involvement.signals / maxSignals)
          const x = cx + Math.cos(angle) * dist
          const y = cy + Math.sin(angle) * dist
          return (
            <g key={e.person.name} className={`graph-person verdict-${e.verdict}${i === 0 ? ' best' : ''}`}>
              <title>{`${e.person.name}: ${VERDICT_LABEL[e.verdict]}. ${involvementText(e.involvement)}`}</title>
              <line x1={cx} y1={cy} x2={x} y2={y} />
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
      <figcaption className="graph-legend">
        <span>
          <b>Grootte</b> = hoe lang en hoeveel iemand ermee bezig is
        </span>
        <span>
          <b>Dichterbij</b> = meer kans op het juiste antwoord
        </span>
        <span>
          <i className="dot verdict-likely" /> {VERDICT_LABEL.likely}
        </span>
        <span>
          <i className="dot verdict-outdated" /> {VERDICT_LABEL.outdated}
        </span>
        <span>
          <i className="dot verdict-few" /> {VERDICT_LABEL.few}
        </span>
      </figcaption>
    </figure>
  )
}
