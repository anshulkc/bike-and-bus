import { useEffect, useState } from 'react'

const DISMISS_KEY = 'bike-bus.install-hint.dismissed'

type Platform = 'ios-safari' | 'ios-other' | 'other'

function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'other'
  const ua = window.navigator.userAgent
  const isIOS = /iPad|iPhone|iPod/.test(ua)
  if (!isIOS) return 'other'
  // On iOS, every browser is WebKit. Only Safari supports A2HS as a PWA.
  // Chrome/Firefox/Edge include their name; Safari doesn't.
  const isSafari = !/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser/.test(ua) && /Safari/.test(ua)
  return isSafari ? 'ios-safari' : 'ios-other'
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true
}

export function InstallHint() {
  const [show, setShow] = useState(false)
  const [platform, setPlatform] = useState<Platform>('other')

  useEffect(() => {
    if (isStandalone()) return
    if (localStorage.getItem(DISMISS_KEY) === '1') return
    const p = detectPlatform()
    if (p !== 'other') {
      setPlatform(p)
      setShow(true)
    }
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
            {platform === 'ios-safari' ? (
              <>
                Tap <span className="font-medium">Share</span> → scroll down →{' '}
                <span className="font-medium">Add to Home Screen</span>.
              </>
            ) : (
              <>
                Open this page in <span className="font-medium">Safari</span>, then Share →{' '}
                <span className="font-medium">Add to Home Screen</span>.
              </>
            )}
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
