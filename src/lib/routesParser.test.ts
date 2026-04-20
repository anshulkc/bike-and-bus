import { describe, expect, it } from 'vitest'
import type { GoogleRoutesResponse } from './googleTypes'
import { parseRoutesResponse } from './routesParser'

// Minimal but realistic response fixture: one route with walk → transit → walk
const singleTransitWithWalks: GoogleRoutesResponse = {
  routes: [
    {
      duration: '1740s', // 29 min
      distanceMeters: 9200,
      legs: [
        {
          steps: [
            {
              travelMode: 'WALK',
              staticDuration: '480s', // 8 min
              distanceMeters: 620,
              startLocation: { latLng: { latitude: 34.0689, longitude: -118.4452 } },
              endLocation: { latLng: { latitude: 34.0617, longitude: -118.3076 } },
            },
            {
              travelMode: 'TRANSIT',
              staticDuration: '840s', // 14 min
              distanceMeters: 8400,
              startLocation: { latLng: { latitude: 34.0617, longitude: -118.3076 } },
              endLocation: { latLng: { latitude: 34.0479, longitude: -118.2584 } },
              transitDetails: {
                stopDetails: {
                  departureStop: {
                    name: 'Wilshire/Western Station',
                    location: { latLng: { latitude: 34.0617, longitude: -118.3076 } },
                  },
                  arrivalStop: {
                    name: 'Pershing Square Station',
                    location: { latLng: { latitude: 34.0479, longitude: -118.2584 } },
                  },
                  departureTime: '2026-04-20T15:42:00Z',
                  arrivalTime: '2026-04-20T15:56:00Z',
                },
                transitLine: { name: 'Metro B Line (Red)', nameShort: 'Red Line' },
              },
            },
            {
              travelMode: 'WALK',
              staticDuration: '180s', // 3 min
              distanceMeters: 240,
              startLocation: { latLng: { latitude: 34.0479, longitude: -118.2584 } },
              endLocation: { latLng: { latitude: 34.0497, longitude: -118.2535 } },
            },
          ],
        },
      ],
    },
  ],
}

