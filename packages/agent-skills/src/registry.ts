import fs from 'node:fs'
import path from 'node:path'
import { parseSkillMarkdown, serializeSkillMarkdown } from './parse.js'
import {
  ensureUserSkillsDir,
  resolveBuiltinSkillsDir,
  resolveConfinedPath,
  resolveUserSkillsDir,
} from './paths.js'
import { sanitizeSkillMarkdown, skillContentHasInjection } from './sanitize.js'
import { isValidSkillName } from './validate.js'
import {
  AgentSkillError,
  type AgentSkillDetail,
  type AgentSkillFrontmatter,
  type AgentSkillIndexEntry,
  type AgentSkillSource,
  type CreateSkillInput,
} from './types.js'

function readSkillFromDir(
  rootDir: string,
  source: AgentSkillSource,
  expectedName?: string,
): AgentSkillDetail | null {
  const skillMd = path.join(rootDir, 'SKILL.md')
  if (!fs.existsSync(skillMd)) return null
  let raw: string
  try {
    raw = fs.readFileSync(skillMd, 'utf8')
  } catch {
    return null
  }
  const dirName = expectedName ?? path.basename(rootDir)
  try {
    const parsed = parseSkillMarkdown(raw, { expectedDirName: dirName })
    return {
      name: parsed.frontmatter.name,
      description: parsed.frontmatter.description,
      source,
      rootDir,
      license: parsed.frontmatter.license,
      compatibility: parsed.frontmatter.compatibility,
      metadata: parsed.frontmatter.metadata,
      allowedTools: parsed.frontmatter.allowedTools,
      body: parsed.body,
      raw: parsed.raw,
    }
  } catch {
    return null
  }
}

function listDirSkills(baseDir: string, source: AgentSkillSource): AgentSkillIndexEntry[] {
  if (!fs.existsSync(baseDir)) return []
  let entries: string[]
  try {
    entries = fs.readdirSync(baseDir)
  } catch {
    return []
  }
  const out: AgentSkillIndexEntry[] = []
  for (const name of entries) {
    if (!isValidSkillName(name)) continue
    const rootDir = path.join(baseDir, name)
    let st: fs.Stats
    try {
      st = fs.statSync(rootDir)
    } catch {
      continue
    }
    if (!st.isDirectory()) continue
    const detail = readSkillFromDir(rootDir, source, name)
    if (!detail) continue
    out.push({
      name: detail.name,
      description: detail.description,
      source: detail.source,
      rootDir: detail.rootDir,
      license: detail.license,
      compatibility: detail.compatibility,
      metadata: detail.metadata,
      allowedTools: detail.allowedTools,
    })
  }
  return out
}

/** Discovery index: builtin + user (user overrides same name) */
export function listSkillIndex(): AgentSkillIndexEntry[] {
  const builtin = listDirSkills(resolveBuiltinSkillsDir(), 'builtin')
  const user = listDirSkills(resolveUserSkillsDir(), 'user')
  const map = new Map<string, AgentSkillIndexEntry>()
  for (const e of builtin) map.set(e.name, e)
  for (const e of user) map.set(e.name, e)
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function getSkill(name: string): AgentSkillDetail | null {
  const n = String(name ?? '').trim()
  if (!isValidSkillName(n)) return null
  const userRoot = path.join(resolveUserSkillsDir(), n)
  const fromUser = readSkillFromDir(userRoot, 'user', n)
  if (fromUser) return fromUser
  const builtinRoot = path.join(resolveBuiltinSkillsDir(), n)
  return readSkillFromDir(builtinRoot, 'builtin', n)
}

export function readSkillFile(name: string, relativePath: string): string {
  const skill = getSkill(name)
  if (!skill) throw new AgentSkillError(`未找到工作流技能「${name}」`, 'not_found')
  const abs = resolveConfinedPath(skill.rootDir, relativePath)
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    throw new AgentSkillError('技能内找不到该文件', 'not_found')
  }
  return fs.readFileSync(abs, 'utf8')
}

function writeSkillDir(
  name: string,
  fm: AgentSkillFrontmatter,
  body: string,
  source: AgentSkillSource,
): AgentSkillDetail {
  if (skillContentHasInjection(`${fm.description}\n${body}`)) {
    throw new AgentSkillError('技能内容包含不允许的指令，请修改后重试', 'injection')
  }
  const sanitizedBody = sanitizeSkillMarkdown(body)
  if (sanitizedBody == null && body.trim()) {
    throw new AgentSkillError('技能正文包含不允许的指令，请修改后重试', 'injection')
  }
  const base = ensureUserSkillsDir()
  const rootDir = path.join(base, name)
  if (fs.existsSync(rootDir)) {
    throw new AgentSkillError(`技能「${name}」已存在`, 'exists')
  }
  fs.mkdirSync(rootDir, { recursive: true })
  const markdown = serializeSkillMarkdown(fm, sanitizedBody ?? body)
  fs.writeFileSync(path.join(rootDir, 'SKILL.md'), markdown, 'utf8')
  const detail = readSkillFromDir(rootDir, source === 'builtin' ? 'user' : source, name)
  if (!detail) throw new AgentSkillError('写入后无法读取技能', 'invalid_frontmatter')
  return { ...detail, source }
}

