import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import {
  ArrowIcon,
  BikeIcon,
  ChevIcon,
  CloseIcon,
  InfoIcon,
  PinIcon,
  SettingsIcon,
} from '../components/Icon'
import { InstallHint } from '../components/InstallHint'
import { SettingsSheet } from '../components/SettingsSheet'
import { GeolocationError, getCurrentPosition } from '../lib/geolocation'
import {
  placesAvailable,
  usePlaceAutocomplete,
  type PlaceSelection,
  type Prediction,
} from '../lib/places'
import { useCardLayout, useMaxBikeMiles, useTheme } from '../lib/prefs'
import { loadRecents, pushRecent, type RecentTrip } from '../lib/recents'
import type { LatLng } from '../lib/types'

type GeoState = 'idle' | 'requesting' | 'denied' | 'unavailable'

type PlanArgs = {
  originText: string
  originLatLng: LatLng | null
  destinationText: string
  destinationLatLng: LatLng | null
}

export function Home() {
  const navigate = useNavigate()
  const [theme, setTheme] = useTheme()
  const [layout, setLayout] = useCardLayout()
  const [maxBikeMiles, setMaxBikeMiles] = useMaxBikeMiles()

  const [origin, setOrigin] = useState('')
  const [originLatLng, setOriginLatLng] = useState<LatLng | null>(null)
  const [destination, setDestination] = useState('')
  const [destinationLatLng, setDestinationLatLng] = useState<LatLng | null>(null)
  const [useCurrentLocation, setUseCurrentLocation] = useState(true)
  const [geoState, setGeoState] = useState<GeoState>('idle')

  const [infoOpen, setInfoOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [recents, setRecents] = useState<RecentTrip[]>([])

  const originInputRef = useRef<HTMLInputElement | null>(null)
  const destInputRef = useRef<HTMLInputElement | null>(null)
  const [originFocused, setOriginFocused] = useState(false)
  const [destFocused, setDestFocused] = useState(false)

  useEffect(() => {
    setRecents(loadRecents())
  }, [])

  const onOriginSelected = useCallback((sel: PlaceSelection) => {
    setOrigin(sel.address)
    setOriginLatLng(sel.latLng)
  }, [])
  const onDestinationSelected = useCallback((sel: PlaceSelection) => {
    setDestination(sel.address)
    setDestinationLatLng(sel.latLng)
  }, [])

  const originAC = usePlaceAutocomplete({
    enabled: !useCurrentLocation && originFocused && !originLatLng,
    query: origin,
    onSelect: onOriginSelected,
  })
  const destAC = usePlaceAutocomplete({
    enabled: destFocused && !destinationLatLng,
    query: destination,
    onSelect: onDestinationSelected,
  })

  function plan(args: PlanArgs) {
    if (!args.originText || !args.destinationText) return
    pushRecent({
      origin: args.originText,
      destination: args.destinationText,
      originLatLng: args.originLatLng,
      destinationLatLng: args.destinationLatLng,
    })
    const params = new URLSearchParams({
      from: args.originText,
      to: args.destinationText,
    })
    if (args.originLatLng) {
      params.set('fromLat', String(args.originLatLng.lat))
      params.set('fromLng', String(args.originLatLng.lng))
    }
    if (args.destinationLatLng) {
      params.set('toLat', String(args.destinationLatLng.lat))
      params.set('toLng', String(args.destinationLatLng.lng))
    }
    navigate(`/results?${params.toString()}`)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!destination) return

    if (useCurrentLocation) {
      if (originLatLng) {
        plan({
          originText: 'Current location',
          originLatLng,
          destinationText: destination,
          destinationLatLng,
        })
        return
      }
      setGeoState('requesting')
      try {
        const pos = await getCurrentPosition()
        setOriginLatLng(pos)
        setGeoState('idle')
        plan({
          originText: 'Current location',
          originLatLng: pos,
          destinationText: destination,
          destinationLatLng,
        })
      } catch (err) {
        if (err instanceof GeolocationError) {
          setGeoState(err.kind === 'unavailable' ? 'unavailable' : 'denied')
        } else {
          setGeoState('denied')
        }
        setUseCurrentLocation(false)
        // Focus the origin field on the next paint so the user can type one.
        setTimeout(() => originInputRef.current?.focus(), 0)
      }
      return
    }

    if (!origin) return
    plan({
      originText: origin,
      originLatLng,
      destinationText: destination,
      destinationLatLng,
    })
  }

  function switchToTypedOrigin() {
    setUseCurrentLocation(false)
    setOrigin('')
    setOriginLatLng(null)
    setGeoState('idle')
  }
  function switchToCurrentLocation() {
    setUseCurrentLocation(true)
    setOrigin('')
    setOriginLatLng(null)
    setGeoState('idle')
  }

  const ctaDisabled =
    !destination || geoState === 'requesting' || (!useCurrentLocation && !origin)

  const geoMessage =
    geoState === 'requesting'
      ? 'Requesting location…'
      : geoState === 'denied'
        ? 'Location denied — type a starting address instead.'
        : geoState === 'unavailable'
          ? 'Location unavailable — type a starting address.'
          : null

  return (
    <main
      style={{
        minHeight: '100%',
        background: 'var(--bb-bg)',
        color: 'var(--bb-fg)',
      }}
    >
      <div style={{ maxWidth: 460, margin: '0 auto', padding: '20px 20px 120px' }}>
        {/* compact app header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 6,
            marginBottom: 18,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: 'var(--bb-fg)',
                color: 'var(--bb-bg)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <BikeIcon size={16} color="var(--bb-bg)" />
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.2 }}>Bike + Bus</div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <IconButton
              ariaLabel={infoOpen ? 'Hide info' : 'About'}
              onClick={() => setInfoOpen((v) => !v)}
              active={infoOpen}
            >
              <InfoIcon size={18} color="var(--bb-mut)" />
            </IconButton>
            <IconButton
              ariaLabel={settingsOpen ? 'Close settings' : 'Settings'}
              onClick={() => setSettingsOpen((v) => !v)}
              active={settingsOpen}
            >
              <SettingsIcon size={18} color="var(--bb-mut)" />
            </IconButton>
          </div>
        </div>

        {/* in-app settings sheet */}
        {settingsOpen && (
          <SettingsSheet
            theme={theme}
            setTheme={setTheme}
            layout={layout}
            setLayout={setLayout}
            maxBikeMiles={maxBikeMiles}
            setMaxBikeMiles={setMaxBikeMiles}
          />
        )}

        {/* collapsible info */}
        {infoOpen && (
          <div
            style={{
              marginBottom: 16,
              padding: '12px 14px',
              borderRadius: 12,
              background: 'var(--bb-soft)',
              color: 'var(--bb-mut)',
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            Google Maps doesn’t combine bike + bus in most cities. This app takes transit routes
            and swaps walk legs for biking — then hands each leg back to Google Maps.
          </div>
        )}

        <Eyebrow>Plan a trip</Eyebrow>

        <form onSubmit={onSubmit}>
          {/* connected origin/dest card */}
          <div
            style={{
              background: 'var(--bb-surface)',
              borderRadius: 16,
              border: '1px solid var(--bb-line)',
              overflow: 'visible',
              position: 'relative',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: 30,
                top: 40,
                bottom: 40,
                width: 1.5,
                background:
                  'repeating-linear-gradient(to bottom, var(--bb-line) 0 3px, transparent 3px 6px)',
              }}
            />

            {/* origin */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 16px',
                position: 'relative',
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  border: '1.5px solid var(--bb-fg)',
                  display: 'grid',
                  placeItems: 'center',
                  background: 'var(--bb-surface)',
                  zIndex: 1,
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: 'var(--bb-fg)',
                  }}
                />
              </div>
              {useCurrentLocation ? (
                <>
                  <div style={{ flex: 1, fontSize: 15, fontWeight: 500 }}>
                    {geoState === 'requesting' ? 'Getting location…' : 'Current location'}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      padding: '3px 7px',
                      borderRadius: 999,
                      background: originLatLng ? 'var(--bb-success-bg)' : 'var(--bb-soft)',
                      color: originLatLng ? 'var(--bb-success)' : 'var(--bb-mut)',
                      fontWeight: 600,
                      letterSpacing: 0.4,
                      marginRight: 4,
                    }}
                  >
                    GPS
                  </div>
                  <button
                    type="button"
                    aria-label="Use a different starting address"
                    onClick={switchToTypedOrigin}
                    style={iconChipStyle}
                  >
                    <CloseIcon size={11} color="var(--bb-mut)" />
                  </button>
                </>
              ) : (
                <>
                  <input
                    ref={originInputRef}
                    autoFocus
                    type="text"
                    value={origin}
                    onChange={(e) => {
                      setOrigin(e.target.value)
                      if (originLatLng) setOriginLatLng(null)
                    }}
                    onFocus={() => setOriginFocused(true)}
                    onBlur={() => setTimeout(() => setOriginFocused(false), 150)}
                    placeholder="Starting address"
                    autoComplete="off"
                    style={textFieldStyle}
                  />
                  <button
                    type="button"
                    aria-label="Use current location"
                    onClick={switchToCurrentLocation}
                    style={{
                      ...iconChipStyle,
                      background: 'var(--bb-soft)',
                      color: 'var(--bb-fg)',
                      width: 'auto',
                      padding: '4px 8px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 600,
                      gap: 4,
                    }}
                  >
                    <PinIcon size={11} color="var(--bb-fg)" /> GPS
                  </button>
                </>
              )}
              {!useCurrentLocation &&
                originFocused &&
                originAC.predictions.length > 0 && (
                  <PredictionDropdown
                    predictions={originAC.predictions}
                    onPick={(p) => {
                      void originAC.pick(p)
                      originInputRef.current?.blur()
                    }}
                  />
                )}
            </div>

            {/* destination */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 16px',
                position: 'relative',
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  display: 'grid',
                  placeItems: 'center',
                  background: 'var(--bb-surface)',
                  zIndex: 1,
                  flexShrink: 0,
                }}
              >
                <PinIcon size={20} color="var(--bb-fg)" />
              </div>
              <input
                ref={destInputRef}
                type="text"
                value={destination}
                onChange={(e) => {
                  setDestination(e.target.value)
                  if (destinationLatLng) setDestinationLatLng(null)
                }}
                onFocus={() => setDestFocused(true)}
                onBlur={() => setTimeout(() => setDestFocused(false), 150)}
                placeholder="Where to?"
                autoComplete="off"
                style={textFieldStyle}
              />
              {destination && (
                <button
                  type="button"
                  onClick={() => {
                    setDestination('')
                    setDestinationLatLng(null)
                  }}
                  aria-label="Clear destination"
                  style={iconChipStyle}
                >
                  <CloseIcon size={11} color="var(--bb-mut)" />
                </button>
              )}
              {destFocused && destAC.predictions.length > 0 && (
                <PredictionDropdown
                  predictions={destAC.predictions}
                  onPick={(p) => {
                    void destAC.pick(p)
                    destInputRef.current?.blur()
                  }}
                />
              )}
            </div>
          </div>

          {geoMessage && (
            <div
              style={{
                marginTop: 8,
                padding: '8px 12px',
                borderRadius: 10,
                background:
                  geoState === 'denied' || geoState === 'unavailable'
                    ? 'var(--bb-warn-bg)'
                    : 'var(--bb-soft)',
                color:
                  geoState === 'denied' || geoState === 'unavailable'
                    ? 'var(--bb-warn)'
                    : 'var(--bb-mut)',
                fontSize: 12,
                lineHeight: 1.4,
              }}
              role={geoState === 'requesting' ? 'status' : 'alert'}
            >
              {geoMessage}
            </div>
          )}

          {!placesAvailable() && (
            <div
              style={{
                marginTop: 8,
                padding: '8px 12px',
                borderRadius: 10,
                background: 'var(--bb-soft)',
                color: 'var(--bb-mut)',
                fontSize: 11,
                lineHeight: 1.4,
              }}
            >
              Autocomplete disabled — <code>VITE_GOOGLE_BROWSER_KEY</code> not set. Addresses still
              work (geocoded server-side).
            </div>
          )}

          {/* CTA */}
          <button
            type="submit"
            disabled={ctaDisabled}
            style={{
              width: '100%',
              marginTop: 12,
              padding: '15px 18px',
              borderRadius: 14,
              background: ctaDisabled ? 'var(--bb-soft)' : 'var(--bb-fg)',
              color: ctaDisabled ? 'var(--bb-mut)' : 'var(--bb-bg)',
              border: 'none',
              fontSize: 15,
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: ctaDisabled ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              letterSpacing: -0.2,
              transition: 'background 0.12s',
            }}
          >
            {geoState === 'requesting' ? 'Getting location…' : 'Plan mixed route'}
            {!ctaDisabled && <ArrowIcon size={15} color="var(--bb-bg)" />}
          </button>
        </form>

        {recents.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <Eyebrow>Recent</Eyebrow>
            <div
              style={{
                background: 'var(--bb-surface)',
                borderRadius: 14,
                border: '1px solid var(--bb-line)',
                overflow: 'hidden',
              }}
            >
              {recents.map((r, i) => (
                <button
                  key={`${r.origin}|${r.destination}|${r.at}`}
                  type="button"
                  onClick={() =>
                    plan({
                      originText: r.origin,
                      originLatLng: r.originLatLng ?? null,
                      destinationText: r.destination,
                      destinationLatLng: r.destinationLatLng ?? null,
                    })
                  }
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 14px',
                    borderBottom:
                      i < recents.length - 1 ? '1px solid var(--bb-line)' : 'none',
                    cursor: 'pointer',
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--bb-fg)',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: 'var(--bb-soft)',
                      display: 'grid',
                      placeItems: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <PinIcon size={14} color="var(--bb-fg)" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {r.destination}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--bb-mut)',
                        marginTop: 2,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      from {r.origin}
                    </div>
                  </div>
                  <ChevIcon size={14} color="var(--bb-mut)" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <InstallHint />
    </main>
  )
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        color: 'var(--bb-mut)',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        fontWeight: 600,
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  )
}

