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

// Pure bike routing = exactly 1 Google Routes call per user request.
const ESTIMATED_GOOGLE_CALLS_PER_REQUEST = 1

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

// ─── Mock fallback (used when no key in env, e.g. local dev) ─────────────────

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
  const apiKey = context.env.GOOGLE_SERVER_KEY
  const kv = context.env.RATE_LIMIT

  // No key configured → serve the mock so local dev and preview builds still work.
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

  // Pure bike query — one Google call, one bike route.
  let googleRes
  try {
    googleRes = await computeRoutes({
      origin: originWaypoint,
      destination: destinationWaypoint,
      travelMode: 'BICYCLE',
      apiKey,
    })
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
  if (kv) await recordUsage({ kv, ip, now, calls: 1 })

  if (parsed.length === 0) {
    return errorResponse('no_routes', 'No bike route found between these points', 404)
  }

  const sorted = sortRoutes(parsed, sortBy)
  const baseline = sorted[0]?.totalMinutes ?? 0
  return jsonResponse({
    routes: sorted,
    baselineWalkTransitMinutes: baseline,
  } satisfies RoutesResponse)
}

export const onRequest: PagesFunction<Env> = async () =>
  errorResponse('invalid_input', 'Only POST is supported', 405)
