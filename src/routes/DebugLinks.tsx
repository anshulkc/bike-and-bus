import { useState } from 'react'
import { Link } from 'react-router'
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
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-4 px-4 py-6">
      <header className="flex items-center gap-3">
        <Link to="/" className="text-neutral-400" aria-label="Back">
          ←
        </Link>
        <div>
          <h1 className="text-base font-semibold">Deep link test</h1>
          <p className="text-xs text-neutral-500">
            Tap each link on iOS/Android to verify it opens Google Maps in the right mode.
          </p>
        </div>
      </header>

      <ol className="flex flex-col gap-3">
        {CASES.map((c, i) => {
          const url = buildMapsUrl({ origin: c.origin, destination: c.destination, type: c.type })
          return (
            <li
              key={i}
              className="flex flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{c.label}</span>
                <span className="text-xs text-neutral-500">{TYPE_LABEL[c.type]}</span>
              </div>
              <div className="text-xs text-neutral-400">
                <div className="truncate">from: {c.origin}</div>
                <div className="truncate">to: {c.destination}</div>
                {c.note && <div className="mt-1 italic text-neutral-500">{c.note}</div>}
              </div>
              <div className="flex gap-2">
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 rounded-md bg-emerald-500 px-3 py-2 text-center text-sm font-semibold text-neutral-950"
                >
                  Open
                </a>
                <button
                  type="button"
                  onClick={() => copyUrl(url, i)}
                  className="rounded-md border border-neutral-700 px-3 py-2 text-sm"
                >
                  {copied === i ? 'Copied' : 'Copy URL'}
                </button>
              </div>
              <code className="break-all rounded bg-neutral-950 px-2 py-1 font-mono text-[10px] text-neutral-400">
                {url}
              </code>
            </li>
          )
        })}
      </ol>
    </main>
  )
}
