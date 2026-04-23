import { describe, expect, it } from 'vitest'
import type { GoogleRoutesResponse } from './googleTypes'
import { parseRoutesResponse } from './routesParser'

describe('parseRoutesResponse — bike mode', () => {
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

    const [r] = parseRoutesResponse(res, 'Home', '527 Midvale Ave', 'BICYCLE')
    expect(r.legs.map((l) => l.type)).toEqual(['bike'])
    const [bike] = r.legs
    expect(bike.minutes).toBe(18)
    expect(bike.seconds).toBe(1080)
    expect(bike.meters).toBe(4200)
    expect(bike.fromName).toBe('Home')
    expect(bike.toName).toBe('527 Midvale Ave')
    expect(bike.fromLatLng).toEqual({ lat: 34.07, lng: -118.44 })
    expect(bike.toLatLng).toEqual({ lat: 34.09, lng: -118.41 })
    expect(r.totalMinutes).toBe(18)
    expect(r.bikingMinutes).toBe(18)
    expect(r.transferCount).toBe(0)
  })

  it('absorbs WALK sub-steps inside a bike response into the single bike leg', () => {
    const res: GoogleRoutesResponse = {
      routes: [
        {
          duration: '900s',
          distanceMeters: 3500,
          legs: [
            {
              steps: [
                { travelMode: 'BICYCLE', staticDuration: '420s' },
                { travelMode: 'WALK', staticDuration: '60s' },
                { travelMode: 'BICYCLE', staticDuration: '420s' },
              ],
            },
          ],
        },
      ],
    }
    const [r] = parseRoutesResponse(res, 'A', 'B', 'BICYCLE')
    expect(r.legs.map((l) => l.type)).toEqual(['bike'])
    expect(r.legs[0].minutes).toBe(15)
  })
})

describe('parseRoutesResponse — transit mode', () => {
  const walkTransitWalk: GoogleRoutesResponse = {
    routes: [
      {
        duration: '1740s', // 29 min
        legs: [
          {
            steps: [
              {
                travelMode: 'WALK',
                staticDuration: '480s',
                distanceMeters: 620,
                startLocation: { latLng: { latitude: 34.0689, longitude: -118.4452 } },
                endLocation: { latLng: { latitude: 34.0617, longitude: -118.3076 } },
              },
              {
                travelMode: 'TRANSIT',
                staticDuration: '840s',
                transitDetails: {
                  stopDetails: {
                    departureStop: {
                      name: 'Wilshire/Western Station',
                      location: { latLng: { latitude: 34.0617, longitude: -118.3076 } },
                    },
                    arrivalStop: {
                      name: 'Pershing Square',
                      location: { latLng: { latitude: 34.0479, longitude: -118.2584 } },
                    },
                    departureTime: '2026-04-22T15:42:00Z',
                    arrivalTime: '2026-04-22T15:56:00Z',
                  },
                  transitLine: { name: 'Metro B Line (Red)', nameShort: 'Red Line' },
                },
              },
              {
                travelMode: 'WALK',
                staticDuration: '180s',
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

  it('parses walk → transit → walk into three legs', () => {
    const [r] = parseRoutesResponse(walkTransitWalk, 'Home', 'Work', 'TRANSIT')
    expect(r.legs.map((l) => l.type)).toEqual(['walk', 'transit', 'walk'])
  })

  it('uses the next transit stop name as the first walk leg destination', () => {
    const [r] = parseRoutesResponse(walkTransitWalk, 'Home', 'Work', 'TRANSIT')
    expect(r.legs[0].fromName).toBe('Home')
    expect(r.legs[0].toName).toBe('Wilshire/Western Station')
  })

  it('uses the transit line short name and carries depart/arrive times', () => {
    const [r] = parseRoutesResponse(walkTransitWalk, 'Home', 'Work', 'TRANSIT')
    const transit = r.legs.find((l) => l.type === 'transit')!
    expect(transit.line).toBe('Red Line')
    expect(transit.departAt).toBe('2026-04-22T15:42:00Z')
    expect(transit.arriveAt).toBe('2026-04-22T15:56:00Z')
  })

  it('collapses consecutive WALK turn-by-turn sub-steps into a single walk leg', () => {
    // The original bug: Google returned multiple 1-min WALK steps for
    // turn-by-turn instructions; each became its own walk leg in the UI.
    const turnByTurn: GoogleRoutesResponse = {
      routes: [
        {
          duration: '1200s',
          legs: [
            {
              steps: [
                { travelMode: 'WALK', staticDuration: '60s', distanceMeters: 80 },
                { travelMode: 'WALK', staticDuration: '540s', distanceMeters: 700 },
                { travelMode: 'WALK', staticDuration: '60s', distanceMeters: 90 },
                {
                  travelMode: 'TRANSIT',
                  staticDuration: '540s',
                  transitDetails: {
                    stopDetails: {
                      departureStop: { name: 'Stop A' },
                      arrivalStop: { name: 'Stop B' },
                    },
                    transitLine: { nameShort: '8' },
                  },
                },
              ],
            },
          ],
        },
      ],
    }
    const [r] = parseRoutesResponse(turnByTurn, 'Origin', 'Dest', 'TRANSIT')
    expect(r.legs.map((l) => l.type)).toEqual(['walk', 'transit'])
    expect(r.legs[0].seconds).toBe(660) // 60 + 540 + 60
    expect(r.legs[0].meters).toBe(870) // 80 + 700 + 90
  })

  it('counts transfers as (transit steps − 1)', () => {
    const two: GoogleRoutesResponse = {
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
                    stopDetails: { departureStop: { name: 'A' }, arrivalStop: { name: 'B' } },
                    transitLine: { nameShort: '8' },
                  },
                },
                { travelMode: 'WALK', staticDuration: '120s' },
                {
                  travelMode: 'TRANSIT',
                  staticDuration: '900s',
                  transitDetails: {
                    stopDetails: { departureStop: { name: 'B' }, arrivalStop: { name: 'C' } },
                    transitLine: { nameShort: '4' },
                  },
                },
                { travelMode: 'WALK', staticDuration: '180s' },
              ],
            },
          ],
        },
      ],
    }
    const [r] = parseRoutesResponse(two, 'O', 'D', 'TRANSIT')
    expect(r.transferCount).toBe(1)
    // middle walk should be the transfer between stops
    expect(r.legs[2].type).toBe('walk')
    expect(r.legs[2].fromName).toBe('B')
    expect(r.legs[2].toName).toBe('B')
  })

  it('returns empty array when Google returns no routes', () => {
    expect(parseRoutesResponse({ routes: [] }, 'O', 'D', 'TRANSIT')).toEqual([])
    expect(parseRoutesResponse({}, 'O', 'D', 'BICYCLE')).toEqual([])
  })
})
