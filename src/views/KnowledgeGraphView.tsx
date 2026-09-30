import { useEffect, useMemo, useRef } from 'react'
import { DataSet, Network, type Edge, type Node, type Options } from 'vis-network/standalone'
import { analysis, contentChanges, independentSources, topAuthors, type AnalysisEdge, type Relation } from '../analysis'
import { libraryItems } from '../library'
import type { Document, FileItem, ViewProps } from '../types'

export const statusColors: Record<Document['status'], string> = {
  goedgekeurd: '#0078d4',
  concept: '#e8a33a',
  verouderd: '#a19f9d',
}
const RECOMMENDED_BORDER = '#107c10'

export const relationStyles: Record<Relation, { label: string; color: string; width: number; dashes: boolean }> = {
  gelijkaardig: { label: 'Gelijkaardig', color: '#b3b0ad', width: 1.5, dashes: false },
  duplicaat: { label: 'Duplicaat', color: '#f7630c', width: 3, dashes: false },
  tegenstrijdig: { label: 'Tegenstrijdig', color: '#d13438', width: 5, dashes: false },
  ander_toepassingsgebied: { label: 'Ander toepassingsgebied', color: '#0078d4', width: 2, dashes: true },
}

const fileById = new Map(libraryItems.filter((f) => f.document).map((f) => [f.id, f]))

const options: Options = {
  // Fixed seed so the demo lays out the same way every time.
  layout: { randomSeed: 7 },
  physics: {
    solver: 'forceAtlas2Based',
    forceAtlas2Based: { gravitationalConstant: -110, springLength: 180, avoidOverlap: 0.8 },
    stabilization: { iterations: 400 },
  },
  interaction: { hover: true, tooltipDelay: 150 },
  nodes: { shape: 'dot', font: { size: 13, face: 'Segoe UI, system-ui, sans-serif', color: '#323130', strokeWidth: 4, strokeColor: '#faf9f8' } },
  edges: { smooth: false, selectionWidth: 2 },
}

/** Tooltip as a DOM element filled via textContent, so document data is never parsed as HTML. */
function tooltip(lines: string[]): HTMLElement {
  const el = document.createElement('div')
  el.className = 'graph-tooltip'
  for (const line of lines) {
    const row = document.createElement('div')
    row.textContent = line
    el.appendChild(row)
  }
  return el
}

function toNode(doc: Document): Node {
  const reasons = analysis.recommended[doc.id]
  const changes = contentChanges(doc.id)
  return {
    id: doc.id,
    label: reasons ? `${doc.title}\n✓ Aanbevolen` : doc.title,
    size: 10 + changes * 4,
    borderWidth: reasons ? 5 : 1,
    borderWidthSelected: reasons ? 6 : 3,
    color: {
      background: statusColors[doc.status],
      border: reasons ? RECOMMENDED_BORDER : '#ffffff',
      highlight: { background: statusColors[doc.status], border: reasons ? RECOMMENDED_BORDER : '#323130' },
      hover: { background: statusColors[doc.status], border: reasons ? RECOMMENDED_BORDER : '#323130' },
    },
    font: reasons ? { color: RECOMMENDED_BORDER, bold: { color: RECOMMENDED_BORDER } } : undefined,
    widthConstraint: { maximum: 170 },
    title: tooltip([doc.filename, `${doc.folder} · ${doc.country} · ${doc.status}`, `${changes} inhoudelijke wijzigingen`]),
  }
}

const edgeId = (e: AnalysisEdge) => `${e.source}|${e.target}`
const edgeById = new Map(analysis.edges.map((e) => [edgeId(e), e]))

