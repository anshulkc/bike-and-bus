import { describe, expect, it } from 'vitest'
import { buildMapsUrl } from './deepLinks'

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
