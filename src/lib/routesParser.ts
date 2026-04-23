import { buildMapsUrl } from './deepLinks'
import type {
  GoogleLatLng,
  GoogleRoute,
  GoogleRouteStep,
  GoogleRoutesResponse,
} from './googleTypes'
import type { LatLng, Leg, Route } from './types'

export type TravelMode = 'BICYCLE' | 'TRANSIT'

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

function latLngToString(latLng: GoogleLatLng | undefined): string | null {
  if (!latLng) return null
  return `${latLng.latitude},${latLng.longitude}`
}

function stopDisplay(
  name: string | undefined,
  latLng: GoogleLatLng | undefined,
): string {
  if (name && name.trim()) return name.trim()
  return latLngToString(latLng) ?? 'Unknown'
}

// ─── bike mode: collapse the whole route into a single bike leg ─────────────

function parseBikeRoute(
  route: GoogleRoute,
  tripOrigin: string,
  tripDestination: string,
): Route | null {
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
    savedVsWalking: 0,
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

// ─── transit mode: walk / transit / walk … ──────────────────────────────────

// Google returns turn-by-turn walking as many consecutive WALK steps. Merge
// them so each contiguous walking segment is one Leg (otherwise the UI
// shows a cluster of 1-min walk chips to the same stop).
function coalesceWalkSteps(steps: GoogleRouteStep[]): GoogleRouteStep[] {
  const out: GoogleRouteStep[] = []
  for (const step of steps) {
    const prev = out[out.length - 1]
    if (step.travelMode === 'WALK' && prev?.travelMode === 'WALK') {
      const prevSec = parseSecondsString(prev.staticDuration)
      const stepSec = parseSecondsString(step.staticDuration)
      out[out.length - 1] = {
        ...prev,
        staticDuration: `${prevSec + stepSec}s`,
        distanceMeters: (prev.distanceMeters ?? 0) + (step.distanceMeters ?? 0),
        endLocation: step.endLocation ?? prev.endLocation,
      }
    } else {
      out.push(step)
    }
  }
  return out
}

interface LegContext {
  tripOrigin: string
  tripDestination: string
  prevStepArrivalName?: string
  nextStepDepartureName?: string
}

function parseTransitStep(step: GoogleRouteStep): Leg | null {
  const td = step.transitDetails
  if (!td) return null
  const dep = td.stopDetails?.departureStop
  const arr = td.stopDetails?.arrivalStop
  const fromName = stopDisplay(dep?.name, dep?.location?.latLng)
  const toName = stopDisplay(arr?.name, arr?.location?.latLng)
  const line = td.transitLine?.nameShort ?? td.transitLine?.name ?? 'Transit'
  const seconds = parseSecondsString(step.staticDuration)

  return {
    type: 'transit',
    fromName,
    toName,
    fromLatLng: toLatLng(dep?.location?.latLng),
    toLatLng: toLatLng(arr?.location?.latLng),
    minutes: toMinutes(seconds),
    seconds,
    line,
    departAt: td.stopDetails?.departureTime,
    arriveAt: td.stopDetails?.arrivalTime,
    googleMapsUrl: buildMapsUrl({ origin: fromName, destination: toName, type: 'transit' }),
  }
}

function parseWalkStep(step: GoogleRouteStep, ctx: LegContext): Leg {
  const seconds = parseSecondsString(step.staticDuration)
  const startLatLng = step.startLocation?.latLng
  const endLatLng = step.endLocation?.latLng

  const fromName =
    ctx.prevStepArrivalName ?? (ctx.tripOrigin || latLngToString(startLatLng) || 'Start')
  const toName =
    ctx.nextStepDepartureName ?? (ctx.tripDestination || latLngToString(endLatLng) || 'End')

  return {
    type: 'walk',
    fromName,
    toName,
    fromLatLng: toLatLng(startLatLng),
    toLatLng: toLatLng(endLatLng),
    minutes: toMinutes(seconds),
    seconds,
    meters: step.distanceMeters,
    googleMapsUrl: buildMapsUrl({ origin: fromName, destination: toName, type: 'walk' }),
  }
}

function parseTransitRoute(
  route: GoogleRoute,
  tripOrigin: string,
  tripDestination: string,
): Route | null {
  const rawSteps = route.legs?.flatMap((l) => l.steps ?? []) ?? []
  const steps = coalesceWalkSteps(rawSteps)
  if (steps.length === 0) return null

  const nextDepartureNameAt = steps.map((_, i) => {
    for (let j = i + 1; j < steps.length; j++) {
      if (steps[j].travelMode === 'TRANSIT') {
        return steps[j].transitDetails?.stopDetails?.departureStop?.name ?? undefined
      }
    }
    return undefined
  })
  const prevArrivalNameAt = steps.map((_, i) => {
    for (let j = i - 1; j >= 0; j--) {
      if (steps[j].travelMode === 'TRANSIT') {
        return steps[j].transitDetails?.stopDetails?.arrivalStop?.name ?? undefined
      }
    }
    return undefined
  })

  const legs: Leg[] = []
  steps.forEach((step, i) => {
    const ctx: LegContext = {
      tripOrigin,
      tripDestination,
      prevStepArrivalName: prevArrivalNameAt[i],
      nextStepDepartureName: nextDepartureNameAt[i],
    }
    if (step.travelMode === 'TRANSIT') {
      const leg = parseTransitStep(step)
      if (leg) legs.push(leg)
    } else if (step.travelMode === 'WALK') {
      legs.push(parseWalkStep(step, ctx))
    }
  })

  if (legs.length === 0) return null

  const totalMinutes = toMinutes(parseSecondsString(route.duration))
  const transitSteps = legs.filter((l) => l.type === 'transit').length

  return {
    totalMinutes,
    savedVsWalking: 0,
    transferCount: Math.max(0, transitSteps - 1),
    bikingMinutes: 0,
    legs,
  }
}

// ─── dispatch ────────────────────────────────────────────────────────────────

export function parseRoutesResponse(
  res: GoogleRoutesResponse,
  tripOrigin: string,
  tripDestination: string,
  mode: TravelMode,
): Route[] {
  const parse = mode === 'BICYCLE' ? parseBikeRoute : parseTransitRoute
  return (res.routes ?? [])
    .map((r) => parse(r, tripOrigin, tripDestination))
    .filter((r): r is Route => r !== null)
}
