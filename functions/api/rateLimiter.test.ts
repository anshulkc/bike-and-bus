import { beforeEach, describe, expect, it } from 'vitest'
import { checkRateLimit, ipDayKey, monthKey, recordUsage } from './rateLimiter'

// Minimal KVNamespace mock sufficient for the limiter's usage.
class FakeKV {
  store = new Map<string, string>()

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null
  }

  async put(key: string, value: string, _opts?: { expirationTtl?: number }): Promise<void> {
    this.store.set(key, value)
  }
}

const IP = '1.2.3.4'
const APRIL_20 = new Date(Date.UTC(2026, 3, 20, 17, 0, 0)) // month index 3 = April

describe('key naming', () => {
  it('formats month keys as month:YYYY-MM', () => {
    expect(monthKey(APRIL_20)).toBe('month:2026-04')
    // January still pads
    expect(monthKey(new Date(Date.UTC(2026, 0, 1)))).toBe('month:2026-01')
  })

  it('formats ip-day keys as ip:YYYY-MM-DD:<ip>', () => {
    expect(ipDayKey(APRIL_20, IP)).toBe('ip:2026-04-20:1.2.3.4')
  })
})

describe('checkRateLimit', () => {
  let kv: FakeKV
  beforeEach(() => {
    kv = new FakeKV()
  })

  it('allows when both counters are empty', async () => {
    const decision = await checkRateLimit({
      kv: kv as unknown as KVNamespace,
      ip: IP,
      now: APRIL_20,
      monthlyBudget: 9900,
      dailyPerIpBudget: 200,
      costToDeduct: 10,
    })
    expect(decision.allowed).toBe(true)
    if (decision.allowed) {
      expect(decision.monthRemaining).toBe(9890)
      expect(decision.dayRemaining).toBe(190)
    }
  })

  it('rejects when monthly budget would be exceeded', async () => {
    kv.store.set('month:2026-04', '9895')
    const decision = await checkRateLimit({
      kv: kv as unknown as KVNamespace,
      ip: IP,
      now: APRIL_20,
      monthlyBudget: 9900,
      dailyPerIpBudget: 200,
      costToDeduct: 10,
    })
    expect(decision).toEqual({ allowed: false, reason: 'monthly_exhausted' })
  })

  it('rejects when per-IP daily budget would be exceeded', async () => {
    kv.store.set('ip:2026-04-20:1.2.3.4', '195')
    const decision = await checkRateLimit({
      kv: kv as unknown as KVNamespace,
      ip: IP,
      now: APRIL_20,
      monthlyBudget: 9900,
      dailyPerIpBudget: 200,
      costToDeduct: 10,
    })
    expect(decision).toEqual({ allowed: false, reason: 'ip_daily_exhausted' })
  })

  it('allows exactly at the budget boundary', async () => {
    kv.store.set('month:2026-04', '9890')
    kv.store.set('ip:2026-04-20:1.2.3.4', '190')
    const decision = await checkRateLimit({
      kv: kv as unknown as KVNamespace,
      ip: IP,
      now: APRIL_20,
      monthlyBudget: 9900,
      dailyPerIpBudget: 200,
      costToDeduct: 10,
    })
    expect(decision.allowed).toBe(true)
  })

  it('treats a missing or garbage counter as 0', async () => {
    kv.store.set('month:2026-04', 'not-a-number')
    const decision = await checkRateLimit({
      kv: kv as unknown as KVNamespace,
      ip: IP,
      now: APRIL_20,
      monthlyBudget: 9900,
      dailyPerIpBudget: 200,
      costToDeduct: 10,
    })
    expect(decision.allowed).toBe(true)
  })
})

describe('recordUsage', () => {
  it('increments both counters by the number of Google calls', async () => {
    const kv = new FakeKV()
    kv.store.set('month:2026-04', '100')
    kv.store.set('ip:2026-04-20:1.2.3.4', '20')

    await recordUsage({
      kv: kv as unknown as KVNamespace,
      ip: IP,
      now: APRIL_20,
      calls: 7,
    })

    expect(kv.store.get('month:2026-04')).toBe('107')
    expect(kv.store.get('ip:2026-04-20:1.2.3.4')).toBe('27')
  })

  it('is a no-op when calls is 0 or negative', async () => {
    const kv = new FakeKV()
    await recordUsage({
      kv: kv as unknown as KVNamespace,
      ip: IP,
      now: APRIL_20,
      calls: 0,
    })
    expect(kv.store.size).toBe(0)
  })
})