function IconButton({
  children,
  onClick,
  ariaLabel,
  active,
}: {
  children: React.ReactNode
  onClick: () => void
  ariaLabel: string
  active?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={active}
      onClick={onClick}
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        border: 'none',
        background: active ? 'var(--bb-soft)' : 'transparent',
        color: 'var(--bb-mut)',
        display: 'grid',
        placeItems: 'center',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function PredictionDropdown({
  predictions,
  onPick,
}: {
  predictions: Prediction[]
  onPick: (p: Prediction) => void
}) {
  return (
    <div
      role="listbox"
      style={{
        position: 'absolute',
        top: '100%',
        left: 12,
        right: 12,
        marginTop: 6,
        background: 'var(--bb-surface)',
        border: '1px solid var(--bb-line)',
        borderRadius: 12,
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.12)',
        zIndex: 20,
        overflow: 'hidden',
      }}
    >
      {predictions.slice(0, 5).map((p, i) => (
        <button
          key={`${p.placeId ?? 'noid'}-${i}`}
          type="button"
          role="option"
          // Use onMouseDown so the pick fires before the input's blur (which hides the list).
          onMouseDown={(e) => {
            e.preventDefault()
            onPick(p)
          }}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            padding: '10px 14px',
            background: 'transparent',
            border: 'none',
            borderTop: i === 0 ? 'none' : '1px solid var(--bb-line)',
            color: 'var(--bb-fg)',
            fontFamily: 'inherit',
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          <div style={{ fontWeight: 500, fontSize: 14, lineHeight: 1.25 }}>{p.mainText}</div>
          {p.secondaryText && (
            <div style={{ color: 'var(--bb-mut)', fontSize: 12, marginTop: 2 }}>
              {p.secondaryText}
            </div>
          )}
        </button>
      ))}
    </div>
  )
}

const textFieldStyle: React.CSSProperties = {
  flex: 1,
  border: 'none',
  outline: 'none',
  background: 'transparent',
  fontSize: 15,
  fontWeight: 500,
  color: 'var(--bb-fg)',
  padding: 0,
  fontFamily: 'inherit',
  minWidth: 0,
}

const iconChipStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 999,
  border: 'none',
  background: 'var(--bb-soft)',
  color: 'var(--bb-mut)',
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
  padding: 0,
  flexShrink: 0,
}
