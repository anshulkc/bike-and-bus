import type { LatLng, Leg, Route } from './types'

// Returns parsed Route[] where each route starts at the boarding stop and
// ends at the trip destination. Caller is responsible for prepending the
// bike leg and recomputing totals.
export interface ReQueryTransitInput {
  fromStop: LatLng
  tripDestination: string
  departureTime: Date
}

export type ReQueryTransitFetcher = (
  input: ReQueryTransitInput,
) => Promise<Route[] | null>

export interface ApplyEarlierDepartureOptions {
  // Minimum time (in seconds) biking needs to save over walking to be worth
  // querying for an earlier bus. Avoid re-querying for tiny savings that won't
  // land on a different schedule.
  minSavingsSec?: number
}

export interface ApplyEarlierDepartureResult {
  routes: Route[]
  transitCallsMade: number
}

const DEFAULT_MIN_SAVINGS_SEC = 60

/**
 * For each swapped route, if biking shaved enough time off the head walk to
 * plausibly catch an earlier departure, re-query transit from the boarding
 * stop with the new arrival time. Replaces the downstream transit portion iff
 * the new route has a total duration less than the currently swapped route.
 *
 * Scope (v1): only routes shaped [bike, transit, ..., walk|nothing]. Routes
 * where the tail is also a bike leg are passed through unchanged —
 * preserving the tail bike across a re-query is more complex than it's
 * worth for the optimization.
 */
export async function applyEarlierDeparture(
  originalRoutes: Route[],
  swappedRoutes: Route[],
  reQuery: ReQueryTransitFetcher,
  tripDestination: string,
  opts: ApplyEarlierDepartureOptions = {},
): Promise<ApplyEarlierDepartureResult> {
  const minSavings = opts.minSavingsSec ?? DEFAULT_MIN_SAVINGS_SEC
  let transitCallsMade = 0
  const out: Route[] = []

  for (let i = 0; i < swappedRoutes.length; i++) {
    const swapped = swappedRoutes[i]
    const original = originalRoutes[i]
    const keepSwapped = () => out.push(swapped)

    const legs = swapped.legs
    const headBike = legs[0]
    const firstTransit = legs[1]
    const lastLeg = legs[legs.length - 1]

    // Skip unless shape is [bike, transit, ...] and tail wasn't swapped.
    const headIsBike = headBike?.type === 'bike'
    const secondIsTransit = firstTransit?.type === 'transit'
    const tailIsBike = legs.length > 1 && lastLeg.type === 'bike' && lastLeg !== headBike
    if (!headIsBike || !secondIsTransit || tailIsBike) {
      keepSwapped()
      continue
    }

    const origWalk = original?.legs[0]
    const origBusDepartAt = firstTransit.departAt
    const stopLatLng = headBike.toLatLng ?? firstTransit.fromLatLng

    if (!origWalk || origWalk.type !== 'walk' || !origBusDepartAt || !stopLatLng) {
      keepSwapped()
      continue
    }

    const walkSec = origWalk.seconds ?? origWalk.minutes * 60
    const bikeSec = headBike.seconds ?? headBike.minutes * 60
    const savedSec = walkSec - bikeSec
    if (savedSec < minSavings) {
      keepSwapped()
      continue
    }

    const busDepart = new Date(origBusDepartAt).getTime()
    if (!Number.isFinite(busDepart)) {
      keepSwapped()
      continue
    }
    // When biking would deliver the user to the stop, relative to the bus
    // departure: busDepart - savedSec*1000.
    const newArrivalAtStop = new Date(busDepart - savedSec * 1000)

    const reQueried = await reQuery({
      fromStop: stopLatLng,
      tripDestination,
      departureTime: newArrivalAtStop,
    })
    transitCallsMade += 1

    if (!reQueried || reQueried.length === 0) {
      keepSwapped()
      continue
    }

    // Pick the candidate that yields the lowest total trip time when prepended
    // with the existing bike leg.
    const candidates = reQueried.map((r) => ({
      route: r,
      combinedMinutes: headBike.minutes + r.totalMinutes,
    }))
    candidates.sort((a, b) => a.combinedMinutes - b.combinedMinutes)
    const best = candidates[0]

    // Only use the re-queried route if it's genuinely faster than the current
    // swapped route. Earlier departure doesn't always equal faster total.
    if (best.combinedMinutes >= swapped.totalMinutes) {
      keepSwapped()
      continue
    }

    // Ensure the new route actually departs earlier than the original bus.
    const newFirstTransit = best.route.legs.find((l) => l.type === 'transit')
    if (!newFirstTransit?.departAt) {
      keepSwapped()
      continue
    }
    const newBusDepart = new Date(newFirstTransit.departAt).getTime()
    if (!(newBusDepart < busDepart)) {
      keepSwapped()
      continue
    }

    const newLegs: Leg[] = [headBike, ...best.route.legs]
    const bikingMinutes = newLegs
      .filter((l) => l.type === 'bike')
      .reduce((s, l) => s + l.minutes, 0)
    const transferCount = Math.max(0, newLegs.filter((l) => l.type === 'transit').length - 1)

    out.push({
      totalMinutes: best.combinedMinutes,
      savedVsWalking: 0, // caller fills in vs. baseline
      transferCount,
      bikingMinutes,
      legs: newLegs,
    })
  }

  return { routes: out, transitCallsMade }
}
