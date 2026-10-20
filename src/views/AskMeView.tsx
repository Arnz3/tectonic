import { useEffect, useMemo, useRef, useState } from 'react'
import { libraryItems } from '../library'
import { contactsForQuery, topicForQuery } from '../people/model'
import { usePeopleData } from '../people/store'
import type { ViewProps } from '../types'
import { buildTopics, topicForQuestion, TRUST, type Topic, type Trust } from './askme/askmeData'
import { createTimeline, type TimelineCallbacks } from './askme/timeline'
import { PeopleOverview } from './people/PeopleOverview'
import { TopicSummary } from './people/TopicSummary'
import { PeopleControls } from './people/WhoKnows'

const fileById = new Map(libraryItems.filter((f) => f.document).map((f) => [f.id, f]))
const LEGEND: Trust[] = ['best', 'similar', 'expired', 'support', 'other_scope']

/**
 * Graffify: a question in the search box opens its topic: first the best files and who knows most,
 * then (advanced) a timeline of which source to trust. Without files, contacts come from meetings
 * and Teams messages that mention the search words.
 */
export function AskMeView({ items, onOpen, query }: ViewProps) {
  const docs = useMemo(() => items.flatMap((i) => (i.document ? [i.document] : [])), [items])
  const topics = useMemo(() => buildTopics(docs), [docs])
  const { data: peopleData } = usePeopleData()

  // People topics know more synonyms ("wie kent de tankkaart?") and include topics without documents.
  const askedId = useMemo(
    () => topicForQuery(query, peopleData.topics)?.id ?? topicForQuestion(query, topics, docs)?.id ?? null,
    [query, peopleData.topics, topics, docs],
  )

  const topicId = askedId
  // Simple view first; "Hoe kom ik eraan?" opens the advanced view, optionally with one person opened.
  const [advanced, setAdvanced] = useState<{ person: string | null } | null>(null)
  useEffect(() => setAdvanced(null), [topicId])
  const topic = topics.find((t) => t.id === topicId)
  const peopleTopic = peopleData.topics.find((t) => t.id === topicId)
  const title = topic?.title ?? peopleTopic?.label

  const openDoc = (id: string) => {
    const file = fileById.get(id)
    if (file) onOpen(file)
  }

  return (
    <div className="askme">
      <div className="askme-bar">
        {title ? (
          <>
            <strong>{title}</strong>
            <span className="askme-hint">{advanced ? 'Alle bronnen en personen.' : 'De beste bestanden en wie het meest weet.'}</span>
          </>
        ) : query ? (
          <span className="askme-hint">Geen bestanden gevonden voor deze zoekterm.</span>
        ) : null}
        <span className="askme-controls">
          <PeopleControls topicId={topicId} />
        </span>
      </div>

      {!query ? (
        <div className="search-prompt" role="status">
          <strong>Geef een zoekterm in.</strong>
          <span>Bijvoorbeeld "wie kent de tankkaart?" of "maaltijdcheques". Je krijgt de beste bestanden en wie er het meest over weet.</span>
        </div>
      ) : !title ? (
        <QueryContacts key={`query-${query}`} query={query} />
      ) : !advanced ? (
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
      ) : null}
    </div>
  )
}

/** No files: possible contacts from meetings and Teams messages that mention the search words. */
function QueryContacts({ query }: { query: string }) {
  const { data, rejected } = usePeopleData()
  const found = contactsForQuery(query, data, rejected).length > 0
  return (
    <div className="topic-summary">
      <div className="summary-empty">
        {found
          ? 'Geen bestanden gevonden. Deze mensen spraken er wel over in meetings of Teams:'
          : 'Geen bestanden gevonden, en ook in meetings en Teams sprak niemand hierover. Probeer een andere zoekterm.'}
      </div>
      {found && <PeopleOverview query={query} heading="Mogelijke contactpersonen" />}
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
