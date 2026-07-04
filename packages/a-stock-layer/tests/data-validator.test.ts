import { describe, it, expect } from 'vitest'
import { validateResponse } from '../src/core/data-validator.js'
import { Capability } from '../src/core/capabilities.js'

describe('validateResponse', () => {
  describe('STOCK_REALTIME', () => {
    it('accepts valid realtime data', () => {
      const data = [{ code: '000001', price: 15.5, volume: 100000 }]
      expect(validateResponse(Capability.STOCK_REALTIME, data).valid).toBe(true)
    })

    it('rejects empty array', () => {
      expect(validateResponse(Capability.STOCK_REALTIME, []).valid).toBe(false)
    })

    it('rejects items without code', () => {
      const data = [{ price: 15.5 }]
      expect(validateResponse(Capability.STOCK_REALTIME, data).valid).toBe(false)
    })

    it('rejects items with null price', () => {
      const data = [{ code: '000001', price: null }]
      expect(validateResponse(Capability.STOCK_REALTIME, data).valid).toBe(false)
    })

    it('rejects items with zero price', () => {
      const data = [{ code: '000001', price: 0 }]
      expect(validateResponse(Capability.STOCK_REALTIME, data).valid).toBe(false)
    })

    it('rejects items with negative price', () => {
      const data = [{ code: '000001', price: -5 }]
      expect(validateResponse(Capability.STOCK_REALTIME, data).valid).toBe(false)
    })

    it('accepts partial valid data (mixed valid/invalid)', () => {
      const data = [
        { code: '000001', price: 15.5 },
        { code: '000002', price: null },  // invalid
      ]
      expect(validateResponse(Capability.STOCK_REALTIME, data).valid).toBe(true)
    })

    it('accepts US stock codes', () => {
      const data = [{ code: 'AAPL', price: 195.2 }]
      expect(validateResponse(Capability.STOCK_REALTIME, data).valid).toBe(true)
    })

    it('accepts crypto pairs', () => {
      const data = [{ code: 'BTC/USDT', price: 65000 }]
      expect(validateResponse(Capability.STOCK_REALTIME, data).valid).toBe(true)
    })
  })

  describe('STOCK_KLINE', () => {
    it('accepts valid kline data', () => {
      const data = [{ code: '000001', date: '2026-07-04', open: 15, close: 15.5 }]
      expect(validateResponse(Capability.STOCK_KLINE, data).valid).toBe(true)
    })

    it('rejects items without date', () => {
      const data = [{ code: '000001', open: 15 }]
      expect(validateResponse(Capability.STOCK_KLINE, data).valid).toBe(false)
    })
  })

  describe('STOCK_PROFILE', () => {
    it('accepts valid profile data', () => {
      const data = [{ code: '000001', name: '平安银行' }]
      expect(validateResponse(Capability.STOCK_PROFILE, data).valid).toBe(true)
    })

    it('rejects items without name', () => {
      const data = [{ code: '000001' }]
      expect(validateResponse(Capability.STOCK_PROFILE, data).valid).toBe(false)
    })
  })

  describe('NEWS', () => {
    it('accepts valid news data', () => {
      const data = [{ title: '市场要闻', content: '...' }]
      expect(validateResponse(Capability.NEWS, data).valid).toBe(true)
    })

    it('rejects items without title', () => {
      const data = [{ content: 'no title' }]
      expect(validateResponse(Capability.NEWS, data).valid).toBe(false)
    })
  })

  describe('generic fallback', () => {
    it('accepts non-empty records for unknown capability', () => {
      const data = [{ foo: 'bar' }]
      // Use a capability not explicitly handled
      expect(validateResponse(Capability.MARGIN_TRADE, data).valid).toBe(true)
    })

    it('rejects empty records', () => {
      const data = [{}]
      expect(validateResponse(Capability.MARGIN_TRADE, data).valid).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('rejects non-array input', () => {
      // @ts-expect-error testing invalid input
      expect(validateResponse(Capability.STOCK_REALTIME, 'not an array').valid).toBe(false)
    })

    it('rejects null input', () => {
      // @ts-expect-error testing invalid input
      expect(validateResponse(Capability.STOCK_REALTIME, null).valid).toBe(false)
    })

    it('rejects undefined input', () => {
      // @ts-expect-error testing invalid input
      expect(validateResponse(Capability.STOCK_REALTIME, undefined).valid).toBe(false)
    })
  })
})
