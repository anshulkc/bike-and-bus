# Bike + Bus PWA — Design

**Date:** 2026-04-19
**Status:** Validated through brainstorming; ready for implementation.

## Problem

Google Maps renders walk+transit routes natively but does not produce an optimal bike+transit ("mixed") route in most US cities. Users currently do the optimization manually: they look at walk+bus directions, mentally substitute biking for the walking legs, and guess at whether the timing still works. The goal is to automate that substitution and surface the fastest bike+transit option for any given trip, without the user having to install a new native app.

## Target user & scope

Personal-use first (the author commuting in a US city), with a UX nice enough to share. Not a generic routing engine — this is a focused tool that answers one question: *given an origin and destination, what's the best bike+transit combo?*

## Solution shape

A Progressive Web App (PWA), installable to the iOS/Android home screen. The user enters origin and destination; the PWA queries Google's Routes API for transit routes, swaps walk legs for bike legs where it saves meaningful time, and presents ranked route options with per-leg deep links into the Google Maps app for turn-by-turn navigation.

## Architecture

### Hosting

**Cloudflare Pages + Pages Functions.** Selected over Vercel because of the confirmed April 2026 Vercel security incident in which environment variables, API keys, and GitHub/npm tokens for customer deployments were exfiltrated. Storing a billing-enabled Google API key in Vercel env vars is an unacceptable blast radius for a side project right now. Cloudflare Pages has no known comparable incident, the free tier is generous, and Pages Functions (Workers under the hood) handle the server-side API proxy cleanly.

### Stack

- **Frontend:** Vite + React + TypeScript. Chose Vite over Next.js to avoid the `@cloudflare/next-on-pages` adapter and its edge-runtime quirks. Small PWA; adapter overhead is not worth it.
- **Styling:** Tailwind CSS, mobile-first.
- **Routing:** React Router. Trip state (origin, destination, sortBy, bikeAtDestination) is encoded in URL search params so routes are shareable.
- **Maps/Places UI:** `@googlemaps/js-api-loader` with Places Autocomplete, using a browser-side key restricted by HTTP referrer. Session tokens on autocomplete to keep Places cost low.
- **Server routes:** Cloudflare Pages Functions in `/functions/api/*.ts`. Single endpoint `/api/routes` proxies Google's Routes API v2.
- **State:** React `useState` + URL search params. No Redux/Zustand.
- **PWA:** `vite-plugin-pwa` (Workbox) for manifest + service worker.

### API keys (two distinct keys, both scoped)

1. **Server key** — Routes API only. Stored as a Cloudflare secret (`wrangler secret put GOOGLE_SERVER_KEY`). Daily quota cap of $10/day on the key itself as a blast-radius control. Rotated on each major deploy.
2. **Browser key** — Maps JS + Places Autocomplete only. HTTP-referrer-restricted to the deployment domain. Safe to expose in the built bundle.

### Rate limiting

Cloudflare Rate Limiting Rule at the Pages project level, capped at 20 requests/min/IP for `/api/routes`. If needed later, swap to a KV-backed token bucket. Not worth building in v1.

## Algorithm

### Overall flow

1. Client POSTs `{ origin, destination, sortBy, bikeAtDestination }` to `/api/routes`.
2. Function rate-limits, then calls Google Routes API with `travelMode: TRANSIT` and `computeAlternativeRoutes: true`. Returns up to 3 candidate routes.
3. For each candidate, apply the walk→bike swap rule to each walk leg.
4. Optionally re-query transit with an earlier `departureTime` if the bike swap shaves enough time to catch an earlier bus (v1 "5b" enhancement — see build order).
5. Drop candidates with bike legs > 20 min or > 4 mi (absurd bike times undermine the mixed-mode value).
6. Sort the remaining candidates by the user's `sortBy` and return.

### Walk → Bike swap rule (per leg, symmetric on head and tail)

```
WALK_THRESHOLD = 180   # seconds
BIKE_OVERHEAD  = 90    # seconds, per swapped leg

for each walkLeg in candidate.legs:
  if walkLeg.duration < WALK_THRESHOLD:
    keep as walk   # overhead of mounting/dismounting not worth it
    continue

  bikeDuration = queryBikeDuration(walkLeg.start, walkLeg.end)

  if bikeDuration + BIKE_OVERHEAD < walkLeg.duration:
    substitute bike
  else:
    keep walk
```

- The trailing walk leg is only considered for swap when `bikeAtDestination = true` (default off). Most users don't have a bike at the destination.
- Mid-route transfer walks (between transit lines) are skipped — they're typically sub-3-min and don't benefit from biking.

