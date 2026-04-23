import { buildMapsUrl } from './deepLinks'
import type { LatLng, Leg, Route } from './types'

const METERS_PER_MILE = 1609.344

// Skip biking at all for walks shorter than this — not worth the
// unlock/lock overhead to save seconds.
const WALK_THRESHOLD_SEC = 180

// Add this to every candidate bike leg's duration before comparing with
// the walk. Models the real-world overhead of unlocking, mounting, then
// locking and dismounting.
const BIKE_OVERHEAD_SEC = 60

export interface BikeFetcherInput {
  from: { name: string; latLng?: LatLng }
  to: { name: string; latLng?: LatLng }
}

export interface BikeResult {
  seconds: number
  meters: number
}

export type BikeFetcher = (input: BikeFetcherInput) => Promise<BikeResult | null>

export interface ApplyBikeSwapOptions {
  maxBikeMiles: number
  walkThresholdSec?: number
  bikeOverheadSec?: number
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

function recompute(legs: Leg[]): Route {
  const secondsSum = legs.reduce((s, l) => s + (l.seconds ?? l.minutes * 60), 0)
  const totalMinutes = Math.max(1, Math.round(secondsSum / 60))
  const bikingMinutes = legs
    .filter((l) => l.type === 'bike')
    .reduce((s, l) => s + l.minutes, 0)
  const transitSteps = legs.filter((l) => l.type === 'transit').length
  return {
    totalMinutes,
    savedVsWalking: 0, // caller computes vs baseline
    transferCount: Math.max(0, transitSteps - 1),
    bikingMinutes,
    legs,
  }
}

export async function applyBikeSwap(
  routes: Route[],
  fetchBike: BikeFetcher,
  opts: ApplyBikeSwapOptions,
): Promise<ApplyBikeSwapResult> {
  const walkThreshold = opts.walkThresholdSec ?? WALK_THRESHOLD_SEC
  const bikeOverhead = opts.bikeOverheadSec ?? BIKE_OVERHEAD_SEC
  const maxBikeMeters = opts.maxBikeMiles * METERS_PER_MILE

  let bikeCallsMade = 0
  const processed: Route[] = []

  for (const route of routes) {
    const legs = [...route.legs]
    const lastIdx = legs.length - 1

    // Only the first and last legs of a route are candidates. Middle walk
    // legs (between transit stops) are transfers — forcing the user to walk
    // their bike through a station isn't helpful.
    const candidateIdxs: number[] = []
    if (legs[0]?.type === 'walk') candidateIdxs.push(0)
    if (lastIdx > 0 && legs[lastIdx]?.type === 'walk') candidateIdxs.push(lastIdx)

    for (const i of candidateIdxs) {
      const walk = legs[i]
      const walkSec = walk.seconds ?? walk.minutes * 60

      if (walkSec < walkThreshold) continue

      const bike = await fetchBike(toLegInput(walk))
      bikeCallsMade += 1
      if (!bike) continue

      if (bike.meters > maxBikeMeters) continue // user can't bike that far

      if (bike.seconds + bikeOverhead < walkSec) {
        legs[i] = buildBikeLeg(walk, bike)
      }
    }

    processed.push(recompute(legs))
  }

  return { routes: processed, bikeCallsMade }
}
