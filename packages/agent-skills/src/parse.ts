import { AgentSkillError, type AgentSkillFrontmatter, type ParseSkillResult } from './types.js'
import { isValidSkillName, validateDescription, validateCompatibility, validateReferences } from './validate.js'

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

/**
 * Minimal YAML frontmatter parser for Agent Skills fields.
 * Supports scalars, simple nested metadata maps, and quoted strings.
 */
export function parseSkillMarkdown(raw: string, opts?: { expectedDirName?: string }): ParseSkillResult {
  const text = raw.replace(/^\uFEFF/, '')
  const m = FRONTMATTER_RE.exec(text)
  if (!m) {
    throw new AgentSkillError(
      '技能说明格式无效：开头须含元数据区块（--- … ---）',
      'invalid_frontmatter',
    )
  }
  const yamlBlock = m[1] ?? ''
  const body = (m[2] ?? '').replace(/^\r?\n/, '')
  const map = parseSimpleYaml(yamlBlock)

  const nameRaw = map.name
  const descRaw = map.description
  if (typeof nameRaw !== 'string' || !nameRaw.trim()) {
    throw new AgentSkillError('缺少必填字段 name', 'invalid_frontmatter')
  }
  if (typeof descRaw !== 'string' || !descRaw.trim()) {
    throw new AgentSkillError('缺少必填字段 description', 'invalid_frontmatter')
  }

  const name = nameRaw.trim()
  if (!isValidSkillName(name)) {
    throw new AgentSkillError(
      '技能名称无效：仅小写字母、数字与连字符，1–64 字，且不首尾连字符、无连续 --',
      'invalid_name',
    )
  }
  if (opts?.expectedDirName && opts.expectedDirName !== name) {
    throw new AgentSkillError(
      `技能名称须与目录名一致（期望 ${opts.expectedDirName}）`,
      'invalid_name',
    )
  }

  const description = descRaw.trim()
  const descErr = validateDescription(description)
  if (descErr) throw new AgentSkillError(descErr, 'invalid_description')

  const frontmatter: AgentSkillFrontmatter = { name, description }

  if (typeof map.license === 'string' && map.license.trim()) {
    frontmatter.license = map.license.trim()
  }
  if (typeof map.compatibility === 'string' && map.compatibility.trim()) {
    const c = map.compatibility.trim()
    const cErr = validateCompatibility(c)
    if (cErr) throw new AgentSkillError(cErr, 'invalid_frontmatter')
    frontmatter.compatibility = c
  }
  if (map.metadata && typeof map.metadata === 'object' && !Array.isArray(map.metadata)) {
    const meta: Record<string, string> = {}
    for (const [k, v] of Object.entries(map.metadata)) {
      if (typeof v === 'string') meta[k] = v
      else if (typeof v === 'number' || typeof v === 'boolean') meta[k] = String(v)
    }
    if (Object.keys(meta).length) frontmatter.metadata = meta
  }
  const allowed = map['allowed-tools'] ?? map.allowedTools
  if (typeof allowed === 'string' && allowed.trim()) {
    frontmatter.allowedTools = allowed.trim()
  }
  if (Array.isArray(map.references)) {
    const refsErr = validateReferences(map.references)
    if (refsErr) throw new AgentSkillError(refsErr, 'invalid_frontmatter')
    const refs = (map.references as unknown[])
      .map(r => (typeof r === 'string' ? r.trim() : ''))
      .filter(r => r.length > 0)
    if (refs.length) frontmatter.references = refs
  }

  return { frontmatter, body, raw: text }
}

type YamlScalar = string | number | boolean
type YamlValue = YamlScalar | string[] | Record<string, YamlScalar>

