/**
 * Votes per search query (CLAUDE.md, section 12, M4e).
 *
 * Useful ≠ correct: votes are an extra signal next to the trust rules and never override a
 * recommendation. There is no backend, so the user's own votes live in localStorage; the demo
 * adds simulated votes from data/votes_seed.json.
 */
import { useMemo, useSyncExternalStore } from 'react'
import seedJson from '../data/votes_seed.json'
import { documents } from './library'

export const VOTE_REASONS = {
  verouderd: 'Verouderd',
  klopt_niet: 'Klopt niet',
  ander_toepassingsgebied: 'Ander land/situatie',
  niet_relevant: 'Niet relevant',
} as const
export type VoteReason = keyof typeof VOTE_REASONS

export interface Vote {
  query_key: string
  query_raw: string
  doc_id: string
  vote: 1 | -1
  reason: VoteReason | null
  session_id: string
  timestamp: string
  /** Not stored: marks simulated demo votes. */
  simulated?: boolean
}

export const MAX_QUERY_LENGTH = 100
const STORAGE_KEY = 'tectonic.votes.v1'
const SESSION_KEY = 'tectonic.session'
const RATE_LIMIT = 30 // votes per minute per session
const DAY = 86_400_000
const RECENT_DAYS = 30
const RECENT_NEGATIVE_THRESHOLD = 3
const NEGATIVE_REASONS: VoteReason[] = ['verouderd', 'klopt_niet']

const knownDocIds = new Set(documents.map((d) => d.id))

/** lowercase, trim, strip punctuation, collapse spaces, drop a plural "s" at the end. */
export function queryKey(raw: string): string {
  return raw
    .slice(0, MAX_QUERY_LENGTH)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/s$/, '')
}

/** Anything read from storage or the seed file is untrusted: keep only well-formed votes on known documents. */
function isValidVote(v: unknown): v is Vote {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    typeof o.query_key === 'string' &&
    o.query_key.length > 0 &&
    o.query_key.length <= MAX_QUERY_LENGTH &&
    typeof o.query_raw === 'string' &&
    o.query_raw.length <= MAX_QUERY_LENGTH &&
    typeof o.doc_id === 'string' &&
    knownDocIds.has(o.doc_id) &&
    (o.vote === 1 || o.vote === -1) &&
    (o.reason === null || (typeof o.reason === 'string' && o.reason in VOTE_REASONS)) &&
    typeof o.session_id === 'string' &&
    typeof o.timestamp === 'string' &&
    !Number.isNaN(Date.parse(o.timestamp))
  )
}

// Shift seed timestamps so the latest simulated vote is always yesterday; "recent" keeps working in any demo.
const seedVotes: Vote[] = (() => {
  const raw = (seedJson as { votes: unknown[] }).votes.filter(isValidVote)
  const latest = Math.max(...raw.map((v) => Date.parse(v.timestamp)))
  const shift = Date.now() - DAY - latest
  return raw.map((v) => ({ ...v, timestamp: new Date(Date.parse(v.timestamp) + shift).toISOString(), simulated: true }))
})()

function loadOwnVotes(): Vote[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isValidVote) : []
  } catch {
    return []
  }
}

function saveOwnVotes() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ownVotes))
  } catch {
    /* storage unavailable: votes last for this page view only */
  }
}

/** Random per browser session; never taken from anything the user or a request supplies. */
function sessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY)
    if (existing) return existing
    const id = crypto.randomUUID()
    sessionStorage.setItem(SESSION_KEY, id)
    return id
  } catch {
    return crypto.randomUUID()
  }
}

let ownVotes = loadOwnVotes()
const session = sessionId()
const recentCasts: number[] = []
let version = 0
const listeners = new Set<() => void>()

export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export const getVersion = () => version

function changed() {
  version++
  saveOwnVotes()
  listeners.forEach((l) => l())
}

export class VoteError extends Error {}

/** One vote per session per (query, document); voting again replaces the previous vote. */
export function castVote(queryRaw: string, docId: string, vote: 1 | -1, reason: VoteReason | null = null) {
  const raw = queryRaw.trim().slice(0, MAX_QUERY_LENGTH)
  const key = queryKey(raw)
  if (!key) throw new VoteError('Geen zoekopdracht.')
  if (!knownDocIds.has(docId)) throw new VoteError('Onbekend document.')
  if (reason !== null && (vote !== -1 || !(reason in VOTE_REASONS))) throw new VoteError('Ongeldige reden.')

  const now = Date.now()
  while (recentCasts.length && now - recentCasts[0] > 60_000) recentCasts.shift()
  if (recentCasts.length >= RATE_LIMIT) throw new VoteError('Te veel stemmen. Probeer het over een minuut opnieuw.')
  recentCasts.push(now)

  ownVotes = ownVotes.filter((v) => !(v.session_id === session && v.query_key === key && v.doc_id === docId))
  ownVotes.push({ query_key: key, query_raw: raw, doc_id: docId, vote, reason, session_id: session, timestamp: new Date(now).toISOString() })
  changed()
}

export function myVote(queryRaw: string, docId: string): Vote | undefined {
  const key = queryKey(queryRaw)
  return ownVotes.find((v) => v.session_id === session && v.query_key === key && v.doc_id === docId)
}

export interface VoteSummary {
  up: number
  down: number
  reasons: Partial<Record<VoteReason, number>>
  /** Wilson lower bound (95%) of the share of upvotes: 1 upvote is not 100% useful. */
  usefulness: number
  /** Downvotes with reason "verouderd" or "klopt_niet" in the last 30 days. */
  recentNegative: number
  recentlyRejected: boolean
  hasSimulated: boolean
}

export function wilsonLowerBound(up: number, total: number, z = 1.96): number {
  if (total === 0) return 0
  const p = up / total
  const z2 = z * z
  return (p + z2 / (2 * total) - z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total)) / (1 + z2 / total)
}

/** Votes per document for one query. */
export function summarize(queryRaw: string): Map<string, VoteSummary> {
  const key = queryKey(queryRaw)
  const result = new Map<string, VoteSummary>()
  if (!key) return result
  const now = Date.now()
  for (const v of [...seedVotes, ...ownVotes]) {
    if (v.query_key !== key) continue
    const s = result.get(v.doc_id) ?? { up: 0, down: 0, reasons: {}, usefulness: 0, recentNegative: 0, recentlyRejected: false, hasSimulated: false }
    if (v.vote === 1) s.up++
    else {
      s.down++
      if (v.reason) s.reasons[v.reason] = (s.reasons[v.reason] ?? 0) + 1
      if (v.reason && NEGATIVE_REASONS.includes(v.reason) && now - Date.parse(v.timestamp) <= RECENT_DAYS * DAY) s.recentNegative++
    }
    s.hasSimulated ||= Boolean(v.simulated)
    result.set(v.doc_id, s)
  }
  for (const s of result.values()) {
    s.usefulness = wilsonLowerBound(s.up, s.up + s.down)
    s.recentlyRejected = s.recentNegative >= RECENT_NEGATIVE_THRESHOLD
  }
  return result
}

/** Votes exist for this query, but no document has a positive usefulness score. */
export function isSearchGap(summaries: Map<string, VoteSummary>, docIds: string[]): boolean {
  const voted = docIds.filter((id) => summaries.has(id))
  return voted.length > 0 && voted.every((id) => summaries.get(id)!.usefulness <= 0)
}

/** Re-renders when votes change. */
export function useVoteSummaries(queryRaw: string): Map<string, VoteSummary> {
  const v = useSyncExternalStore(subscribe, getVersion)
  return useMemo(() => summarize(queryRaw), [queryRaw, v])
}
