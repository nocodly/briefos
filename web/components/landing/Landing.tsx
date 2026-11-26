import Link from 'next/link'
import { Logo } from '../Logo'
import { WindowsIcon } from '../Chrome'
import { COPY } from '@/lib/freelancers-i18n'
import { SITE } from '@/lib/site'
import { HeroVideo } from './HeroVideo'
import { Icon } from './Icon'
import { Pricing } from './Pricing'

// Home page — dark, in the Minutama app's design (glass + tangerine).
// Section order follows the agreed wireframe (26.11.2026) exactly:
// nav · hero + video · works-with strip · problems · before/after charts ·
// 3 steps · 3 zig-zag features + CTA · real examples + facts strip · pricing ·
// trust strip · FAQ · CTA band · footer.

const t = COPY.en

function Check({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-accent/15 text-accent-hi">
        <Icon name="check" className="h-3.5 w-3.5" />
      </span>
      <span>{children}</span>
    </li>
  )
}

function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="text-center">
      <h2 className="h-dark">{title}</h2>
      {sub && <p className="mx-auto mt-4 max-w-2xl text-[16px] leading-relaxed text-t-2">{sub}</p>}
    </div>
  )
}

/* ── Feature pictures: small, real-looking parts of the app ── */

function PicCaptions() {
  return (
    <div className="glass-card rounded-[20px] p-5">
      <div className="text-[10px] font-semibold uppercase tracking-[.14em] text-accent-pale">Client</div>
      <div className="mt-2 text-[14px] font-medium text-t-1">Have you worked with Stripe subscriptions before?</div>
      <div className="mt-0.5 text-[13.5px] text-[#8FD8F7]">Чи працювали ви раніше з підписками Stripe?</div>
      <div className="mt-3 rounded-lg bg-white/[.04] px-3 py-2 text-[12px] text-t-2">
        <b className="text-[#F5A524]">Stripe</b> — online payments service: cards, subscriptions, invoices
      </div>
    </div>
  )
}

