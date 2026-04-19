import { Link, useSearchParams } from 'react-router'

export function Results() {
  const [params] = useSearchParams()
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-4 px-4 py-6">
      <header className="flex items-center gap-3">
        <Link
          to="/"
          className="text-neutral-400 hover:text-neutral-100"
          aria-label="Back"
        >
          ←
        </Link>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm text-neutral-400">{from}</span>
          <span className="truncate text-sm font-medium">{to}</span>
        </div>
      </header>

      <p className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-4 text-sm text-neutral-400">
        Route loading will go here. (Scaffold step — no API wired up yet.)
      </p>
    </main>
  )
}
