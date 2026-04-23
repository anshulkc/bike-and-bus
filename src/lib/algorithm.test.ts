import { describe, expect, it, vi } from 'vitest'
import { applyBikeSwap } from './algorithm'
import type { Leg, Route } from './types'

function walkLeg(overrides: Partial<Leg> = {}): Leg {
  return {
    type: 'walk',
    fromName: 'A',
    toName: 'B',
    minutes: 8,
    seconds: 480,
    meters: 700,
    googleMapsUrl: '',
    ...overrides,
  }
}

function transitLeg(overrides: Partial<Leg> = {}): Leg {
  return {
    type: 'transit',
    fromName: 'Stop 1',
    toName: 'Stop 2',
    minutes: 14,
    seconds: 840,
    line: '8',
    googleMapsUrl: '',
    ...overrides,
  }
}

function route(legs: Leg[]): Route {
  const totalMinutes = legs.reduce((s, l) => s + l.minutes, 0)
  return {
    totalMinutes,
    savedVsWalking: 0,
    transferCount: Math.max(0, legs.filter((l) => l.type === 'transit').length - 1),
    bikingMinutes: legs.filter((l) => l.type === 'bike').reduce((s, l) => s + l.minutes, 0),
    legs,
  }
}

describe('applyBikeSwap', () => {
  it('swaps a leading walk leg for a bike leg when biking is faster', async () => {
    const input = [route([walkLeg(), transitLeg()])]
    const fetchBike = vi.fn().mockResolvedValue({ seconds: 240, meters: 1000 })

    const out = await applyBikeSwap(input, fetchBike, { maxBikeMiles: 3 })

    expect(fetchBike).toHaveBeenCalledTimes(1)
    expect(out.routes[0].legs[0].type).toBe('bike')
    expect(out.routes[0].legs[0].minutes).toBe(4) // 240s → 4 min
    expect(out.routes[0].legs[1].type).toBe('transit') // untouched
  })

  it('keeps a walk leg as walk when bike time + overhead is not faster', async () => {
    const input = [route([walkLeg({ seconds: 180, minutes: 3 }), transitLeg()])]
    // 3 min walk; bike would take 2 min + 60s overhead = 3 min → not faster
    const fetchBike = vi.fn().mockResolvedValue({ seconds: 120, meters: 600 })

    const out = await applyBikeSwap(input, fetchBike, { maxBikeMiles: 3 })

    expect(out.routes[0].legs[0].type).toBe('walk')
  })

  it('keeps walk (does not swap) when the bike leg would exceed the threshold', async () => {
    const input = [route([walkLeg({ seconds: 2400, minutes: 40, meters: 3000 }), transitLeg()])]
    // Long walk: bike would be 4 mi — over the 3-mi threshold
    const fetchBike = vi.fn().mockResolvedValue({ seconds: 900, meters: 6437 })

    const out = await applyBikeSwap(input, fetchBike, { maxBikeMiles: 3 })

    expect(out.routes[0].legs[0].type).toBe('walk')
    expect(out.routes[0].legs[0].minutes).toBe(40) // unchanged
  })

  it('considers both first and last walk legs in a walk → transit → walk route', async () => {
    const input = [route([walkLeg(), transitLeg(), walkLeg({ seconds: 300, minutes: 5 })])]
    const fetchBike = vi.fn().mockResolvedValue({ seconds: 120, meters: 500 })

    const out = await applyBikeSwap(input, fetchBike, { maxBikeMiles: 3 })

    expect(fetchBike).toHaveBeenCalledTimes(2)
    expect(out.routes[0].legs[0].type).toBe('bike')
    expect(out.routes[0].legs[2].type).toBe('bike')
  })

  it('skips walk legs below the walk threshold (not worth mounting a bike)', async () => {
    const input = [route([walkLeg({ seconds: 120, minutes: 2 }), transitLeg()])]
    const fetchBike = vi.fn().mockResolvedValue({ seconds: 30, meters: 100 })

    const out = await applyBikeSwap(input, fetchBike, { maxBikeMiles: 3 })

    expect(fetchBike).not.toHaveBeenCalled()
    expect(out.routes[0].legs[0].type).toBe('walk')
  })

  it('leaves the walk leg untouched when the bike fetch fails', async () => {
    const input = [route([walkLeg(), transitLeg()])]
    const fetchBike = vi.fn().mockResolvedValue(null)

    const out = await applyBikeSwap(input, fetchBike, { maxBikeMiles: 3 })

    expect(out.routes[0].legs[0].type).toBe('walk')
  })

  it('does not touch middle walk legs (transfers between transit stops)', async () => {
    const input = [
      route([
        walkLeg(),
        transitLeg(),
        walkLeg({ seconds: 300, minutes: 5, fromName: 'Stop 2', toName: 'Stop 3' }),
        transitLeg({ fromName: 'Stop 3', toName: 'Stop 4' }),
        walkLeg(),
      ]),
    ]
    const fetchBike = vi.fn().mockResolvedValue({ seconds: 120, meters: 500 })

    const out = await applyBikeSwap(input, fetchBike, { maxBikeMiles: 3 })

    // Only the first and last walks can swap — not the transfer walk in the middle
    expect(fetchBike).toHaveBeenCalledTimes(2)
    expect(out.routes[0].legs[0].type).toBe('bike')
    expect(out.routes[0].legs[2].type).toBe('walk') // middle walk stays
    expect(out.routes[0].legs[4].type).toBe('bike')
  })

  it('recomputes totalMinutes and bikingMinutes after swapping', async () => {
    const input = [route([walkLeg(), transitLeg()])] // 8 + 14 = 22 min
    const fetchBike = vi.fn().mockResolvedValue({ seconds: 180, meters: 700 })
    // After swap: 3 + 14 = 17 min, bikingMinutes=3

    const out = await applyBikeSwap(input, fetchBike, { maxBikeMiles: 3 })

    expect(out.routes[0].totalMinutes).toBe(17)
    expect(out.routes[0].bikingMinutes).toBe(3)
  })
})
