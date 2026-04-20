import { buildMapsUrl } from './deepLinks'
import type {
  GoogleLatLng,
  GoogleRoute,
  GoogleRouteStep,
  GoogleRoutesResponse,
} from './googleTypes'
import type { LatLng, Leg, Route } from './types'

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

// Pick a display string for a stop: prefer name, fall back to lat/lng.
function stopDisplay(
  name: string | undefined,
  latLng: GoogleLatLng | undefined,
): { display: string; isName: boolean } {
  if (name && name.trim()) return { display: name.trim(), isName: true }
  const coord = latLngToString(latLng)
  return { display: coord ?? 'Unknown', isName: false }
}

interface LegContext {
  tripOrigin: string
  tripDestination: string
  prevStepArrivalName?: string
  nextStepDepartureName?: string
}

function parseTransitStep(step: GoogleRouteStep, _ctx: LegContext): Leg | null {
  const td = step.transitDetails
  if (!td) return null
  const depStop = td.stopDetails?.departureStop
  const arrStop = td.stopDetails?.arrivalStop

  const fromInfo = stopDisplay(depStop?.name, depStop?.location?.latLng)
  const toInfo = stopDisplay(arrStop?.name, arrStop?.location?.latLng)

  const line = td.transitLine?.nameShort ?? td.transitLine?.name ?? 'Transit'
  const seconds = parseSecondsString(step.staticDuration)

  return {
    type: 'transit',
    fromName: fromInfo.display,
    toName: toInfo.display,
    fromLatLng: toLatLng(depStop?.location?.latLng),
    toLatLng: toLatLng(arrStop?.location?.latLng),
    minutes: toMinutes(seconds),
    seconds,
    line,
    departAt: td.stopDetails?.departureTime,
    arriveAt: td.stopDetails?.arrivalTime,
    googleMapsUrl: buildMapsUrl({
      origin: fromInfo.display,
      destination: toInfo.display,
      type: 'transit',
    }),
  }
}

function parseBikeStep(step: GoogleRouteStep, ctx: LegContext): Leg | null {
  if (step.travelMode !== 'BICYCLE') return null
  const seconds = parseSecondsString(step.staticDuration)

  const startLatLng = step.startLocation?.latLng
  const endLatLng = step.endLocation?.latLng

  const fromName =
    ctx.prevStepArrivalName ?? (ctx.tripOrigin || latLngToString(startLatLng) || 'Start')
  const toName =
    ctx.nextStepDepartureName ?? (ctx.tripDestination || latLngToString(endLatLng) || 'End')

  return {
    type: 'bike',
    fromName,
    toName,
    fromLatLng: toLatLng(startLatLng),
    toLatLng: toLatLng(endLatLng),
    minutes: toMinutes(seconds),
    seconds,
    meters: step.distanceMeters,
    googleMapsUrl: buildMapsUrl({
      origin: fromName,
      destination: toName,
      type: 'bike',
    }),
  }
}

function parseWalkStep(step: GoogleRouteStep, ctx: LegContext): Leg | null {
  if (step.travelMode !== 'WALK') return null
  const seconds = parseSecondsString(step.staticDuration)

  // Prefer adjacent named stops over lat/lng for clean deep links.
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
    googleMapsUrl: buildMapsUrl({
      origin: fromName,
      destination: toName,
      type: 'walk',
    }),
  }
}

// Google Routes API v2 returns turn-by-turn instructions as multiple consecutive
// steps of the same mode within a single segment. Collapse them into one
// synthetic step so each contiguous walk or bike segment becomes a single Leg.
function coalesceSameModeSteps(steps: GoogleRouteStep[]): GoogleRouteStep[] {
  const out: GoogleRouteStep[] = []
  for (const step of steps) {
    const prev = out[out.length - 1]
    const mergeable = step.travelMode === 'WALK' || step.travelMode === 'BICYCLE'
    if (mergeable && prev && prev.travelMode === step.travelMode) {
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

function parseRoute(route: GoogleRoute, tripOrigin: string, tripDestination: string): Route | null {
  const rawSteps = route.legs?.flatMap((l) => l.steps ?? []) ?? []
  const steps = coalesceSameModeSteps(rawSteps)
  if (steps.length === 0) return null

  // Precompute adjacent transit stop names so walk legs can reference them
  // instead of using raw lat/lng in their deep links.
  const nextDepartureNameAt: Array<string | undefined> = steps.map((_, i) => {
    for (let j = i + 1; j < steps.length; j++) {
      if (steps[j].travelMode === 'TRANSIT') {
        return steps[j].transitDetails?.stopDetails?.departureStop?.name ?? undefined
      }
    }
    return undefined
  })
  const prevArrivalNameAt: Array<string | undefined> = steps.map((_, i) => {
    for (let j = i - 1; j >= 0; j--) {
      if (steps[j].travelMode === 'TRANSIT') {
        return steps[j].transitDetails?.stopDetails?.arrivalStop?.name ?? undefined
      }
    }
    return undefined
  })

  const legs: Leg[] = []
  let transferCount = -1 // first transit step = 0 transfers; each subsequent = +1

  steps.forEach((step, i) => {
    const ctx: LegContext = {
      tripOrigin,
      tripDestination,
      prevStepArrivalName: prevArrivalNameAt[i],
      nextStepDepartureName: nextDepartureNameAt[i],
    }

    if (step.travelMode === 'TRANSIT') {
      const leg = parseTransitStep(step, ctx)
      if (leg) {
        legs.push(leg)
        transferCount += 1
      }
    } else if (step.travelMode === 'WALK') {
      const leg = parseWalkStep(step, ctx)
      if (leg) legs.push(leg)
    } else if (step.travelMode === 'BICYCLE') {
      const leg = parseBikeStep(step, ctx)
      if (leg) legs.push(leg)
    }
  })

  if (legs.length === 0) return null

  const totalMinutes = toMinutes(parseSecondsString(route.duration))
  const bikingMinutes = legs.filter((l) => l.type === 'bike').reduce((s, l) => s + l.minutes, 0)

  return {
    totalMinutes,
    savedVsWalking: 0, // filled in by caller using baseline
    transferCount: Math.max(0, transferCount),
    bikingMinutes,
    legs,
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
