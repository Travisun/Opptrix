/**
 * Grant 内文本 grep — keywords(AND/OR) 或正则；跳过二进制与超大文件。
 */
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { WorkspaceError } from './errors.js'
import { globPatternToRegExp } from './workspace-glob.js'

export const DEFAULT_GREP_MAX_HITS = 50
export const MAX_GREP_MAX_HITS = 100
export const DEFAULT_GREP_MAX_FILE_BYTES = 2_000_000
export const MAX_CONTEXT_LINES = 2

const SKIP_DIR_NAMES = new Set([
  '.git',
  'node_modules',
  '__pycache__',
  '.venv',
  'venv',
  '.tox',
  '.mypy_cache',
  '.pytest_cache',
  'dist',
  'build',
  '.next',
  'coverage',
])

/** 明显二进制扩展名 — 跳过不读 */
const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.tif', '.tiff',
  '.pdf', '.zip', '.gz', '.tar', '.7z', '.rar', '.bz2', '.xz',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.o', '.a', '.class',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv', '.webm',
  '.sqlite', '.db', '.db-wal', '.db-shm',
  '.pyc', '.pyo', '.wasm',
])

export type GrepMatchMode = 'and' | 'or'

export type WorkspaceGrepHit = {
  path: string
  line: number
  content: string
  match?: string
}

export type WorkspaceGrepResult = {
  hits: WorkspaceGrepHit[]
  count: number
  truncated?: boolean
}

export type WorkspaceGrepParams = {
  /** 空格分词关键词；与 pattern 二选一 */
  keywords?: string
  matchMode?: GrepMatchMode
  /** 正则；与 keywords 二选一 */
  pattern?: string
  caseInsensitive?: boolean
  /** 限制文件的 glob（相对 grant 根） */
  glob?: string
  maxHits?: number
  contextLines?: number
  maxFileBytes?: number
}

function isUnderRoot(target: string, root: string): boolean {
  const rel = path.relative(root, target)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

async function realpathSafe(p: string): Promise<string> {
  try {
    return await fs.realpath(p)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return path.resolve(p)
    throw err
  }
}

function toPosixRel(rootAbs: string, abs: string): string {
  const rel = path.relative(rootAbs, abs)
  if (!rel || rel === '.') return ''
  return rel.split(path.sep).join('/')
}

export function clampGrepMaxHits(raw: number | undefined): number {
  const n = typeof raw === 'number' && Number.isFinite(raw)
    ? Math.trunc(raw)
    : DEFAULT_GREP_MAX_HITS
  return Math.max(1, Math.min(n, MAX_GREP_MAX_HITS))
}

export function clampContextLines(raw: number | undefined): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.trunc(raw) : 0
  return Math.max(0, Math.min(n, MAX_CONTEXT_LINES))
}

function looksBinaryByExt(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return BINARY_EXT.has(ext)
}

function bufferHasNul(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8192)
  for (let i = 0; i < n; i++) {
    if (buf[i] === 0) return true
  }
  return false
}

function splitKeywords(raw: string): string[] {
  return raw
    .split(/\s+/)
    .map(s => s.trim())
    .filter(Boolean)
}

function lineMatchesKeywords(
  line: string,
  keywords: string[],
  mode: GrepMatchMode,
  caseInsensitive: boolean,
): { ok: boolean; match?: string } {
  const hay = caseInsensitive ? line.toLowerCase() : line
  const kws = caseInsensitive ? keywords.map(k => k.toLowerCase()) : keywords
  if (mode === 'or') {
    for (const k of kws) {
      if (hay.includes(k)) return { ok: true, match: k }
    }
    return { ok: false }
  }
  for (const k of kws) {
    if (!hay.includes(k)) return { ok: false }
  }
  return { ok: true, match: keywords[0] }
}

function formatContentWithContext(
  lines: string[],
  matchIndex: number,
  contextLines: number,
): string {
  if (contextLines <= 0) return lines[matchIndex] ?? ''
  const from = Math.max(0, matchIndex - contextLines)
  const to = Math.min(lines.length - 1, matchIndex + contextLines)
  const parts: string[] = []
  for (let i = from; i <= to; i++) {
    const prefix = i === matchIndex ? '>' : ' '
    parts.push(`${prefix} ${String(i + 1).padStart(4, ' ')}|${lines[i] ?? ''}`)
  }
  return parts.join('\n')
}

function fileMatchesOptionalGlob(
  relPosix: string,
  basename: string,
  glob: string | undefined,
  re: RegExp | null,
): boolean {
  if (!glob || !re) return true
  const normalized = glob.replace(/\\/g, '/').replace(/^\/+/, '')
  const basenameOnly = !normalized.includes('/') && !normalized.includes('**')
  return basenameOnly ? re.test(basename) : re.test(relPosix)
}

/**
 * 在 rootAbs 下从 startAbs（文件或目录）搜索文本。
 */
