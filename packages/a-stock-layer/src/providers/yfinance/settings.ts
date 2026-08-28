import { enabledOnlySettings } from '../common/settings.js'

export const YFINANCE_SETTINGS = enabledOnlySettings(
  'yfinance',
  'Yahoo Finance',
  'GLOBAL',
  {
    defaultEnabled: true,
    subtitle: '全球指数与跨市场个股行情，无需密钥',
    keywords: ['yahoo', 'yfinance', '全球指数', '道琼斯', '纳斯达克', '恒生', '日经'],
  },
)

/** Yahoo Finance API 主机 — 与 yahoo-finance2 默认一致 */
export const YFINANCE_QUERY_HOST = 'query2.finance.yahoo.com'

/** 同 host 两次请求最小间隔（ms），对齐全仓 hostnameLimiter 默认 1s */
const DEFAULT_QUEUE_INTERVAL_MS = 1000

/** 429 / 5xx 自动重试次数 */
const DEFAULT_MAX_RETRIES = 3

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function yfinanceQueueIntervalMs(): number {
  return parsePositiveInt(process.env.OPPTRIX_YFINANCE_QUEUE_INTERVAL_MS, DEFAULT_QUEUE_INTERVAL_MS)
}

export function yfinanceMaxRetries(): number {
  return parsePositiveInt(process.env.OPPTRIX_YFINANCE_MAX_RETRIES, DEFAULT_MAX_RETRIES)
}

export function yfinanceQuoteCombineDebounceMs(): number {
  return parsePositiveInt(process.env.OPPTRIX_YFINANCE_QUOTE_DEBOUNCE_MS, 80)
}

export function yfinanceQuoteCombineMaxSymbols(): number {
  return parsePositiveInt(process.env.OPPTRIX_YFINANCE_QUOTE_BATCH_SIZE, 50)
}
