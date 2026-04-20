import { describe, expect, it, vi } from 'vitest'
import { applyEarlierDeparture, type ReQueryTransitFetcher } from './earlierDeparture'
import type { Leg, Route } from './types'

const STOP: { lat: number; lng: number } = { lat: 34.0617, lng: -118.3076 }

function bikeLeg(overrides: Partial<Leg> = {}): Leg {
  return {
    type: 'bike',
    fromName: 'Home',
    toName: 'Wilshire/Western',
    fromLatLng: { lat: 34.05, lng: -118.26 },
    toLatLng: STOP,
    minutes: 4,
    seconds: 240,
    meters: 1200,
    googleMapsUrl: 'https://example/bike',
    ...overrides,
  }
}

function transitLeg(overrides: Partial<Leg> = {}): Leg {
  return {
    type: 'transit',
    fromName: 'Wilshire/Western',
    toName: 'Pershing Square',
    fromLatLng: STOP,
    minutes: 14,
    seconds: 840,
    line: 'Red Line',
    departAt: '2026-04-20T15:42:00Z',
    arriveAt: '2026-04-20T15:56:00Z',
    googleMapsUrl: 'https://example/transit',
    ...overrides,
  }
}

function walkLeg(overrides: Partial<Leg> = {}): Leg {
  return {
    type: 'walk',
    fromName: 'Home',
    toName: 'Wilshire/Western',
    minutes: 8,
    seconds: 480,
    meters: 640,
    googleMapsUrl: 'https://example/walk',
    ...overrides,
  }
}

function tailWalk(overrides: Partial<Leg> = {}): Leg {
  return {
    type: 'walk',
    fromName: 'Pershing Square',
    toName: 'Destination',
    minutes: 2,
    seconds: 120,
    meters: 180,
    googleMapsUrl: 'https://example/walk-tail',
    ...overrides,
  }
}

