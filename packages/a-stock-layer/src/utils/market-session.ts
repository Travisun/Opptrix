/** Beijing (Asia/Shanghai) market clock helpers. */

export function cnMarketNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))
}

export function cnTodayString(now = cnMarketNow()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function isCnTradingWeekday(now = cnMarketNow()): boolean {
  const day = now.getDay()
  return day >= 1 && day <= 5
}

/** A-share continuous session + call auction (Beijing). */
export function isCnMarketOpen(now = cnMarketNow()): boolean {
  if (!isCnTradingWeekday(now)) return false
  const mins = now.getHours() * 60 + now.getMinutes()
  return (mins >= 9 * 60 + 15 && mins <= 11 * 60 + 30)
    || (mins >= 13 * 60 && mins <= 15 * 60 + 5)
}

export function isCnBeforeMarketOpen(now = cnMarketNow()): boolean {
  if (!isCnTradingWeekday(now)) return true
  const mins = now.getHours() * 60 + now.getMinutes()
  return mins < 9 * 60 + 15
}

export function isCnAfterMarketClose(now = cnMarketNow()): boolean {
  if (!isCnTradingWeekday(now)) return true
  const mins = now.getHours() * 60 + now.getMinutes()
  return mins > 15 * 60 + 5
}

/** Prefer today's intraday when weekday and session has started (incl. after close). */
export function shouldPreferTodayIntraday(now = cnMarketNow()): boolean {
  return isCnTradingWeekday(now) && !isCnBeforeMarketOpen(now)
}
