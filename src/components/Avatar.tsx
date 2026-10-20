/**
 * Illustrated portrait for a (fictional) person, always the same for the same name.
 * In production this would be the profile photo from Microsoft 365.
 */
const SKIN = ['#f6d5b8', '#eabf98', '#d79f74', '#b97a55', '#8d5a3b', '#f1c9a5']
const HAIR = ['#2b1d16', '#4a3020', '#7a4e2d', '#b5793f', '#d8b26a', '#6b6b6b', '#1f1f2e']
const SHIRT = ['#2b579a', '#03787c', '#8766d6', '#c4314b', '#38a477', '#d99a12', '#4f52b2', '#5c6b7a']
const BACKGROUND = ['#e1f3f3', '#e8ebfa', '#fdf1dc', '#e5f4e4', '#fbebeb', '#efedff']

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const pick = <T,>(list: T[], seed: number, shift: number) => list[(seed >>> shift) % list.length]

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const seed = hash(name)
  const skin = pick(SKIN, seed, 0)
  const hair = pick(HAIR, seed, 4)
  const shirt = pick(SHIRT, seed, 8)
  const background = pick(BACKGROUND, seed, 12)
  const style = (seed >>> 16) % 4
  const id = `avatar-${seed.toString(36)}`

  return (
    <svg className="avatar-photo" width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={`Foto van ${name}`}>
      <defs>
        <clipPath id={id}>
          <circle cx="32" cy="32" r="32" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        <rect width="64" height="64" fill={background} />
        {/* long hair behind the head */}
        {style === 2 && <path d="M15 30c0-12 7-20 17-20s17 8 17 20v22H15z" fill={hair} />}
        {/* shoulders and neck */}
        <path d="M8 64c2-12 11-18 24-18s22 6 24 18z" fill={shirt} />
        <rect x="27" y="38" width="10" height="10" rx="4" fill={skin} />
        {/* head */}
        <ellipse cx="32" cy="29" rx="12" ry="14" fill={skin} />
        {/* hair on top */}
        {style === 0 && <path d="M20 27c0-10 5-15 12-15s12 5 12 15c-3-5-7-7-12-7s-9 2-12 7z" fill={hair} />}
        {style === 1 && <path d="M20 26c-1-9 5-15 13-15 8 0 12 6 11 14-5-1-9-4-11-8-3 5-8 8-13 9z" fill={hair} />}
        {style === 2 && <path d="M20 28c0-11 5-16 12-16s12 5 12 16c-2-6-6-9-12-9s-10 3-12 9z" fill={hair} />}
        {style === 3 && <path d="M21 22c2-6 6-9 11-9s9 3 11 9c-3-2-7-3-11-3s-8 1-11 3z" fill={hair} />}
        {/* face */}
        <circle cx="27.5" cy="30" r="1.4" fill="#2b2b2b" />
        <circle cx="36.5" cy="30" r="1.4" fill="#2b2b2b" />
        <path d="M28 36c2.5 2 5.5 2 8 0" stroke="#7a3e2e" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  )
}
