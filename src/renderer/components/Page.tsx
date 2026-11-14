// Shared page chrome: sticky title bar + centered content column.
export function Page({
  title,
  subtitle,
  actions,
  children,
  wide = false
}: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className="min-h-full font-body text-text">
      <div className="sticky top-0 z-10 border-b border-border-soft bg-paper/80 px-8 py-5 backdrop-blur">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-[24px] font-extrabold">{title}</h1>
            {subtitle && <p className="mt-0.5 text-[12.5px] text-text-3">{subtitle}</p>}
          </div>
          {actions}
        </div>
      </div>
      <div className={`${wide ? 'max-w-[980px]' : 'max-w-[720px]'} mx-auto space-y-5 p-8 animate-fade-up`}>{children}</div>
    </div>
  )
}

export function SoonBadge() {
  return (
    <span className="rounded-full bg-white/[.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[.08em] text-text-3">
      Soon
    </span>
  )
}
