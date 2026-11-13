// Hero visual: a stylised Minutama window during a call (your rough notes +
// live transcript) with the AI-enhanced notes card floating on top.
// Pure HTML/CSS so it is crisp at any size and needs no screenshots.

function Bars() {
  return (
    <span className="flex h-3.5 items-end gap-[2px]" aria-hidden="true">
      {[0, 0.2, 0.4, 0.1].map((d, i) => (
        <span
          key={i}
          className="w-[3px] origin-bottom animate-bar rounded-full bg-accent"
          style={{ height: '100%', animationDelay: `${d}s` }}
        />
      ))}
    </span>
  )
}

export function AppMock() {
  return (
    <div className="relative mx-auto w-full max-w-[980px]">
      {/* Window */}
      <div className="overflow-hidden rounded-xl2 border border-line bg-white shadow-window">
        <div className="flex items-center gap-3 border-b border-line bg-[#FCFBF8] px-4 py-3">
          <div className="flex gap-1.5" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-line" />
            <span className="h-2.5 w-2.5 rounded-full bg-line" />
            <span className="h-2.5 w-2.5 rounded-full bg-line" />
          </div>
          <span className="truncate text-[13px] font-semibold">Pricing call — Northwind</span>
          <span className="ml-auto flex items-center gap-2 rounded-full bg-accent-soft px-2.5 py-1 text-[12px] font-semibold text-accent-ink">
            <Bars /> 24:18
          </span>
        </div>

        <div className="grid md:grid-cols-[1.25fr_1fr]">
          {/* Your notes */}
          <div className="border-b border-line p-5 md:border-b-0 md:border-r sm:p-7">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[.12em] text-ink-3">Your notes</div>
            <div className="space-y-2 font-sans text-[15px] leading-relaxed text-ink">
              <p>team of 40, rolling out in Q3</p>
              <p>price ok?? asked for annual</p>
              <p>
                security review — send docs<span className="ml-0.5 inline-block h-4 w-[2px] translate-y-[3px] animate-blink bg-ink" />
              </p>
            </div>
          </div>

          {/* Live transcript */}
          <div className="bg-[#FCFBF8] p-5 sm:p-7">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[.12em] text-ink-3">Live transcript</div>
            <div className="space-y-2.5 text-[13px] leading-relaxed">
              <div className="mr-6 rounded-xl bg-them px-3 py-2 text-ink-2">
                <span className="mb-0.5 block text-[10px] font-semibold text-ink-3">THEM · 23:41</span>
                If we commit to a year, can you do something on price?
              </div>
              <div className="ml-6 rounded-xl bg-me px-3 py-2 text-ink">
                <span className="mb-0.5 block text-[10px] font-semibold text-ink-3">YOU · 23:52</span>
                Yes — annual is two months free. I&apos;ll send the security pack today.
              </div>
              <div className="mr-6 rounded-xl bg-them px-3 py-2 text-ink-2">
                <span className="mb-0.5 block text-[10px] font-semibold text-ink-3">THEM · 24:09</span>
                Great, then legal can review it by Friday.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced notes card */}
      <div className="relative mx-3 -mt-10 rounded-xl2 border border-line bg-white p-5 shadow-window sm:absolute sm:-bottom-28 sm:right-[-12px] sm:mx-0 sm:mt-0 sm:w-[380px] lg:right-[-40px]">
        <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-accent-ink">
          <span aria-hidden="true">✦</span> Enhanced by Minutama
        </div>
        <div className="font-display text-[17px] font-bold">Northwind — annual plan</div>
        <ul className="mt-2 space-y-1.5 text-[13px] leading-snug text-ink-2">
          <li>• 40 seats, rollout planned for Q3</li>
          <li>• Asked for annual pricing → offered 2 months free</li>
          <li>• Legal reviews security docs by <b className="text-ink">Friday</b></li>
        </ul>
        <div className="mt-3 rounded-lg bg-sand px-3 py-2 text-[12px]">
          <span className="font-semibold">Next step · You:</span> send the security pack today
        </div>
      </div>
    </div>
  )
}
