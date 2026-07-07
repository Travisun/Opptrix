import { testSinafinanceConnection } from '../sinafinance/api/probe.js'

/** @deprecated 使用 `testSinafinanceConnection` */
export async function testWebfeedConnection(): Promise<{ ok: boolean; message: string }> {
  return testSinafinanceConnection()
}
