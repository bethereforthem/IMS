import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'

// ---------------------------------------------------------------------------
// GET /api/v1/geo/route
//   ?points=lng,lat;lng,lat[;lng,lat...]
//   &mode=car|bike|foot            (default: car)
//   &compare=true                  (also price the other travel modes)
//
// Directions proxy over OSRM. Supports origin + intermediate stops +
// destination (up to 12 points) and returns the route geometry (as [lat,lng]
// pairs ready for Leaflet), per-leg and total distance/duration, and the
// turn-by-turn manoeuvres.
//
// Travel modes
// ------------
// The public OSRM demo server only carries the car profile, so this used to be
// driving-only. FOSSGIS hosts a routing instance per profile — the same ones the
// openstreetmap.org directions panel uses — which speak the identical OSRM API,
// so the mode is a change of host rather than a change of protocol.
//
// All are open-source (OSRM) over OpenStreetMap data and need no API key.
// ---------------------------------------------------------------------------

export const TRAVEL_MODES = ['car', 'bike', 'foot'] as const
export type TravelMode = typeof TRAVEL_MODES[number]

const MODE_ENDPOINT: Record<TravelMode, string> = {
  car:  'https://routing.openstreetmap.de/routed-car/route/v1/driving',
  bike: 'https://routing.openstreetmap.de/routed-bike/route/v1/driving',
  foot: 'https://routing.openstreetmap.de/routed-foot/route/v1/driving',
}

// Used only for the car profile if FOSSGIS is unreachable.
const CAR_FALLBACK = 'https://router.project-osrm.org/route/v1/driving'

const MODE_LABEL: Record<TravelMode, string> = {
  car:  'Driving',
  bike: 'Cycling',
  foot: 'Walking',
}

const CACHE_TTL_MS = 5 * 60 * 1000
const MAX_CACHE_ENTRIES = 300
const cache = new Map<string, { at: number; data: unknown }>()

interface OsrmStep {
  distance: number
  duration: number
  name?: string
  maneuver?: { type?: string; modifier?: string }
}

interface OsrmResponse {
  code: string
  routes?: Array<{
    distance: number
    duration: number
    geometry: { coordinates: [number, number][]; type: string }
    legs: Array<{ distance: number; duration: number; steps?: OsrmStep[] }>
  }>
}

/** Human-readable instruction from an OSRM manoeuvre. */
function describeStep(step: OsrmStep): string {
  const type = step.maneuver?.type ?? 'continue'
  const modifier = step.maneuver?.modifier
  const road = step.name?.trim()

  const base = (() => {
    switch (type) {
      case 'depart':   return 'Head out'
      case 'arrive':   return 'Arrive at destination'
      case 'roundabout':
      case 'rotary':   return 'Take the roundabout'
      case 'merge':    return 'Merge'
      case 'fork':     return modifier ? `Keep ${modifier}` : 'Keep going at the fork'
      case 'new name': return 'Continue'
      case 'turn':     return modifier ? `Turn ${modifier}` : 'Turn'
      default:         return modifier ? `${type} ${modifier}` : type
    }
  })()

  const sentence = base.charAt(0).toUpperCase() + base.slice(1)
  return road && type !== 'arrive' ? `${sentence} onto ${road}` : sentence
}