export function KnowledgeGraphView({ items, onOpen, onSelectEdge }: ViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const networkRef = useRef<Network | null>(null)
  const onOpenRef = useRef(onOpen)
  onOpenRef.current = onOpen
  const onSelectEdgeRef = useRef(onSelectEdge)
  onSelectEdgeRef.current = onSelectEdge

  // The graph shows the given documents plus their direct neighbours (1 hop).
  const { docIds, edges } = useMemo(() => {
    const matched = new Set(items.filter((i) => i.document).map((i) => i.id))
    const visible = new Set(matched)
    for (const e of analysis.edges) {
      if (matched.has(e.source)) visible.add(e.target)
      if (matched.has(e.target)) visible.add(e.source)
    }
    return {
      docIds: [...visible].sort(),
      edges: analysis.edges.filter((e) => visible.has(e.source) && visible.has(e.target)),
    }
  }, [items])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const network = new Network(container, {}, options)
    network.on('click', (params: { nodes: string[]; edges: string[] }) => {
      const file: FileItem | undefined = fileById.get(params.nodes[0])
      if (file) {
        onOpenRef.current(file)
        return
      }
      // A click on a node also selects its edges, so only handle edges when no node was hit.
      const edge = params.edges.length === 1 ? edgeById.get(params.edges[0]) : undefined
      if (edge) onSelectEdgeRef.current(edge)
    })
    networkRef.current = network
    // Keep the graph centred when the container changes size, e.g. when the side panel opens.
    const resizeObserver = new ResizeObserver(() => {
      network.redraw()
      network.fit({ animation: false })
    })
    resizeObserver.observe(container)
    return () => {
      resizeObserver.disconnect()
      network.destroy()
      networkRef.current = null
    }
  }, [])

  useEffect(() => {
    const nodes = new DataSet<Node>(docIds.map((id) => toNode(fileById.get(id)!.document!)))
    const visEdges = new DataSet<Edge>(
      edges.map((e) => {
        const style = relationStyles[e.relation]
        return {
          id: edgeId(e),
          from: e.source,
          to: e.target,
          width: style.width,
          // Thicken on hover so it is clear that edges can be clicked.
          hoverWidth: 1.5,
          dashes: style.dashes,
          color: { color: style.color, highlight: style.color, hover: style.color },
          title: tooltip([`${style.label} (gelijkenis ${e.similarity.toFixed(2).replace('.', ',')})`]),
        }
      }),
    )
    networkRef.current?.setData({ nodes, edges: visEdges })
  }, [docIds, edges])

  return (
    <div className="graph-view">
      {docIds.length > 0 && (
        <div className="sources-badge">
          {docIds.length} {docIds.length === 1 ? 'document' : 'documenten'} gevonden ·{' '}
          <strong>
            {independentSources(docIds)} {independentSources(docIds) === 1 ? 'onafhankelijke bron' : 'onafhankelijke bronnen'}
          </strong>
        </div>
      )}
      <Legend />
      <div className="graph-body">
        <div className="graph-area">
          {docIds.length === 0 && <div className="empty graph-empty">Geen documenten gevonden voor deze zoekopdracht.</div>}
          <div ref={containerRef} className="graph-canvas" />
        </div>
        <WhoKnowsMore docIds={docIds} />
      </div>
    </div>
  )
}

function WhoKnowsMore({ docIds }: { docIds: string[] }) {
  const authors = topAuthors(docIds, 3)
  if (authors.length === 0) return null
  const max = authors[0].inhoud
  return (
    <aside className="who-knows" aria-label="Wie weet hier meer van?">
      <h3>Wie weet hier meer van?</h3>
      <p className="who-knows-sub">Op basis van inhoudelijke wijzigingen</p>
      <ol>
        {authors.map((a) => (
          <li key={a.author}>
            <div className="who-name">{a.author}</div>
            <div className="who-bar">
              <span style={{ width: `${(a.inhoud / max) * 100}%` }} />
            </div>
            <div className="who-counts">
              {a.inhoud} inhoudelijk
              {a.opmaak > 0 && <small> · {a.opmaak} opmaak</small>}
            </div>
          </li>
        ))}
      </ol>
    </aside>
  )
}

function Legend() {
  return (
    <div className="graph-legend" aria-label="Legende">
      <span className="legend-title">Documenten</span>
      {(Object.keys(statusColors) as Document['status'][]).map((s) => (
        <div key={s} className="legend-row">
          <span className="legend-dot" style={{ background: statusColors[s] }} />
          {s[0].toUpperCase() + s.slice(1)}
        </div>
      ))}
      <div className="legend-row">
        <span className="legend-dot recommended" />
        Aanbevolen
      </div>
      <span className="legend-note">Grootte = aantal inhoudelijke wijzigingen</span>
      <span className="legend-title">Verbanden</span>
      {(Object.keys(relationStyles) as Relation[]).map((r) => {
        const s = relationStyles[r]
        return (
          <div key={r} className="legend-row">
            <svg width="28" height="10" aria-hidden>
              <line x1="0" y1="5" x2="28" y2="5" stroke={s.color} strokeWidth={Math.min(s.width, 4)} strokeDasharray={s.dashes ? '4 3' : undefined} />
            </svg>
            {s.label}
          </div>
        )
      })}
    </div>
  )
}
