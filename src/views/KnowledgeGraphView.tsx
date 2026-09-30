import { useEffect, useMemo, useRef, useState } from 'react'
import { DataSet, Network, type Edge, type Node, type Options } from 'vis-network/standalone'
import { analysis, contentChanges, independentSources, primaryCluster, type AnalysisEdge, type Relation } from '../analysis'
import { libraryItems } from '../library'
import { formatDate } from '../format'
import type { Document, FileItem, ViewProps } from '../types'
import { timelineLayout, type TimelineLayout } from './timelineLayout'

export const statusColors: Record<Document['status'], string> = {
  goedgekeurd: '#0078d4',
  concept: '#e8a33a',
  verouderd: '#a19f9d',
}
const RECOMMENDED_BORDER = '#107c10'
export const PERSON_COLOR = '#8764b8'
const PERSON_PREFIX = 'person:'

export const relationStyles: Record<Relation, { label: string; color: string; width: number; dashes: boolean }> = {
  gelijkaardig: { label: 'Gelijkaardig', color: '#b3b0ad', width: 1.5, dashes: false },
  duplicaat: { label: 'Duplicaat', color: '#f7630c', width: 3, dashes: false },
  tegenstrijdig: { label: 'Tegenstrijdig', color: '#d13438', width: 5, dashes: false },
  ander_toepassingsgebied: { label: 'Ander toepassingsgebied', color: '#0078d4', width: 2, dashes: true },
}

const fileById = new Map(libraryItems.filter((f) => f.document).map((f) => [f.id, f]))

type LayoutMode = 'free' | 'timeline'

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
    title: tooltip([
      doc.filename,
      `${doc.folder} · ${doc.country} · ${doc.status}`,
      `Gewijzigd: ${formatDate(doc.modified)}`,
      `${changes} inhoudelijke wijzigingen`,
    ]),
  }
}

// Invisible, non-interactive nodes at the corners of the timeline, so fit() keeps lane labels and the axis in view.
function anchorNodes(layout: TimelineLayout): Node[] {
  const invisible = { shape: 'dot', size: 0, color: 'rgba(0,0,0,0)', label: undefined, chosen: false, physics: false }
  return [
    { id: '__anchor-top-left', x: -230, y: 0, ...invisible },
    { id: '__anchor-bottom-right', x: layout.width + 60, y: layout.axisY + 45, ...invisible },
  ]
}

/** Lanes, date grid and axis, drawn on the canvas below the nodes. Text via fillText, never as HTML. */
function drawTimeline(ctx: CanvasRenderingContext2D, layout: TimelineLayout) {
  const left = -230
  const right = layout.width + 60
  ctx.save()
  layout.lanes.forEach((lane, i) => {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(3, 120, 124, 0.05)' : 'rgba(0, 0, 0, 0)'
    ctx.fillRect(left, lane.top, right - left, lane.bottom - lane.top)
    ctx.strokeStyle = '#e1dfdd'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(left, lane.bottom)
    ctx.lineTo(right, lane.bottom)
    ctx.stroke()
    ctx.fillStyle = '#605e5c'
    ctx.font = '600 16px Segoe UI, system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(lane.label, left + 12, lane.top + 12)
  })
  ctx.setLineDash([4, 6])
  ctx.strokeStyle = '#d2d0ce'
  ctx.fillStyle = '#605e5c'
  ctx.font = '13px Segoe UI, system-ui, sans-serif'
  ctx.textAlign = 'center'
  for (const tick of layout.ticks) {
    ctx.beginPath()
    ctx.moveTo(tick.x, 0)
    ctx.lineTo(tick.x, layout.axisY)
    ctx.stroke()
    ctx.fillText(tick.label, tick.x, layout.axisY + 12)
  }
  ctx.setLineDash([])
  ctx.strokeStyle = '#8a8886'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(left, layout.axisY)
  ctx.lineTo(right, layout.axisY)
  ctx.stroke()
  ctx.restore()
}

interface Person {
  author: string
  /** Content changes per visible document. */
  changes: Map<string, number>
}

/** Everyone with content changes on the given documents. Formatting changes do not make someone a node. */
function peopleFor(docs: Document[]): Person[] {
  const people = new Map<string, Person>()
  for (const doc of docs) {
    for (const h of doc.history) {
      if (h.change !== 'inhoud') continue
      const p = people.get(h.author) ?? { author: h.author, changes: new Map() }
      p.changes.set(doc.id, (p.changes.get(doc.id) ?? 0) + 1)
      people.set(h.author, p)
    }
  }
  return [...people.values()].sort((a, b) => a.author.localeCompare(b.author, 'nl'))
}

