import Link from 'next/link'
import { AppMock } from '@/components/AppMock'
import { Footer, Nav, WindowsIcon } from '@/components/Chrome'
import { Waitlist } from '@/components/Waitlist'
import { AgentHandoffDemo, CallCapsuleDemo, ReplyHintDemo } from '@/components/AgentShowcase'
import { PLANS } from '@/lib/site'

const APPS = [
  'Zoom',
  'Google Meet',
  'Microsoft Teams',
  'Slack huddles',
  'Telegram',
  'Discord',
  'WhatsApp',
  'Webex',
  'Skype',
  'Signal',
  'Viber',
  'GoTo Meeting',
  'RingCentral',
  'Jitsi Meet',
  'Whereby',
  'Lark',
  'any call in your browser'
]

const STEPS = [
  {
    n: '1',
    title: 'Start when the call starts',
    text: 'Minutama notices the call and asks “Take notes?” — one click. It hears your microphone and your computer’s sound. Nobody gets a bot in their call.'
  },
  {
    n: '2',
    title: 'Jot what matters to you',
    text: 'Type a few words — “price ok?”, “send docs”. Or type nothing. The live transcript runs on the side, split into You and Them.'
  },
  {
    n: '3',
    title: 'Get notes worth sending',
    text: 'When you stop, Minutama blends your jottings with the conversation into clean notes, decisions and next steps — in seconds.'
  }
]

const FEATURES = [
  {
    icon: '◎',
    title: 'No bot in the room',
    text: 'Records from your own computer, so calls feel like calls. Works with any app that makes sound.'
  },
  {
    icon: '✎',
    title: 'Your notes, upgraded',
    text: 'What you wrote stays the backbone. AI fills in names, numbers and commitments you didn’t have time to type.'
  },
  {
    icon: '⇄',
    title: 'You and Them, separated',
    text: 'Your voice and the other side are captured on separate channels, so the transcript knows who said what.'
  },
  {
    icon: '文',
    title: 'Speaks your language',
    text: 'English, Deutsch, Українська, Polski, Español and 50+ more. Notes come back in the language of the meeting.'
  },
  {
    icon: '▦',
    title: 'Templates for every call',
    text: 'General, 1:1, standup, sales call, interview, customer discovery — each with the sections that matter.'
  },
  {
    icon: '⌂',
    title: 'Private by default',
    text: 'Minutama never saves your audio. Notes and transcripts live on your computer until you decide to share them.'
  }
]

const FAQ = [
  {
    q: 'Does a bot join my meetings?',
    a: 'No. Minutama runs on your computer and listens to your microphone and your computer’s audio output. Other participants don’t see anything join the call.'
  },
  {
    q: 'Is my audio stored?',
    a: 'No. Minutama never saves your audio. It is sent in short pieces over an encrypted connection to our transcription provider, which processes it under its API terms and does not use it to train models. Your notes and transcripts are stored on your computer.'
  },
  {
    q: 'Do I need to tell people I’m taking notes with AI?',
    a: 'Yes — please always let participants know and follow the recording laws where you and they are. A quick “I’m using an AI notetaker, ok?” at the start is enough for most teams.'
  },
  {
    q: 'Which languages are supported?',
    a: 'More than 50, including English, German, Ukrainian, Polish, Spanish, French and Italian. Mixed-language calls work too.'
  },
  {
    q: 'Do I need headphones?',
    a: 'No, but they give the cleanest You / Them separation. With speakers, Minutama removes the echo of the other side from your microphone automatically.'
  },
  {
    q: 'Is there a Mac app?',
    a: 'Minutama is available for Windows 10 and 11 today. The Mac app is in the works — join the waitlist and we’ll email you once.'
  },
  {
    q: 'Can I cancel Pro anytime?',
    a: 'Yes. Cancel anytime — you keep Pro until the end of the period you paid for, then move to Free. No questions asked.'
  }
]

function Check() {
  return (
    <svg viewBox="0 0 20 20" className="mt-[3px] h-4 w-4 flex-none text-accent-ink" fill="currentColor" aria-hidden="true">
      <path d="M8.1 13.6 4.5 10l-1.1 1.1 4.7 4.7L17 6.9l-1.1-1.1z" />
    </svg>
  )
}

