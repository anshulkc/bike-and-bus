import { applyBikeSwap, type BikeFetcher } from '../../src/lib/algorithm'
import { computeRoutes, type LocationInput, RoutesApiFetchError } from '../../src/lib/routesApi'
import { parseRoutesResponse } from '../../src/lib/routesParser'
import type {
  ApiError,
  LatLng,
  Route,
  RoutesRequest,
  RoutesResponse,
  SortBy,
} from '../../src/lib/types'
import { checkRateLimit, getClientIp, recordUsage } from './rateLimiter'

interface Env {
  GOOGLE_SERVER_KEY?: string
  RATE_LIMIT?: KVNamespace
}

const MONTHLY_BUDGET = 9_900
const DAILY_PER_IP_BUDGET = 500

const METERS_PER_MILE = 1609.344
const DEFAULT_MAX_BIKE_MILES = 3

// Worst case per request: 1 (pure bike) + 1 (transit alt) + 3 routes × 2 swap
// calls = 8 Google calls. Charge the upper bound against the budget up front
// to avoid over-running.
const WORST_CASE_CALLS_PER_REQUEST = 8

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function errorResponse(error: ApiError['error'], message: string, status: number): Response {
  return jsonResponse({ error, message } satisfies ApiError, status)
}

// ─── Sorting ────────────────────────────────────────────────────────────────

function sortRoutes(routes: Route[], sortBy: SortBy): Route[] {
  const copy = [...routes]
  switch (sortBy) {
    case 'fewestTransfers':
      return copy.sort((a, b) => a.transferCount - b.transferCount || a.totalMinutes - b.totalMinutes)
    case 'leastBiking':
      return copy.sort((a, b) => a.bikingMinutes - b.bikingMinutes || a.totalMinutes - b.totalMinutes)
    case 'fastest':
    default:
      return copy.sort((a, b) => a.totalMinutes - b.totalMinutes)
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isValidLatLng(v: unknown): v is LatLng {
  if (!v || typeof v !== 'object') return false
  const { lat, lng } = v as LatLng
  if (typeof lat !== 'number' || typeof lng !== 'number') return false
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false
  return true
}

function clampMaxBikeMiles(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_MAX_BIKE_MILES
  }
  return Math.min(Math.max(raw, 0.25), 50)
}

// Google's Routes API accepts a future departureTime for transit. Reject
// non-ISO strings and anything in the past or beyond a reasonable horizon —
// we don't want to pass weird values downstream.
function validDepartureTime(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw) return undefined
  const t = Date.parse(raw)
  if (Number.isNaN(t)) return undefined
  const now = Date.now()
  if (t < now - 5 * 60 * 1000) return undefined // >5 min in the past
  if (t > now + 14 * 24 * 60 * 60 * 1000) return undefined // >14 days ahead
  return new Date(t).toISOString()
}

// ─── Mock fallback (used when no key in env) ────────────────────────────────

function buildMockRoutes(req: RoutesRequest): Route[] {
  const from = req.origin
  const to = req.destination
  const mapsUrl = (origin: string, destination: string, mode: string) =>
    `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=${mode}`

  return [
    {
      totalMinutes: 18,
      savedVsWalking: 0,
      transferCount: 0,
      bikingMinutes: 18,
      legs: [
        {
          type: 'bike',
          fromName: from,
          toName: to,
          minutes: 18,
          googleMapsUrl: mapsUrl(from, to, 'bicycling'),
        },
      ],
    },
  ]
}

// ─── Request handler ────────────────────────────────────────────────────────

