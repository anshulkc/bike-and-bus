import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'

export function Home() {
  const navigate = useNavigate()
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [bikeAtDest, setBikeAtDest] = useState(false)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!origin || !destination) return
    const params = new URLSearchParams({
      from: origin,
      to: destination,
      bikeAtDest: String(bikeAtDest),
    })
    navigate(`/results?${params.toString()}`)
  }

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-6 px-4 py-10">
      <header className="flex items-center gap-2">
        <span className="text-2xl">🚲🚌</span>
        <h1 className="text-xl font-semibold tracking-tight">bike + bus</h1>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-neutral-400">From</span>
          <input
            type="text"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            placeholder="📍 Current location"
            className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-3 text-base outline-none focus:border-neutral-500"
            autoComplete="off"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-neutral-400">To</span>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Where to?"
            className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-3 text-base outline-none focus:border-neutral-500"
            autoComplete="off"
          />
        </label>

        <label className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-3">
          <span className="text-sm">Bike at destination?</span>
          <input
            type="checkbox"
            checked={bikeAtDest}
            onChange={(e) => setBikeAtDest(e.target.checked)}
            className="h-5 w-5"
          />
        </label>

        <button
          type="submit"
          className="rounded-lg bg-emerald-500 px-4 py-3 text-base font-semibold text-neutral-950 transition active:scale-[0.98] disabled:opacity-40"
          disabled={!origin || !destination}
        >
          Find routes
        </button>
      </form>
    </main>
  )
}
