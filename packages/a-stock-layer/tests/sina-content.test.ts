import { describe, it, expect } from 'vitest'
import { buildSinaNoticeDetailUrl } from '../src/providers/sinafinance/api/content.js'
import {
  mapSinaNoticeRows,
  mapSinaStockNewsRows,
  resolveSinaNewsChannel,
} from '../src/providers/sinafinance/normalize/content.js'

describe('resolveSinaNewsChannel', () => {
  it('maps notice aliases', () => {
    expect(resolveSinaNewsChannel('notice')).toBe('notice')
    expect(resolveSinaNewsChannel('公告')).toBe('notice')
    expect(resolveSinaNewsChannel('research')).toBe('news')
  })
})

describe('mapSinaStockNewsRows', () => {
  it('normalizes news items', () => {
    const rows = mapSinaStockNewsRows('600905', [{
      title: '三峡能源跌1.58%',
      url: 'https://finance.sina.com.cn/stock/x.shtml',
      ctime_str: '2026-07-07 15:36:04',
    }])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.code).toBe('600905')
    expect(rows[0]?.type).toBe('新闻')
    expect(rows[0]?.date).toBe('2026-07-07')
  })
})

describe('mapSinaNoticeRows', () => {
  it('builds notice detail urls', () => {
    const url = buildSinaNoticeDetailUrl('600905', '10351920')
    expect(url).toContain('stockid=600905')
    expect(url).toContain('#_10351920')

    const rows = mapSinaNoticeRows('600905', [{
      id: '10351920',
      title: '三峡能源：临时股东会决议公告',
      date: '2026-06-30',
    }])
    expect(rows[0]?.type).toBe('公告')
    expect(rows[0]?.url).toBe(url)
  })
})
