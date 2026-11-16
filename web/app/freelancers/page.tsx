import type { Metadata } from 'next'
import Link from 'next/link'
import { Footer, Nav, WindowsIcon } from '@/components/Chrome'
import { QuestionCardDemo } from '@/components/QuestionCardDemo'
import { Waitlist } from '@/components/Waitlist'
import { PLANS, SITE } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Never miss what your client asked',
  description:
    'Minutama shows every question your client asks on your screen, in your own language, and turns the call into a brief, an estimate and a follow-up email. Free for Windows.',
  alternates: { canonical: '/freelancers' },
  openGraph: {
    title: 'Never miss what your client asked · Minutama',
    description: 'Client questions on your screen, in your language. Brief, estimate and follow-up after the call.'
  }
}

const STEPS = [
  {
    n: '1',
    title: 'Before the call',
    text: 'Paste the job post or your proposal. Minutama learns the project, so “Lambda” means AWS and “Next” means Next.js.'
  },
  {
    n: '2',
    title: 'During the call',
    text: 'Every question the client asks appears in a small card: their exact words, and the same question in your language.'
  },
  {
    n: '3',
    title: 'After the call',
    text: 'Get the project brief, a draft estimate with hours, open points to clarify and a follow-up email ready to send.'
  }
]

const OUTPUTS = [
  {
    title: 'Project brief',
    lines: ['Goal: a booking app for 3 clinics', 'Scope: patient app + admin panel', 'Budget: $4–5k, fixed price', 'Deadline: MVP by 30 June']
  },
  {
    title: 'Estimate draft',
    lines: ['Auth + profiles · 10 h', 'Booking calendar · 24 h', 'Admin panel · 18 h', 'Total · 52 h (draft, edit before sending)']
  },
  {
    title: 'Follow-up email',
    lines: ['Hi Sarah, thanks for the call!', 'To confirm: patient app + admin panel…', 'Open point: who provides the designs?', 'Next step: I send the estimate by Friday.']
  }
]

const FAQ = [
  {
    q: 'Does Minutama answer for me?',
    a: 'No. It shows the question and helps you understand it; you answer in your own words. It is a helper for understanding your client and remembering what was agreed, not a script reader.'
  },
  {
    q: 'Does a bot join the call?',
    a: 'No. Minutama runs on your Windows computer and hears your microphone and your computer’s sound. The client sees nothing join.'
  },
  {
    q: 'Do I need to tell the client?',
    a: 'Yes, always. Minutama gives you a one-click message to paste into the call chat, like “I use a note-taking tool so I don’t miss anything, is that OK?”. In many countries, Germany included, recording a conversation without consent is against the law.'
  },
  {
    q: 'Where does the audio go?',
    a: 'Short pieces of audio are sent over an encrypted connection to our transcription provider and are not stored by Minutama. Your notes, briefs and transcripts are saved on your computer.'
  },
  {
    q: 'Which apps does it work with?',
    a: 'Any call on your computer: Zoom, Google Meet, Microsoft Teams, Slack, Upwork calls in the browser, Telegram, WhatsApp, Discord and more.'
  },
  {
    q: 'Which languages?',
    a: 'Client questions can be shown in Ukrainian, Polish, Spanish, Portuguese, German, French, Italian, Russian and English, with more coming. The call itself can be in more than 50 languages.'
  }
]