function parseSimpleYaml(block: string): Record<string, YamlValue> {
  const lines = block.split(/\r?\n/)
  const root: Record<string, YamlValue> = {}
  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''
    if (!line.trim() || line.trim().startsWith('#')) {
      i += 1
      continue
    }
    const indent = leadingSpaces(line)
    if (indent > 0) {
      i += 1
      continue
    }
    const kv = matchKeyValue(line)
    if (!kv) {
      i += 1
      continue
    }
    if (kv.value === null) {
      // nested map or array — peek next non-blank line
      let j = i + 1
      while (j < lines.length) {
        const peek = lines[j] ?? ''
        if (!peek.trim() || peek.trim().startsWith('#')) {
          j += 1
          continue
        }
        break
      }
      const nextLine = lines[j] ?? ''
      const nextTrim = nextLine.trimStart()
      if (nextLine && leadingSpaces(nextLine) > 0 && nextTrim.startsWith('-')) {
        // array: collect indented `- item` lines
        const arr: string[] = []
        i += 1
        while (i < lines.length) {
          const child = lines[i] ?? ''
          if (!child.trim() || child.trim().startsWith('#')) {
            i += 1
            continue
          }
          const childIndent = leadingSpaces(child)
          if (childIndent === 0) break
          const childTrim = child.trimStart()
          if (!childTrim.startsWith('-')) break
          const item = childTrim.replace(/^-\s*/, '').trim()
          arr.push(unquote(item))
          i += 1
        }
        root[kv.key] = arr
        continue
      }
      // nested map
      const nested: Record<string, YamlScalar> = {}
      i += 1
      while (i < lines.length) {
        const child = lines[i] ?? ''
        if (!child.trim() || child.trim().startsWith('#')) {
          i += 1
          continue
        }
        const childIndent = leadingSpaces(child)
        if (childIndent === 0) break
        const childKv = matchKeyValue(child.trimStart())
        if (childKv && childKv.value !== null) {
          nested[childKv.key] = childKv.value
        }
        i += 1
      }
      root[kv.key] = nested
      continue
    }
    root[kv.key] = kv.value
    i += 1
  }
  return root
}

function leadingSpaces(s: string): number {
  const m = /^ */.exec(s)
  return m ? m[0].length : 0
}

function matchKeyValue(line: string): { key: string; value: string | null } | null {
  const m = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line)
  if (!m) return null
  const key = m[1] ?? ''
  const rest = (m[2] ?? '').trim()
  if (!rest) return { key, value: null }
  return { key, value: unquote(rest) }
}

function unquote(s: string): string {
  if (
    (s.startsWith('"') && s.endsWith('"'))
    || (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1)
  }
  return s
}

/** Serialize skill to SKILL.md text */
export function serializeSkillMarkdown(fm: AgentSkillFrontmatter, body: string): string {
  const lines: string[] = ['---', `name: ${fm.name}`, `description: ${yamlQuote(fm.description)}`]
  if (fm.license) lines.push(`license: ${yamlQuote(fm.license)}`)
  if (fm.compatibility) lines.push(`compatibility: ${yamlQuote(fm.compatibility)}`)
  if (fm.allowedTools) lines.push(`allowed-tools: ${yamlQuote(fm.allowedTools)}`)
  if (fm.references && fm.references.length) {
    lines.push('references:')
    for (const ref of fm.references) {
      lines.push(`  - ${yamlQuote(ref)}`)
    }
  }
  if (fm.metadata && Object.keys(fm.metadata).length) {
    lines.push('metadata:')
    for (const [k, v] of Object.entries(fm.metadata)) {
      lines.push(`  ${k}: ${yamlQuote(v)}`)
    }
  }
  lines.push('---', '')
  const bodyText = body.replace(/\r\n/g, '\n').replace(/^\n+/, '')
  return `${lines.join('\n')}${bodyText.endsWith('\n') ? bodyText : `${bodyText}\n`}`
}

function yamlQuote(s: string): string {
  if (/[:#{}[\],&*?|>!%@`]/.test(s) || s.includes('\n') || s.startsWith(' ') || s.endsWith(' ')) {
    return JSON.stringify(s)
  }
  return s
}
