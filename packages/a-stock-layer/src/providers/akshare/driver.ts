import { applyManifestSpec } from '../common/driver-factory.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { Capability } from '../../core/capabilities.js'
import { cnEquityBindings } from '../common/bindings.js'
import { AkshareHandler } from './markets/cn/handler.js'

const AKSHARE_CAPS = [Capability.MACRO_INDICATOR]

const SPEC: ProviderManifestSpec = {
  id: 'akshare',
  title: 'AKShare',
  subtitle: '债券、期货、汇率、碳排放、中国宏观（CPI/PPI/PMI/GDP/LPR）等接口',
  marketGroup: 'CN',
  defaultPriority: 30,
  maxConcurrent: 1,
  capabilities: AKSHARE_CAPS,
  bindingsFor: (p, maxConcurrent) => cnEquityBindings(AKSHARE_CAPS, p, maxConcurrent),
  settings: {
    providerId: 'akshare',
    title: 'AKShare 数据设置',
    marketGroup: 'CN',
    fields: [],
  },
}

export class AkshareDriver extends AkshareHandler {}

applyManifestSpec(AkshareDriver, SPEC, {
  isRuntimeEnabled: () => true,
})

import { outboundFetch } from '@opptrix/shared'

export async function testAkshareConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const resp = await outboundFetch('https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_ECONOMY_CPI&columns=ALL&pageNumber=1&pageSize=1&sortColumns=REPORT_DATE&sortTypes=-1&source=WEB&client=WEB', {
      signal: AbortSignal.timeout(8000),
    })
    if (resp.ok) return { ok: true, message: 'AKShare 数据 API 连接正常（宏观 CPI 探针）' }
    return { ok: false, message: `HTTP ${resp.status}` }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
