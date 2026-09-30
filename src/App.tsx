import { useMemo, useState } from 'react'
import { primaryCluster, type AnalysisEdge } from './analysis'
import { EdgePanel } from './components/EdgePanel'
import { PersonPanel } from './components/PersonPanel'
import { PreviewPanel } from './components/PreviewPanel'
import { documents, libraryItems } from './library'
import { buildTopics, topicForQuestion } from './views/askme/askmeData'
import type { Document, FileItem, SortKey, SortState } from './types'
import { views } from './views'
import { isSearchGap, MAX_QUERY_LENGTH, useVoteSummaries } from './votes'

const byId = new Map(libraryItems.map((f) => [f.id, f]))

function matches(item: FileItem, q: string): boolean {
  const doc = item.document
  return (
    item.name.toLowerCase().includes(q) ||
    (doc !== undefined &&
      (doc.title.toLowerCase().includes(q) || doc.topic.toLowerCase().includes(q) || doc.text.toLowerCase().includes(q)))
  )
}

const allTopics = buildTopics(documents)

/** Plain search first; a question without literal matches shows the documents of its topic. */
function searchOrAsk(q: string): FileItem[] {
  const hits = libraryItems.filter((f) => matches(f, q))
  if (hits.length > 0) return hits
  const topic = topicForQuestion(q, allTopics, documents)
  return topic ? libraryItems.filter((f) => f.document?.topic === topic.id) : []
}

function ancestors(folderId: string | null): FileItem[] {
  const chain: FileItem[] = []
  let current = folderId ? byId.get(folderId) : undefined
  while (current) {
    chain.unshift(current)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return chain
}

function pathOf(item: FileItem): string {
  return ['Documenten', ...ancestors(item.parentId).map((f) => f.name)].join(' / ')
}

function compare(a: FileItem, b: FileItem, sort: SortState): number {
  // Folders always first, like SharePoint.
  if ((a.kind === 'folder') !== (b.kind === 'folder')) return a.kind === 'folder' ? -1 : 1
  const av = a[sort.key]
  const bv = b[sort.key]
  const result = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), 'nl')
  return sort.dir === 'asc' ? result : -result
}

function loadViewId(): string {
  try {
    return localStorage.getItem('viewId') ?? views[0].id
  } catch {
    return views[0].id
  }
}

