import { FileIcon } from '../components/FileIcon'
import type { ViewProps } from '../types'

export function CompactView({ items, onOpen }: ViewProps) {
  return (
    <div className="compact-view">
      {items.map((item) => (
        <button key={item.id} className="compact-item" onClick={() => onOpen(item)} title={item.name}>
          <FileIcon kind={item.kind} size={16} />
          <span>{item.name}</span>
        </button>
      ))}
    </div>
  )
}
