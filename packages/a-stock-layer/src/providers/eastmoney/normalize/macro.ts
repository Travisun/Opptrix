import { safeFloat } from '../../../utils/helpers.js'
import type { EmMacroCnDef, EmMacroForeignItem, EmMacroIndustryItem } from '../api/macro-catalog.js'

function ymd(raw: unknown): string {
  return String(raw ?? '').slice(0, 10)
}

function pickDate(row: Record<string, unknown>): string {
  return ymd(
    row.REPORT_DATE
    ?? row.TRADE_DATE
    ?? row.END_DATE
    ?? row.DIM_DATE
    ?? row.DATE
    ?? row.PUBLISH_DATE
    ?? row.REPORT_DAY,
  )
}

function snakeToCamel(key: string): string {
  return key.toLowerCase().replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
}

/** 通用扁平化：保留原始字段（camelCase）+ 标准 meta */
export function mapMacroGenericRows(
  rows: Record<string, unknown>[],
  meta: {
    indicatorKey: string
    indicator: string
    source?: string
    extra?: Record<string, unknown>
  },
): Record<string, unknown>[] {
  return rows.map(row => {
    const flat: Record<string, unknown> = {
      indicator: meta.indicator,
      indicatorKey: meta.indicatorKey,
      date: pickDate(row),
      period: String(row.TIME ?? row.REPORT_DATE_CH ?? ''),
      source: meta.source ?? 'eastmoney',
      ...meta.extra,
    }
    for (const [k, v] of Object.entries(row)) {
      const camel = snakeToCamel(k)
      if (camel in flat) continue
      flat[camel] = typeof v === 'number' || v == null ? v : (
        typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()) ? safeFloat(v) : v
      )
    }
    return flat
  }).filter(r => r.date || r.period)
}

/** 常用指标友好字段（与 akshare 东财实现对齐） */
export function mapMacroCnFriendly(
  def: EmMacroCnDef,
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  const key = def.key
  if (key === 'cpi') {
    return rows.map(it => ({
      indicator: 'CPI',
      indicatorKey: 'cpi',
      date: pickDate(it),
      period: String(it.TIME ?? ''),
      nationalYoy: safeFloat(it.NATIONAL_SAME),
      nationalIndex: safeFloat(it.NATIONAL_BASE),
      nationalMom: safeFloat(it.NATIONAL_SEQUENTIAL),
      nationalYtd: safeFloat(it.NATIONAL_ACCUMULATE),
      cityYoy: safeFloat(it.CITY_SAME),
      ruralYoy: safeFloat(it.RURAL_SAME),
      source: 'eastmoney',
    }))
  }
  if (key === 'ppi') {
    return rows.map(it => ({
      indicator: 'PPI',
      indicatorKey: 'ppi',
      date: pickDate(it),
      period: String(it.TIME ?? ''),
      index: safeFloat(it.BASE),
      yoy: safeFloat(it.BASE_SAME),
      ytd: safeFloat(it.BASE_ACCUMULATE),
      source: 'eastmoney',
    }))
  }
  if (key === 'pmi') {
    return rows.map(it => ({
      indicator: 'PMI',
      indicatorKey: 'pmi',
      date: pickDate(it),
      period: String(it.TIME ?? ''),
      manufacturing: safeFloat(it.MAKE_INDEX),
      manufacturingYoy: safeFloat(it.MAKE_SAME),
      nonManufacturing: safeFloat(it.NMAKE_INDEX),
      nonManufacturingYoy: safeFloat(it.NMAKE_SAME),
      source: 'eastmoney',
    }))
  }
  if (key === 'gdp') {
    return rows.map(it => ({
      indicator: 'GDP',
      indicatorKey: 'gdp',
      date: pickDate(it),
      period: String(it.TIME ?? ''),
      gdp: safeFloat(it.DOMESTICL_PRODUCT_BASE),
      primary: safeFloat(it.FIRST_PRODUCT_BASE),
      secondary: safeFloat(it.SECOND_PRODUCT_BASE),
      tertiary: safeFloat(it.THIRD_PRODUCT_BASE),
      gdpYoy: safeFloat(it.SUM_SAME),
      primaryYoy: safeFloat(it.FIRST_SAME),
      secondaryYoy: safeFloat(it.SECOND_SAME),
      tertiaryYoy: safeFloat(it.THIRD_SAME),
      source: 'eastmoney',
    }))
  }
  if (key === 'lpr') {
    return rows.map(it => ({
      indicator: 'LPR',
      indicatorKey: 'lpr',
      date: pickDate(it),
      lpr1y: safeFloat(it.LPR1Y),
      lpr5y: safeFloat(it.LPR5Y),
      loanShort: safeFloat(it.RATE_1),
      loanLong: safeFloat(it.RATE_2),
      source: 'eastmoney',
    }))
  }
  return mapMacroGenericRows(rows, { indicatorKey: def.key, indicator: def.name })
}

export function mapMacroForeignRows(
  item: EmMacroForeignItem,
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  return rows.map(it => ({
    indicator: item.name,
    indicatorKey: item.key,
    indicatorId: item.indicatorId,
    country: String(it.COUNTRY ?? item.country),
    date: pickDate(it),
    period: String(it.REPORT_DATE_CH ?? ''),
    value: safeFloat(it.VALUE),
    preValue: safeFloat(it.PRE_VALUE),
    publishDate: ymd(it.PUBLISH_DATE),
    unit: item.unit,
    source: 'eastmoney',
  }))
}

export function mapMacroIndustryRows(
  item: EmMacroIndustryItem,
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  return rows.map(it => ({
    indicator: item.name,
    indicatorKey: item.key,
    indicatorId: item.indicatorId,
    date: pickDate(it),
    value: safeFloat(it.INDICATOR_VALUE),
    changePct: safeFloat(it.CHANGE_RATE),
    changePct3m: safeFloat(it.CHANGERATE_3M),
    changePct6m: safeFloat(it.CHANGERATE_6M),
    changePct1y: safeFloat(it.CHANGERATE_1Y),
    boardCode: it.BOARD_CODE ?? null,
    boardName: it.BOARD_NAME ?? null,
    source: 'eastmoney',
  }))
}

export function mapMacroOilRows(
  kind: 'adjust' | 'province' | 'quote',
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  if (kind === 'quote') {
    return rows.map(it => ({
      indicator: '原油行情',
      indicatorKey: 'oil_quote',
      date: pickDate(it),
      close: safeFloat(it.CLOSE),
      gasoline: safeFloat(it.QY),
      diesel: safeFloat(it.CY),
      source: 'eastmoney',
    }))
  }
  if (kind === 'province') {
    return rows.map(it => ({
      indicator: '各省油价',
      indicatorKey: 'oil_province',
      date: pickDate(it),
      city: String(it.CITYNAME ?? ''),
      gasoline0: safeFloat(it.V0),
      gasoline92: safeFloat(it.V92),
      gasoline95: safeFloat(it.V95),
      gasoline89: safeFloat(it.V89),
      source: 'eastmoney',
    }))
  }
  return rows.map(it => ({
    indicator: '成品油调价',
    indicatorKey: 'oil_adjust',
    date: pickDate(it),
    gasoline: safeFloat(it.VALUE),
    diesel: safeFloat(it.CY_JG),
    gasolineChange: safeFloat(it.QY_FD),
    dieselChange: safeFloat(it.CY_FD),
    source: 'eastmoney',
  }))
}
