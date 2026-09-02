/**
 * Read/write compose.env while preserving comments and blank lines.
 */
import fs from 'node:fs'
import path from 'node:path'
import { composeEnvExamplePath, composeEnvPath, ensureComposeEnv } from './paths.mjs'

const ENV_LINE_RE = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/

/** Keys that affect container paths — changing them without recreate can break mounts. */
const PATH_ENV_KEYS = new Set([
  'OPPTRIX_HOME',
  'OPPTRIX_DATA_DIR',
  'OPPTRIX_AGENT_WORKSPACE_DIR',
  'OPPTRIX_MOUNTS_DIR',
  'OPPTRIX_MODELS_DIR',
  'OPPTRIX_SYSTEM_DIR',
  'OPPTRIX_SEED_ROOT',
  'OPPTRIX_LLM_DIR',
  'UI_DIST_PATH',
])

/**
 * @param {string} line
 * @returns {{ key: string, rawValue: string } | null}
 */
export function parseEnvLine(line) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null
  const m = ENV_LINE_RE.exec(trimmed)
  if (!m) return null
  return { key: m[1], rawValue: m[2] }
}

/**
 * @param {string} raw
 * @returns {string}
 */
export function unquoteEnvValue(raw) {
  const t = raw.trim()
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  if (t.length >= 2 && t.startsWith("'") && t.endsWith("'")) {
    return t.slice(1, -1)
  }
  return t
}

/**
 * @param {string} value
 * @returns {string}
 */
export function quoteEnvValue(value) {
  if (value === '') return '""'
  if (/[\s#"'\\]/.test(value)) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  }
  return value
}

/**
 * @param {string} content
 * @returns {Map<string, string>}
 */
export function readComposeEnvMap(content) {
  /** @type {Map<string, string>} */
  const map = new Map()
  for (const line of content.split('\n')) {
    const parsed = parseEnvLine(line)
    if (!parsed) continue
    map.set(parsed.key, unquoteEnvValue(parsed.rawValue))
  }
  return map
}

/**
 * @param {string[]} lines
 * @param {{ set?: Record<string, string>, unset?: string[] }} patch
 * @returns {string[]}
 */
export function patchComposeEnvLines(lines, patch) {
  const set = patch.set ?? {}
  const unsetSet = new Set(patch.unset ?? [])
  /** @type {Record<string, string>} */
  const pending = { ...set }
  /** @type {string[]} */
  const result = []

  for (const line of lines) {
    const parsed = parseEnvLine(line)
    if (!parsed) {
      result.push(line)
      continue
    }
    if (unsetSet.has(parsed.key)) continue
    if (Object.prototype.hasOwnProperty.call(pending, parsed.key)) {
      result.push(`${parsed.key}=${quoteEnvValue(pending[parsed.key])}`)
      delete pending[parsed.key]
      continue
    }
    result.push(line)
  }

  for (const [key, value] of Object.entries(pending)) {
    if (unsetSet.has(key)) continue
    result.push(`${key}=${quoteEnvValue(value)}`)
  }

  return result
}

/**
 * @param {string} filePath
 * @param {{ set?: Record<string, string>, unset?: string[] }} patch
 * @returns {{ path: string, changed: string[], removed: string[] }}
 */
export function writeComposeEnvPatch(filePath, patch) {
  const set = patch.set ?? {}
  const unset = patch.unset ?? []
  const prev = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''
  const lines = prev.length ? prev.split('\n') : []
  const nextLines = patchComposeEnvLines(lines, { set, unset })
  const normalized = nextLines.join('\n')
  const body = normalized.endsWith('\n') || normalized === '' ? normalized : `${normalized}\n`
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, body, 'utf8')
  return {
    path: filePath,
    changed: Object.keys(set),
    removed: [...unset],
  }
}

/**
 * @param {string} key
 * @returns {boolean}
 */
export function isSensitiveEnvKey(key) {
  return /(?:^|_)(KEY|TOKEN|SECRET|PASSWORD)(?:_|$)/i.test(key)
    || key === 'LLM_API_KEY'
    || key === 'HF_TOKEN'
}

/**
 * @param {string} key
 * @param {string} value
 * @returns {string}
 */
export function maskEnvValue(key, value) {
  if (!isSensitiveEnvKey(key)) return value
  if (!value) return '(empty)'
  if (value.length <= 4) return '****'
  return `${value.slice(0, 2)}…${value.slice(-2)} (${value.length} chars)`
}

/**
 * @param {string} examplePath
 * @returns {Set<string>}
 */
export function loadKnownEnvKeys(examplePath) {
  /** @type {Set<string>} */
  const keys = new Set()
  if (!fs.existsSync(examplePath)) return keys
  const text = fs.readFileSync(examplePath, 'utf8')
  for (const line of text.split('\n')) {
    const m = /^\s*#?\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)
    if (m) keys.add(m[1])
  }
  return keys
}

/**
 * @param {string} key
 * @param {Set<string>} known
 * @returns {string | null}
 */
export function warnUnknownEnvKey(key, known) {
  if (known.size === 0) return null
  if (known.has(key)) return null
  return `[opptrix] WARN: ${key} 不在 compose.env.example 中；请确认键名正确`
}

/**
 * @param {string} key
 * @returns {string | null}
 */
export function warnPathEnvKey(key) {
  if (!PATH_ENV_KEYS.has(key)) return null
  return `[opptrix] WARN: ${key} 影响容器内路径；修改后需重建容器，且勿与已有数据卷布局冲突`
}

/**
 * Parse KEY=VALUE tokens from CLI args.
 * @param {string[]} tokens
 * @returns {{ entries: Record<string, string>, errors: string[] }}
 */
export function parseEnvSetTokens(tokens) {
  /** @type {Record<string, string>} */
  const entries = {}
  /** @type {string[]} */
  const errors = []
  for (const token of tokens) {
    const eq = token.indexOf('=')
    if (eq <= 0) {
      errors.push(`无效项 "${token}"；请使用 KEY=VALUE 形式`)
      continue
    }
    const key = token.slice(0, eq).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      errors.push(`无效键名 "${key}"`)
      continue
    }
    entries[key] = token.slice(eq + 1)
  }
  return { entries, errors }
}

/**
 * Ensure compose.env exists and return its path.
 * @param {string} root
 */
export function resolveComposeEnvFile(root) {
  ensureComposeEnv(root)
  return composeEnvPath(root)
}

/**
 * @param {string} root
 * @returns {Set<string>}
 */
export function knownEnvKeysForRoot(root) {
  return loadKnownEnvKeys(composeEnvExamplePath(root))
}
