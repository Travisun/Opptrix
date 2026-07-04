import { tdxClient } from '../client.js'

export async function testTdxConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const rows = await tdxClient.realtime('600519')
    const hit = rows?.[0]
    if (hit?.price != null && hit.price > 0) {
      return { ok: true, message: `通达信行情可访问 · 600519 ${hit.price}` }
    }
    return { ok: false, message: '通达信返回空行情，请稍后再试' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
