import Link from 'next/link'
import { AfterCallDemo } from './AfterCallDemo'
import { Footer, Nav, WindowsIcon } from './Chrome'
import { LiveCallDemo } from './LiveCallDemo'
import { QuestionCardDemo } from './QuestionCardDemo'
import { RegionalPricing } from './RegionalPricing'
import { Waitlist } from './Waitlist'
import { COPY, type Locale } from '@/lib/freelancers-i18n'
import { SITE } from '@/lib/site'

const LOCALES: { id: Locale; label: string; href: string }[] = [
  { id: 'en', label: 'English', href: '/freelancers' },
  { id: 'es', label: 'Español', href: '/es/freelancers' },
  { id: 'pt', label: 'Português', href: '/pt/freelancers' }
]

export function FreelancersLanding({ locale }: { locale: Locale }) {
  const t = COPY[locale]
  const demoLang = locale === 'en' ? undefined : locale

  return (
    <>
      <Nav />
      <main>
        {/* Language switch */}
        <div className="container-x flex justify-end gap-3 pt-4 text-[13px]">
          {LOCALES.map((l) => (
            <Link
              key={l.id}
              href={l.href}
              hrefLang={l.id}
              className={l.id === locale ? 'font-semibold text-ink' : 'text-ink-3 hover:text-ink'}
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* ── Hero ── */}
        <section className="container-x grid items-center gap-12 pb-16 pt-8 sm:pb-20 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <p className="eyebrow">{t.hero.eyebrow}</p>
            <h1 className="mt-3 font-display text-[40px] font-extrabold leading-[1.03] tracking-[-0.03em] sm:text-[58px]">
              {t.hero.title}
            </h1>
            <p className="mt-5 max-w-xl text-[17.5px] leading-relaxed text-ink-2">{t.hero.sub}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href={SITE.downloadUrl} className="btn-accent px-6 py-3.5">
                <WindowsIcon /> {t.hero.cta}
              </a>
              <a href="#mac" className="btn-ghost">
                {t.hero.mac}
              </a>
            </div>
            <p className="mt-3 text-[13px] text-ink-3">{t.hero.note}</p>
          </div>
          <QuestionCardDemo defaultLang={demoLang} labels={t.demo} />
        </section>

        {/* ── Problems ── */}
        <section className="border-y border-line bg-sand/60 py-20">
          <div className="container-x">
            <div className="text-center">
              <p className="eyebrow">{t.problems.eyebrow}</p>
              <h2 className="h-section mt-3">{t.problems.title}</h2>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {t.problems.items.map((p, i) => (
                <div
                  key={p.title}
                  className="animate-rise rounded-xl2 border border-line bg-white p-6 transition-transform duration-300 hover:-translate-y-1"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <div className="text-[26px]" aria-hidden="true">
                    {p.icon}
                  </div>
                  <h3 className="mt-3 font-display text-[18px] font-bold">{p.title}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{p.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Live demo ── */}
        <section className="container-x py-20">
          <div className="text-center">
            <p className="eyebrow">{t.live.eyebrow}</p>
            <h2 className="h-section mt-3">{t.live.title}</h2>
            <p className="mx-auto mt-4 max-w-2xl text-[16px] text-ink-2">{t.live.sub}</p>
          </div>
          <div className="mt-12">
            <LiveCallDemo
              labels={{ call: t.live.call, questions: t.live.questions, scope: t.live.scope, unclear: t.live.unclear, asked: t.demo.asked, you: t.live.you, client: t.live.client }}
              scopeItems={t.live.scopeItems}
              unclearItems={t.live.unclearItems}
              translations={t.live.translations}
            />
          </div>
        </section>

        {/* ── Steps ── */}
        <section className="border-t border-line bg-sand/60 py-20">
          <div className="container-x">
            <h2 className="h-section text-center">{t.steps.title}</h2>
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {t.steps.items.map((s, i) => (
                <div key={s.title} className="rounded-xl2 border border-line bg-white p-7">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft font-display font-bold text-accent-ink">
                    {i + 1}
                  </div>
                  <h3 className="mt-4 font-display text-[20px] font-bold">{s.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── After the call ── */}
        <section className="container-x py-20">
          <div className="text-center">
            <p className="eyebrow">{t.after.eyebrow}</p>
            <h2 className="h-section mt-3">{t.after.title}</h2>
            <p className="mx-auto mt-4 max-w-2xl text-[16px] text-ink-2">{t.after.sub}</p>
          </div>
          <div className="mt-10">
            <AfterCallDemo tabs={t.after.tabs} />
          </div>
          <p className="mt-4 text-center text-[12.5px] text-ink-3">{t.after.note}</p>
        </section>

        {/* ── Before / after ── */}
        <section className="border-t border-line bg-sand/60 py-20">
          <div className="container-x max-w-4xl">
            <h2 className="h-section text-center">{t.compare.title}</h2>
            <div className="mt-10 overflow-hidden rounded-xl2 border border-line bg-white">
              <div className="grid grid-cols-[1fr_1fr_1.2fr] bg-sand px-4 py-3 text-[12px] font-semibold uppercase tracking-[.1em] text-ink-3 sm:px-6">
                <span />
                <span>{t.compare.without}</span>
                <span className="text-accent-ink">{t.compare.with}</span>
              </div>
              {t.compare.rows.map(([label, before, after]) => (
                <div key={label} className="grid grid-cols-[1fr_1fr_1.2fr] gap-3 border-t border-line px-4 py-4 text-[14px] sm:px-6 sm:text-[15px]">
                  <span className="font-semibold text-ink">{label}</span>
                  <span className="text-ink-3">✕ {before}</span>
                  <span className="text-ink">✓ {after}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Trust ── */}
        <section className="container-x py-20">
          <div className="grid gap-5 md:grid-cols-3">
            {t.trust.map((x) => (
              <div key={x.title} className="rounded-xl2 border border-line bg-white p-7">
                <h3 className="font-display text-[19px] font-bold">{x.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{x.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Pricing ── */}
        <section id="pricing" className="scroll-mt-20 border-t border-line bg-sand/60 py-20">
          <div className="container-x">
            <RegionalPricing locale={locale} downloadUrl={SITE.downloadUrl} copy={t.pricing} />
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="container-x max-w-3xl py-20">
          <h2 className="h-section text-center">{t.faq.title}</h2>
          <div className="mt-10 divide-y divide-line rounded-xl2 border border-line bg-white">
            {t.faq.items.map((f) => (
              <details key={f.q} className="group p-6">
                <summary className="cursor-pointer list-none font-semibold text-ink">{f.q}</summary>
                <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="bg-ink py-20 text-paper">
          <div className="container-x max-w-3xl text-center">
            <h2 className="font-display text-[34px] font-bold leading-tight sm:text-[42px]">{t.final.title}</h2>
            <p className="mt-4 text-[17px] text-paper/70">{t.final.sub}</p>
            <a href={SITE.downloadUrl} className="btn-accent mt-8 px-7 py-4 text-[16px]">
              <WindowsIcon /> {t.final.cta}
            </a>
          </div>
        </section>

        <section id="mac" className="scroll-mt-20 py-16">
          <div className="container-x max-w-xl text-center">
            <h2 className="font-display text-[26px] font-bold">{t.final.macTitle}</h2>
            <p className="mt-2 text-ink-2">{t.final.macText}</p>
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