export default function App() {
  const [folderId, setFolderId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [viewId, setViewId] = useState(loadViewId)
  const [sort, setSort] = useState<SortState>({ key: 'name', dir: 'asc' })
  const [panel, setPanel] = useState<
    | { kind: 'document'; doc: Document }
    | { kind: 'edge'; edge: AnalysisEdge }
    | { kind: 'person'; author: string; docIds: string[] }
    | null
  >(null)

  const view = views.find((v) => v.id === viewId) ?? views[0]
  const searching = query.trim().length > 0
  const libraryScope = view.scope === 'library'
  const questionMode = view.search === 'question'

  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    const source = q && !questionMode
      ? searchOrAsk(q)
      : libraryScope
        ? libraryItems.filter((f) => f.document)
        : libraryItems.filter((f) => f.parentId === folderId)
    return [...source].sort((a, b) => compare(a, b, sort))
  }, [folderId, query, sort, libraryScope, questionMode])

  function changeView(id: string) {
    setViewId(id)
    try {
      localStorage.setItem('viewId', id)
    } catch {
      /* storage unavailable */
    }
  }

  function onSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }

  function onOpen(item: FileItem) {
    if (item.kind === 'folder') {
      setFolderId(item.id)
      setQuery('')
    } else if (item.document) {
      setPanel({ kind: 'document', doc: item.document })
    }
  }

  const trimmedQuery = query.trim()
  const voteSummaries = useVoteSummaries(trimmedQuery)
  const shownDocIds = items.filter((i) => i.document).map((i) => i.id)
  const searchGap = searching && !questionMode && isSearchGap(voteSummaries, shownDocIds)
  const gapContact = searchGap ? primaryCluster(shownDocIds)?.experts[0]?.author : undefined

  const ViewComponent = view.component
  const crumbs = ancestors(folderId)

  return (
    <div className="app">
      <header className="suite-bar">
        <span className="waffle">⋮⋮⋮</span>
        <span className="brand">SharePoint</span>
        <input
          className="search"
          type="search"
          placeholder={questionMode ? 'Stel een vraag, bv. Hoeveel bedragen de maaltijdcheques?' : 'Zoeken in deze bibliotheek'}
          maxLength={MAX_QUERY_LENGTH}
          value={query}
          onChange={(e) => setQuery(e.target.value.slice(0, MAX_QUERY_LENGTH))}
        />
        <span className="avatar">AC</span>
      </header>

      <div className="body">
        <nav className="side-nav">
          <div className="site-title">Tectonic</div>
          <a className="active">Documenten</a>
          <a>Startpagina</a>
          <a>Pagina's</a>
          <a>Siteinhoud</a>
        </nav>

        <main className="content">
          <div className="command-bar">
            <button disabled title="Nog te ontwerpen">+ Nieuw</button>
            <button disabled title="Nog te ontwerpen">↑ Uploaden</button>
            <div className="spacer" />
            <div className="view-switcher" role="tablist" aria-label="Weergave">
              {views.map((v) => (
                <button
                  key={v.id}
                  role="tab"
                  aria-selected={v.id === view.id}
                  className={v.id === view.id ? 'active' : ''}
                  onClick={() => changeView(v.id)}
                >
                  {v.logo ? <img className="view-logo" src={v.logo} alt="" /> : <span aria-hidden>{v.icon}</span>} {v.label}
                </button>
              ))}
            </div>
          </div>

          <div className="breadcrumb">
            {searching && questionMode ? (
              <span className="crumb current">Vraag: “{query.trim()}”</span>
            ) : searching ? (
              <span className="crumb current">
                Zoekresultaten voor “{query.trim()}” ({items.length})
              </span>
            ) : libraryScope ? (
              <span className="crumb current">Alle documenten ({items.length})</span>
            ) : (
              <>
                <button className="crumb" onClick={() => setFolderId(null)}>
                  Documenten
                </button>
                {crumbs.map((c) => (
                  <span key={c.id}>
                    <span className="sep">›</span>
                    <button className="crumb" onClick={() => setFolderId(c.id)}>
                      {c.name}
                    </button>
                  </span>
                ))}
              </>
            )}
          </div>

          {searchGap && (
            <div className="search-gap" role="status">
              Niemand vond hier iets nuttigs.
              {gapContact && (
                <>
                  {' '}
                  Aanspreekpunt: <strong>{gapContact}</strong>
                </>
              )}
            </div>
          )}

          {items.length === 0 && !libraryScope ? (
            <div className="empty">{searching ? 'Geen bestanden gevonden.' : 'Deze map is leeg.'}</div>
          ) : (
            <ViewComponent
              items={items}
              onOpen={onOpen}
              sort={sort}
              onSort={onSort}
              pathOf={pathOf}
              showPath={searching}
              onSelectEdge={(edge) => setPanel({ kind: 'edge', edge })}
              onSelectPerson={(author, docIds) => setPanel({ kind: 'person', author, docIds })}
              query={trimmedQuery}
            />
          )}
        </main>

        {panel?.kind === 'document' && <PreviewPanel doc={panel.doc} query={trimmedQuery} onClose={() => setPanel(null)} />}
        {panel?.kind === 'edge' && <EdgePanel edge={panel.edge} onClose={() => setPanel(null)} />}
        {panel?.kind === 'person' && <PersonPanel author={panel.author} docIds={panel.docIds} onClose={() => setPanel(null)} />}
      </div>
    </div>
  )
}
