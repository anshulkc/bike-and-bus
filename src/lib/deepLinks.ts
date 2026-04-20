import type { LegType } from './types'

const TRAVEL_MODE: Record<LegType, string> = {
  bike: 'bicycling',
  transit: 'transit',
  walk: 'walking',
}

export function buildMapsUrl(args: {
  origin: string
  destination: string
  type: LegType
}): string {
  const params = new URLSearchParams({
    api: '1',
    origin: args.origin,
    destination: args.destination,
    travelmode: TRAVEL_MODE[args.type],
  })
  return `https://www.google.com/maps/dir/?${params.toString()}`
}
