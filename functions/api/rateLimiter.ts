// KV-backed soft rate limiter. Two counters:
//   - Monthly total across all callers (caps aggregate Google spend).
//   - Daily per-IP (caps single-user abuse).
//
// KV is eventually consistent (~60s worst case), so concurrent bursts can
// overshoot by a handful of calls. Acceptable at personal-side-project scale.

export interface RateLimitArgs {
  kv: KVNamespace
  ip: string
  now: Date
  monthlyBudget: number
  dailyPerIpBudget: number
  costToDeduct: number
}

export type RateLimitDecision =
  | { allowed: true; monthRemaining: number; dayRemaining: number }
  | { allowed: false; reason: 'monthly_exhausted' | 'ip_daily_exhausted' }

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function monthKey(d: Date): string {
  return `month:${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`
}

export function ipDayKey(d: Date, ip: string): string {
  const date = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
  return `ip:${date}:${ip}`
}

async function readCount(kv: KVNamespace, key: string): Promise<number> {
  const raw = await kv.get(key)
  if (!raw) return 0
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

export async function checkRateLimit(args: RateLimitArgs): Promise<RateLimitDecision> {
  const { kv, ip, now, monthlyBudget, dailyPerIpBudget, costToDeduct } = args
  const mKey = monthKey(now)
  const iKey = ipDayKey(now, ip)

  const [monthCount, ipCount] = await Promise.all([readCount(kv, mKey), readCount(kv, iKey)])

  if (monthCount + costToDeduct > monthlyBudget) {
    return { allowed: false, reason: 'monthly_exhausted' }
  }
  if (ipCount + costToDeduct > dailyPerIpBudget) {
    return { allowed: false, reason: 'ip_daily_exhausted' }
  }
  return {
    allowed: true,
    monthRemaining: monthlyBudget - monthCount - costToDeduct,
    dayRemaining: dailyPerIpBudget - ipCount - costToDeduct,
  }
}

// Increment counters after actual Google calls. Called once per request with
// the true number of upstream calls made. Safe to call when calls = 0 (no-op).
export async function recordUsage(args: {
  kv: KVNamespace
  ip: string
  now: Date
  calls: number
}): Promise<void> {
  if (args.calls <= 0) return
  const { kv, ip, now, calls } = args
  const mKey = monthKey(now)
  const iKey = ipDayKey(now, ip)

  // Read-modify-write. Non-atomic; see file header.
  const [monthCount, ipCount] = await Promise.all([readCount(kv, mKey), readCount(kv, iKey)])

  await Promise.all([
    kv.put(mKey, String(monthCount + calls)),
    // Per-IP key auto-expires ~25h after writing; old keys disappear.
    kv.put(iKey, String(ipCount + calls), { expirationTtl: 60 * 60 * 25 }),
  ])
}

// Anonymous fallback when Cloudflare doesn't give us the caller IP
// (shouldn't happen in production, but defensive).
export const UNKNOWN_IP = 'unknown'

export function getClientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? UNKNOWN_IP
}
