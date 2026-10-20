import { analysis } from '../../analysis'
import { formatDate } from '../../format'
import type { GmDocument as Document } from './types'

/** How trustworthy a document is within its topic. Drives the card colour on the timeline. */
export type Trust = 'best' | 'meeting' | 'similar' | 'expired' | 'support' | 'other_scope'

export const TRUST: Record<Trust, { color: string; label: string }> = {
  best: { color: '#16a34a', label: 'Betrouwbaar' },
  meeting: { color: '#6d5bd0', label: 'Geverifieerd uit meeting' },
  similar: { color: '#d97706', label: 'Kopieën' },
  expired: { color: '#dc2626', label: 'Verouderd' },
  support: { color: '#94a3b8', label: 'Ondersteunend' },
  other_scope: { color: '#cbd5e1', label: 'Ander land' },
}

export interface Lane {
  id: string
  label: string
  color: string
}

/** Where a document comes from. One horizontal lane per source on the timeline. */
export const LANES: Lane[] = [
  { id: 'rules', label: 'Regelgeving', color: '#94a3b8' },
  { id: 'procedure', label: 'Procedures', color: '#94a3b8' },
  { id: 'client', label: 'Klant', color: '#94a3b8' },
  { id: 'teams', label: 'Teams & mail', color: '#94a3b8' },
]

function laneOf(doc: Document): string {
  // A change from a meeting sits on the same line as the document it overrules (it copies that layer).
  if (!doc.meeting && doc.folder.toLowerCase().startsWith('teams')) return 'teams'
  if (doc.layer === 'wet' || doc.layer === 'sector') return 'rules'
  if (doc.layer === 'klant') return 'client'
  return 'procedure'
}

export interface TimelineDoc {
  id: string
  title: string
  date: Date
  lane: string
  trust: Trust
  /** Second line on the card. */
  sub: string
  /** Duplicate group this document belongs to (orange bundle). */
  group?: string
  /** A newer document that replaces this one (red line). */
  replacedBy?: string
  /** Plain-text lines for the tooltip. */
  tooltip: string[]
}

export interface DocGroup {
  id: string
  lane: string
  /** Oldest first; the newest one represents the collapsed bundle. */
  members: string[]
}

export interface Topic {
  id: string
  title: string
  color: string
  docs: TimelineDoc[]
  groups: Record<string, DocGroup>
  /** Documents that need attention: outdated ones and bundles of copies. */
  issues: number
}

const TOPIC_COLOR = '#0f172a'

const COUNTRY: Record<Document['country'], string> = { BE: 'België', NL: 'Nederland', DE: 'Duitsland' }
const STATUS: Record<Document['status'], string> = { goedgekeurd: 'Goedgekeurd', concept: 'Concept', verouderd: 'Verouderd' }

