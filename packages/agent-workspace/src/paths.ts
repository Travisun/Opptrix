import path from 'node:path'
import { resolveUserDataRoot } from '@opptrix/shared'

/** Agent 默认工作区根目录 */
export function resolveAgentWorkspaceRoot(): string {
  return path.join(resolveUserDataRoot(), 'agent-workspace')
}

/** 权限/Sticky 平面（Deny — 文件工具不可访问） */
export function resolveAgentPrivilegesRoot(): string {
  return path.join(resolveUserDataRoot(), 'agent-privileges')
}

export const DEFAULT_ROOT_ID = 'default'