function personNode(p: Person): Node {
  const total = [...p.changes.values()].reduce((a, b) => a + b, 0)
  return {
    id: PERSON_PREFIX + p.author,
    label: p.author,
    shape: 'circle',
    margin: { top: 8, right: 8, bottom: 8, left: 8 },
    // Same size for every person, regardless of name length.
    widthConstraint: { minimum: 78, maximum: 78 },
    color: {
      background: PERSON_COLOR,
      border: '#ffffff',
      highlight: { background: PERSON_COLOR, border: '#323130' },
      hover: { background: PERSON_COLOR, border: '#323130' },
    },
    font: { color: '#ffffff', size: 12, strokeWidth: 0 },
    title: tooltip([p.author, `${total} inhoudelijke wijzigingen op ${p.changes.size} zichtbare documenten`]),
  }
}

function personEdges(p: Person): Edge[] {
  return [...p.changes].map(([docId, count]) => ({
    id: `${PERSON_PREFIX}${p.author}|${docId}`,
    from: PERSON_PREFIX + p.author,
    to: docId,
    width: 1 + count * 1.2,
    color: { color: 'rgba(135, 100, 184, 0.45)', highlight: PERSON_COLOR, hover: PERSON_COLOR },
    smooth: false,
    title: tooltip([`${p.author}: ${count} inhoudelijke ${count === 1 ? 'wijziging' : 'wijzigingen'}`]),
  }))
}

const edgeId = (e: AnalysisEdge) => `${e.source}|${e.target}`
const edgeById = new Map(analysis.edges.map((e) => [edgeId(e), e]))

export function KnowledgeGraphView({ items, onOpen, onSelectEdge, onSelectPerson }: ViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const networkRef = useRef<Network | null>(null)
  const onOpenRef = useRef(onOpen)
  onOpenRef.current = onOpen
  const onSelectEdgeRef = useRef(onSelectEdge)
  onSelectEdgeRef.current = onSelectEdge
  const onSelectPersonRef = useRef(onSelectPerson)
  onSelectPersonRef.current = onSelectPerson
  const [mode, setMode] = useState<LayoutMode>('free')
  const [showPeople, setShowPeople] = useState(false)
  const timelineRef = useRef<TimelineLayout | null>(null)

  // The graph shows the given documents plus their direct neighbours (1 hop).
  const { matchedIds, docIds, edges } = useMemo(() => {
    const matched = new Set(items.filter((i) => i.document).map((i) => i.id))
    const visible = new Set(matched)
    for (const e of analysis.edges) {
      if (matched.has(e.source)) visible.add(e.target)
      if (matched.has(e.target)) visible.add(e.source)
    }
    return {
      matchedIds: [...matched],
      docIds: [...visible].sort(),
      edges: analysis.edges.filter((e) => visible.has(e.source) && visible.has(e.target)),
    }
  }, [items])
  const docIdsRef = useRef(docIds)
  docIdsRef.current = docIds

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const network = new Network(container, {}, options)
    network.on('click', (params: { nodes: string[]; edges: string[] }) => {
      const nodeId = params.nodes[0]
      if (nodeId?.startsWith(PERSON_PREFIX)) {
        onSelectPersonRef.current(nodeId.slice(PERSON_PREFIX.length), docIdsRef.current)
        return
      }
      const file: FileItem | undefined = fileById.get(nodeId)
      if (file) {
        onOpenRef.current(file)
        return
      }
      // A click on a node also selects its edges, so only handle edges when no node was hit.
      const edge = params.edges.length === 1 ? edgeById.get(params.edges[0]) : undefined
      if (edge) onSelectEdgeRef.current(edge)
    })
    network.on('beforeDrawing', (ctx: CanvasRenderingContext2D) => {
      if (timelineRef.current) drawTimeline(ctx, timelineRef.current)
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
    const network = networkRef.current
    if (!network) return
    const docs = docIds.map((id) => fileById.get(id)!.document!)
    const viewport = { width: containerRef.current?.clientWidth || 1000, height: containerRef.current?.clientHeight || 600 }
    const people = showPeople ? peopleFor(docs) : []
    const layout =
      mode === 'timeline' && docs.length > 0
        ? timelineLayout(docs, viewport, {
            label: 'Mensen',
            items: people.map((p) => ({ id: PERSON_PREFIX + p.author, docIds: [...p.changes.keys()] })),
          })
        : null
    timelineRef.current = layout

    const docNodes = docs.map((doc) => {
      const node = toNode(doc)
      const pos = layout?.positions.get(doc.id)
      return pos ? { ...node, ...pos, fixed: { x: true, y: true } } : node
    })
    const personNodes = people.map((p) => {
      const node = personNode(p)
      const pos = layout?.positions.get(node.id as string)
      return pos ? { ...node, ...pos, fixed: { x: true, y: true } } : node
    })
    const nodes = new DataSet<Node>([...docNodes, ...personNodes, ...(layout ? anchorNodes(layout) : [])])
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
    visEdges.add(people.flatMap(personEdges))
    // Timeline positions are fixed, so physics would only fight them.
    network.setOptions({
      physics: { enabled: layout === null },
      // Curved edges in the timeline so lines between nodes in one row do not run through the nodes in between.
      edges: { smooth: layout ? { enabled: true, type: 'curvedCW', roundness: 0.25 } : false },
    })
    network.setData({ nodes, edges: visEdges })
    if (layout) network.fit({ animation: false })
  }, [docIds, edges, mode, showPeople])

  return (
    <div className="graph-view">
      <div className="graph-toolbar">
        {docIds.length > 0 && (
          <span className="sources-badge">
            {docIds.length} {docIds.length === 1 ? 'document' : 'documenten'} gevonden ·{' '}
            <strong>
              {independentSources(docIds)} {independentSources(docIds) === 1 ? 'onafhankelijke bron' : 'onafhankelijke bronnen'}
            </strong>
          </span>
        )}
        <div className="spacer" />
        <label className="toggle">
          <input type="checkbox" checked={showPeople} onChange={(e) => setShowPeople(e.target.checked)} />
          Toon mensen
        </label>
        <div className="segmented" role="group" aria-label="Indeling">
          <button className={mode === 'free' ? 'active' : ''} aria-pressed={mode === 'free'} onClick={() => setMode('free')}>
            Vrije graaf
          </button>
          <button className={mode === 'timeline' ? 'active' : ''} aria-pressed={mode === 'timeline'} onClick={() => setMode('timeline')}>
            Tijdlijnweergave
          </button>
        </div>
      </div>
      <Legend showPeople={showPeople} />
      <div className="graph-body">
        <div className="graph-area">
          {docIds.length === 0 && <div className="empty graph-empty">Geen documenten gevonden voor deze zoekopdracht.</div>}
          <div ref={containerRef} className="graph-canvas" />
        </div>
        <ContactPanel matchedIds={matchedIds} />
      </div>
    </div>
  )
}

