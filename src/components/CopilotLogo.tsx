/** Copilot mark, shown in the search box where the question goes to the AI assistant. */
export function CopilotLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="Copilot">
      <defs>
        <linearGradient id="copilot-a" x1="4" y1="4" x2="20" y2="26" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0FAFFF" />
          <stop offset="0.55" stopColor="#2764E7" />
          <stop offset="1" stopColor="#1EBD8F" />
        </linearGradient>
        <linearGradient id="copilot-b" x1="28" y1="28" x2="12" y2="6" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFB657" />
          <stop offset="0.5" stopColor="#FF5F3D" />
          <stop offset="1" stopColor="#E64AC6" />
        </linearGradient>
      </defs>
      {/* two interlocking ribbons */}
      <path d="M11.2 3.5h6.4c1.6 0 2.9 1.1 3.3 2.6l-4.6 15.6c-.6 2.1-2.5 3.6-4.7 3.6H6.2c-2 0-3.4-1.9-2.9-3.8L8 7.1c.4-2.1 1.7-3.6 3.2-3.6z" fill="url(#copilot-a)" />
      <path d="M20.8 28.5h-6.4c-1.6 0-2.9-1.1-3.3-2.6l4.6-15.6c.6-2.1 2.5-3.6 4.7-3.6h5.4c2 0 3.4 1.9 2.9 3.8L24 24.9c-.4 2.1-1.7 3.6-3.2 3.6z" fill="url(#copilot-b)" />
    </svg>
  )
}
