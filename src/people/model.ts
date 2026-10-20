/**
 * "Wie weet het?": who knows what, derived from work signals (meetings, Teams, tickets, documents).
 *
 * Pure functions only, so they can be tested with `node --test` without a bundler.
 */

export type SignalType = 'meeting' | 'teams' | 'ticket' | 'document' | 'interview'
export type Role = 'explained' | 'decided' | 'answered' | 'resolved' | 'owner' | 'contributed' | 'attended' | 'asked'
export type Visibility = 'open' | 'beperkt' | 'vertrouwelijk'

export interface Person {
  name: string
  role: string
  team: string
  status: 'actief' | 'nieuwe_rol'
  previous_role?: string
  /** Topics of the previous role; signals on these count for less. */
  former_topics?: string[]
}

export interface Topic {
  id: string
  label: string
  synonyms: string[]
}

export interface SignalPerson {
  name: string
  role: Role
  /** Literal quote from the source, empty when there is none. */
  quote: string
}

export interface Signal {
  id: string
  type: SignalType
  topic: string
  daysAgo: number
  title: string
  people: SignalPerson[]
  visibility: Visibility
  /** Teams with access when `visibility` is 'beperkt'. */
  allowed: string[]
  /** Meetings only: who gets the verification card. */
  organizer?: string
}

export interface SignalData {
  people: Person[]
  topics: Topic[]
  signals: Signal[]
}

// --- Validation ----------------------------------------------------------------------

const ROLES_BY_TYPE: Record<SignalType, Role[]> = {
  meeting: ['explained', 'decided', 'asked', 'attended'],
  teams: ['answered'],
  ticket: ['resolved'],
  document: ['owner', 'contributed'],
  interview: ['explained'],
}
const VISIBILITIES: Visibility[] = ['open', 'beperkt', 'vertrouwelijk']
const MAX_TEXT = 500

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isText = (v: unknown, max = MAX_TEXT): v is string => typeof v === 'string' && v.length <= max
const isTextList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => isText(x, 100))

function parsePerson(v: unknown): Person | null {
  if (!isObject(v) || !isText(v.name, 100) || !v.name || !isText(v.role) || !isText(v.team, 100)) return null
  if (v.status !== 'actief' && v.status !== 'nieuwe_rol') return null
  if (v.previous_role !== undefined && !isText(v.previous_role)) return null
  if (v.former_topics !== undefined && !isTextList(v.former_topics)) return null
  return {
    name: v.name,
    role: v.role,
    team: v.team,
    status: v.status,
    previous_role: v.previous_role as string | undefined,
    former_topics: v.former_topics as string[] | undefined,
  }
}

function parseTopic(v: unknown): Topic | null {
  if (!isObject(v) || !isText(v.id, 100) || !v.id || !isText(v.label, 100) || !isTextList(v.synonyms)) return null
  return { id: v.id, label: v.label, synonyms: v.synonyms }
}

/**
 * Checks one signal against the known people and topics. Confidential signals are rejected
 * here, so nothing downstream can show them, not even as a topic or in a score.
 */
export function parseSignal(v: unknown, peopleNames: Set<string>, topicIds: Set<string>): Signal | null {
  if (!isObject(v) || !isText(v.id, 100) || !v.id || !isText(v.title) || !isText(v.topic, 100)) return null
  const type = v.type as SignalType
  if (!(type in ROLES_BY_TYPE) || !topicIds.has(v.topic)) return null
  if (typeof v.daysAgo !== 'number' || !Number.isInteger(v.daysAgo) || v.daysAgo < 0 || v.daysAgo > 36500) return null
  if (!VISIBILITIES.includes(v.visibility as Visibility) || v.visibility === 'vertrouwelijk') return null
  if (!isTextList(v.allowed)) return null
  if (v.organizer !== undefined && !(isText(v.organizer, 100) && peopleNames.has(v.organizer))) return null
  if (!Array.isArray(v.people) || v.people.length === 0) return null
  const people: SignalPerson[] = []
  for (const p of v.people) {
    if (!isObject(p) || !isText(p.name, 100) || !peopleNames.has(p.name) || !isText(p.quote)) return null
    if (!ROLES_BY_TYPE[type].includes(p.role as Role)) return null
    people.push({ name: p.name, role: p.role as Role, quote: p.quote })
  }
  return {
    id: v.id,
    type,
    topic: v.topic,
    daysAgo: v.daysAgo,
    title: v.title,
    people,
    visibility: v.visibility as Visibility,
    allowed: v.allowed,
    organizer: v.organizer as string | undefined,
  }
}

