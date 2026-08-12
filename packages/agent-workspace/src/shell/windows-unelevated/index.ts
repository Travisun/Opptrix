/**
 * Windows unelevated（基础隔离）：RestrictedToken spawn；不走 SRT LogonW / WFP。
 */

import { WorkspaceError } from '../../errors.js'
import type { UnelevatedSpawnParams, UnelevatedSpawnResult } from './types.js'
import {
  probeRestrictedTokenApi,
  UNELEVATED_COMPONENT_UNAVAILABLE_MESSAGE,
} from './spawn-win32.js'

export type { UnelevatedSpawnParams, UnelevatedSpawnResult }
export {
  probeRestrictedTokenApi,
  UNELEVATED_COMPONENT_UNAVAILABLE_MESSAGE,
}

/** 用户向：完整网络隔离与基础隔离互斥 */
export const UNELEVATED_FULL_NETWORK_REJECT_MESSAGE =
  '基础隔离无法启用完整网络隔离。请改用完整隔离，或继续用确认与白名单控制出站访问。'

/**
 * unelevated 硬拒绝「与 elevated 同等的完整网络围栏」配置路径。
 * 调用方在进入 SandboxManager.initialize / 完整网络围栏路径前必须检查。
 */
export function assertUnelevatedRejectsFullNetworkIsolation(
  requireFullNetworkIsolation: boolean,
): void {
  if (requireFullNetworkIsolation) {
    throw new WorkspaceError(UNELEVATED_FULL_NETWORK_REJECT_MESSAGE)
  }
}

/**
 * 以 RestrictedToken 启动进程。非 win32 安全 stub；win32 走 CreateRestrictedToken + CreateProcessAsUserW。
 */
export async function spawnUnelevatedRestricted(
  params: UnelevatedSpawnParams,
): Promise<UnelevatedSpawnResult> {
  if (process.platform !== 'win32') {
    throw new WorkspaceError('当前系统不支持基础隔离')
  }
  if (!isUnelevatedSpawnSupported()) {
    throw new WorkspaceError(UNELEVATED_COMPONENT_UNAVAILABLE_MESSAGE)
  }
  const { spawnUnelevatedRestrictedWin32 } = await import('./spawn-win32.js')
  return spawnUnelevatedRestrictedWin32(params)
}

/** 是否支持在本机使用 RestrictedToken（koffi + token API 探测，不抛错） */
export function isUnelevatedSpawnSupported(): boolean {
  return process.platform === 'win32' && probeRestrictedTokenApi()
}
