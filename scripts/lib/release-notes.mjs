/**
 * Load user-facing release notes from docs/releases/{version}.md
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_REPO_ROOT = path.resolve(__dirname, '..', '..')

/**
 * @param {string} markdown
 * @param {string} heading  e.g. 新功能
 * @returns {string[]}
 */
export function extractMarkdownSectionBullets(markdown, heading) {
  const text = String(markdown ?? '')
  const re = new RegExp(`^##\\s+${heading}\\s*$`, 'm')
  const match = re.exec(text)
  if (!match) return []
  const start = match.index + match[0].length
  const rest = text.slice(start)
  const next = rest.search(/^##\s+/m)
  const body = next >= 0 ? rest.slice(0, next) : rest
  /** @type {string[]} */
  const items = []
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*[-*]\s+(.+)$/)
    if (!m) continue
    const item = m[1].trim()
    if (!item || item === '无') continue
    items.push(item)
  }
  return items
}

/**
 * @param {string} markdown
 * @returns {{ features: string[], fixes: string[] }}
 */
export function parseReleaseNotesMarkdown(markdown) {
  return {
    features: extractMarkdownSectionBullets(markdown, '新功能'),
    fixes: extractMarkdownSectionBullets(markdown, '修复'),
  }
}

/**
 * @param {string} version  X.Y.Z
 * @param {string} [repoRoot]
 * @returns {{ features: string[], fixes: string[] }}
 */
export function loadReleaseNotesForVersion(version, repoRoot = DEFAULT_REPO_ROOT) {
  const v = String(version ?? '').trim().replace(/^v/i, '')
  const file = path.join(repoRoot, 'docs', 'releases', `${v}.md`)
  if (!fs.existsSync(file)) {
    return { features: [], fixes: [] }
  }
  try {
    return parseReleaseNotesMarkdown(fs.readFileSync(file, 'utf8'))
  } catch {
    return { features: [], fixes: [] }
  }
}

/**
 * One-line summary for narrow CLI columns.
 * @param {{ features: string[], fixes: string[] }} description
 */
export function summarizeReleaseDescription(description) {
  const first = description.features[0] ?? description.fixes[0]
  if (!first) return ''
  if (first.length <= 72) return first
  return `${first.slice(0, 69)}…`
}
