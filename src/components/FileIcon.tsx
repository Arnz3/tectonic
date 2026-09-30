import type { FileKind } from '../types'

const meta: Record<FileKind, { label: string; color: string }> = {
  folder: { label: '', color: '#e8b53a' },
  word: { label: 'W', color: '#2b579a' },
  excel: { label: 'X', color: '#217346' },
  powerpoint: { label: 'P', color: '#d24726' },
  pdf: { label: 'PDF', color: '#c4314b' },
  image: { label: 'IMG', color: '#8764b8' },
  video: { label: 'VID', color: '#0078d4' },
  zip: { label: 'ZIP', color: '#6b6b6b' },
  text: { label: 'TXT', color: '#6b6b6b' },
}

export function FileIcon({ kind, size = 20 }: { kind: FileKind; size?: number }) {
  const { label, color } = meta[kind]

  if (kind === 'folder') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <path d="M2 6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" fill={color} />
      </svg>
    )
  }

  return (
    <span
      className="file-icon"
      style={{
        width: size,
        height: size,
        background: color,
        fontSize: Math.max(7, size * (label.length > 1 ? 0.3 : 0.5)),
      }}
      aria-hidden
    >
      {label}
    </span>
  )
}