/** Everything from JSON or localStorage is untrusted: keep only well-formed entries. */
export function parseSignalData(raw: unknown): SignalData {
  const data = isObject(raw) ? raw : {}
  const people = (Array.isArray(data.people) ? data.people : []).map(parsePerson).filter((p): p is Person => p !== null)
  const topics = (Array.isArray(data.topics) ? data.topics : []).map(parseTopic).filter((t): t is Topic => t !== null)
  const names = new Set(people.map((p) => p.name))
  const topicIds = new Set(topics.map((t) => t.id))
  const signals = (Array.isArray(data.signals) ? data.signals : [])
    .map((s) => parseSignal(s, names, topicIds))
    .filter((s): s is Signal => s !== null)
  return { people, topics, signals }
}

// --- Access ----------------------------------------------------------------------------

export interface Viewer {
  id: string
  label: string
  teams: string[]
}

export const VIEWERS: Viewer[] = [
  { id: 'consultant', label: 'Payrollconsultant BE', teams: ['Payroll BE', 'Reward & Benefits'] },
  { id: 'newcomer', label: 'Nieuwe medewerker', teams: [] },
  { id: 'klantendienst', label: 'Klantadviseur', teams: ['Klantendienst'] },
]

/**
 * The one access check. Open: everyone. Restricted: only viewers in an allowed team.
 * Confidential (or anything unknown): nobody.
 */
export function canSee(signal: Pick<Signal, 'visibility' | 'allowed'>, viewer: Viewer): boolean {
  if (signal.visibility === 'open') return true
  if (signal.visibility === 'beperkt') return signal.allowed.some((team) => viewer.teams.includes(team))
  return false
}

// --- Expertise score --------------------------------------------------------------------

/** Weight per source and role (design doc, "Signalen in plaats van invoer"). */
export const WEIGHTS: Record<SignalType, Partial<Record<Role, number>>> = {
  meeting: { explained: 3, decided: 2.5, attended: 0.4, asked: 0.2 },
  teams: { answered: 2 },
  ticket: { resolved: 2 },
  document: { owner: 1.5, contributed: 1 },
  interview: { explained: 3 },
}
export const HALF_LIFE_DAYS = 30
export const ROLE_CHANGE_FACTOR = 0.4
/** Signals that show real knowledge, not just presence. */
const KNOWLEDGE_ROLES: Role[] = ['explained', 'decided', 'answered', 'resolved']
/** Window for the bus factor: knowledge and documents older than this do not count. */
export const BUS_FACTOR_DAYS = 90
const MIN_SCORE = 0.05

export interface Evidence {
  signal: Signal
  role: Role
  quote: string
  points: number
}

/** Why this person matters: how long and how much they worked on the topic (all signals, unweighted). */
export interface Involvement {
  signals: number
  bySource: Partial<Record<SignalType, number>>
  firstDaysAgo: number
  lastDaysAgo: number
}

/** Who probably has the right answer. */
export type Verdict = 'likely' | 'outdated' | 'few'

export interface ExpertContext {
  /** People whose content changes on this topic were mostly on outdated versions or copies. */
  outdated?: Set<string>
  /** Documents recommended by the trust rules (analysis.json). */
  recommendedDocs?: Set<string>
  /** Signals the meeting organiser confirmed. */
  confirmed?: Set<string>
}