export function createSkill(input: CreateSkillInput): AgentSkillDetail {
  const name = String(input.name ?? '').trim()
  if (!isValidSkillName(name)) {
    throw new AgentSkillError(
      '技能名称无效：仅小写字母、数字与连字符，1–64 字',
      'invalid_name',
    )
  }
  // reject overwrite of builtin name in user space? Spec allows user override by same name in user dir.
  // createSkill still creates under user dir; if user already has it → exists.
  const existingUser = path.join(resolveUserSkillsDir(), name)
  if (fs.existsSync(existingUser)) {
    throw new AgentSkillError(`技能「${name}」已存在`, 'exists')
  }
  const fm: AgentSkillFrontmatter = {
    name,
    description: String(input.description ?? '').trim(),
    license: input.license,
    compatibility: input.compatibility,
    metadata: input.metadata,
    allowedTools: input.allowedTools,
  }
  // validate via serialize roundtrip
  const markdown = serializeSkillMarkdown(fm, input.body ?? '')
  parseSkillMarkdown(markdown, { expectedDirName: name })
  return writeSkillDir(
    name,
    fm,
    input.body ?? '',
    input.source ?? 'user',
  )
}

export function installSkillFromMarkdown(
  markdown: string,
  opts?: { source?: Extract<AgentSkillSource, 'imported' | 'agent_created' | 'user'> },
): AgentSkillDetail {
  const parsed = parseSkillMarkdown(markdown)
  const source = opts?.source ?? 'imported'
  return writeSkillDir(parsed.frontmatter.name, parsed.frontmatter, parsed.body, source)
}

export function installSkillFromDir(
  dirPath: string,
  opts?: { source?: Extract<AgentSkillSource, 'imported' | 'user'> },
): AgentSkillDetail {
  const abs = path.resolve(dirPath)
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    throw new AgentSkillError('技能目录不存在', 'not_found')
  }
  const dirName = path.basename(abs)
  const skillMd = path.join(abs, 'SKILL.md')
  if (!fs.existsSync(skillMd)) {
    throw new AgentSkillError('目录中缺少技能说明文件', 'invalid_frontmatter')
  }
  const raw = fs.readFileSync(skillMd, 'utf8')
  const parsed = parseSkillMarkdown(raw, { expectedDirName: dirName })
  const detail = writeSkillDir(
    parsed.frontmatter.name,
    parsed.frontmatter,
    parsed.body,
    opts?.source ?? 'imported',
  )
  // copy optional subdirs
  for (const sub of ['scripts', 'references', 'assets'] as const) {
    const src = path.join(abs, sub)
    if (!fs.existsSync(src) || !fs.statSync(src).isDirectory()) continue
    copyDirSafe(src, path.join(detail.rootDir, sub))
  }
  return detail
}

/** Phase 1: zip install reserved — callers should unzip then installSkillFromDir */
export function installSkillFromZip(_zipPath: string): never {
  throw new AgentSkillError(
    '暂不支持直接导入压缩包，请解压后粘贴技能说明，或提供目录',
    'invalid_frontmatter',
  )
}

export function deleteUserSkill(name: string): { ok: true; name: string } {
  const n = String(name ?? '').trim()
  if (!isValidSkillName(n)) {
    throw new AgentSkillError('技能名称无效', 'invalid_name')
  }
  const builtin = path.join(resolveBuiltinSkillsDir(), n)
  const user = path.join(resolveUserSkillsDir(), n)
  const hasBuiltin = fs.existsSync(path.join(builtin, 'SKILL.md'))
  const hasUser = fs.existsSync(user)
  if (!hasUser) {
    if (hasBuiltin) {
      throw new AgentSkillError('内置工作流技能不可删除', 'builtin_readonly')
    }
    throw new AgentSkillError(`未找到工作流技能「${n}」`, 'not_found')
  }
  fs.rmSync(user, { recursive: true, force: true })
  return { ok: true, name: n }
}

function copyDirSafe(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '..' || entry.name.includes('\0')) continue
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDirSafe(from, to)
    else if (entry.isFile()) fs.copyFileSync(from, to)
  }
}

export function toPublicIndexEntry(e: AgentSkillIndexEntry) {
  return {
    name: e.name,
    description: e.description,
    source: e.source,
    license: e.license,
    compatibility: e.compatibility,
    metadata: e.metadata,
  }
}

export function toPublicDetail(d: AgentSkillDetail) {
  return {
    ...toPublicIndexEntry(d),
    body: d.body,
  }
}
