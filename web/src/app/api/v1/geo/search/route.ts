import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'

// ---------------------------------------------------------------------------
// GET /api/v1/geo/search?q=<place>
// Location search proxy (Nominatim / OpenStreetMap), biased to Rwanda.
// Proxied server-side so we control the User-Agent (Nominatim usage policy),
// add caching, and never expose third-party calls directly from the browser.
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 10 * 60 * 1000
const cache = new Map<string, { at: number; data: unknown }>()

export const GET = withAuth(async (req: NextRequest) => {
  try {
    const q = (new URL(req.url).searchParams.get('q') ?? '').trim()
    if (q.length < 2) return apiSuccess({ results: [] })

    const key = q.toLowerCase()
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return apiSuccess({ results: hit.data })
    }

    const url =
      'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6' +
      '&viewbox=28.85,-1.05,30.90,-2.85&bounded=0&countrycodes=rw' +
      `&q=${encodeURIComponent(q)}`

    const r = await fetch(url, {
      headers: {
        'User-Agent': 'IMS-Rwanda/3.0 (intelligence management system; contact: admin@ims.gov.rw)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return apiError('Location search unavailable', 502)

    const raw = (await r.json()) as Array<Record<string, unknown>>
    const results = raw.map(p => ({
      name: String(p.display_name ?? ''),
      lat: Number(p.lat),
      lng: Number(p.lon),
      type: String(p.type ?? ''),
    }))

    cache.set(key, { at: Date.now(), data: results })
    if (cache.size > 500) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0]
      if (oldest) cache.delete(oldest[0])
    }

    return apiSuccess({ results })
  } catch (err) {
    console.error('[GET /api/v1/geo/search]', err)
    return apiError('Location search failed', 500)
  }
})