function route(legs: Leg[], total?: number): Route {
  const secondsSum = legs.reduce((s, l) => s + (l.seconds ?? l.minutes * 60), 0)
  const totalMinutes = total ?? Math.round(secondsSum / 60)
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

describe('applyEarlierDeparture', () => {
  it('replaces transit when re-query finds an earlier, faster total', async () => {
    const original = route([walkLeg(), transitLeg(), tailWalk()])
    const swapped = route([bikeLeg(), transitLeg(), tailWalk()])
    // Swapped route total: 4 + 14 + 2 = 20 min.
    // Original walk 8 min, bike 4 min → saved 4 min.
    // newArrivalAtStop = 15:42 − 4min = 15:38.
    const reQueried = route(
      [
        transitLeg({ departAt: '2026-04-20T15:40:00Z', arriveAt: '2026-04-20T15:52:00Z', minutes: 12, seconds: 720 }),
        tailWalk(),
      ],
      14, // 12 + 2
    )
    const fetcher: ReQueryTransitFetcher = vi.fn().mockResolvedValue([reQueried])

    const result = await applyEarlierDeparture([original], [swapped], fetcher, 'Destination')

    expect(result.transitCallsMade).toBe(1)
    expect(result.routes).toHaveLength(1)
    const [r] = result.routes
    expect(r.totalMinutes).toBe(18) // bike 4 + new transit 12 + walk 2
    expect(r.legs[0].type).toBe('bike')
    expect(r.legs[1].type).toBe('transit')
    expect((r.legs[1] as Leg).departAt).toBe('2026-04-20T15:40:00Z')
  })

  it('keeps original swapped route when re-query finds no earlier departure', async () => {
    const original = route([walkLeg(), transitLeg(), tailWalk()])
    const swapped = route([bikeLeg(), transitLeg(), tailWalk()])
    // Re-query returns the same departure (no earlier bus available).
    const reQueried = route([transitLeg(), tailWalk()])
    const fetcher: ReQueryTransitFetcher = vi.fn().mockResolvedValue([reQueried])

    const result = await applyEarlierDeparture([original], [swapped], fetcher, 'Destination')

    expect(result.transitCallsMade).toBe(1)
    expect(result.routes[0]).toBe(swapped) // unchanged reference
  })

  it('keeps original when re-query is earlier but total is longer', async () => {
    const original = route([walkLeg(), transitLeg(), tailWalk()])
    const swapped = route([bikeLeg(), transitLeg(), tailWalk()]) // total 20
    // Earlier departure but much slower transit → total 22, not worth it.
    const reQueried = route(
      [
        transitLeg({ departAt: '2026-04-20T15:38:00Z', minutes: 18, seconds: 1080 }),
        tailWalk(),
      ],
      20,
    )
    const fetcher: ReQueryTransitFetcher = vi.fn().mockResolvedValue([reQueried])

    const result = await applyEarlierDeparture([original], [swapped], fetcher, 'Destination')

    expect(result.routes[0]).toBe(swapped)
  })

  it('skips re-query when bike savings are below the min threshold', async () => {
    // bike 7 min, walk 8 min → only 60s saved. Below default 60s *strict* bound? Actually default is 60s, this is exactly 60s → also below our strict check.
    const original = route([walkLeg({ seconds: 480 }), transitLeg(), tailWalk()])
    const swapped = route([bikeLeg({ seconds: 420, minutes: 7 }), transitLeg(), tailWalk()])
    const fetcher = vi.fn()
    const result = await applyEarlierDeparture([original], [swapped], fetcher, 'Destination', {
      minSavingsSec: 120, // require 2 min savings
    })
    expect(fetcher).not.toHaveBeenCalled()
    expect(result.routes[0]).toBe(swapped)
  })

  it('skips routes where the head leg is still walk (no swap happened)', async () => {
    const original = route([walkLeg(), transitLeg(), tailWalk()])
    const swapped = route([walkLeg(), transitLeg(), tailWalk()]) // not swapped
    const fetcher = vi.fn()
    const result = await applyEarlierDeparture([original], [swapped], fetcher, 'Destination')
    expect(fetcher).not.toHaveBeenCalled()
    expect(result.routes[0]).toBe(swapped)
  })

  it('skips routes where the tail walk was also swapped to bike', async () => {
    // [bike, transit, bike] — tail-swap case. We pass these through unchanged
    // to avoid having to re-apply the tail bike swap on the re-query result.
    const original = route([walkLeg(), transitLeg(), tailWalk()])
    const swapped = route([bikeLeg(), transitLeg(), bikeLeg({ fromName: 'Pershing', toName: 'Dest' })])
    const fetcher = vi.fn()
    const result = await applyEarlierDeparture([original], [swapped], fetcher, 'Destination')
    expect(fetcher).not.toHaveBeenCalled()
    expect(result.routes[0]).toBe(swapped)
  })

  it('keeps original when re-query returns null (API failure)', async () => {
    const original = route([walkLeg(), transitLeg(), tailWalk()])
    const swapped = route([bikeLeg(), transitLeg(), tailWalk()])
    const fetcher: ReQueryTransitFetcher = async () => null
    const result = await applyEarlierDeparture([original], [swapped], fetcher, 'Destination')
    expect(result.routes[0]).toBe(swapped)
    expect(result.transitCallsMade).toBe(1)
  })

  it('keeps original when re-queried transit somehow departs later than original', async () => {
    const original = route([walkLeg(), transitLeg(), tailWalk()])
    const swapped = route([bikeLeg(), transitLeg(), tailWalk()])
    // Same totalMinutes but later departAt → rare but defensive.
    const reQueried = route(
      [transitLeg({ departAt: '2026-04-20T15:44:00Z', arriveAt: '2026-04-20T15:58:00Z' }), tailWalk()],
      14,
    )
    const fetcher: ReQueryTransitFetcher = async () => [reQueried]
    const result = await applyEarlierDeparture([original], [swapped], fetcher, 'Destination')
    // 4 + 14 + 2 = 20 (same as swapped) so combinedMinutes >= swapped.totalMinutes → keeps original.
    expect(result.routes[0]).toBe(swapped)
  })

  it('calls re-query with the correct newArrivalAtStop derived from bus departure and savings', async () => {
    // walk 8 min (480s), bike 4 min (240s), saved 240s = 4 min.
    // Original bus departs 2026-04-20T15:42:00Z.
    // Expected newArrivalAtStop = 15:42:00 − 4 min = 15:38:00Z.
    const original = route([walkLeg(), transitLeg(), tailWalk()])
    const swapped = route([bikeLeg(), transitLeg(), tailWalk()])
    const fetcher: ReQueryTransitFetcher = vi.fn().mockResolvedValue(null)
    await applyEarlierDeparture([original], [swapped], fetcher, 'Destination')
    expect(fetcher).toHaveBeenCalledTimes(1)
    const call = (fetcher as unknown as { mock: { calls: [{ departureTime: Date }][] } }).mock.calls[0][0]
    expect(call.departureTime.toISOString()).toBe('2026-04-20T15:38:00.000Z')
  })

  it('picks the fastest combined-total candidate when re-query returns multiple', async () => {
    const original = route([walkLeg(), transitLeg(), tailWalk()])
    const swapped = route([bikeLeg(), transitLeg(), tailWalk()]) // 20 min total
    // Two options: 13 min + tail (15 total) and 14 min + tail (16 total)
    const fasterOption = route(
      [
        transitLeg({ departAt: '2026-04-20T15:39:00Z', minutes: 13, seconds: 780 }),
        tailWalk(),
      ],
      15,
    )
    const slowerOption = route(
      [
        transitLeg({ departAt: '2026-04-20T15:40:00Z', minutes: 14, seconds: 840 }),
        tailWalk(),
      ],
      16,
    )
    const fetcher: ReQueryTransitFetcher = async () => [slowerOption, fasterOption]
    const result = await applyEarlierDeparture([original], [swapped], fetcher, 'Destination')
    const [r] = result.routes
    expect(r.totalMinutes).toBe(19) // bike 4 + 15 (faster option)
    // Verify it picked the 15:39 departure, not 15:40
    expect((r.legs[1] as Leg).departAt).toBe('2026-04-20T15:39:00Z')
  })

  it('handles timezones correctly by using ISO-8601 offsets', async () => {
    const original = route([
      walkLeg({ seconds: 480 }),
      transitLeg({
        departAt: '2026-04-20T08:42:00-07:00', // LA time = 15:42 UTC
        arriveAt: '2026-04-20T08:56:00-07:00',
      }),
      tailWalk(),
    ])
    const swapped = route([
      bikeLeg({ seconds: 240 }),
      transitLeg({
        departAt: '2026-04-20T08:42:00-07:00',
        arriveAt: '2026-04-20T08:56:00-07:00',
      }),
      tailWalk(),
    ])
    const fetcher: ReQueryTransitFetcher = vi.fn().mockResolvedValue(null)
    await applyEarlierDeparture([original], [swapped], fetcher, 'Destination')
    const call = (fetcher as unknown as { mock: { calls: [{ departureTime: Date }][] } })
      .mock.calls[0][0]
    // 08:42 Pacific minus 4 min = 08:38 Pacific = 15:38 UTC
    expect(call.departureTime.toISOString()).toBe('2026-04-20T15:38:00.000Z')
  })

  it('processes multiple routes independently', async () => {
    const orig1 = route([walkLeg(), transitLeg(), tailWalk()])
    const orig2 = route([walkLeg(), transitLeg({ line: '720' }), tailWalk()])
    const swap1 = route([bikeLeg(), transitLeg(), tailWalk()])
    const swap2 = route([walkLeg(), transitLeg({ line: '720' }), tailWalk()]) // not swapped

    const fetcher = vi.fn().mockResolvedValue(null)
    const result = await applyEarlierDeparture([orig1, orig2], [swap1, swap2], fetcher, 'Destination')

    // Only swap1 triggers a re-query; swap2's head is still walk.
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(result.routes).toHaveLength(2)
    expect(result.routes[1]).toBe(swap2)
  })
})
