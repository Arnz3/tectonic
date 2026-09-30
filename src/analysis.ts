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