### Earlier-departure re-query (step 5b)

If the bike swap on the head leg gets the user to the boarding stop earlier than the original walk would have, there may be an earlier departure available. When this condition is detected, the function re-queries the Routes API with `travelMode: TRANSIT` from the boarding stop to the destination with `departureTime = bikeArrivalTime`. If an earlier bus catches, it replaces the original transit leg and the total duration recomputes.

This is the most bug-prone part of the algorithm and gets a dedicated Vitest suite covering:
- Timezone handling (ensure `departureTime` is serialized as RFC 3339 UTC)
- Off-by-one around the boundary: biking barely misses the next bus → should fall back to the original departure, not infinite-loop or crash
- The "no earlier bus available" case → keep original timing

### Sorting

- `fastest` — min total duration (default)
- `fewestTransfers` — min transfer count, tiebreak on total duration
- `leastBiking` — min total biking duration, tiebreak on total duration

(We originally considered `mostBiking`, but that collapses to "just bike the entire trip," which defeats the point of a mixed-mode tool.)

### API call budget per user query

- 1 TRANSIT request (alternatives=true)
- Up to 2 BICYCLE requests per candidate × 3 candidates = ~6 bike requests
- 0–3 re-query TRANSIT requests (only when earlier departure triggers)
- **Total: ~7–10 calls per query**

At Routes API's public pricing this is well under one cent per query. With the $10/day quota cap, the worst-case daily cost is bounded regardless of traffic.

## Response shape

```ts
type LegType = 'bike' | 'transit' | 'walk'

interface Leg {
  type: LegType
  fromName: string
  toName: string
  minutes: number
  googleMapsUrl: string          // deep link for this leg only
  // transit-only fields:
  line?: string                  // "Red Line"
  departAt?: string              // ISO timestamp
  arriveAt?: string
}

interface Route {
  totalMinutes: number
  savedVsWalking: number         // total - walk+transit baseline
  transferCount: number
  bikingMinutes: number
  legs: Leg[]                    // may start/end with any type
}

interface RoutesResponse {
  routes: Route[]                // sorted per user's sortBy
  baselineWalkTransitMinutes: number
}
```

Every walk leg Google returned is preserved in the response, even short ones (< 3 min). This is intentional: it's more transparent ("walk 1 min from the stop to your destination") and avoids the algorithm silently absorbing steps into adjacent legs.

## Deep links

Per-leg "Open in Google Maps" buttons use the universal `google.com/maps/dir/?api=1&...&travelmode=...` URL format. On mobile, these open the installed Google Maps app directly into turn-by-turn navigation; on desktop, they open the web version. Deep-link correctness is validated on real iOS and Android devices during step 3.5 of the build order, before the UI is built around them, because `travelmode=bicycling` / `dirflg=b` have known cross-platform quirks.

## UI

### Home view (`/`)

Origin input (defaults to a "📍 Current location" chip backed by `navigator.geolocation`, tappable to replace with typed address) + destination input (Places Autocomplete) + "Find routes" button. A "Bike at destination?" toggle sits below, defaulting to off.

### Results view (`/results?from=...&to=...&sortBy=...&bikeAtDest=...`)

Sort selector at top (Fastest / Fewest transfers / Least biking). Below, a list of route cards. Each card collapsed shows total minutes, minutes saved vs walking, an icon strip of headline legs (bike + transit line + transfers indicator), and transfer count. Tapping a card expands it in place into the detail view.

### Route detail (expanded card)

Each leg gets a row: mode icon, duration, from/to names, scheduled times (for transit), and an "Open in Google Maps" button. No map rendered inline — this is a planner, not a navigator; navigation happens in Google Maps after deep-link handoff.

### UI rules

- Mobile-first; min 44px tap targets.
- Single accent color for primary actions.
- High contrast (readable in sunlight).
- Skeleton loading state during fetch.
- Distinct error states for geolocation-denied, no-routes-found, and rate-limited.

## Repo layout

