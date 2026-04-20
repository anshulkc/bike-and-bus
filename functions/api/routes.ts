import { computeRoutes, RoutesApiFetchError } from '../../src/lib/routesApi'
import { parseRoutesResponse } from '../../src/lib/routesParser'
import type {
  ApiError,
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

const MONTHLY_BUDGET = 9_900 // just under the 10k Essentials free tier
const DAILY_PER_IP_BUDGET = 200 // ~20 trip lookups per IP per day at ~10 Google calls each

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

  const sortBy: SortBy = body.sortBy ?? 'fastest'
  const apiKey = context.env.GOOGLE_SERVER_KEY
  const kv = context.env.RATE_LIMIT

  // No key configured → serve the mock so local dev and preview builds still work.
  if (!apiKey) {
    const routes = sortRoutes(buildMockRoutes(body), sortBy)
    const baselineWalkTransitMinutes = 29
    return jsonResponse({ routes, baselineWalkTransitMinutes } satisfies RoutesResponse)
  }

  const now = new Date()
  const ip = getClientIp(context.request)

  // Rate-limit check. If KV isn't bound (local dev without KV setup), skip.
  // We estimate the number of Google calls this request will make up-front so
  // we don't start a request that would push us past a cap. Task #4 makes 1
  // call; tasks #7/#8 will bump this to ~7–10.
  const estimatedGoogleCalls = 1

  if (kv) {
    const decision = await checkRateLimit({
      kv,
      ip,
      now,
      monthlyBudget: MONTHLY_BUDGET,
      dailyPerIpBudget: DAILY_PER_IP_BUDGET,
      costToDeduct: estimatedGoogleCalls,
    })
    if (!decision.allowed) {
      const message =
        decision.reason === 'monthly_exhausted'
          ? "Routing quota exhausted for this month. Resets on the 1st."
          : "You've hit today's lookup limit. Try again tomorrow."
      return errorResponse('upstream_quota', message, 429)
    }
  }

  // Real call.
  let googleRes
  let actualGoogleCalls = 0
  try {
    googleRes = await computeRoutes({
      origin: body.origin,
      destination: body.destination,
      travelMode: 'TRANSIT',
      computeAlternativeRoutes: true,
      apiKey,
    })
    actualGoogleCalls = 1
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

  // Increment counters with the real number of calls made. Done even on empty
  // results — Google still counted the call against our quota.
  if (kv) {
    await recordUsage({ kv, ip, now, calls: actualGoogleCalls })
  }

  const parsed = parseRoutesResponse(googleRes, body.origin, body.destination)
  if (parsed.length === 0) {
    return errorResponse('no_routes', 'No transit routes found between these points', 404)
  }

  const baseline = Math.min(...parsed.map((r) => r.totalMinutes))
  const withSavings: Route[] = parsed.map((r) => ({
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
