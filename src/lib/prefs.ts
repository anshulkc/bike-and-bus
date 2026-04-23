import { useEffect, useState, useCallback } from 'react'

export type Theme = 'mono' | 'ink'
export type CardLayout = 'detailed' | 'compact'

const THEME_KEY = 'bb.theme'
const LAYOUT_KEY = 'bb.layout'
const MAX_BIKE_MILES_KEY = 'bb.maxBikeMiles'

export const DEFAULT_MAX_BIKE_MILES = 3
const MIN_BIKE_MILES = 0.25
const MAX_BIKE_MILES_LIMIT = 50

function read<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const v = localStorage.getItem(key)
    if (v && (allowed as readonly string[]).includes(v)) return v as T
  } catch {
    /* SSR or storage disabled */
  }
  return fallback
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => read(THEME_KEY, 'mono', ['mono', 'ink'] as const))

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      /* ignore */
    }
  }, [theme])

  return [theme, setTheme]
}

export function useCardLayout(): [CardLayout, (l: CardLayout) => void] {
  const [layout, setLayoutState] = useState<CardLayout>(() =>
    read(LAYOUT_KEY, 'detailed', ['detailed', 'compact'] as const),
  )

  const setLayout = useCallback((l: CardLayout) => {
    setLayoutState(l)
    try {
      localStorage.setItem(LAYOUT_KEY, l)
    } catch {
      /* ignore */
    }
  }, [])

  return [layout, setLayout]
}

function clampMiles(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return DEFAULT_MAX_BIKE_MILES
  return Math.min(Math.max(v, MIN_BIKE_MILES), MAX_BIKE_MILES_LIMIT)
}

function readMiles(): number {
  try {
    const raw = localStorage.getItem(MAX_BIKE_MILES_KEY)
    if (!raw) return DEFAULT_MAX_BIKE_MILES
    const n = Number(raw)
    return clampMiles(n)
  } catch {
    return DEFAULT_MAX_BIKE_MILES
  }
}

export function useMaxBikeMiles(): [number, (miles: number) => void] {
  const [miles, setMilesState] = useState<number>(() => readMiles())

  const setMiles = useCallback((m: number) => {
    const clamped = clampMiles(m)
    setMilesState(clamped)
    try {
      localStorage.setItem(MAX_BIKE_MILES_KEY, String(clamped))
    } catch {
      /* ignore */
    }
  }, [])

  return [miles, setMiles]
}
