import type { ComponentType } from 'react'
import type { ViewProps } from '../types'
import { AskMeView } from './AskMeView'
import { CompactView } from './CompactView'
import { KnowledgeGraphView } from './KnowledgeGraphView'
import { ListView } from './ListView'
import { TilesView } from './TilesView'

export interface ViewDefinition {
  id: string
  label: string
  icon: string
  component: ComponentType<ViewProps>
  /**
   * 'folder': shows the current folder (default).
   * 'library': shows every document in the library, regardless of the open folder.
   */
  scope?: 'folder' | 'library'
  /**
   * 'filter': the search box filters `items` (default).
   * 'question': the search box is a question; the view receives all items and reads `query` itself.
   */
  search?: 'filter' | 'question'
}

/**
 * Register new views here. A view is just a component that renders `ViewProps.items`;
 * it shows up in the view switcher automatically.
 */
export const views: ViewDefinition[] = [
  { id: 'list', label: 'Lijst', icon: '☰', component: ListView },
  { id: 'tiles', label: 'Tegels', icon: '▦', component: TilesView },
  { id: 'compact', label: 'Compact', icon: '⋮⋮', component: CompactView },
  { id: 'graph', label: 'Kennisgraaf', icon: '◉', component: KnowledgeGraphView, scope: 'library' },
  { id: 'askme', label: 'ASKME', icon: '✦', component: AskMeView, scope: 'library', search: 'question' },
]
