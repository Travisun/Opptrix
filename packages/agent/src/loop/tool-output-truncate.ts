/**
 * 大工具输出落盘（对齐 OpenCode：约 2000 行 / 50KB 阈值）。
 * 写入 shared grant 下 tool-output/（可 workspace_read 续读），禁止引导读 deny 的 userData 根外路径。
 */
import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { resolveUserDataRoot } from '@opptrix/shared'

/** OpenCode 对标：行数阈值 */
export const TOOL_OUTPUT_MAX_LINES = 2_000
/** OpenCode 对标：字节阈值（约 50KB） */
export const TOOL_OUTPUT_MAX_BYTES = 50 * 1024
/** 落盘后预览保留行数 */
export const TOOL_OUTPUT_PREVIEW_LINES = 40
/** 落盘后预览保留字节 */
export const TOOL_OUTPUT_PREVIEW_BYTES = 4_096
/** 自动清理：超过此天数的落盘文件可删 */
export const TOOL_OUTPUT_RETENTION_DAYS = 7

const TOOL_OUTPUT_SUBDIR = 'tool-output'
/** 与 GrantStore SHARED_ROOT_ID 对齐 — workspace_read 续读用 */
export const TOOL_OUTPUT_ROOT_ID = 'shared'

/** 默认落盘根：agent-workspace/shared（会话 default/shared grant 可读） */
export function resolveToolOutputSpillRoot(userDataRoot = resolveUserDataRoot()): string {
  return path.join(userDataRoot, 'agent-workspace', 'shared')
}

export function resolveToolOutputDir(root = resolveToolOutputSpillRoot()): string {
  return path.join(root, TOOL_OUTPUT_SUBDIR)
}

export type TruncateToolOutputResult = {
  /** 回传给模型的字符串（可能为 preview + hint，或完整 JSON） */
  content: string
  truncated: boolean
  /** 相对 shared root 的路径，如 tool-output/xxx.json */
  relative_path?: string
  /** workspace_read 用的 root_id */
  root_id?: typeof TOOL_OUTPUT_ROOT_ID
  bytes?: number
  lines?: number
}

function countLines(text: string): number {
  if (!text) return 0
  let n = 1
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) n++
  }
  return n
}

function shouldSpill(text: string): boolean {
  if (Buffer.byteLength(text, 'utf8') > TOOL_OUTPUT_MAX_BYTES) return true
  return countLines(text) > TOOL_OUTPUT_MAX_LINES
}

function buildPreview(text: string): string {
  const byBytes = Buffer.byteLength(text, 'utf8') <= TOOL_OUTPUT_PREVIEW_BYTES
    ? text
    : text.slice(0, Math.min(text.length, TOOL_OUTPUT_PREVIEW_BYTES))
  const lines = byBytes.split('\n')
  if (lines.length <= TOOL_OUTPUT_PREVIEW_LINES) return byBytes
  return `${lines.slice(0, TOOL_OUTPUT_PREVIEW_LINES).join('\n')}\n…`
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
}

/**
 * 若输出过大则写入 `tool-output/<id>.json`（shared grant），返回带 preview 与续读提示的 JSON。
 * 写盘失败时回退为内存截断（仍可安全回传）。
 */
export function truncateToolOutputForModel(
  value: unknown,
  opts?: { toolName?: string; sessionId?: string },
): TruncateToolOutputResult {
  const s = typeof value === 'string' ? value : JSON.stringify(value, null, 0)
  if (!shouldSpill(s)) {
    return { content: s, truncated: false, bytes: Buffer.byteLength(s, 'utf8'), lines: countLines(s) }
  }

  const dir = resolveToolOutputDir()
  const id = `${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`
  const fileName = `${id}.json`
  const abs = path.join(dir, fileName)
  const relativePath = `${TOOL_OUTPUT_SUBDIR}/${fileName}`.replace(/\\/g, '/')

  try {
    ensureDir(dir)
    fs.writeFileSync(abs, s, 'utf8')
  } catch {
    const soft = `${s.slice(0, TOOL_OUTPUT_MAX_BYTES)}…[truncated]`
    return {
      content: soft,
      truncated: true,
      bytes: Buffer.byteLength(s, 'utf8'),
      lines: countLines(s),
    }
  }

  const preview = buildPreview(s)
  const bytes = Buffer.byteLength(s, 'utf8')
  const lines = countLines(s)
  const toolHint = opts?.toolName ? `（工具 ${opts.toolName}）` : ''
  const payload = {
    truncated: true,
    preview,
    root_id: TOOL_OUTPUT_ROOT_ID,
    relative_path: relativePath,
    bytes,
    lines,
    hint:
      `完整输出已落盘到公共工作区 ${relativePath}${toolHint}。`
      + `请用 workspace_read({ root_id: "${TOOL_OUTPUT_ROOT_ID}", path: "${relativePath}" }) 续读；`
      + '勿尝试读取应用数据目录外或未授权路径，勿臆造未读内容。',
    session_id: opts?.sessionId,
  }
  return {
    content: JSON.stringify(payload),
    truncated: true,
    relative_path: relativePath,
    root_id: TOOL_OUTPUT_ROOT_ID,
    bytes,
    lines,
  }
}

/**
 * 清理超过 retentionDays 的 tool-output 文件（启动时可调用；失败忽略）。
 * @param opts.root  spill 根目录（含 tool-output 子目录的父目录），默认 shared
 */
export function pruneToolOutputDir(opts?: {
  root?: string
  retentionDays?: number
  nowMs?: number
}): { removed: number; kept: number } {
  const dir = resolveToolOutputDir(opts?.root ?? resolveToolOutputSpillRoot())
  const days = opts?.retentionDays ?? TOOL_OUTPUT_RETENTION_DAYS
  const now = opts?.nowMs ?? Date.now()
  // retentionDays=0 → 清理全部（测试/强制）；否则按整天换算
  const maxAgeMs = days <= 0 ? 0 : days * 24 * 60 * 60 * 1000
  let removed = 0
  let kept = 0
  let names: string[]
  try {
    names = fs.readdirSync(dir)
  } catch {
    return { removed: 0, kept: 0 }
  }
  for (const name of names) {
    if (!name.endsWith('.json')) {
      kept++
      continue
    }
    const abs = path.join(dir, name)
    try {
      const st = fs.statSync(abs)
      if (!st.isFile()) {
        kept++
        continue
      }
      if (now - st.mtimeMs > maxAgeMs) {
        fs.unlinkSync(abs)
        removed++
      } else {
        kept++
      }
    } catch {
      kept++
    }
  }
  return { removed, kept }
}
