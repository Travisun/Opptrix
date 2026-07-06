/**
 * OKX HTTP Client — 公开 API，无需限流。
 *
 * OKX 是公开加密货币交易所 API，有独立的 IP 限流策略，
 * 不需要主机名级别的限流保护。
 */

import { ProviderHttpClient } from '../../common/http-client.js'

export class OkxHttpClient extends ProviderHttpClient {
  constructor() {
    super({
      providerId: 'okx',
      bypassRateLimit: true,
    })
  }
}

export const okxClient = new OkxHttpClient()
