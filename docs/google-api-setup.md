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

> A billing account is required for Routes API even with the free tier. Cloud → Billing → link a credit card. You get **$200/month free credit** which is more than enough for personal use.

## Create the server key (Routes API)

1. **APIs & Services → Credentials → Create Credentials → API key**.
2. It creates a key. **Click the key name to edit it.**
3. Rename it to `bike-and-bus server`.
4. Under **Application restrictions**, leave `None` for now. (We'll IP-restrict later once we have Cloudflare's egress IPs; Cloudflare Workers don't have stable IPs so this is tricky — we rely on the **API restrictions** below plus a **daily quota cap** instead.)
5. Under **API restrictions**, choose **Restrict key** and select only: **Routes API**.
6. **Save**.
7. Copy the key value — you'll paste it into a wrangler secret below.

## Cap the daily quota (important!)

In **APIs & Services → Routes API → Quotas & System Limits**:

- Find **Compute Routes requests per day**.
- Click the edit (pencil) icon → set to **200** (or whatever you're comfortable with).
- At $5 per 1000 requests, 200/day = $1/day worst case. Prevents a leaked or misused key from running up a bill.

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

## Rotating a key

If a key ever leaks:
1. Cloud Console → APIs & Services → Credentials → click the key → **Regenerate key**.
2. Paste the new value via `wrangler pages secret put GOOGLE_SERVER_KEY` (overwrites).
3. Redeploy. Old key is dead.
