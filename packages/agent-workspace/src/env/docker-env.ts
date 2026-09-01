import fs from 'node:fs'
import path from 'node:path'

/** Docker 自托管：持久化卷约定（Agent 可见文案） */
export const DOCKER_PERSISTENCE_NOTE =
  'Docker 自托管：跨重启保留 `/opptrix` 下 private、models、system、workspace、mounts'
  + '（或旧版 `/data`、`/models`、`/system` 与 mounts）；'
  + '命令以受限用户 `opptrix-agent` 运行，无法读写私钥库与系统槽位；'
  + '重要产物请写入 workspace 或 mounts。'

export type AgentSandboxMode = 'off' | 'full'

export interface DockerAgentIdentity {
  uid: number
  gid: number
  user: string
}

export function isDockerEnv(): boolean {
  if (process.env.OPPTRIX_DOCKER === '1') return true
  try {
    return fs.existsSync('/.dockerenv')
  } catch {
    return false
  }
}

/**
 * Agent 命令沙箱：`off` = 无 SRT / 无 grant 硬围栏（Docker 默认，配合双用户 DAC）；
 * `full` = 工作区 grant 围栏。桌面端未设时默认 `full`。
 */
export function resolveAgentSandboxMode(): AgentSandboxMode {
  const raw = process.env.OPPTRIX_AGENT_SANDBOX?.trim().toLowerCase()
  if (raw === 'off' || raw === '0' || raw === 'false') return 'off'
  if (raw === 'full' || raw === '1' || raw === 'true') return 'full'
  if (isDockerEnv()) return 'off'
  return 'full'
}

function parseNonNegInt(raw: string | undefined): number | null {
  if (raw == null || raw.trim() === '') return null
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0) return null
  return n
}

/**
 * 解析 entrypoint 注入的 Agent 降权身份。
 * 仅 Docker；未配置或非法数字时返回 null（桌面 / 未引导镜像不降权）。
 */
export function resolveDockerAgentIdentity(): DockerAgentIdentity | null {
  if (!isDockerEnv()) return null
  const uid = parseNonNegInt(process.env.OPPTRIX_AGENT_UID)
  if (uid == null) return null
  const gid = parseNonNegInt(process.env.OPPTRIX_AGENT_GID) ?? uid
  const user = process.env.OPPTRIX_AGENT_USER?.trim() || 'opptrix-agent'
  return { uid, gid, user }
}

/**
 * 是否可对子进程 setuid/setgid。
 * 要求：Docker + 已注入 UID + 当前为 root + 非 SRT 逃生舱（避免破坏 wrap）。
 */
export function resolveDockerAgentDropIds(): { uid: number; gid: number } | null {
  const id = resolveDockerAgentIdentity()
  if (!id) return null
  if (process.platform === 'win32') return null
  const getuid = process.getuid
  if (typeof getuid !== 'function' || getuid() !== 0) return null
  const iso = process.env.OPPTRIX_SHELL_ISOLATION?.trim().toLowerCase()
  if (iso === 'srt') return null
  return { uid: id.uid, gid: id.gid }
}

function pathInsideOrEqual(child: string, parent: string): boolean {
  const c = path.resolve(child)
  const p = path.resolve(parent)
  return c === p || c.startsWith(`${p}${path.sep}`)
}

/** Agent 可写树（workspace / mounts）；供 chown 与 Deny 判断 */
export function isUnderDockerAgentWritableTree(absPath: string): boolean {
  const targets = [
    process.env.OPPTRIX_AGENT_WORKSPACE_DIR?.trim(),
    process.env.OPPTRIX_MOUNTS_DIR?.trim(),
  ].filter((p): p is string => Boolean(p))
  if (!targets.length) return false
  const resolved = path.resolve(absPath)
  return targets.some(root => pathInsideOrEqual(resolved, root))
}

/**
 * 服务进程（常为 root）在 Agent 可写树内创建文件/目录后，交给 opptrix-agent 组可写。
 * 失败静默（非 Docker / 非 root / 路径外）。
 */
export function maybeChownForDockerAgent(absPath: string): void {
  const drop = resolveDockerAgentDropIds()
  if (!drop) return
  if (!isUnderDockerAgentWritableTree(absPath)) return
  try {
    fs.chownSync(absPath, drop.uid, drop.gid)
  } catch {
    /* best-effort */
  }
}