describe('parseRoutesResponse', () => {
  it('parses a single route with walk → transit → walk into three legs', () => {
    const routes = parseRoutesResponse(singleTransitWithWalks, 'My House', 'Pershing Square')
    expect(routes).toHaveLength(1)
    const [r] = routes
    expect(r.legs.map((l) => l.type)).toEqual(['walk', 'transit', 'walk'])
  })

  it('converts durations from seconds to rounded minutes', () => {
    const [r] = parseRoutesResponse(singleTransitWithWalks, 'My House', 'Pershing Square')
    expect(r.totalMinutes).toBe(29)
    expect(r.legs[0].minutes).toBe(8) // 480s → 8
    expect(r.legs[1].minutes).toBe(14) // 840s → 14
    expect(r.legs[2].minutes).toBe(3) // 180s → 3
  })

  it('prefers transitLine.nameShort over transitLine.name for the line label', () => {
    const [r] = parseRoutesResponse(singleTransitWithWalks, 'My House', 'Pershing Square')
    const transitLeg = r.legs.find((l) => l.type === 'transit')!
    expect(transitLeg.line).toBe('Red Line')
  })

  it('carries RFC 3339 departureTime and arrivalTime through to the transit leg', () => {
    const [r] = parseRoutesResponse(singleTransitWithWalks, 'My House', 'Pershing Square')
    const transitLeg = r.legs.find((l) => l.type === 'transit')!
    expect(transitLeg.departAt).toBe('2026-04-20T15:42:00Z')
    expect(transitLeg.arriveAt).toBe('2026-04-20T15:56:00Z')
  })

  it('uses the stop name (not lat/lng) as the transit leg deep-link origin', () => {
    const [r] = parseRoutesResponse(singleTransitWithWalks, 'My House', 'Pershing Square')
    const transitLeg = r.legs.find((l) => l.type === 'transit')!
    // Named place → Google Maps shows "Wilshire/Western Station" rather than a pin
    expect(transitLeg.fromName).toBe('Wilshire/Western Station')
    expect(transitLeg.googleMapsUrl).toContain('origin=Wilshire%2FWestern+Station')
    expect(transitLeg.googleMapsUrl).toContain('travelmode=transit')
  })

  it('uses the *next* transit stop name as the destination of the preceding walk leg', () => {
    const [r] = parseRoutesResponse(singleTransitWithWalks, 'My House', 'Pershing Square')
    const firstWalk = r.legs[0]
    expect(firstWalk.type).toBe('walk')
    expect(firstWalk.fromName).toBe('My House')
    expect(firstWalk.toName).toBe('Wilshire/Western Station')
    expect(firstWalk.googleMapsUrl).toContain('origin=My+House')
    expect(firstWalk.googleMapsUrl).toContain('destination=Wilshire%2FWestern+Station')
  })

  it('uses the *previous* transit arrival stop as the origin of the trailing walk leg', () => {
    const [r] = parseRoutesResponse(singleTransitWithWalks, 'My House', 'Pershing Square')
    const lastWalk = r.legs[r.legs.length - 1]
    expect(lastWalk.type).toBe('walk')
    expect(lastWalk.fromName).toBe('Pershing Square Station')
    expect(lastWalk.toName).toBe('Pershing Square')
  })

  it('counts transfers as (transit steps − 1)', () => {
    const [r] = parseRoutesResponse(singleTransitWithWalks, 'My House', 'Pershing Square')
    expect(r.transferCount).toBe(0)
  })

  it('counts 1 transfer when the route has two transit steps', () => {
    const twoTransit: GoogleRoutesResponse = {
      routes: [
        {
          duration: '2400s',
          legs: [
            {
              steps: [
                { travelMode: 'WALK', staticDuration: '300s' },
                {
                  travelMode: 'TRANSIT',
                  staticDuration: '600s',
                  transitDetails: {
                    stopDetails: {
                      departureStop: { name: 'A' },
                      arrivalStop: { name: 'B' },
                    },
                    transitLine: { nameShort: 'Red' },
                  },
                },
                { travelMode: 'WALK', staticDuration: '120s' },
                {
                  travelMode: 'TRANSIT',
                  staticDuration: '900s',
                  transitDetails: {
                    stopDetails: {
                      departureStop: { name: 'B' },
                      arrivalStop: { name: 'C' },
                    },
                    transitLine: { nameShort: '720' },
                  },
                },
                { travelMode: 'WALK', staticDuration: '180s' },
              ],
            },
          ],
        },
      ],
    }
    const [r] = parseRoutesResponse(twoTransit, 'Origin', 'Dest')
    expect(r.transferCount).toBe(1)
    // Middle walk: from arrivalStop of prior transit → departureStop of next transit
    const middleWalk = r.legs[2]
    expect(middleWalk.type).toBe('walk')
    expect(middleWalk.fromName).toBe('B')
    expect(middleWalk.toName).toBe('B')
  })

  it('falls back to lat/lng when a transit stop is missing a name', () => {
    const missingName: GoogleRoutesResponse = {
      routes: [
        {
          duration: '600s',
          legs: [
            {
              steps: [
                {
                  travelMode: 'TRANSIT',
                  staticDuration: '600s',
                  transitDetails: {
                    stopDetails: {
                      departureStop: {
                        name: '',
                        location: { latLng: { latitude: 34.1, longitude: -118.3 } },
                      },
                      arrivalStop: { name: 'End Stop' },
                    },
                    transitLine: { nameShort: '720' },
                  },
                },
              ],
            },
          ],
        },
      ],
    }
    const [r] = parseRoutesResponse(missingName, 'O', 'D')
    expect(r.legs[0].fromName).toBe('34.1,-118.3')
  })

  it('merges consecutive WALK sub-steps into a single walk leg', () => {
    // Google Routes API v2 returns turn-by-turn walk instructions as multiple
    // consecutive WALK steps within one walking segment. They must collapse
    // into one leg with summed duration and distance, otherwise the Detail
    // view shows a redundant cluster of walks to the same stop.
    const turnByTurnWalk: GoogleRoutesResponse = {
      routes: [
        {
          duration: '2100s',
          legs: [
            {
              steps: [
                {
                  travelMode: 'WALK',
                  staticDuration: '60s',
                  distanceMeters: 80,
                  startLocation: { latLng: { latitude: 34.07, longitude: -118.44 } },
                  endLocation: { latLng: { latitude: 34.071, longitude: -118.441 } },
                },
                {
                  travelMode: 'WALK',
                  staticDuration: '540s',
                  distanceMeters: 700,
                  startLocation: { latLng: { latitude: 34.071, longitude: -118.441 } },
                  endLocation: { latLng: { latitude: 34.08, longitude: -118.45 } },
                },
                {
                  travelMode: 'WALK',
                  staticDuration: '60s',
                  distanceMeters: 90,
                  startLocation: { latLng: { latitude: 34.08, longitude: -118.45 } },
                  endLocation: { latLng: { latitude: 34.081, longitude: -118.451 } },
                },
                {
                  travelMode: 'TRANSIT',
                  staticDuration: '720s',
                  distanceMeters: 4000,
                  transitDetails: {
                    stopDetails: {
                      departureStop: {
                        name: 'Pico Blvd & Westwood Blvd',
                        location: { latLng: { latitude: 34.081, longitude: -118.451 } },
                      },
                      arrivalStop: { name: 'Downtown' },
                      departureTime: '2026-04-20T00:00:00Z',
                      arrivalTime: '2026-04-20T00:12:00Z',
                    },
                    transitLine: { nameShort: '30' },
                  },
                },
              ],
            },
          ],
        },
      ],
    }
    const [r] = parseRoutesResponse(turnByTurnWalk, 'Current location', 'Downtown')
    expect(r.legs.map((l) => l.type)).toEqual(['walk', 'transit'])
    const walk = r.legs[0]
    expect(walk.type).toBe('walk')
    expect(walk.seconds).toBe(660) // 60 + 540 + 60
    expect(walk.minutes).toBe(11)
    expect(walk.meters).toBe(870) // 80 + 700 + 90
    expect(walk.fromName).toBe('Current location')
    expect(walk.toName).toBe('Pico Blvd & Westwood Blvd')
    // Preserves first-step start and last-step end coordinates
    expect(walk.fromLatLng).toEqual({ lat: 34.07, lng: -118.44 })
    expect(walk.toLatLng).toEqual({ lat: 34.081, lng: -118.451 })
  })

  it('parses a BICYCLE step into a single bike leg', () => {
    const bikeOnly: GoogleRoutesResponse = {
      routes: [
        {
          duration: '1080s', // 18 min
          distanceMeters: 4200,
          legs: [
            {
              steps: [
                {
                  travelMode: 'BICYCLE',
                  staticDuration: '300s',
                  distanceMeters: 1200,
                  startLocation: { latLng: { latitude: 34.07, longitude: -118.44 } },
                  endLocation: { latLng: { latitude: 34.075, longitude: -118.43 } },
                },
                {
                  travelMode: 'BICYCLE',
                  staticDuration: '780s',
                  distanceMeters: 3000,
                  startLocation: { latLng: { latitude: 34.075, longitude: -118.43 } },
                  endLocation: { latLng: { latitude: 34.09, longitude: -118.41 } },
                },
              ],
            },
          ],
        },
      ],
    }
    const [r] = parseRoutesResponse(bikeOnly, 'Home', '527 Midvale Ave')
    expect(r.legs.map((l) => l.type)).toEqual(['bike'])
    const bike = r.legs[0]
    expect(bike.minutes).toBe(18)
    expect(bike.seconds).toBe(1080)
    expect(bike.meters).toBe(4200)
    expect(bike.fromName).toBe('Home')
    expect(bike.toName).toBe('527 Midvale Ave')
    expect(bike.googleMapsUrl).toContain('travelmode=bicycling')
    expect(r.bikingMinutes).toBe(18)
    expect(r.transferCount).toBe(0)
  })

  it('drops steps with unexpected travel modes but keeps the route', () => {
    const withDrive: GoogleRoutesResponse = {
      routes: [
        {
          duration: '600s',
          legs: [
            {
              steps: [
                { travelMode: 'DRIVE', staticDuration: '300s' },
                { travelMode: 'WALK', staticDuration: '300s' },
              ],
            },
          ],
        },
      ],
    }
    const [r] = parseRoutesResponse(withDrive, 'O', 'D')
    expect(r.legs.map((l) => l.type)).toEqual(['walk'])
  })

  it('returns empty array when Google returns no routes', () => {
    expect(parseRoutesResponse({ routes: [] }, 'O', 'D')).toEqual([])
    expect(parseRoutesResponse({}, 'O', 'D')).toEqual([])
  })
})
