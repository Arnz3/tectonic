import { analysis } from '../../analysis'
import { formatDate } from '../../format'
import type { Document } from '../../types'

/** How trustworthy a document is within its topic. Drives the card colour on the timeline. */
export type Trust = 'best' | 'similar' | 'expired' | 'support' | 'other_scope'

export const TRUST: Record<Trust, { color: string; label: string }> = {
  best: { color: '#1e9e63', label: 'Meest betrouwbaar per categorie' },
  similar: { color: '#f28a1a', label: 'Gelijkaardige documenten (klik om te bekijken)' },
  expired: { color: '#e5484d', label: 'Verouderd of vervangen' },
  support: { color: '#98a2b3', label: 'Ondersteunend' },
  other_scope: { color: '#c5cbd5', label: 'Ander land' },
}

export interface Lane {
  id: string
  label: string
  color: string
}

/** Where a document comes from. One horizontal lane per source on the timeline. */
export const LANES: Lane[] = [
  { id: 'rules', label: 'Regelgeving', color: '#4a82de' },
  { id: 'procedure', label: 'Procedures', color: '#8766d6' },
  { id: 'client', label: 'Klant', color: '#38a477' },
  { id: 'teams', label: 'Teams & mail', color: '#98a0ae' },
]

function laneOf(doc: Document): string {
  if (doc.folder.toLowerCase().startsWith('teams')) return 'teams'
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
}

const TOPIC_COLORS = ['#8766d6', '#4a82de', '#38a477', '#d99a12', '#e0567a', '#2aa3b8', '#7a8699']

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
      .filter((d) => laneOf(d) === lane.id && d.country === home && d.status === 'goedgekeurd' && !groupOf.has(d.id))
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

  const timelineDocs: TimelineDoc[] = docs.map((doc) => {
    const owner = doc.owner ?? 'Geen eigenaar'
    let trust: Trust
    let sub: string
    let replacedBy: string | undefined
    if (laneBest.has(doc.id)) {
      trust = 'best'
      sub = `${recommended.has(doc.id) ? 'Aanbevolen' : 'Meest betrouwbaar'} · ${owner}`
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
      tooltip: [doc.title, `${owner} · ${formatDate(doc.modified)}`, doc.folder],
    }
  })

  // A bundle of copies that is older than the recommended document points to it with a red line.
  for (const g of Object.values(groups)) {
    const newest = g.members[g.members.length - 1]
    const replacement = g.members.map((m) => replacementOf(byId.get(m)!)).find(Boolean)
    if (replacement) timelineDocs.find((d) => d.id === newest)!.replacedBy = replacement
  }

  return { id: topicId, title: capitalize(topicId), color, docs: timelineDocs, groups }
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
    .map(([id, list], i) => buildTopic(id, list, TOPIC_COLORS[i % TOPIC_COLORS.length]))
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