export async function grepWithinRoot(
  rootAbs: string,
  startAbs: string,
  params: WorkspaceGrepParams,
): Promise<WorkspaceGrepResult> {
  const rootReal = await realpathSafe(rootAbs)
  const startReal = await realpathSafe(startAbs)
  if (!isUnderRoot(startReal, rootReal)) {
    throw new WorkspaceError('路径超出授权范围')
  }

  const keywordsRaw = params.keywords?.trim() ?? ''
  const patternRaw = params.pattern?.trim() ?? ''
  if (keywordsRaw && patternRaw) {
    throw new WorkspaceError('keywords 与 pattern 请二选一')
  }
  if (!keywordsRaw && !patternRaw) {
    throw new WorkspaceError('请提供 keywords 或 pattern')
  }

  const matchMode: GrepMatchMode = params.matchMode === 'or' ? 'or' : 'and'
  const caseInsensitive = params.caseInsensitive === true
  const maxHits = clampGrepMaxHits(params.maxHits)
  const contextLines = clampContextLines(params.contextLines)
  const maxFileBytes = typeof params.maxFileBytes === 'number' && Number.isFinite(params.maxFileBytes)
    ? Math.max(1, Math.min(Math.trunc(params.maxFileBytes), DEFAULT_GREP_MAX_FILE_BYTES))
    : DEFAULT_GREP_MAX_FILE_BYTES

  let lineRe: RegExp | null = null
  let keywords: string[] = []
  if (patternRaw) {
    try {
      lineRe = new RegExp(patternRaw, caseInsensitive ? 'i' : undefined)
    } catch {
      throw new WorkspaceError('正则表达式无效')
    }
  } else {
    keywords = splitKeywords(keywordsRaw)
    if (!keywords.length) {
      throw new WorkspaceError('keywords 不能为空')
    }
  }

  let fileGlobRe: RegExp | null = null
  if (params.glob?.trim()) {
    fileGlobRe = globPatternToRegExp(params.glob.trim())
  }

  const hits: WorkspaceGrepHit[] = []
  let truncated = false

  const searchFile = async (abs: string): Promise<void> => {
    if (truncated) return
    const rel = toPosixRel(rootReal, abs)
    if (!rel) return
    if (!fileMatchesOptionalGlob(rel, path.basename(abs), params.glob, fileGlobRe)) return
    if (looksBinaryByExt(abs)) return

    let st: fsSync.Stats
    try {
      st = await fs.stat(abs)
    } catch {
      return
    }
    if (!st.isFile()) return
    if (st.size > maxFileBytes) return

    let buf: Buffer
    try {
      buf = await fs.readFile(abs)
    } catch {
      return
    }
    if (buf.length > maxFileBytes) return
    if (bufferHasNul(buf)) return

    const text = buf.toString('utf8')
    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      if (truncated) return
      const line = lines[i] ?? ''
      let ok = false
      let match: string | undefined
      if (lineRe) {
        const m = lineRe.exec(line)
        if (m) {
          ok = true
          match = m[0]
        }
      } else {
        const r = lineMatchesKeywords(line, keywords, matchMode, caseInsensitive)
        ok = r.ok
        match = r.match
      }
      if (!ok) continue
      hits.push({
        path: rel,
        line: i + 1,
        content: formatContentWithContext(lines, i, contextLines),
        ...(match != null ? { match } : {}),
      })
      if (hits.length >= maxHits) {
        truncated = true
        return
      }
    }
  }

  async function walk(dirAbs: string): Promise<void> {
    if (truncated) return
    if (!isUnderRoot(dirAbs, rootReal)) return
    let entries: fsSync.Dirent[]
    try {
      entries = await fs.readdir(dirAbs, { withFileTypes: true })
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : ''
      if (code === 'ENOENT' || code === 'EACCES' || code === 'EPERM') return
      throw err
    }
    for (const ent of entries) {
      if (truncated) return
      if (ent.name === '.' || ent.name === '..') continue
      const child = path.join(dirAbs, ent.name)
      if (!isUnderRoot(child, rootReal)) continue

      let isDir = ent.isDirectory()
      let isFile = ent.isFile()
      if (ent.isSymbolicLink()) {
        try {
          const st = await fs.stat(child)
          isDir = st.isDirectory()
          isFile = st.isFile()
          const real = await fs.realpath(child)
          if (!isUnderRoot(real, rootReal)) continue
        } catch {
          continue
        }
      }
      if (isDir) {
        if (SKIP_DIR_NAMES.has(ent.name)) continue
        await walk(child)
        continue
      }
      if (isFile) await searchFile(child)
    }
  }

  let startStat: fsSync.Stats
  try {
    startStat = await fs.stat(startReal)
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : ''
    if (code === 'ENOENT') return { hits: [], count: 0 }
    throw err
  }

  if (startStat.isFile()) {
    await searchFile(startReal)
  } else {
    await walk(startReal)
  }

  return { hits, count: hits.length, ...(truncated ? { truncated: true } : {}) }
}
