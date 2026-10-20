import { useEffect, useMemo, useState } from 'react'
import { libraryItems } from '../library'
import { contactsForQuery, topicForQuery } from '../people/model'
import { usePeopleData } from '../people/store'
import type { ViewProps } from '../types'
import { buildTopics, topicForQuestion } from './askme/askmeData'
import { GraphMapperTimeline } from './graphmapper/GraphMapperView'
import { PeopleOverview } from './people/PeopleOverview'
import { TopicSummary } from './people/TopicSummary'

const fileById = new Map(libraryItems.filter((f) => f.document).map((f) => [f.id, f]))

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
              <GraphMapperTimeline key={`timeline-${topic.id}`} topicId={topic.id} onOpenFile={openDoc} />
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
