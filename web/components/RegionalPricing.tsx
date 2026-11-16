'use client'

import { useEffect, useState } from 'react'
import { TIER_PRICES, formatUsd, type PlanKind } from '@/lib/regions'

// Pricing cards with the visitor's regional price (from /api/region, which
// reads Cloudflare's country header). Renders tier 1 first, then swaps.

interface PlanCopy {
  name: string
  tagline: string
  cta: string
  features: string[]
}

export function useRegionPrices(): { country: string | null; prices: Record<PlanKind, number> } {
  const [state, setState] = useState<{ country: string | null; prices: Record<PlanKind, number> }>({
    country: null,
    prices: TIER_PRICES[1]
  })
  useEffect(() => {
    const preview = new URLSearchParams(window.location.search).get('country')
    fetch(`/api/region${preview ? `?country=${encodeURIComponent(preview)}` : ''}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.prices && setState({ country: d.country ?? null, prices: d.prices }))
      .catch(() => {})
  }, [])
  return state
}

function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

/** A single regional price, e.g. inside a sentence on the home page. */
export function RegionalPrice({ plan }: { plan: PlanKind }) {
  const { prices } = useRegionPrices()
  return <>{formatUsd(prices[plan])}</>
}

function Check() {
  return (
    <svg viewBox="0 0 20 20" className="mt-[3px] h-4 w-4 flex-none text-accent-ink" fill="currentColor" aria-hidden="true">
      <path d="M8.1 13.6 4.5 10l-1.1 1.1 4.7 4.7L17 6.9l-1.1-1.1z" />
    </svg>
  )
}

export function RegionalPricing({
  locale,
  downloadUrl,
  copy
}: {
  locale: string
  downloadUrl: string
  copy: {
    title: string
    sub: string
    pricesFor: string
    perMonth: string
    forever: string
    popular: string
    free: PlanCopy
    pro: PlanCopy
    max: PlanCopy
    topup: string
  }
}) {
  const { country, prices } = useRegionPrices()
  const plans: { key: 'free' | 'pro' | 'max'; price: string; per: string; c: PlanCopy; featured?: boolean }[] = [
    { key: 'free', price: '$0', per: copy.forever, c: copy.free },
    { key: 'pro', price: formatUsd(prices.pro), per: copy.perMonth, c: copy.pro, featured: true },
    { key: 'max', price: formatUsd(prices.max), per: copy.perMonth, c: copy.max }
  ]

  return (
    <div>
      <div className="text-center">
        <h2 className="h-section">{copy.title}</h2>
        <p className="mx-auto mt-4 max-w-2xl text-[16px] text-ink-2">{copy.sub}</p>
        {country && (
          <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1 text-[13px] text-ink-2">
            <span className="h-2 w-2 rounded-full bg-[#16A34A]" /> {copy.pricesFor} {countryName(country, locale)}
          </p>
        )}
      </div>
      <div className="mx-auto mt-10 grid max-w-5xl gap-5 md:grid-cols-3">
        {plans.map((p) => (
          <div
            key={p.key}
            className={`relative rounded-xl2 bg-white p-7 ${p.featured ? 'border-2 border-ink' : 'border border-line'}`}
          >
            {p.featured && (
              <span className="absolute -top-3 right-6 rounded-full bg-accent px-3 py-1 text-[12px] font-semibold text-white">
                {copy.popular}
              </span>
            )}
            <div className="font-display text-[22px] font-bold">{p.c.name}</div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="font-display text-[42px] font-extrabold">{p.price}</span>
              <span className="text-ink-3">{p.per}</span>
            </div>
            <p className="mt-1 text-[14px] text-ink-3">{p.c.tagline}</p>
            <a href={downloadUrl} className={`${p.featured ? 'btn-primary' : 'btn-ghost'} mt-6 w-full text-center`}>
              {p.c.cta}
            </a>
            <ul className="mt-6 space-y-2.5 text-[14.5px] text-ink-2">
              {p.c.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <Check /> {f}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mx-auto mt-6 max-w-2xl text-center text-[13px] text-ink-3">
        {copy.topup.replace('{hours}', '10').replace('{price}', formatUsd(prices.topup))}
      </p>
    </div>
  )
}
