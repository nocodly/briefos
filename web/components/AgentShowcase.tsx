import { LogoMark } from './Logo'

// Visual demos for the "agent" section: the call capsule, live reply hints and
// handing tasks to Claude Code / Codex. Pure HTML/CSS — mirrors the real app UI.

function Bars({ className = '' }: { className?: string }) {
  return (
    <span className={`flex h-4 items-end gap-[3px] ${className}`} aria-hidden="true">
      {[0, 0.15, 0.3, 0.05, 0.25, 0.1].map((d, i) => (
        <span
          key={i}
          className="w-[3px] origin-bottom animate-bar rounded-full bg-accent"
          style={{ height: '100%', animationDelay: `${d}s` }}
        />
      ))}
    </span>
  )
}

function Capsule({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-[22px] border border-white/10 bg-[#15171C]/95 text-white shadow-[0_20px_50px_-20px_rgba(0,0,0,.6)]">
      <div className="pointer-events-none absolute -left-10 -top-12 h-28 w-28 rounded-full bg-accent/35 blur-2xl" />
      <div className="relative">{children}</div>
    </div>
  )
}

/** Desktop-ish backdrop the capsule floats over. */
function Desk({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="relative h-[230px] overflow-hidden rounded-xl2 border border-line bg-gradient-to-br from-[#E9EEF5] via-[#F4EFE9] to-[#FBE3D6] p-4">
      <div className="absolute left-4 top-4 flex items-center gap-2 rounded-lg bg-white/80 px-2.5 py-1.5 text-[11px] font-semibold text-ink-2 shadow-sm">
        <span className="h-2 w-2 rounded-full bg-[#22C55E]" /> {label}
      </div>
      <div className="absolute inset-x-4 bottom-4 top-14 rounded-lg border border-white/70 bg-white/45" />
      <div className="absolute right-4 top-1/2 w-[330px] max-w-[calc(100%-2rem)] -translate-y-1/2">{children}</div>
    </div>
  )
}

export function CallCapsuleDemo() {
  return (
    <Desk label="Zoom meeting">
      <Capsule>
        <div className="flex items-center gap-3 px-3.5 py-3">
          <div className="relative flex-shrink-0">
            <LogoMark size={38} />
            <span className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-blink rounded-full bg-[#22C55E] ring-2 ring-[#15171C]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold leading-tight">Call on Zoom</div>
            <div className="mt-0.5 whitespace-nowrap text-[11.5px] text-white/55">Take notes with Minutama?</div>
          </div>
          <span className="rounded-full bg-accent px-3 py-1.5 text-[12px] font-semibold">Start</span>
        </div>
      </Capsule>
    </Desk>
  )
}

export function ReplyHintDemo() {
  return (
    <Desk label="Google Meet">
      <Capsule>
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <LogoMark size={32} />
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 animate-blink rounded-full bg-[#E5484D]" />
              <span className="font-mono text-[15px] leading-none">18:42</span>
            </div>
            <Bars className="mt-1.5" />
          </div>
        </div>
        <div className="mx-2.5 mb-2.5 rounded-[14px] border border-white/10 bg-white/[.07] p-3">
          <div className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#FFC9B3]">💡 They asked</div>
          <div className="mt-1 text-[11.5px] text-white/60">Is there a discount for a year?</div>
          <div className="mt-1.5 text-[13px] leading-snug">“Yes — annual is two months free. I’ll send the details today.”</div>
        </div>
      </Capsule>
    </Desk>
  )
}

export function AgentHandoffDemo() {
  return (
    <div className="rounded-xl2 border border-line bg-white p-5 shadow-window">
      <div className="grid grid-cols-2 gap-2.5">
        {['Claude Code', 'Codex'].map((name, i) => (
          <div
            key={name}
            className={`rounded-xl border p-3 ${i === 0 ? 'border-accent bg-accent-soft/60' : 'border-line bg-paper'}`}
          >
            <div className="text-[13px] font-semibold">{name}</div>
            <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-[#16A34A]">● Connected</div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl border border-line bg-paper p-3">
        <div className="text-[11px] font-semibold uppercase tracking-[.1em] text-ink-3">From your call</div>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="flex-1 text-[13.5px] font-medium">Update the client list and draft the follow-up email</span>
          <span className="rounded-lg bg-accent px-2.5 py-1.5 text-[11.5px] font-semibold text-white">Send to Claude Code</span>
        </div>
      </div>
      <div className="mt-3 rounded-xl bg-ink p-3 font-mono text-[11.5px] leading-relaxed text-white/75">
        <div>
          <span className="text-[#22C55E]">✓</span> Updated clients.xlsx — Northwind: annual, 40 seats
        </div>
        <div>
          <span className="text-[#22C55E]">✓</span> Drafted email to anna@northwind.com
        </div>
        <div className="text-white/45">Waiting for your OK to send…</div>
      </div>
    </div>
  )
}
