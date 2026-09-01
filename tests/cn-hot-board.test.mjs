/**
 * A-share last trading day resolution (client-ui mirror for unit tests).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

function normalizeTradeDate(input) {
  const trimmed = input.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  if (/^\d{8}$/.test(trimmed)) {
    return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`
  }
  return null
}

function resolveLastTradingDayOnOrBeforeSync(target, days) {
  if (!days.size) return target
  const sorted = [...days].filter(d => d <= target).sort()
  if (sorted.length) return sorted[sorted.length - 1]
  return [...days].sort()[0] ?? target
}

describe('cnTradingDayUtils contract', () => {
  it('normalizeTradeDate accepts yyyy-MM-dd and yyyyMMdd', () => {
    assert.equal(normalizeTradeDate('2026-08-28'), '2026-08-28')
    assert.equal(normalizeTradeDate('20260828'), '2026-08-28')
    assert.equal(normalizeTradeDate('bad'), null)
  })

  it('resolveLastTradingDayOnOrBefore picks latest trading day on or before target', () => {
    const days = new Set(['2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28'])
    assert.equal(
      resolveLastTradingDayOnOrBeforeSync('2026-08-28', days),
      '2026-08-28',
    )
    assert.equal(
      resolveLastTradingDayOnOrBeforeSync('2026-08-29', days),
      '2026-08-28',
    )
    assert.equal(
      resolveLastTradingDayOnOrBeforeSync('2026-08-24', days),
      '2026-08-25',
    )
  })
})

describe('CnHotBoardPanel wiring', () => {
  it('CnMarketDynamicsView mounts CnHotBoardPanel in side column', () => {
    const src = fs.readFileSync(
      path.join(here, '../client-ui/src/pages/market-dynamics/CnMarketDynamicsView.tsx'),
      'utf8',
    )
    assert.match(src, /CnHotBoardPanel/)
    assert.match(src, /cn_hot_stocks/)
    assert.match(src, /cn_skyrocket/)
  })
})

describe('hub cn_market_special hot_stock', () => {
  it('registers hot_stock kind', () => {
    const src = fs.readFileSync(
      path.join(here, '../packages/research-hub/src/hub.ts'),
      'utf8',
    )
    assert.match(src, /hot_stock:/)
    assert.match(src, /thsHotStockList/)
  })

  it('enriches live hot board kinds with realtime quotes', () => {
    const src = fs.readFileSync(
      path.join(here, '../packages/research-hub/src/hub.ts'),
      'utf8',
    )
    assert.match(src, /LIVE_HOT_QUOTE_KINDS/)
    assert.match(src, /fetchCnStockQuoteMap\(mapped\.map/)
    assert.match(src, /applyCnStockQuote\(item, quoteMap\)/)
  })

  it('enriches hot_history with historical day kline quotes', () => {
    const src = fs.readFileSync(
      path.join(here, '../packages/research-hub/src/hub.ts'),
      'utf8',
    )
    assert.match(src, /kind === 'hot_history'/)
    assert.match(src, /fetchCnHistoricalDayQuoteMap/)
    assert.match(src, /quote_basis: 'historical_close'/)
  })

  it('market_dynamics merges limitUpdown into single fetch', () => {
    const src = fs.readFileSync(
      path.join(here, '../packages/research-hub/src/hub.ts'),
      'utf8',
    )
    assert.match(src, /fetchCnLimitUpdownPack/)
    assert.doesNotMatch(
      src.slice(src.indexOf('private async marketDynamicsCn')),
      /fetchEmotionLimitUp/,
    )
  })

  it('market_dynamics skips bulk cn_anomaly fetch', () => {
    const src = fs.readFileSync(
      path.join(here, '../packages/research-hub/src/hub.ts'),
      'utf8',
    )
    const start = src.indexOf('private async marketDynamicsCn')
    const end = src.indexOf('private async marketRegime', start)
    const body = end > start ? src.slice(start, end) : src.slice(start)
    assert.doesNotMatch(body, /fetchAnomaly/)
    assert.doesNotMatch(body, /thsAnomalyAnalysisList/)
    assert.doesNotMatch(body, /cn_anomaly:/)
  })

  it('major indices use batch thsIndexPricesSnapshot', () => {
    const src = fs.readFileSync(
      path.join(here, '../packages/research-hub/src/hub.ts'),
      'utf8',
    )
    assert.match(src, /majorCnIndexThscode/)
    assert.match(src, /fetchThsIndexPriceSnapshots\(thscodes\)/)
  })

  it('sector catalog and market dynamics use hub TTL caches', () => {
    const src = fs.readFileSync(
      path.join(here, '../packages/research-hub/src/hub.ts'),
      'utf8',
    )
    assert.match(src, /thsSectorCatalogCache/)
    assert.match(src, /THS_SECTOR_CATALOG_TTL_MS/)
    assert.match(src, /marketDynamicsMemCache/)
    assert.match(src, /readMarketDynamicsCache/)
    assert.match(src, /cnHotHistoryQuoteCache/)
  })
})

describe('majorCnIndexThscode', () => {
  function majorCnIndexThscode(code) {
    const raw = String(code ?? '').trim()
    if (!raw) return ''
    if (raw.includes('.')) return raw.toUpperCase()
    const digits = raw.replace(/\D/g, '').padStart(6, '0').slice(-6)
    if (digits.startsWith('399') || digits.startsWith('88')) {
      return `${digits}.${digits.startsWith('399') ? 'SZ' : 'TI'}`
    }
    return `${digits}.SH`
  }

  it('maps major CN index codes to thscode', () => {
    assert.equal(majorCnIndexThscode('000001'), '000001.SH')
    assert.equal(majorCnIndexThscode('399006'), '399006.SZ')
    assert.equal(majorCnIndexThscode('000300'), '000300.SH')
  })
})
