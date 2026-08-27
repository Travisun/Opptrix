import type { FxRatesToCny } from '@opptrix/shared'
import { FX_RATES_CACHE_TTL_MS, buildFxRatesToCnyFromOpptrix } from '@opptrix/shared'

type CacheEntry = {
  rates: FxRatesToCny
  fetchedAt: number
}

let memoryCache: CacheEntry | null = null

function isFresh(entry: CacheEntry): boolean {
  return Date.now() - entry.fetchedAt < FX_RATES_CACHE_TTL_MS
}

/** 全量外币兑人民币（Opptrix 量化 SAFE 中间价）；内存缓存 24h */
export async function getFxRatesToCny(): Promise<FxRatesToCny> {
  if (memoryCache && isFresh(memoryCache)) {
    return memoryCache.rates
  }

  try {
    const { opptrixFxRmbLatest } = await import('@opptrix/a-stock-layer')
    const payload = await opptrixFxRmbLatest()
    if (!payload?.rates?.length) {
      throw new Error('汇率暂不可用，请先在设置中配置 Opptrix 量化数据密钥')
    }
    const rates = buildFxRatesToCnyFromOpptrix(payload.rates, {
      tradeDate: payload.trade_date,
      source: payload.source ?? 'safe',
      updatedAt: new Date().toISOString(),
    })
    memoryCache = { rates, fetchedAt: Date.now() }
    return rates
  } catch (err) {
    if (memoryCache) return memoryCache.rates
    throw err
  }
}

/** 测试 / 运维：清空内存缓存 */
export function resetFxRatesCacheForTests(): void {
  memoryCache = null
}
