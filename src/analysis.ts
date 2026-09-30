import analysisJson from '../data/analysis.json'
import { documents } from './library'
import type { VoteSummary } from './votes'

/** Relations as shown in the UI. The LLM's "consistent" is displayed as "gelijkaardig". */
export type Relation = 'gelijkaardig' | 'duplicaat' | 'tegenstrijdig' | 'ander_toepassingsgebied'

export interface AnalysisEdge {
  source: string
  target: string
  similarity: number
  relation: Relation
  statement_a: string
  statement_b: string
  explanation: string
}

export interface Expert {
  author: string
  score: number
  inhoud: number
  opmaak: number
  documents: number
  last_activity: string
  reasons: string[]
  warning: string | null
}

export interface Cluster {
  documents: string[]
  topic: string
  independent_sources: number
  experts: Expert[]
}

export interface Analysis {
  edges: AnalysisEdge[]
  recommended: Record<string, string[]>
  /** Recommended id → documents the rules cannot separate from it (including itself). */
  recommendation_ties: Record<string, string[]>
  duplicate_groups: { original: string; copies: string[] }[]
  clusters: Cluster[]
  author_stats: Record<string, Record<string, { inhoud: number; opmaak: number }>>
}

const raw = analysisJson as unknown as Omit<Analysis, 'edges'> & { edges: (Omit<AnalysisEdge, 'relation'> & { relation: string })[] }

export const analysis: Analysis = {
  ...raw,
  edges: raw.edges.map((e) => ({ ...e, relation: e.relation === 'consistent' ? 'gelijkaardig' : (e.relation as Relation) })),
}

/**
 * Recommendations for the current search. Votes only act as a tie-breaker between documents that
 * score equally under the trust rules; they never override the rules.
 */
export function recommendationsFor(votes: Map<string, VoteSummary>): Record<string, string[]> {
  const result = { ...analysis.recommended }
  for (const [best, tied] of Object.entries(analysis.recommendation_ties ?? {})) {
    const winner = [...tied].sort((a, b) => (votes.get(b)?.usefulness ?? 0) - (votes.get(a)?.usefulness ?? 0))[0]
    if (winner !== best && (votes.get(winner)?.usefulness ?? 0) > (votes.get(best)?.usefulness ?? 0)) {
      delete result[best]
      // Tied documents share status, recency and having an owner; owner name and contradictions are per document.
      const owner = documents.find((d) => d.id === winner)?.owner
      result[winner] = [
        ...analysis.recommended[best].filter((r) => !r.startsWith('Eigenaar') && !r.startsWith('Nieuwer dan')),
        ...(owner ? [`Eigenaar: ${owner}`] : []),
        'Gelijkwaardig volgens de regels; vaker nuttig bevonden voor deze zoekopdracht',
      ]
    }
  }
  return result
}

/** Number of content changes per document, across all authors. */
export function contentChanges(docId: string): number {
  return Object.values(analysis.author_stats[docId] ?? {}).reduce((sum, s) => sum + s.inhoud, 0)
}

const copyToOriginal = new Map(analysis.duplicate_groups.flatMap((g) => g.copies.map((c) => [c, g.original] as const)))

/** Copies of the same original count as one source. */
export function independentSources(docIds: string[]): number {
  return new Set(docIds.map((id) => copyToOriginal.get(id) ?? id)).size
}

/**
 * The cluster that best matches what the user is looking at: the one containing the most
 * matched documents, then the largest one.
 */
export function primaryCluster(matchedIds: string[]): Cluster | undefined {
  const matched = new Set(matchedIds)
  let best: Cluster | undefined
  let bestHits = 0
  for (const c of analysis.clusters) {
    const hits = c.documents.filter((d) => matched.has(d)).length
    if (hits > bestHits || (hits === bestHits && hits > 0 && best && c.documents.length > best.documents.length)) {
      best = c
      bestHits = hits
    }
  }
  return best
}
