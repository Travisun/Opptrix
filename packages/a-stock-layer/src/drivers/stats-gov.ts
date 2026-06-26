import { Capability } from '../core/capabilities.js'
import { httpGet } from '../utils/http.js'
import { BaseDriver } from './base.js'

const HEADERS = {
  Referer: 'https://data.stats.gov.cn/',
  Accept: 'application/json, text/javascript, */*; q=0.01',
}

const INDICATOR_MAP: Record<string, { zb: string; cn: string; name: string; unit: string }> = {
  GDP: { zb: 'A0E0F', cn: 'E0103', name: '国内生产总值(GDP)', unit: '亿元' },
  CPI: { zb: 'A010101', cn: 'E0103', name: '居民消费价格指数(CPI)', unit: '%' },
  PPI: { zb: 'A010201', cn: 'E0103', name: '工业生产者出厂价格指数(PPI)', unit: '%' },
  PMI: { zb: 'A0E01', cn: 'E0103', name: '制造业采购经理指数(PMI)', unit: '%' },
  M2: { zb: 'A0E02', cn: 'E0103', name: '货币供应量M2', unit: '亿元' },
  '社融': { zb: 'A0E0D', cn: 'E0103', name: '社会融资规模增量', unit: '亿元' },
  '工业增加值': { zb: 'A0E0C', cn: 'E0103', name: '规模以上工业增加值同比', unit: '%' },
}

const DEFAULT_KEYS = ['GDP', 'CPI', 'PPI', 'PMI', 'M2', '社融', '工业增加值']

export class StatsGovDriver extends BaseDriver {
  get name() { return 'stats_gov' }
  get priority() { return 20 }
  capabilities() {
    return [Capability.MACRO_INDICATOR]
  }

  private formatDate(dateCode: string) {
    if (dateCode.length === 6) return `${dateCode.slice(0, 4)}-${dateCode.slice(4)}`
    return dateCode
  }

  private async fetchIndicator(key: string) {
    const info = INDICATOR_MAP[key]
    if (!info) return null

    try {
      const json = await httpGet('https://data.stats.gov.cn/easyquery.htm', {
        m: 'QueryData',
        dbcode: info.cn,
        rowcode: 'zb',
        colcode: 'sj',
        wds: '[]',
        dfwds: `[{"wdcode":"zb","valuecode":"${info.zb}"}]`,
      }, 10000, HEADERS)

      const nodes = (json.returndata as { datanodes?: Record<string, unknown>[] })?.datanodes ?? []
      if (!nodes.length) return null

      const results: Record<string, unknown>[] = []
      for (const node of nodes) {
        const wds = (node.wds ?? []) as { wdcode?: string; valuecode?: string }[]
        const dateCode = wds.find(w => w.wdcode === 'sj')?.valuecode ?? ''
        const dataObj = node.data as { data?: unknown } | undefined
        const value = dataObj?.data ?? node.value
        if (value == null || value === '') continue
        const val = Number(value)
        if (!Number.isFinite(val)) continue
        results.push({
          indicatorName: info.name,
          date: this.formatDate(dateCode),
          value: val,
          unit: info.unit,
          source: '国家统计局',
        })
      }
      return results.length ? results : null
    } catch {
      return null
    }
  }

  async macroIndicator(indicator = '') {
    const keys = indicator && INDICATOR_MAP[indicator.toUpperCase()]
      ? [indicator.toUpperCase()]
      : indicator && INDICATOR_MAP[indicator]
        ? [indicator]
        : DEFAULT_KEYS

    const results: Record<string, unknown>[] = []
    for (const key of keys) {
      const mapKey = INDICATOR_MAP[key] ? key : key.toUpperCase()
      const data = await this.fetchIndicator(mapKey in INDICATOR_MAP ? mapKey : key)
      if (data) results.push(...data)
    }
    return results.length ? results : null
  }
}