export const onRequestPost: PagesFunction<Env> = async (context) => {
  let body: RoutesRequest
  try {
    body = (await context.request.json()) as RoutesRequest
  } catch {
    return errorResponse('invalid_input', 'Body must be JSON', 400)
  }

  if (!body.origin || !body.destination) {
    return errorResponse('invalid_input', 'origin and destination are required', 400)
  }

  const originLatLng = isValidLatLng(body.originLatLng) ? body.originLatLng : undefined
  const destinationLatLng = isValidLatLng(body.destinationLatLng) ? body.destinationLatLng : undefined
  const originWaypoint: LocationInput = originLatLng ?? body.origin
  const destinationWaypoint: LocationInput = destinationLatLng ?? body.destination

  const sortBy: SortBy = body.sortBy ?? 'fastest'
  const maxBikeMiles = clampMaxBikeMiles(body.maxBikeMiles)
  const maxBikeMeters = maxBikeMiles * METERS_PER_MILE
  const departureTime = validDepartureTime(body.departureTime)
  const apiKey = context.env.GOOGLE_SERVER_KEY
  const kv = context.env.RATE_LIMIT

  if (!apiKey) {
    const routes = sortRoutes(buildMockRoutes(body), sortBy)
    const baseline = routes[0]?.totalMinutes ?? 0
    return jsonResponse({ routes, baselineWalkTransitMinutes: baseline } satisfies RoutesResponse)
  }

  const now = new Date()
  const ip = getClientIp(context.request)

  if (kv) {
    const decision = await checkRateLimit({
      kv,
      ip,
      now,
      monthlyBudget: MONTHLY_BUDGET,
      dailyPerIpBudget: DAILY_PER_IP_BUDGET,
      costToDeduct: WORST_CASE_CALLS_PER_REQUEST,
    })
    if (!decision.allowed) {
      const message =
        decision.reason === 'monthly_exhausted'
          ? "Routing quota exhausted for this month. Resets on the 1st."
          : "You've hit today's lookup limit. Try again tomorrow."
      return errorResponse('upstream_quota', message, 429)
    }
  }

  let callsMade = 0
  const failed = (e: unknown) => {
    if (e instanceof RoutesApiFetchError) {
      if (e.status === 429 || e.status === 403) {
        return errorResponse('upstream_quota', 'Routing service is over quota or rate-limited', 503)
      }
      if (e.status >= 400 && e.status < 500) {
        return errorResponse('invalid_input', 'Could not route this trip — check addresses', 400)
      }
    }
    return errorResponse('server_error', 'Routing service failed', 502)
  }

  // 1. Pure bike route — always.
  let bikeRoutes: Route[]
  try {
    const res = await computeRoutes({
      origin: originWaypoint,
      destination: destinationWaypoint,
      travelMode: 'BICYCLE',
      apiKey,
      departureTime,
    })
    callsMade += 1
    bikeRoutes = parseRoutesResponse(res, body.origin, body.destination, 'BICYCLE')
  } catch (e) {
    return failed(e)
  }

  const bikeMeters = bikeRoutes[0]?.legs[0]?.meters ?? 0
  const pureBikeWithinLimit = bikeMeters > 0 && bikeMeters <= maxBikeMeters

  let finalRoutes: Route[]

  if (pureBikeWithinLimit || bikeRoutes.length === 0) {
    finalRoutes = bikeRoutes
  } else {
    // 2. Over the user's bike threshold → also fetch transit alternatives.
    let transitRoutes: Route[] = []
    try {
      const res = await computeRoutes({
        origin: originWaypoint,
        destination: destinationWaypoint,
        travelMode: 'TRANSIT',
        computeAlternativeRoutes: true,
        apiKey,
        departureTime,
      })
      callsMade += 1
      transitRoutes = parseRoutesResponse(res, body.origin, body.destination, 'TRANSIT')
    } catch {
      // Transit fetch failed → fall back to the long bike ride.
      transitRoutes = []
    }

    if (transitRoutes.length > 0) {
      // 3. Swap long walks at the start/end for bike legs when biking is faster.
      const fetchBike: BikeFetcher = async (input) => {
        try {
          const res = await computeRoutes({
            origin: input.from.latLng ?? input.from.name,
            destination: input.to.latLng ?? input.to.name,
            travelMode: 'BICYCLE',
            apiKey,
            departureTime,
          })
          callsMade += 1
          const secondsStr = res.routes?.[0]?.duration ?? '0s'
          const seconds = parseFloat(secondsStr.replace(/s$/, '')) || 0
          const meters = res.routes?.[0]?.distanceMeters ?? 0
          if (seconds <= 0) return null
          return { seconds, meters }
        } catch {
          return null
        }
      }

      const { routes } = await applyBikeSwap(transitRoutes, fetchBike, { maxBikeMiles })
      finalRoutes = routes
    } else {
      finalRoutes = bikeRoutes // fallback: long bike ride
    }
  }

  if (kv) await recordUsage({ kv, ip, now, calls: callsMade })

  if (finalRoutes.length === 0) {
    return errorResponse('no_routes', 'No route found between these points', 404)
  }

  const sorted = sortRoutes(finalRoutes, sortBy)
  const baseline = sorted[0]?.totalMinutes ?? 0
  return jsonResponse({
    routes: sorted,
    baselineWalkTransitMinutes: baseline,
  } satisfies RoutesResponse)
}

export const onRequest: PagesFunction<Env> = async () =>
  errorResponse('invalid_input', 'Only POST is supported', 405)
