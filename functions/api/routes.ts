import type { ApiError, Route, RoutesRequest, RoutesResponse } from '../../src/lib/types'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function errorResponse(error: ApiError['error'], message: string, status: number): Response {
  return jsonResponse({ error, message } satisfies ApiError, status)
}

function buildMockRoutes(req: RoutesRequest): Route[] {
  const from = req.origin || 'Origin'
  const to = req.destination || 'Destination'
  const mapsUrl = (origin: string, destination: string, mode: string) =>
    `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=${mode}`

  const fastest: Route = {
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
  }

  const fewerTransfers: Route = {
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
  }

  return [fastest, fewerTransfers]
}

export const onRequestPost: PagesFunction = async (context) => {
  let body: RoutesRequest
  try {
    body = (await context.request.json()) as RoutesRequest
  } catch {
    return errorResponse('invalid_input', 'Body must be JSON', 400)
  }

  if (!body.origin || !body.destination) {
    return errorResponse('invalid_input', 'origin and destination are required', 400)
  }

  const response: RoutesResponse = {
    routes: buildMockRoutes(body),
    baselineWalkTransitMinutes: 29,
  }

  return jsonResponse(response)
}

export const onRequest: PagesFunction = async () =>
  errorResponse('invalid_input', 'Only POST is supported', 405)
