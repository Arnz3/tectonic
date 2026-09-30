// D3 timeline: one card per document, in horizontal lanes per source.
// React passes a topic and the expanded bundles; clicks go back through callbacks.
import * as d3 from 'd3'
import { LANES, TRUST, type DocGroup, type Lane, type TimelineDoc, type Topic } from './askmeData'

const M = { left: 196, top: 44, bottom: 56, pad: 18, rowH: 64, cardH: 52 }
const ICON_R = 17
const CARD_L = 27 // card left edge → icon centre (the icon sits on the date)
const GROUP_GAP = 28 // space between cards of an expanded bundle
const FONT_TITLE = "600 13.5px 'Segoe UI', system-ui, sans-serif"
const FONT_SUB = "400 12.5px 'Segoe UI', system-ui, sans-serif"
const GLYPH = 'M-4.5 -6.5h5.5l3.5 3.5v9.5h-9z M1 -6.5v3.5h3.5 M-2 0.5h4 M-2 3h4'

export interface TimelineCallbacks {
  onOpenDoc: (id: string) => void
  onToggleGroup: (id: string) => void
}

interface Card {
  isLead: boolean
  hidden: boolean
  open: boolean
  chevron: boolean
  title: string
  sub: string
  width: number
  badge: number
}

interface Placed extends TimelineDoc {
  card: Card
  tx: number
  ty: number
  left: number
  right: number
  row: number
}

interface LaneBox {
  lane: Lane
  y0: number
  h: number
  items: Placed[]
  total: number
}

