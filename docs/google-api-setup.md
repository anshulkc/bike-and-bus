# Google Cloud API key setup

Step-by-step guide for the two API keys we need: a **server key** for Cloudflare Pages Functions (Routes API) and a **browser key** for Places Autocomplete on the client.

## One-time: create a Google Cloud project

1. Go to https://console.cloud.google.com — sign in with your Google account.
2. At the top, click the project picker → **New Project**.
3. Name it `bike-and-bus` (or anything). Click **Create**.
4. Select the new project from the project picker.

## Enable the APIs we need

In the left nav, **APIs & Services → Library**. Search for and enable each of these:

- **Routes API** (for the server-side routing query)
- **Places API (New)** (for the client-side autocomplete in Task #6)
- **Geocoding API** (used by Routes API when we pass address strings)

> A billing account is required even for the free tier. Cloud → Billing → link a credit card. You won't be charged at personal scale — see pricing note below.

## Pricing (confirmed for this app's usage, as of April 2026)

Our calls use `travelMode: TRANSIT` and `travelMode: BICYCLE` with **no traffic modifiers** (no `TRAFFIC_AWARE` or `TRAFFIC_AWARE_OPTIMAL`), so they hit the **Routes API Essentials** SKU. Essentials gets **10,000 free calls per month**. After that it's $2–$7 per 1,000 depending on the specific SKU.

Our per-trip budget is ~10 API calls (1 transit alternatives + up to 6 bike leg re-queries + occasional earlier-departure re-queries), so the free tier comfortably covers **1,000+ trip lookups/month**. You will not hit the limit from personal use.

The daily quota cap below is still worth setting — it's a blast-radius safety net for a leaked key, not an everyday cost control.

## Create the server key (Routes API)

1. **APIs & Services → Credentials → Create Credentials → API key**.
2. It creates a key. **Click the key name to edit it.**
3. Rename it to `bike-and-bus server`.
4. Under **Application restrictions**, leave `None` for now. (We'll IP-restrict later once we have Cloudflare's egress IPs; Cloudflare Workers don't have stable IPs so this is tricky — we rely on the **API restrictions** below plus a **daily quota cap** instead.)
5. Under **API restrictions**, choose **Restrict key** and select only: **Routes API**.
6. **Save**.
7. Copy the key value — you'll paste it into a wrangler secret below.

## Cap the daily quota (leak-defense safety net)

In **APIs & Services → Routes API → Quotas & System Limits**:

- Find **Compute Routes requests per day**.
- Click the edit (pencil) icon → set to **9,900** (just under the 10,000/month Essentials free-tier ceiling).
- This is a blast-radius control, not cost control. In normal personal use you'll use well under 200/day.
- If the key ever leaks, a day of abuse is bounded before you'd rotate. Check your deployments/billing every few days so you'd catch anything unusual quickly.

## Billing alert (get emailed the moment anything costs money)

In **Billing → Budgets & alerts → Create budget**:

- Budget name: `bike-and-bus alert`
- Amount: `$1` (any real charge at all)
- Alert thresholds: 50%, 90%, 100% (defaults are fine)
- **Notification email:** `anshulkchennavaram@gmail.com` (the Gmail — *not* the Cloudflare login address)
- Save

If the KV rate limiter, the Google daily cap, or both ever fail to hold, this gets you an email before the damage is real.

## Create the browser key (Places Autocomplete)

1. **Credentials → Create Credentials → API key** again.
2. Rename to `bike-and-bus browser`.
3. **Application restrictions → HTTP referrers** and add:
   - `https://bike-and-bus.pages.dev/*`
   - `https://*.bike-and-bus.pages.dev/*` (covers preview URLs)
   - `http://localhost:5173/*` (local dev)
   - `http://localhost:8788/*` (wrangler preview)
4. **API restrictions → Restrict key**: enable **Places API (New)** and **Maps JavaScript API**.
5. **Save**. Copy the key value.

## Store the server key as a Cloudflare secret

From the project directory:

```
npx wrangler pages secret put GOOGLE_SERVER_KEY --project-name=bike-and-bus
```

It prompts you to paste the value. The secret is encrypted and only available to the Function at runtime.

You do **not** need to set this locally unless you want `npm run preview` to hit the real API; without it, the Function falls back to a mock response. For local real-API testing, create a `.dev.vars` file (gitignored already):

```
GOOGLE_SERVER_KEY=paste-the-server-key-here
```

## Store the browser key in the frontend env

Create `.env.local` (gitignored):

```
VITE_GOOGLE_BROWSER_KEY=paste-the-browser-key-here
```

This ships in the built bundle — that's OK because it's HTTP-referrer-restricted.

## Verify it works

After the server key is set:

```
npm run build
npx wrangler pages deploy dist --project-name=bike-and-bus --branch=main --commit-dirty=false
```

Visit your production URL, enter origin + destination, submit. You should see real routes (with real transit times and stop names). If you still see the hardcoded mock data, the key isn't being picked up — check Cloudflare dashboard → Workers & Pages → bike-and-bus → Settings → Environment variables.

## Rate limiting (already wired up)

The Function also enforces two soft rate limits backed by Cloudflare KV:

- **Monthly total: 9,900 Google calls** — once tripped, the Function returns `upstream_quota` with "Routing quota exhausted for this month. Resets on the 1st." to every caller until the month key rolls over.
- **Per-IP daily: 200 Google calls** (~20 trip lookups) — prevents a single user from burning the whole monthly tier. Message: "You've hit today's lookup limit. Try again tomorrow."

Defaults are in `functions/api/routes.ts` (`MONTHLY_BUDGET`, `DAILY_PER_IP_BUDGET`). Adjust in code if needed.

The KV namespace binding is declared in `wrangler.toml` as `RATE_LIMIT`. When deploying, Cloudflare binds it automatically. If the binding is missing (e.g., local dev without KV setup), the limiter no-ops and the Function serves mocks or calls Google directly — fine for a dev environment.

## Rotating a key

If a key ever leaks:
1. Cloud Console → APIs & Services → Credentials → click the key → **Regenerate key**.
2. Paste the new value via `wrangler pages secret put GOOGLE_SERVER_KEY` (overwrites).
3. Redeploy. Old key is dead.
