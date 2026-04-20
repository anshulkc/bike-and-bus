import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import {
  BikeIcon,
  BusIcon,
  ChevIcon,
  ExternalIcon,
  WalkIcon,
} from '../components/Icon'
import { MapTile } from '../components/MapTile'
import { fetchRoutes, RoutesApiError } from '../lib/api'
import { getStoredTrip, setStoredTrip } from '../lib/routeStore'
import type { LatLng, Leg, Route, SortBy } from '../lib/types'

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }

export function Detail() {
  const { idx: idxParam } = useParams<{ idx: string }>()
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const idx = Number(idxParam ?? 0)
  const tripKeyParam = params.get('trip') ?? ''
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

  const [route, setRoute] = useState<Route | null>(() => {
    const stored = getStoredTrip(tripKeyParam)
    return stored?.data.routes[idx] ?? null
  })
  const [load, setLoad] = useState<LoadState>(route ? { kind: 'idle' } : { kind: 'loading' })

  // If we landed here cold (deep link, page refresh) re-fetch using the trip key.
  useEffect(() => {
    if (route) return
    const stored = getStoredTrip(tripKeyParam)
    if (stored) {
      setRoute(stored.data.routes[idx] ?? null)
      setLoad({ kind: 'idle' })
      return
    }
    const parts = tripKeyParam.split('::')
    if (parts.length !== 3) {
      setLoad({ kind: 'error', message: 'Missing trip context. Plan a new trip.' })
      return
    }
    const [origin, destination, sortBy] = parts
    let cancelled = false
    setLoad({ kind: 'loading' })
    fetchRoutes({
      origin,
      destination,
      originLatLng: fromLatLng ?? undefined,
      destinationLatLng: toLatLng ?? undefined,
      sortBy: sortBy as SortBy,
    })
      .then((res) => {
        if (cancelled) return
        setStoredTrip({
          origin,
          destination,
          originLatLng: fromLatLng,
          destinationLatLng: toLatLng,
          sortBy: sortBy as SortBy,
          data: res,
          fetchedAt: Date.now(),
        })
        const r = res.routes[idx]
        if (!r) {
          setLoad({ kind: 'error', message: 'That route is no longer available.' })
        } else {
          setRoute(r)
          setLoad({ kind: 'idle' })
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return
        const msg = e instanceof RoutesApiError ? e.message : 'Something went wrong'
        setLoad({ kind: 'error', message: msg })
      })
    return () => {
      cancelled = true
    }
  }, [tripKeyParam, idx, route, fromLatLng, toLatLng])

  if (load.kind === 'loading') {
    return <Frame><CenteredMessage>Loading route…</CenteredMessage></Frame>
  }
  if (load.kind === 'error') {
    return (
      <Frame>
        <CenteredMessage>
          {load.message}
          <button
            type="button"
            onClick={() => navigate(-1)}
            style={ctaSecondaryStyle}
          >
            Back to results
          </button>
        </CenteredMessage>
      </Frame>
    )
  }
  if (!route) {
    return <Frame><CenteredMessage>No route data.</CenteredMessage></Frame>
  }

  return (
    <DetailBody
      route={route}
      backHref={
        tripKeyParam ? `/results?${decodeTripToQuery(tripKeyParam, fromLatLng, toLatLng)}` : '/'
      }
    />
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

function decodeTripToQuery(
  key: string,
  fromLatLng: LatLng | null,
  toLatLng: LatLng | null,
): string {
  const [origin, destination, sortBy] = key.split('::')
  const p = new URLSearchParams({
    from: origin ?? '',
    to: destination ?? '',
    sortBy: sortBy ?? 'fastest',
  })
  if (fromLatLng) {
    p.set('fromLat', String(fromLatLng.lat))
    p.set('fromLng', String(fromLatLng.lng))
  }
  if (toLatLng) {
    p.set('toLat', String(toLatLng.lat))
    p.set('toLng', String(toLatLng.lng))
  }
  return p.toString()
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: '100%', background: 'var(--bb-bg)', color: 'var(--bb-fg)' }}>
      <div style={{ maxWidth: 460, margin: '0 auto' }}>{children}</div>
    </main>
  )
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '70vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 24,
        textAlign: 'center',
        color: 'var(--bb-mut)',
        fontSize: 14,
      }}
    >
      {children}
    </div>
  )
}

