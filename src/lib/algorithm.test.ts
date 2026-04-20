import { describe, expect, it, vi } from 'vitest'
import { applyBikeSwap, type BikeFetcher } from './algorithm'
import type { Leg, Route } from './types'

function walk(overrides: Partial<Leg> = {}): Leg {
  return {
    type: 'walk',
    fromName: 'A',
    toName: 'B',
    fromLatLng: { lat: 34.0, lng: -118.4 },
    toLatLng: { lat: 34.1, lng: -118.3 },
    minutes: 8,
    seconds: 480,
    meters: 640,
    googleMapsUrl: 'https://example/walk',
    ...overrides,
  }
}

function transit(overrides: Partial<Leg> = {}): Leg {
  return {
    type: 'transit',
    fromName: 'Stop A',
    toName: 'Stop B',
    minutes: 14,
    seconds: 840,
    line: 'Red Line',
    googleMapsUrl: 'https://example/transit',
    ...overrides,
  }
}

function route(legs: Leg[], total = 0): Route {
  const totalMinutes =
    total || Math.max(1, Math.round(legs.reduce((s, l) => s + l.minutes, 0)))
  const bikingMinutes = legs.filter((l) => l.type === 'bike').reduce((s, l) => s + l.minutes, 0)
  const transitCount = legs.filter((l) => l.type === 'transit').length
  return {
    totalMinutes,
    savedVsWalking: 0,
    transferCount: Math.max(0, transitCount - 1),
    bikingMinutes,
    legs,
  }
}

// Simple fake: returns a fixed bike time/distance for every call.
function fixedBike(seconds: number, meters = 800): BikeFetcher {
  return async () => ({ seconds, meters })
}

