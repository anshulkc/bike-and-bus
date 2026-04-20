import { useState } from 'react'
import { Link } from 'react-router'
import { ChevIcon } from '../components/Icon'
import { buildMapsUrl } from '../lib/deepLinks'
import type { LegType } from '../lib/types'

interface Case {
  label: string
  type: LegType
  origin: string
  destination: string
  note?: string
}

const CASES: Case[] = [
  {
    label: 'Bike — address → named transit station',
    type: 'bike',
    origin: '1234 Westwood Blvd, Los Angeles, CA',
    destination: 'Wilshire/Western Station, Los Angeles, CA',
  },
  {
    label: 'Bike — lat/lng → lat/lng',
    type: 'bike',
    origin: '34.0689,-118.4452',
    destination: '34.0617,-118.3076',
    note: 'raw coordinates, no geocoding',
  },
  {
    label: 'Transit — address → named place',
    type: 'transit',
    origin: 'Wilshire/Western Station, Los Angeles, CA',
    destination: 'Pershing Square, Los Angeles, CA',
  },
  {
    label: 'Walk — short hop',
    type: 'walk',
    origin: 'Pershing Square, Los Angeles, CA',
    destination: '550 S Hill St, Los Angeles, CA',
  },
  {
    label: 'Bike — place name with spaces / slashes',
    type: 'bike',
    origin: 'UCLA',
    destination: '7th St/Metro Center',
    note: 'exercises URL-encoding of / and spaces',
  },
]

const TYPE_LABEL: Record<LegType, string> = {
  bike: '🚲 bicycling',
  transit: '🚌 transit',
  walk: '🚶 walking',
}

export function DebugLinks() {
  const [copied, setCopied] = useState<number | null>(null)

  async function copyUrl(url: string, idx: number) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(idx)
      setTimeout(() => setCopied(null), 1200)
    } catch {
      // ignore
    }
  }

  return (
    <main
      style={{
        minHeight: '100%',
        background: 'var(--bb-bg)',
        color: 'var(--bb-fg)',
      }}
    >
      <div style={{ maxWidth: 460, margin: '0 auto', padding: '20px 20px 40px' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
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
              textDecoration: 'none',
            }}
          >
            <ChevIcon size={14} color="var(--bb-fg)" dir="left" />
          </Link>
          <div>
            <h1 style={{ fontSize: 15, fontWeight: 600, margin: 0, letterSpacing: -0.2 }}>
              Deep link test
            </h1>
            <p style={{ fontSize: 12, color: 'var(--bb-mut)', margin: '2px 0 0', lineHeight: 1.4 }}>
              Tap each link on iOS/Android to verify it opens Google Maps in the right mode.
            </p>
          </div>
        </header>

        <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {CASES.map((c, i) => {
            const url = buildMapsUrl({ origin: c.origin, destination: c.destination, type: c.type })
            return (
              <li
                key={i}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  padding: '14px 16px',
                  borderRadius: 14,
                  border: '1px solid var(--bb-line)',
                  background: 'var(--bb-surface)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--bb-fg)' }}>{c.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--bb-mut)' }}>{TYPE_LABEL[c.type]}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--bb-mut)', lineHeight: 1.4 }}>
                  <div style={truncStyle}>from: {c.origin}</div>
                  <div style={truncStyle}>to: {c.destination}</div>
                  {c.note && (
                    <div style={{ fontStyle: 'italic', color: 'var(--bb-mut)', marginTop: 4 }}>
                      {c.note}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      flex: 1,
                      padding: '9px 12px',
                      borderRadius: 10,
                      background: 'var(--bb-fg)',
                      color: 'var(--bb-bg)',
                      border: 'none',
                      fontSize: 13,
                      fontWeight: 600,
                      textAlign: 'center',
                      textDecoration: 'none',
                    }}
                  >
                    Open
                  </a>
                  <button
                    type="button"
                    onClick={() => copyUrl(url, i)}
                    style={{
                      padding: '9px 12px',
                      borderRadius: 10,
                      background: 'var(--bb-surface)',
                      color: 'var(--bb-fg)',
                      border: '1px solid var(--bb-line)',
                      fontSize: 13,
                      fontWeight: 500,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    {copied === i ? 'Copied' : 'Copy URL'}
                  </button>
                </div>
                <code
                  style={{
                    wordBreak: 'break-all',
                    borderRadius: 6,
                    background: 'var(--bb-soft)',
                    color: 'var(--bb-mut)',
                    padding: '6px 8px',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: 10,
                    lineHeight: 1.4,
                  }}
                >
                  {url}
                </code>
              </li>
            )
          })}
        </ol>
      </div>
    </main>
  )
}

const truncStyle: React.CSSProperties = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}
