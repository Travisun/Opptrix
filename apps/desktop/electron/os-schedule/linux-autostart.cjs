/**
 * Linux XDG Autostart (.desktop) — Electron setLoginItemSettings is a no-op on Linux.
 * Spec: https://specifications.freedesktop.org/autostart-spec/autostart-spec-latest.html
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const DESKTOP_BASENAME = 'opptrix.desktop'
const BACKGROUND_ARG = '--background'

/**
 * @param {{ configHome?: string, homedir?: string } | null | undefined} [opts]
 * @returns {string}
 */
function resolveAutostartDir(opts = {}) {
  const fromEnv =
    typeof opts.configHome === 'string' && opts.configHome.trim()
      ? opts.configHome.trim()
      : String(process.env.XDG_CONFIG_HOME ?? '').trim()
  if (fromEnv) return path.join(fromEnv, 'autostart')
  const home =
    typeof opts.homedir === 'string' && opts.homedir
      ? opts.homedir
      : os.homedir()
  return path.join(home, '.config', 'autostart')
}

/**
 * @param {string} dir
 * @returns {string}
 */
function desktopFilePath(dir) {
  return path.join(dir, DESKTOP_BASENAME)
}

/**
 * Escape a path for Desktop Entry Exec= (quote when needed).
 * @param {string} execPath
 * @returns {string}
 */
function quoteExecPath(execPath) {
  const p = String(execPath ?? '')
  if (!p) return '""'
  if (/[\s"$\\`]/.test(p)) {
    return `"${p.replace(/(["\\`$])/g, '\\$1')}"`
  }
  return p
}

/**
 * @param {{
 *   execPath: string
 *   name?: string
 *   comment?: string
 *   backgroundArg?: string
 * }} opts
 * @returns {string}
 */
function buildDesktopEntry(opts) {
  const name = opts.name?.trim() || 'Opptrix'
  const comment = opts.comment?.trim() || 'Opptrix'
  const arg = opts.backgroundArg ?? BACKGROUND_ARG
  const exec = `${quoteExecPath(opts.execPath)} ${arg}`.trim()
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Version=1.0',
    `Name=${name}`,
    `Comment=${comment}`,
    `Exec=${exec}`,
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n')
}

/**
 * @param {{
 *   enabled: boolean
 *   execPath: string
 *   name?: string
 *   comment?: string
 *   configHome?: string
 *   homedir?: string
 * }} opts
 * @returns {{ ok: boolean, enabled: boolean, path: string, error: string | null }}
 */
function applyLinuxAutostart(opts) {
  const dir = resolveAutostartDir(opts)
  const filePath = desktopFilePath(dir)
  try {
    if (opts.enabled) {
      const execPath = String(opts.execPath ?? '').trim()
      if (!execPath) {
        return { ok: false, enabled: false, path: filePath, error: 'missing_exec_path' }
      }
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(
        filePath,
        buildDesktopEntry({
          execPath,
          name: opts.name,
          comment: opts.comment,
        }),
        'utf8',
      )
      return { ok: true, enabled: true, path: filePath, error: null }
    }
    fs.rmSync(filePath, { force: true })
    return { ok: true, enabled: false, path: filePath, error: null }
  } catch (err) {
    return {
      ok: false,
      enabled: probeLinuxAutostart(opts).enabled,
      path: filePath,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * @param {{ configHome?: string, homedir?: string } | null | undefined} [opts]
 * @returns {{ enabled: boolean, path: string }}
 */
function probeLinuxAutostart(opts = {}) {
  const filePath = desktopFilePath(resolveAutostartDir(opts))
  try {
    return { enabled: fs.existsSync(filePath), path: filePath }
  } catch {
    return { enabled: false, path: filePath }
  }
}

module.exports = {
  DESKTOP_BASENAME,
  BACKGROUND_ARG,
  resolveAutostartDir,
  desktopFilePath,
  quoteExecPath,
  buildDesktopEntry,
  applyLinuxAutostart,
  probeLinuxAutostart,
}
