/**
 * Local owner username / password rules — shared by UI and server.
 *
 * Username: ≥5 chars; English letters + digits (+ common symbols); email allowed.
 * Password: ≥8 chars; upper + lower + digit + special symbol.
 */

export const AUTH_USERNAME_MIN = 5
export const AUTH_USERNAME_MAX = 64
export const AUTH_PASSWORD_MIN = 8
export const AUTH_PASSWORD_MAX = 128

/** Letters, digits, and common symbols (incl. email-safe set). No CJK / spaces. */
const USERNAME_CHAR_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~@-]+$/

const EMAIL_RE =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/

const PASSWORD_SPECIAL_RE = /[^A-Za-z0-9]/

export type UsernameCheckKey = 'length' | 'charset' | 'comboOrEmail'

export type PasswordCheckKey = 'length' | 'lower' | 'upper' | 'digit' | 'special'

export type CredentialCheck = {
  key: string
  label: string
  ok: boolean
}

export function isEmailLikeUsername(username: string): boolean {
  return EMAIL_RE.test(username.trim())
}

export function analyzeUsername(raw: string): {
  checks: CredentialCheck[]
  ok: boolean
  error: string | null
} {
  const u = raw.trim()
  const lengthOk = u.length >= AUTH_USERNAME_MIN && u.length <= AUTH_USERNAME_MAX
  const charsetOk = u.length === 0 ? false : USERNAME_CHAR_RE.test(u)
  const emailOk = isEmailLikeUsername(u)
  const comboOk = /[A-Za-z]/.test(u) && /[0-9]/.test(u)
  const comboOrEmailOk = emailOk || comboOk

  const checks: CredentialCheck[] = [
    { key: 'length', label: `至少 ${AUTH_USERNAME_MIN} 位`, ok: u.length >= AUTH_USERNAME_MIN },
    { key: 'charset', label: '仅英文、数字与常用符号', ok: charsetOk },
    { key: 'comboOrEmail', label: '英文+数字组合，或有效邮箱', ok: comboOrEmailOk },
  ]

  let error: string | null = null
  if (!u) error = '请填写用户名'
  else if (u.length > AUTH_USERNAME_MAX) error = '用户名过长，请缩短后再试'
  else if (u.length < AUTH_USERNAME_MIN) error = `用户名至少 ${AUTH_USERNAME_MIN} 位`
  else if (!charsetOk) error = '用户名仅支持英文、数字与常用符号（可用邮箱）'
  else if (u.includes('@') && !emailOk) error = '邮箱格式不正确'
  else if (!comboOrEmailOk) error = '用户名需同时包含英文与数字，或使用邮箱'

  return { checks, ok: error == null && lengthOk && charsetOk && comboOrEmailOk, error }
}

export function analyzePassword(password: string): {
  checks: CredentialCheck[]
  ok: boolean
  error: string | null
} {
  const lengthOk = password.length >= AUTH_PASSWORD_MIN && password.length <= AUTH_PASSWORD_MAX
  const lowerOk = /[a-z]/.test(password)
  const upperOk = /[A-Z]/.test(password)
  const digitOk = /[0-9]/.test(password)
  const specialOk = PASSWORD_SPECIAL_RE.test(password)

  const checks: CredentialCheck[] = [
    { key: 'length', label: `至少 ${AUTH_PASSWORD_MIN} 位`, ok: password.length >= AUTH_PASSWORD_MIN },
    { key: 'lower', label: '包含小写字母', ok: lowerOk },
    { key: 'upper', label: '包含大写字母', ok: upperOk },
    { key: 'digit', label: '包含数字', ok: digitOk },
    { key: 'special', label: '包含特殊符号', ok: specialOk },
  ]

  let error: string | null = null
  if (!password) error = '请填写密码'
  else if (password.length > AUTH_PASSWORD_MAX) error = '密码过长，请缩短后再试'
  else if (password.length < AUTH_PASSWORD_MIN) error = `密码至少 ${AUTH_PASSWORD_MIN} 位`
  else if (!lowerOk) error = '密码需包含小写字母'
  else if (!upperOk) error = '密码需包含大写字母'
  else if (!digitOk) error = '密码需包含数字'
  else if (!specialOk) error = '密码需包含特殊符号（如 !@# 等）'

  return {
    checks,
    ok: error == null && lengthOk && lowerOk && upperOk && digitOk && specialOk,
    error,
  }
}

export function validateUsernameInput(raw: string): string | null {
  return analyzeUsername(raw).error
}

export function validatePasswordInput(password: string, confirm?: string): string | null {
  const analyzed = analyzePassword(password)
  if (analyzed.error) return analyzed.error
  if (confirm !== undefined && password !== confirm) return '两次输入的密码不一致'
  return null
}

export function validateOwnerCredentialsInput(
  username: string,
  password: string,
  confirm?: string,
): string | null {
  return validateUsernameInput(username) ?? validatePasswordInput(password, confirm)
}

/** Normalize username for storage; throws Error with user-facing Chinese message. */
export function normalizeOwnerUsername(username: string): string {
  const u = username.trim()
  const err = validateUsernameInput(u)
  if (err) throw new Error(err)
  return u
}

/** Assert password strength; throws Error with user-facing Chinese message. */
export function assertOwnerPassword(password: string): void {
  const err = validatePasswordInput(password)
  if (err) throw new Error(err)
}
