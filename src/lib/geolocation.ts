import type { LatLng } from './types'

export type GeoErrorKind = 'denied' | 'unavailable' | 'timeout' | 'other'
export class GeolocationError extends Error {
  constructor(
    public readonly kind: GeoErrorKind,
    message: string,
  ) {
    super(message)
    this.name = 'GeolocationError'
  }
}

export function getCurrentPosition(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new GeolocationError('unavailable', 'Geolocation not supported on this device'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        const kind: GeoErrorKind =
          err.code === 1 ? 'denied' : err.code === 2 ? 'unavailable' : err.code === 3 ? 'timeout' : 'other'
        reject(new GeolocationError(kind, err.message || 'Unable to get location'))
      },
      { timeout: 10_000, maximumAge: 60_000, enableHighAccuracy: false },
    )
  })
}