/** Ranking weight for people who mostly worked on outdated versions. */
export const OUTDATED_FACTOR = 0.5

export interface Expert {
  person: Person
  /** Chance of the right answer: recency- and role-weighted, lower for outdated work. Drives rank and distance. */
  score: number
  involvement: Involvement
  verdict: Verdict
  /** Plain-language reasons for the verdict. */
  verdictReasons: string[]
  /** Most recent sign of real knowledge, or the strongest signal when there is none. */
  headline: Evidence
  /** Up to 3 further reasons, strongest first. */
  more: Evidence[]
  warning: string | null
}

export const decay = (daysAgo: number) => 0.5 ** (daysAgo / HALF_LIFE_DAYS)

function changedRole(person: Person, topic: string): boolean {
  return person.status === 'nieuwe_rol' && (person.former_topics ?? []).includes(topic)
}

/** Ranked people for a topic. `excluded` holds signal ids a human marked as wrong. */
export function expertsFor(topic: string, data: SignalData, excluded: Set<string> = new Set(), context: ExpertContext = {}): Expert[] {
  const byName = new Map(data.people.map((p) => [p.name, p]))
  const evidence = new Map<string, Evidence[]>()
  for (const signal of data.signals) {
    if (signal.topic !== topic || excluded.has(signal.id)) continue
    for (const p of signal.people) {
      const person = byName.get(p.name)
      if (!person) continue
      const factor = changedRole(person, topic) ? ROLE_CHANGE_FACTOR : 1
      const points = (WEIGHTS[signal.type][p.role] ?? 0) * decay(signal.daysAgo) * factor
      evidence.set(p.name, [...(evidence.get(p.name) ?? []), { signal, role: p.role, quote: p.quote, points }])
    }
  }

  const experts: Expert[] = []
  for (const [name, list] of evidence) {
    const person = byName.get(name)!
    const outdated = context.outdated?.has(name) ?? false
    const score = list.reduce((sum, e) => sum + e.points, 0) * (outdated ? OUTDATED_FACTOR : 1)
    if (score < MIN_SCORE) continue
    const knowledge = list.filter((e) => KNOWLEDGE_ROLES.includes(e.role) || e.signal.type === 'interview')
    const strongest = [...list].sort((a, b) => b.points - a.points)
    const headline = knowledge.length
      ? [...knowledge].sort((a, b) => a.signal.daysAgo - b.signal.daysAgo || b.points - a.points)[0]
      : strongest[0]
    const bySource: Partial<Record<SignalType, number>> = {}
    for (const e of list) bySource[e.signal.type] = (bySource[e.signal.type] ?? 0) + 1
    const days = list.map((e) => e.signal.daysAgo)
    const recentKnowledge = knowledge.filter((e) => e.signal.daysAgo <= BUS_FACTOR_DAYS)
    const onRecommended = list.some((e) => e.signal.type === 'document' && context.recommendedDocs?.has(e.signal.id))
    const isConfirmed = list.some((e) => context.confirmed?.has(e.signal.id) && KNOWLEDGE_ROLES.includes(e.role))
    let verdict: Verdict
    const verdictReasons: string[] = []
    if (outdated || changedRole(person, topic)) {
      verdict = 'outdated'
      if (outdated) verdictReasons.push('Werkte vooral aan verouderde versies of kopieën')
      if (changedRole(person, topic)) verdictReasons.push(`Andere functie sinds kort (nu: ${person.role})`)
    } else if (recentKnowledge.length > 0 || onRecommended) {
      verdict = 'likely'
      if (recentKnowledge.length > 0) verdictReasons.push(`Recente uitleg of antwoord (${when(Math.min(...recentKnowledge.map((e) => e.signal.daysAgo)))})`)
      if (onRecommended) verdictReasons.push('Werkte aan het aanbevolen document')
    } else {
      verdict = 'few'
      verdictReasons.push('Weinig recente signalen van echte kennis')
    }
    if (isConfirmed) verdictReasons.push('Bevestigd door de organisator')
    experts.push({
      person,
      score,
      involvement: { signals: list.length, bySource, firstDaysAgo: Math.max(...days), lastDaysAgo: Math.min(...days) },
      verdict,
      verdictReasons,
      headline,
      more: strongest.filter((e) => e !== headline).slice(0, 3),
      warning: changedRole(person, topic)
        ? `Heeft sinds kort een andere rol (nu: ${person.role}); telt nog voor ${ROLE_CHANGE_FACTOR * 100}% mee`
        : null,
    })
  }
  return experts.sort((a, b) => b.score - a.score || a.person.name.localeCompare(b.person.name, 'nl'))
}

