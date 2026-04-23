import type { LegType, Route } from './types'

const TRAVEL_MODE: Record<LegType, string> = {
  bike: 'bicycling',
  transit: 'transit',
  walk: 'walking',
}

export function buildMapsUrl(args: {
  origin: string
  destination: string
  type: LegType
}): string {
  const params = new URLSearchParams({
    api: '1',
    origin: args.origin,
    destination: args.destination,
    travelmode: TRAVEL_MODE[args.type],
  })
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

// Build a deep link that covers the entire trip, not just one leg. Pick the
// most "defining" travel mode: transit if any leg uses transit, else bike if
// any leg uses bike, else walking. Intermediate transit transfer points are
// passed as waypoints so Google Maps reconstructs the same multi-hop itinerary.
export function buildTripMapsUrl(route: Route): string {
  if (route.legs.length === 0) {
    throw new Error('buildTripMapsUrl: route has no legs')
  }

  const first = route.legs[0]
  const last = route.legs[route.legs.length - 1]

  let mode: LegType
  if (route.legs.some((l) => l.type === 'transit')) mode = 'transit'
  else if (route.legs.some((l) => l.type === 'bike')) mode = 'bike'
  else mode = 'walk'

  // Transit transfer point: the arrival stop of each transit leg except the
  // last. One waypoint per transfer lets Google pick the right buses.
  const transitLegs = route.legs.filter((l) => l.type === 'transit')
  const waypoints = transitLegs.slice(0, -1).map((l) => l.toName)

  const params = new URLSearchParams({
    api: '1',
    origin: first.fromName,
    destination: last.toName,
    travelmode: TRAVEL_MODE[mode],
  })
  if (waypoints.length > 0) {
    params.set('waypoints', waypoints.join('|'))
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`
}
