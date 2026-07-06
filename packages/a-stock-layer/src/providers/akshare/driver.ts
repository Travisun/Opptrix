import { applyManifestSpec } from '../common/driver-factory.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { AkshareHandler } from './markets/cn/handler.js'

const SPEC: ProviderManifestSpec = {
  id: 'akshare',
  title: 'AKShare',
  subtitle: '债券、期货、汇率、碳排放、另类数据等 AKShare 接口',
  marketGroup: 'CN',
  defaultPriority: 30,
  capabilities: [],
  bindingsFor: () => [],
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

export async function testAkshareConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const resp = await fetch('https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_VALUEANALYSIS_DET&columns=ALL&pageNumber=1&pageSize=1&source=WEB&client=WEB', {
      signal: AbortSignal.timeout(5000),
    })
    if (resp.ok) return { ok: true, message: 'AKShare 数据 API 连接正常' }
    return { ok: false, message: `HTTP ${resp.status}` }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
