import { useState } from 'react'
import { documents } from '../../library'
import { expertsFor, firstName, when } from '../../people/model'
import { answerCheck, checks, expertContext, usePeopleData, type Check, type MicroAnswer, type MicroReply } from '../../people/store'

const docById = new Map(documents.map((d) => [d.id, d]))

const OUTCOME: Record<Exclude<MicroAnswer, 'weet_niet'>, (who: string, check: Check) => string> = {
  ja: (who, c) => `${who} bevestigde het nieuwe document. De eigenaar van "${docById.get(c.existingDoc)?.title}" krijgt een seintje om te herzien.`,
  nee: (who) => `${who} keurde het nieuwe document af. Het blijft concept en de auteur krijgt een seintje.`,
  beide: (who) => `${who}: allebei juist, voor een andere situatie. Geen conflict meer.`,
}

const REACTION: Record<MicroAnswer, string> = {
  ja: '👍 Ja, het nieuwe klopt',
  nee: '👎 Nee, het oude klopt',
  beide: '💬 Allebei juist (andere situatie)',
  weet_niet: '💬 Weet ik niet, vraag iemand anders',
}

interface CheckState {
  check: Check
  replies: MicroReply[]
  /** Who gets the message now; null when answered or nobody is left. */
  recipient: string | null
  final: MicroReply | null
}

/** The message goes to the person most likely to have the right answer; "weet ik niet" passes it on. */
function useCheckStates(topicId?: string): CheckState[] {
  const { data, confirmed, rejected, replies } = usePeopleData()
  return checks
    .filter((c) => !topicId || c.topic === topicId)
    .map((check) => {
      const list = replies[check.id] ?? []
      const final = list.find((r) => r.answer !== 'weet_niet') ?? null
      const asked = new Set(list.map((r) => r.person))
      const experts = expertsFor(check.topic, data, rejected, expertContext(check.topic, confirmed))
      const candidates = [...experts.filter((e) => e.verdict === 'likely'), ...experts.filter((e) => e.verdict !== 'likely')]
      const recipient = final ? null : (candidates.find((e) => !asked.has(e.person.name))?.person.name ?? null)
      return { check, replies: list, recipient, final }
    })
}

function statusText(s: CheckState): string {
  if (s.final) return OUTCOME[s.final.answer as Exclude<MicroAnswer, 'weet_niet'>](firstName(s.final.person), s.check)
  const passed = s.replies.filter((r) => r.answer === 'weet_niet').map((r) => firstName(r.person))
  const prefix = passed.length ? `${passed.join(', ')} wist het niet. ` : ''
  return s.recipient ? `${prefix}Gevraagd aan ${firstName(s.recipient)} via Teams, wacht op antwoord.` : `${prefix}Niemand kon het bevestigen.`
}

/** In the topic view: a new document contradicts the library, and where the micro action stands. */
export function MicroActionStrip({ topicId }: { topicId: string }) {
  const states = useCheckStates(topicId)
  const [open, setOpen] = useState(false)
  if (states.length === 0) return null
  return (
    <>
      {states.map((s) => (
        <div key={s.check.id} className={s.final ? 'micro-strip done' : 'micro-strip'} role="status">
          <span>
            <strong>Nieuw document spreekt de bibliotheek tegen:</strong> "{docById.get(s.check.newDoc)?.title}" tegenover "
            {docById.get(s.check.existingDoc)?.title}". {statusText(s)}
          </span>
          {!s.final && s.recipient && <button onClick={() => setOpen(true)}>Bekijk Teams-bericht</button>}
        </div>
      ))}
      {open && <MicroActionsModal topicId={topicId} onClose={() => setOpen(false)} />}
    </>
  )
}

/** Bar button: the Teams messages that new, contradicting documents triggered. */
export function MicroActionsButton() {
  const states = useCheckStates()
  const [open, setOpen] = useState(false)
  const pending = states.filter((s) => !s.final && s.recipient).length
  if (states.length === 0) return null
  return (
    <>
      <button className="people-tool" onClick={() => setOpen(true)} title="Korte Teams-berichten bij tegenstrijdige nieuwe documenten">
        🔔 Micro-acties{pending > 0 && <span className="count-badge">{pending}</span>}
      </button>
      {open && <MicroActionsModal onClose={() => setOpen(false)} />}
    </>
  )
}

function MicroActionsModal({ topicId, onClose }: { topicId?: string; onClose: () => void }) {
  const states = useCheckStates(topicId)
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Micro-acties in Teams">
      <div className="modal teams-card">
        <div className="preview-header">
          <h2>Teams · chat met Tectonic</h2>
          <button className="close" onClick={onClose} aria-label="Sluiten">
            ✕
          </button>
        </div>
        {states.map((s) => (
          <MicroMessage key={s.check.id} state={s} />
        ))}
        <p className="modal-note">
          Eén tik, geen formulier. Het antwoord valideert de data en telt als signaal voor wie antwoordde. Wie het niet weet, geeft de vraag
          door.
        </p>
      </div>
    </div>
  )
}

function MicroMessage({ state }: { state: CheckState }) {
  const { check, replies, recipient, final } = state
  const [other, setOther] = useState(false)
  const newDoc = docById.get(check.newDoc)
  const oldDoc = docById.get(check.existingDoc)
  const to = recipient ?? final?.person ?? replies.at(-1)?.person
  if (!newDoc || !oldDoc || !to) return null

  function reply(answer: MicroAnswer) {
    if (!recipient) return
    answerCheck(check.id, recipient, answer)
    setOther(false)
  }

  return (
    <div className="micro-thread">
      <div className="micro-bubble">
        <div className="micro-meta">
          Tectonic → {firstName(to)} · {when(check.daysAgo)}
        </div>
        <p>
          Hoi {firstName(to)}, er kwam een nieuw document binnen over <strong>{check.topic}</strong>: "{newDoc.title}" ({newDoc.folder}). Het
          zegt iets anders dan "{oldDoc.title}".
        </p>
        <div className="micro-compare">
          <div>
            <small>Nieuw</small>
            <blockquote>“{check.statementNew}”</blockquote>
          </div>
          <div>
            <small>Nu in de bibliotheek</small>
            <blockquote>“{check.statementExisting}”</blockquote>
          </div>
        </div>
        <p>
          <strong>Klopt het nieuwe document?</strong>
        </p>
      </div>

      {replies.map((r, i) => (
        <div key={i} className="micro-reply">
          <span className="micro-meta">{r.person}</span> {REACTION[r.answer]}
        </div>
      ))}

      {recipient ? (
        <>
          <div className="micro-reactions" role="group" aria-label={`Antwoord van ${firstName(recipient)}`}>
            <button onClick={() => reply('ja')} title="Ja, het nieuwe document klopt">
              👍 Ja
            </button>
            <button onClick={() => reply('nee')} title="Nee, het oude document klopt">
              👎 Nee
            </button>
            <button className={other ? 'active' : ''} onClick={() => setOther(!other)} title="Iets anders">
              💬 Anders
            </button>
            <span className="micro-hint">antwoord als {firstName(recipient)} (demo)</span>
          </div>
          {other && (
            <div className="micro-reactions">
              <button onClick={() => reply('beide')}>Allebei juist (andere situatie)</button>
              <button onClick={() => reply('weet_niet')}>Weet ik niet, vraag iemand anders</button>
            </div>
          )}
        </>
      ) : (
        <div className="micro-outcome">{statusText(state)}</div>
      )}
    </div>
  )
}
