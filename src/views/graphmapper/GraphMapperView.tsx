import { useEffect, useMemo, useRef, useState } from 'react'
import { allDocuments } from './meetings'
import type { ViewProps } from '../../types'
import type { GmDocument as Document } from './types'
import { buildTopics, topicForQuestion, TRUST, type Topic, type Trust } from './data'
import { libraryItems } from '../../library'
import { GroupPopover } from './GroupPopover'
import { MeetingChangePanel } from './MeetingChangePanel'
import { CHAT_GLYPH, createTimeline, DOC_GLYPH, type CardAnchor, type TimelineCallbacks } from './timeline'
import './graphmapper.css'

const LEGEND: Trust[] = ['meeting', 'best', 'similar', 'expired', 'support', 'other_scope']

const topics = buildTopics(allDocuments)
const docById = new Map(allDocuments.map((d) => [d.id, d]))
const fileById = new Map(libraryItems.filter((f) => f.document).map((f) => [f.id, f]))

/**
 * The graph mapper timeline for one topic, for use inside another view (Graffify's "Hoe kom ik eraan?").
 * Library documents open as the SharePoint file through `onOpenFile`; purple cards open the change.
 */
export function GraphMapperTimeline({ topicId, onOpenFile }: { topicId: string; onOpenFile: (id: string) => void }) {
  const [change, setChange] = useState<Document | null>(null)
  const topic = topics.find((t) => t.id === topicId)
  if (!topic) return null

  const openDoc = (id: string) => {
    const found = docById.get(id)
    if (!found) return
    if (found.meeting) return setChange(found)
    setChange(null)
    onOpenFile(id)
  }

  return (
    <div className="gm">
      <Timeline key={topic.id} topic={topic} onOpenDoc={openDoc} />
      {change && (
        <MeetingChangePanel
          doc={change}
          onOpenDoc={(id) => {
            setChange(null)
            onOpenFile(id)
          }}
          onClose={() => setChange(null)}
        />
      )}
    </div>
  )
}

/**
 * Graph mapper: the trust timeline for the topic typed in the search box.
 * Purple cards are changes from meetings that a person verified; they overrule a sentence in a document.
 */
export function GraphMapperView({ query, onOpen }: ViewProps) {
  const topic = useMemo(() => topicForQuestion(query, topics, allDocuments), [query])
  // Library documents open as the real SharePoint file, in the app's own document panel.
  const openFile = (id: string) => {
    const file = fileById.get(id)
    if (file) onOpen(file)
  }

  return (
    <div className="gm gm-view">
      {topic ? (
        <>
          <div className="gm-heading">
            <strong>{topic.title}</strong>
            <span>
              {topic.docs.length} {topic.docs.length === 1 ? 'bron' : 'bronnen'}
            </span>
          </div>
          <GraphMapperTimeline key={topic.id} topicId={topic.id} onOpenFile={openFile} />
        </>
      ) : (
        <div className="gm-empty">
          {query ? 'Geen onderwerp herkend. Probeer bv. maaltijdcheques of ecocheques.' : 'Zoek een onderwerp in de zoekbalk, bv. maaltijdcheques of ecocheques.'}
        </div>
      )}
    </div>
  )
}

function Timeline({ topic, onOpenDoc }: { topic: Topic; onOpenDoc: (id: string) => void }) {
  // An open bundle of copies is shown as a popover on top of the timeline, so nothing else moves.
  const [openGroup, setOpenGroup] = useState<{ id: string; rect: DOMRect } | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const callbacks = useRef<TimelineCallbacks>({ onOpenDoc, onOpenGroup: () => {} })
  callbacks.current = {
    onOpenDoc,
    onOpenGroup: (id: string, a: CardAnchor) => {
      const s = stageRef.current!.getBoundingClientRect()
      setOpenGroup({ id, rect: new DOMRect(s.left + a.left, s.top + a.top, a.width, a.bottom - a.top) })
    },
  }

  useEffect(() => {
    const timeline = createTimeline({ stage: stageRef.current!, svgEl: svgRef.current!, tip: tipRef.current!, callbacks })
    timeline.render(topic, new Date())
    return () => timeline.destroy()
  }, [topic])

  const used = new Set(topic.docs.map((d) => d.trust))
  const replaced = topic.docs.some((d) => d.replacedBy && !d.replacedBy.startsWith('meeting-'))
  const replacedInMeeting = topic.docs.some((d) => d.replacedBy?.startsWith('meeting-'))
  return (
    <div className="gm-stage-wrap">
      <div className="gm-scroll">
        <div className="gm-stage gm-timeline" ref={stageRef}>
          <svg ref={svgRef} role="img" aria-label={`Tijdlijn ${topic.title}`} />
          <div className="gm-tip" ref={tipRef} />
        </div>
      </div>
      {openGroup && topic.groups[openGroup.id] && (
        <GroupPopover
          topic={topic}
          groupId={openGroup.id}
          anchor={openGroup.rect}
          onOpenDoc={(id) => {
            setOpenGroup(null)
            onOpenDoc(id)
          }}
          onClose={() => setOpenGroup(null)}
        />
      )}
      <div className="gm-legend">
        {LEGEND.filter((k) => used.has(k)).map((k) => (
          <span key={k}>
            <span className="gm-legend-icon" style={{ background: TRUST[k].color }} aria-hidden>
              <svg width="14" height="14" viewBox="-8 -8 16 16">
                <path d={k === 'meeting' ? CHAT_GLYPH : DOC_GLYPH} />
              </svg>
            </span>
            {TRUST[k].label}
          </span>
        ))}
        <span>
          <span className="gm-legend-line green" aria-hidden />
          Geldt tot vandaag
        </span>
        {replaced && (
          <span>
            <span className="gm-legend-line red" aria-hidden />
            Vervangen door
          </span>
        )}
        {replacedInMeeting && (
          <span>
            <span className="gm-legend-line purple" aria-hidden />
            Vervangen in meeting
          </span>
        )}
      </div>
    </div>
  )
}
