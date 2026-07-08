import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function jsonResponse(data: unknown) {
  return {
    ok: true, status: 200,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data)),
    headers: new Map(),
  } as unknown as Response
}

function dcResponse(data: Record<string, unknown>[] = []) {
  return jsonResponse({ result: { data, count: data.length } })
}

// ═══════════════════════════════════════════════════════════════
// AkshareHandler — AMAC methods
// ═══════════════════════════════════════════════════════════════

describe('AkshareHandler — AMAC private fund APIs', () => {
  let handler: Awaited<typeof import('../src/providers/akshare/markets/cn/handler')>['AkshareHandler']

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('../src/providers/akshare/markets/cn/handler')
    handler = new mod.AkshareHandler()
  })

  function amacResponse(data: unknown[]) {
    return jsonResponse({ datas: data })
  }

  describe('amacMemberInfo', () => {
    it('returns member info', async () => {
      mockFetch.mockResolvedValueOnce(amacResponse([{ name: '华夏基金', type: '普通会员' }]))
      const result = await handler.amacMemberInfo()
      expect(result).toHaveLength(1)
    })
  })

  describe('amacManagerInfo', () => {
    it('returns manager info', async () => {
      mockFetch.mockResolvedValueOnce(amacResponse([{ name: '重阳投资' }]))
      const result = await handler.amacManagerInfo()
      expect(result).toHaveLength(1)
    })
  })

  describe('amacFundInfo', () => {
    it('returns fund info with pagination', async () => {
      mockFetch.mockResolvedValueOnce(amacResponse([{ fundName: '测试基金' }]))
      const result = await handler.amacFundInfo('1', '1')
      expect(result).toHaveLength(1)
    })
  })

  describe('Error handling', () => {
    it('returns null on error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 400, json: () => Promise.resolve({}), text: () => Promise.resolve(''), headers: new Map() })
      const results = await Promise.all([
        handler.amacMemberInfo(),
        handler.amacManagerInfo(),
        handler.amacFundInfo('1', '1'),
      ])
      for (const r of results) {
        expect(r).toBeNull()
      }
    })
  })
})

// ═══════════════════════════════════════════════════════════════
// Currency APIs (currencyscoop)
// ═══════════════════════════════════════════════════════════════

describe('Currency APIs (currencyscoop)', () => {
  let handler: Awaited<typeof import('../src/providers/akshare/markets/cn/handler')>['AkshareHandler']

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('../src/providers/akshare/markets/cn/handler')
    handler = new mod.AkshareHandler()
  })

  describe('currencyLatest', () => {
    it('returns latest rates as rows', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        response: { date: '2023-07-24', rates: { ADA: 3.21, AED: 3.67 } },
      }))
      const result = await handler.currencyLatest('USD', '')
      expect(result).toHaveLength(2)
      expect(result![0]).toHaveProperty('currency', 'ADA')
      expect(result![0]).toHaveProperty('date', '2023-07-24')
      expect(result![0]).toHaveProperty('base', 'USD')
      expect(result![0]).toHaveProperty('rates', 3.21)
    })

    it('sends symbols when provided', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        response: { date: '2023-07-24', rates: { CNY: 7.15 } },
      }))
      const result = await handler.currencyLatest('USD', 'CNY')
      expect(result).toHaveLength(1)
      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).toContain('symbols=CNY')
    })

    it('returns null on error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 400, json: () => Promise.resolve({}), text: () => Promise.resolve(''), headers: new Map() })
      const result = await handler.currencyLatest()
      expect(result).toBeNull()
    })
  })

  describe('currencyHistory', () => {
    it('returns historical rates as rows', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        response: { date: '2023-02-03', rates: { EUR: 0.92, GBP: 0.8 } },
      }))
      const result = await handler.currencyHistory('USD', '2023-02-03', '')
      expect(result).toHaveLength(2)
      expect(result![0]).toHaveProperty('currency', 'EUR')
      expect(result![0]).toHaveProperty('date', '2023-02-03')
    })

    it('returns null on error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 400, json: () => Promise.resolve({}), text: () => Promise.resolve(''), headers: new Map() })
      const result = await handler.currencyHistory()
      expect(result).toBeNull()
    })
  })

  describe('currencyTimeSeries', () => {
    it('transposes date-keyed response into rows', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        response: {
          '2023-02-03': { ADA: 2.5, AED: 3.67 },
          '2023-02-04': { ADA: 2.6, AED: 3.68 },
        },
      }))
      const result = await handler.currencyTimeSeries('USD', '2023-02-03', '2023-02-04', '')
      expect(result).toHaveLength(2)
      expect(result![0]).toHaveProperty('date', '2023-02-03')
      expect(result![0]).toHaveProperty('ADA', 2.5)
      expect(result![1]).toHaveProperty('date', '2023-02-04')
    })

    it('returns null on error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 400, json: () => Promise.resolve({}), text: () => Promise.resolve(''), headers: new Map() })
      const result = await handler.currencyTimeSeries()
      expect(result).toBeNull()
    })
  })

  describe('currencyCurrencies', () => {
    it('returns currency list directly', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        response: [
          { id: 1, name: 'UAE Dirham', short_code: 'AED' },
          { id: 2, name: 'Afghan Afghani', short_code: 'AFN' },
        ],
      }))
      const result = await handler.currencyCurrencies('fiat')
      expect(result).toHaveLength(2)
      expect(result![0]).toHaveProperty('short_code', 'AED')
    })

    it('returns null on error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 400, json: () => Promise.resolve({}), text: () => Promise.resolve(''), headers: new Map() })
      const result = await handler.currencyCurrencies()
      expect(result).toBeNull()
    })
  })

  describe('currencyConvert', () => {
    it('returns conversion result as item-value pairs', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        response: {
          timestamp: 1690000000, date: '2023-07-24',
          from: 'USD', to: 'CNY', amount: 10000, value: 71898.995,
        },
      }))
      const result = await handler.currencyConvert('USD', 'CNY', 10000)
      expect(result).toHaveLength(6)
      expect(result![0]).toHaveProperty('item', 'timestamp')
      expect(result![4]).toHaveProperty('item', 'amount')
      expect(result![5]).toHaveProperty('value', 71898.995)
    })

    it('returns null on error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 400, json: () => Promise.resolve({}), text: () => Promise.resolve(''), headers: new Map() })
      const result = await handler.currencyConvert()
      expect(result).toBeNull()
    })
  })
})
