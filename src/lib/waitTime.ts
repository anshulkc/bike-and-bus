import type { Route } from './types'

// Given a transit itinerary, derive the latest time the traveler can leave
// their origin and still make the first bus — eliminating dead time waiting
// at the stop. Returns null when the concept doesn't apply (pure bike route,
// missing departAt, unparseable departAt).
export function idealLeaveBy(route: Route): Date | null {
  const firstTransitIdx = route.legs.findIndex((l) => l.type === 'transit')
  if (firstTransitIdx === -1) return null

  const first = route.legs[firstTransitIdx]
  if (!first.departAt) return null
  const busDepart = new Date(first.departAt)
  if (Number.isNaN(busDepart.getTime())) return null

  let commuteSec = 0
  for (let i = 0; i < firstTransitIdx; i++) {
    const l = route.legs[i]
    commuteSec += l.seconds ?? l.minutes * 60
  }

  return new Date(busDepart.getTime() - commuteSec * 1000)
}
