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
import { isValidSkillName, mergeSkillReferences, validateSkillAttachmentFiles } from './validate.js'
import {
  AgentSkillError,
  type AgentSkillDetail,
  type AgentSkillFrontmatter,
  type AgentSkillIndexEntry,
  type AgentSkillSource,
  type CreateSkillInput,
  type SkillAttachmentFile,
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
      references: parsed.frontmatter.references,
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
      references: detail.references,
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

function writeSkillAttachments(rootDir: string, files: SkillAttachmentFile[]): void {
  for (const file of files) {
    const rel = file.path.replace(/\\/g, '/').replace(/^\/+/, '').trim()
    const abs = resolveConfinedPath(rootDir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, file.content, 'utf8')
  }
}

function writeSkillDir(
  name: string,
  fm: AgentSkillFrontmatter,
  body: string,
  source: AgentSkillSource,
  files?: SkillAttachmentFile[],
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
  if (files?.length) writeSkillAttachments(rootDir, files)
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
  const filesErr = validateSkillAttachmentFiles(input.files)
  if (filesErr) throw new AgentSkillError(filesErr, 'invalid_frontmatter')
  const filePaths = input.files?.map(f => f.path.replace(/\\/g, '/').replace(/^\/+/, '').trim()) ?? []
  let mergedRefs: string[] | undefined
  try {
    mergedRefs = mergeSkillReferences(input.references, filePaths)
  } catch (e) {
    throw new AgentSkillError(e instanceof Error ? e.message : 'references 无效', 'invalid_frontmatter')
  }
  const fm: AgentSkillFrontmatter = {
    name,
    description: String(input.description ?? '').trim(),
    license: input.license,
    compatibility: input.compatibility,
    metadata: input.metadata,
    allowedTools: input.allowedTools,
    references: mergedRefs,
  }
  // validate via serialize roundtrip
  const markdown = serializeSkillMarkdown(fm, input.body ?? '')
  parseSkillMarkdown(markdown, { expectedDirName: name })
  return writeSkillDir(
    name,
    fm,
    input.body ?? '',
    input.source ?? 'user',
    input.files,
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

/**
 * Fork a builtin skill into the user directory, making it editable.
 * The forked skill keeps the builtin body/references but is marked source='user'.
 */
export function forkBuiltinSkill(name: string): AgentSkillDetail {
  const n = String(name ?? '').trim()
  if (!isValidSkillName(n)) {
    throw new AgentSkillError('技能名称无效', 'invalid_name')
  }
  const builtinRoot = path.join(resolveBuiltinSkillsDir(), n)
  if (!fs.existsSync(path.join(builtinRoot, 'SKILL.md'))) {
    throw new AgentSkillError(`未找到工作流技能「${n}」`, 'not_found')
  }
  const userRoot = path.join(resolveUserSkillsDir(), n)
  if (fs.existsSync(userRoot)) {
    throw new AgentSkillError(`技能「${n}」已存在`, 'exists')
  }
  fs.mkdirSync(userRoot, { recursive: true })
  // copy SKILL.md and any references/scripts/assets subdirs
  for (const entry of fs.readdirSync(builtinRoot, { withFileTypes: true })) {
    if (entry.name === 'SKILL.md') {
      fs.copyFileSync(path.join(builtinRoot, 'SKILL.md'), path.join(userRoot, 'SKILL.md'))
    } else if (entry.isDirectory()) {
      copyDirSafe(path.join(builtinRoot, entry.name), path.join(userRoot, entry.name))
    }
  }
  const detail = readSkillFromDir(userRoot, 'user', n)
  if (!detail) {
    throw new AgentSkillError('写入后无法读取技能', 'invalid_frontmatter')
  }
  return detail
}

/**
 * Overwrite an existing user/imported/agent_created skill with new content.
 * Builtin skills cannot be edited — fork first.
 */
export function updateUserSkill(name: string, input: CreateSkillInput): AgentSkillDetail {
  const n = String(name ?? '').trim()
  if (!isValidSkillName(n)) {
    throw new AgentSkillError('技能名称无效', 'invalid_name')
  }
  const builtinRoot = path.join(resolveBuiltinSkillsDir(), n)
  const userRoot = path.join(resolveUserSkillsDir(), n)
  if (!fs.existsSync(userRoot)) {
    if (fs.existsSync(path.join(builtinRoot, 'SKILL.md'))) {
      throw new AgentSkillError('内置工作流技能不可编辑，请先 fork 后再修改', 'builtin_readonly')
    }
    throw new AgentSkillError(`未找到工作流技能「${n}」`, 'not_found')
  }
  const existing = readSkillFromDir(userRoot, 'user', n)
  const preservedSource = existing?.source === 'imported' || existing?.source === 'agent_created'
    ? existing.source
    : 'user'
  // remove old contents (keep dir) then rewrite
  for (const entry of fs.readdirSync(userRoot, { withFileTypes: true })) {
    fs.rmSync(path.join(userRoot, entry.name), { recursive: true, force: true })
  }
  const fm: AgentSkillFrontmatter = {
    name: n,
    description: String(input.description ?? '').trim(),
    license: input.license,
    compatibility: input.compatibility,
    metadata: input.metadata,
    allowedTools: input.allowedTools,
    references: input.references,
  }
  const sanitizedBody = sanitizeSkillMarkdown(input.body ?? '')
  if (sanitizedBody == null && (input.body ?? '').trim()) {
    throw new AgentSkillError('技能正文包含不允许的指令，请修改后重试', 'injection')
  }
  if (skillContentHasInjection(`${fm.description}\n${input.body ?? ''}`)) {
    throw new AgentSkillError('技能内容包含不允许的指令，请修改后重试', 'injection')
  }
  const markdown = serializeSkillMarkdown(fm, sanitizedBody ?? input.body ?? '')
  parseSkillMarkdown(markdown, { expectedDirName: n })
  fs.writeFileSync(path.join(userRoot, 'SKILL.md'), markdown, 'utf8')
  const detail = readSkillFromDir(userRoot, preservedSource, n)
  if (!detail) {
    throw new AgentSkillError('写入后无法读取技能', 'invalid_frontmatter')
  }
  return detail
}

/**
 * Resolve `@skill:name` cross-references in a skill body.
 * Returns the list of existing skill names referenced (deduped, excluding self).
 */
export function resolveSkillDependencies(name: string): string[] {
  const skill = getSkill(name)
  if (!skill) return []
  const re = /`@skill:([\w-]+)`/g
  const found = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = re.exec(skill.body)) !== null) {
    const dep = m[1]
    if (!dep || dep === name) continue
    if (getSkill(dep)) found.add(dep)
  }
  return [...found]
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
    references: e.references,
  }
}

export function toPublicDetail(d: AgentSkillDetail) {
  return {
    ...toPublicIndexEntry(d),
    body: d.body,
  }
}
