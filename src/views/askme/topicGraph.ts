// D3 graph: the library in the centre, its topics around it. Clicking a topic opens its timeline.
import * as d3 from 'd3'
import type { Topic } from './askmeData'

const HEIGHT = 560
const LIBRARY_GLYPH = 'M-9 -6h6l2 2.5h10v10h-18z M-9 -1.5h18'

interface GraphNode extends d3.SimulationNodeDatum {
  id: string
  kind: 'center' | 'topic'
  title: string
  color: string
  count: number
  r: number
}

export function createTopicGraph(opts: {
  stage: HTMLDivElement
  svgEl: SVGSVGElement
  tip: HTMLDivElement
  centerTitle: string
  topics: Topic[]
  callbacks: { current: { onOpenTopic: (id: string) => void } }
}) {
  const { stage, svgEl, tip, centerTitle, topics, callbacks } = opts
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const svg = d3.select(svgEl)
  svg.selectAll('*').remove()
  const gLinks = svg.append('g')
  const gNodes = svg.append('g')
  let W = Math.max(320, stage.clientWidth)
  let opening = false
  stage.style.height = `${HEIGHT}px`
  svg.attr('viewBox', `0 0 ${W} ${HEIGHT}`)

  const nodes: GraphNode[] = [
    { id: '__center', kind: 'center', title: centerTitle, color: '#03787c', count: 0, r: 44, x: W / 2, y: HEIGHT / 2, fx: W / 2, fy: HEIGHT / 2 },
    ...topics.map((t, i): GraphNode => {
      const a = (i / topics.length) * Math.PI * 2
      return {
        id: t.id,
        kind: 'topic',
        title: t.title,
        color: t.color,
        count: t.docs.length,
        r: 28 + Math.sqrt(t.docs.length) * 7,
        x: W / 2 + Math.cos(a) * 20,
        y: HEIGHT / 2 + Math.sin(a) * 20,
      }
    }),
  ]
  const links: d3.SimulationLinkDatum<GraphNode>[] = topics.map((t) => ({ source: '__center', target: t.id }))

  const linkSel = gLinks.selectAll('line').data(links).join('line').attr('class', 'askme-link')
  const nodeSel = gNodes
    .selectAll<SVGGElement, GraphNode>('g')
    .data(nodes, (d) => d.id)
    .join((enter) => {
      const g = enter.append('g').attr('class', (d) => `askme-node askme-${d.kind}`)
      g.append('circle')
        .attr('class', 'askme-bubble')
        .attr('r', 0)
        .attr('fill', (d) => (d.kind === 'center' ? d.color : d3.color(d.color)!.copy({ opacity: 0.13 }).formatRgb()))
        .attr('stroke', (d) => (d.kind === 'center' ? 'none' : d.color))
      g.filter((d) => d.kind === 'center').append('path').attr('class', 'askme-center-glyph').attr('d', LIBRARY_GLYPH)
      g.filter((d) => d.kind === 'topic')
        .append('text')
        .attr('class', 'askme-count')
        .attr('dy', '0.35em')
        .attr('fill', (d) => d.color)
        .text((d) => String(d.count))
      g.append('text').attr('class', 'askme-node-label').attr('y', (d) => d.r + 22).text((d) => d.title)
      g.filter((d) => d.kind === 'topic')
        .append('text')
        .attr('class', 'askme-node-sub')
        .attr('y', (d) => d.r + 40)
        .text((d) => (d.count === 1 ? 'document' : 'documenten'))
      return g
    })

  nodeSel
    .filter((d) => d.kind === 'topic')
    .attr('tabindex', 0)
    .attr('role', 'button')
    .attr('aria-label', (d) => `${d.title}: ${d.count} documenten. Open de tijdlijn.`)

  nodeSel
    .select<SVGCircleElement>('.askme-bubble')
    .transition()
    .duration(reduced ? 0 : 600)
    .delay((_d, i) => (reduced ? 0 : i * 70))
    .ease(d3.easeBackOut.overshoot(1.4))
    .attr('r', (d) => d.r)

  nodeSel
    .filter((d) => d.kind === 'topic')
    .on('mouseenter', function (e: MouseEvent, d) {
      d3.select(this).select('.askme-bubble').transition().duration(150).attr('r', d.r + 5)
      const title = document.createElement('div')
      title.className = 'askme-tip-title'
      title.textContent = d.title
      const sub = document.createElement('div')
      sub.textContent = `${d.count} documenten · klik om de tijdlijn te openen`
      tip.replaceChildren(title, sub)
      tip.style.opacity = '1'
      moveTip(e)
    })
    .on('mousemove', moveTip)
    .on('mouseleave', function (_e: MouseEvent, d) {
      d3.select(this).select('.askme-bubble').transition().duration(150).attr('r', d.r)
      tip.style.opacity = '0'
    })
    .on('click', (e: MouseEvent, d) => {
      if (!e.defaultPrevented) open(d)
    })
    .on('keydown', (e: KeyboardEvent, d) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        open(d)
      }
    })

  nodeSel.call(
    d3
      .drag<SVGGElement, GraphNode>()
      .filter((e: MouseEvent) => !opening && !e.button)
      .on('start', (e, d) => {
        if (!e.active) sim.alphaTarget(0.25).restart()
        d.fx = d.x
        d.fy = d.y
        tip.style.opacity = '0'
      })
      .on('drag', (e, d) => {
        d.fx = e.x
        d.fy = e.y
      })
      .on('end', (e, d) => {
        if (!e.active) sim.alphaTarget(0)
        if (d.kind !== 'center') {
          d.fx = null
          d.fy = null
        }
      }),
  )

  const sim = d3
    .forceSimulation(nodes)
    .force(
      'link',
      d3
        .forceLink<GraphNode, d3.SimulationLinkDatum<GraphNode>>(links)
        .id((d) => d.id)
        .distance((l) => 150 + (l.target as GraphNode).r)
        .strength(0.9),
    )
    .force('charge', d3.forceManyBody().strength(-900))
    .force('collide', d3.forceCollide<GraphNode>((d) => d.r + 40))
    .force('x', d3.forceX(W / 2).strength(0.03))
    .force('y', d3.forceY(HEIGHT / 2).strength(0.05))
    .on('tick', () => {
      for (const d of nodes) {
        d.x = Math.max(d.r + 10, Math.min(W - d.r - 10, d.x ?? 0))
        d.y = Math.max(d.r + 10, Math.min(HEIGHT - d.r - 48, d.y ?? 0))
      }
      linkSel
        .attr('x1', (d) => (d.source as GraphNode).x ?? 0)
        .attr('y1', (d) => (d.source as GraphNode).y ?? 0)
        .attr('x2', (d) => (d.target as GraphNode).x ?? 0)
        .attr('y2', (d) => (d.target as GraphNode).y ?? 0)
      nodeSel.attr('transform', (d) => `translate(${d.x},${d.y})`)
    })

  // Click: the topic grows, the rest fades, then the timeline opens.
  function open(d: GraphNode) {
    if (opening) return
    opening = true
    tip.style.opacity = '0'
    sim.stop()
    const dur = reduced ? 0 : 380
    nodeSel.filter((n) => n.id !== d.id).transition().duration(dur).style('opacity', 0.08)
    linkSel.transition().duration(dur).style('opacity', 0)
    nodeSel
      .filter((n) => n.id === d.id)
      .select('.askme-bubble')
      .transition()
      .duration(dur)
      .ease(d3.easeCubicIn)
      .attr('r', d.r * 2.2)
      .style('opacity', 0.35)
    window.setTimeout(() => callbacks.current.onOpenTopic(d.id), dur)
  }

  function moveTip(e: MouseEvent) {
    const r = stage.getBoundingClientRect()
    let left = e.clientX - r.left + 14
    if (left + tip.offsetWidth > r.width - 8) left = e.clientX - r.left - tip.offsetWidth - 14
    tip.style.left = `${left}px`
    tip.style.top = `${e.clientY - r.top + 14}px`
  }

  let resizeTimer: number | undefined
  const ro = new ResizeObserver(() => {
    window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(() => {
      const w = Math.max(320, stage.clientWidth)
      if (w === W) return
      W = w
      svg.attr('viewBox', `0 0 ${W} ${HEIGHT}`)
      nodes[0].fx = W / 2
      ;(sim.force('x') as d3.ForceX<GraphNode>).x(W / 2)
      sim.alpha(0.3).restart()
    }, 120)
  })
  ro.observe(stage)

  return {
    destroy() {
      sim.stop()
      ro.disconnect()
      window.clearTimeout(resizeTimer)
      stage.style.height = ''
      svg.selectAll('*').interrupt().remove()
    },
  }
}