describe('applyBikeSwap', () => {
  it('swaps the head walk leg when bike+overhead saves time', async () => {
    const r = route([walk({ seconds: 480 /* 8 min */ }), transit()])
    const result = await applyBikeSwap([r], fixedBike(240 /* 4 min */), {})
    expect(result.routes).toHaveLength(1)
    expect(result.routes[0].legs[0].type).toBe('bike')
    expect(result.bikeCallsMade).toBe(1)
  })

  it("keeps walk when bike+overhead doesn't save enough time", async () => {
    // 8 min walk, 7 min bike + 60s overhead = 480s. Walk is 480s. Not strictly less → keep walk.
    const r = route([walk({ seconds: 480 }), transit()])
    const result = await applyBikeSwap([r], fixedBike(420 /* 7 min */), {})
    expect(result.routes[0].legs[0].type).toBe('walk')
    expect(result.bikeCallsMade).toBe(1)
  })

  it('does not query bike for walks shorter than WALK_THRESHOLD_SEC', async () => {
    // 2-minute walk, below the 180s threshold → no bike API call.
    const r = route([walk({ seconds: 120 }), transit()])
    const fetcher = vi.fn().mockResolvedValue({ seconds: 30, meters: 100 })
    const result = await applyBikeSwap([r], fetcher, {})
    expect(fetcher).not.toHaveBeenCalled()
    expect(result.routes[0].legs[0].type).toBe('walk')
    expect(result.bikeCallsMade).toBe(0)
  })

  it('swaps both head and tail walk legs', async () => {
    const r = route([walk({ seconds: 480 }), transit(), walk({ seconds: 360 })])
    const result = await applyBikeSwap([r], fixedBike(240), {})
    expect(result.routes[0].legs[0].type).toBe('bike')
    expect(result.routes[0].legs[2].type).toBe('bike')
    expect(result.bikeCallsMade).toBe(2)
  })

  it('never swaps a mid-route walk (transfer walk between two transit legs)', async () => {
    const r = route([
      walk({ fromName: 'Origin', seconds: 480 }), // head
      transit(),
      walk({ fromName: 'A', toName: 'B', seconds: 420 }), // transfer walk, MUST stay walk
      transit(),
      walk({ fromName: 'Stop', toName: 'Dest', seconds: 360 }), // tail
    ])
    const fetcher = vi.fn().mockResolvedValue({ seconds: 240, meters: 600 })
    const result = await applyBikeSwap([r], fetcher, {})
    // Only head + tail get queried; transfer walk is untouched.
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(result.routes[0].legs[0].type).toBe('bike')
    expect(result.routes[0].legs[2].type).toBe('walk') // transfer walk
    expect(result.routes[0].legs[4].type).toBe('bike')
  })

  it('drops a candidate whose bike leg exceeds MAX_BIKE_MIN', async () => {
    const r1 = route([walk({ seconds: 480 }), transit()])
    const result = await applyBikeSwap([r1], fixedBike(1500 /* 25 min */), {})
    expect(result.routes).toHaveLength(0)
  })

  it('drops a candidate whose bike leg exceeds MAX_BIKE_MILES', async () => {
    const r1 = route([walk({ seconds: 480 }), transit()])
    // 500s bike, 8,047m (5 miles) — over the 4-mile limit.
    const result = await applyBikeSwap([r1], fixedBike(500, 8047), {})
    expect(result.routes).toHaveLength(0)
  })

  it('keeps walk when the bike fetcher returns null (could not route)', async () => {
    const r = route([walk({ seconds: 480 }), transit()])
    const result = await applyBikeSwap([r], async () => null, {})
    expect(result.routes[0].legs[0].type).toBe('walk')
    expect(result.bikeCallsMade).toBe(1)
  })

  it('recomputes totalMinutes from the final leg mix after swapping', async () => {
    const r = route(
      [walk({ seconds: 600 /* 10 min */ }), transit({ seconds: 840 /* 14 min */ })],
      24,
    )
    // Bike 4 min + overhead 1 min → effectively 5 min bike + 14 min transit = 19 min total
    const result = await applyBikeSwap([r], fixedBike(240 /* 4 min */), {})
    // Sum of bike leg seconds (240) + transit seconds (840) = 1080s = 18 min rounded.
    // (BIKE_OVERHEAD is applied during decision, not added to the displayed leg time.)
    expect(result.routes[0].totalMinutes).toBe(18)
    expect(result.routes[0].bikingMinutes).toBe(4)
  })

  it('processes multiple candidate routes independently', async () => {
    const r1 = route([walk({ seconds: 480 }), transit()])
    const r2 = route([walk({ seconds: 120 }), transit()]) // under threshold — no query
    const r3 = route([walk({ seconds: 600 }), transit()])
    const fetcher = vi.fn().mockResolvedValue({ seconds: 240, meters: 700 })
    const result = await applyBikeSwap([r1, r2, r3], fetcher, {})
    // r1 and r3 query bike (r2 is under threshold). 2 calls total.
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(result.routes[0].legs[0].type).toBe('bike') // r1 swapped
    expect(result.routes[1].legs[0].type).toBe('walk') // r2 untouched
    expect(result.routes[2].legs[0].type).toBe('bike') // r3 swapped
  })

  it('respects custom thresholds passed via options', async () => {
    const r = route([walk({ seconds: 480 }), transit()])
    // Raise the walk threshold so this 8-minute walk no longer qualifies.
    const fetcher = vi.fn().mockResolvedValue({ seconds: 240, meters: 600 })
    const result = await applyBikeSwap([r], fetcher, {
      walkThresholdSec: 900,
    })
    expect(fetcher).not.toHaveBeenCalled()
    expect(result.routes[0].legs[0].type).toBe('walk')
  })

  it('passes leg lat/lng and names to the bike fetcher', async () => {
    const r = route([
      walk({
        fromName: 'Home',
        toName: 'Wilshire/Western',
        fromLatLng: { lat: 34.05, lng: -118.26 },
        toLatLng: { lat: 34.06, lng: -118.31 },
        seconds: 480,
      }),
      transit(),
    ])
    const fetcher = vi.fn().mockResolvedValue({ seconds: 240, meters: 600 })
    await applyBikeSwap([r], fetcher, {})
    expect(fetcher).toHaveBeenCalledWith({
      from: { name: 'Home', latLng: { lat: 34.05, lng: -118.26 } },
      to: { name: 'Wilshire/Western', latLng: { lat: 34.06, lng: -118.31 } },
    })
  })

  it('builds a bicycling deep link on swapped legs', async () => {
    const r = route([walk({ fromName: 'Home', toName: 'Stop', seconds: 480 }), transit()])
    const result = await applyBikeSwap([r], fixedBike(240), {})
    const bikeLeg = result.routes[0].legs[0]
    expect(bikeLeg.googleMapsUrl).toContain('travelmode=bicycling')
    expect(bikeLeg.googleMapsUrl).toContain('origin=Home')
    expect(bikeLeg.googleMapsUrl).toContain('destination=Stop')
  })
})
