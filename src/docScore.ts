/**
 * Trust score per document (0–100), from metadata only: status, owner, recency, original or copy,
 * recommended or not, whether a newer recommended document on the same subject exists, and
 * whether a verified meeting change overrules part of it.
 * The same rules as the recommendation, made visible as a number.
 */
import { analysis } from './analysis'
import { documents } from './library'
import { MEETING_CHANGES } from './views/graphmapper/meetings'
import type { Document } from './types'

export interface ScorePart {
  label: string
  points: number
}

export interface DocScore {
  score: number
  parts: ScorePart[]
}

const STATUS_POINTS: Record<Document['status'], number> = { goedgekeurd: 40, concept: 15, verouderd: 0 }
const OWNER_POINTS = 15
const RECENCY_POINTS = 25
const RECENCY_HALF_LIFE_DAYS = 365
const ORIGINAL_POINTS = 10
const RECOMMENDED_POINTS = 10
const SUPERSEDED_PENALTY = -20
const MEETING_CHANGE_PENALTY = -10

const DAY = 86_400_000
// Age is measured from the newest change in the dataset, so the demo shows the same scores every day.
const today = Math.max(...documents.map((d) => Date.parse(d.modified)))
const copies = new Set(analysis.duplicate_groups.flatMap((g) => g.copies))
const recommended = new Set(Object.keys(analysis.recommended))
const byId = new Map(documents.map((d) => [d.id, d]))
// Verified meeting changes that overrule one sentence of a document.
const changedInMeeting = new Map(MEETING_CHANGES.flatMap((c) => (c.meeting ? [[c.meeting.replaces, c.meeting.title] as const] : [])))

/** The recommended document of the cluster this one belongs to, when that is a different one. */
function recommendedSibling(doc: Document): Document | undefined {
  const cluster = analysis.clusters.find((c) => c.documents.includes(doc.id))
  const rec = cluster?.documents.find((id) => recommended.has(id) && id !== doc.id)
  return rec ? byId.get(rec) : undefined
}

export function documentScore(doc: Document): DocScore {
  const parts: ScorePart[] = []
  parts.push({ label: `Status: ${doc.status}`, points: STATUS_POINTS[doc.status] })
  parts.push({ label: doc.owner ? `Eigenaar: ${doc.owner}` : 'Geen eigenaar', points: doc.owner ? OWNER_POINTS : 0 })
  const ageDays = Math.max(0, (today - Date.parse(doc.modified)) / DAY)
  parts.push({ label: 'Recent gewijzigd', points: Math.round(RECENCY_POINTS * 0.5 ** (ageDays / RECENCY_HALF_LIFE_DAYS)) })
  parts.push({ label: copies.has(doc.id) ? 'Kopie van een ander document' : 'Origineel', points: copies.has(doc.id) ? 0 : ORIGINAL_POINTS })
  if (recommended.has(doc.id)) parts.push({ label: 'Aanbevolen document', points: RECOMMENDED_POINTS })
  const newer = recommendedSibling(doc)
  // Client agreements may differ on purpose; they are not superseded by the general procedure.
  if (newer && doc.layer !== 'klant' && newer.country === doc.country && newer.modified > doc.modified) {
    parts.push({ label: `Nieuwer aanbevolen document: ${newer.title}`, points: SUPERSEDED_PENALTY })
  }
  const meeting = changedInMeeting.get(doc.id)
  if (meeting) parts.push({ label: `Eén zin overschreven in meeting "${meeting}"`, points: MEETING_CHANGE_PENALTY })
  const score = Math.max(0, Math.min(100, parts.reduce((sum, p) => sum + p.points, 0)))
  return { score, parts }
}

const cache = new Map<string, DocScore>()

export function scoreOf(id: string): DocScore | undefined {
  if (!cache.has(id)) {
    const doc = byId.get(id)
    if (!doc) return undefined
    cache.set(id, documentScore(doc))
  }
  return cache.get(id)
}

export function scoreLevel(score: number): 'high' | 'mid' | 'low' {
  return score >= 75 ? 'high' : score >= 45 ? 'mid' : 'low'
}