function ContactPanel({ matchedIds }: { matchedIds: string[] }) {
  const cluster = primaryCluster(matchedIds)
  const experts = cluster?.experts.slice(0, 3) ?? []
  if (!cluster || experts.length === 0) return null
  const max = experts[0].score
  return (
    <aside className="who-knows" aria-label="Aanspreekpunt">
      <h3>Aanspreekpunt</h3>
      <p className="who-knows-sub">
        Onderwerp: {cluster.topic}
        <br />
        Op basis van recente inhoudelijke wijzigingen aan betrouwbare documenten
      </p>
      <ol>
        {experts.map((e) => (
          <li key={e.author}>
            <div className="who-name">
              {e.author}
              <span className="who-score">{e.score.toFixed(1).replace('.', ',')}</span>
            </div>
            <div className="who-bar">
              <span style={{ width: `${(e.score / max) * 100}%` }} />
            </div>
            {e.warning && <div className="who-warning">⚠ {e.warning}</div>}
            <ul className="who-reasons">
              {e.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <div className="who-counts">
              {e.inhoud} inhoudelijk
              {e.opmaak > 0 && <small> · {e.opmaak} opmaak (telt niet mee)</small>}
            </div>
          </li>
        ))}
      </ol>
    </aside>
  )
}

function Legend({ showPeople }: { showPeople: boolean }) {
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
      {showPeople && (
        <>
          <span className="legend-title">Mensen</span>
          <div className="legend-row">
            <span className="legend-dot" style={{ background: PERSON_COLOR }} />
            Persoon
          </div>
          <div className="legend-row">
            <svg width="28" height="10" aria-hidden>
              <line x1="0" y1="5" x2="28" y2="5" stroke="rgba(135, 100, 184, 0.6)" strokeWidth={3} />
            </svg>
            Werkte inhoudelijk aan (dikte = aantal wijzigingen)
          </div>
        </>
      )}
    </div>
  )
}
