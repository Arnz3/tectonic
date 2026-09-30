import type { Document } from '../types'

/** Positions in vis-network coordinates for the "Tijdlijnweergave" (CLAUDE.md, section 12, M4c). */
export interface TimelineLayout {
  positions: Map<string, { x: number; y: number }>
  lanes: { label: string; top: number; bottom: number }[]
  ticks: { x: number; label: string }[]
  width: number
  axisY: number
}

const MIN_WIDTH = 600
const MAX_WIDTH = 4000
const WIDTH_STEP = 100
// Space outside the lanes' x range that fit() must also show: lane labels (left) and margin (right).
export const TIMELINE_MARGIN_X = 290
const TIMELINE_MARGIN_Y = 45
const SLOT_HEIGHT = 95 // vertical distance between stacked nodes in one lane
const MIN_GAP = 175 // nodes closer than this horizontally are stacked, so labels do not overlap
const LANE_TOP_PADDING = 55
const LANE_BOTTOM_PADDING = 75

const COUNTRY_ORDER: Document['country'][] = ['BE', 'NL', 'DE']
const COUNTRY_LABEL: Record<Document['country'], string> = { BE: 'België', NL: 'Nederland', DE: 'Duitsland' }

const tickFormat = new Intl.DateTimeFormat('nl-BE', { month: 'short', year: 'numeric' })

interface LaneItem {
  id: string
  x: number
}

type Extra = { label: string; items: { id: string; docIds: string[] }[] }

/**
 * x = linear scale of `modified` over the given documents, y = one lane per country.
 * Optional extra items (e.g. people) get their own lane at the bottom, at the mean x of their documents.
 *
 * A wider timeline needs fewer stacked rows but is zoomed out more. We pick the width at which the
 * whole timeline fits the viewport at the largest scale, so labels stay as legible as possible.
 */
export function timelineLayout(docs: Document[], viewport: { width: number; height: number }, extra?: Extra): TimelineLayout {
  let best: TimelineLayout | undefined
  let bestScale = 0
  for (let width = MIN_WIDTH; width <= MAX_WIDTH; width += WIDTH_STEP) {
    const layout = layoutWithWidth(docs, width, extra)
    const scale = Math.min(viewport.width / (width + TIMELINE_MARGIN_X), viewport.height / (layout.axisY + TIMELINE_MARGIN_Y))
    if (scale > bestScale + 1e-9) {
      best = layout
      bestScale = scale
    }
  }
  return best!
}

function layoutWithWidth(docs: Document[], width: number, extra?: Extra): TimelineLayout {
  const times = docs.map((d) => Date.parse(d.modified))
  const min = Math.min(...times)
  const max = Math.max(...times)
  const toX = (t: number) => (max === min ? width / 2 : ((t - min) / (max - min)) * width)
  const xOf = new Map(docs.map((d, i) => [d.id, toX(times[i])]))

  const groups: { label: string; items: LaneItem[] }[] = COUNTRY_ORDER.map((c) => ({
    label: COUNTRY_LABEL[c],
    items: docs.filter((d) => d.country === c).map((d) => ({ id: d.id, x: xOf.get(d.id)! })),
  }))
  if (extra && extra.items.length > 0) {
    groups.push({
      label: extra.label,
      items: extra.items.map((p) => {
        const xs = p.docIds.map((id) => xOf.get(id)).filter((x): x is number => x !== undefined)
        return { id: p.id, x: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : width / 2 }
      }),
    })
  }

  const positions = new Map<string, { x: number; y: number }>()
  const lanes: TimelineLayout['lanes'] = []
  let top = 0
  for (const group of groups.filter((g) => g.items.length > 0)) {
    const sorted = [...group.items].sort((a, b) => a.x - b.x || a.id.localeCompare(b.id))
    // Greedy stacking: put each node in the first row where it does not collide with the previous one.
    const rowLastX: number[] = []
    for (const item of sorted) {
      let row = rowLastX.findIndex((last) => item.x - last >= MIN_GAP)
      if (row === -1) {
        row = rowLastX.length
        rowLastX.push(item.x)
      } else {
        rowLastX[row] = item.x
      }
      positions.set(item.id, { x: item.x, y: top + LANE_TOP_PADDING + row * SLOT_HEIGHT })
    }
    const bottom = top + LANE_TOP_PADDING + (rowLastX.length - 1) * SLOT_HEIGHT + LANE_BOTTOM_PADDING
    lanes.push({ label: group.label, top, bottom })
    top = bottom
  }

  return { positions, lanes, ticks: dateTicks(min, max, toX), width, axisY: top }
}

function dateTicks(min: number, max: number, toX: (t: number) => number): TimelineLayout['ticks'] {
  if (!Number.isFinite(min)) return []
  if (min === max) return [{ x: toX(min), label: tickFormat.format(min) }]
  const months = (max - min) / (30.4 * 86_400_000)
  const step = months <= 14 ? 1 : months <= 42 ? 3 : 12
  const start = new Date(min)
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), Math.floor(start.getUTCMonth() / step) * step, 1))
  const ticks: TimelineLayout['ticks'] = []
  while (cursor.getTime() <= max) {
    if (cursor.getTime() >= min) ticks.push({ x: toX(cursor.getTime()), label: tickFormat.format(cursor) })
    cursor.setUTCMonth(cursor.getUTCMonth() + step)
  }
  return ticks
}