function PicAsk() {
  return (
    <div className="glass-card rounded-[20px] p-5">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full bg-[#F5A524]/20 text-[10px] font-bold text-[#F5A524]">?</span>
        <div className="text-[14px] font-medium text-t-1">How would you set up the deploy — Docker or Vercel?</div>
      </div>
      <div className="mt-3 rounded-xl border border-accent/30 bg-accent/10 p-3 text-[12.5px] leading-relaxed text-t-1">
        <div className="mb-1 flex items-center gap-1.5 font-semibold text-accent-hi">
          <Icon name="sparkles" className="h-3.5 w-3.5" /> Ask AI
        </div>
        For a small site Vercel is simpler. Say: “I’d deploy on Vercel with a staging site first — Docker only if you need your own server.”
      </div>
    </div>
  )
}

function PicNotes() {
  return (
    <div className="glass-card rounded-[20px] p-5">
      <div className="flex items-center justify-between">
        <div className="font-display text-[15px] font-bold text-t-1">Booking site for Anna’s café</div>
        <span className="rounded-full bg-[#22C55E]/15 px-2 py-0.5 text-[11px] font-semibold text-[#22C55E]">Notes ready</span>
      </div>
      <div className="mt-3 space-y-1.5 text-[12.5px] text-t-2">
        <div>• Budget about $2,000, launch in early December</div>
        <div>• Online menu, table bookings, Stripe payments</div>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-white/[.04] px-3 py-2 text-[12.5px] text-t-1">
        <span className="h-4 w-4 rounded border border-white/25" /> Send the estimate · <span className="text-accent-hi">Thu, Nov 26</span>
      </div>
    </div>
  )
}

function ChartBox({ label, rising }: { label: string; rising?: boolean }) {
  return (
    <div className={`rounded-[18px] p-4 ${rising ? 'border border-accent/40 bg-accent/[.07]' : 'glass-card'}`}>
      <div className={`text-[12px] font-semibold ${rising ? 'text-accent-hi' : 'text-t-3'}`}>{label}</div>
      <svg viewBox="0 0 200 90" className="mt-2 h-24 w-full" aria-hidden="true">
        <defs>
          <linearGradient id={rising ? 'gUp' : 'gFlat'} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={rising ? '#FF6A3D' : '#807D78'} stopOpacity=".55" />
            <stop offset="100%" stopColor={rising ? '#FF6A3D' : '#807D78'} stopOpacity=".05" />
          </linearGradient>
        </defs>
        <path
          d={
            rising
              ? 'M0 80 C30 78 50 70 75 66 S120 60 140 45 S175 20 200 8 L200 90 L0 90 Z'
              : 'M0 62 C20 55 35 68 55 64 S90 56 110 63 S150 70 170 62 S190 58 200 63 L200 90 L0 90 Z'
          }
          fill={`url(#${rising ? 'gUp' : 'gFlat'})`}
          stroke={rising ? '#FF8F6B' : '#807D78'}
          strokeWidth="2"
        />
      </svg>
    </div>
  )
}

export function Landing() {
  const faq = [t.faq.items[1], t.faq.items[2], t.faq.items[4], t.faq.items[5]]
  return (
    <div className="night-glow min-h-screen text-t-1">
      {/* ── Nav ── */}
      <header className="sticky top-0 z-40 border-b border-white/[.06] bg-night/80 backdrop-blur">
        <nav className="container-x flex h-16 items-center justify-between">
          <Link href="/" aria-label="Minutama home">
            <Logo />
          </Link>
          <div className="hidden items-center gap-8 text-[14px] font-medium text-t-2 md:flex">
            <a href="#how" className="hover:text-t-1">How it works</a>
            <a href="#features" className="hover:text-t-1">Features</a>
            <a href="#pricing" className="hover:text-t-1">Pricing</a>
            <a href="#faq" className="hover:text-t-1">FAQ</a>
          </div>
          <a href={SITE.downloadUrl} className="btn-glow !px-4 !py-2 text-[14px]">
            <WindowsIcon /> Download free
          </a>
        </nav>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className="container-x grid items-center gap-12 pb-14 pt-12 lg:grid-cols-2 lg:pt-16">
          <div>
            <h1 className="font-display text-[40px] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-[54px]">
              Every client call,
              <span className="block text-accent-hi">in your language.</span>
            </h1>
            <p className="mt-5 max-w-[520px] text-[17px] leading-relaxed text-t-2">
              Live translation, tech-term hints and Ask AI during the call. Notes, tasks and the follow-up email after it.
            </p>
            <a href={SITE.downloadUrl} className="btn-glow mt-8 px-7 py-3.5 text-[15.5px]">
              <WindowsIcon /> Download for Windows, free
            </a>
            <div className="mt-6 flex items-center gap-3">
              <div className="flex -space-x-2">
                {['UK', 'ES', 'PT', 'HI'].map((c) => (
                  <span
                    key={c}
                    className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-night bg-night-3 text-[11px] font-bold text-accent-pale"
                  >
                    {c}
                  </span>
                ))}
              </div>
              <span className="text-[13.5px] text-t-3">Live translation into 18 languages · 10 calls a month free</span>
            </div>
          </div>
          <HeroVideo />
        </section>

        {/* ── Works with ── */}
        <div className="container-x">
          <div className="glass-card flex flex-wrap items-center justify-center gap-x-10 gap-y-3 rounded-[18px] px-6 py-5 text-[15px] font-semibold text-t-3 sm:justify-between">
            {['Zoom', 'Google Meet', 'Microsoft Teams', 'Slack', 'Telegram', 'WhatsApp'].map((n) => (
              <span key={n}>{n}</span>
            ))}
          </div>
        </div>

        {/* ── Problems ── */}
        <section className="container-x py-20">
          <SectionHead title={t.problems.title} sub="Most freelancers know this feeling. Minutama was built for it." />
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              { ...t.problems.items[0], icon: 'bolt' },
              { ...t.problems.items[1], icon: 'book' },
              { ...t.problems.items[5], icon: 'moon' }
            ].map((p) => (
              <div key={p.title} className="glass-card rounded-[20px] p-7 text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent-hi">
                  <Icon name={p.icon} className="h-6 w-6" />
                </span>
                <h3 className="mt-4 font-display text-[19px] font-bold">{p.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-t-2">{p.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Before / after ── */}
        <section className="glass-band py-16">
          <div className="container-x grid items-center gap-10 lg:grid-cols-[1fr_1.15fr]">
            <div>
              <h2 className="h-dark">
                Stop guessing.
                <span className="block">Catch every question.</span>
              </h2>
              <ul className="mt-6 space-y-3 text-[15.5px] text-t-2">
                <Check>Every question on screen, in your language</Check>
                <Check>Scope, budget and deadlines written down for you</Check>
                <Check>An answer ready when you freeze</Check>
              </ul>
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <ChartBox label="Without Minutama" />
              <Icon name="arrow" className="h-6 w-6 text-t-3" />
              <ChartBox label="With Minutama" rising />
            </div>
          </div>
        </section>

        {/* ── 3 steps ── */}
        <section id="how" className="container-x scroll-mt-20 py-20">
          <SectionHead title="How it works" sub="Three steps. Nothing to set up in Zoom or Meet." />
          <div className="relative mt-12 grid gap-10 md:grid-cols-3">
            <div className="absolute left-[16.6%] right-[16.6%] top-7 hidden h-px bg-white/10 md:block" />
            {[
              { icon: 'cursor', title: 'Start the call', text: 'Join on any app and press Start call — or Minutama asks on its own.' },
              { icon: 'gear', title: 'Minutama listens', text: 'Live captions in your language, term hints and Ask AI on any line.' },
              { icon: 'done', title: 'Get the result', text: 'Notes, tasks with dates and a follow-up email in the client’s language.' }
            ].map((s) => (
              <div key={s.title} className="relative text-center">
                <span className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-night-3 text-accent-hi">
                  <Icon name={s.icon} className="h-6 w-6" />
                </span>
                <h3 className="mt-4 font-display text-[18px] font-bold">{s.title}</h3>
                <p className="mx-auto mt-1.5 max-w-[260px] text-[14.5px] leading-relaxed text-t-2">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Features (zig-zag) ── */}
        <section id="features" className="container-x scroll-mt-20 space-y-16 pb-20">
          <div className="grid items-center gap-10 md:grid-cols-2">
            <PicCaptions />
            <div>
              <h3 className="font-display text-[26px] font-bold leading-tight">Live captions in your language</h3>
              <ul className="mt-5 space-y-3 text-[15px] text-t-2">
                <Check>Short pieces you can read while the client talks</Check>
                <Check>First words of the translation in about half a second</Check>
                <Check>Tech terms like Stripe, Docker or API explained in one line</Check>
              </ul>
            </div>
          </div>
          <div className="grid items-center gap-10 md:grid-cols-2">
            <div className="md:order-1">
              <h3 className="font-display text-[26px] font-bold leading-tight">Ask AI when you freeze</h3>
              <ul className="mt-5 space-y-3 text-[15px] text-t-2">
                <Check>Click any question the client asked</Check>
                <Check>See what it means and a short answer to say</Check>
                <Check>You answer in your words — the AI never speaks for you</Check>
              </ul>
            </div>
            <div className="md:order-2">
              <PicAsk />
            </div>
          </div>
          <div className="grid items-center gap-10 md:grid-cols-2">
            <PicNotes />
            <div>
              <h3 className="font-display text-[26px] font-bold leading-tight">Notes, tasks and the email — done</h3>
              <ul className="mt-5 space-y-3 text-[15px] text-t-2">
                <Check>A clear brief: scope, budget, deadline, open points</Check>
                <Check>Tasks with real dates, one click to your calendar</Check>
                <Check>A follow-up email written in the client’s language</Check>
              </ul>
            </div>
          </div>
          <div className="text-center">
            <a href={SITE.downloadUrl} className="btn-glow px-8 py-3.5 text-[15.5px]">
              <WindowsIcon /> Try it on your next call
            </a>
          </div>
        </section>

        {/* ── Real examples + facts ── */}
        <section className="glass-band py-20">
          <div className="container-x">
            <SectionHead title="What it looks like on a real call" sub="Typical questions from client calls, and what you see on your screen." />
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {[
                { who: 'A', role: 'Café owner', q: 'Can you continue from the GitHub repo my nephew started?', a: 'Hint: GitHub repo — where the site’s code is stored.' },
                { who: 'M', role: 'Startup founder', q: 'Would you set up GitHub Actions for the builds?', a: 'Hint: GitHub Actions — builds and checks the code by itself.' },
                { who: 'L', role: 'Agency manager', q: 'Do you charge a fixed price or hourly?', a: 'Ask AI: “Fixed price per milestone, estimate by Friday.”' }
              ].map((c) => (
                <div key={c.q} className="glass-card rounded-[20px] p-6">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-night-3 font-display font-bold text-accent-pale">
                      {c.who}
                    </span>
                    <Icon name="quote" className="h-5 w-5 text-accent-hi" />
                  </div>
                  <p className="mt-3 text-[15px] font-medium leading-snug text-t-1">“{c.q}”</p>
                  <p className="mt-2 text-[13.5px] leading-snug text-t-2">{c.a}</p>
                  <p className="mt-4 text-[12px] font-medium uppercase tracking-[.1em] text-t-3">Example · {c.role}</p>
                </div>
              ))}
            </div>
            <div className="glass-card mt-5 grid items-center gap-6 rounded-[20px] p-5 sm:grid-cols-[1.1fr_1fr_1fr_1fr]">
              <div className="rounded-xl bg-night-3 p-4 text-[12.5px]">
                <div className="text-t-3">Client</div>
                <div className="font-medium text-t-1">Could you send the estimate by Friday?</div>
                <div className="text-[#8FD8F7]">¿Podrías enviar el presupuesto el viernes?</div>
              </div>
              {[
                ['~0.6 s', 'to the first words of the translation'],
                ['18', 'languages for captions and notes'],
                ['0', 'bots joining your call']
              ].map(([n, l]) => (
                <div key={l} className="flex items-center gap-3 sm:justify-center">
                  <Icon name="bars" className="h-7 w-7 flex-none text-accent-hi" />
                  <div>
                    <div className="font-display text-[26px] font-extrabold leading-none text-t-1">{n}</div>
                    <div className="mt-1 text-[12.5px] leading-snug text-t-3">{l}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Pricing ── */}
        <section id="pricing" className="container-x scroll-mt-20 py-20">
          <SectionHead title={t.pricing.title} sub={t.pricing.sub} />
          <Pricing
            downloadUrl={SITE.downloadUrl}
            free={t.pricing.free}
            pro={t.pricing.pro}
            max={t.pricing.max}
            perMonth={t.pricing.perMonth}
            forever={t.pricing.forever}
            popular={t.pricing.popular}
            topup={t.pricing.topup}
          />
        </section>

        {/* ── Trust strip ── */}
        <div className="container-x">
          <div className="glass-card grid gap-5 rounded-[18px] px-6 py-5 sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-white/10">
            {[
              ['shield', 'No bot joins the call', 'The client sees a normal call'],
              ['refresh', 'Updates by themselves', 'Always the newest version'],
              ['lock', 'Audio is not stored', 'Notes stay on your computer'],
              ['headset', 'Real support', SITE.email]
            ].map(([icon, title, text]) => (
              <div key={title} className="flex items-center gap-3 lg:justify-center lg:px-2">
                <Icon name={icon} className="h-6 w-6 flex-none text-accent-hi" />
                <div>
                  <div className="text-[14px] font-semibold text-t-1">{title}</div>
                  <div className="text-[12.5px] text-t-3">{text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── FAQ ── */}
        <section id="faq" className="container-x max-w-3xl scroll-mt-20 py-20">
          <SectionHead title="Questions" />
          <div className="mt-10 space-y-3">
            {faq.map((f) => (
              <details key={f.q} className="glass-card group rounded-[14px] px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-t-1">
                  {f.q}
                  <Icon name="chevron" className="h-5 w-5 flex-none text-t-3 transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-[15px] leading-relaxed text-t-2">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ── CTA band ── */}
        <section className="container-x pb-16">
          <div className="relative overflow-hidden rounded-[24px] border border-accent/30 bg-[linear-gradient(110deg,rgba(255,106,61,.22),rgba(255,106,61,.06)_55%,rgba(255,150,95,.18))] px-7 py-9 sm:px-10">
            <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
              <div>
                <h2 className="font-display text-[28px] font-bold leading-tight sm:text-[32px]">{t.final.title}</h2>
                <p className="mt-2 text-[15.5px] text-t-2">{t.final.sub}</p>
              </div>
              <a href={SITE.downloadUrl} className="btn-glow flex-none px-7 py-3.5 text-[15.5px]">
                <WindowsIcon /> {t.final.cta}
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-white/[.06]">
        <div className="container-x flex flex-col items-center justify-between gap-5 py-8 text-[13.5px] text-t-3 md:flex-row">
          <div className="flex items-center gap-3">
            <Logo />
          </div>
          <div className="flex flex-wrap justify-center gap-x-7 gap-y-2">
            <Link href="/privacy" className="hover:text-t-1">Privacy</Link>
            <Link href="/terms" className="hover:text-t-1">Terms</Link>
            <Link href="/impressum" className="hover:text-t-1">Impressum</Link>
            <Link href="/account" className="hover:text-t-1">Verträge hier kündigen</Link>
          </div>
          <div className="flex items-center gap-2">
            {[
              ['mail', `mailto:${SITE.email}`, 'Email us'],
              ['download', SITE.downloadUrl, 'Download'],
              ['user', '/account', 'Your subscription']
            ].map(([icon, href, label]) => (
              <a key={icon} href={href} aria-label={label} title={label} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[.06] text-t-2 hover:bg-white/[.12] hover:text-t-1">
                <Icon name={icon} className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>
        <div className="container-x pb-8 text-center text-[12.5px] text-t-3 md:text-left">© {new Date().getFullYear()} Minutama</div>
      </footer>
    </div>
  )
}
