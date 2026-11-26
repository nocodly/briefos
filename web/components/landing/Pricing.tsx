'use client'

import { useRegionPrices } from '../RegionalPricing'
import { formatUsd } from '@/lib/regions'
import { Icon } from './Icon'

// Three plans; the middle one (Pro) highlighted. Prices follow the visitor's
// country (same logic as before, /api/region).

interface Plan {
  name: string
  tagline: string
  cta: string
  features: string[]
}

export function Pricing({
  downloadUrl,
  free,
  pro,
  max,
  perMonth,
  forever,
  popular,
  topup
}: {
  downloadUrl: string
  free: Plan
  pro: Plan
  max: Plan
  perMonth: string
  forever: string
  popular: string
  topup: string
}) {
  const { prices } = useRegionPrices()
  const plans = [
    { key: 'free', p: free, price: '$0', per: forever },
    { key: 'pro', p: pro, price: formatUsd(prices.pro), per: perMonth, featured: true },
    { key: 'max', p: max, price: formatUsd(prices.max), per: perMonth }
  ]
  return (
    <>
      <div className="mx-auto mt-10 grid max-w-5xl gap-5 md:grid-cols-3">
        {plans.map(({ key, p, price, per, featured }) => (
          <div
            key={key}
            className={`relative flex flex-col rounded-[20px] p-7 ${
              featured ? 'border-2 border-accent bg-accent/[.08] shadow-[0_20px_60px_-25px_rgba(255,106,61,.55)]' : 'glass-card'
            }`}
          >
            {featured && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-1 text-[12px] font-semibold text-white">
                {popular}
              </span>
            )}
            <div className="text-center">
              <div className="font-display text-[20px] font-bold text-t-1">{p.name}</div>
              <div className="mt-1 flex items-baseline justify-center gap-1">
                <span className="font-display text-[38px] font-extrabold text-t-1">{price}</span>
                <span className="text-[14px] text-t-3">{per}</span>
              </div>
              <p className="text-[13.5px] text-t-3">{p.tagline}</p>
            </div>
            <ul className="mt-6 flex-1 space-y-2.5 text-[14.5px] text-t-2">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2.5">
                  <Icon name="check" className="mt-[3px] h-4 w-4 flex-none text-accent-hi" /> {f}
                </li>
              ))}
            </ul>
            <a href={downloadUrl} className={`${featured ? 'btn-glow' : 'btn-soft'} mt-7 w-full px-3 text-center text-[13.5px] sm:text-[15px]`}>
              {p.cta}
            </a>
          </div>
        ))}
      </div>
      <p className="mx-auto mt-6 max-w-2xl text-center text-[13px] text-t-3">
        {topup.replace('{hours}', '10').replace('{price}', formatUsd(prices.topup))}
      </p>
    </>
  )
}
