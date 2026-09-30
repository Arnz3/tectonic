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

export interface FileItem {
  id: string
  parentId: string | null
  name: string
  kind: FileKind
  /** bytes, 0 for folders */
  size: number
  modified: string // ISO date
  modifiedBy: string
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
