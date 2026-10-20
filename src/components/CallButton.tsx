import { useEffect, useState } from 'react'

/** Teams-style call button next to a contact. Demo only: shows that a Teams call would start. */
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
      title={`Bellen met ${first} in Microsoft Teams`}
      aria-label={`Bel ${name} via Teams`}
    >
      <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden>
        {/* Fluent-style call icon, as in Teams */}
        <path
          d="M5.4 2.3 6.5 2a1.8 1.8 0 0 1 2.1 1l.9 2a1.8 1.8 0 0 1-.4 2.1l-1.4 1.3c-.1.1-.1.3-.1.4.4 1 1 2 1.9 2.8.8.7 1.6 1.2 2.3 1.4.1 0 .3 0 .4-.1l1.4-1.4a1.8 1.8 0 0 1 2.1-.4l2 .9a1.8 1.8 0 0 1 1 2.1l-.3 1.1A2.8 2.8 0 0 1 14.6 18c-2.7.4-5.4-.8-8-3.6S2.6 8.1 3 5.4a2.8 2.8 0 0 1 2.4-3.1z"
          fill="currentColor"
        />
      </svg>
      <span>{calling ? 'Belt…' : 'Bellen'}</span>
    </button>
  )
}
