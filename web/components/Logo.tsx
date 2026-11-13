// Minutama mark: a rounded tile with four "voice" bars that read as an M.
export function LogoMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={className}
    >
      <rect width="32" height="32" rx="9" fill="#FF6A3D" />
      <rect x="7" y="9" width="3.4" height="14" rx="1.7" fill="#fff" />
      <rect x="12.2" y="13" width="3.4" height="8" rx="1.7" fill="#fff" />
      <rect x="16.4" y="13" width="3.4" height="8" rx="1.7" fill="#fff" />
      <rect x="21.6" y="9" width="3.4" height="14" rx="1.7" fill="#fff" />
    </svg>
  )
}

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark />
      <span className="font-display text-[19px] font-bold tracking-[-0.02em]">Minutama</span>
      <span className="hidden rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] min-[420px]:inline-block font-semibold uppercase tracking-[.1em] text-accent-ink">
        Agent
      </span>
    </span>
  )
}
