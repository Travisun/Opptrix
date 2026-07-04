import { applyManifestSpec } from '../common/driver-factory.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { MiscDataHandler } from './markets/cn/handler.js'

const SPEC: ProviderManifestSpec = {
  id: 'misc-data',
  title: '杂项数据',
  subtitle: '龙虎榜、股东户数、估值等补充数据',
  marketGroup: 'CN',
  defaultPriority: 30,
  capabilities: [],
  bindingsFor: () => [],
  settings: {
    providerId: 'misc-data',
    title: '杂项数据设置',
    marketGroup: 'CN',
    fields: [],
  },
}

export class MiscDataDriver extends MiscDataHandler {}

applyManifestSpec(MiscDataDriver, SPEC, {
  isRuntimeEnabled: () => true,
})

export async function testMiscDataConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const resp = await fetch('https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_VALUEANALYSIS_DET&columns=ALL&pageNumber=1&pageSize=1&source=WEB&client=WEB', {
      signal: AbortSignal.timeout(5000),
    })
    if (resp.ok) return { ok: true, message: '杂项数据 API 连接正常' }
    return { ok: false, message: `HTTP ${resp.status}` }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
