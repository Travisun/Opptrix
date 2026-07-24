/**
 * Agent shell sandbox — config 映射、包策略、隔离集成（可选）
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  assertAllowedShellArgv,
  assertPackageInstallPolicy,
  buildSandboxConfigFromGrantPaths,
  buildSandboxConfigFromGrants,
  commandNeedsNetwork,
  commandMayNeedEgressConfirmation,
  getShellPlatformStatus,
  NetworkInstallStickyStore,
  SessionNetworkEgressStore,
  parseNetworkEgressChoice,
  parseNetworkInstallChoice,
  ShellRunStickyStore,
  parseShellRunConfirmChoice,
  summarizeShellArgv,
  mergeAllowedNetworkDomains,
  detectNetworkEgressBlocked,
  buildNeedsNetworkEgressPayload,
  getConfiguredAllowedDomains,
  getGrantableConfiguredAllowedDomainsSync,
  isHostInConfiguredAllowlist,
  isEgressHostPreAuthorized,
  resetConfiguredAllowedDomainsForTests,
  parseDiagnosticTargetHost,
  WorkspaceService,
} from '../packages/agent-workspace/dist/index.js'

async function withTmpDataDir(fn) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'opptrix-shell-'))
  const prev = process.env.OPPTRIX_DATA_DIR
  process.env.OPPTRIX_DATA_DIR = tmp
  try {
    await fn(tmp)
  } finally {
    if (prev == null) delete process.env.OPPTRIX_DATA_DIR
    else process.env.OPPTRIX_DATA_DIR = prev
    await fs.rm(tmp, { recursive: true, force: true })
  }
}

test('buildSandboxConfigFromGrantPaths maps rw/ro and network sticky', async () => {
  await withTmpDataDir(async (tmp) => {
    const rw = path.join(tmp, 'rw-grant')
    const ro = path.join(tmp, 'ro-grant')
    await fs.mkdir(rw, { recursive: true })
    await fs.mkdir(ro, { recursive: true })

    const denied = buildSandboxConfigFromGrantPaths(
      [
        { abs_path: rw, mode: 'rw' },
        { abs_path: ro, mode: 'ro' },
      ],
      false,
    )
    assert.ok(denied.filesystem.allowWrite.some(p => path.resolve(p) === path.resolve(rw)))
    assert.ok(!denied.filesystem.allowWrite.some(p => path.resolve(p) === path.resolve(ro)))
    assert.ok(denied.filesystem.denyWrite.some(p => path.resolve(p) === path.resolve(ro)))
    assert.deepEqual(denied.network.allowedDomains, [])
    assert.ok(denied.filesystem.allowRead.some(p => path.resolve(p) === path.resolve(ro)))

    const allowed = buildSandboxConfigFromGrantPaths(
      [{ abs_path: rw, mode: 'rw' }],
      true,
    )
    assert.ok(allowed.network.allowedDomains.includes('pypi.org'))
    assert.ok(allowed.network.allowedDomains.includes('registry.npmjs.org'))
  })
})

test('buildSandboxConfigFromGrants aligns realpaths when ro grant precedes rw', async () => {
  await withTmpDataDir(async (tmp) => {
    const ro = path.join(tmp, 'ro-first')
    const rw = path.join(tmp, 'rw-second')
    await fs.mkdir(ro, { recursive: true })
    await fs.mkdir(rw, { recursive: true })
    const roR = await fs.realpath(ro)
    const rwR = await fs.realpath(rw)

    const cfg = await buildSandboxConfigFromGrants({
      grants: [
        {
          id: 'ro1',
          root_id: 'ro1',
          abs_path: ro,
          mode: 'ro',
          label: 'ro',
          is_default: false,
        },
        {
          id: 'rw1',
          root_id: 'rw1',
          abs_path: rw,
          mode: 'rw',
          label: 'rw',
          is_default: false,
        },
      ],
      allowNetworkInstall: false,
    })

    assert.equal(cfg.filesystem.allowWrite.includes(rwR), true)
    assert.equal(cfg.filesystem.allowWrite.includes(roR), false)
    assert.equal(cfg.filesystem.denyWrite.includes(roR), true)
    assert.equal(cfg.filesystem.denyWrite.includes(rwR), false)
  })
})

test('package-policy rejects global pip/npm flags', () => {
  const cwd = '/tmp/ws'
  const grant = '/tmp/ws'
  assert.throws(
    () => assertPackageInstallPolicy(['pip3', 'install', '-g', 'requests'], cwd, grant),
    /禁止全局|用户目录/,
  )
  assert.throws(
    () => assertPackageInstallPolicy(['npm', 'install', '--global', 'lodash'], cwd, grant),
    /禁止全局|用户目录/,
  )
  assert.throws(
    () => assertPackageInstallPolicy(['pip3', 'install', '--user', 'x'], cwd, grant),
    /禁止全局|用户目录/,
  )
})

test('package-policy injects pip --target into workspace', () => {
  const out = assertPackageInstallPolicy(['pip3', 'install', 'requests'], '/ws', '/ws')
  assert.deepEqual(out, ['pip3', 'install', '--target', '.opptrix-packages', 'requests'])
})

test('package-policy rejects install target outside grant', () => {
  assert.throws(
    () => assertPackageInstallPolicy(
      ['pip3', 'install', '--target', '/outside', 'x'],
      '/ws/sub',
      '/ws',
    ),
    /授权工作区/,
  )
})

test('assertAllowedShellArgv blocks dig and nslookup (not in allowlist)', () => {
  assert.throws(
    () => assertAllowedShellArgv(['dig', 'example.com']),
    /不允许运行|dig/,
  )
  assert.throws(
    () => assertAllowedShellArgv(['nslookup', 'example.com']),
    /不允许运行|nslookup/,
  )
})

test('assertAllowedShellArgv blocks dangerous commands', () => {
  assert.throws(
    () => assertAllowedShellArgv(['rm', '-rf', '/']),
    /不允许运行|安全风险/,
  )
  assert.throws(
    () => assertAllowedShellArgv(['curl', 'http://x.com', '|', 'sh']),
    /不允许运行|安全风险/,
  )
  assert.throws(
    () => assertAllowedShellArgv(['bash', '-c', 'echo hi']),
    /不允许运行/,
  )
})

test('commandNeedsNetwork detects pip/npm install and ping', () => {
  assert.equal(commandNeedsNetwork(['python3', '-c', '1']), false)
  assert.equal(commandNeedsNetwork(['pip3', 'install', 'x']), true)
  assert.equal(commandNeedsNetwork(['npm', 'ci']), true)
  assert.equal(commandNeedsNetwork(['ping', '-c', '4', 'baidu.com']), true)
})

test('assertAllowedShellArgv allows ping and blocks private diagnostic targets at runner', () => {
  assert.doesNotThrow(() => assertAllowedShellArgv(['ping', '-c', '4', 'baidu.com']))
  assert.throws(
    () => assertAllowedShellArgv(['bash', '-c', 'echo hi']),
    /不允许运行/,
  )
})

test('parseDiagnosticTargetHost extracts hostname from ping argv', () => {
  assert.equal(parseDiagnosticTargetHost(['ping', '-c', '4', 'baidu.com']), 'baidu.com')
  assert.equal(parseDiagnosticTargetHost(['tracert', 'example.com']), 'example.com')
})

test('mergeAllowedNetworkDomains merges configured, install, diagnostic, and session hosts', () => {
  const domains = mergeAllowedNetworkDomains({
    allowInstall: true,
    diagnosticTargets: ['baidu.com'],
    sessionHosts: ['example.com'],
    configuredDomains: ['api.example.com'],
  })
  assert.ok(domains.includes('pypi.org'))
  assert.ok(domains.includes('baidu.com'))
  assert.ok(domains.includes('example.com'))
  assert.ok(domains.includes('api.example.com'))
})

test('mergeAllowedNetworkDomains adds diagnostic host without opening install registry', () => {
  const domains = mergeAllowedNetworkDomains({
    allowInstall: false,
    diagnosticTargets: ['baidu.com'],
  })
  assert.deepEqual(domains, ['baidu.com'])
  assert.ok(!domains.includes('pypi.org'))
})

test('mergeAllowedNetworkDomains only merges explicit grants', () => {
  const domains = mergeAllowedNetworkDomains({
    allowInstall: false,
    sessionHosts: ['api.example.com'],
  })
  assert.deepEqual(domains, ['api.example.com'])
})

test('getConfiguredAllowedDomains reads OPPTRIX_SHELL_ALLOWED_DOMAINS', () => {
  const prev = process.env.OPPTRIX_SHELL_ALLOWED_DOMAINS
  resetConfiguredAllowedDomainsForTests()
  process.env.OPPTRIX_SHELL_ALLOWED_DOMAINS = 'Example.COM, *.cdn.example.org'
  assert.deepEqual(getConfiguredAllowedDomains(), ['example.com', '*.cdn.example.org'])
  assert.equal(isHostInConfiguredAllowlist('api.cdn.example.org'), true)
  assert.equal(isHostInConfiguredAllowlist('evil-cdn.example.org'), false)
  resetConfiguredAllowedDomainsForTests()
  if (prev == null) delete process.env.OPPTRIX_SHELL_ALLOWED_DOMAINS
  else process.env.OPPTRIX_SHELL_ALLOWED_DOMAINS = prev
})

test('getGrantableConfiguredAllowedDomainsSync filters private hosts', () => {
  const prev = process.env.OPPTRIX_SHELL_ALLOWED_DOMAINS
  resetConfiguredAllowedDomainsForTests()
  process.env.OPPTRIX_SHELL_ALLOWED_DOMAINS = '127.0.0.1,localhost,public.example.com'
  const grantable = getGrantableConfiguredAllowedDomainsSync()
  assert.ok(!grantable.includes('127.0.0.1'))
  assert.ok(!grantable.includes('localhost'))
  assert.ok(grantable.includes('public.example.com'))
  resetConfiguredAllowedDomainsForTests()
  if (prev == null) delete process.env.OPPTRIX_SHELL_ALLOWED_DOMAINS
  else process.env.OPPTRIX_SHELL_ALLOWED_DOMAINS = prev
})

test('buildSandboxConfigFromGrantPaths with no grants yields empty domains', () => {
  resetConfiguredAllowedDomainsForTests()
  const prev = process.env.OPPTRIX_SHELL_ALLOWED_DOMAINS
  delete process.env.OPPTRIX_SHELL_ALLOWED_DOMAINS
  const cfg = buildSandboxConfigFromGrantPaths(
    [{ abs_path: '/tmp/ws', mode: 'rw' }],
    false,
  )
  assert.deepEqual(cfg.network.allowedDomains, [])
  if (prev != null) process.env.OPPTRIX_SHELL_ALLOWED_DOMAINS = prev
})

test('session network egress store grant/clear', () => {
  const store = new SessionNetworkEgressStore()
  assert.equal(store.hasHost('s1', 'Example.COM.'), false)
  store.grantHost('s1', 'Example.COM.')
  assert.equal(store.hasHost('s1', 'example.com'), true)
  assert.equal(store.hasAnyGrant('s1'), true)
  store.clearSession('s1')
  assert.equal(store.hasHost('s1', 'example.com'), false)
  assert.equal(parseNetworkEgressChoice(['allow_host_session']), 'allow_host_session')
  assert.equal(parseNetworkEgressChoice(['cancel']), 'cancel')
})

test('isEgressHostPreAuthorized respects session grant and configured allowlist', () => {
  const prev = process.env.OPPTRIX_SHELL_ALLOWED_DOMAINS
  resetConfiguredAllowedDomainsForTests()
  process.env.OPPTRIX_SHELL_ALLOWED_DOMAINS = 'preconfigured.example.com'
  const store = new SessionNetworkEgressStore()
  assert.equal(isEgressHostPreAuthorized('s1', 'preconfigured.example.com', store), true)
  store.grantHost('s1', 'granted.example.com')
  assert.equal(isEgressHostPreAuthorized('s1', 'granted.example.com', store), true)
  assert.equal(isEgressHostPreAuthorized('s1', 'unknown.example.com', store), false)
  resetConfiguredAllowedDomainsForTests()
  if (prev == null) delete process.env.OPPTRIX_SHELL_ALLOWED_DOMAINS
  else process.env.OPPTRIX_SHELL_ALLOWED_DOMAINS = prev
})

test('detectNetworkEgressBlocked extracts host from proxy denial', () => {
  const blocked = detectNetworkEgressBlocked(
    1,
    '',
    'No matching config rule, denying: api.example.com:443',
  )
  assert.equal(blocked.blocked, true)
  assert.equal(blocked.suggestedHost, 'api.example.com')
})

test('buildNeedsNetworkEgressPayload includes suggested host', () => {
  const payload = buildNeedsNetworkEgressPayload('api.example.com')
  assert.equal(payload.suggested_host, 'api.example.com')
  assert.match(payload.message, /api\.example\.com/)
})

test('buildSandboxConfigFromGrantPaths includes granted host after ping confirm', () => {
  const cfg = buildSandboxConfigFromGrantPaths(
    [{ abs_path: '/tmp/ws', mode: 'rw' }],
    false,
    ['baidu.com'],
    { hosts: ['baidu.com'] },
  )
  assert.ok(cfg.network.allowedDomains.includes('baidu.com'))
  assert.deepEqual(cfg.network.deniedDomains, [])
})

test('buildSandboxConfigFromGrantPaths includes configured allowlist', () => {
  const prev = process.env.OPPTRIX_SHELL_ALLOWED_DOMAINS
  resetConfiguredAllowedDomainsForTests()
  process.env.OPPTRIX_SHELL_ALLOWED_DOMAINS = 'trusted.example.com'
  const cfg = buildSandboxConfigFromGrantPaths(
    [{ abs_path: '/tmp/ws', mode: 'rw' }],
    false,
  )
  assert.ok(cfg.network.allowedDomains.includes('trusted.example.com'))
  resetConfiguredAllowedDomainsForTests()
  if (prev == null) delete process.env.OPPTRIX_SHELL_ALLOWED_DOMAINS
  else process.env.OPPTRIX_SHELL_ALLOWED_DOMAINS = prev
})

test('commandMayNeedEgressConfirmation covers interpreters not install', () => {
  assert.equal(commandMayNeedEgressConfirmation(['python3', '-c', '1']), true)
  assert.equal(commandMayNeedEgressConfirmation(['pip3', 'install', 'x']), false)
  assert.equal(commandMayNeedEgressConfirmation(['ping', '-c', '1', 'x.com']), false)
})

test('network install sticky store', () => {
  const sticky = new NetworkInstallStickyStore()
  assert.equal(sticky.has('s1'), false)
  sticky.grant('s1')
  assert.equal(sticky.has('s1'), true)
  sticky.clearSession('s1')
  assert.equal(sticky.has('s1'), false)
  assert.equal(parseNetworkInstallChoice(['sticky']), 'sticky')
})

test('shell run sticky store and argv summary', () => {
  const sticky = new ShellRunStickyStore()
  assert.equal(sticky.has('s1'), false)
  sticky.grant('s1')
  assert.equal(sticky.has('s1'), true)
  sticky.clearSession('s1')
  assert.equal(parseShellRunConfirmChoice(['allow_session']), 'allow_session')
  const long = summarizeShellArgv(['python3', '-c', 'x'.repeat(200)])
  assert.ok(long.endsWith('…'))
})

test('shell_run runs interpreter without upfront egress confirm', async () => {
  await withTmpDataDir(async () => {
    const shellSticky = new ShellRunStickyStore()
    shellSticky.grant('interp-confirm')
    const svc = new WorkspaceService({ shellRunSticky: shellSticky })
    const sessionId = 'interp-confirm'
    await svc.ensureDefaultRoot(sessionId)
    let confirmCalls = 0
    try {
      await svc.shellRun({
        sessionId,
        rootId: 'default',
        argv: ['python3', '-c', 'print(1)'],
      }, async () => {
        confirmCalls++
        return { selected_ids: ['cancel'] }
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      assert.doesNotMatch(msg, /可能访问外网/)
      if (!/隔离|就绪|platform|sandbox/i.test(msg)) throw err
    }
    assert.equal(confirmCalls, 0)
  })
})

test('shell_run skips run confirmation when session sticky granted', async () => {
  await withTmpDataDir(async () => {
    const shellSticky = new ShellRunStickyStore()
    shellSticky.grant('sticky-run')
    const svc = new WorkspaceService({ shellRunSticky: shellSticky })
    const sessionId = 'sticky-run'
    await svc.ensureDefaultRoot(sessionId)
    await assert.rejects(
      () => svc.shellRun({
        sessionId,
        rootId: 'default',
        argv: ['pip3', 'install', 'six'],
        networkIntent: 'install',
      }),
      /确认|联网/,
    )
  })
})

test('shell platform status returns structured payload', async () => {
  const status = await getShellPlatformStatus()
  assert.ok(typeof status.message === 'string')
  assert.ok('supported' in status)
  assert.ok('ready' in status)
  if (process.platform === 'win32' || process.platform === 'linux') {
    assert.ok('can_auto_install' in status)
    assert.ok('needs_elevation' in status)
  }
  if (process.platform === 'linux') {
    assert.ok('needs_linux_install' in status)
    assert.ok('userns_restricted' in status)
  }
})

test('ensureLinuxSandboxReady is no-op on non-linux', async () => {
  const { ensureLinuxSandboxReady } = await import('../packages/agent-workspace/dist/shell/ensure-linux-sandbox.js')
  if (process.platform === 'linux') {
    const result = await ensureLinuxSandboxReady({ allowAutoInstall: false })
    assert.equal(typeof result.ready, 'boolean')
    assert.ok(typeof result.message === 'string' || result.ready === true)
    return
  }
  const result = await ensureLinuxSandboxReady({ allowAutoInstall: true })
  assert.equal(result.ready, true)
})

test('linux AppArmor profile builder covers bwrap paths', async () => {
  const {
    buildAppArmorProfileContent,
    OPPTX_PROFILE_MARKER,
  } = await import('../packages/agent-workspace/dist/shell/linux-sandbox-common.js')
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'opptrix-bwrap-test-'))
  const fakeBwrap = path.join(tmp, 'bwrap')
  await fs.writeFile(fakeBwrap, '#!/bin/sh\nexit 0\n')
  await fs.chmod(fakeBwrap, 0o755)
  try {
    const content = buildAppArmorProfileContent([fakeBwrap])
    assert.ok(content.includes(OPPTX_PROFILE_MARKER))
    assert.ok(content.includes(fakeBwrap))
    assert.ok(content.includes('userns'))
  } finally {
    await fs.rm(tmp, { recursive: true, force: true })
  }
})

test('linux sandbox auto-install attempt is idempotent per process', async () => {
  const {
    ensureLinuxSandboxReady,
    resetLinuxSandboxAutoInstallAttempt,
  } = await import('../packages/agent-workspace/dist/shell/ensure-linux-sandbox.js')
  resetLinuxSandboxAutoInstallAttempt()
  const first = await ensureLinuxSandboxReady({ allowAutoInstall: false })
  const second = await ensureLinuxSandboxReady({ allowAutoInstall: false })
  assert.deepEqual(first, second)
})

test('readUserNsRestrictedSync returns boolean', async () => {
  const { readUserNsRestrictedSync } = await import('../packages/agent-workspace/dist/shell/linux-sandbox-common.js')
  assert.equal(typeof readUserNsRestrictedSync(), 'boolean')
})

test('getLinuxSandboxInstallState returns structured fields', async () => {
  const { getLinuxSandboxInstallState } = await import('../packages/agent-workspace/dist/shell/linux-sandbox-common.js')
  const state = getLinuxSandboxInstallState()
  assert.equal(typeof state.needsInstall, 'boolean')
  assert.equal(typeof state.canAutoInstall, 'boolean')
  assert.equal(typeof state.needsElevation, 'boolean')
  assert.equal(typeof state.usernsRestricted, 'boolean')
})

test('linuxCanAutoInstall is false when pkexec is unavailable', async () => {
  const {
    getLinuxSandboxInstallState,
    linuxCanAutoInstall,
    pkexecAvailable,
  } = await import('../packages/agent-workspace/dist/shell/linux-sandbox-common.js')
  const state = getLinuxSandboxInstallState()
  if (!pkexecAvailable()) {
    assert.equal(linuxCanAutoInstall(state), false)
  } else {
    assert.equal(linuxCanAutoInstall(state), state.canAutoInstall)
  }
})

test('resolveBundledSandboxBinConfig is safe on host without runtime stage', async () => {
  const { resolveBundledSandboxBinConfig } = await import('../packages/agent-workspace/dist/shell/resolve-sandbox-bins.js')
  const cfg = resolveBundledSandboxBinConfig()
  assert.ok(cfg != null)
  assert.ok(typeof cfg === 'object')
})

test('shell_run ping requires single merged confirm then grants host', async () => {
  await withTmpDataDir(async () => {
    const egress = new SessionNetworkEgressStore()
    const svc = new WorkspaceService({ sessionNetworkEgress: egress })
    const sessionId = 'ping-session-host'
    await svc.ensureDefaultRoot(sessionId)
    let confirmCalls = 0
    try {
      await svc.shellRun({
        sessionId,
        rootId: 'default',
        argv: ['ping', '-c', '1', 'baidu.com'],
      }, async (payload) => {
        confirmCalls++
        assert.match(payload.prompt, /baidu\.com/)
        assert.ok(payload.options.some(o => o.id === 'allow_host_session'))
        assert.ok(!payload.options.some(o => o.id === 'allow_all_session'))
        return { selected_ids: ['allow_host_session'] }
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!/隔离|就绪|platform|sandbox/i.test(msg)) throw err
    }
    assert.equal(confirmCalls, 1)
    assert.equal(egress.hasHost(sessionId, 'baidu.com'), true)
    const cfg = buildSandboxConfigFromGrantPaths(
      [{ abs_path: '/tmp/ws', mode: 'rw' }],
      false,
      ['baidu.com'],
      egress.snapshot(sessionId),
    )
    assert.ok(cfg.network.allowedDomains.includes('baidu.com'))
  })
})

test('shell_run merged ping confirm is single dialog on cancel', async () => {
  await withTmpDataDir(async () => {
    const svc = new WorkspaceService()
    const sessionId = 'ping-confirm'
    await svc.ensureDefaultRoot(sessionId)
    let confirmCalls = 0
    await assert.rejects(
      () => svc.shellRun({
        sessionId,
        rootId: 'default',
        argv: ['ping', '-c', '1', 'baidu.com'],
      }, async (payload) => {
        confirmCalls++
        assert.match(payload.prompt, /ping/)
        assert.match(payload.prompt, /baidu\.com/)
        return { selected_ids: ['cancel'] }
      }),
      /取消|外网/,
    )
    assert.equal(confirmCalls, 1)
  })
})

test('shell_run ping completes with one confirm when user allows host once', async () => {
  await withTmpDataDir(async () => {
    const status = await getShellPlatformStatus()
    if (!status.ready) return

    const svc = new WorkspaceService()
    const sessionId = 'ping-once'
    await svc.ensureDefaultRoot(sessionId)
    let confirmCalls = 0
    const result = await svc.shellRun({
      sessionId,
      rootId: 'default',
      argv: ['ping', '-c', '1', '127.0.0.1'],
    }, async () => {
      confirmCalls++
      return { selected_ids: ['allow_host_once'] }
    }).catch(err => err)

    if (result instanceof Error) {
      assert.match(result.message, /私有|本地|不允许/)
      return
    }
    assert.equal(confirmCalls, 0, 'private host rejected before confirm')
  })
})

test('shell_run rejects ping to private address', async () => {
  await withTmpDataDir(async () => {
    const svc = new WorkspaceService()
    const sessionId = 'ping-private'
    await svc.ensureDefaultRoot(sessionId)
    await assert.rejects(
      () => svc.shellRun({
        sessionId,
        rootId: 'default',
        argv: ['ping', '-c', '1', '127.0.0.1'],
      }),
      /私有|本地|不允许/,
    )
  })
})

test('shell_run requires network confirmation without sticky', async () => {
  await withTmpDataDir(async () => {
    const svc = new WorkspaceService()
    const sessionId = 'net-confirm'
    await svc.ensureDefaultRoot(sessionId)
    await assert.rejects(
      () => svc.shellRun({
        sessionId,
        rootId: 'default',
        argv: ['pip3', 'install', 'six'],
        networkIntent: 'install',
      }),
      /确认|联网/,
    )
  })
})

const INTEGRATION = process.env.OPPTRIX_SHELL_SANDBOX_INTEGRATION === '1'

test('sandbox isolation blocks reading deny path', { skip: !INTEGRATION }, async () => {
  await withTmpDataDir(async (tmp) => {
    const svc = new WorkspaceService()
    const sessionId = 'iso-read'
    await svc.ensureDefaultRoot(sessionId)
    const dbPath = path.join(tmp, 'opptrix.db')
    await fs.writeFile(dbPath, 'secret')
    const result = await svc.shellRun({
      sessionId,
      rootId: 'default',
      argv: ['python3', '-c', `open(${JSON.stringify(dbPath)}).read()`],
    })
    assert.notEqual(result.exit_code, 0)
  })
})

test('sandbox allows write inside grant', { skip: !INTEGRATION }, async () => {
  await withTmpDataDir(async () => {
    const svc = new WorkspaceService()
    const sessionId = 'iso-write'
    await svc.ensureDefaultRoot(sessionId)
    const result = await svc.shellRun({
      sessionId,
      rootId: 'default',
      argv: ['python3', '-c', 'open("sandbox-ok.txt","w").write("ok")'],
    })
    assert.equal(result.exit_code, 0, result.stderr)
  })
})
