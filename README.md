# Bike and Bus

**LA has buses. LA has bike lanes. Google Maps won't combine them. [This does.](https://bike-and-bus.pages.dev/)**

Bike and Bus is a mixed-mode route planner that combines biking (or scootering) with public transit. Enter an origin and destination, and it finds hybrid routes — replacing the walking portions of transit trips with bike legs when biking is faster. The result: real routes that are often significantly quicker than what Google Maps suggests.

<p align="center">
<img width="354" alt="Home screen with recent trips" src="https://github.com/user-attachments/assets/d0388ce3-8a6e-4107-b66e-75240d71a082" />
</p>



## How it works

1. You enter an origin and destination (or use GPS for your current location)
2. The app fetches a pure bike route and transit routes from the Google Routes API
3. For each transit route, it checks whether the first or last walking leg would be faster by bike
4. If biking wins (accounting for ~60s of unlock/lock overhead), it swaps that leg
5. Routes are ranked by total time, and each leg links to Google Maps for turn-by-turn navigation

<p align="center">
  <img width="481" alt="Detailed route view with timeline" src="https://github.com/user-attachments/assets/6efa9eaf-7807-40fb-a042-6f4674b415c9" />
  &nbsp;&nbsp;
<img width="360" alt="Route results showing bike + bus combinations" src="https://github.com/user-attachments/assets/28aee852-d50a-482a-813d-c6a3524d5858" />
</p>
  

## Features

- **Smart bike-swap algorithm** — only swaps walking legs when biking actually saves time
- **Configurable max bike distance** — set your comfort threshold (0.25–50 miles)
- **Sort by** fastest, fewest transfers, or least biking
- **GPS geolocation** — one tap for your current location
- **Recent trips** — quickly re-run your last few searches
- **Installable PWA** — add to home screen, works offline
- **Dark mode** — toggle between light and dark themes
- **Deep links** — every leg opens in Google Maps for navigation

## Tech stack

- **Frontend:** React 19, TypeScript, Tailwind CSS 4, Vite
- **Backend:** Cloudflare Pages Functions (Workers)
- **APIs:** Google Routes API v2, Google Places API
- **Rate limiting:** Cloudflare KV (daily per-IP + monthly budget)

## Development

```bash
npm install
npm run dev        # starts Vite (5173) + Wrangler (8788)
npm run test       # run unit tests
npm run build      # type-check + production build
```

Requires two environment variables:

| Variable | Scope | Purpose |
|----------|-------|---------|
| `VITE_GOOGLE_BROWSER_KEY` | Client | Places autocomplete |
| `GOOGLE_SERVER_KEY` | Server | Google Routes API |