/**
 * "Enkel Karim kent dit echt": exactly one active person showed real knowledge recently and no
 * recent document or interview captures it.
 */
export function busFactorPerson(topic: string, data: SignalData, excluded: Set<string> = new Set()): Person | null {
  const recent = data.signals.filter((s) => s.topic === topic && s.daysAgo <= BUS_FACTOR_DAYS && !excluded.has(s.id))
  if (recent.some((s) => s.type === 'document' || s.type === 'interview')) return null
  const byName = new Map(data.people.map((p) => [p.name, p]))
  const holders = new Set(
    recent.flatMap((s) =>
      s.people
        .filter((p) => KNOWLEDGE_ROLES.includes(p.role))
        .filter((p) => {
          const person = byName.get(p.name)
          return person !== undefined && !changedRole(person, topic)
        })
        .map((p) => p.name),
    ),
  )
  return holders.size === 1 ? byName.get([...holders][0]) ?? null : null
}

// --- Plain-language sentences -----------------------------------------------------------

export function when(daysAgo: number): string {
  if (daysAgo === 0) return 'vandaag'
  if (daysAgo === 1) return 'gisteren'
  if (daysAgo < 7) return `${daysAgo} dagen geleden`
  if (daysAgo < 14) return 'vorige week'
  if (daysAgo < 28) return `${Math.floor(daysAgo / 7)} weken geleden`
  if (daysAgo < 60) return 'vorige maand'
  if (daysAgo < 365) return `${Math.floor(daysAgo / 30)} maanden geleden`
  const years = Math.floor(daysAgo / 365)
  return years === 1 ? 'meer dan een jaar geleden' : `${years} jaar geleden`
}

const OPEN_SENTENCE: Record<SignalType, Partial<Record<Role, (w: string) => string>>> = {
  meeting: {
    explained: (w) => `had ${w} een meeting hierover en gaf er uitleg`,
    decided: (w) => `nam ${w} een beslissing hierover in een meeting`,
    asked: (w) => `stelde ${w} een vraag hierover in een meeting`,
    attended: (w) => `was ${w} aanwezig in een meeting hierover`,
  },
  teams: { answered: (w) => `beantwoordde ${w} een vraag hierover in Teams` },
  ticket: { resolved: (w) => `loste ${w} een ticket hierover op` },
  document: {
    owner: (w) => `is eigenaar van een document hierover (gewijzigd ${w})`,
    contributed: (w) => `werkte ${w} inhoudelijk mee aan een document hierover`,
  },
  interview: { explained: (w) => `legde ${w} kennis hierover vast in een kennisinterview` },
}

const HIDDEN_SENTENCE: Record<SignalType, Partial<Record<Role, (w: string) => string>>> = {
  meeting: {
    explained: (w) => `gaf ${w} uitleg in een afgeschermde meeting`,
    decided: (w) => `nam ${w} een beslissing in een afgeschermde meeting`,
    asked: (w) => `was ${w} betrokken bij een afgeschermde meeting`,
    attended: (w) => `was ${w} betrokken bij een afgeschermde meeting`,
  },
  teams: { answered: (w) => `beantwoordde ${w} een vraag in een afgeschermd kanaal` },
  ticket: { resolved: (w) => `loste ${w} een afgeschermd ticket op` },
  document: {
    owner: () => 'is eigenaar van een afgeschermd document',
    contributed: (w) => `werkte ${w} mee aan een afgeschermd document`,
  },
  interview: { explained: (w) => `legde ${w} kennis vast in een afgeschermd interview` },
}

