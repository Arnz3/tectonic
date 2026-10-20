import { useEffect, useState } from 'react'

/** Round call button next to a contact. Demo only: shows that a Teams call would start. */
export function CallButton({ name }: { name: string }) {
  const [calling, setCalling] = useState(false)
  useEffect(() => {
    if (!calling) return
    const t = setTimeout(() => setCalling(false), 2500)
    return () => clearTimeout(t)
  }, [calling])

  const first = name.split(' ')[0]
  return (
    <button
      className={calling ? 'call-button calling' : 'call-button'}
      onClick={(e) => {
        e.stopPropagation()
        setCalling(true)
      }}
      title={`Bel ${first} via Teams`}
      aria-label={`Bel ${name} via Teams`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
        <path
          d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z"
          fill="currentColor"
        />
      </svg>
      <span>{calling ? `Bellen naar ${first}…` : 'Bel'}</span>
    </button>
  )
}