const shortDate = new Intl.DateTimeFormat('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric' })
const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export function createTimeline(opts: {
  stage: HTMLDivElement
  svgEl: SVGSVGElement
  tip: HTMLDivElement
  callbacks: { current: TimelineCallbacks }
}) {
  const { stage, svgEl, tip, callbacks } = opts
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const svg = d3.select(svgEl)
  svg.selectAll('*').remove()
  svg
    .append('defs')
    .append('marker')
    .attr('id', 'askme-arrow')
    .attr('viewBox', '0 0 10 10')
    .attr('refX', 8)
    .attr('refY', 5)
    .attr('markerWidth', 9)
    .attr('markerHeight', 9)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0 0L10 5L0 10z')
    .attr('fill', TRUST.best.color)
  const gBg = svg.append('g').style('opacity', 0)
  const gLanes = gBg.append('g')
  const gAxis = gBg.append('g')
  const gMarks = gBg.append('g')
  const gConn = svg.append('g')
  const gCards = svg.append('g')

  const ctx = document.createElement('canvas').getContext('2d')!
  const textWidth = (s: string, font: string) => {
    ctx.font = font
    return ctx.measureText(s).width
  }

  let W = 900 // visible width
  let VW = 900 // drawing width; wider than W when an open bundle does not fit
  let H = 400
  let x = d3.scaleTime()
  let today = new Date()
  let boxes: LaneBox[] = []
  let docs: Placed[] = []
  let byId = new Map<string, Placed>()
  let groups: Record<string, DocGroup> = {}
  let expanded: Record<string, boolean> = {}
  let lanes: Lane[] = []

  const groupOf = (d: TimelineDoc) => (d.group ? groups[d.group] : undefined)
  const leadOf = (g: DocGroup) => g.members[g.members.length - 1] // the newest document stands for the bundle

  function cardFor(d: TimelineDoc): Card {
    const g = groupOf(d)
    const open = !!(g && expanded[g.id])
    const isLead = !!g && !open && d.id === leadOf(g)
    const hidden = !!g && !open && !isLead
    const title = trunc(d.title, 34)
    let sub = d.sub
    if (isLead) {
      const n = g!.members.length - 1
      sub = n === 1 ? '1 gelijkaardig document' : `${n} gelijkaardige documenten`
    } else if (open) {
      // Cards of an open bundle sit next to each other, not on their date, so show the date.
      sub = `${shortDate.format(d.date)} · ${d.sub}`
    }
    sub = trunc(sub, 44)
    const chevron = !!g && d.id === leadOf(g)
    const width = CARD_L + 26 + Math.max(textWidth(title, FONT_TITLE), textWidth(sub, FONT_SUB)) + 16 + (chevron ? 22 : 0)
    return { isLead, hidden, open, chevron, title, sub, width, badge: isLead ? g!.members.length - 1 : 0 }
  }

  // Measured on the scroll container, because the stage itself grows when a bundle does not fit.
  const availableWidth = () => Math.max(640, (stage.parentElement ?? stage).clientWidth)

  /* ---------- layout ---------- */
  function compute() {
    W = availableWidth()
    docs.forEach((d) => (d.card = cardFor(d)))
    const years = docs.map((d) => d.date.getFullYear())
    const y0 = Math.min(...years)
    const y1 = Math.max(...years, today.getFullYear())
    const domain: [Date, Date] = [new Date(y0, 0, 1), new Date(y1 + 1, 0, 1)]

    // Pick the right margin so the last cards still fit.
    let marginR = 40
    for (let pass = 0; pass < 5; pass++) {
      x = d3.scaleTime().domain(domain).range([M.left + 34, W - marginR])
      let over = 0
      for (const d of docs) {
        if (d.card.hidden || (d.card.open && d.id !== leadOf(groupOf(d)!))) continue
        over = Math.max(over, x(d.date) - CARD_L + d.card.width - (W - 14))
      }
      if (over <= 0.5) break
      marginR += over + 2
    }

    let y = M.top
    boxes = lanes.map((lane) => {
      const items = docs.filter((d) => d.lane === lane.id && !d.card.hidden)
      // Each unit gets one row: a single card, or an open bundle as a horizontal run.
      const units: { occ: number; right: number; docs: Placed[] }[] = []
      for (const d of items.filter((i) => !i.card.open)) {
        d.tx = x(d.date)
        d.left = d.tx - CARD_L
        d.right = d.left + d.card.width
        // A collapsed bundle also keeps the line back to its oldest document free.
        const occ = d.card.isLead ? Math.min(d.left, x(byId.get(groupOf(d)!.members[0])!.date) - 8) : d.left
        units.push({ occ, right: d.right, docs: [d] })
      }
      for (const g of Object.values(groups).filter((gr) => gr.lane === lane.id && expanded[gr.id])) {
        // The newest card stays put; older ones slide out to its left.
        const ms = g.members.map((id) => byId.get(id)!)
        const last = ms[ms.length - 1]
        let right = x(last.date) - CARD_L + last.card.width
        for (let k = ms.length - 1; k >= 0; k--) {
          ms[k].right = right
          ms[k].left = right - ms[k].card.width
          right = ms[k].left - GROUP_GAP
        }
        // Keep the run inside the lanes: move right if it starts too far left, else left if it sticks out.
        let shift = Math.max(0, M.left + 12 - ms[0].left)
        if (shift === 0) {
          const over = ms[ms.length - 1].right - (W - 14)
          if (over > 0) shift = -Math.min(over, ms[0].left - (M.left + 12))
        }
        ms.forEach((m) => {
          m.left += shift
          m.right += shift
          m.tx = m.left + CARD_L
        })
        units.push({ occ: ms[0].left, right: ms[ms.length - 1].right, docs: ms })
      }
      units.sort((a, b) => a.occ - b.occ)
      const rows: number[] = []
      for (const u of units) {
        let r = rows.findIndex((end) => end + 18 <= u.occ)
        if (r < 0) {
          r = rows.length
          rows.push(0)
        }
        rows[r] = u.right
        u.docs.forEach((d) => (d.row = r))
      }
      const h = M.pad * 2 + M.cardH + (Math.max(1, rows.length) - 1) * M.rowH
      items.forEach((d) => (d.ty = y + M.pad + M.cardH / 2 + d.row * M.rowH))
      const box: LaneBox = { lane, y0: y, h, items, total: docs.filter((d) => d.lane === lane.id).length }
      y += h
      return box
    })
    for (const d of docs.filter((i) => i.card.hidden)) {
      const lead = byId.get(leadOf(groupOf(d)!))!
      d.tx = lead.tx
      d.ty = lead.ty
      d.left = lead.left
      d.right = lead.right
    }
    H = y + M.bottom
    VW = Math.max(W, Math.max(...docs.filter((d) => !d.card.hidden).map((d) => d.right)) + 14)
    stage.style.height = `${H}px`
    stage.style.width = VW > W ? `${VW}px` : ''
    svg.attr('viewBox', `0 0 ${VW} ${H}`)
  }

  /* ---------- background: lanes, years, today ---------- */
  function drawBackground(dur: number) {
    const bottom = H - M.bottom
    const t = () => d3.transition().duration(dur).ease(d3.easeCubicInOut)

    const lanesSel = gLanes
      .selectAll<SVGGElement, LaneBox>('g.askme-lane')
      .data(boxes, (d) => d.lane.id)
      .join((enter) => {
        const g = enter.append('g').attr('class', 'askme-lane').attr('transform', (d) => `translate(0,${d.y0})`)
        g.append('rect').attr('class', (_d, i) => `askme-lane-bg${i % 2 ? '' : ' alt'}`).attr('height', (d) => d.h)
        g.append('line').attr('class', 'askme-lane-sep').attr('x1', 0).attr('y1', (d) => d.h).attr('y2', (d) => d.h)
        g.append('circle').attr('class', 'askme-lane-dot').attr('cx', 28).attr('r', 7).attr('cy', (d) => d.h / 2 - 8).attr('fill', (d) => d.lane.color)
        g.append('text').attr('class', 'askme-lane-name').attr('x', 46).attr('y', (d) => d.h / 2 - 2).text((d) => d.lane.label)
        g.append('text').attr('class', 'askme-lane-count').attr('x', 46).attr('y', (d) => d.h / 2 + 18)
        g.append('text').attr('class', 'askme-lane-none').attr('x', 46).attr('y', (d) => d.h / 2 + 36)
        return g
      })
    lanesSel.transition(t()).attr('transform', (d) => `translate(0,${d.y0})`)
    lanesSel.select('.askme-lane-bg').attr('width', VW).transition(t()).attr('height', (d) => d.h)
    lanesSel.select('.askme-lane-sep').attr('x2', VW).transition(t()).attr('y1', (d) => d.h).attr('y2', (d) => d.h)
    lanesSel.select('.askme-lane-dot').transition(t()).attr('cy', (d) => d.h / 2 - 8)
    lanesSel.select('.askme-lane-name').transition(t()).attr('y', (d) => d.h / 2 - 2)
    lanesSel.select('.askme-lane-count').text((d) => `${d.total} ${d.total === 1 ? 'bron' : 'bronnen'}`).transition(t()).attr('y', (d) => d.h / 2 + 18)
    lanesSel
      .select('.askme-lane-none')
      .text((d) => (d.total > 0 && !docs.some((r) => r.lane === d.lane.id && r.trust === 'best') ? 'Geen betrouwbare bron' : ''))
      .transition(t())
      .attr('y', (d) => d.h / 2 + 36)

    const [start, end] = x.domain()
    const years = d3.range(start.getFullYear(), end.getFullYear())
    const xy = (y: number) => x(new Date(y, 0, 1))
    gAxis
      .selectAll<SVGLineElement, number>('line.askme-grid')
      .data(years)
      .join('line')
      .attr('class', 'askme-grid')
      .attr('x1', xy)
      .attr('x2', xy)
      .attr('y1', M.top)
      .transition(t())
      .attr('y2', bottom)
    gAxis
      .selectAll<SVGTextElement, number>('text.askme-year')
      .data(years)
      .join('text')
      .attr('class', 'askme-year')
      .attr('text-anchor', 'middle')
      .attr('x', xy)
      .text((y) => String(y))
      .transition(t())
      .attr('y', bottom + 30)
    gAxis
      .selectAll<SVGLineElement, number>('line.askme-base')
      .data([0])
      .join('line')
      .attr('class', 'askme-base')
      .attr('x1', M.left)
      .attr('x2', VW)
      .transition(t())
      .attr('y1', bottom)
      .attr('y2', bottom)

    const xt = x(today)
    gMarks
      .selectAll<SVGLineElement, number>('line.askme-today')
      .data([0])
      .join('line')
      .attr('class', 'askme-today')
      .attr('x1', xt)
      .attr('x2', xt)
      .attr('y1', M.top - 14)
      .transition(t())
      .attr('y2', bottom)
    gMarks
      .selectAll<SVGTextElement, number>('text.askme-today-t')
      .data([0])
      .join('text')
      .attr('class', 'askme-today-t')
      .attr('x', xt)
      .attr('y', M.top - 22)
      .attr('text-anchor', 'middle')
      .text('Vandaag')
  }

  /* ---------- connectors ---------- */
  function elbow(a: Placed, b: Placed): string {
    if (Math.abs(a.ty - b.ty) < 1 && b.left > a.right) return `M${a.right + 2},${a.ty}H${b.left - 2}`
    if (b.left > a.right + 24) {
      const mx = (a.right + b.left) / 2
      return `M${a.right + 2},${a.ty}H${mx}V${b.ty}H${b.left - 2}`
    }
    const down = b.ty > a.ty ? 1 : -1
    const sx = Math.min(a.tx, b.left - 16)
    return `M${sx},${a.ty + down * (M.cardH / 2)}V${b.ty - down * 10}Q${sx},${b.ty} ${sx + 10},${b.ty}H${b.left - 2}`
  }

  function drawConnectors(delay: number) {
    gConn.selectAll('*').interrupt().remove()
    const g = gConn.append('g').style('opacity', 0)
    const xt = x(today)

    // Older document → the recommended document that replaces it.
    for (const d of docs) {
      const target = d.replacedBy ? byId.get(d.replacedBy) : undefined
      if (!target || (d.card.hidden && !d.card.isLead)) continue
      g.append('path').attr('class', 'askme-conn red').attr('d', elbow(d, target))
      g.append('circle').attr('class', 'askme-dot red').attr('cx', d.right + 2).attr('cy', d.ty).attr('r', 4.5)
    }

    // Recommended: arrow up to today, or up to the next card on the same row.
    for (const box of boxes) {
      for (const d of box.items.filter((i) => i.trust === 'best')) {
        const next = box.items.filter((o) => o.row === d.row && o.left > d.right).sort((a, b) => a.left - b.left)[0]
        const end = Math.min(next ? next.left - 8 : Infinity, xt - 8)
        if (end - d.right > 40) {
          g.append('line')
            .attr('class', 'askme-conn green')
            .attr('x1', d.right + 4)
            .attr('x2', end)
            .attr('y1', d.ty)
            .attr('y2', d.ty)
            .attr('marker-end', 'url(#askme-arrow)')
        }
      }
    }

    // Bundles of similar documents.
    for (const gr of Object.values(groups)) {
      const ms = gr.members.map((id) => byId.get(id)!)
      if (!expanded[gr.id]) {
        const lead = byId.get(leadOf(gr))!
        const x0 = x(ms[0].date)
        if (lead.left - x0 > 12) {
          g.append('path').attr('class', 'askme-conn orange').attr('d', `M${x0},${lead.ty}H${lead.left - 2}`)
          g.append('circle').attr('class', 'askme-dot orange').attr('cx', x0).attr('cy', lead.ty).attr('r', 5)
        }
      } else {
        for (let k = 1; k < ms.length; k++) g.append('path').attr('class', 'askme-conn orange').attr('d', elbow(ms[k - 1], ms[k]))
      }
    }

    g.transition().delay(delay).duration(reduced ? 0 : 350).style('opacity', 1)
  }

  /* ---------- cards ---------- */
  function drawCards(dur: number, delay: (d: Placed) => number = () => 0, entering = false) {
    const cards = gCards
      .selectAll<SVGGElement, Placed>('g.askme-card')
      .data(docs, (d) => d.id)
      .join((enter) => {
        const g = enter
          .append('g')
          .attr('class', 'askme-card')
          .attr('tabindex', 0)
          .attr('role', 'button')
          .attr('aria-label', (d) => d.title)
          .attr('transform', (d) => `translate(${d.tx - 40},${d.ty})`)
          .style('opacity', 0)
        g.append('rect').attr('class', 'askme-card-bg').attr('x', -CARD_L).attr('y', -M.cardH / 2).attr('height', M.cardH).attr('rx', 12)
        g.append('circle').attr('class', 'askme-icon').attr('r', ICON_R)
        g.append('path').attr('class', 'askme-glyph').attr('d', GLYPH)
        g.append('text').attr('class', 'askme-title').attr('x', 26).attr('y', -4)
        g.append('text').attr('class', 'askme-sub').attr('x', 26).attr('y', 14)
        const badge = g.append('g').attr('class', 'askme-badge').attr('transform', 'translate(13,-17)')
        badge.append('circle').attr('r', 11)
        badge.append('text').attr('text-anchor', 'middle').attr('dy', '0.35em')
        const chev = g.append('g').attr('class', 'askme-chev')
        chev.append('rect').attr('x', -12).attr('y', -14).attr('width', 24).attr('height', 28).attr('fill', 'transparent')
        chev.append('path').attr('d', 'M-2.5 -5.5L3 0L-2.5 5.5')
        chev.on('click', (e: MouseEvent, d) => {
          e.stopPropagation()
          if (d.group) callbacks.current.onToggleGroup(d.group)
        })
        g.on('click', (_e: MouseEvent, d) => onCard(d))
          .on('keydown', (e: KeyboardEvent, d) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onCard(d)
            }
          })
          .on('mouseenter', (e: MouseEvent, d) => showTip(e, d))
          .on('mousemove', moveTip)
          .on('mouseleave', hideTip)
        return g
      })

    cards.style('pointer-events', (d) => (d.card.hidden ? 'none' : null))
    // A bundle (card with +N) gets a dashed border.
    cards.select('.askme-card-bg').attr('class', (d) => `askme-card-bg t-${d.trust}${d.card.isLead ? ' bundle' : ''}`)
    cards.select('.askme-icon').attr('fill', (d) => TRUST[d.trust].color)
    cards.select('.askme-title').text((d) => d.card.title).classed('muted', (d) => d.trust === 'other_scope')
    cards.select('.askme-sub').text((d) => d.card.sub)
    cards.select('.askme-badge text').text((d) => `+${d.card.badge}`)
    cards.select<SVGGElement>('.askme-chev').style('display', (d) => (d.card.chevron ? null : 'none'))

    const ease = entering ? d3.easeCubicOut : d3.easeCubicInOut
    cards
      .transition()
      .delay(delay)
      .duration(dur)
      .ease(ease)
      .attr('transform', (d) => `translate(${d.tx},${d.ty})`)
      .style('opacity', (d) => (d.card.hidden ? 0 : 1))
    cards.select('.askme-card-bg').transition().delay(delay).duration(dur).ease(ease).attr('width', (d) => d.card.width)
    cards.select('.askme-badge').transition().delay(delay).duration(dur).style('opacity', (d) => (d.card.badge ? 1 : 0))
    cards
      .select('.askme-chev')
      .transition()
      .delay(delay)
      .duration(dur)
      .attr('transform', (d) => `translate(${d.card.width - CARD_L - 18},0) rotate(${d.card.open ? -90 : 0})`)
    // The card that stands for a collapsed bundle lies on top.
    for (const g of Object.values(groups)) cards.filter((d) => d.id === leadOf(g)).raise()
  }

  function onCard(d: Placed) {
    hideTip()
    if (d.card.isLead && d.group) callbacks.current.onToggleGroup(d.group)
    else callbacks.current.onOpenDoc(d.id)
  }

  /* ---------- tooltip (plain text only) ---------- */
  function showTip(e: MouseEvent, d: Placed) {
    const lines = [...d.tooltip]
    lines.push(d.card.isLead ? `Klik om de ${d.card.badge + 1} gelijkaardige documenten te bekijken` : TRUST[d.trust].label)
    tip.replaceChildren(
      ...lines.map((line, i) => {
        const row = document.createElement('div')
        row.textContent = line
        if (i === 0) row.className = 'askme-tip-title'
        return row
      }),
    )
    tip.style.opacity = '1'
    moveTip(e)
  }
  function moveTip(e: MouseEvent) {
    const r = stage.getBoundingClientRect()
    let left = e.clientX - r.left + 14
    let top = e.clientY - r.top + 14
    if (left + tip.offsetWidth > r.width - 8) left = e.clientX - r.left - tip.offsetWidth - 14
    if (top + tip.offsetHeight > r.height - 8) top = e.clientY - r.top - tip.offsetHeight - 14
    tip.style.left = `${left}px`
    tip.style.top = `${top}px`
  }
  function hideTip() {
    tip.style.opacity = '0'
  }

  /* ---------- resize ---------- */
  let resizeTimer: number | undefined
  const ro = new ResizeObserver(() => {
    window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(() => {
      if (docs.length === 0 || availableWidth() === W) return
      compute()
      drawBackground(0)
      drawCards(0)
      drawConnectors(0)
    }, 120)
  })
  ro.observe(stage.parentElement ?? stage)

  return {
    render(topic: Topic, now: Date) {
      today = now
      expanded = {}
      groups = topic.groups
      docs = topic.docs.map((d) => ({ ...d, card: cardFor(d), tx: 0, ty: 0, left: 0, right: 0, row: 0 }))
      byId = new Map(docs.map((d) => [d.id, d]))
      lanes = LANES.filter((l) => docs.some((d) => d.lane === l.id))
      gCards.selectAll('*').remove()
      gConn.selectAll('*').remove()
      compute()
      drawBackground(0)
      gBg.style('opacity', 0).transition().duration(reduced ? 0 : 400).style('opacity', 1)
      // Cards slide in chronologically.
      const order = [...docs].sort((a, b) => a.date.getTime() - b.date.getTime()).map((d) => d.id)
      const step = reduced ? 0 : 45
      const dur = reduced ? 0 : 600
      drawCards(dur, (d) => 150 + order.indexOf(d.id) * step, true)
      drawConnectors(150 + order.length * step + dur * 0.6)
    },
    setExpanded(next: Record<string, boolean>) {
      const changed = Object.keys(groups).some((id) => !!expanded[id] !== !!next[id])
      expanded = { ...next }
      if (!changed || docs.length === 0) return
      const dur = reduced ? 0 : 650
      compute()
      drawBackground(dur)
      drawCards(dur)
      drawConnectors(dur)
    },
    destroy() {
      ro.disconnect()
      window.clearTimeout(resizeTimer)
      stage.style.height = ''
      stage.style.width = ''
      svg.selectAll('*').interrupt().remove()
    },
  }
}
