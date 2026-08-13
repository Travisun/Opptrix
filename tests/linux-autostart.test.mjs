import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  DESKTOP_BASENAME,
  BACKGROUND_ARG,
  resolveAutostartDir,
  quoteExecPath,
  buildDesktopEntry,
  applyLinuxAutostart,
  probeLinuxAutostart,
} = require('../apps/desktop/electron/os-schedule/linux-autostart.cjs')

describe('linux-autostart XDG helpers', () => {
  /** @type {string} */
  let tmpHome
  /** @type {string} */
  let tmpConfig

  /** @type {string | undefined} */
  let prevXdgConfigHome

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-xdg-home-'))
    tmpConfig = path.join(tmpHome, 'config')
    fs.mkdirSync(tmpConfig, { recursive: true })
    prevXdgConfigHome = process.env.XDG_CONFIG_HOME
    delete process.env.XDG_CONFIG_HOME
  })

  afterEach(() => {
    if (prevXdgConfigHome === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = prevXdgConfigHome
    fs.rmSync(tmpHome, { recursive: true, force: true })
  })

  it('resolves XDG_CONFIG_HOME/autostart when provided', () => {
    assert.equal(
      resolveAutostartDir({ configHome: tmpConfig }),
      path.join(tmpConfig, 'autostart'),
    )
  })

  it('falls back to ~/.config/autostart', () => {
    process.env.XDG_CONFIG_HOME = path.join(tmpHome, 'env-config')
    assert.equal(
      resolveAutostartDir({ homedir: tmpHome, configHome: '' }),
      path.join(tmpHome, '.config', 'autostart'),
    )
  })

  it('uses process.env.XDG_CONFIG_HOME when configHome omitted', () => {
    process.env.XDG_CONFIG_HOME = tmpConfig
    assert.equal(
      resolveAutostartDir({ homedir: tmpHome }),
      path.join(tmpConfig, 'autostart'),
    )
  })

  it('quotes Exec paths with spaces', () => {
    assert.equal(quoteExecPath('/opt/Opptrix App/Opptrix'), '"/opt/Opptrix App/Opptrix"')
    assert.equal(quoteExecPath('/usr/bin/opptrix'), '/usr/bin/opptrix')
  })

  it('builds a desktop entry with --background', () => {
    const body = buildDesktopEntry({
      execPath: '/usr/bin/Opptrix',
      name: 'Opptrix',
    })
    assert.match(body, /^\[Desktop Entry\]/m)
    assert.match(body, new RegExp(`Exec=/usr/bin/Opptrix ${BACKGROUND_ARG}`))
    assert.match(body, /X-GNOME-Autostart-enabled=true/)
  })

  it('enable writes desktop file; disable removes it', () => {
    const opts = {
      configHome: tmpConfig,
      execPath: '/usr/bin/Opptrix',
      name: 'Opptrix',
    }
    const on = applyLinuxAutostart({ ...opts, enabled: true })
    assert.equal(on.ok, true)
    assert.equal(on.enabled, true)
    assert.equal(path.basename(on.path), DESKTOP_BASENAME)
    assert.equal(fs.existsSync(on.path), true)
    assert.equal(probeLinuxAutostart({ configHome: tmpConfig }).enabled, true)
    const text = fs.readFileSync(on.path, 'utf8')
    assert.match(text, /--background/)

    const off = applyLinuxAutostart({ ...opts, enabled: false })
    assert.equal(off.ok, true)
    assert.equal(off.enabled, false)
    assert.equal(fs.existsSync(on.path), false)
    assert.equal(probeLinuxAutostart({ configHome: tmpConfig }).enabled, false)
  })
})
