import { BikeIcon, BusIcon, ChevIcon, WalkIcon } from './Icon'
import { formatLocalTime } from '../lib/formatTime'
import type { Route, Leg, LegType } from '../lib/types'

type Props = {
  route: Route
  index: number
  onOpen: () => void
  isFastest?: boolean
}

function tagFor(idx: number, isFastest: boolean | undefined): string {
  if (isFastest) return 'Fastest'
  return `Option ${idx + 1}`
}

function arriveAt(route: Route): string | null {
  for (let i = route.legs.length - 1; i >= 0; i--) {
    const a = route.legs[i].arriveAt
    if (a) return a
  }
  return null
}

function legSummary(leg: Leg): string {
  if (leg.type === 'bike') return `Bike ${leg.minutes} min`
  if (leg.type === 'walk') return `Walk ${leg.minutes} min`
  return leg.line ? leg.line : `Transit ${leg.minutes} min`
}

// Detailed (V3) — vertical dot timeline
export function RouteCardDetailed({ route, index, onOpen, isFastest }: Props) {
  const tag = tagFor(index, isFastest)
  const arr = arriveAt(route)

  // Build a step list: start → leg → leg → ... → end
  const steps: Array<{
    icon: React.ReactNode | null
    title: string
    sub: string | null
    line?: string
    accent?: boolean
    type?: 'start' | 'end'
  }> = []

  const first = route.legs[0]
  steps.push({
    icon: null,
    title: 'Current location',
    sub: first?.fromName ?? null,
    type: 'start',
  })

  for (const leg of route.legs) {
    const t = leg.type
    if (t === 'bike') {
      steps.push({
        icon: <BikeIcon size={11} color="var(--bb-bg)" />,
        title: `Bike ${leg.minutes} min`,
        sub: leg.toName ? `→ ${leg.toName}` : null,
        accent: true,
      })
    } else if (t === 'transit') {
      steps.push({
        icon: <BusIcon size={11} color="var(--bb-bg)" />,
        title: leg.line ? `Bus ${leg.line}` : `Transit ${leg.minutes} min`,
        sub: leg.departAt
          ? `${leg.minutes} min · departs ${formatLocalTime(leg.departAt)}`
          : `${leg.minutes} min`,
        line: leg.line,
      })
    } else {
      steps.push({
        icon: <WalkIcon size={11} color="var(--bb-bg)" />,
        title: `Walk ${leg.minutes} min`,
        sub: leg.fromName ? `from ${leg.fromName}` : null,
      })
    }
  }

  const last = route.legs[route.legs.length - 1]
  steps.push({
    icon: null,
    title: last?.toName ?? 'Destination',
    sub: arr ? `arrive ${formatLocalTime(arr)}` : null,
    type: 'end',
  })

  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        background: 'var(--bb-surface)',
        borderRadius: 20,
        border: '1px solid var(--bb-line)',
        padding: 18,
        cursor: 'pointer',
        color: 'var(--bb-fg)',
        textAlign: 'left',
        fontFamily: 'inherit',
        width: '100%',
        display: 'block',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: 0.4,
            fontWeight: 700,
            textTransform: 'uppercase',
            color: 'var(--bb-fg)',
            background: 'var(--bb-soft)',
            padding: '4px 8px',
            borderRadius: 6,
          }}
        >
          {tag}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: -0.6 }}>{route.totalMinutes}</div>
          <div style={{ fontSize: 12, color: 'var(--bb-mut)' }}>
            min{arr ? ` · arrive ${formatLocalTime(arr)}` : ''}
          </div>
        </div>
      </div>

      {/* dotted vertical */}
      <div style={{ position: 'relative', paddingLeft: 26 }}>
        <div
          style={{
            position: 'absolute',
            left: 9,
            top: 8,
            bottom: 8,
            width: 2,
            background:
              'repeating-linear-gradient(to bottom, var(--bb-line) 0 4px, transparent 4px 8px)',
          }}
        />
        {steps.map((s, i, arr2) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              paddingBottom: i === arr2.length - 1 ? 0 : 12,
              position: 'relative',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: -26,
                top: 2,
                width: 20,
                height: 20,
                borderRadius: 999,
                background: s.type ? 'var(--bb-fg)' : 'var(--bb-fg)',
                border: s.type || s.icon ? 'none' : '2px solid var(--bb-fg)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              {s.icon}
              {s.type && (
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: 'var(--bb-bg)',
                  }}
                />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: s.type ? 600 : 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
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
                    marginTop: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.sub}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </button>
  )
}

// Compact (V5) — single-row dense card
export function RouteCardCompact({ route, index, onOpen, isFastest }: Props) {
  const tag = tagFor(index, isFastest)
  const arr = arriveAt(route)
  const dep = route.legs.find((l) => l.departAt)?.departAt ?? null

  // Aggregate per-mode minutes for the inline summary line
  const buckets: Record<LegType, number> = { bike: 0, transit: 0, walk: 0 }
  let transitLine: string | null = null
  for (const leg of route.legs) {
    buckets[leg.type] += leg.minutes
    if (leg.type === 'transit' && leg.line && !transitLine) transitLine = leg.line
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        background: 'var(--bb-surface)',
        borderRadius: 14,
        border: '1px solid var(--bb-line)',
        padding: '14px 16px',
        cursor: 'pointer',
        color: 'var(--bb-fg)',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        fontFamily: 'inherit',
        width: '100%',
        textAlign: 'left',
      }}
    >
      <div style={{ minWidth: 52 }}>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.5, lineHeight: 1 }}>
          {route.totalMinutes}
        </div>
        <div style={{ fontSize: 11, color: 'var(--bb-mut)', marginTop: 2 }}>min</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
          {buckets.bike > 0 && (
            <>
              <BikeIcon size={14} color="var(--bb-fg)" />
              <span style={{ fontSize: 13 }}>{buckets.bike}</span>
              <Bullet />
            </>
          )}
          {buckets.transit > 0 && (
            <>
              {transitLine && (
                <span
                  style={{
                    padding: '1px 6px',
                    borderRadius: 4,
                    background: 'var(--bb-fg)',
                    color: 'var(--bb-bg)',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 0.3,
                  }}
                >
                  {transitLine}
                </span>
              )}
              <span style={{ fontSize: 13 }}>{buckets.transit}</span>
              <Bullet />
            </>
          )}
          {buckets.walk > 0 && (
            <>
              <WalkIcon size={14} color="var(--bb-mut)" />
              <span style={{ fontSize: 13, color: 'var(--bb-mut)' }}>{buckets.walk}</span>
            </>
          )}
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--bb-mut)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {tag}
          {dep && arr ? ` · ${formatLocalTime(dep)} → ${formatLocalTime(arr)}` : ''}
          {route.savedVsWalking > 0 ? ` · saves ${route.savedVsWalking} min` : ''}
        </div>
      </div>
      <ChevIcon size={14} color="var(--bb-mut)" />
    </button>
  )
}

function Bullet() {
  return <span style={{ color: 'var(--bb-mut)', fontSize: 11 }}>·</span>
}

export { legSummary }
