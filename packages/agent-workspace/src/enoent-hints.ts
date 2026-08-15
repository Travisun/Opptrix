/**
 * ENOENT 分类提示 — 区分「目标文件缺失」与「命令 spawn 失败」，
 * 避免 LLM 把 open ENOENT 误当成 bash/PATH 问题。
 */
import { SPAWN_ENOENT_HINT } from './shell/resolve-shell-bin.js'

/** 文件 open / 一般路径 ENOENT 时给 Agent 的可行动提示 */
export const FILE_ENOENT_HINT =
  '目标文件不存在（不是 shell/PATH 故障）。'
  + '禁止绝对路径；请用 root_id（如 shared）+ 相对路径（如 data/cache/offline-k-meta.json）。'
  + '先 workspace_glob 确认；需新建则 workspace_write；勿反复打开同一缺失绝对路径。'

const ABS_USERDATA_PATH_RE =
  /(?:^|[\s'"`])(?:\/(?:Users|home)\/[^\s'"`]+\/\.opptrix|[A-Za-z]:\\(?:Users|users)\\[^\s'"`]+\\\.opptrix|\/[^\s'"`]*\.opptrix[\\/])/i

/** 错误文案含绝对 userData 路径时附加一句（勿写成 bash hint） */
export function appendRelativePathNudge(error: string): string {
  if (!ABS_USERDATA_PATH_RE.test(error)) return error
  if (/请改用相对路径/.test(error)) return error
  return `${error} 请改用相对路径。`
}

function isSpawnEnoent(message: string, errno: string): boolean {
  if (/找不到可执行文件/i.test(message)) return true
  // Node: "spawn /bin/bash ENOENT" / "spawnSync bash ENOENT"
  if (/\bspawn(?:Sync)?\b/i.test(message) && /ENOENT/i.test(message)) return true
  if (errno === 'ENOENT' && /\bspawn(?:Sync)?\b/i.test(message)) return true
  return false
}

function isFileEnoent(message: string, errno: string): boolean {
  if (isSpawnEnoent(message, errno)) return false
  if (/no such file or directory,\s*open\b/i.test(message)) return true
  if (/,\s*open\b/i.test(message) && /ENOENT|no such file/i.test(message)) return true
  if (errno === 'ENOENT') return true
  if (/ENOENT|no such file or directory/i.test(message)) return true
  return false
}

/**
 * 将 ENOENT 类错误映射为 SPAWN / FILE hint；非 ENOENT 返回 undefined。
 */
export function resolveEnoentToolHint(
  message: string,
  code?: string,
): typeof SPAWN_ENOENT_HINT | typeof FILE_ENOENT_HINT | undefined {
  const errno = code ?? ''
  if (isSpawnEnoent(message, errno)) return SPAWN_ENOENT_HINT
  if (isFileEnoent(message, errno)) return FILE_ENOENT_HINT
  return undefined
}
