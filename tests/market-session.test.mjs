import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

function cnMarketNow(iso) {
  return new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))
}

function cnTodayString(now) {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function isCnTradingWeekday(now) {
  const day = now.getDay()
  return day >= 1 && day <= 5
}

function isCnMarketOpen(now) {
  if (!isCnTradingWeekday(now)) return false
  const mins = now.getHours() * 60 + now.getMinutes()
  return (mins >= 9 * 60 + 15 && mins <= 11 * 60 + 30)
    || (mins >= 13 * 60 && mins <= 15 * 60 + 5)
}

function isCnBeforeMarketOpen(now) {
  if (!isCnTradingWeekday(now)) return true
  const mins = now.getHours() * 60 + now.getMinutes()
  return mins < 9 * 60 + 15
}

function isCnAfterMarketClose(now) {
  if (!isCnTradingWeekday(now)) return true
  const mins = now.getHours() * 60 + now.getMinutes()
  return mins > 15 * 60 + 5
}

function isCnTradingSessionDay(now) {
  return isCnTradingWeekday(now) && !isCnBeforeMarketOpen(now)
}

function shouldUseLiveIndustryQuotes(storedQuoteDate, now) {
  if (!isCnTradingSessionDay(now)) return false
  if (isCnMarketOpen(now)) return true
  if (!isCnAfterMarketClose(now)) return true
  const today = cnTodayString(now)
  if (!storedQuoteDate || storedQuoteDate < today) return true
  return false
}

describe('shouldUseLiveIndustryQuotes', () => {
  it('weekend uses stored quotes only', () => {
    const sat = cnMarketNow('2025-06-28T03:00:00.000Z')
    assert.equal(shouldUseLiveIndustryQuotes('2025-06-27', sat), false)
  })

  it('weekday before open uses stored quotes only', () => {
    const pre = cnMarketNow('2025-06-30T00:30:00.000Z')
    assert.equal(shouldUseLiveIndustryQuotes('2025-06-27', pre), false)
  })

  it('weekday during session uses live quotes', () => {
    const open = cnMarketNow('2025-06-30T02:00:00.000Z')
    assert.equal(shouldUseLiveIndustryQuotes('2025-06-27', open), true)
  })

  it('weekday lunch break still uses live quotes', () => {
    const lunch = cnMarketNow('2025-06-30T04:30:00.000Z')
    assert.equal(shouldUseLiveIndustryQuotes('2025-06-27', lunch), true)
  })

  it('after close uses live until DB catches up to today', () => {
    const after = cnMarketNow('2025-06-30T08:00:00.000Z')
    assert.equal(shouldUseLiveIndustryQuotes('2025-06-27', after), true)
    assert.equal(shouldUseLiveIndustryQuotes('2025-06-30', after), false)
  })
})

function shouldPollTrendBrief(now) {
  return isCnMarketOpen(now)
}

describe('shouldPollTrendBrief', () => {
  it('weekend does not poll', () => {
    const sat = cnMarketNow('2025-06-28T03:00:00.000Z')
    assert.equal(shouldPollTrendBrief(sat), false)
  })

  it('weekday before open does not poll', () => {
    const pre = cnMarketNow('2025-06-30T00:30:00.000Z')
    assert.equal(shouldPollTrendBrief(pre), false)
  })

  it('weekday during session polls', () => {
    const open = cnMarketNow('2025-06-30T02:00:00.000Z')
    assert.equal(shouldPollTrendBrief(open), true)
  })

  it('weekday after close does not poll', () => {
    const after = cnMarketNow('2025-06-30T08:00:00.000Z')
    assert.equal(shouldPollTrendBrief(after), false)
  })
})
