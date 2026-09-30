import { useMemo, useState } from 'react'
import { PreviewPanel } from './components/PreviewPanel'
import { libraryItems } from './library'
import type { Document, FileItem, SortKey, SortState } from './types'
import { views } from './views'

const MAX_QUERY_LENGTH = 100

const byId = new Map(libraryItems.map((f) => [f.id, f]))

function matches(item: FileItem, q: string): boolean {
  const doc = item.document
  return (
    item.name.toLowerCase().includes(q) ||
    (doc !== undefined &&
      (doc.title.toLowerCase().includes(q) || doc.topic.toLowerCase().includes(q) || doc.text.toLowerCase().includes(q)))
  )
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
  const [preview, setPreview] = useState<Document | null>(null)

  const view = views.find((v) => v.id === viewId) ?? views[0]
  const searching = query.trim().length > 0

  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    const source = q
      ? libraryItems.filter((f) => matches(f, q))
      : libraryItems.filter((f) => f.parentId === folderId)
    return [...source].sort((a, b) => compare(a, b, sort))
  }, [folderId, query, sort])

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
      setPreview(item.document)
    }
  }

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
          placeholder="Zoeken in deze bibliotheek"
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
                  <span aria-hidden>{v.icon}</span> {v.label}
                </button>
              ))}
            </div>
          </div>

          <div className="breadcrumb">
            {searching ? (
              <span className="crumb current">
                Zoekresultaten voor “{query.trim()}” ({items.length})
              </span>
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

          {items.length === 0 ? (
            <div className="empty">{searching ? 'Geen bestanden gevonden.' : 'Deze map is leeg.'}</div>
          ) : (
            <ViewComponent
              items={items}
              onOpen={onOpen}
              sort={sort}
              onSort={onSort}
              pathOf={pathOf}
              showPath={searching}
            />
          )}
        </main>

        {preview && <PreviewPanel doc={preview} onClose={() => setPreview(null)} />}
      </div>
    </div>
  )
}
