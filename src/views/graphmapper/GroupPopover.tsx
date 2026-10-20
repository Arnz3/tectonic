import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { analysis } from '../../analysis'
import type { Topic } from './data'

const WIDTH = 400
// Same format as formatDate, but for a local Date (an ISO round trip could shift the day).
const dateFmt = new Intl.DateTimeFormat('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' })

/** The copies of one bundle, stacked under each other, floating over the timeline. */
export function GroupPopover({
  topic,
  groupId,
  anchor,
  onOpenDoc,
  onClose,
}: {
  topic: Topic
  groupId: string
  /** The bundle card on screen. */
  anchor: DOMRect
  onOpenDoc: (id: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: anchor.left, top: anchor.bottom + 8 })
  const group = topic.groups[groupId]
  const byId = new Map(topic.docs.map((d) => [d.id, d]))
  const members = group.members.map((id) => byId.get(id)!)
  const original = analysis.duplicate_groups.find((g) => [g.original, ...g.copies].includes(group.members[0]))?.original
  const replacement = members.map((m) => m.replacedBy).find(Boolean)
  const replacementDoc = replacement ? byId.get(replacement) : undefined

  // Below the card when it fits, otherwise above it; always inside the window.
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0
    const below = anchor.bottom + 8
    const top = below + h > window.innerHeight - 12 ? Math.max(12, anchor.top - h - 8) : below
    const left = Math.min(Math.max(12, anchor.left), window.innerWidth - WIDTH - 12)
    setPos({ left, top })
  }, [anchor])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    // The popover is fixed on screen, so it closes as soon as the page scrolls or resizes.
    const onMove = () => onClose()
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [onClose])

  return (
    <>
      <div className="popover-backdrop" onClick={onClose} />
      <div className="group-popover" ref={ref} role="dialog" aria-label="Kopieën" style={{ left: pos.left, top: pos.top, width: WIDTH }}>
        <div className="group-popover-head">
          <div>
            <div className="group-popover-title">{members.length} versies met dezelfde inhoud</div>
            <div className="group-popover-sub">Tellen samen als één bron</div>
          </div>
          <button className="gm-close" onClick={onClose} aria-label="Sluiten">
            ✕
          </button>
        </div>
        <ul className="group-list">
          {members.map((m) => (
            <li key={m.id}>
              <button className="group-item" onClick={() => onOpenDoc(m.id)}>
                <span className="group-dot" aria-hidden />
                <span className="group-text">
                  <span className="group-name">
                    {m.title}
                    {m.id === original && <span className="group-tag">Origineel</span>}
                  </span>
                  <span className="group-meta">
                    {dateFmt.format(m.date)} · {m.tooltip[2]}
                  </span>
                </span>
                <span className="group-chev" aria-hidden>
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
        {replacementDoc && (
          <button className="group-replaced" onClick={() => onOpenDoc(replacementDoc.id)}>
            <span className="group-replaced-dot" aria-hidden />
            <span className="group-text">
              <span className="group-meta">Vervangen door</span>
              <span className="group-name">{replacementDoc.title}</span>
            </span>
            <span className="group-chev" aria-hidden>
              ›
            </span>
          </button>
        )}
      </div>
    </>
  )
}
