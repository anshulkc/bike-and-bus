// Render an ISO 8601 timestamp in the user's local time zone. Routes come
// back from Google as UTC strings like "2026-04-23T17:01:00Z"; users expect
// to see "1:01 PM" (their wall clock) instead.

export function formatLocalTime(iso: string | undefined | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
