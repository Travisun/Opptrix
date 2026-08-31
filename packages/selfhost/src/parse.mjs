/**
 * Lightweight argv parser for opptrix (no external deps).
 */

/**
 * @typedef {{
 *   command: string,
 *   args: string[],
 *   flags: Record<string, string | boolean>,
 * }} ParsedArgv
 */

/**
 * @param {string[]} argv process.argv.slice(2)
 * @returns {ParsedArgv}
 */
export function parseArgv(argv) {
  /** @type {Record<string, string | boolean>} */
  const flags = {}
  /** @type {string[]} */
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token === '--') {
      positional.push(...argv.slice(i + 1))
      break
    }
    if (token.startsWith('--')) {
      const eq = token.indexOf('=')
      if (eq > 0) {
        flags[token.slice(2, eq)] = token.slice(eq + 1)
        continue
      }
      const key = token.slice(2)
      const next = argv[i + 1]
      if (next && !next.startsWith('-')) {
        flags[key] = next
        i++
      } else {
        flags[key] = true
      }
      continue
    }
    if (token.startsWith('-') && token.length === 2) {
      const key = token.slice(1)
      const next = argv[i + 1]
      if (next && !next.startsWith('-') && key !== 'f') {
        flags[key] = next
        i++
      } else {
        flags[key] = true
      }
      continue
    }
    positional.push(token)
  }
  const command = positional[0] || 'help'
  return {
    command,
    args: positional.slice(1),
    flags,
  }
}

/**
 * @param {Record<string, string | boolean>} flags
 * @param {string[]} names
 * @returns {boolean}
 */
export function flagTrue(flags, ...names) {
  for (const name of names) {
    const v = flags[name]
    if (v === true || v === '1' || v === 'true' || v === 'yes') return true
  }
  return false
}

/**
 * @param {Record<string, string | boolean>} flags
 * @param {string[]} names
 * @returns {string | undefined}
 */
export function flagString(flags, ...names) {
  for (const name of names) {
    const v = flags[name]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return undefined
}
