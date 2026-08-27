import YahooFinance from 'yahoo-finance2'

let singleton: InstanceType<typeof YahooFinance> | null = null

export function getYahooFinanceClient(): InstanceType<typeof YahooFinance> {
  if (!singleton) singleton = new YahooFinance()
  return singleton
}

/** 测试用：重置单例 */
export function resetYahooFinanceClientForTests(): void {
  singleton = null
}
