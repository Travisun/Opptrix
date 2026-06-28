import { loadTushareConfig } from './config.js'

export type TushareRow = Record<string, string | number | null>

export class TushareApiError extends Error {
  constructor(message: string, readonly code?: number) {
    super(message)
    this.name = 'TushareApiError'
  }
}

interface TushareResponse {
  code: number
  msg?: string
  data?: { fields?: string[]; items?: (string | number | null)[][] }
}

function rowsToObjects(fields: string[], items: (string | number | null)[][]): TushareRow[] {
  return items.map(row => {
    const obj: TushareRow = {}
    for (let i = 0; i < fields.length; i++) obj[fields[i]] = row[i] ?? null
    return obj
  })
}

export class TushareClient {
  private readonly token: string

  constructor(token?: string) {
    const cfg = loadTushareConfig()
    this.token = token ?? cfg.token
    if (!this.token) throw new TushareApiError('Tushare token 未配置')
  }

  async query(
    apiName: string,
    params: Record<string, unknown> = {},
    fields?: string,
  ): Promise<TushareRow[]> {
    const resp = await fetch('http://api.tushare.pro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_name: apiName,
        token: this.token,
        params,
        fields,
      }),
    })
    if (!resp.ok) throw new TushareApiError(`HTTP ${resp.status}`)
    const json = await resp.json() as TushareResponse
    if (json.code !== 0) throw new TushareApiError(json.msg ?? 'Tushare API error', json.code)
    const data = json.data
    if (!data?.fields?.length || !data.items?.length) return []
    return rowsToObjects(data.fields, data.items)
  }

  async queryAll(
    apiName: string,
    params: Record<string, unknown>,
    fields: string,
    pageSize = 5000,
  ): Promise<TushareRow[]> {
    const rows: TushareRow[] = []
    let offset = 0
    for (;;) {
      const batch = await this.query(apiName, { ...params, limit: pageSize, offset }, fields)
      if (!batch.length) break
      rows.push(...batch)
      if (batch.length < pageSize) break
      offset += batch.length
    }
    return rows
  }
}

export async function testTushareConnection(token?: string): Promise<{ ok: boolean; message: string }> {
  try {
    const client = new TushareClient(token)
    const rows = await client.query('trade_cal', { exchange: 'SSE', start_date: '20240101', end_date: '20240110' }, 'cal_date,is_open')
    if (!rows.length) return { ok: false, message: '接口返回为空，请检查积分权限' }
    return { ok: true, message: `连接成功 · 交易日历 ${rows.length} 条` }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
