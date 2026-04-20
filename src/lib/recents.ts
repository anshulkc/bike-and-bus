import type { LatLng } from './types'

const KEY = 'bb.recents'
const MAX = 5

export type RecentTrip = {
  origin: string
  destination: string
  originLatLng?: LatLng | null
  destinationLatLng?: LatLng | null
  at: number
}

function isLatLng(v: unknown): v is LatLng {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as LatLng).lat === 'number' &&
    typeof (v as LatLng).lng === 'number'
  )
}

export function loadRecents(): RecentTrip[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RecentTrip[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((t) => t && typeof t.origin === 'string' && typeof t.destination === 'string')
      .map((t) => ({
        ...t,
        originLatLng: isLatLng(t.originLatLng) ? t.originLatLng : null,
        destinationLatLng: isLatLng(t.destinationLatLng) ? t.destinationLatLng : null,
      }))
  } catch {
    return []
  }
}

export function pushRecent(trip: Omit<RecentTrip, 'at'>): void {
  try {
    const next: RecentTrip = { ...trip, at: Date.now() }
    const dedup = loadRecents().filter(
      (t) => !(t.origin === next.origin && t.destination === next.destination),
    )
    const list = [next, ...dedup].slice(0, MAX)
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}
