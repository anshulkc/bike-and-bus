import type { CSSProperties } from 'react'

type IconProps = {
  size?: number
  color?: string
  style?: CSSProperties
}

const base = (size: number) => ({
  width: size,
  height: size,
  flexShrink: 0,
  display: 'block',
})

export function BikeIcon({ size = 18, color = 'currentColor', style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ ...base(size), ...style }} aria-hidden>
      <circle cx="5.5" cy="17.5" r="3.5" />
      <circle cx="18.5" cy="17.5" r="3.5" />
      <path d="M15 17.5L12 9l-3 3 3 2v4" />
      <path d="M9 6h2l1 3" />
      <path d="M14 6h3" />
    </svg>
  )
}

export function BusIcon({ size = 18, color = 'currentColor', style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ ...base(size), ...style }} aria-hidden>
      <rect x="4" y="4" width="16" height="13" rx="2" />
      <path d="M4 10h16" />
      <circle cx="8" cy="19" r="1.3" />
      <circle cx="16" cy="19" r="1.3" />
      <path d="M7 17v1.5M17 17v1.5" />
    </svg>
  )
}

export function WalkIcon({ size = 18, color = 'currentColor', style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ ...base(size), ...style }} aria-hidden>
      <circle cx="13" cy="4" r="1.6" />
      <path d="M10 21l2-6-3-3 1-5 4 3 3 1" />
      <path d="M9 12l-2 3" />
    </svg>
  )
}

export function ArrowIcon({ size = 14, color = 'currentColor', style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ ...base(size), ...style }} aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

export function PinIcon({ size = 14, color = 'currentColor', style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill={color} style={{ ...base(size), ...style }} aria-hidden>
      <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" />
    </svg>
  )
}

export function SettingsIcon({ size = 18, color = 'currentColor', style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ ...base(size), ...style }} aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

export function InfoIcon({ size = 18, color = 'currentColor', style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ ...base(size), ...style }} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  )
}

type ChevDir = 'right' | 'left' | 'up' | 'down'
const chevTransform: Record<ChevDir, string | undefined> = {
  right: undefined,
  left: 'scaleX(-1)',
  down: 'rotate(90deg)',
  up: 'rotate(-90deg)',
}

export function ChevIcon({ size = 14, color = 'currentColor', dir = 'right', style }: IconProps & { dir?: ChevDir }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ ...base(size), transform: chevTransform[dir], ...style }} aria-hidden>
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

export function CloseIcon({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" style={{ ...base(size), ...style }} aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

export function ExternalIcon({ size = 14, color = 'currentColor', style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ ...base(size), ...style }} aria-hidden>
      <path d="M14 4h6v6" />
      <path d="M10 14L20 4" />
      <path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5" />
    </svg>
  )
}

export function RefreshIcon({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ ...base(size), ...style }} aria-hidden>
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 4v5h-5" />
    </svg>
  )
}

export function WarnIcon({ size = 20, color = 'currentColor', style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ ...base(size), ...style }} aria-hidden>
      <path d="M12 3l9 16H3z" />
      <path d="M12 10v4M12 17h.01" />
    </svg>
  )
}

export function ErrorIcon({ size = 20, color = 'currentColor', style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" style={{ ...base(size), ...style }} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" />
    </svg>
  )
}

export function SearchIcon({ size = 20, color = 'currentColor', style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" style={{ ...base(size), ...style }} aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </svg>
  )
}

export function LegIconFor({ type, size = 16, color = 'currentColor' }: { type: 'bike' | 'transit' | 'walk'; size?: number; color?: string }) {
  if (type === 'bike') return <BikeIcon size={size} color={color} />
  if (type === 'transit') return <BusIcon size={size} color={color} />
  return <WalkIcon size={size} color={color} />
}
