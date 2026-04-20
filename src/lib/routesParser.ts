import { buildMapsUrl } from './deepLinks'
import type {
  GoogleLatLng,
  GoogleRoute,
  GoogleRouteStep,
  GoogleRoutesResponse,
} from './googleTypes'
import type { Leg, Route } from './types'

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
  const minutes = toMinutes(parseSecondsString(step.staticDuration))

  return {
    type: 'transit',
    fromName: fromInfo.display,
    toName: toInfo.display,
    minutes,
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

function parseWalkStep(step: GoogleRouteStep, ctx: LegContext): Leg | null {
  if (step.travelMode !== 'WALK') return null
  const minutes = toMinutes(parseSecondsString(step.staticDuration))

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
    minutes,
    googleMapsUrl: buildMapsUrl({
      origin: fromName,
      destination: toName,
      type: 'walk',
    }),
  }
}

function parseRoute(route: GoogleRoute, tripOrigin: string, tripDestination: string): Route | null {
  const steps = route.legs?.flatMap((l) => l.steps ?? []) ?? []
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
    }
    // Other travel modes (DRIVE, BICYCLE on initial transit query) are unexpected
    // and dropped. Bike legs get introduced by the swap algorithm (task #7).
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
