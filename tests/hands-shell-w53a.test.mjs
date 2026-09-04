import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

const ENFORCE_ENV = 'OPPTRIX_PLATFORM_PACK_ENFORCE'

const isWin = process.platform === 'win32'

describe('hands-port Wave 53A restricted shell.exec', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  /** @type {string | undefined} */
  let prevEnforceEnv

  beforeEach(async () => {
    prevEnforceEnv = process.env[ENFORCE_ENV]
    // Hands tokens map to coding pack; isolate from SF1 packEnforce default ON.
    process.env[ENFORCE_ENV] = '0'
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
    // hands.* → coding pack; enable so packEnforce ON cannot deny invoke
    platform.createPlatformContext().packs.enable('coding', true)
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
    if (prevEnforceEnv === undefined) {
      delete process.env[ENFORCE_ENV]
    } else {
      process.env[ENFORCE_ENV] = prevEnforceEnv
    }
  })

  async function invokeExec(argv) {
    const ctx = platform.createPlatformContext()
    const issued = ctx.hands.issue({
      token: 'hands.shell.exec',
      args: { argv },
    })
    assert.equal(issued.ok, true)
    if (!issued.ok) throw new Error('expected issue ok')
    const obs = await ctx.hands.invoke(issued.ticket)
    return { ctx, obs }
  }

  it('uname ok (darwin/linux) or unsupported_platform (win32)', async () => {
    const { obs } = await invokeExec(['uname'])
    if (isWin) {
      assert.equal(obs.ok, false)
      assert.equal(obs.denialCode, 'unsupported_platform')
      return
    }
    assert.equal(obs.ok, true)
    if (!obs.ok) throw new Error('expected invoke ok')
    const data = /** @type {{ exitCode?: number, stdout?: string, argv?: string[] }} */ (
      obs.data
    )
    assert.equal(data.exitCode, 0)
    assert.equal(data.argv?.[0], 'uname')
    assert.match(String(data.stdout ?? ''), /Darwin|Linux/)
    assert.equal(typeof obs.auditId, 'string')
  })

  it('echo literal ok', async () => {
    if (isWin) {
      const { obs } = await invokeExec(['echo', 'hello'])
      assert.equal(obs.ok, false)
      assert.equal(obs.denialCode, 'unsupported_platform')
      return
    }
    const { obs } = await invokeExec(['echo', 'hello-world'])
    assert.equal(obs.ok, true)
    if (!obs.ok) throw new Error('expected echo ok')
    const data = /** @type {{ exitCode?: number, stdout?: string }} */ (obs.data)
    assert.equal(data.exitCode, 0)
    assert.match(String(data.stdout ?? ''), /hello-world/)
  })

  it('reject rm / sh -c / metacharacters / empty argv', async () => {
    if (isWin) {
      // Still issueable; invoke denies platform before argv policy.
      const { obs } = await invokeExec(['rm', '-rf', '/'])
      assert.equal(obs.ok, false)
      assert.equal(obs.denialCode, 'unsupported_platform')
      return
    }

    const cases = [
      ['rm', '-rf', '/'],
      ['sh', '-c', 'echo hi'],
      ['echo', 'a|b'],
      ['echo', '$(uname)'],
      ['echo', '`id`'],
      ['uname', ';', 'id'],
      [],
    ]

    for (const argv of cases) {
      const { obs } = await invokeExec(argv)
      assert.equal(obs.ok, false, `expected deny for ${JSON.stringify(argv)}`)
      assert.notEqual(obs.denialCode, 'unsupported_platform')
    }
  })

  it('platform probe still works; free-form run/command denied at issue', async () => {
    const ctx = platform.createPlatformContext()
    const plat = ctx.hands.issue({ token: 'hands.shell.platform' })
    assert.equal(plat.ok, true)
    if (!plat.ok) throw new Error('expected platform ticket')
    const platObs = await ctx.hands.invoke(plat.ticket)
    assert.equal(platObs.ok, true)
    if (!platObs.ok) throw new Error('expected platform ok')
    const data = /** @type {{ platform?: string, arch?: string }} */ (platObs.data)
    assert.equal(data.platform, process.platform)
    assert.equal(data.arch, process.arch)

    for (const token of ['hands.shell.run', 'hands.shell.command', 'hands.shell.uname']) {
      const bad = ctx.hands.issue({ token, args: { argv: ['uname'] } })
      assert.equal(bad.ok, false, token)
    }
  })

  it('C-HANDS-SHELL-EXEC + ABI 0.9.0-phase-a', async () => {
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.9.0-phase-a')
    const ctx = platform.createPlatformContext()
    assert.equal(ctx.abiVersion, '0.9.0-phase-a')

    const issued = ctx.hands.issue({
      token: 'hands.shell.exec',
      args: { argv: ['uname'] },
    })
    assert.equal(issued.ok, true)
    if (!issued.ok) throw new Error('expected exec ticket')
    const obs = await ctx.hands.invoke(issued.ticket)
    if (isWin) {
      assert.equal(obs.ok, false)
      assert.equal(obs.denialCode, 'unsupported_platform')
    } else {
      assert.equal(obs.ok, true)
    }
  })
})
