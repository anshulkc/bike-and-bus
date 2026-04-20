// Subset of Google Routes API v2 response shape that we use.
// Only fields we request via X-Goog-FieldMask are included.

export interface GoogleLatLng {
  latitude: number
  longitude: number
}

export interface GoogleLocation {
  latLng?: GoogleLatLng
}

export interface GoogleTransitStop {
  name?: string
  location?: GoogleLocation
}

export interface GoogleTransitStopDetails {
  departureStop?: GoogleTransitStop
  arrivalStop?: GoogleTransitStop
  departureTime?: string // RFC 3339
  arrivalTime?: string
}

export interface GoogleTransitLine {
  name?: string
  nameShort?: string
  vehicle?: { type?: string }
}

export interface GoogleTransitDetails {
  stopDetails?: GoogleTransitStopDetails
  transitLine?: GoogleTransitLine
}

export type GoogleTravelMode =
  | 'TRAVEL_MODE_UNSPECIFIED'
  | 'DRIVE'
  | 'BICYCLE'
  | 'WALK'
  | 'TWO_WHEELER'
  | 'TRANSIT'

export interface GoogleRouteStep {
  travelMode?: GoogleTravelMode
  staticDuration?: string // e.g. "540s"
  distanceMeters?: number
  startLocation?: GoogleLocation
  endLocation?: GoogleLocation
  transitDetails?: GoogleTransitDetails
}

export interface GoogleRouteLeg {
  startLocation?: GoogleLocation
  endLocation?: GoogleLocation
  steps?: GoogleRouteStep[]
}

export interface GoogleRoute {
  duration?: string
  distanceMeters?: number
  legs?: GoogleRouteLeg[]
}

export interface GoogleRoutesResponse {
  routes?: GoogleRoute[]
}
