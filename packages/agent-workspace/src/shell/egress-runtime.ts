import { assertAllowedHost } from '../ssrf.js'
import { WorkspaceError } from '../errors.js'
import { getPythonSettings } from '../python-settings-store.js'
import { normalizeEgressHost, type SessionNetworkEgressStore } from './session-network-egress.js'
import {
  isHostInConfiguredAllowlist,
  isHostInPackageInstallAllowlist,
} from './network-policy.js'
import { isEffectiveLanAllowed } from './session-lan-access.js'

export function detectNetworkEgressBlocked(
  exitCode: number | null,
  stdout: string,
  stderr: string,
): { blocked: boolean; suggestedHost?: string } {
  const combined = `${stdout}\n${stderr}`.toLowerCase()
  const blocked = /no matching config rule, denying|denied by config rule|network egress|connection refused|proxy.*denied|不允许访问|外网|egress/.test(combined)
    || (exitCode !== 0 && /econnrefused|enetunreach|operation not permitted/.test(combined))
  if (!blocked) return { blocked: false }

  const hostMatch = combined.match(/(?:host|domain|denying)[:\s]+([a-z0-9][a-z0-9.-]+\.[a-z]{2,})/i)
    ?? combined.match(/\b([a-z0-9][a-z0-9.-]+\.(?:com|cn|org|net|io|dev))\b/i)
  return {
    blocked: true,
    suggestedHost: hostMatch?.[1],
  }
}

export async function assertEgressHostGrantable(
  host: string,
  sessionId?: string,
): Promise<string> {
  const trimmed = normalizeEgressHost(host)
  if (!trimmed) throw new WorkspaceError('目标主机无效')
  const allowLan = isEffectiveLanAllowed(sessionId)
  await assertAllowedHost(new URL(`http://${trimmed}/`), { allowLan })
  return trimmed
}

/**
 * 免出站确认：会话 grant ∪ 永久配置白名单 ∪ 默认包源（决策 2）。
 * 任意其它 host 仍须确认；禁止全网放行。
 */
export function isEgressHostPreAuthorized(
  sessionId: string,
  host: string,
  egress: SessionNetworkEgressStore,
): boolean {
  if (egress.hasHost(sessionId, host)) return true
  if (isHostInConfiguredAllowlist(host, sessionId)) return true
  return isHostInPackageInstallAllowlist(host, getPythonSettings().pip_index_urls)
}

export function buildNeedsNetworkEgressPayload(
  suggestedHost: string | undefined,
): { message: string; suggested_host?: string } {
  if (suggestedHost) {
    return {
      message: `命令因出站访问受限而失败。请向用户确认是否允许访问 ${suggestedHost} 后重试，或改用 http_fetch 访问具体网址。`,
      suggested_host: suggestedHost,
    }
  }
  return {
    message: '命令因出站访问受限而失败。请向用户确认需访问的具体域名后重试，或改用 http_fetch 访问具体网址。',
  }
}
