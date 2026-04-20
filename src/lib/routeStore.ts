// In-memory cache so /results/:idx can show a route the user just looked at,
// without re-fetching on a deep link. Keyed by trip signature so navigating
// back/forward isn't surprising.
import type { LatLng, RoutesResponse, SortBy } from './types'

export type StoredTrip = {
  origin: string
  destination: string
  originLatLng?: LatLng | null
  destinationLatLng?: LatLng | null
  sortBy: SortBy
  data: RoutesResponse
  fetchedAt: number
}

let current: StoredTrip | null = null

export function tripKey(origin: string, destination: string, sortBy: SortBy): string {
  return `${origin}::${destination}::${sortBy}`
}

export function setStoredTrip(trip: StoredTrip): void {
  current = trip
}

export function getStoredTrip(key: string): StoredTrip | null {
  if (!current) return null
  if (tripKey(current.origin, current.destination, current.sortBy) !== key) {
    return null
  }
  return current
}

export function getCurrentTrip(): StoredTrip | null {
  return current
}
