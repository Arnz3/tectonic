import { useState } from 'react'
import { canSee, firstName, when, type Role, type Signal, type SignalData, type Viewer } from '../../people/model'
import { verify } from '../../people/store'

const ROLE_TEXT: Partial<Record<Role, string>> = {
  explained: 'gaf uitleg over',
  decided: 'nam een beslissing over',
}

interface Meeting {
  key: string
  title: string
  daysAgo: number
  organizer: string
  signals: Signal[]
}

function meetingsOf(data: SignalData, viewer: Viewer): Meeting[] {
  const byKey = new Map<string, Meeting>()
  for (const s of data.signals) {
    if (s.type !== 'meeting' || !s.organizer || !canSee(s, viewer)) continue
    const key = s.id.split(':')[0]
    const m = byKey.get(key) ?? { key, title: s.title, daysAgo: s.daysAgo, organizer: s.organizer, signals: [] }
    m.signals.push(s)
    byKey.set(key, m)
  }
  return [...byKey.values()].sort((a, b) => a.daysAgo - b.daysAgo)
}

/**
 * Mock of the Teams card the organiser gets after a meeting (design doc, M4): the topics and
 * decisions we picked up, confirmed or rejected with one click. The only moment we ask a human.
 */
export function VerificationCard(props: { data: SignalData; viewer: Viewer; preferTopic: string | null; onClose: () => void }) {
  const { data, viewer, preferTopic, onClose } = props
  // Only meetings the current viewer may see; the card never reveals restricted content.
  const meetings = meetingsOf(data, viewer)
  const initial = meetings.find((m) => m.signals.some((s) => s.topic === preferTopic)) ?? meetings[0]
  const [key, setKey] = useState(initial?.key ?? '')
  const [answers, setAnswers] = useState<Record<string, boolean>>({})
  const [sent, setSent] = useState(false)
  const meeting = meetings.find((m) => m.key === key)
  const label = new Map(data.topics.map((t) => [t.id, t.label]))

  function send() {
    if (!meeting) return
    const ids = meeting.signals.map((s) => s.id)
    verify(
      ids.filter((id) => answers[id] !== false),
      ids.filter((id) => answers[id] === false),
    )
    setSent(true)
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Verificatie na meeting">
      <div className="modal teams-card">
        <div className="preview-header">
          <h2>Teams · bericht van Tectonic</h2>
          <button className="close" onClick={onClose} aria-label="Sluiten">
            ✕
          </button>
        </div>
        <label className="meeting-pick">
          Meeting (demo)
          <select
            value={key}
            onChange={(e) => {
              setKey(e.target.value)
              setAnswers({})
              setSent(false)
            }}
          >
            {meetings.map((m) => (
              <option key={m.key} value={m.key}>
                {m.title} · {when(m.daysAgo)}
              </option>
            ))}
          </select>
        </label>

        {meeting && (
          <div className="card-body">
            <p>
              Hoi {firstName(meeting.organizer)}, in je meeting <strong>{meeting.title}</strong> ({when(meeting.daysAgo)}) pikten we dit op.
              Klopt het?
            </p>
            <ul className="card-items">
              {meeting.signals.map((s) => {
                const knowers = s.people.filter((p) => ROLE_TEXT[p.role])
                const answer = answers[s.id]
                return (
                  <li key={s.id}>
                    <div className="card-topic">{label.get(s.topic)}</div>
                    {knowers.map((p) => (
                      <div key={p.name} className="card-line">
                        {firstName(p.name)} {ROLE_TEXT[p.role]} {label.get(s.topic)?.toLowerCase()}
                        {p.quote && <blockquote>“{p.quote}”</blockquote>}
                      </div>
                    ))}
                    <div className="card-buttons">
                      <button className={answer !== false ? 'active' : ''} onClick={() => setAnswers((a) => ({ ...a, [s.id]: true }))} disabled={sent}>
                        ✓ Klopt
                      </button>
                      <button className={answer === false ? 'active wrong' : ''} onClick={() => setAnswers((a) => ({ ...a, [s.id]: false }))} disabled={sent}>
                        ✗ Klopt niet
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
            {sent ? (
              <p className="interview-done">Bedankt. Bevestigde signalen krijgen een vinkje; afgewezen signalen tellen niet meer mee.</p>
            ) : (
              <div className="modal-actions">
                <span className="spacer" />
                <button className="primary" onClick={send}>
                  Versturen
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
