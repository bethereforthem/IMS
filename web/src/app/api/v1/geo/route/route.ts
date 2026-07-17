import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'

// ---------------------------------------------------------------------------
// GET /api/v1/geo/route?points=lng,lat;lng,lat[;lng,lat...]
// Driving directions proxy (OSRM). Supports origin + waypoints + destination
// (up to 12 points). Returns the route geometry (GeoJSON), per-leg and total
// distance/duration.
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { at: number; data: unknown }>()

export const GET = withAuth(async (req: NextRequest) => {
  try {
    const pointsParam = (new URL(req.url).searchParams.get('points') ?? '').trim()
    const points = pointsParam.split(';').filter(Boolean)

    if (points.length < 2) return apiError('At least 2 points are required', 400)
    if (points.length > 12) return apiError('Maximum 12 points supported', 400)
    for (const p of points) {
      const [lng, lat] = p.split(',').map(Number)
      if (!isFinite(lng) || !isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        return apiError(`Invalid coordinate pair: ${p}`, 400)
      }
    }

    const key = points.join(';')
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return apiSuccess(hit.data)
    }

    const url =
      `https://router.project-osrm.org/route/v1/driving/${points.join(';')}` +
      '?overview=full&geometries=geojson&steps=false&alternatives=false'

    const r = await fetch(url, {
      headers: { 'User-Agent': 'IMS-Rwanda/3.0 (intelligence management system)' },
      signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) return apiError('Routing service unavailable', 502)

    const json = (await r.json()) as {
      code: string
      routes?: Array<{
        distance: number
        duration: number
        geometry: { coordinates: [number, number][]; type: string }
        legs: Array<{ distance: number; duration: number }>
      }>
    }
    if (json.code !== 'Ok' || !json.routes?.length) {
      return apiError('No drivable route found between the selected points', 404)
    }

    const route = json.routes[0]
    const data = {
      distance_m: Math.round(route.distance),
      duration_s: Math.round(route.duration),
      // [lat, lng] pairs ready for Leaflet polylines
      coordinates: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      legs: route.legs.map(l => ({
        distance_m: Math.round(l.distance),
        duration_s: Math.round(l.duration),
      })),
    }

    cache.set(key, { at: Date.now(), data })
    if (cache.size > 300) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0]
      if (oldest) cache.delete(oldest[0])
    }

    return apiSuccess(data)
  } catch (err) {
    console.error('[GET /api/v1/geo/route]', err)
    return apiError('Routing failed', 500)
  }
})
