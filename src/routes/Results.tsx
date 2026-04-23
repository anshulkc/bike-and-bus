import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { fetchRoutes, RoutesApiError } from '../lib/api'
import type { ApiErrorCode, LatLng, RoutesResponse, SortBy } from '../lib/types'
import { useCardLayout, useMaxBikeMiles } from '../lib/prefs'
import { setStoredTrip, tripKey } from '../lib/routeStore'
import {
  ChevIcon,
  ErrorIcon,
  RefreshIcon,
  SearchIcon,
  WarnIcon,
} from '../components/Icon'
import { RouteCardCompact, RouteCardDetailed } from '../components/RouteCard'

const SORTS: Array<{ key: SortBy; label: string }> = [
  { key: 'fastest', label: 'Fastest' },
  { key: 'fewestTransfers', label: 'Fewest transfers' },
  { key: 'leastBiking', label: 'Least biking' },
]

type ErrorState = {
  code: ApiErrorCode
  message: string
}

export function Results() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [layout] = useCardLayout()
  const [maxBikeMiles] = useMaxBikeMiles()

  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const sortBy = (params.get('sortBy') ?? 'fastest') as SortBy
  const departureTime = params.get('depart') ?? undefined

  const fromLatParam = params.get('fromLat')
  const fromLngParam = params.get('fromLng')
  const toLatParam = params.get('toLat')
  const toLngParam = params.get('toLng')
  const fromLatLng = useMemo(
    () => parseLatLng(fromLatParam, fromLngParam),
    [fromLatParam, fromLngParam],
  )
  const toLatLng = useMemo(
    () => parseLatLng(toLatParam, toLngParam),
    [toLatParam, toLngParam],
  )

  const [data, setData] = useState<RoutesResponse | null>(null)
  const [error, setError] = useState<ErrorState | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<number>(() => Date.now())
  const [refreshing, setRefreshing] = useState(false)
  const [_tick, setTick] = useState(0)

  // Re-render every 10s so "updated Ns ago" stays fresh.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10_000)
    return () => clearInterval(id)
  }, [])

  const load = useCallback(
    async (isRefresh: boolean) => {
      if (isRefresh) setRefreshing(true)
      else setLoading(true)
      setError(null)
      try {
        const res = await fetchRoutes({
          origin: from,
          destination: to,
          originLatLng: fromLatLng ?? undefined,
          destinationLatLng: toLatLng ?? undefined,
          sortBy,
          maxBikeMiles,
          departureTime,
        })
        setData(res)
        setStoredTrip({
          origin: from,
          destination: to,
          originLatLng: fromLatLng,
          destinationLatLng: toLatLng,
          sortBy,
          data: res,
          fetchedAt: Date.now(),
        })
        setLastUpdated(Date.now())
      } catch (e: unknown) {
        if (e instanceof RoutesApiError) {
          setError({ code: e.code, message: e.message })
        } else {
          setError({ code: 'server_error', message: 'Something went wrong' })
        }
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [from, to, fromLatLng, toLatLng, sortBy, maxBikeMiles, departureTime],
  )

  useEffect(() => {
    void load(false)
  }, [load])

  function setSort(s: SortBy) {
    if (s === sortBy) return
    const next = new URLSearchParams(params)
    next.set('sortBy', s)
    setParams(next, { replace: true })
  }

  const ago = useMemo(() => {
    const s = Math.max(1, Math.round((Date.now() - lastUpdated) / 1000))
    if (s < 60) return `${s}s ago`
    return `${Math.floor(s / 60)}m ago`
  }, [lastUpdated, _tick])

  const isFastestSort = sortBy === 'fastest'

  return (
    <main
      style={{
        minHeight: '100%',
        background: 'var(--bb-bg)',
        color: 'var(--bb-fg)',
      }}
    >
      <div style={{ maxWidth: 460, margin: '0 auto', padding: '12px 0 28px' }}>
        {/* top bar */}
        <div
          style={{
            padding: '0 20px 8px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Link
            to="/"
            aria-label="Back"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              border: '1px solid var(--bb-line)',
              background: 'var(--bb-surface)',
              color: 'var(--bb-fg)',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            <ChevIcon size={14} color="var(--bb-fg)" dir="left" />
          </Link>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 11,
                color: 'var(--bb-mut)',
                letterSpacing: 0.3,
                textTransform: 'uppercase',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {from || 'Origin'} → {to || 'Destination'}
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 500,
                letterSpacing: -0.2,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              Mixed route
              {data && (
                <>
                  <span style={{ color: 'var(--bb-mut)' }}>·</span>
                  <span style={{ color: 'var(--bb-mut)', fontSize: 12 }}>
                    {data.routes.length} option{data.routes.length === 1 ? '' : 's'}
                  </span>
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => load(true)}
            disabled={loading || refreshing}
            aria-label="Refresh routes"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              border: '1px solid var(--bb-line)',
              background: 'var(--bb-surface)',
              color: 'var(--bb-fg)',
              display: 'grid',
              placeItems: 'center',
              cursor: loading || refreshing ? 'wait' : 'pointer',
              padding: 0,
              flexShrink: 0,
            }}
          >
            <RefreshIcon
              size={16}
              color="var(--bb-fg)"
              style={{
                animation: refreshing ? 'bb-spin 0.9s linear infinite' : undefined,
                transformOrigin: '50% 50%',
              }}
            />
          </button>
        </div>

        {/* sort pills */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            padding: '8px 20px 0',
            overflowX: 'auto',
            scrollbarWidth: 'none',
          }}
        >
          {SORTS.map((s) => {
            const sel = s.key === sortBy
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setSort(s.key)}
                style={{
                  padding: '7px 12px',
                  borderRadius: 999,
                  whiteSpace: 'nowrap',
                  background: sel ? 'var(--bb-fg)' : 'var(--bb-surface)',
                  color: sel ? 'var(--bb-bg)' : 'var(--bb-fg)',
                  border: `1px solid ${sel ? 'var(--bb-fg)' : 'var(--bb-line)'}`,
                  fontSize: 12,
                  fontWeight: 500,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                {s.label}
              </button>
            )
          })}
        </div>

        {/* baseline strip */}
        {data && !loading && !error && (
          <div
            style={{
              margin: '12px 20px 4px',
              padding: '10px 12px',
              background: 'var(--bb-soft)',
              borderRadius: 10,
              fontSize: 12,
              color: 'var(--bb-mut)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: 'var(--bb-success)',
              }}
            />
            Baseline (walk + bus):{' '}
            <b style={{ color: 'var(--bb-fg)', fontWeight: 600 }}>
              {data.baselineWalkTransitMinutes} min
            </b>
            <span style={{ marginLeft: 'auto' }}>{refreshing ? 'refreshing…' : `updated ${ago}`}</span>
          </div>
        )}

        {/* body */}
        <div style={{ padding: '12px 20px 0' }}>
          {loading && <LoadingSkeleton />}

          {error && !loading && (
            <ErrorPanel
              error={error}
              onRetry={() => load(false)}
              onBack={() => navigate('/')}
            />
          )}

          {data && !loading && !error && data.routes.length === 0 && (
            <ErrorPanel
              error={{ code: 'no_routes', message: 'No transit routes found' }}
              onBack={() => navigate('/')}
            />
          )}

          {data && !loading && !error && data.routes.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {data.routes.map((route, idx) => {
                const isFastest = isFastestSort && idx === 0
                const open = () => {
                  const k = tripKey(from, to, sortBy)
                  const p = new URLSearchParams({ trip: k })
                  if (fromLatLng) {
                    p.set('fromLat', String(fromLatLng.lat))
                    p.set('fromLng', String(fromLatLng.lng))
                  }
                  if (toLatLng) {
                    p.set('toLat', String(toLatLng.lat))
                    p.set('toLng', String(toLatLng.lng))
                  }
                  if (departureTime) p.set('depart', departureTime)
                  navigate(`/results/${idx}?${p.toString()}`)
                }
                return (
                  <li key={idx}>
                    {layout === 'detailed' ? (
                      <RouteCardDetailed route={route} index={idx} onOpen={open} isFastest={isFastest} />
                    ) : (
                      <RouteCardCompact route={route} index={idx} onOpen={open} isFastest={isFastest} />
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </main>
  )
}

function parseLatLng(
  lat: string | null | undefined,
  lng: string | null | undefined,
): LatLng | null {
  if (!lat || !lng) return null
  const la = Number(lat)
  const ln = Number(lng)
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null
  if (la < -90 || la > 90 || ln < -180 || ln > 180) return null
  return { lat: la, lng: ln }
}

function LoadingSkeleton() {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--bb-mut)',
          letterSpacing: 0.3,
          marginBottom: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span
          style={{
            width: 12,
            height: 12,
            borderRadius: 999,
            border: '1.5px solid var(--bb-mut)',
            borderTopColor: 'transparent',
            animation: 'bb-spin 0.8s linear infinite',
            display: 'inline-block',
          }}
        />
        Finding mixed routes…
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              background: 'var(--bb-surface)',
              borderRadius: 20,
              border: '1px solid var(--bb-line)',
              padding: 18,
            }}
          >
            <SkBar w={60} h={8} />
            <SkBar w={120} h={28} mt={8} />
            <SkBar w="80%" mt={10} />
            <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
              {[0, 1, 2].map((j) => (
                <div key={j} className="bb-shimmer" style={{ width: 44, height: 44, borderRadius: 10 }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SkBar({ w, h = 10, mt = 0 }: { w: number | string; h?: number; mt?: number }) {
  return <div className="bb-shimmer" style={{ width: w, height: h, borderRadius: 4, marginTop: mt }} />
}

type Severity = 'neutral' | 'warn' | 'error'

const ERROR_COPY: Record<
  ApiErrorCode | 'no_routes',
  { title: string; body: string; cta: string; severity: Severity; retry?: boolean }
> = {
  no_routes: {
    title: 'No transit routes found',
    body: 'There’s no bus or rail service between these two points. Try a different origin or destination.',
    cta: 'Change trip',
    severity: 'neutral',
  },
  rate_limited: {
    title: 'Daily lookup limit reached',
    body: 'You’ve used today’s lookups. Try again tomorrow.',
    cta: 'Back home',
    severity: 'warn',
  },
  upstream_quota: {
    title: 'Routing over quota',
    body: 'Routing service is rate-limited. Try again in a few minutes.',
    cta: 'Retry',
    severity: 'warn',
    retry: true,
  },
  invalid_input: {
    title: 'Couldn’t route this trip',
    body: 'One of the addresses couldn’t be resolved. Double-check and try again.',
    cta: 'Edit addresses',
    severity: 'error',
  },
  server_error: {
    title: 'Routing service failed',
    body: 'Something went wrong on our end. Try again in a moment.',
    cta: 'Retry',
    severity: 'error',
    retry: true,
  },
}

function ErrorPanel({
  error,
  onRetry,
  onBack,
}: {
  error: ErrorState
  onRetry?: () => void
  onBack?: () => void
}) {
  const copy = ERROR_COPY[error.code as keyof typeof ERROR_COPY] ?? ERROR_COPY.server_error
  const sev = copy.severity

  const accent =
    sev === 'error' ? 'var(--bb-error)' : sev === 'warn' ? 'var(--bb-warn)' : 'var(--bb-mut)'
  const accentBg =
    sev === 'error' ? 'var(--bb-error-bg)' : sev === 'warn' ? 'var(--bb-warn-bg)' : 'var(--bb-soft)'
  const accentLine =
    sev === 'error' ? 'var(--bb-error-line)' : sev === 'warn' ? 'var(--bb-warn-line)' : 'var(--bb-line)'

  return (
    <div>
      <div
        style={{
          marginTop: 8,
          padding: '24px 20px',
          borderRadius: 20,
          background: accentBg,
          border: `1px solid ${accentLine}`,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 999,
            margin: '0 auto 14px',
            background: 'var(--bb-surface)',
            border: `1px solid ${accentLine}`,
            display: 'grid',
            placeItems: 'center',
            color: accent,
          }}
        >
          {sev === 'error' && <ErrorIcon size={20} color={accent} />}
          {sev === 'warn' && <WarnIcon size={20} color={accent} />}
          {sev === 'neutral' && <SearchIcon size={20} color={accent} />}
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--bb-fg)', lineHeight: 1.3, letterSpacing: -0.2 }}>
          {copy.title}
        </div>
        <div
          style={{
            fontSize: 13,
            color: 'var(--bb-mut)',
            marginTop: 6,
            lineHeight: 1.5,
            maxWidth: 320,
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          {error.message && error.message !== copy.title ? error.message : copy.body}
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          if (copy.retry && onRetry) onRetry()
          else if (onBack) onBack()
        }}
        style={{
          width: '100%',
          marginTop: 16,
          padding: '14px 18px',
          borderRadius: 14,
          background: 'var(--bb-fg)',
          color: 'var(--bb-bg)',
          border: 'none',
          fontSize: 14,
          fontWeight: 600,
          fontFamily: 'inherit',
          cursor: 'pointer',
        }}
      >
        {copy.cta}
      </button>
    </div>
  )
}