export const firstName = (name: string) => name.split(' ')[0]

export const VERDICT_LABEL: Record<Verdict, string> = {
  likely: 'Waarschijnlijk juist antwoord',
  outdated: 'Weet veel, maar mogelijk verouderd',
  few: 'Weinig signalen',
}

function duration(days: number): string {
  if (days < 14) return days === 1 ? '1 dag' : `${days} dagen`
  if (days < 60) return `${Math.floor(days / 7)} weken`
  if (days < 365) return `${Math.floor(days / 30)} maanden`
  const years = Math.floor(days / 365)
  return years === 1 ? 'meer dan een jaar' : `${years} jaar`
}

const SOURCE_COUNT: Record<SignalType, [string, string]> = {
  meeting: ['meeting', 'meetings'],
  teams: ['Teams-antwoord', 'Teams-antwoorden'],
  ticket: ['ticket', 'tickets'],
  document: ['document', 'documenten'],
  interview: ['kennisinterview', 'kennisinterviews'],
}

/** "Al 3 weken mee bezig · 4 signalen: 2 meetings, 1 Teams-antwoord, 1 ticket · laatst 4 dagen geleden". Counts only, no titles. */
export function involvementText(inv: Involvement): string {
  const parts = (Object.keys(SOURCE_COUNT) as SignalType[])
    .filter((t) => inv.bySource[t])
    .map((t) => `${inv.bySource[t]} ${SOURCE_COUNT[t][inv.bySource[t] === 1 ? 0 : 1]}`)
  const since = inv.firstDaysAgo === 0 ? 'Sinds vandaag mee bezig' : `Al ${duration(inv.firstDaysAgo)} mee bezig`
  return `${since} · ${inv.signals} ${inv.signals === 1 ? 'signaal' : 'signalen'}: ${parts.join(', ')} · laatst ${when(inv.lastDaysAgo)}`
}

/** "Karim had 4 dagen geleden een meeting hierover en gaf er uitleg". Hidden sources reveal no title or content. */
export function sentence(name: string, e: Pick<Evidence, 'signal' | 'role'>, visible: boolean): string {
  const table = visible ? OPEN_SENTENCE : HIDDEN_SENTENCE
  const make = table[e.signal.type][e.role] ?? ((w: string) => `was ${w} betrokken`)
  return `${firstName(name)} ${make(when(e.signal.daysAgo))}`
}

export const SOURCE_LABEL: Record<SignalType, string> = {
  meeting: 'Meeting',
  teams: 'Teams',
  ticket: 'Ticket',
  document: 'Document',
  interview: 'Kennisinterview',
}

/** Question in the search box → topic, on whole words of the label, id or synonyms. */
export function topicForQuery(query: string, topics: Topic[]): Topic | null {
  const q = ` ${query.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()} `
  if (q.trim() === '') return null
  let best: { topic: Topic; length: number } | null = null
  for (const t of topics) {
    for (const word of [t.id, t.label, ...t.synonyms]) {
      const w = word.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
      if (w && q.includes(` ${w} `) && (!best || w.length > best.length)) best = { topic: t, length: w.length }
    }
  }
  return best?.topic ?? null
}

// --- Contacts without files -------------------------------------------------------------

/** Question words that say nothing about the subject. */
const QUERY_STOP_WORDS = new Set(
  'wie weet kent iets over welke waar hoeveel bedragen bedraagt moet kan zijn heeft hebben mijn info informatie vraag vragen meer deze die dat voor met naar'.split(' '),
)

export const QUERY_TOPIC_ID = '__query__'