export default function FreelancersPage() {
  return (
    <>
      <Nav />
      <main>
        {/* ── Hero ── */}
        <section className="container-x grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <p className="eyebrow">For freelancers on client calls</p>
            <h1 className="mt-3 font-display text-[42px] font-extrabold leading-[1.03] tracking-[-0.03em] sm:text-[60px]">
              Never miss what your client asked.
            </h1>
            <p className="mt-5 max-w-xl text-[17.5px] leading-relaxed text-ink-2">
              Minutama listens to your client calls and shows every question on your screen, in your language. After the
              call you get the brief, the estimate and the follow-up email.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href={SITE.downloadUrl} className="btn-accent px-6 py-3.5">
                <WindowsIcon /> Download for Windows, free
              </a>
              <a href="#mac" className="btn-ghost">
                Mac waitlist
              </a>
            </div>
            <p className="mt-3 text-[13px] text-ink-3">
              {PLANS.free.meetingsPerMonth} calls a month free · no card · no bot joins the call
            </p>
          </div>
          <QuestionCardDemo />
        </section>

        {/* ── Pain ── */}
        <section className="border-y border-line bg-sand/60 py-16">
          <div className="container-x max-w-3xl text-center">
            <p className="font-display text-[26px] font-bold leading-snug sm:text-[32px]">
              English is your second language. The client talks fast, uses terms you half know, and you nod along.
            </p>
            <p className="mt-4 text-[17px] text-ink-2">Later you realize you quoted the wrong scope.</p>
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="container-x py-20">
          <h2 className="h-section text-center">How it works</h2>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-xl2 border border-line bg-white p-7">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft font-display font-bold text-accent-ink">
                  {s.n}
                </div>
                <h3 className="mt-4 font-display text-[20px] font-bold">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Outputs ── */}
        <section className="border-t border-line bg-sand/60 py-20">
          <div className="container-x">
            <div className="text-center">
              <p className="eyebrow">After the call</p>
              <h2 className="h-section mt-3">From call to scoped project in a minute</h2>
              <p className="mx-auto mt-4 max-w-2xl text-[16px] text-ink-2">
                Developers can send the agreed scope to Claude Code or Codex as tasks, and approve each one before it runs.
              </p>
            </div>
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {OUTPUTS.map((o) => (
                <div key={o.title} className="rounded-xl2 border border-line bg-white p-6 shadow-window">
                  <div className="text-[12px] font-semibold uppercase tracking-[.12em] text-accent-ink">{o.title}</div>
                  <ul className="mt-3 space-y-2 text-[14.5px] text-ink-2">
                    {o.lines.map((l) => (
                      <li key={l} className="border-b border-line/70 pb-2 last:border-0">
                        {l}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="mt-4 text-center text-[12.5px] text-ink-3">Example output. Your estimate is a draft you edit before sending.</p>
          </div>
        </section>

        {/* ── Trust ── */}
        <section className="container-x py-20">
          <div className="grid gap-5 md:grid-cols-3">
            {[
              { t: 'No bot joins the call', d: 'It runs on your computer. The client sees a normal call.' },
              { t: 'You answer, not the AI', d: 'Minutama helps you understand. It never speaks for you.' },
              { t: 'Honest about your data', d: 'Audio is transcribed and not stored by us. Notes stay on your computer.' }
            ].map((x) => (
              <div key={x.t} className="rounded-xl2 border border-line bg-white p-7">
                <h3 className="font-display text-[19px] font-bold">{x.t}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{x.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Pricing (short) ── */}
        <section className="border-t border-line bg-sand/60 py-20">
          <div className="container-x max-w-3xl text-center">
            <h2 className="h-section">One well-scoped project pays for a year</h2>
            <p className="mt-4 text-[16px] text-ink-2">
              Free: {PLANS.free.meetingsPerMonth} calls a month with live question cards and the brief. Pro {PLANS.pro.price}/month:{' '}
              {PLANS.pro.monthlyHours} hours of calls, unlimited cards, estimate, follow-up and agent tasks.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <a href={SITE.downloadUrl} className="btn-accent">
                <WindowsIcon /> Download free
              </a>
              <Link href="/#pricing" className="btn-ghost">
                See all plans
              </Link>
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="container-x max-w-3xl py-20">
          <h2 className="h-section text-center">Questions</h2>
          <div className="mt-10 divide-y divide-line rounded-xl2 border border-line bg-white">
            {FAQ.map((f) => (
              <details key={f.q} className="group p-6">
                <summary className="cursor-pointer list-none font-semibold text-ink">{f.q}</summary>
                <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section id="mac" className="scroll-mt-20 border-t border-line py-16">
          <div className="container-x max-w-xl text-center">
            <h2 className="font-display text-[26px] font-bold">On a Mac?</h2>
            <p className="mt-2 text-ink-2">Leave your email and we’ll write once when the Mac app is ready.</p>
            <div className="mt-6">
              <Waitlist />
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
