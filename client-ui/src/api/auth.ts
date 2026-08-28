import { jsonFetch } from './client'

export interface AuthSessionSummary {
  id: string
  expires_at: string
}

export interface AuthStatus {
  claimed: boolean
  auth_required: boolean
  local_access?: boolean
  totp_enabled?: boolean
  username?: string
  session?: AuthSessionSummary
  safe_mode?: boolean
}

export interface AuthDeviceSession {
  id: string
  label: string | null
  client_ip: string | null
  user_agent: string | null
  created_at: string
  last_seen_at: string
  expires_at: string
  desktop: boolean
}

export function getAuthStatus() {
  return jsonFetch<AuthStatus>('/auth/status')
}

export function setupOwnerAccount(username: string, password: string) {
  return jsonFetch<{ claimed: boolean; username?: string; session: AuthSessionSummary }>(
    '/auth/setup',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    },
  )
}

export function loginWithPassword(username: string, password: string) {
  return jsonFetch<{ totp_required: boolean; ticket?: string; session?: AuthSessionSummary }>(
    '/auth/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    },
  )
}

export function loginWithTotp(ticket: string, code: string) {
  return jsonFetch<{ session: AuthSessionSummary }>('/auth/login/totp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket, code }),
  })
}

export function logout() {
  return jsonFetch<{ ok: boolean }>('/auth/logout', { method: 'POST' })
}

export function listAuthSessions() {
  return jsonFetch<{ sessions: AuthDeviceSession[] }>('/auth/sessions')
}

export function revokeAuthSession(id: string) {
  return jsonFetch<{ ok: boolean }>(`/auth/sessions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export function beginTotpSetup() {
  return jsonFetch<{ otpauth_url: string; secret: string }>('/auth/totp/begin', {
    method: 'POST',
  })
}

export function confirmTotpSetup(code: string) {
  return jsonFetch<{ recovery_codes: string[] }>('/auth/totp/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
}

export function disableTotp(password: string, code: string) {
  return jsonFetch<{ ok: boolean; totp_enabled: boolean }>('/auth/totp/disable', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, code }),
  })
}

export function changeOwnerPassword(currentPassword: string, newPassword: string, totpCode?: string) {
  return jsonFetch<{ ok: boolean }>('/auth/password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
      totp_code: totpCode,
    }),
  })
}

export function submitAuthStepUp(code: string) {
  return jsonFetch<{ ok: boolean; step_up: boolean }>('/auth/step-up', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
}
