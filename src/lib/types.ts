export type LegType = 'bike' | 'transit' | 'walk'
export type SortBy = 'fastest' | 'fewestTransfers' | 'leastBiking'

export interface Leg {
  type: LegType
  fromName: string
  toName: string
  minutes: number
  googleMapsUrl: string
  line?: string
  departAt?: string
  arriveAt?: string
}

export interface Route {
  totalMinutes: number
  savedVsWalking: number
  transferCount: number
  bikingMinutes: number
  legs: Leg[]
}

export interface RoutesRequest {
  origin: string
  destination: string
  sortBy: SortBy
  bikeAtDestination: boolean
}

export interface RoutesResponse {
  routes: Route[]
  baselineWalkTransitMinutes: number
}

export type ApiErrorCode =
  | 'rate_limited'
  | 'upstream_quota'
  | 'no_routes'
  | 'invalid_input'
  | 'server_error'

export interface ApiError {
  error: ApiErrorCode
  message: string
}
