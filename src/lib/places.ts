import { useEffect, useRef, useState } from 'react'
import type { LatLng } from './types'

export type PlaceSelection = {
  address: string
  latLng: LatLng
  placeId: string | null
}

export type Prediction = {
  placeId: string | null
  mainText: string
  secondaryText: string
  // Opaque handle kept so we can call .toPlace() + .fetchFields() on pick.
  raw: unknown
}

interface MinimalPlace {
  formattedAddress?: string | null
  displayName?: string | null
  location?: { lat: () => number; lng: () => number } | null
  id?: string | null
  fetchFields: (opts: { fields: string[] }) => Promise<unknown>
}
interface PlacePredictionRaw {
  placeId?: string
  text?: { text: string }
  mainText?: { text: string }
  secondaryText?: { text: string }
  toPlace: () => MinimalPlace
}
interface Suggestion {
  placePrediction?: PlacePredictionRaw | null
}
interface MinimalPlacesLib {
  AutocompleteSessionToken: new () => unknown
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions: (req: {
      input: string
      sessionToken?: unknown
      includedRegionCodes?: string[]
      language?: string
      region?: string
    }) => Promise<{ suggestions: Suggestion[] }>
  }
}
interface MinimalMapsNs {
  places: MinimalPlacesLib
}

type LoaderWindow = Window & {
  google?: { maps?: MinimalMapsNs }
  __bbMapsLoader?: Promise<MinimalMapsNs | null>
  __bbMapsInit?: () => void
}

const API_KEY = import.meta.env.VITE_GOOGLE_BROWSER_KEY as string | undefined
const DEBOUNCE_MS = 220
const MIN_QUERY = 2

export function placesAvailable(): boolean {
  return typeof API_KEY === 'string' && API_KEY.length > 0
}

export function loadMaps(): Promise<MinimalMapsNs | null> {
  if (!placesAvailable() || typeof window === 'undefined') return Promise.resolve(null)
  const w = window as LoaderWindow
  if (w.google?.maps) return Promise.resolve(w.google.maps)
  if (w.__bbMapsLoader) return w.__bbMapsLoader

  const p = new Promise<MinimalMapsNs | null>((resolve) => {
    w.__bbMapsInit = () => resolve(w.google?.maps ?? null)
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      API_KEY as string,
    )}&libraries=places&callback=__bbMapsInit&v=weekly&loading=async`
    s.async = true
    s.defer = true
    s.onerror = () => resolve(null)
    document.head.appendChild(s)
  })
  w.__bbMapsLoader = p
  return p
}

export function usePlaceAutocomplete(opts: {
  enabled: boolean
  query: string
  onSelect: (sel: PlaceSelection) => void
}): {
  predictions: Prediction[]
  pick: (prediction: Prediction) => Promise<void>
  clear: () => void
} {
  const { enabled, query, onSelect } = opts
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const tokenRef = useRef<unknown | null>(null)
  const onSelectRef = useRef(onSelect)
  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    if (!enabled || !placesAvailable()) {
      setPredictions([])
      return
    }
    const trimmed = query.trim()
    if (trimmed.length < MIN_QUERY) {
      setPredictions([])
      return
    }
    let cancelled = false
    const handle = window.setTimeout(() => {
      void loadMaps().then(async (maps) => {
        if (cancelled || !maps?.places?.AutocompleteSuggestion) return
        if (!tokenRef.current) {
          tokenRef.current = new maps.places.AutocompleteSessionToken()
        }
        try {
          const res = await maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: trimmed,
            sessionToken: tokenRef.current,
          })
          if (cancelled) return
          const mapped: Prediction[] = []
          for (const s of res.suggestions) {
            const pp = s.placePrediction
            if (!pp) continue
            mapped.push({
              placeId: pp.placeId ?? null,
              mainText: pp.mainText?.text ?? pp.text?.text ?? '',
              secondaryText: pp.secondaryText?.text ?? '',
              raw: pp,
            })
          }
          setPredictions(mapped)
        } catch {
          if (!cancelled) setPredictions([])
        }
      })
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [enabled, query])

  async function pick(prediction: Prediction): Promise<void> {
    const raw = prediction.raw as PlacePredictionRaw | null
    if (!raw) return
    const place = raw.toPlace()
    try {
      await place.fetchFields({
        fields: ['formattedAddress', 'displayName', 'location', 'id'],
      })
    } catch {
      return
    }
    const loc = place.location
    if (!loc) return
    const address = place.formattedAddress ?? place.displayName ?? prediction.mainText
    onSelectRef.current({
      address,
      latLng: { lat: loc.lat(), lng: loc.lng() },
      placeId: place.id ?? prediction.placeId,
    })
    // Rotate session after a selection — billing-correct behavior.
    tokenRef.current = null
    setPredictions([])
  }

  function clear(): void {
    setPredictions([])
  }

  return { predictions, pick, clear }
}
