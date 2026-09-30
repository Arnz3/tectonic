export type FileKind =
  | 'folder'
  | 'word'
  | 'excel'
  | 'powerpoint'
  | 'pdf'
  | 'image'
  | 'video'
  | 'zip'
  | 'text'

export interface HistoryEntry {
  author: string
  date: string
  change: 'inhoud' | 'opmaak'
  summary: string
}

/** A document from data/documents.json (see CLAUDE.md, section 4). */
export interface Document {
  id: string
  title: string
  filename: string
  folder: string
  country: 'BE' | 'NL' | 'DE'
  topic: string
  layer: 'wet' | 'sector' | 'procedure' | 'klant'
  status: 'goedgekeurd' | 'concept' | 'verouderd'
  owner: string | null
  created: string
  modified: string
  text: string
  history: HistoryEntry[]
}

export interface FileItem {
  id: string
  parentId: string | null
  name: string
  kind: FileKind
  /** bytes, 0 for folders */
  size: number
  modified: string // ISO date
  modifiedBy: string
  /** Set for files backed by a dataset document; undefined for folders. */
  document?: Document
}

export type SortKey = 'name' | 'modified' | 'modifiedBy' | 'size'

export interface SortState {
  key: SortKey
  dir: 'asc' | 'desc'
}

/** Props every view receives. A new view only has to render `items`. */
export interface ViewProps {
  items: FileItem[]
  onOpen: (item: FileItem) => void
  sort: SortState
  onSort: (key: SortKey) => void
  /** Resolves the folder path of an item, handy when showing search results. */
  pathOf: (item: FileItem) => string
  showPath: boolean
}
