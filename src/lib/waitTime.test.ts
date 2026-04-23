import { describe, expect, it } from 'vitest'
import { idealLeaveBy } from './waitTime'
import type { Leg, Route } from './types'

function leg(partial: Partial<Leg> & Pick<Leg, 'type' | 'fromName' | 'toName'>): Leg {
  return { minutes: 1, googleMapsUrl: '', ...partial }
}

function route(legs: Leg[]): Route {
  return { totalMinutes: 0, savedVsWalking: 0, transferCount: 0, bikingMinutes: 0, legs }
}

describe('idealLeaveBy', () => {
  it('returns null for a pure bike route (no wait to minimize)', () => {
    expect(
      idealLeaveBy(route([leg({ type: 'bike', fromName: 'A', toName: 'B', seconds: 600 })])),
    ).toBeNull()
  })

  it('returns null when the first transit leg has no departAt', () => {
    expect(
      idealLeaveBy(
        route([
          leg({ type: 'walk', fromName: 'A', toName: 'Stop', seconds: 180 }),
          leg({ type: 'transit', fromName: 'Stop', toName: 'End' }),
        ]),
      ),
    ).toBeNull()
  })

  it('subtracts pre-transit commute time from the first bus departure', () => {
    // Walk 3 min (180s) to a bus that departs 15:00. Ideal: leave at 14:57.
    const result = idealLeaveBy(
      route([
        leg({ type: 'walk', fromName: 'Home', toName: 'Stop A', seconds: 180 }),
        leg({
          type: 'transit',
          fromName: 'Stop A',
          toName: 'End',
          departAt: '2026-04-23T15:00:00Z',
        }),
      ]),
    )
    expect(result?.toISOString()).toBe('2026-04-23T14:57:00.000Z')
  })

  it('sums multiple pre-transit legs (e.g. bike + walk before the first bus)', () => {
    // Bike 4 min (240s) + walk 1 min (60s) = 5 min commute before the 15:10 bus.
    const result = idealLeaveBy(
      route([
        leg({ type: 'bike', fromName: 'Home', toName: 'Lock', seconds: 240 }),
        leg({ type: 'walk', fromName: 'Lock', toName: 'Stop', seconds: 60 }),
        leg({
          type: 'transit',
          fromName: 'Stop',
          toName: 'End',
          departAt: '2026-04-23T15:10:00Z',
        }),
      ]),
    )
    expect(result?.toISOString()).toBe('2026-04-23T15:05:00.000Z')
  })

  it('uses only the FIRST transit leg — later legs compute their own waits', () => {
    const result = idealLeaveBy(
      route([
        leg({ type: 'walk', fromName: 'Home', toName: 'Stop A', seconds: 120 }),
        leg({
          type: 'transit',
          fromName: 'Stop A',
          toName: 'Stop B',
          departAt: '2026-04-23T15:00:00Z',
        }),
        leg({ type: 'walk', fromName: 'Stop B', toName: 'Stop C', seconds: 300 }),
        leg({
          type: 'transit',
          fromName: 'Stop C',
          toName: 'End',
          departAt: '2026-04-23T15:30:00Z',
        }),
      ]),
    )
    // First bus at 15:00, 2 min walk to it → leave at 14:58. Second bus is
    // irrelevant for the initial departure recommendation.
    expect(result?.toISOString()).toBe('2026-04-23T14:58:00.000Z')
  })

  it('falls back to leg.minutes * 60 when seconds is absent', () => {
    const result = idealLeaveBy(
      route([
        leg({ type: 'walk', fromName: 'Home', toName: 'Stop', minutes: 4 }),
        leg({
          type: 'transit',
          fromName: 'Stop',
          toName: 'End',
          departAt: '2026-04-23T15:00:00Z',
        }),
      ]),
    )
    expect(result?.toISOString()).toBe('2026-04-23T14:56:00.000Z')
  })

  it('returns null when departAt is malformed', () => {
    expect(
      idealLeaveBy(
        route([
          leg({ type: 'walk', fromName: 'A', toName: 'Stop', seconds: 180 }),
          leg({ type: 'transit', fromName: 'Stop', toName: 'End', departAt: 'not-a-date' }),
        ]),
      ),
    ).toBeNull()
  })
})
