import type { Route } from '../lib/types'

type Props = {
  route: Route
  height?: number
  className?: string
}

function waypointFor(route: Route): string | null {
  const transits = route.legs.filter((l) => l.type === 'transit')
  if (transits.length < 2) return null
  // One waypoint per transfer: the arrival stop of each transit leg except the last.
  return transits.slice(0, -1).map((l) => l.toName).join('|')
}

function latLngOrName(
  name: string,
  latLng?: { lat: number; lng: number },
): string {
  if (latLng) return `${latLng.lat},${latLng.lng}`
  return name
}

export function MapTile({ route, height = 240, className }: Props) {
  if (route.legs.length === 0) return null
  const first = route.legs[0]
  const last = route.legs[route.legs.length - 1]

  const origin = latLngOrName(first.fromName, first.fromLatLng)
  const destination = latLngOrName(last.toName, last.toLatLng)

  const mode: 'bicycling' | 'transit' | 'walking' = route.legs.some((l) => l.type === 'transit')
    ? 'transit'
    : route.legs.some((l) => l.type === 'bike')
      ? 'bicycling'
      : 'walking'

  const params = new URLSearchParams({ origin, destination, mode })
  const waypoints = waypointFor(route)
  if (waypoints) params.set('waypoints', waypoints)

  return (
    <iframe
      src={`/api/map?${params.toString()}`}
      title="Route map"
      className={className}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      style={{
        display: 'block',
        width: '100%',
        height,
        border: 0,
        background: 'var(--bb-soft)',
      }}
      allow="accelerometer; gyroscope"
    />
  )
}
