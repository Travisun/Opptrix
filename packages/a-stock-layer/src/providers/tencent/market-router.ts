/**
 * 腾讯 Provider 多市场线格式路由 — 单一 Driver 内按 wire 后的 symbol 形态分发。
 *
 * 架构：
 * - **L2** Engine `queryScoped` 按 (market, assetClass) binding 选中 tencent，并经 `provider-wire` 传入线格式
 * - **L1** `mixTencentUsEquity` / `mixTencentHkEquity` 在标准方法（realtime/kline/profile/stockList）上叠加路由
 * - **扩展** `ext.ts` 中 `tencentUs*` / `tencentHk*` 为无标准 capability 的详情字段（公告/分红等），供 Agent custom 与 Hub 详情 enrich
 *
 * Provider 不解析 `CN:SZ.000977` 命名空间；只识别 wire 后的 `sz000977` / `AAPL` / `00700`。
 */

import { isValidHkSymbol } from '../../utils/hk-market.js'
import { isValidUsSymbol } from '../../utils/us-market.js'
import { bareCnSymbol, isCnSecPrefixed } from '../../utils/helpers.js'

export type TencentWireMarket = 'CN' | 'US' | 'HK'

/** 根据 provider-wire 产出的线格式 symbol 判定市场（用于 Driver 内部分发） */
export function resolveTencentWireMarket(code: string): TencentWireMarket {
  const raw = String(code ?? '').trim()
  if (!raw) return 'CN'
  if (isCnSecPrefixed(raw)) return 'CN'
  const dotCn = /^(\d{6})\.(SH|SZ|BJ)$/i.exec(raw)
  if (dotCn) return 'CN'
  if (isValidHkSymbol(raw)) return 'HK'
  if (isValidUsSymbol(raw)) return 'US'
  return 'CN'
}

/** CN 线格式是否为 sec 符号（sh600519）— 已由 wire 构造，勿再 secFullCode */
export function isTencentCnSecWire(code: string): boolean {
  return isCnSecPrefixed(code)
}

/** 从任意 wire 入参提取用于 API 的裸码（CN 6 位 / US ticker / HK 5 位） */
export function bareTencentWireSymbol(code: string, market?: TencentWireMarket): string {
  const m = market ?? resolveTencentWireMarket(code)
  if (m === 'CN') return bareCnSymbol(code)
  return String(code).trim()
}