async function fetchRoute(
  endpoint: string,
  points: string[],
  withGeometry: boolean,
): Promise<OsrmResponse | null> {
  const query = withGeometry
    ? '?overview=full&geometries=geojson&steps=true&alternatives=false'
    : '?overview=false&steps=false&alternatives=false'

  const res = await fetch(`${endpoint}/${points.join(';')}${query}`, {
    headers: { 'User-Agent': 'IMS-Rwanda/3.0 (intelligence management system)' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) return null
  return (await res.json()) as OsrmResponse
}

export const GET = withAuth(async (req: NextRequest) => {
  try {
    const url = new URL(req.url)
    const pointsParam = (url.searchParams.get('points') ?? '').trim()
    const points = pointsParam.split(';').filter(Boolean)

    const modeParam = (url.searchParams.get('mode') ?? 'car').toLowerCase()
    if (!TRAVEL_MODES.includes(modeParam as TravelMode)) {
      return apiError(`mode must be one of: ${TRAVEL_MODES.join(', ')}`, 400)
    }
    const mode = modeParam as TravelMode
    const compare = url.searchParams.get('compare') === 'true'

    if (points.length < 2) return apiError('At least 2 points are required', 400)
    if (points.length > 12) return apiError('Maximum 12 points supported', 400)
    for (const p of points) {
      const [lng, lat] = p.split(',').map(Number)
      if (!isFinite(lng) || !isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        return apiError(`Invalid coordinate pair: ${p}`, 400)
      }
    }

    const key = `${mode}|${compare}|${points.join(';')}`
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return apiSuccess(hit.data)
    }

    // The selected mode carries the geometry. When comparing, the other two are
    // priced without geometry and in parallel, so offering the comparison costs
    // one round trip rather than three sequential ones.
    const otherModes = compare ? TRAVEL_MODES.filter(m => m !== mode) : []

    const [primaryResult, ...otherResults] = await Promise.all([
      fetchRoute(MODE_ENDPOINT[mode], points, true).catch(() => null),
      ...otherModes.map(m => fetchRoute(MODE_ENDPOINT[m], points, false).catch(() => null)),
    ])

    let primary = primaryResult
    if ((!primary || primary.code !== 'Ok') && mode === 'car') {
      // Only the car profile has a second public instance to fall back to.
      primary = await fetchRoute(CAR_FALLBACK, points, true).catch(() => null)
    }

    if (!primary) return apiError('Routing service unavailable', 502)
    if (primary.code !== 'Ok' || !primary.routes?.length) {
      return apiError(
        `No ${MODE_LABEL[mode].toLowerCase()} route found between the selected points`,
        404,
      )
    }

    const route = primary.routes[0]

    const steps = route.legs.flatMap((leg, legIndex) =>
      (leg.steps ?? [])
        // OSRM emits a zero-length arrival step at the end of every leg; keep
        // only the final one so a multi-stop route does not read as a series of
        // arrivals.
        .filter(s => s.distance > 0 || (legIndex === route.legs.length - 1 && s.maneuver?.type === 'arrive'))
        .map(s => ({
          instruction: describeStep(s),
          distance_m: Math.round(s.distance),
          duration_s: Math.round(s.duration),
          leg: legIndex,
        })),
    )

    const byMode: Record<string, { distance_m: number; duration_s: number; label: string } | null> = {
      [mode]: {
        distance_m: Math.round(route.distance),
        duration_s: Math.round(route.duration),
        label: MODE_LABEL[mode],
      },
    }
    otherModes.forEach((m, i) => {
      const r = otherResults[i]
      const alt = r?.code === 'Ok' ? r.routes?.[0] : undefined
      byMode[m] = alt
        ? {
            distance_m: Math.round(alt.distance),
            duration_s: Math.round(alt.duration),
            label: MODE_LABEL[m],
          }
        // null rather than an omitted key, so the client can say "no walking
        // route" instead of leaving a silent gap in the comparison.
        : null
    })

    const data = {
      mode,
      mode_label: MODE_LABEL[mode],
      distance_m: Math.round(route.distance),
      duration_s: Math.round(route.duration),
      // [lat, lng] pairs ready for Leaflet polylines
      coordinates: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      legs: route.legs.map(l => ({
        distance_m: Math.round(l.distance),
        duration_s: Math.round(l.duration),
      })),
      steps,
      by_mode: byMode,
    }

    cache.set(key, { at: Date.now(), data })
    if (cache.size > MAX_CACHE_ENTRIES) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0]
      if (oldest) cache.delete(oldest[0])
    }

    return apiSuccess(data)
  } catch (err) {
    console.error('[GET /api/v1/geo/route]', err)
    return apiError('Routing failed', 500)
  }
})
