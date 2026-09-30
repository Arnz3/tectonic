import type { ComponentType } from 'react'
import type { ViewProps } from '../types'
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
]
