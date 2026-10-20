import { useEffect, useMemo, useRef, useState } from 'react'
import { libraryItems } from '../library'
import { topicForQuery } from '../people/model'
import { usePeopleData } from '../people/store'
import type { ViewProps } from '../types'
import { buildTopics, topicForQuestion, TRUST, type Topic, type Trust } from './askme/askmeData'
import { createTimeline, type TimelineCallbacks } from './askme/timeline'
import { createTopicGraph } from './askme/topicGraph'
import { PeopleOverview } from './people/PeopleOverview'
import { TopicSummary } from './people/TopicSummary'
import { PeopleControls } from './people/WhoKnows'

const fileById = new Map(libraryItems.filter((f) => f.document).map((f) => [f.id, f]))
const LEGEND: Trust[] = ['best', 'similar', 'expired', 'support', 'other_scope']

/**
 * Graffify: topics of the library as a graph. A topic (clicked, or recognised in a question typed
 * in the search box) shows who knows it ("Wie weet het?") and a timeline of which source to trust.
 */
export function AskMeView({ items, onOpen, query }: ViewProps) {
  const docs = useMemo(() => items.flatMap((i) => (i.document ? [i.document] : [])), [items])
  const topics = useMemo(() => buildTopics(docs), [docs])
  const { data: peopleData } = usePeopleData()
  const [picked, setPicked] = useState<string | null>(null)

  // People topics know more synonyms ("wie kent de tankkaart?") and include topics without documents.
  const askedId = useMemo(
    () => topicForQuery(query, peopleData.topics)?.id ?? topicForQuestion(query, topics, docs)?.id ?? null,
    [query, peopleData.topics, topics, docs],
  )

  // A new question starts from scratch.
  useEffect(() => setPicked(null), [query])

  const topicId = askedId ?? picked
  // Simple view first; "Hoe kom ik eraan?" opens the advanced view, optionally with one person opened.
  const [advanced, setAdvanced] = useState<{ person: string | null } | null>(null)
  useEffect(() => setAdvanced(null), [topicId])
  const asked = askedId !== null
  const topic = topics.find((t) => t.id === topicId)
  const peopleTopic = peopleData.topics.find((t) => t.id === topicId)
  const title = topic?.title ?? peopleTopic?.label

  if (docs.length === 0) return <div className="graph-empty">Geen documenten gevonden voor deze zoekopdracht.</div>

  const openDoc = (id: string) => {
    const file = fileById.get(id)
    if (file) onOpen(file)
  }

  return (
    <div className="askme">
      <div className="askme-bar">
        {title ? (
          <>
            {!asked && (
              <>
                <button className="askme-back" onClick={() => setPicked(null)}>
                  Alle onderwerpen
                </button>
                <span className="askme-sep">›</span>
              </>
            )}
            <strong>{title}</strong>
            <span className="askme-hint">
              {advanced ? 'Alle bronnen en personen.' : 'De beste bestanden en wie het meest weet.'}
              {asked && ' Maak de zoekbalk leeg om alle onderwerpen te zien.'}
            </span>
          </>
        ) : (
          <span className="askme-hint">
            {query
              ? 'Geen onderwerp herkend in je vraag. Kies hieronder een onderwerp.'
              : 'Klik op een onderwerp, of stel een vraag in de zoekbalk, bv. "wie kent de tankkaart?"'}
          </span>
        )}
        <span className="askme-controls">
          <PeopleControls topicId={topicId} />
        </span>
      </div>

      {title && !advanced ? (
        <TopicSummary
          key={`summary-${topicId}`}
          topic={topic}
          peopleTopic={peopleTopic}
          onOpenDoc={openDoc}
          onAdvanced={(person) => setAdvanced({ person: person ?? null })}
        />
      ) : title ? (
        <>
          <button className="askme-back summary-back" onClick={() => setAdvanced(null)}>
            ← Terug naar de beste bestanden
          </button>
          <h3 className="people-heading">Documenten over dit onderwerp</h3>
          {topic ? (
            <>
              <span className="askme-hint">
                {topic.docs.length} {topic.docs.length === 1 ? 'bron' : 'bronnen'}, van oud naar nieuw. Klik op een kaartje om het document te
                openen.
              </span>
              <AskMeTimeline key={`timeline-${topic.id}`} topic={topic} onOpenDoc={openDoc} />
            </>
          ) : (
            <div className="graph-empty">Geen documenten over dit onderwerp: deze kennis zit alleen bij mensen.</div>
          )}
          {peopleTopic && <PeopleOverview key={`people-${peopleTopic.id}`} topic={peopleTopic} initialOpen={advanced?.person ?? null} />}
        </>
      ) : (
        <AskMeTopics key={topics.map((t) => t.id).join('|')} topics={topics} onOpenTopic={setPicked} />
      )}
    </div>
  )
}

function AskMeTopics({ topics, onOpenTopic }: { topics: Topic[]; onOpenTopic: (id: string) => void }) {
  const stageRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const callbacks = useRef({ onOpenTopic })
  callbacks.current = { onOpenTopic }

  useEffect(() => {
    const graph = createTopicGraph({
      stage: stageRef.current!,
      svgEl: svgRef.current!,
      tip: tipRef.current!,
      centerTitle: 'Documenten',
      topics,
      callbacks,
    })
    return () => graph.destroy()
  }, [topics])

  return (
    <div className="askme-stage-wrap">
      <div className="askme-stage" ref={stageRef}>
        <svg ref={svgRef} role="img" aria-label="Onderwerpen in deze bibliotheek" />
        <div className="askme-tip" ref={tipRef} />
      </div>
    </div>
  )
}

function AskMeTimeline({ topic, onOpenDoc }: { topic: Topic; onOpenDoc: (id: string) => void }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const stageRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<ReturnType<typeof createTimeline> | null>(null)
  const callbacks = useRef<TimelineCallbacks>({ onOpenDoc, onToggleGroup: () => {} })
  callbacks.current = { onOpenDoc, onToggleGroup: (id) => setExpanded((e) => ({ ...e, [id]: !e[id] })) }

  useEffect(() => {
    const timeline = createTimeline({ stage: stageRef.current!, svgEl: svgRef.current!, tip: tipRef.current!, callbacks })
    timelineRef.current = timeline
    timeline.render(topic, new Date())
    return () => {
      timeline.destroy()
      timelineRef.current = null
    }
  }, [topic])

  useEffect(() => {
    timelineRef.current?.setExpanded(expanded)
  }, [expanded])

  const used = new Set(topic.docs.map((d) => d.trust))
  return (
    <div className="askme-stage-wrap">
      <div className="askme-scroll">
        <div className="askme-stage askme-timeline" ref={stageRef}>
          <svg ref={svgRef} role="img" aria-label={`Tijdlijn ${topic.title}`} />
          <div className="askme-tip" ref={tipRef} />
        </div>
      </div>
      <div className="askme-legend">
        {LEGEND.filter((k) => used.has(k)).map((k) => (
          <span key={k}>
            <span className="askme-legend-icon" style={{ background: TRUST[k].color }} aria-hidden>
              <svg width="14" height="14" viewBox="-8 -8 16 16">
                <path d="M-4.5 -6.5h5.5l3.5 3.5v9.5h-9z M1 -6.5v3.5h3.5 M-2 0.5h4 M-2 3h4" />
              </svg>
            </span>
            {TRUST[k].label}
          </span>
        ))}
      </div>
    </div>
  )
}
