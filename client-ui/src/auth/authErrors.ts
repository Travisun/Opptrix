import { ApiHttpError } from '../api/client'
import {
  validateOwnerCredentialsInput,
  validatePasswordInput,
} from '@opptrix/shared/auth-credentials'

export function isAuthRequiredError(err: unknown): boolean {
  return err instanceof ApiHttpError && err.code === 'auth_required'
}

export function isStepUpRequiredError(err: unknown): boolean {
  return err instanceof ApiHttpError && err.code === 'step_up_required'
}

const CODE_COPY: Record<string, string> = {
  auth_required: '请先登录后再继续',
  step_up_required: '敏感操作需验证，请输入身份验证器中的 6 位数字',
  ticket_expired: '登录已过期，请重新输入密码',
  already_claimed: '账户已创建，请直接登录',
  rate_limited: '尝试过于频繁，请稍后再试',
  login_locked: '登录失败次数过多，请稍后再试',
  unclaimed: '还没有账户，可在引导或设置中创建',
  local_only: '当前环境仅限本机使用。请在本机打开，或先创建账户。',
}

export function formatAuthError(err: unknown): string {
  if (err instanceof ApiHttpError) {
    const msg = err.message.trim()
    // Server includes remaining minutes for lockouts — prefer that over generic copy.
    if (err.code === 'login_locked' && msg && !/^API error:/i.test(msg)) return msg
    if (err.code && CODE_COPY[err.code]) return CODE_COPY[err.code]
    if (msg && !/^API error:/i.test(msg)) return msg
  }
  if (err instanceof Error) {
    if (err.message === '请求超时') return '加载超时，请确认网络后重试'
    if (err.message.trim()) return err.message
  }
  return '暂时无法完成操作，请稍后重试'
}

export function validatePassword(password: string, confirm?: string): string | null {
  return validatePasswordInput(password, confirm)
}

export function validateOwnerCredentials(
  username: string,
  password: string,
  confirm?: string,
): string | null {
  return validateOwnerCredentialsInput(username, password, confirm)
}
