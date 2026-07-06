/**
 * 同花顺 HTTP Client — 公开 API，无需限流。
 *
 * 同花顺是有偿数据接口，有独立的调用配额，
 * 不需要主机名级别的限流保护。
 */

import { ProviderHttpClient } from '../../common/http-client.js'

export class TonghuashunHttpClient extends ProviderHttpClient {
  constructor() {
    super({
      providerId: 'tonghuashun',
      bypassRateLimit: true,
    })
  }
}

export const tonghuashunClient = new TonghuashunHttpClient()
