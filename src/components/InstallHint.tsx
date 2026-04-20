import { useEffect, useState } from 'react'
import { BikeIcon, CloseIcon } from './Icon'

const DISMISS_KEY = 'bb.install-hint.dismissed'

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
    <div
      style={{
        position: 'fixed',
        left: 14,
        right: 14,
        bottom: `calc(14px + env(safe-area-inset-bottom))`,
        maxWidth: 460,
        marginInline: 'auto',
        background: 'var(--bb-surface)',
        border: '1px solid var(--bb-line)',
        borderRadius: 16,
        padding: '14px 16px',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.10)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        zIndex: 40,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: 'var(--bb-fg)',
          color: 'var(--bb-bg)',
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
        }}
      >
        <BikeIcon size={18} color="var(--bb-bg)" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Add to Home Screen</div>
        <div style={{ fontSize: 11, color: 'var(--bb-mut)', marginTop: 2, lineHeight: 1.4 }}>
          Tap <ShareGlyph /> then “Add to Home Screen”.
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          width: 28,
          height: 28,
          borderRadius: 999,
          border: 'none',
          background: 'var(--bb-soft)',
          color: 'var(--bb-mut)',
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
          flexShrink: 0,
          padding: 0,
        }}
      >
        <CloseIcon size={12} color="var(--bb-mut)" />
      </button>
    </div>
  )
}

function ShareGlyph() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 12,
        height: 12,
        verticalAlign: -1,
        border: '1px solid var(--bb-mut)',
        borderRadius: 2,
        position: 'relative',
      }}
    >
      <span
        style={{
          position: 'absolute',
          left: 3,
          top: -3,
          width: 4,
          height: 8,
          borderLeft: '1px solid var(--bb-mut)',
          borderTop: '1px solid var(--bb-mut)',
          transform: 'rotate(45deg)',
        }}
      />
    </span>
  )
}