function queryWords(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !QUERY_STOP_WORDS.has(w))
}

/**
 * When no files match, find contacts in meetings and Teams messages whose title or quote
 * mentions the search words. Returns the data re-labelled under one pseudo topic, so the
 * normal expertise score and sentences apply.
 */
export function contactsForQuery(query: string, data: SignalData, excluded: Set<string> = new Set()): Expert[] {
  const words = queryWords(query)
  if (words.length === 0) return []
  const matches = (text: string) => {
    const t = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ')} `
    return words.some((w) => (w.length >= 5 ? t.includes(w) : t.includes(` ${w} `)))
  }
  const signals = data.signals
    .filter((s) => (s.type === 'meeting' || s.type === 'teams') && !excluded.has(s.id))
    .filter((s) => matches(s.title) || s.people.some((p) => matches(p.quote)))
    .map((s) => ({ ...s, topic: QUERY_TOPIC_ID }))
  return expertsFor(QUERY_TOPIC_ID, { ...data, signals })
}

// --- Department web -------------------------------------------------------------------

export interface DepartmentPerson {
  person: Person
  total: number
  /** Per topic: number of signals per source (meetings, documents, Teams, tickets). Counts only. */
  byTopic: Record<string, Partial<Record<SignalType, number>>>
}

export interface DepartmentTopic {
  topic: Topic
  total: number
  /** Recommended contact in this department for the topic. */
  contact: Expert | null
}

export interface DepartmentWeb {
  team: string
  people: DepartmentPerson[]
  topics: DepartmentTopic[]
}

export function departments(data: SignalData): string[] {
  return [...new Set(data.people.map((p) => p.team))].sort((a, b) => a.localeCompare(b, 'nl'))
}

/**
 * Who in a department works on which topics, as counts only: another department sees who to ask
 * without access to the files or meetings themselves. Per topic the best contact in the department.
 */
export function departmentWeb(
  team: string,
  data: SignalData,
  excluded: Set<string> = new Set(),
  contextFor: (topic: string) => ExpertContext = () => ({}),
): DepartmentWeb {
  const members = data.people.filter((p) => p.team === team)
  const names = new Set(members.map((p) => p.name))
  const byName = new Map<string, DepartmentPerson>(members.map((p) => [p.name, { person: p, total: 0, byTopic: {} }]))
  const topicTotals = new Map<string, number>()
  for (const s of data.signals) {
    if (excluded.has(s.id)) continue
    for (const p of s.people) {
      const entry = byName.get(p.name)
      if (!entry) continue
      const counts = (entry.byTopic[s.topic] ??= {})
      counts[s.type] = (counts[s.type] ?? 0) + 1
      entry.total++
      topicTotals.set(s.topic, (topicTotals.get(s.topic) ?? 0) + 1)
    }
  }
  const topics = data.topics
    .filter((t) => topicTotals.has(t.id))
    .map((topic) => {
      const inTeam = expertsFor(topic.id, data, excluded, contextFor(topic.id)).filter((e) => names.has(e.person.name))
      return { topic, total: topicTotals.get(topic.id)!, contact: inTeam.find((e) => e.verdict === 'likely') ?? inTeam[0] ?? null }
    })
    .sort((a, b) => b.total - a.total || a.topic.label.localeCompare(b.topic.label, 'nl'))
  const people = [...byName.values()].filter((p) => p.total > 0).sort((a, b) => b.total - a.total || a.person.name.localeCompare(b.person.name, 'nl'))
  return { team, people, topics }
}

/** "2 meetings, 1 document" — counts per source, no titles. */
export function countsText(counts: Partial<Record<SignalType, number>>): string {
  return (Object.keys(SOURCE_COUNT) as SignalType[])
    .filter((t) => counts[t])
    .map((t) => `${counts[t]} ${SOURCE_COUNT[t][counts[t] === 1 ? 0 : 1]}`)
    .join(', ')
}
