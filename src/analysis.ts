import analysisJson from '../data/analysis.json'

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

export interface Analysis {
  edges: AnalysisEdge[]
  recommended: Record<string, string[]>
  duplicate_groups: { original: string; copies: string[] }[]
  clusters: { documents: string[]; independent_sources: number }[]
  author_stats: Record<string, Record<string, { inhoud: number; opmaak: number }>>
}

const raw = analysisJson as unknown as Omit<Analysis, 'edges'> & { edges: (Omit<AnalysisEdge, 'relation'> & { relation: string })[] }

export const analysis: Analysis = {
  ...raw,
  edges: raw.edges.map((e) => ({ ...e, relation: e.relation === 'consistent' ? 'gelijkaardig' : (e.relation as Relation) })),
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

export interface AuthorSummary {
  author: string
  inhoud: number
  opmaak: number
}

/** Authors ranked by content changes over the given documents. */
export function topAuthors(docIds: string[], limit: number): AuthorSummary[] {
  const totals = new Map<string, AuthorSummary>()
  for (const id of docIds) {
    for (const [author, s] of Object.entries(analysis.author_stats[id] ?? {})) {
      const t = totals.get(author) ?? { author, inhoud: 0, opmaak: 0 }
      t.inhoud += s.inhoud
      t.opmaak += s.opmaak
      totals.set(author, t)
    }
  }
  return [...totals.values()]
    .filter((t) => t.inhoud > 0)
    .sort((a, b) => b.inhoud - a.inhoud || a.author.localeCompare(b.author, 'nl'))
    .slice(0, limit)
}
