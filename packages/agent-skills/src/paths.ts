import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveUserDataRoot } from '@opptrix/shared'
import { AgentSkillError } from './types.js'

const PKG_DIR = path.dirname(fileURLToPath(import.meta.url))

/** Builtin skills directory (copied next to dist at build time) */
export function resolveBuiltinSkillsDir(): string {
  const candidates = [
    path.join(PKG_DIR, 'builtin'),
    path.join(PKG_DIR, '..', 'builtin'),
  ]
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir
  }
  return candidates[0] ?? path.join(PKG_DIR, 'builtin')
}

/** User-installed skills: ~/.opptrix/agent-skills/ (or OPPTRIX_DATA_DIR) */
export function resolveUserSkillsDir(): string {
  return path.join(resolveUserDataRoot(), 'agent-skills')
}

export function ensureUserSkillsDir(): string {
  const dir = resolveUserSkillsDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Resolve a relative path under skillRoot; rejects `..` and absolute escapes.
 */
export function resolveConfinedPath(skillRoot: string, relativePath: string): string {
  const rel = String(relativePath ?? '').replace(/\\/g, '/').replace(/^\/+/, '')
  if (!rel || rel === '.' || rel.includes('\0')) {
    throw new AgentSkillError('文件路径无效', 'path_escape')
  }
  if (rel.split('/').some(p => p === '..')) {
    throw new AgentSkillError('不允许访问技能目录以外的路径', 'path_escape')
  }
  const root = path.resolve(skillRoot)
  const resolved = path.resolve(root, rel)
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`
  if (resolved !== root && !resolved.startsWith(prefix)) {
    throw new AgentSkillError('不允许访问技能目录以外的路径', 'path_escape')
  }
  return resolved
}
