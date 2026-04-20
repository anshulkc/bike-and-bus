import { useEffect, useState } from 'react'

const DISMISS_KEY = 'bike-bus.install-hint.dismissed'

function isIOS(): boolean {
  if (typeof window === 'undefined') return false
  return /iPad|iPhone|iPod/.test(window.navigator.userAgent)
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true
}

export function InstallHint() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (isStandalone()) return
    if (localStorage.getItem(DISMISS_KEY) === '1') return
    if (isIOS()) setShow(true)
  }, [])

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="fixed inset-x-0 bottom-4 z-40 mx-auto max-w-md px-4">
      <div className="flex items-start gap-3 rounded-xl border border-emerald-700 bg-emerald-950/90 px-4 py-3 text-sm text-emerald-50 shadow-lg backdrop-blur">
        <span aria-hidden>📱</span>
        <div className="flex-1">
          <div className="font-medium">Install to home screen</div>
          <div className="mt-0.5 text-xs text-emerald-200">
            Tap <span className="font-medium">Share</span> → scroll down →{' '}
            <span className="font-medium">Add to Home Screen</span>.
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="-mr-2 -mt-1 px-2 py-1 text-emerald-300 hover:text-emerald-100"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  )
}