/** Extra words that point to a topic when someone types a question. */
const SYNONYMS: Record<string, string[]> = {
  bedrijfswagens: ['bedrijfswagen', 'auto', 'wagen', 'tankkaart', 'laadpas', 'fleet'],
  verlof: ['vakantie', 'verlofdag'],
  onboarding: ['nieuwe medewerker', 'indiensttreding', 'starter'],
  loonbetaling: ['loon', 'premie'],
  eindejaarspremie: ['dertiende maand', 'eindejaar'],
  maaltijdcheques: ['maaltijdcheque'],
  ecocheques: ['ecocheque', 'eco-cheque'],
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const toDate = (iso: string) => new Date(`${iso}T00:00:00`)

const recommended = new Set(Object.keys(analysis.recommended))

function neighbours(id: string): Set<string> {
  const out = new Set<string>()
  for (const e of analysis.edges) {
    if (e.relation === 'ander_toepassingsgebied') continue
    if (e.source === id) out.add(e.target)
    if (e.target === id) out.add(e.source)
  }
  return out
}

function buildTopic(topicId: string, docs: Document[], color: string): Topic {
  const byId = new Map(docs.map((d) => [d.id, d]))
  const recommendedDocs = docs.filter((d) => recommended.has(d.id))
  // The country the recommendation applies to; documents from other countries are a different scope.
  const home = recommendedDocs[0]?.country ?? mostCommon(docs.map((d) => d.country))

  // Duplicate groups inside this topic (at least two members present).
  const groups: Record<string, DocGroup> = {}
  const groupOf = new Map<string, string>()
  analysis.duplicate_groups.forEach((g, i) => {
    const members = [g.original, ...g.copies].filter((id) => byId.has(id))
    if (members.length < 2) return
    const id = `dup-${i}`
    members.sort((a, b) => byId.get(a)!.modified.localeCompare(byId.get(b)!.modified))
    groups[id] = { id, lane: laneOf(byId.get(members[0])!), members }
    members.forEach((m) => groupOf.set(m, id))
  })

  // Most trustworthy document per lane, with the same rules as analyze.py: approved, with an owner,
  // most recent. Copies in a duplicate group and documents from another country do not compete.
  const laneBest = new Set<string>()
  for (const lane of LANES) {
    const candidates = docs
      .filter((d) => !d.meeting && laneOf(d) === lane.id && d.country === home && d.status === 'goedgekeurd' && !groupOf.has(d.id))
      .sort((a, b) => Number(a.owner === null) - Number(b.owner === null) || b.modified.localeCompare(a.modified))
    if (candidates[0]) laneBest.add(candidates[0].id)
  }
  const bestDocs = docs.filter((d) => laneBest.has(d.id))

  // A document is replaced by a best document it is related to, if it is older.
  // Prefer a replacement in the same lane (old law → new law), then the oldest newer one.
  // Client documents belong to different clients, so they never replace each other.
  const replacementOf = (doc: Document): string | undefined =>
    laneOf(doc) === 'client' ? undefined : bestDocs
      .filter((b) => b.id !== doc.id && b.country === doc.country && b.modified > doc.modified && neighbours(doc.id).has(b.id))
      .sort((a, b) => Number(laneOf(a) !== laneOf(doc)) - Number(laneOf(b) !== laneOf(doc)) || a.modified.localeCompare(b.modified))[0]?.id

  // A change verified in a meeting overrules the document it contradicts.
  const replacedInMeeting = new Map(docs.flatMap((d) => (d.meeting ? [[d.meeting.replaces, d] as const] : [])))

  const timelineDocs: TimelineDoc[] = docs.map((doc) => {
    const owner = doc.owner ?? 'Geen eigenaar'
    let trust: Trust
    let sub: string
    let replacedBy: string | undefined
    const meetingChange = replacedInMeeting.get(doc.id)
    if (doc.meeting) {
      trust = 'meeting'
      const original = byId.get(doc.meeting.replaces)
      sub = original ? `Origineel: ${creatorOf(original)} · ✓ ${doc.meeting.verifiedBy}` : `Geverifieerd door ${doc.meeting.verifiedBy}`
    } else if (meetingChange) {
      trust = 'expired'
      replacedBy = meetingChange.id
      sub = `Vervangen in ${meetingChange.meeting!.title}`
    } else if (laneBest.has(doc.id)) {
      trust = 'best'
      sub = `Betrouwbaar · ${owner}`
    } else if (doc.country !== home) {
      trust = 'other_scope'
      sub = `Geldt voor ${COUNTRY[doc.country]}`
    } else if (groupOf.has(doc.id)) {
      trust = 'similar'
      sub = `${STATUS[doc.status]} · ${owner}`
    } else if (doc.status === 'verouderd' || replacementOf(doc)) {
      trust = 'expired'
      replacedBy = replacementOf(doc)
      sub = replacedBy ? `Vervangen door ${byId.get(replacedBy)!.title}` : 'Verouderd'
    } else {
      trust = 'support'
      sub = `${STATUS[doc.status]} · ${owner}`
    }
    return {
      id: doc.id,
      title: doc.title,
      date: toDate(doc.modified),
      lane: laneOf(doc),
      trust,
      sub,
      group: groupOf.get(doc.id),
      replacedBy,
      tooltip: doc.meeting ? meetingTooltip(doc, byId.get(doc.meeting.replaces)) : [doc.title, `${owner} · ${formatDate(doc.modified)}`, doc.folder],
    }
  })

  // A bundle of copies that is older than the recommended document points to it with a red line.
  for (const g of Object.values(groups)) {
    const newest = g.members[g.members.length - 1]
    const replacement = g.members.map((m) => replacementOf(byId.get(m)!)).find(Boolean)
    if (replacement) timelineDocs.find((d) => d.id === newest)!.replacedBy = replacement
  }

  const issues = timelineDocs.filter((d) => d.trust === 'expired').length + Object.keys(groups).length
  return { id: topicId, title: capitalize(topicId), color, docs: timelineDocs, groups, issues }
}

/** Who first wrote a document: the author of its oldest change, else its owner. */
export function creatorOf(doc: Document): string {
  const first = [...doc.history].sort((a, b) => a.date.localeCompare(b.date))[0]
  return first?.author ?? doc.owner ?? 'onbekend'
}

/** Tooltip of a meeting change: what changed, and where the original came from. */
function meetingTooltip(doc: Document, original: Document | undefined): string[] {
  const m = doc.meeting!
  const lines = [doc.title, `${m.oldValue} → ${m.newValue} · ${m.title}, ${formatDate(m.date)}`, `Gezegd door ${m.speaker} · geverifieerd door ${m.verifiedBy}`]
  if (original) {
    lines.push(
      `Origineel: ${original.title}`,
      `Opgesteld door ${creatorOf(original)} op ${formatDate(original.created)} · eigenaar ${original.owner ?? 'geen'}`,
      `Laatst herzien ${formatDate(original.modified)} · ${original.folder}`,
    )
  }
  return lines
}

function mostCommon<T>(values: T[]): T {
  const counts = new Map<T, number>()
  values.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1))
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