```
puebla/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── routes/
│   │   ├── Home.tsx
│   │   └── Results.tsx
│   ├── components/
│   │   ├── PlaceAutocomplete.tsx
│   │   ├── CurrentLocationChip.tsx
│   │   ├── RouteCard.tsx
│   │   ├── LegRow.tsx
│   │   └── SortSelector.tsx
│   ├── lib/
│   │   ├── algorithm.ts          # pure swap logic; runtime-agnostic
│   │   ├── mapsClient.ts         # browser Google JS loader
│   │   ├── api.ts                # POST /api/routes helper
│   │   ├── deepLinks.ts          # buildMapsUrl(leg)
│   │   └── types.ts              # shared Route/Leg types
│   └── index.css
├── functions/
│   └── api/
│       └── routes.ts             # Pages Function: Routes API proxy
├── public/
│   ├── manifest.webmanifest
│   └── icons/                    # 192, 512, maskable
├── wrangler.toml
├── vite.config.ts                # + vite-plugin-pwa
├── tailwind.config.ts
├── package.json
├── tsconfig.json
└── .env.example                  # VITE_GOOGLE_BROWSER_KEY
```

`src/lib/algorithm.ts` is deliberately pure: it takes a Google Routes API response plus an injected `fetchBike(leg) => Promise<number>` callback and returns enriched routes. Zero Cloudflare Workers globals, zero Vite dependencies. This makes Vitest unit tests trivial and lets the algorithm be exercised independently of the Cloudflare runtime.

## Build order

1. **Scaffold.** Vite + React + TS + Tailwind + React Router. Empty Home and Results pages. Verify a clean Cloudflare Pages deploy.
2. **Stub Pages Function.** `/api/routes` returns a hardcoded mock response. Wire `lib/api.ts`. Confirm end-to-end browser → Function → browser roundtrip.
3. **Routes API integration (happy path).** Real Routes API call in TRANSIT mode. Parse into `Route[]`. Home form posts origin/destination; Results shows raw transit options. No bike swap yet.
3.5. **Deep-link validation.** Build `lib/deepLinks.ts` and test `travelmode=bicycling`, `travelmode=transit`, `travelmode=walking` URL schemes on real iPhone and Android before the UI depends on them. Document any quirks.
4. **Places Autocomplete + current location chip.** Destination uses Places Autocomplete with session tokens. Origin defaults to a "current location" chip backed by `navigator.geolocation`, replaceable with a typed address via the same autocomplete component.
5a. **Bike swap algorithm (no re-query).** `lib/algorithm.ts` implements the head + tail walk→bike swap with `WALK_THRESHOLD` and `BIKE_OVERHEAD`. Vitest coverage for the swap rule.
5b. **Earlier-departure re-query.** Layered on top of 5a. Added as a distinct step because the async re-query materially increases complexity. Vitest suite covering timezone edges, barely-missed-bus fallback, and no-earlier-bus cases.
6. **Sort/filter UI.** Fastest / Fewest transfers / Least biking selector. "Bike at destination" toggle gating the tail-leg swap.
7. **Route detail expansion + deep-link buttons in UI.** Wire `deepLinks.ts` results into `LegRow.tsx`.
8. **Polish.** Skeleton loaders, error states, empty states.
9. **PWA.** `vite-plugin-pwa` manifest + service worker. Icon set. Verify "Add to Home Screen" on iOS + Android.
10. **Rate limiting + quota cap.** Cloudflare Rate Limiting Rule at 20 req/min/IP. Set Google Routes API key daily quota to $10 in Google Cloud Console.

## Testing

- **Vitest** on pure functions: the bike swap algorithm, deep link builder, sort comparators. Explicit test cases for:
  - Head-leg swap saving ≥ `BIKE_OVERHEAD`
  - Head-leg swap *not* saving enough → stays as walk
  - Tail-leg swap skipped when `bikeAtDestination = false`
  - Earlier-departure re-query: timezone correctness, barely-missed-bus fallback, no-earlier-bus case
  - Walk leg below `WALK_THRESHOLD` → never queries bike
- **Playwright** (one smoke test): Home → fill form → Results renders → deep-link URL for first bike leg is well-formed.
- No integration tests against live Google APIs for v1.

## Out of scope for v1

- Saved home/work favorites
- Bike-lane density scoring (no clean Google data source)
- User accounts or trip history
- Real-time arrival push notifications
- Offline caching of recent routes
- Last-mile bike leg without the `bikeAtDestination` toggle
- Mid-route transfer-walk bike swaps

## Open risks

- **Google Maps URL-scheme drift.** Google has historically tweaked the behavior of `dirflg` / `travelmode` params. Deep-link validation is scheduled early (step 3.5) to catch this before it causes rework.
- **Routes API rate-limit surprises.** Free-tier quota is generous but not unlimited. The $10/day key-level cap is the last line of defense; rate limiting at Cloudflare is the first.
- **Geolocation UX on iOS Safari.** Safari requires a user gesture for geolocation and refuses on non-HTTPS origins. The "current location" chip only activates after an explicit tap to make this reliable.
