import { useEffect, useState, useCallback } from 'react'

export type Theme = 'mono' | 'ink'
export type CardLayout = 'detailed' | 'compact'

const THEME_KEY = 'bb.theme'
const LAYOUT_KEY = 'bb.layout'

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
