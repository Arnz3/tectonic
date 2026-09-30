import { FileIcon } from '../components/FileIcon'
import { formatDate, formatSize } from '../format'
import type { SortKey, ViewProps } from '../types'

const columns: { key: SortKey; label: string; className?: string }[] = [
  { key: 'name', label: 'Naam' },
  { key: 'modified', label: 'Gewijzigd' },
  { key: 'modifiedBy', label: 'Gewijzigd door' },
  { key: 'size', label: 'Grootte', className: 'num' },
]

export function ListView({ items, onOpen, sort, onSort, pathOf, showPath }: ViewProps) {
  return (
    <table className="list-view">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} className={c.className} onClick={() => onSort(c.key)}>
              {c.label}
              {sort.key === c.key && <span className="sort-arrow">{sort.dir === 'asc' ? '↑' : '↓'}</span>}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id} onDoubleClick={() => onOpen(item)}>
            <td>
              <button className="name-cell" onClick={() => onOpen(item)}>
                <FileIcon kind={item.kind} />
                <span>
                  {item.name}
                  {showPath && <small className="path">{pathOf(item)}</small>}
                </span>
              </button>
            </td>
            <td>{formatDate(item.modified)}</td>
            <td>{item.modifiedBy}</td>
            <td className="num">{formatSize(item.size)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
