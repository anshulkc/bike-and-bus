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
// any leg uses bike, else walking.
//
// Known Google Maps URL-API quirk: `waypoints` is silently ignored — or
// breaks the routing outright with "Sorry, we could not calculate transit
// directions" — when combined with `travelmode=transit`. Google's own
// Directions docs say: "Waypoints are not available for transit directions."
// So for transit trips we pass origin + destination only and let Maps
// replan; the per-leg buttons on the Detail page preserve the fidelity we
// lose here. Waypoints still work for bicycling/walking and are passed
// through in those modes.
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

  const params = new URLSearchParams({
    api: '1',
    origin: first.fromName,
    destination: last.toName,
    travelmode: TRAVEL_MODE[mode],
  })

  // Only bike/walk trips get waypoints. Transit mode would reject or ignore them.
  if (mode !== 'transit') {
    const handoffs = route.legs
      .slice(0, -1)
      .map((l) => l.toName)
      .filter((name, i, arr) => name && name !== arr[i - 1])
    if (handoffs.length > 0) {
      params.set('waypoints', handoffs.join('|'))
    }
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`
}
