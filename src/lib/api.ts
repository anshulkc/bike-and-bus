import type { ApiError, RoutesRequest, RoutesResponse } from './types'

export class RoutesApiError extends Error {
  constructor(
    public readonly code: ApiError['error'],
    message: string,
  ) {
    super(message)
    this.name = 'RoutesApiError'
  }
}

export async function fetchRoutes(req: RoutesRequest): Promise<RoutesResponse> {
  let res: Response
  try {
    res = await fetch('/api/routes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
  } catch (_e) {
    throw new RoutesApiError('server_error', 'Network request failed')
  }

  if (!res.ok) {
    let body: Partial<ApiError> = {}
    try {
      body = (await res.json()) as Partial<ApiError>
    } catch {
      // no json body
    }
    const code: ApiError['error'] =
      body.error ?? (res.status === 429 ? 'rate_limited' : 'server_error')
    const message = body.message ?? `Request failed (${res.status})`
    throw new RoutesApiError(code, message)
  }

  return (await res.json()) as RoutesResponse
}
