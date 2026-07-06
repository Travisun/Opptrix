/**
 * TickFlow HTTP Client — 付费 API，无需限流。
 *
 * TickFlow 是付费实时行情接口，有独立的调用配额，
 * 不需要主机名级别的限流保护。
 */

import { ProviderHttpClient } from '../../common/http-client.js'

export class TickflowHttpClient extends ProviderHttpClient {
  constructor() {
    super({
      providerId: 'tickflow',
      bypassRateLimit: true,
    })
  }
}

export const tickflowClient = new TickflowHttpClient()
