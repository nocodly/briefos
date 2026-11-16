// =============================================================================
// Regional pricing (purchasing-power tiers). KEEP IN SYNC with web/lib/regions.ts.
// Tier 1 is the default for every country not listed. Hours per plan are the
// same everywhere; only the price changes.
// =============================================================================

export type RegionTier = 1 | 2 | 3 | 4
export type PlanKind = 'pro' | 'max' | 'topup'

/** Prices in US cents per tier. */
export const TIER_PRICES: Record<RegionTier, Record<PlanKind, number>> = {
  1: { pro: 1900, max: 3900, topup: 600 },
  2: { pro: 1200, max: 2500, topup: 400 },
  3: { pro: 700, max: 1500, topup: 300 },
  4: { pro: 500, max: 1000, topup: 200 }
}

/** Stripe price ids per tier (live mode, products "Minutama Pro / Pro Max / 10 extra hours"). */
export const TIER_PRICE_IDS: Record<RegionTier, Record<PlanKind, string>> = {
  1: { pro: 'price_1Uc1MeFryyNxk6PnZFXb9fr3', max: 'price_1Uc1MsFryyNxk6PneeEVp7eW', topup: 'price_1Uc1MuFryyNxk6Pns1vcptgt' },
  2: { pro: 'price_1UcX7VFryyNxk6PnIfdraQ43', max: 'price_1UcX7tFryyNxk6PnoZrsVnha', topup: 'price_1UcX7xFryyNxk6PnckMdTGKa' },
  3: { pro: 'price_1UcX7qFryyNxk6PnlaFy1MNC', max: 'price_1UcX7uFryyNxk6Pn28zHAjtn', topup: 'price_1UcX7zFryyNxk6Pnaygf17zZ' },
  4: { pro: 'price_1UcX7rFryyNxk6PnXwAMIi8C', max: 'price_1UcX7wFryyNxk6PnEQw2rwIK', topup: 'price_1UcX80FryyNxk6PnAEhdInnJ' }
}

const TIER_2 = [
  'PL', 'CZ', 'SK', 'HU', 'RO', 'BG', 'HR', 'SI', 'LT', 'LV', 'EE', 'PT', 'GR', 'CY', 'MT',
  'CL', 'UY', 'CR', 'PA', 'SA', 'OM', 'BH', 'KR', 'TW'
]
const TIER_3 = [
  // Latin America
  'BR', 'MX', 'AR', 'CO', 'PE', 'EC', 'BO', 'PY', 'VE', 'DO', 'GT', 'HN', 'SV', 'NI', 'JM',
  // Europe / Central Asia outside the EU
  'UA', 'MD', 'GE', 'AM', 'AZ', 'KZ', 'UZ', 'KG', 'TR', 'RS', 'BA', 'MK', 'AL', 'ME', 'XK',
  // Asia / Africa
  'PH', 'ID', 'VN', 'TH', 'MY', 'ZA', 'MA', 'TN', 'DZ', 'JO', 'LB', 'MN'
]
const TIER_4 = [
  'IN', 'PK', 'BD', 'NP', 'LK', 'MM', 'KH', 'LA', 'EG', 'NG', 'KE', 'GH', 'ET', 'UG', 'TZ',
  'RW', 'ZM', 'ZW', 'SN', 'CI', 'CM', 'TJ', 'AF'
]

export function tierForCountry(country: string | null | undefined): RegionTier {
  const c = String(country ?? '').toUpperCase()
  if (TIER_4.includes(c)) return 4
  if (TIER_3.includes(c)) return 3
  if (TIER_2.includes(c)) return 2
  return 1
}
