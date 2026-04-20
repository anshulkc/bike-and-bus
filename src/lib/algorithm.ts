import {
  BIKE_OVERHEAD_SEC,
  MAX_BIKE_MILES,
  MAX_BIKE_MIN,
  METERS_PER_MILE,
  WALK_THRESHOLD_SEC,
} from './config'
import { buildMapsUrl } from './deepLinks'
import type { LatLng, Leg, Route } from './types'

export interface BikeFetcherInput {
  from: { name: string; latLng?: LatLng }
  to: { name: string; latLng?: LatLng }
}

export interface BikeResult {
  seconds: number
  meters: number
}

// Pure-signature so the algorithm can be tested without any I/O.
// Returns null to signal "can't route by bike" — leg stays a walk.
export type BikeFetcher = (input: BikeFetcherInput) => Promise<BikeResult | null>

export interface ApplyBikeSwapOptions {
  bikeAtDestination: boolean
  walkThresholdSec?: number
  bikeOverheadSec?: number
  maxBikeMin?: number
  maxBikeMiles?: number
}

export interface ApplyBikeSwapResult {
  routes: Route[]
  bikeCallsMade: number
}

function toLegInput(leg: Leg): BikeFetcherInput {
  return {
    from: { name: leg.fromName, latLng: leg.fromLatLng },
    to: { name: leg.toName, latLng: leg.toLatLng },
  }
}

function buildBikeLeg(walkLeg: Leg, bike: BikeResult): Leg {
  return {
    type: 'bike',
    fromName: walkLeg.fromName,
    toName: walkLeg.toName,
    fromLatLng: walkLeg.fromLatLng,
    toLatLng: walkLeg.toLatLng,
    minutes: Math.max(1, Math.round(bike.seconds / 60)),
    seconds: bike.seconds,
    meters: bike.meters,
    googleMapsUrl: buildMapsUrl({
      origin: walkLeg.fromName,
      destination: walkLeg.toName,
      type: 'bike',
    }),
  }
}

function routeWithRecomputedTotals(legs: Leg[], originalTotalMinutes: number): Route {
  const secondsSum = legs.reduce((s, l) => s + (l.seconds ?? l.minutes * 60), 0)
  // Prefer the summed seconds when we have them; fall back to the original
  // total otherwise (keeps parity on legs we didn't touch).
  const totalMinutes = Math.max(1, Math.round(secondsSum / 60) || originalTotalMinutes)
  const bikingMinutes = legs
    .filter((l) => l.type === 'bike')
    .reduce((s, l) => s + l.minutes, 0)
  const transitSteps = legs.filter((l) => l.type === 'transit').length

  return {
    totalMinutes,
    savedVsWalking: 0, // caller computes against baseline
    transferCount: Math.max(0, transitSteps - 1),
    bikingMinutes,
    legs,
  }
}

function exceedsBikeLimits(bike: BikeResult, maxMin: number, maxMiles: number): boolean {
  if (bike.seconds / 60 > maxMin) return true
  if (bike.meters / METERS_PER_MILE > maxMiles) return true
  return false
}

export async function applyBikeSwap(
  routes: Route[],
  fetchBike: BikeFetcher,
  opts: ApplyBikeSwapOptions,
): Promise<ApplyBikeSwapResult> {
  const walkThreshold = opts.walkThresholdSec ?? WALK_THRESHOLD_SEC
  const bikeOverhead = opts.bikeOverheadSec ?? BIKE_OVERHEAD_SEC
  const maxBikeMin = opts.maxBikeMin ?? MAX_BIKE_MIN
  const maxBikeMiles = opts.maxBikeMiles ?? MAX_BIKE_MILES

  let bikeCallsMade = 0
  const processed: Route[] = []

  for (const route of routes) {
    const legs = [...route.legs]
    const lastIdx = legs.length - 1

    // Determine which indices are eligible for swap evaluation.
    // Only head walk (index 0) and, if bikeAtDestination, tail walk (index lastIdx).
    // Mid-route walks (transfer walks) are never swapped.
    const candidates: number[] = []
    if (legs[0]?.type === 'walk') candidates.push(0)
    if (opts.bikeAtDestination && lastIdx > 0 && legs[lastIdx]?.type === 'walk') {
      candidates.push(lastIdx)
    }

    let dropRoute = false

    for (const i of candidates) {
      const walk = legs[i]
      const walkSec = walk.seconds ?? walk.minutes * 60

      // Skip short walks entirely — don't even query bike.
      if (walkSec < walkThreshold) continue

      const bike = await fetchBike(toLegInput(walk))
      bikeCallsMade += 1

      if (!bike) continue // fetch failed → keep as walk

      // Drop the whole candidate if bike leg would be absurdly long.
      if (exceedsBikeLimits(bike, maxBikeMin, maxBikeMiles)) {
        dropRoute = true
        break
      }

      // Swap only if bike + overhead is faster than walk.
      if (bike.seconds + bikeOverhead < walkSec) {
        legs[i] = buildBikeLeg(walk, bike)
      }
    }

    if (dropRoute) continue
    processed.push(routeWithRecomputedTotals(legs, route.totalMinutes))
  }

  return { routes: processed, bikeCallsMade }
}
