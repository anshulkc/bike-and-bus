import { buildMapsUrl } from './deepLinks'
import type { GoogleLatLng, GoogleRoute, GoogleRoutesResponse } from './googleTypes'
import type { LatLng, Route } from './types'

function toLatLng(g: GoogleLatLng | undefined): LatLng | undefined {
  if (!g) return undefined
  return { lat: g.latitude, lng: g.longitude }
}

function parseSecondsString(s: string | undefined): number {
  if (!s) return 0
  const match = /^(\d+(?:\.\d+)?)s$/.exec(s)
  if (!match) return 0
  return parseFloat(match[1])
}

function toMinutes(seconds: number): number {
  return Math.max(1, Math.round(seconds / 60))
}

// The app only ever asks Google for BICYCLE routes, so each route collapses
// into one "Bike X min" leg spanning origin → destination. Google's response
// can contain short WALK sub-steps (crosswalks, dismount zones); those are
// absorbed into the single leg's total duration and distance.
function parseRoute(route: GoogleRoute, tripOrigin: string, tripDestination: string): Route | null {
  const seconds = parseSecondsString(route.duration)
  if (seconds <= 0) return null

  const firstLeg = route.legs?.[0]
  const lastLeg = route.legs?.[route.legs.length - 1]
  const startLatLng = firstLeg?.startLocation?.latLng ?? firstLeg?.steps?.[0]?.startLocation?.latLng
  const endLatLng =
    lastLeg?.endLocation?.latLng ??
    lastLeg?.steps?.[lastLeg.steps.length - 1]?.endLocation?.latLng

  const minutes = toMinutes(seconds)

  return {
    totalMinutes: minutes,
    savedVsWalking: 0, // filled in by caller using baseline
    transferCount: 0,
    bikingMinutes: minutes,
    legs: [
      {
        type: 'bike',
        fromName: tripOrigin,
        toName: tripDestination,
        fromLatLng: toLatLng(startLatLng),
        toLatLng: toLatLng(endLatLng),
        minutes,
        seconds,
        meters: route.distanceMeters,
        googleMapsUrl: buildMapsUrl({
          origin: tripOrigin,
          destination: tripDestination,
          type: 'bike',
        }),
      },
    ],
  }
}

export function parseRoutesResponse(
  res: GoogleRoutesResponse,
  tripOrigin: string,
  tripDestination: string,
): Route[] {
  return (res.routes ?? [])
    .map((r) => parseRoute(r, tripOrigin, tripDestination))
    .filter((r): r is Route => r !== null)
}
