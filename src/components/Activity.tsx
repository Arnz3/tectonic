import { canSee, SOURCE_LABEL, when, type Role, type Signal, type SignalType, type Viewer } from '../people/model'

const ROLE_TEXT: Record<Role, string> = {
  explained: 'gaf uitleg',
  decided: 'nam een beslissing',
  asked: 'stelde een vraag',
  attended: 'was aanwezig',
  answered: 'beantwoordde een vraag',
  resolved: 'loste het op',
  owner: 'eigenaar',
  contributed: 'werkte mee',
}

const LOCKED_TEXT: Record<SignalType, string> = {
  meeting: 'Afgeschermde meeting',
  teams: 'Afgeschermd kanaal',
  ticket: 'Afgeschermd ticket',
  document: 'Afgeschermd document',
  interview: 'Afgeschermd interview',
}

/** One thing a person did on a topic: "Meeting · Fleet-overleg · gaf uitleg · 4 dagen geleden". Hidden sources stay locked. */
export function ActivityItem({ signal, name, viewer }: { signal: Signal; name: string; viewer: Viewer }) {
  const visible = canSee(signal, viewer)
  const role = signal.people.find((p) => p.name === name)?.role ?? 'attended'
  return (
    <li>
      <span className="source-tag">{visible ? SOURCE_LABEL[signal.type] : '🔒'}</span>
      {visible ? signal.title : LOCKED_TEXT[signal.type]} · {ROLE_TEXT[role]} · {when(signal.daysAgo)}
    </li>
  )
}
