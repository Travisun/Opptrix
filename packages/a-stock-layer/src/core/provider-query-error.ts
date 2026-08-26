/**
 * Provider 查询错误分类 — 决定熔断记分 vs 仅观测换源。
 *
 * - transport / auth → recordFailure（计熔断）
 * - business / rate_limited → recordEmptyMiss（不计熔断）
 * - auth 另含真认证失败；「积分不足 / 无接口权限」等归 business，勿当 auth
 */

export type ProviderQueryErrorClass =
  | 'transport'
  | 'auth'
  | 'business'
  | 'rate_limited'

function errorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('status' in error)) return undefined
  const status = Number((error as { status: unknown }).status)
  return Number.isFinite(status) ? status : undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? '')
}

/**
 * 分类 Provider 查询错误。
 * 顺序：rate_limited → auth（窄）→ business → transport → 默认 business（宁可不熔断）。
 */
export function classifyProviderQueryError(error: unknown): ProviderQueryErrorClass {
  const msg = errorMessage(error)
  const status = errorStatus(error)

  if (
    status === 429
    || /\b429\b|HTTP\s*429|quota|rate\s*limit|too\s*many|配额|额度用尽|限流|请求过于频繁|credit/i.test(msg)
  ) {
    return 'rate_limited'
  }

  // 真认证：401 / invalid key / 鉴权 / 密钥 — 不含 403、积分不足、无接口权限
  if (
    status === 401
    || /\b401\b|HTTP\s*401/i.test(msg)
    || /unauthorized|invalid\s+api\s*key|鉴权失败|密钥无效|密钥错误|ZzshareAuthError/i.test(msg)
    || /authentication\s+(failed|error)|invalid\s+token|api\s*key.*(invalid|expired)/i.test(msg)
  ) {
    return 'auth'
  }

  if (
    status === 403
    || /\b403\b|HTTP\s*403/i.test(msg)
    || /NO_[A-Z0-9_]+_PERMISSION/.test(msg)
    || /积分不足|无权限|权限不足|无接口访问权限|订阅/i.test(msg)
    || /permission\s+denied|not\s+authorized|insufficient\s+privilege/i.test(msg)
    || /not\s+found|invalid\s+argument|invalid\s+parameter|参数非法|标的不存在|FuyaoFundNotFound/i.test(msg)
  ) {
    return 'business'
  }

  if (
    (status !== undefined && status >= 500)
    || /\b5\d\d\b|HTTP\s+\d{3}/i.test(msg)
    || /ECONN|ETIMEDOUT|ENOTFOUND|ECONNRESET|fetch\s+failed|timeout|超时/i.test(msg)
    || /无法连接|connection\s+refused|socket\s+hang\s+up|connect\s+failed/i.test(msg)
  ) {
    return 'transport'
  }

  return 'business'
}
