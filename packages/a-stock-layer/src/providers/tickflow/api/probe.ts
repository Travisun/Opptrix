import type { TickflowClient } from './client.js'
import {
  clearProviderPermissionDenials,
  getProviderDeniedFeatures,
} from '../../common/permission-denial.js'
import {
  markTickflowPermissionProbeComplete,
  recordTickflowPermissionDenial,
  TICKFLOW_PAID_FEATURES,
} from './permissions.js'

const PROBE_SYMBOL = '600519.SH'
const PROBE_SYMBOL2 = '000001.SZ'

type ProbeItem = {
  feature: string
  run: (client: TickflowClient) => Promise<unknown>
}

/** 付费功能探测 — 免费 Key 应全部 403 */
const PROBE_CHECKS: ProbeItem[] = [
  { feature: 'depth', run: c => c.getDepth(PROBE_SYMBOL) },
  { feature: 'kline_batch', run: c => c.getKlinesBatch({ symbols: `${PROBE_SYMBOL},${PROBE_SYMBOL2}`, period: '1d', count: 1 }) },
  { feature: 'intraday', run: c => c.getKlinesIntraday({ symbol: PROBE_SYMBOL, period: '1m' }) },
  { feature: 'financial', run: c => c.getFinancialsMetrics({ symbols: PROBE_SYMBOL, latest: true }) },
  { feature: 'ex_factors', run: c => c.getKlinesExFactors({ symbols: PROBE_SYMBOL }) },
]

/**
 * 探测当前 API Key 的功能权限（轻量请求 + 403 错误码）。
 */
export async function probeTickflowPermissions(
  client: TickflowClient,
  opts: { reset?: boolean } = {},
): Promise<{ allowed: string[]; denied: string[] }> {
  if (opts.reset !== false) clearProviderPermissionDenials('tickflow')

  const allowed: string[] = []
  const denied: string[] = []

  for (const { feature, run } of PROBE_CHECKS) {
    try {
      await run(client)
      allowed.push(feature)
    } catch (e) {
      denied.push(feature)
      const msg = e instanceof Error ? e.message : String(e)
      recordTickflowPermissionDenial(msg)
    }
  }

  markTickflowPermissionProbeComplete()
  const registered = getProviderDeniedFeatures('tickflow')
  return {
    allowed,
    denied: [...new Set([...denied, ...registered.filter(f => TICKFLOW_PAID_FEATURES.has(f))])],
  }
}
