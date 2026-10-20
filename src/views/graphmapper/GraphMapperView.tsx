import { useEffect, useMemo, useRef, useState } from 'react'
import { allDocuments } from './meetings'
import type { ViewProps } from '../../types'
import type { GmDocument as Document } from './types'
import { buildTopics, topicForQuestion, TRUST, type Topic, type Trust } from './data'
import { DocPanel } from './DocPanel'
import { GroupPopover } from './GroupPopover'
import { MeetingChangePanel } from './MeetingChangePanel'
import { createTimeline, type CardAnchor, type TimelineCallbacks } from './timeline'
import './graphmapper.css'

const LEGEND: Trust[] = ['meeting', 'best', 'similar', 'expired', 'support', 'other_scope']
const DEFAULT_TOPIC = 'ecocheques'

const topics = buildTopics(allDocuments)
const docById = new Map(allDocuments.map((d) => [d.id, d]))

/**
 * Graph mapper: the trust timeline for one topic. Pick a topic, or type a question in the search box.
 * Purple cards are changes from meetings that a person verified; they overrule a sentence in a document.
 */
export function GraphMapperView({ query }: ViewProps) {
  const [picked, setPicked] = useState(() => (topics.some((t) => t.id === DEFAULT_TOPIC) ? DEFAULT_TOPIC : topics[0].id))
  const [change, setChange] = useState<Document | null>(null)
  const [doc, setDoc] = useState<Document | null>(null)
  const asked = useMemo(() => topicForQuestion(query, topics, allDocuments), [query])
  const topic = asked ?? topics.find((t) => t.id === picked)!

  const openDoc = (id: string) => {
    const found = docById.get(id)
    if (!found) return
    setDoc(found.meeting ? null : found)
    setChange(found.meeting ? found : null)
  }

  return (
    <div className="gm gm-view">
      <div className="gm-topic-pills" role="tablist" aria-label="Onderwerp">
        {topics.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={t.id === topic.id}
            className={t.id === topic.id ? 'active' : ''}
            onClick={() => setPicked(t.id)}
          >
            {t.title}
          </button>
        ))}
      </div>
      <Timeline key={topic.id} topic={topic} onOpenDoc={openDoc} />
      {change && <MeetingChangePanel doc={change} onOpenDoc={openDoc} onClose={() => setChange(null)} />}
      {doc && <DocPanel doc={doc} onClose={() => setDoc(null)} />}
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
            <span className="gm-legend-dot" style={{ background: TRUST[k].color }} aria-hidden />
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
