// Minutama mark: a tangerine tile with four "voice" bars that read as an M.
// Same mark as minutama.com (web/components/Logo.tsx).
export function LogoMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="mm-tile" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FF7E55" />
          <stop offset="1" stopColor="#F25A2C" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#mm-tile)" />
      <rect x="7" y="9" width="3.4" height="14" rx="1.7" fill="#fff" />
      <rect x="12.2" y="13" width="3.4" height="8" rx="1.7" fill="#fff" />
      <rect x="16.4" y="13" width="3.4" height="8" rx="1.7" fill="#fff" />
      <rect x="21.6" y="9" width="3.4" height="14" rx="1.7" fill="#fff" />
    </svg>
  )
}

/** "Minutama Agent" wordmark. */
export function Logo({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={size} />
      <span className="font-display font-bold tracking-[-0.02em] leading-none" style={{ fontSize: size * 0.58 }}>
        Minutama
        <span className="ml-1.5 align-middle rounded-full bg-accent-soft px-1.5 py-0.5 text-[0.55em] font-semibold uppercase tracking-[.08em] text-accent-ink">
          Agent
        </span>
      </span>
    </span>
  )
}
