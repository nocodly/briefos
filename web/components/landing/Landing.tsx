import Link from 'next/link'
import { Logo } from '../Logo'
import { WindowsIcon } from '../Chrome'
import { COPY } from '@/lib/freelancers-i18n'
import { L, type LandingLocale } from '@/lib/landing-i18n'
import { SITE } from '@/lib/site'
import { BRANDS } from './brands'
import { HeroVideo } from './HeroVideo'
import { HeroFlow } from './HeroFlow'
import { AnimatedChart, AskDemo, Faq, HardQuestionDemo, ShareDemo } from './Demos'
import { Icon } from './Icon'
import { Pricing } from './Pricing'

// Home page — dark, in the Minutama app's design (glass + tangerine), English
// at / and Spanish at /es. Section order follows the agreed wireframe
// (26.11.2026): nav · hero + video · works-with strip · problems · before/after
// charts · 3 steps · 3 zig-zag features + CTA · examples + facts strip ·
// pricing · trust strip · FAQ · CTA band · footer.

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

export function Landing({ locale = 'en' }: { locale?: LandingLocale }) {
  const s = L[locale]
  const c = COPY[locale]
  const home = locale === 'es' ? '/es' : '/'
  const faq = [c.faq.items[1], c.faq.items[2], c.faq.items[4], c.faq.items[5]]

  return (
    <div lang={locale} className="night-glow min-h-screen text-t-1">
      {/* ── Nav ── */}
      <header className="sticky top-0 z-40 border-b border-white/[.06] bg-night/80 backdrop-blur">
        <nav className="container-x flex h-16 items-center justify-between gap-3">
          <Link href={home} aria-label="Minutama home">
            <Logo />
          </Link>
          <div className="hidden items-center gap-8 text-[14px] font-medium text-t-2 md:flex">
            <a href="#how" className="hover:text-t-1">{s.nav.how}</a>
            <a href="#features" className="hover:text-t-1">{s.nav.features}</a>
            <a href="#pricing" className="hover:text-t-1">{s.nav.pricing}</a>
            <a href="#faq" className="hover:text-t-1">{s.nav.faq}</a>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex rounded-full bg-white/[.06] p-0.5 text-[12px] font-semibold">
              {(['en', 'es'] as const).map((l) => (
                <Link
                  key={l}
                  href={l === 'es' ? '/es' : '/'}
                  hrefLang={l}
                  className={`rounded-full px-2.5 py-1 uppercase ${l === locale ? 'bg-white/[.14] text-t-1' : 'text-t-3 hover:text-t-1'}`}
                >
                  {l}
                </Link>
              ))}
            </div>
            <a href={SITE.downloadUrl} className="btn-glow !px-4 !py-2 text-[14px]">
              <WindowsIcon /> <span className="hidden sm:inline">{s.nav.download}</span>
            </a>
          </div>
        </nav>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className="container-x grid items-center gap-10 pb-14 pt-12 lg:grid-cols-[1fr_1.12fr] lg:pt-16">
          <div>
            <h1 className="font-display text-[38px] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-[52px]">
              {s.hero.title1}
              <span className="block text-accent-hi">{s.hero.title2}</span>
            </h1>
            <p className="mt-5 max-w-[520px] text-[17px] leading-relaxed text-t-2">{s.hero.sub}</p>
            <a href={SITE.downloadUrl} className="btn-glow mt-8 px-7 py-3.5 text-[15.5px]">
              <WindowsIcon /> {s.hero.cta}
            </a>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <div className="flex -space-x-2">
                {['UK', 'ES', 'PT', 'HI', 'TR', 'AR'].map((code) => (
                  <span
                    key={code}
                    className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-night bg-night-3 text-[11px] font-bold text-accent-pale"
                  >
                    {code}
                  </span>
                ))}
              </div>
              <span className="text-[13.5px] text-t-3">{s.hero.langs}</span>
            </div>
          </div>
          <HeroFlow clientsSpeak={s.flow.clients} youSee={s.flow.you} />
        </section>

        {/* ── Works with ── */}
        <div className="container-x">
          <div className="glass-card marquee overflow-hidden rounded-[18px] py-5">
            <div className="flex w-max animate-marquee items-center gap-12 pr-12">
              {[...BRANDS, ...BRANDS].map((b, i) => (
                <span key={`${b.name}${i}`} className="flex items-center gap-2.5 text-t-2" aria-hidden={i >= BRANDS.length}>
                  <svg viewBox="0 0 24 24" className="h-6 w-6 flex-none" fill="currentColor" aria-hidden="true">
                    <path d={b.path} />
                  </svg>
                  <span className="whitespace-nowrap text-[15px] font-semibold">{b.name}</span>
                </span>
              ))}
            </div>
          </div>
          <p className="mt-3 text-center text-[13px] text-t-3">{s.works}</p>
        </div>

        {/* ── The call demo (video) ── */}
        <section className="container-x pt-20">
          <SectionHead title={s.demo.videoTitle} sub={s.demo.videoSub} />
          <div className="mx-auto mt-10 max-w-[620px] lg:[zoom:1.32]">
            <HeroVideo
              labels={s.video}
              answer="Un webhook es un aviso de Stripe a tu servidor cuando un pago se completa. Di: “I’d add a Stripe webhook that confirms each booking as soon as the payment succeeds.”"
            />
          </div>
        </section>

        {/* ── Problems ── */}
        <section className="container-x py-20">
          <SectionHead title={c.problems.title} sub={s.problemsSub} />
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              { ...c.problems.items[0], icon: 'bolt' },
              { ...c.problems.items[1], icon: 'book' },
              { ...c.problems.items[5], icon: 'moon' }
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
                {s.band.title1}
                <span className="block">{s.band.title2}</span>
              </h2>
              <ul className="mt-6 space-y-3 text-[15.5px] text-t-2">
                {s.band.checks.map((x) => (
                  <Check key={x}>{x}</Check>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <AnimatedChart label={s.band.without} />
              <Icon name="arrow" className="h-6 w-6 text-t-3" />
              <AnimatedChart label={s.band.with} rising delay={450} />
            </div>
          </div>
        </section>

        {/* ── 3 steps ── */}
        <section id="how" className="container-x scroll-mt-20 py-20">
          <SectionHead title={s.steps.title} sub={s.steps.sub} />
          <div className="relative mt-12 grid gap-10 md:grid-cols-3">
            <div className="absolute left-[16.6%] right-[16.6%] top-7 hidden h-px bg-white/10 md:block" />
            {s.steps.items.map((st, i) => (
              <div key={st.title} className="relative text-center">
                <span className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-night-3 text-accent-hi">
                  <Icon name={['cursor', 'gear', 'done'][i]} className="h-6 w-6" />
                </span>
                <h3 className="mt-4 font-display text-[18px] font-bold">{st.title}</h3>
                <p className="mx-auto mt-1.5 max-w-[260px] text-[14.5px] leading-relaxed text-t-2">{st.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Features (zig-zag) ── */}
        <section id="features" className="container-x scroll-mt-20 space-y-16 pb-20">
          {s.features.map((f, i) => {
            const pic =
              i === 0 ? (
                <HardQuestionDemo clientLabel={s.video.client} hintLabel={s.demo.hint} />
              ) : i === 1 ? (
                <AskDemo askLabel={s.demo.ask} />
              ) : (
                <ShareDemo
                  title={s.pics.notesTitle}
                  ready={s.pics.notesReady}
                  notes={s.pics.notes}
                  task={s.pics.task}
                  due={s.pics.due}
                  share={s.demo.share}
                />
              )
            return (
              <div key={f.title} className="grid items-center gap-10 md:grid-cols-2">
                <div className={i === 1 ? 'md:order-2' : ''}>{pic}</div>
                <div className={i === 1 ? 'md:order-1' : ''}>
                  <h3 className="font-display text-[26px] font-bold leading-tight">{f.title}</h3>
                  <ul className="mt-5 space-y-3 text-[15px] text-t-2">
                    {f.checks.map((x) => (
                      <Check key={x}>{x}</Check>
                    ))}
                  </ul>
                </div>
              </div>
            )
          })}
          <div className="text-center">
            <a href={SITE.downloadUrl} className="btn-glow px-8 py-3.5 text-[15.5px]">
              <WindowsIcon /> {s.featuresCta}
            </a>
          </div>
        </section>

        {/* ── Examples + facts ── */}
        <section className="glass-band py-20">
          <div className="container-x">
            <SectionHead title={s.examples.title} sub={s.examples.sub} />
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {s.examples.cards.map((x) => (
                <div key={x.q} className="glass-card rounded-[20px] p-6">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-night-3 font-display font-bold text-accent-pale">{x.who}</span>
                    <Icon name="quote" className="h-5 w-5 text-accent-hi" />
                  </div>
                  <p className="mt-3 text-[15px] font-medium leading-snug text-t-1">“{x.q}”</p>
                  <p className="mt-2 text-[13.5px] leading-snug text-t-2">{x.a}</p>
                  <p className="mt-4 text-[12px] font-medium uppercase tracking-[.1em] text-t-3">
                    {s.examples.label} · {x.role}
                  </p>
                </div>
              ))}
            </div>
            <div className="glass-card mt-5 grid items-center gap-6 rounded-[20px] p-5 sm:grid-cols-[1.1fr_1fr_1fr_1fr]">
              <div className="rounded-xl bg-night-3 p-4 text-[12.5px]">
                <div className="text-t-3">{s.video.client}</div>
                <div className="font-medium text-t-1">Could you send the estimate by Friday?</div>
                <div className="text-[#8FD8F7]">¿Podrías enviar el presupuesto el viernes?</div>
              </div>
              {s.examples.facts.map(([n, l]) => (
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
          <SectionHead title={c.pricing.title} sub={c.pricing.sub} />
          <Pricing
            downloadUrl={SITE.downloadUrl}
            free={c.pricing.free}
            pro={c.pricing.pro}
            max={c.pricing.max}
            perMonth={c.pricing.perMonth}
            forever={c.pricing.forever}
            popular={c.pricing.popular}
            topup={c.pricing.topup}
          />
        </section>

        {/* ── Trust strip ── */}
        <div className="container-x">
          <div className="glass-card grid gap-5 rounded-[18px] px-6 py-5 sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-white/10">
            {s.trust.map(([title, text], i) => (
              <div key={title} className="flex items-center gap-3 lg:justify-center lg:px-2">
                <Icon name={['shield', 'refresh', 'lock', 'headset'][i]} className="h-6 w-6 flex-none text-accent-hi" />
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
          <SectionHead title={s.faqTitle} />
          <Faq items={faq} />
        </section>

        {/* ── CTA band ── */}
        <section className="container-x pb-16">
          <div className="relative overflow-hidden rounded-[24px] border border-accent/30 bg-[linear-gradient(110deg,rgba(255,106,61,.22),rgba(255,106,61,.06)_55%,rgba(255,150,95,.18))] px-7 py-9 sm:px-10">
            <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
              <div>
                <h2 className="font-display text-[28px] font-bold leading-tight sm:text-[32px]">{c.final.title}</h2>
                <p className="mt-2 text-[15.5px] text-t-2">{c.final.sub}</p>
              </div>
              <a href={SITE.downloadUrl} className="btn-glow flex-none px-7 py-3.5 text-[15.5px]">
                <WindowsIcon /> {c.final.cta}
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-white/[.06]">
        <div className="container-x flex flex-col items-center justify-between gap-5 py-8 text-[13.5px] text-t-3 md:flex-row">
          <Logo />
          <div className="flex flex-wrap justify-center gap-x-7 gap-y-2">
            <Link href="/privacy" className="hover:text-t-1">{s.footer.privacy}</Link>
            <Link href="/terms" className="hover:text-t-1">{s.footer.terms}</Link>
            <Link href="/impressum" className="hover:text-t-1">{s.footer.impressum}</Link>
            <Link href="/account" className="hover:text-t-1">{s.footer.cancel}</Link>
          </div>
          <div className="flex items-center gap-2">
            {(
              [
                ['mail', `mailto:${SITE.email}`, s.footer.mail],
                ['download', SITE.downloadUrl, s.footer.download],
                ['user', '/account', s.footer.account]
              ] as const
            ).map(([icon, href, label]) => (
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
