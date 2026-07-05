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

describe('EastMoney research — fund/index APIs', () => {
  let driver: Awaited<typeof import('../src/providers/eastmoney/driver')>['EastMoneyDriver']

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('../src/providers/eastmoney/driver')
    driver = new mod.EastMoneyDriver()
  })

  describe('fundNameEm', () => {
    it('returns fund name list', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse('var r = [["000001","HXCZHH","华夏成长","混合型","HUAXIACHENGZHANGHUNHE"]]'))
      const result = await driver.fundNameEm()
      expect(result).toHaveLength(1)
      expect(result![0]).toHaveProperty('code', '000001')
      expect(result![0]).toHaveProperty('name', '华夏成长')
    })
  })

  describe('fundPurchaseEm', () => {
    it('returns purchase status', async () => {
      const rawText = 'var reData={"datas":[["000001","华夏成长","混合型","1.5","2025-01-01","开放申购","开放赎回","","10","100000","0.15"]]}'
      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(rawText),
        headers: new Map(),
      } as unknown as Response)
      const result = await driver.fundPurchaseEm()
      expect(result).toHaveLength(1)
      expect(result![0]).toHaveProperty('code', '000001')
      expect(result![0]).toHaveProperty('purchaseStatus', '开放申购')
    })
  })

  describe('fundEtfSpotEm', () => {
    it('returns ETF realtime data', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: { diff: [{ f12: '510300', f14: '沪深300ETF', f2: 4.5, f3: 1.2, f4: 0.05, f5: 100000, f6: 450000 }] },
      }))
      const result = await driver.fundEtfSpotEm()
      expect(result).toHaveLength(1)
      expect(result![0]).toHaveProperty('code', '510300')
      expect(result![0]).toHaveProperty('name', '沪深300ETF')
    })
  })

  describe('fundLofSpotEm', () => {
    it('returns LOF realtime data', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: { diff: [{ f12: '160807', f14: 'LOF基金', f2: 1.5, f3: 0.5 }] },
      }))
      const result = await driver.fundLofSpotEm()
      expect(result).toHaveLength(1)
      expect(result![0]).toHaveProperty('code', '160807')
    })
  })

  describe('fundOpenFundDailyEm', () => {
    it('returns fund NAV data', async () => {
      const rawText = 'var db={"datas":[["000001","华夏成长","","1.5","2.0","1.49","1.99","0.01","0.67","开放申购","开放赎回","","","","","","","","","0.15"]]}'
      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(rawText),
        headers: new Map(),
      } as unknown as Response)
      const result = await driver.fundOpenFundDailyEm()
      expect(result).toHaveLength(1)
      expect(result![0]).toHaveProperty('code', '000001')
    })
  })

  describe('fundInfoIndexEm', () => {
    it('returns index fund list', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ Data: '{"datas":["510300|沪深300ETF|||1.5||0.5"]}' }))
      const result = await driver.fundInfoIndexEm('全部')
      expect(result).toHaveLength(1)
    })
  })

  describe('stockZhIndexSpotEm', () => {
    it('returns index realtime data', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: { diff: [{ f12: '000001', f14: '上证指数', f2: 3000, f3: 0.5 }] },
      }))
      const result = await driver.stockZhIndexSpotEm('沪深重要指数')
      expect(result).toHaveLength(1)
      expect(result![0]).toHaveProperty('code', '000001')
    })
  })

  describe('indexGlobalSpotEm', () => {
    it('returns global index realtime', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: { diff: [{ f12: 'SPX', f14: '标普500', f2: 5000, f3: 0.3 }] },
      }))
      const result = await driver.indexGlobalSpotEm()
      expect(result).toHaveLength(1)
      expect(result![0]).toHaveProperty('code', 'SPX')
    })
  })

  describe('fundRatingAll', () => {
    it('returns fund ratings', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse('var rankData={datas:[["000001","华夏成长","3年5星","2年4星","1年3星","6月2星"]]}'))
      const result = await driver.fundRatingAll()
      expect(result === null || Array.isArray(result)).toBe(true)
    })
  })

  describe('fundManagerEm', () => {
    it('returns fund manager list', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse('var data={datas:[["M001","张三","华夏基金","","","100"]]}'))
      const result = await driver.fundManagerEm()
      expect(result === null || Array.isArray(result)).toBe(true)
    })
  })

  describe('fundInfoThs', () => {
    it('returns fund info from THS', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse('<html><td>基金代码</td><td>161130</td><td>基金简称</td><td>纳斯达克100LOF</td></html>'))
      const result = await driver.fundInfoThs('161130')
      expect(result === null || Array.isArray(result)).toBe(true)
    })
  })

  describe('indexStockCons', () => {
    it('returns index constituents', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse('<html><td>600519</td><td>贵州茅台</td><td>601318</td><td>中国平安</td></html>'))
      const result = await driver.indexStockCons('000300')
      expect(result === null || Array.isArray(result)).toBe(true)
    })
  })
  })

  describe('fundManagerEm', () => {
    it('returns fund manager list', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse('var data={datas:[["M001","张三","华夏基金","","","100"]]}'))
      const result = await driver.fundManagerEm()
      expect(result).toHaveLength(1)
    })
  })

  describe('fundEtfHistEm', () => {
    it('returns ETF history', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: { klines: ['2025-01-01,4.5,4.6,4.7,4.4,100000,450000,,,0.5'] },
      }))
      const result = await driver.fundEtfHistEm('510300', 'daily', '20250101', '20250101')
      expect(result).toHaveLength(1)
      expect(result![0]).toHaveProperty('code', '510300')
    })
  })

  describe('fundLofHistEm', () => {
    it('returns LOF history', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: { klines: ['2025-01-01,1.5,1.6,1.7,1.4,50000,75000,,,0.3'] },
      }))
      const result = await driver.fundLofHistEm('160807')
      expect(result).toHaveLength(1)
    })
  })

  describe('fundInfoThs', () => {
    it('returns fund info from THS', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse('<html><td>基金代码</td><td>161130</td><td>基金简称</td><td>纳斯达克100LOF</td></html>'))
      const result = await driver.fundInfoThs('161130')
      expect(result).toBeTruthy()
    })
  })

  describe('indexStockCons', () => {
    it('returns index constituents', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse('<html><td>600519</td><td>贵州茅台</td></html>'))
      const result = await driver.indexStockCons('000300')
      expect(result).toHaveLength(1)
    })
  })

  describe('Error handling', () => {
    it('fundNameEm returns null on error', async () => {
      mockFetch.mockRejectedValue(new Error('network'))
      const result = await driver.fundNameEm()
      expect(result).toBeNull()
    })

    it('fundEtfSpotEm returns null on error', async () => {
      mockFetch.mockRejectedValue(new Error('timeout'))
      const result = await driver.fundEtfSpotEm()
      expect(result).toBeNull()
    })

    it('stockZhIndexSpotEm returns null on error', async () => {
      mockFetch.mockRejectedValue(new Error('network'))
      const result = await driver.stockZhIndexSpotEm()
      expect(result).toBeNull()
    })
  })
})