/** Groups documents per topic, largest topic first. */
export function buildTopics(docs: Document[]): Topic[] {
  const perTopic = new Map<string, Document[]>()
  for (const d of docs) perTopic.set(d.topic, [...(perTopic.get(d.topic) ?? []), d])
  return [...perTopic.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'nl'))
    .map(([id, list]) => buildTopic(id, list, TOPIC_COLOR))
}

/**
 * Finds the topic a question is about: by topic name or synonym first,
 * then by the topic whose documents share the most longer words with the question.
 */
export function topicForQuestion(query: string, topics: Topic[], docs: Document[]): Topic | undefined {
  const q = query.toLowerCase()
  if (!q) return undefined
  const allWords = q.split(/[^a-zà-ÿ0-9-]+/).filter(Boolean)
  // Synonyms must match whole words ("auto" must not match "koffieautomaat"); a plural -s is fine.
  const padded = ` ${allWords.join(' ')} `
  const hasWord = (s: string) => padded.includes(` ${s} `) || padded.includes(` ${s}s `)
  const byName = topics.find((t) => {
    const stem = t.id.replace(/s$/, '')
    return q.includes(stem) || (SYNONYMS[t.id] ?? []).some(hasWord)
  })
  if (byName) return byName
  const words = allWords.filter((w) => w.length >= 5)
  if (words.length === 0) return undefined
  const hits = new Map<string, number>()
  for (const d of docs) {
    const text = `${d.title} ${d.text}`.toLowerCase()
    const n = words.filter((w) => text.includes(w)).length
    if (n > 0) hits.set(d.topic, (hits.get(d.topic) ?? 0) + n)
  }
  const top = [...hits.entries()].sort((a, b) => b[1] - a[1])[0]
  return top ? topics.find((t) => t.id === top[0]) : undefined
}
