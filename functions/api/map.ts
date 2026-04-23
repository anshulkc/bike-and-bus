interface Env {
  GOOGLE_SERVER_KEY?: string
}

type EmbedMode = 'bicycling' | 'transit' | 'walking'

const ALLOWED_MODES: readonly EmbedMode[] = ['bicycling', 'transit', 'walking']

function badRequest(message: string): Response {
  return new Response(message, { status: 400, headers: { 'Content-Type': 'text/plain' } })
}

// Endpoint whose only job is to rewrite a client request for "show this route"
// into a Google Maps Embed API URL with our server key. The browser follows
// the 302 and renders the map inside its iframe — the key is never shipped to
// the client. Params pass through as-is; origin/destination can be addresses
// or "lat,lng" pairs.
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url)
  const origin = url.searchParams.get('origin')
  const destination = url.searchParams.get('destination')
  const modeParam = url.searchParams.get('mode') as EmbedMode | null
  const waypoints = url.searchParams.get('waypoints')

  if (!origin || !destination) {
    return badRequest('origin and destination are required')
  }
  if (!modeParam || !ALLOWED_MODES.includes(modeParam)) {
    return badRequest(`mode must be one of ${ALLOWED_MODES.join(', ')}`)
  }

  const key = env.GOOGLE_SERVER_KEY
  if (!key) {
    // Local/preview without a key — return a 1×1 transparent svg so the iframe
    // shows nothing instead of a loud error.
    return new Response(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
      { status: 200, headers: { 'Content-Type': 'image/svg+xml' } },
    )
  }

  const target = new URL('https://www.google.com/maps/embed/v1/directions')
  target.searchParams.set('key', key)
  target.searchParams.set('origin', origin)
  target.searchParams.set('destination', destination)
  target.searchParams.set('mode', modeParam)
  if (waypoints) target.searchParams.set('waypoints', waypoints)

  return Response.redirect(target.toString(), 302)
}
