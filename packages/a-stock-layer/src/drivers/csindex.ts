import { Capability } from '../core/capabilities.js'
import { httpGet } from '../utils/http.js'
import { normalizeCode, resolveSecId, safeFloat } from '../utils/helpers.js'
import { BaseDriver } from './base.js'

const HEADERS = {
  Referer: 'https://www.csindex.com.cn/',
  Accept: 'application/json',
}

const INDEX_MAP: Record<string, string> = {
  '000300': '沪深300', '000001': '上证指数', '000016': '上证50', '000688': '科创50',
  '000905': '中证500', '000906': '中证800', '000852': '中证1000', '000932': '中证消费',
  '000963': '中证医疗', '000922': '中证红利', '399001': '深证成指', '399006': '创业板指',
  '399300': '沪深300(深圳)', '399330': '深证100', '399005': '中小板指',
}

export class CsindexDriver extends BaseDriver {
  get name() { return 'csindex' }
  get priority() { return 30 }
  capabilities() {
    return [Capability.INDEX_CONST]
  }

  private parseItems(data: Record<string, unknown>): Record<string, unknown>[] {
    for (const path of ['result', 'data', 'list', 'items', 'stockList', 'stockInfos']) {
      const v = data[path] ?? (data.data as Record<string, unknown> | undefined)?.[path]
      if (Array.isArray(v) && v.length) return v as Record<string, unknown>[]
    }
    return []
  }

  private async fallbackEastmoney(indexCode: string, indexName: string) {
    try {
      const json = await httpGet('https://push2.eastmoney.com/api/qt/slist/get', {
        fltt: '2', invt: '2', fields: 'f12,f14,f100,f3', type: '3',
        secids: resolveSecId(indexCode),
      })
      const raw = (json?.data as { diff?: Record<string, unknown>[] | Record<string, unknown> })?.diff
      const items = (raw ? (Array.isArray(raw) ? raw : Object.values(raw)) : []) as Record<string, unknown>[]
      if (!items.length) return null
      return items.map(it => ({
        indexCode, indexName,
        stockCode: String(it.f12 ?? '').padStart(6, '0'),
        stockName: String(it.f14 ?? ''),
        weight: safeFloat(it.f3),
        industry: String(it.f100 ?? ''),
      }))
    } catch {
      return null
    }
  }

  async indexConstituents(indexCode: string) {
    try {
      const c = normalizeCode(indexCode)
      const indexName = INDEX_MAP[c] ?? c
      const url = `https://www.csindex.com.cn/csindex-home/index-info/queryIndexWeight?indexCode=${c}&pageSize=200&pageNum=1&lang=zh`
      let items: Record<string, unknown>[] = []
      try {
        const data = await httpGet(url, {}, 10000)
        items = this.parseItems(data)
      } catch { /* try fallback */ }

      if (!items.length) return this.fallbackEastmoney(c, indexName)

      const results = items.map(item => {
        const stockCode = String(item.stockCode ?? item.code ?? item.stock_code ?? '').padStart(6, '0')
        if (!stockCode || stockCode === '000000') return null
        return {
          indexCode: c,
          indexName,
          stockCode,
          stockName: String(item.stockName ?? item.name ?? item.stock_name ?? ''),
          weight: safeFloat(item.weight ?? item.indexWeight ?? item.weightRatio),
          industry: String(item.industry ?? item.industryName ?? item.industryCode ?? ''),
        }
      }).filter(Boolean)

      return results.length ? results : this.fallbackEastmoney(c, indexName)
    } catch {
      return null
    }
  }
}
