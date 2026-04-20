import { applyBikeSwap, type BikeFetcher, type BikeResult } from '../../src/lib/algorithm'
import {
  applyEarlierDeparture,
  type ReQueryTransitFetcher,
} from '../../src/lib/earlierDeparture'
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

// Conservative up-front estimate for rate-limit gating. 1 transit alternatives
// + up to 6 bike queries (3 candidates × head+tail) + up to 3 earlier-departure
// re-queries (1 per head-swapped candidate). Actual usage is recorded after.
const ESTIMATED_GOOGLE_CALLS_PER_REQUEST = 10

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

function parseSeconds(s: string | undefined): number {
  if (!s) return 0
  const match = /^(\d+(?:\.\d+)?)s$/.exec(s)
  return match ? parseFloat(match[1]) : 0
}

function makeBikeFetcher(apiKey: string, onCall: () => void): BikeFetcher {
  return async (input): Promise<BikeResult | null> => {
    onCall()
    try {
      const res = await computeRoutes({
        origin: input.from.latLng ?? input.from.name,
        destination: input.to.latLng ?? input.to.name,
        travelMode: 'BICYCLE',
        apiKey,
      })
      const route = res.routes?.[0]
      if (!route) return null
      const seconds = parseSeconds(route.duration)
      const meters = route.distanceMeters ?? 0
      if (seconds <= 0) return null
      return { seconds, meters }
    } catch {
      return null
    }
  }
}

function makeReQueryTransitFetcher(apiKey: string, onCall: () => void): ReQueryTransitFetcher {
  return async ({ fromStop, tripDestination, departureTime }) => {
    onCall()
    try {
      const res = await computeRoutes({
        origin: fromStop,
        destination: tripDestination,
        travelMode: 'TRANSIT',
        computeAlternativeRoutes: true,
        departureTime: departureTime.toISOString(),
        apiKey,
      })
      return parseRoutesResponse(res, '', tripDestination)
    } catch {
      return null
    }
  }
}

// ─── Mock fallback (used when no key in env, e.g. local dev) ─────────────────

function buildMockRoutes(req: RoutesRequest): Route[] {
  const from = req.origin
  const to = req.destination
  const mapsUrl = (origin: string, destination: string, mode: string) =>
    `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=${mode}`

  return [
    {
      totalMinutes: 22,
      savedVsWalking: 7,
      transferCount: 0,
      bikingMinutes: 8,
      legs: [
        {
          type: 'bike',
          fromName: from,
          toName: 'Wilshire/Western Station',
          minutes: 8,
          googleMapsUrl: mapsUrl(from, 'Wilshire/Western Station', 'bicycling'),
        },
        {
          type: 'transit',
          fromName: 'Wilshire/Western Station',
          toName: to,
          minutes: 14,
          line: 'Red Line',
          departAt: '2026-04-19T15:42:00-07:00',
          arriveAt: '2026-04-19T15:56:00-07:00',
          googleMapsUrl: mapsUrl('Wilshire/Western Station', to, 'transit'),
        },
      ],
    },
    {
      totalMinutes: 28,
      savedVsWalking: 3,
      transferCount: 1,
      bikingMinutes: 5,
      legs: [
        {
          type: 'bike',
          fromName: from,
          toName: '6th/Vermont',
          minutes: 5,
          googleMapsUrl: mapsUrl(from, '6th/Vermont', 'bicycling'),
        },
        {
          type: 'transit',
          fromName: '6th/Vermont',
          toName: 'Pershing Square',
          minutes: 16,
          line: '720 Rapid',
          departAt: '2026-04-19T15:40:00-07:00',
          arriveAt: '2026-04-19T15:56:00-07:00',
          googleMapsUrl: mapsUrl('6th/Vermont', 'Pershing Square', 'transit'),
        },
        {
          type: 'walk',
          fromName: 'Pershing Square',
          toName: to,
          minutes: 2,
          googleMapsUrl: mapsUrl('Pershing Square', to, 'walking'),
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
  const apiKey = context.env.GOOGLE_SERVER_KEY
  const kv = context.env.RATE_LIMIT

  // No key configured → serve the mock so local dev and preview builds still work.
  if (!apiKey) {
    const routes = sortRoutes(buildMockRoutes(body), sortBy)
    return jsonResponse({ routes, baselineWalkTransitMinutes: 29 } satisfies RoutesResponse)
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
      costToDeduct: ESTIMATED_GOOGLE_CALLS_PER_REQUEST,
    })
    if (!decision.allowed) {
      const message =
        decision.reason === 'monthly_exhausted'
          ? "Routing quota exhausted for this month. Resets on the 1st."
          : "You've hit today's lookup limit. Try again tomorrow."
      return errorResponse('upstream_quota', message, 429)
    }
  }

  // Track real Google call count for accurate usage recording.
  let googleCallsMade = 0

  // 1) Transit alternatives (walk+transit baseline).
  let googleRes
  try {
    googleRes = await computeRoutes({
      origin: originWaypoint,
      destination: destinationWaypoint,
      travelMode: 'TRANSIT',
      computeAlternativeRoutes: true,
      apiKey,
    })
    googleCallsMade += 1
  } catch (e) {
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

  const parsed = parseRoutesResponse(googleRes, body.origin, body.destination)
  if (parsed.length === 0) {
    if (kv) await recordUsage({ kv, ip, now, calls: googleCallsMade })
    return errorResponse('no_routes', 'No transit routes found between these points', 404)
  }

  // Baseline = fastest pure walk+transit candidate BEFORE any bike swaps.
  const baseline = Math.min(...parsed.map((r) => r.totalMinutes))

  // 2) Apply bike swap. Additional Google calls happen inside the fetcher.
  const bikeFetcher = makeBikeFetcher(apiKey, () => {
    googleCallsMade += 1
  })
  const swap = await applyBikeSwap(parsed, bikeFetcher, {})

  if (swap.routes.length === 0) {
    if (kv) await recordUsage({ kv, ip, now, calls: googleCallsMade })
    return errorResponse(
      'no_routes',
      'All candidates had bike legs that were too long. Try a different origin.',
      404,
    )
  }

  // 3) For head-bike swaps where savings are large enough, re-query transit
  //    from the boarding stop to see if an earlier departure catches.
  const reQueryFetcher = makeReQueryTransitFetcher(apiKey, () => {
    googleCallsMade += 1
  })
  // Match swap.routes back to their original pre-swap Route for walk-seconds math.
  // swap preserves input order, so indices align.
  const optimized = await applyEarlierDeparture(
    parsed,
    swap.routes,
    reQueryFetcher,
    body.destination,
  )

  // Record real usage with rate limiter.
  if (kv) await recordUsage({ kv, ip, now, calls: googleCallsMade })

  const withSavings: Route[] = optimized.routes.map((r) => ({
    ...r,
    savedVsWalking: Math.max(0, baseline - r.totalMinutes),
  }))

  const sorted = sortRoutes(withSavings, sortBy)
  return jsonResponse({
    routes: sorted,
    baselineWalkTransitMinutes: baseline,
  } satisfies RoutesResponse)
}

export const onRequest: PagesFunction<Env> = async () =>
  errorResponse('invalid_input', 'Only POST is supported', 405)
