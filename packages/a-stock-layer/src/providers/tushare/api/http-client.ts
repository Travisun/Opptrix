/**
 * Tushare HTTP Client — 付费 API，无需限流。
 *
 * Tushare Pro 是付费数据接口，有独立的调用配额，
 * 不需要主机名级别的限流保护。
 */

import { ProviderHttpClient } from '../../common/http-client.js'

export class TushareHttpClient extends ProviderHttpClient {
  constructor() {
    super({
      providerId: 'tushare',
      defaultHeaders: { 'Content-Type': 'application/json' },
      bypassRateLimit: true,
    })
  }
}

export const tushareClient = new TushareHttpClient()
