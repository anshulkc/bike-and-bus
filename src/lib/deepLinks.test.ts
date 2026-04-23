import { describe, expect, it } from 'vitest'
import { buildMapsUrl, buildTripMapsUrl } from './deepLinks'
import type { Leg, Route } from './types'

function route(legs: Leg[]): Route {
  return { totalMinutes: 0, savedVsWalking: 0, transferCount: 0, bikingMinutes: 0, legs }
}

function leg(partial: Partial<Leg> & Pick<Leg, 'type' | 'fromName' | 'toName'>): Leg {
  return { minutes: 1, googleMapsUrl: '', ...partial }
}

describe('buildMapsUrl', () => {
  it('builds a bicycling URL with url-encoded origin and destination', () => {
    const url = buildMapsUrl({
      origin: '1234 Westwood Blvd, Los Angeles, CA',
      destination: 'Wilshire/Western Station',
      type: 'bike',
    })
    expect(url).toBe(
      'https://www.google.com/maps/dir/?api=1&origin=1234+Westwood+Blvd%2C+Los+Angeles%2C+CA&destination=Wilshire%2FWestern+Station&travelmode=bicycling',
    )
  })

  it('maps transit type to travelmode=transit', () => {
    const url = buildMapsUrl({ origin: 'A', destination: 'B', type: 'transit' })
    expect(url).toContain('travelmode=transit')
  })

  it('maps walk type to travelmode=walking (not walk)', () => {
    const url = buildMapsUrl({ origin: 'A', destination: 'B', type: 'walk' })
    expect(url).toContain('travelmode=walking')
  })

  it('maps bike type to travelmode=bicycling (not bike or biking)', () => {
    const url = buildMapsUrl({ origin: 'A', destination: 'B', type: 'bike' })
    expect(url).toContain('travelmode=bicycling')
  })

  it('accepts lat,lng origin and destination without extra encoding', () => {
    const url = buildMapsUrl({
      origin: '34.0689,-118.4452',
      destination: '34.0617,-118.3076',
      type: 'bike',
    })
    // comma encodes as %2C; minus stays literal
    expect(url).toContain('origin=34.0689%2C-118.4452')
    expect(url).toContain('destination=34.0617%2C-118.3076')
  })
})

describe('buildTripMapsUrl', () => {
  it('returns a bicycling URL for a pure bike trip', () => {
    const url = buildTripMapsUrl(
      route([leg({ type: 'bike', fromName: 'Home', toName: '527 Midvale' })]),
    )
    expect(url).toContain('origin=Home')
    expect(url).toContain('destination=527+Midvale')
    expect(url).toContain('travelmode=bicycling')
    expect(url).not.toContain('waypoints=')
  })

  it('returns a transit URL when any leg is transit, covering the whole trip', () => {
    const url = buildTripMapsUrl(
      route([
        leg({ type: 'walk', fromName: 'Home', toName: 'Stop A' }),
        leg({ type: 'transit', fromName: 'Stop A', toName: 'Stop B' }),
        leg({ type: 'walk', fromName: 'Stop B', toName: 'Work' }),
      ]),
    )
    expect(url).toContain('origin=Home')
    expect(url).toContain('destination=Work')
    expect(url).toContain('travelmode=transit')
  })

  it('omits waypoints for transit trips — Google Maps does not support the combo', () => {
    // "Waypoints are not available for transit directions." Passing them
    // causes Maps to fail with "could not calculate transit directions."
    // The Detail page's per-leg buttons preserve the transfer fidelity.
    const url = buildTripMapsUrl(
      route([
        leg({ type: 'walk', fromName: 'Home', toName: 'Stop A' }),
        leg({ type: 'transit', fromName: 'Stop A', toName: 'Stop B' }),
        leg({ type: 'walk', fromName: 'Stop B', toName: 'Stop C' }),
        leg({ type: 'transit', fromName: 'Stop C', toName: 'Stop D' }),
        leg({ type: 'walk', fromName: 'Stop D', toName: 'Work' }),
      ]),
    )
    expect(url).not.toContain('waypoints=')
    expect(url).toContain('origin=Home')
    expect(url).toContain('destination=Work')
    expect(url).toContain('travelmode=transit')
  })

  it('includes waypoints for a bike trip with intermediate handoffs', () => {
    // Waypoints DO work for bicycling and walking modes.
    const url = buildTripMapsUrl(
      route([
        leg({ type: 'bike', fromName: 'Home', toName: 'Park' }),
        leg({ type: 'bike', fromName: 'Park', toName: 'Work' }),
      ]),
    )
    expect(url).toContain('waypoints=Park')
    expect(url).toContain('travelmode=bicycling')
  })

  it('falls back to walking mode for a walk-only trip', () => {
    const url = buildTripMapsUrl(
      route([leg({ type: 'walk', fromName: 'A', toName: 'B' })]),
    )
    expect(url).toContain('travelmode=walking')
  })

  it('uses bicycling mode for a trip with bike legs and no transit', () => {
    const url = buildTripMapsUrl(
      route([
        leg({ type: 'bike', fromName: 'Home', toName: 'Stop' }),
        leg({ type: 'walk', fromName: 'Stop', toName: 'Work' }),
      ]),
    )
    expect(url).toContain('travelmode=bicycling')
  })

  it('throws for an empty route', () => {
    expect(() => buildTripMapsUrl(route([]))).toThrow()
  })
})