function DetailBody({ route, backHref }: { route: Route; backHref: string }) {
  const arr = useMemo(() => {
    for (let i = route.legs.length - 1; i >= 0; i--) {
      const a = route.legs[i].arriveAt
      if (a) return a
    }
    return null
  }, [route])

  const dep = useMemo(() => route.legs.find((l) => l.departAt)?.departAt ?? null, [route])

  const totalMiles = useMemo(() => {
    const meters = route.legs.reduce((sum, l) => sum + (l.meters ?? 0), 0)
    if (meters === 0) return null
    return (meters / 1609.344).toFixed(1)
  }, [route])

  // Build steps for the rail
  const steps = buildSteps(route)
  const firstAction = route.legs[0]

  return (
    <Frame>
      {/* map header */}
      <div style={{ position: 'relative' }}>
        <MapTile height={240} />
        <Link
          to={backHref}
          aria-label="Back"
          style={{
            position: 'absolute',
            top: 14,
            left: 16,
            width: 36,
            height: 36,
            borderRadius: 10,
            border: '1px solid var(--bb-line)',
            background: 'var(--bb-surface)',
            color: 'var(--bb-fg)',
            display: 'grid',
            placeItems: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}
        >
          <ChevIcon size={14} color="var(--bb-fg)" dir="left" />
        </Link>
        {totalMiles && (
          <div
            style={{
              position: 'absolute',
              top: 14,
              right: 16,
              padding: '8px 12px',
              borderRadius: 10,
              background: 'var(--bb-surface)',
              border: '1px solid var(--bb-line)',
              fontSize: 12,
              fontWeight: 500,
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}
          >
            {totalMiles} mi
          </div>
        )}
      </div>

      {/* summary block */}
      <div style={{ padding: '16px 20px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 11,
                color: 'var(--bb-mut)',
                textTransform: 'uppercase',
                letterSpacing: 0.4,
                fontWeight: 600,
              }}
            >
              {route.transferCount === 0 ? 'Direct' : `${route.transferCount} transfer${route.transferCount === 1 ? '' : 's'}`}
            </div>
            <div style={{ fontSize: 34, fontWeight: 600, letterSpacing: -1.2, lineHeight: 1.05, marginTop: 2 }}>
              {route.totalMinutes} min
            </div>
            {dep && arr && (
              <div style={{ fontSize: 13, color: 'var(--bb-mut)', marginTop: 4 }}>
                {dep} — {arr}
              </div>
            )}
          </div>
          {route.savedVsWalking > 0 && (
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--bb-mut)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                  fontWeight: 600,
                }}
              >
                Saved
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  color: 'var(--bb-success)',
                  letterSpacing: -0.6,
                  marginTop: 2,
                }}
              >
                −{route.savedVsWalking} min
              </div>
              <div style={{ fontSize: 12, color: 'var(--bb-mut)' }}>vs walk + bus</div>
            </div>
          )}
        </div>
      </div>

      {/* leg-by-leg */}
      <div style={{ padding: '8px 20px 0' }}>
        <div
          style={{
            background: 'var(--bb-surface)',
            borderRadius: 18,
            border: '1px solid var(--bb-line)',
            padding: '4px 16px',
            position: 'relative',
          }}
        >
          {steps.map((s, i, arr2) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 14,
                padding: s.short ? '6px 0' : '12px 0',
                borderBottom: i < arr2.length - 1 ? '1px solid var(--bb-line)' : 'none',
                position: 'relative',
                opacity: s.short ? 0.6 : 1,
              }}
            >
              {/* rail */}
              <div style={{ position: 'relative', width: 24, flexShrink: 0, alignSelf: 'stretch' }}>
                {i < arr2.length - 1 && (
                  <div
                    style={{
                      position: 'absolute',
                      left: 11,
                      top: 26,
                      bottom: -12,
                      width: 2,
                      background:
                        s.kind === 'bike'
                          ? 'repeating-linear-gradient(to bottom, var(--bb-fg) 0 3px, transparent 3px 7px)'
                          : 'var(--bb-line)',
                    }}
                  />
                )}
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 999,
                    background: s.kind === 'endpoint' ? 'var(--bb-fg)' : s.accent ? 'var(--bb-fg)' : 'var(--bb-soft)',
                    border: !s.accent && s.kind !== 'endpoint' ? '1.5px solid var(--bb-line)' : 'none',
                    display: 'grid',
                    placeItems: 'center',
                    position: 'relative',
                    zIndex: 1,
                  }}
                >
                  {s.kind === 'bike' && <BikeIcon size={13} color="var(--bb-bg)" />}
                  {s.kind === 'transit' && <BusIcon size={13} color={s.accent ? 'var(--bb-bg)' : 'var(--bb-fg)'} />}
                  {s.kind === 'walk' && <WalkIcon size={13} color={s.accent ? 'var(--bb-bg)' : 'var(--bb-fg)'} />}
                  {s.kind === 'endpoint' && (
                    <div style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--bb-bg)' }} />
                  )}
                </div>
              </div>
              {/* text */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: s.short ? 13 : 14,
                    fontWeight: s.kind === 'endpoint' ? 600 : 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    color: 'var(--bb-fg)',
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                    {s.title}
                  </span>
                  {s.line && (
                    <span
                      style={{
                        fontSize: 10,
                        padding: '1px 5px',
                        borderRadius: 3,
                        background: 'var(--bb-fg)',
                        color: 'var(--bb-bg)',
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {s.line}
                    </span>
                  )}
                </div>
                {s.sub && (
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--bb-mut)',
                      marginTop: 2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {s.sub}
                  </div>
                )}
                {s.actionHref && s.actionLabel && (
                  <a
                    href={s.actionHref}
                    target="_blank"
                    rel="noreferrer noopener"
                    style={{
                      marginTop: 8,
                      padding: '7px 10px',
                      borderRadius: 8,
                      background: 'var(--bb-soft)',
                      border: '1px solid var(--bb-line)',
                      color: 'var(--bb-fg)',
                      fontSize: 12,
                      fontWeight: 500,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      textDecoration: 'none',
                    }}
                  >
                    <ExternalIcon size={11} color="var(--bb-fg)" /> {s.actionLabel}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* primary CTA — opens first leg in Google Maps */}
      <div style={{ padding: '16px 20px 24px' }}>
        <a
          href={firstAction.googleMapsUrl}
          target="_blank"
          rel="noreferrer noopener"
          style={{
            width: '100%',
            padding: '16px 18px',
            borderRadius: 14,
            background: 'var(--bb-fg)',
            color: 'var(--bb-bg)',
            border: 'none',
            fontSize: 16,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            letterSpacing: -0.2,
            textDecoration: 'none',
            boxSizing: 'border-box',
          }}
        >
          {firstAction.type === 'bike' && <BikeIcon size={16} color="var(--bb-bg)" />}
          {firstAction.type === 'transit' && <BusIcon size={16} color="var(--bb-bg)" />}
          {firstAction.type === 'walk' && <WalkIcon size={16} color="var(--bb-bg)" />}
          Start {firstAction.type} leg in Google Maps
          <ExternalIcon size={14} color="var(--bb-bg)" />
        </a>
        <div
          style={{
            marginTop: 10,
            fontSize: 12,
            color: 'var(--bb-mut)',
            textAlign: 'center',
            lineHeight: 1.5,
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          Hands you off to Google Maps for turn-by-turn. Come back when you reach{' '}
          {firstAction.toName || 'the next stop'} for the next leg.
        </div>
      </div>
    </Frame>
  )
}

type Step = {
  kind: 'endpoint' | 'bike' | 'transit' | 'walk'
  title: string
  sub: string | null
  line?: string
  accent?: boolean
  short?: boolean
  actionHref?: string
  actionLabel?: string
}

function buildSteps(route: Route): Step[] {
  const steps: Step[] = []
  const first = route.legs[0]
  steps.push({
    kind: 'endpoint',
    title: 'Current location',
    sub: first?.fromName ?? null,
  })

  for (const leg of route.legs) {
    steps.push(stepForLeg(leg))
  }

  const last = route.legs[route.legs.length - 1]
  steps.push({
    kind: 'endpoint',
    title: last?.toName ?? 'Destination',
    sub: last?.arriveAt ? `arrive ${last.arriveAt}` : null,
  })
  return steps
}

function stepForLeg(leg: Leg): Step {
  const short = leg.minutes < 3 && leg.type === 'walk'
  if (leg.type === 'bike') {
    const miles = leg.meters ? `${(leg.meters / 1609.344).toFixed(1)} mi` : null
    return {
      kind: 'bike',
      accent: true,
      title: `Bike ${leg.minutes} min${miles ? ` · ${miles}` : ''}`,
      sub: leg.toName ? `to ${leg.toName}` : null,
      actionHref: leg.googleMapsUrl,
      actionLabel: 'Open bike nav',
    }
  }
  if (leg.type === 'transit') {
    return {
      kind: 'transit',
      accent: true,
      title: leg.line ? `Board ${leg.line}` : `Board transit`,
      sub: leg.fromName
        ? `at ${leg.fromName}${leg.departAt ? ` · departs ${leg.departAt}` : ''}`
        : leg.departAt
          ? `departs ${leg.departAt}`
          : null,
      line: leg.line,
    }
  }
  return {
    kind: 'walk',
    title: `Walk ${leg.minutes} min`,
    sub: leg.toName ? `to ${leg.toName}` : null,
    short,
    actionHref: short ? undefined : leg.googleMapsUrl,
    actionLabel: short ? undefined : 'Open walk nav',
  }
}

const ctaSecondaryStyle: React.CSSProperties = {
  padding: '12px 18px',
  borderRadius: 12,
  background: 'var(--bb-fg)',
  color: 'var(--bb-bg)',
  border: 'none',
  fontSize: 14,
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
}
