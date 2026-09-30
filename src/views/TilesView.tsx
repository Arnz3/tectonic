import { FileIcon } from '../components/FileIcon'
import { formatDate } from '../format'
import type { ViewProps } from '../types'

export function TilesView({ items, onOpen, pathOf, showPath }: ViewProps) {
  return (
    <div className="tiles-view">
      {items.map((item) => (
        <button key={item.id} className="tile" onClick={() => onOpen(item)}>
          <div className="tile-thumb">
            <FileIcon kind={item.kind} size={56} />
          </div>
          <div className="tile-name" title={item.name}>
            {item.name}
          </div>
          <div className="tile-meta">{showPath ? pathOf(item) : formatDate(item.modified)}</div>
        </button>
      ))}
    </div>
  )
}
