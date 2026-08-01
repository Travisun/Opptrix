/**
 * Sanitize skill markdown body before injecting into system prompt.
 * Mirrors expert persona injection guards; allows longer content (skills ≈ 20k).
 */

const INJECTION_PATTERNS: RegExp[] = [
  /忽略.*规则/i,
  /无视.*规则/i,
  /可以荐股/i,
  /推荐买入|推荐卖出/i,
  /ignore\s+(all\s+)?rules/i,
  /you\s+may\s+recommend\s+(buy|sell)/i,
  /override\s+system/i,
  /<\/?\s*system\s*>/i,
  /\[\s*SYSTEM\s*\]/i,
]

export const MAX_SKILL_BODY_CHARS = 20_000

export function sanitizeSkillMarkdown(raw: string, opts?: { maxChars?: number }): string | null {
  const text = raw.replace(/\r\n/g, '\n').trim()
  if (!text) return null
  const max = opts?.maxChars ?? MAX_SKILL_BODY_CHARS
  const clipped = text.length > max ? `${text.slice(0, max)}\n\n…（正文已截断）` : text
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(clipped)) return null
  }
  return clipped
}

/** Returns true if content looks like prompt injection */
export function skillContentHasInjection(raw: string): boolean {
  const text = raw.replace(/\r\n/g, '\n')
  return INJECTION_PATTERNS.some(p => p.test(text))
}
