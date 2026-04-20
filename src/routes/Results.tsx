import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { fetchRoutes, RoutesApiError } from '../lib/api'
import type { RoutesResponse, SortBy } from '../lib/types'

const LEG_ICON: Record<string, string> = {
  bike: '🚲',
  transit: '🚌',
  walk: '🚶',
}

export function Results() {
  const [params] = useSearchParams()
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const bikeAtDest = params.get('bikeAtDest') === 'true'
  const sortBy = (params.get('sortBy') ?? 'fastest') as SortBy

  const [data, setData] = useState<RoutesResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchRoutes({ origin: from, destination: to, sortBy, bikeAtDestination: bikeAtDest })
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        const msg = e instanceof RoutesApiError ? e.message : 'Something went wrong'
        setError(msg)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [from, to, sortBy, bikeAtDest])

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-4 px-4 py-6">
      <header className="flex items-center gap-3">
        <Link to="/" className="text-neutral-400 hover:text-neutral-100" aria-label="Back">
          ←
        </Link>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm text-neutral-400">{from}</span>
          <span className="truncate text-sm font-medium">{to}</span>
        </div>
      </header>

      {loading && (
        <div className="flex flex-col gap-3">
          <div className="h-24 animate-pulse rounded-lg bg-neutral-900" />
          <div className="h-24 animate-pulse rounded-lg bg-neutral-900" />
        </div>
      )}

      {error && !loading && (
        <div className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {data && !loading && !error && (
        <>
          <p className="text-xs text-neutral-500">
            Baseline walk+transit: {data.baselineWalkTransitMinutes} min
          </p>
          <ul className="flex flex-col gap-3">
            {data.routes.map((route, idx) => (
              <li
                key={idx}
                className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3"
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-lg font-semibold">{route.totalMinutes} min</span>
                  {route.savedVsWalking > 0 && (
                    <span className="text-xs text-emerald-400">
                      saves {route.savedVsWalking} min
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-300">
                  {route.legs.map((leg, i) => (
                    <span key={i} className="inline-flex items-center gap-1">
                      <span>{LEG_ICON[leg.type]}</span>
                      <span>{leg.line ?? leg.type}</span>
                      <span className="text-neutral-500">{leg.minutes}m</span>
                      {i < route.legs.length - 1 && <span className="text-neutral-600">→</span>}
                    </span>
                  ))}
                </div>
                <div className="mt-2 text-xs text-neutral-500">
                  {route.transferCount} {route.transferCount === 1 ? 'transfer' : 'transfers'}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}