const AGENT_FEATURES = [
  {
    icon: '↗',
    title: 'Notes sent where you work',
    text: 'Every meeting lands automatically in Notion, Slack, email or any tool through a webhook (Zapier, Make, n8n).'
  },
  {
    icon: '✦',
    title: 'Ask Claude about any meeting',
    text: 'Add Minutama to Claude as a connector, so your assistant can search and use all your meetings.'
  },
  {
    icon: '◷',
    title: 'Calendar and to-dos',
    text: '“You agreed to meet Thursday” → add it to your calendar? “Three tasks” → create a list? You approve, the agent does it.'
  }
]

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        {/* ── Hero ── */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-[-220px] h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl"
          />
          <div className="container-x relative pb-24 pt-14 text-center sm:pb-44 sm:pt-20">
            <p className="eyebrow animate-rise">AI meeting agent · no meeting bot</p>
            <h1 className="mx-auto mt-4 max-w-3xl animate-rise font-display text-[44px] font-extrabold leading-[1.02] tracking-[-0.035em] [animation-delay:.05s] sm:text-[68px]">
              Your meeting agent. <span className="text-accent">Notes write themselves.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl animate-rise text-[17px] leading-relaxed text-ink-2 [animation-delay:.1s] sm:text-[19px]">
              Minutama Agent listens on your computer — nothing joins the call — turns a few typed words into clear
              notes, decisions and next steps, and gets them where your team works.
            </p>
            <div className="mt-8 flex animate-rise flex-col items-center justify-center gap-3 [animation-delay:.15s] sm:flex-row">
              <Link href="/download" className="btn-accent w-full sm:w-auto">
                <WindowsIcon /> Download for Windows — free
              </Link>
              <Link href="/#how" className="btn-ghost w-full sm:w-auto">
                See how it works
              </Link>
            </div>
            <p className="mt-3 text-[13px] text-ink-3">
              {PLANS.free.meetingsPerMonth} meetings a month free · no credit card · Mac coming soon
            </p>

            <div className="mt-14 animate-rise text-left [animation-delay:.25s]">
              <AppMock />
            </div>
          </div>
        </section>

        {/* ── Works with ── */}
        <section className="border-y border-line bg-sand/60">
          <div className="container-x flex flex-col items-center gap-4 py-8 sm:flex-row sm:gap-8">
            <span className="flex-shrink-0 text-[13px] font-semibold uppercase tracking-[.12em] text-ink-3">Works with</span>
            <div className="marquee relative w-full overflow-hidden">
              <ul className="flex w-max animate-marquee gap-x-9 text-[15px] font-semibold text-ink-2 motion-reduce:animate-none">
                {[...APPS, ...APPS].map((a, i) => (
                  <li key={i} aria-hidden={i >= APPS.length} className="whitespace-nowrap">
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section id="how" className="container-x scroll-mt-20 py-24">
          <p className="eyebrow">How it works</p>
          <h2 className="h-section mt-3 max-w-2xl">Stay in the conversation. Leave with the notes.</h2>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-xl2 border border-line bg-white p-7">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ink font-display text-[15px] font-bold text-paper">
                  {s.n}
                </div>
                <h3 className="mt-5 font-display text-[21px] font-bold tracking-[-0.01em]">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Features ── */}
        <section id="features" className="scroll-mt-20 bg-ink py-24 text-paper">
          <div className="container-x">
            <p className="text-[13px] font-semibold uppercase tracking-[.14em] text-accent">Features</p>
            <h2 className="h-section mt-3 max-w-2xl">Everything a good notetaker does. Nothing that gets in the way.</h2>
            <div className="mt-12 grid gap-px overflow-hidden rounded-xl2 border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div key={f.title} className="bg-ink p-7">
                  <div className="text-[22px] text-accent" aria-hidden="true">
                    {f.icon}
                  </div>
                  <h3 className="mt-4 font-display text-[19px] font-bold">{f.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-white/65">{f.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── The agent ── */}
        <section id="agent" className="container-x scroll-mt-20 pt-24">
          <p className="eyebrow">Minutama Agent</p>
          <h2 className="h-section mt-3 max-w-3xl">An agent that sits beside you on every call.</h2>
          <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-ink-2">
            Only you see it. It notices the call, whispers answers when you are put on the spot, and hands the
            follow-up to your own AI agent — always asking before it acts.
          </p>

          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            <div>
              <CallCapsuleDemo />
              <h3 className="mt-5 font-display text-[21px] font-bold tracking-[-0.01em]">Never forget to hit record</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
                The moment Zoom, Meet, Teams or any call app turns on your microphone, a small capsule slides in:
                “Take notes?” One click and you are recording.
              </p>
            </div>
            <div>
              <ReplyHintDemo />
              <h3 className="mt-5 font-display text-[21px] font-bold tracking-[-0.01em]">Know what to say</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
                When someone asks you a question, Minutama suggests a short answer from what was said and what you
                noted — right in the capsule. Only you see it.
              </p>
            </div>
          </div>

          <div className="mt-6 grid items-center gap-10 rounded-[28px] bg-sand/70 p-6 sm:p-10 lg:grid-cols-2">
            <div>
              <p className="eyebrow">Works with your agent</p>
              <h3 className="mt-3 font-display text-[30px] font-extrabold leading-tight tracking-[-0.02em]">
                Connect Claude Code or Codex in one click.
              </h3>
              <p className="mt-3 text-[16px] leading-relaxed text-ink-2">
                Minutama finds the agent already on your computer. Then any task from a call — “update the client
                list”, “draft the follow-up” — goes to it with the full meeting context. It runs with your own account
                and tools, and you approve every task first.
              </p>
              <ul className="mt-5 space-y-2 text-[15px] text-ink-2">
                {[
                  'Type or say a task during the call — or pick one from your notes',
                  'See exactly what the agent receives before it runs',
                  'Watch the result live, stop it any time'
                ].map((t) => (
                  <li key={t} className="flex gap-2">
                    <span className="text-accent">✓</span> {t}
                  </li>
                ))}
              </ul>
            </div>
            <AgentHandoffDemo />
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {AGENT_FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl2 border border-line bg-white p-6">
                <div className="flex items-center justify-between">
                  <span className="text-[20px] text-accent" aria-hidden="true">
                    {f.icon}
                  </span>
                  <span className="rounded-full bg-sand px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[.08em] text-ink-3">
                    Coming soon
                  </span>
                </div>
                <h3 className="mt-3 font-display text-[18px] font-bold tracking-[-0.01em]">{f.title}</h3>
                <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-2">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Period reports (differentiator) ── */}
        <section className="container-x grid items-center gap-12 py-24 lg:grid-cols-2">
          <div>
            <p className="eyebrow">Only in Minutama</p>
            <h2 className="h-section mt-3">Your week, month or quarter — in one page.</h2>
            <p className="mt-4 text-[17px] leading-relaxed text-ink-2">
              Period Reports read across all your meetings and tell you what was decided, what is still open, which
              questions keep coming back and where your time went.
            </p>
            <ul className="mt-6 space-y-2 text-[15px] text-ink-2">
              {['Every decision in one list', 'Open action items with owners', 'Recurring topics and questions', 'Ready for a Monday update'].map(
                (t) => (
                  <li key={t} className="flex gap-2">
                    <Check /> {t}
                  </li>
                )
              )}
            </ul>
          </div>
          <div className="rounded-xl2 border border-line bg-white p-6 shadow-window sm:p-8">
            <div className="flex items-baseline justify-between">
              <div className="font-display text-[20px] font-bold">October recap</div>
              <div className="text-[12px] text-ink-3">23 meetings · 14 h 10 m</div>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3 text-center">
              {[
                ['18', 'decisions'],
                ['7', 'open actions'],
                ['4', 'recurring topics']
              ].map(([n, l]) => (
                <div key={l} className="rounded-xl bg-sand px-2 py-3">
                  <div className="font-display text-[26px] font-bold">{n}</div>
                  <div className="text-[12px] text-ink-3">{l}</div>
                </div>
              ))}
            </div>
            <div className="mt-5 space-y-2 text-[14px] text-ink-2">
              <div className="rounded-lg border border-line px-3 py-2">
                <span className="font-semibold text-ink">Keeps coming up:</span> onboarding takes too long for teams over 20
              </div>
              <div className="rounded-lg border border-line px-3 py-2">
                <span className="font-semibold text-ink">Still open:</span> pricing page update — owner: you, since Oct 9
              </div>
            </div>
          </div>
        </section>

        {/* ── Pricing ── */}
        <section id="pricing" className="scroll-mt-20 border-t border-line bg-sand/60 py-24">
          <div className="container-x">
            <div className="text-center">
              <p className="eyebrow">Pricing</p>
              <h2 className="h-section mt-3">Start free. Upgrade when it clicks.</h2>
            </div>
            <div className="mx-auto mt-12 grid max-w-4xl gap-5 md:grid-cols-2">
              <div className="rounded-xl2 border border-line bg-white p-8">
                <div className="font-display text-[22px] font-bold">Free</div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="font-display text-[44px] font-extrabold">{PLANS.free.price}</span>
                  <span className="text-ink-3">forever</span>
                </div>
                <p className="mt-1 text-[14px] text-ink-3">For trying it on your real calls.</p>
                <Link href="/download" className="btn-ghost mt-6 w-full">
                  Download free
                </Link>
                <ul className="mt-6 space-y-2.5 text-[15px] text-ink-2">
                  {[
                    `${PLANS.free.meetingsPerMonth} meetings every month`,
                    `Up to ${PLANS.free.maxMeetingMinutes} minutes per meeting`,
                    'AI notes, decisions and next steps',
                    'Live transcript, all languages',
                    '3 note templates',
                    `Notes kept for ${PLANS.free.historyDays} days`,
                    'Copy to clipboard'
                  ].map((t) => (
                    <li key={t} className="flex gap-2">
                      <Check /> {t}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="relative rounded-xl2 border-2 border-ink bg-white p-8">
                <span className="absolute -top-3 right-6 rounded-full bg-accent px-3 py-1 text-[12px] font-semibold text-white">
                  Most popular
                </span>
                <div className="font-display text-[22px] font-bold">Pro</div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="font-display text-[44px] font-extrabold">{PLANS.pro.price}</span>
                  <span className="text-ink-3">/ month</span>
                </div>
                <p className="mt-1 text-[14px] text-ink-3">For people who live in meetings.</p>
                <Link href="/download" className="btn-primary mt-6 w-full">
                  Get started, upgrade in the app
                </Link>
                <ul className="mt-6 space-y-2.5 text-[15px] text-ink-2">
                  {[
                    'Unlimited meetings',
                    `Up to ${PLANS.pro.maxMeetingMinutes / 60} hours per meeting`,
                    'Notes kept forever',
                    'All templates',
                    'Period Reports (week · month · quarter)',
                    'Export to PDF, Notion and Slack',
                    'Everything in Free'
                  ].map((t) => (
                    <li key={t} className="flex gap-2">
                      <Check /> {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="mt-6 text-center text-[13px] text-ink-3">
              Prices in USD. Taxes may apply. Fair use: up to {PLANS.pro.monthlyHours} hours of recording per
              month on Pro.
            </p>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section id="faq" className="container-x scroll-mt-20 py-24">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.6fr]">
            <div>
              <p className="eyebrow">FAQ</p>
              <h2 className="h-section mt-3">Questions, answered.</h2>
              <p className="mt-4 text-[15px] text-ink-2">
                Something else? Write to{' '}
                <a href="mailto:hello@minutama.com" className="font-semibold text-accent-ink underline underline-offset-2">
                  hello@minutama.com
                </a>
              </p>
            </div>
            <div className="divide-y divide-line border-y border-line">
              {FAQ.map((f) => (
                <details key={f.q} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-semibold">
                    {f.q}
                    <span className="text-[22px] font-normal text-ink-3 transition-transform group-open:rotate-45" aria-hidden="true">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="container-x pb-24">
          <div className="rounded-[28px] bg-ink px-6 py-16 text-center text-paper sm:px-12">
            <h2 className="mx-auto max-w-2xl font-display text-[36px] font-extrabold leading-tight tracking-[-0.02em] sm:text-[48px]">
              Your next meeting can take its own notes.
            </h2>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/download" className="btn-accent w-full sm:w-auto">
                <WindowsIcon /> Download for Windows — free
              </Link>
            </div>
            <div className="mx-auto mt-8 flex max-w-md flex-col items-center gap-2">
              <span className="text-[13px] text-white/60">On a Mac? Get one email when it’s ready.</span>
              <div className="w-full [&_input]:border-white/20 [&_input]:bg-white/10 [&_input]:text-paper [&_input]:placeholder:text-white/40 [&_button]:border-white/20 [&_button]:bg-white/10 [&_button]:text-paper [&_p]:text-white/80">
                <Waitlist platform="mac" compact />
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
