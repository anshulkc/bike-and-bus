import type { GoogleRoutesResponse } from './googleTypes'

const ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes'

const FIELD_MASK = [
  'routes.duration',
  'routes.distanceMeters',
  'routes.legs.startLocation',
  'routes.legs.endLocation',
  'routes.legs.steps.travelMode',
  'routes.legs.steps.staticDuration',
  'routes.legs.steps.distanceMeters',
  'routes.legs.steps.startLocation',
  'routes.legs.steps.endLocation',
  'routes.legs.steps.transitDetails.stopDetails.departureStop.name',
  'routes.legs.steps.transitDetails.stopDetails.departureStop.location.latLng',
  'routes.legs.steps.transitDetails.stopDetails.arrivalStop.name',
  'routes.legs.steps.transitDetails.stopDetails.arrivalStop.location.latLng',
  'routes.legs.steps.transitDetails.stopDetails.departureTime',
  'routes.legs.steps.transitDetails.stopDetails.arrivalTime',
  'routes.legs.steps.transitDetails.transitLine.name',
  'routes.legs.steps.transitDetails.transitLine.nameShort',
  'routes.legs.steps.transitDetails.transitLine.vehicle.type',
].join(',')

export interface ComputeRoutesArgs {
  origin: string
  destination: string
  travelMode: 'TRANSIT' | 'BICYCLE' | 'WALK'
  computeAlternativeRoutes?: boolean
  departureTime?: string // ISO-8601, optional
  apiKey: string
  fetchImpl?: typeof fetch
}

export class RoutesApiFetchError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`Routes API returned ${status}: ${body.slice(0, 400)}`)
    this.name = 'RoutesApiFetchError'
  }
}

export async function computeRoutes(args: ComputeRoutesArgs): Promise<GoogleRoutesResponse> {
  const body = {
    origin: { address: args.origin },
    destination: { address: args.destination },
    travelMode: args.travelMode,
    computeAlternativeRoutes: args.computeAlternativeRoutes ?? false,
    ...(args.departureTime ? { departureTime: args.departureTime } : {}),
  }

  const fetcher = args.fetchImpl ?? fetch
  const res = await fetcher(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': args.apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new RoutesApiFetchError(res.status, text)
  }

  return (await res.json()) as GoogleRoutesResponse
}
