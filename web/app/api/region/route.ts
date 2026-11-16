import { TIER_PRICES, tierForCountry } from '@/lib/regions'

// GET /api/region → { country, tier, prices } for the visitor (Cloudflare's
// CF-IPCountry header). Used by the pricing on the site and by the desktop app.
// `?country=XX` overrides it (for previews and tests).

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'private, no-store'
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const override = url.searchParams.get('country')
  const raw = override && /^[a-zA-Z]{2}$/.test(override) ? override : request.headers.get('cf-ipcountry')
  const country = raw && raw !== 'XX' && raw !== 'T1' ? raw.toUpperCase() : null
  const tier = tierForCountry(country)
  return Response.json({ country, tier, prices: TIER_PRICES[tier] }, { headers: CORS })
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}
