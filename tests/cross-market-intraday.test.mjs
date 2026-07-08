import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  crossMarketChartTimeZone,
  crossMarketSessionDate,
  marketLocalDatetimeToIso,
  minuteKlinesToIntradayItems,
  timezoneOffsetIso,
} from '../packages/a-stock-layer/dist/utils/cross-market-intraday.js'

test('crossMarketChartTimeZone maps HK and US', () => {
  assert.equal(crossMarketChartTimeZone('HK'), 'Asia/Hong_Kong')
  assert.equal(crossMarketChartTimeZone('US'), 'America/New_York')
})

test('marketLocalDatetimeToIso appends market timezone offset', () => {
  const hk = marketLocalDatetimeToIso('HK', '2026-07-08 09:31:00')
  assert.match(hk, /2026-07-08T09:31:00[+-]\d{2}:\d{2}$/)
  const us = marketLocalDatetimeToIso('US', '2026-07-08 09:31:00')
  assert.match(us, /2026-07-08T09:31:00[+-]\d{2}:\d{2}$/)
})

test('minuteKlinesToIntradayItems computes cumulative average price', () => {
  const items = minuteKlinesToIntradayItems('HK', [
    { code: '00700', date: '2026-07-08 09:31:00', open: 300, close: 300, high: 300, low: 300, volume: 100, amount: 30000, changePct: null, turnoverRate: null },
    { code: '00700', date: '2026-07-08 09:32:00', open: 302, close: 302, high: 302, low: 302, volume: 200, amount: 60400, changePct: null, turnoverRate: null },
  ])
  assert.equal(items.length, 2)
  assert.equal(items[0]?.price, 300)
  assert.equal(items[0]?.avg_price, 300)
  assert.equal(items[1]?.avg_price, (30000 + 60400) / 300)
})

test('timezoneOffsetIso returns signed offset', () => {
  const offset = timezoneOffsetIso(new Date('2026-07-08T12:00:00Z'), 'Asia/Hong_Kong')
  assert.match(offset, /^[+-]\d{2}:\d{2}$/)
})

test('crossMarketSessionDate returns YYYY-MM-DD', () => {
  assert.match(crossMarketSessionDate('HK'), /^\d{4}-\d{2}-\d{2}$/)
  assert.match(crossMarketSessionDate('US'), /^\d{4}-\d{2}-\d{2}$/)
})
