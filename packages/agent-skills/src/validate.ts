/** Skill name rules per https://agentskills.io/specification */

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function isValidSkillName(name: string): boolean {
  if (!name || name.length < 1 || name.length > 64) return false
  if (name.startsWith('-') || name.endsWith('-')) return false
  if (name.includes('--')) return false
  return NAME_RE.test(name)
}

export function validateDescription(description: string): string | null {
  const d = description.trim()
  if (!d) return 'description 不能为空'
  if (d.length > 1024) return 'description 最长 1024 字符'
  return null
}

export function validateCompatibility(compatibility: string): string | null {
  const c = compatibility.trim()
  if (!c) return 'compatibility 不能为空'
  if (c.length > 500) return 'compatibility 最长 500 字符'
  return null
}
