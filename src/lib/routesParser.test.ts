import { describe, expect, it } from 'vitest'
import type { GoogleRoutesResponse } from './googleTypes'
import { parseRoutesResponse } from './routesParser'

describe('parseRoutesResponse', () => {
  it('collapses a bike route into a single bike leg using the route total', () => {
    const res: GoogleRoutesResponse = {
      routes: [
        {
          duration: '1080s', // 18 min
          distanceMeters: 4200,
          legs: [
            {
              startLocation: { latLng: { latitude: 34.07, longitude: -118.44 } },
              endLocation: { latLng: { latitude: 34.09, longitude: -118.41 } },
              steps: [
                { travelMode: 'BICYCLE', staticDuration: '300s', distanceMeters: 1200 },
                { travelMode: 'BICYCLE', staticDuration: '780s', distanceMeters: 3000 },
              ],
            },
          ],
        },
      ],
    }

    const [r] = parseRoutesResponse(res, 'Home', '527 Midvale Ave')
    expect(r.legs.map((l) => l.type)).toEqual(['bike'])
    const [bike] = r.legs
    expect(bike.minutes).toBe(18)
    expect(bike.seconds).toBe(1080)
    expect(bike.meters).toBe(4200)
    expect(bike.fromName).toBe('Home')
    expect(bike.toName).toBe('527 Midvale Ave')
    expect(bike.fromLatLng).toEqual({ lat: 34.07, lng: -118.44 })
    expect(bike.toLatLng).toEqual({ lat: 34.09, lng: -118.41 })
    expect(bike.googleMapsUrl).toContain('travelmode=bicycling')
    expect(r.totalMinutes).toBe(18)
    expect(r.bikingMinutes).toBe(18)
    expect(r.transferCount).toBe(0)
  })

  it('absorbs WALK sub-steps (crosswalks, dismount zones) into the single bike leg', () => {
    // Google's bike responses sometimes interleave short WALK steps for things
    // like pedestrian crossings or stairs. The overall route duration already
    // includes them, so they must not show up as separate walk legs.
    const res: GoogleRoutesResponse = {
      routes: [
        {
          duration: '900s', // 15 min total — includes the 60s walk below
          distanceMeters: 3500,
          legs: [
            {
              steps: [
                { travelMode: 'BICYCLE', staticDuration: '420s', distanceMeters: 1600 },
                { travelMode: 'WALK', staticDuration: '60s', distanceMeters: 80 },
                { travelMode: 'BICYCLE', staticDuration: '420s', distanceMeters: 1820 },
              ],
            },
          ],
        },
      ],
    }
    const [r] = parseRoutesResponse(res, 'A', 'B')
    expect(r.legs.map((l) => l.type)).toEqual(['bike'])
    expect(r.legs[0].minutes).toBe(15)
    expect(r.legs[0].meters).toBe(3500)
  })

  it('falls back to step endpoints when the leg itself has no start/end location', () => {
    const res: GoogleRoutesResponse = {
      routes: [
        {
          duration: '600s',
          distanceMeters: 2000,
          legs: [
            {
              steps: [
                {
                  travelMode: 'BICYCLE',
                  staticDuration: '600s',
                  startLocation: { latLng: { latitude: 42.26, longitude: -71.8 } },
                  endLocation: { latLng: { latitude: 42.27, longitude: -71.79 } },
                },
              ],
            },
          ],
        },
      ],
    }
    const [r] = parseRoutesResponse(res, 'O', 'D')
    expect(r.legs[0].fromLatLng).toEqual({ lat: 42.26, lng: -71.8 })
    expect(r.legs[0].toLatLng).toEqual({ lat: 42.27, lng: -71.79 })
  })

  it('skips routes with no duration', () => {
    const res: GoogleRoutesResponse = { routes: [{ legs: [] }] }
    expect(parseRoutesResponse(res, 'O', 'D')).toEqual([])
  })

  it('returns empty array when Google returns no routes', () => {
    expect(parseRoutesResponse({ routes: [] }, 'O', 'D')).toEqual([])
    expect(parseRoutesResponse({}, 'O', 'D')).toEqual([])
  })
})
