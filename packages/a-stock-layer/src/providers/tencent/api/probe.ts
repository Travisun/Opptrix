import { probeTencentResearchReport } from './proxy.js'
import { testTencentQuotesConnection } from './quotes.js'

export async function testTencentConnection(): Promise<{ ok: boolean; message: string }> {
  const quotes = await testTencentQuotesConnection('600519')
  if (!quotes.ok) return quotes
  const reportOk = await probeTencentResearchReport('600519').catch(() => false)
  const suffix = reportOk ? '；研报列表可访问' : ''
  return { ok: true, message: `${quotes.message}${suffix}` }
}
