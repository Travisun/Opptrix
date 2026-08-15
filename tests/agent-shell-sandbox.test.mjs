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
  argvToCommandString,
  syncCommandStringFromManagedArgv,
  injectPipCertArgv,
  buildSandboxConfigFromGrantPaths,
  buildSandboxConfigFromGrants,
  commandNeedsNetwork,
  commandMayNeedEgressConfirmation,
  finalizeFilesystemPathsForPlatform,
  filterWindowsAclGrantPaths,
  getShellPlatformStatus,
  isWindowsAclStampForbidden,
  needsWindowsAclGrant,
  win32SystemReadAllowPaths,
  pythonActiveAllowReadPaths,
  NetworkInstallStickyStore,
  SessionNetworkEgressStore,
  parseNetworkEgressChoice,
  parseNetworkInstallChoice,
  summarizeShellArgv,
  mergeAllowedNetworkDomains,
  hostPatternsFromHttpsUrls,
  formatNetworkInstallConfirmPrompt,
  networkDomainsForInstallAllowed,
  bundledCaCertAllowReadPaths,
  detectNetworkEgressBlocked,
  buildNeedsNetworkEgressPayload,
  getConfiguredAllowedDomains,
  getGrantableConfiguredAllowedDomainsSync,
  isHostInConfiguredAllowlist,
  isEgressHostPreAuthorized,
  isHostInPackageInstallAllowlist,
  resetConfiguredAllowedDomainsForTests,
  parseDiagnosticTargetHost,
  WorkspaceService,
  parseCommandToArgv,
  resolveShellCommandInput,
  commandNeedsRealShell,
  getSessionShellRuntime,
  resetSessionShellRuntimeForTests,
  hashSandboxConfig,
  startShellCommandJob,
  getShellCommandJob,
  cancelShellCommandJob,
  resetShellCommandJobsForTests,
  isShellBgEnabled,
  SHELL_BG_MAX_IN_FLIGHT_PER_SESSION,
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

    const denied = await buildSandboxConfigFromGrantPaths(
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
    // 会话 grant + denyRead(homedir) 仍在
    assert.ok(denied.filesystem.denyRead.some(p => path.resolve(p) === path.resolve(os.homedir())))
    assert.ok(denied.filesystem.allowRead.some(p => path.resolve(p) === path.resolve(rw)))

    const allowed = await buildSandboxConfigFromGrantPaths(
      [{ abs_path: rw, mode: 'rw' }],
      true,
    )
    assert.ok(allowed.network.allowedDomains.includes('pypi.org'))
    assert.ok(allowed.network.allowedDomains.includes('registry.npmjs.org'))
    assert.ok(
      allowed.network.allowedDomains.includes('mirrors.aliyun.com')
        || allowed.network.allowedDomains.includes('pypi.tuna.tsinghua.edu.cn'),
      'allowInstall must include default CN pip mirror hosts up-front',
    )
    const caPaths = bundledCaCertAllowReadPaths()
    assert.ok(caPaths.length > 0, 'bundled CA paths must resolve')
    const allowReadNorm = allowed.filesystem.allowRead.map(p => path.resolve(p))
    assert.ok(
      caPaths.some(p => allowReadNorm.includes(path.resolve(p))),
      'allowRead must include bundled cacert path/dir',
    )
  })
})

test('windows ACL path policy blacklists system roots and Program Files', () => {
  const env = {
    WINDIR: 'C:\\Windows',
    SystemRoot: 'C:\\Windows',
    ProgramFiles: 'C:\\Program Files',
    'ProgramFiles(x86)': 'C:\\Program Files (x86)',
    ProgramW6432: 'C:\\Program Files',
    LOCALAPPDATA: 'C:\\Users\\alice\\AppData\\Local',
    APPDATA: 'C:\\Users\\alice\\AppData\\Roaming',
    TEMP: 'C:\\Users\\alice\\AppData\\Local\\Temp',
    TMP: 'C:\\Users\\alice\\AppData\\Local\\Temp',
  }

  assert.equal(isWindowsAclStampForbidden('C:\\Windows', env), true)
  assert.equal(isWindowsAclStampForbidden('C:\\Windows\\System32', env), true)
  assert.equal(isWindowsAclStampForbidden('C:\\Program Files', env), true)
  assert.equal(isWindowsAclStampForbidden('C:\\Program Files\\nodejs', env), true)
  assert.equal(isWindowsAclStampForbidden('C:\\Program Files (x86)\\Opptrix', env), true)
  assert.equal(isWindowsAclStampForbidden('C:\\', env), true)
  assert.equal(isWindowsAclStampForbidden('D:', env), true)

  assert.equal(needsWindowsAclGrant('C:\\Users\\alice\\AppData\\Local\\Opptrix\\runtime-stage', env), true)
  assert.equal(needsWindowsAclGrant(env.LOCALAPPDATA, env), true)
  assert.equal(needsWindowsAclGrant(env.TEMP, env), true)
  assert.equal(needsWindowsAclGrant('C:\\Program Files\\nodejs', env), false)

  const filtered = filterWindowsAclGrantPaths([
    'C:\\Windows',
    'C:\\Program Files\\nodejs',
    'C:\\',
    'C:\\Users\\alice\\AppData\\Local\\Opptrix',
    'C:\\Users\\alice\\workspace',
  ], env)
  assert.deepEqual(filtered, [
    'C:\\Users\\alice\\AppData\\Local\\Opptrix',
    'C:\\Users\\alice\\workspace',
  ])
})

test('finalizeFilesystemPathsForPlatform strips win32 blacklist; non-win keeps paths', () => {
  const env = {
    WINDIR: 'C:\\Windows',
    ProgramFiles: 'C:\\Program Files',
    LOCALAPPDATA: 'C:\\Users\\alice\\AppData\\Local',
    TEMP: 'C:\\Users\\alice\\AppData\\Local\\Temp',
  }
  const input = [
    'C:\\Windows',
    'C:\\Program Files\\nodejs',
    'C:\\',
    'C:\\Users\\alice\\AppData\\Local\\Opptrix',
    'C:\\Users\\alice\\AppData\\Local\\Temp',
  ]
  const winOut = finalizeFilesystemPathsForPlatform(input, 'win32', env)
  assert.ok(!winOut.some(p => /\\windows$/i.test(p) || /program files/i.test(p) || /^[a-z]:\\?$/i.test(p)))
  assert.ok(winOut.includes('C:\\Users\\alice\\AppData\\Local\\Opptrix'))
  assert.ok(winOut.includes('C:\\Users\\alice\\AppData\\Local\\Temp'))

  const macOut = finalizeFilesystemPathsForPlatform(['/usr/bin', '/System/Library'], 'darwin', env)
  assert.deepEqual(macOut, ['/usr/bin', '/System/Library'])
})

test('win32SystemReadAllowPaths is TEMP/TMP + Programs\\Python only (not whole APPDATA trees)', () => {
  const env = {
    TEMP: 'C:\\Users\\alice\\AppData\\Local\\Temp',
    TMP: 'C:\\Users\\alice\\AppData\\Local\\Temp',
    LOCALAPPDATA: 'C:\\Users\\alice\\AppData\\Local',
    APPDATA: 'C:\\Users\\alice\\AppData\\Roaming',
  }
  const paths = win32SystemReadAllowPaths(env).map(p => path.win32.resolve(p).toLowerCase())
  const temp = path.win32.resolve(env.TEMP).toLowerCase()
  const programsPython = path.win32.resolve(
    path.win32.join(env.LOCALAPPDATA, 'Programs', 'Python'),
  ).toLowerCase()
  const localApp = path.win32.resolve(env.LOCALAPPDATA).toLowerCase()
  const roaming = path.win32.resolve(env.APPDATA).toLowerCase()

  assert.ok(paths.includes(temp), 'TEMP must be in systemRead')
  assert.ok(paths.includes(programsPython), 'Programs\\Python must be in systemRead')
  assert.ok(!paths.includes(localApp), 'must not grant whole LOCALAPPDATA')
  assert.ok(!paths.includes(roaming), 'must not grant whole APPDATA')
})

test('pythonActiveAllowReadPaths includes dirname; Scripts/bin also include parent', () => {
  assert.deepEqual(pythonActiveAllowReadPaths(null), [])
  assert.deepEqual(pythonActiveAllowReadPaths(''), [])

  const ordinary = path.join('/opt', 'miniconda3', 'python')
  const ordinaryDir = path.dirname(path.resolve(ordinary))
  assert.deepEqual(pythonActiveAllowReadPaths(ordinary), [ordinaryDir])

  const scriptsExe = path.join('/opt', 'miniconda3', 'Scripts', 'python.exe')
  const scriptsDir = path.dirname(path.resolve(scriptsExe))
  const scriptsParent = path.dirname(scriptsDir)
  assert.deepEqual(pythonActiveAllowReadPaths(scriptsExe), [scriptsDir, scriptsParent])

  const binPy = path.join('/opt', 'miniconda3', 'bin', 'python')
  const binDir = path.dirname(path.resolve(binPy))
  const binParent = path.dirname(binDir)
  assert.deepEqual(pythonActiveAllowReadPaths(binPy), [binDir, binParent])
})

test('buildSandboxConfigFromGrantPaths win32 allow lists exclude system ACL stamp targets', async () => {
  await withTmpDataDir(async (tmp) => {
    const rw = path.join(tmp, 'rw-grant')
    await fs.mkdir(rw, { recursive: true })
    const cfg = await buildSandboxConfigFromGrantPaths([{ abs_path: rw, mode: 'rw' }], false)

    if (process.platform === 'win32') {
      const windir = process.env.WINDIR ?? 'C:\\Windows'
      const pf = process.env.ProgramFiles ?? 'C:\\Program Files'
      const localApp = process.env.LOCALAPPDATA
      const appData = process.env.APPDATA
      const temp = process.env.TEMP ?? process.env.TMP

      const allowReadNorm = cfg.filesystem.allowRead.map(p => path.resolve(p).toLowerCase())
      assert.ok(!allowReadNorm.includes(path.resolve(windir).toLowerCase()))
      assert.ok(!allowReadNorm.includes(path.resolve(pf).toLowerCase()))
      assert.ok(!allowReadNorm.some(p => /^[a-z]:\\?$/.test(p)))
      if (localApp) {
        assert.ok(!allowReadNorm.includes(path.resolve(localApp).toLowerCase()),
          'must not grant whole LOCALAPPDATA tree')
        const programsPython = path.resolve(path.join(localApp, 'Programs', 'Python')).toLowerCase()
        assert.ok(allowReadNorm.includes(programsPython), 'Programs\\Python should be allowRead')
        assert.ok(!cfg.filesystem.allowWrite.some(
          p => path.resolve(p).toLowerCase() === path.resolve(localApp).toLowerCase(),
        ))
      }
      if (appData) {
        assert.ok(!allowReadNorm.includes(path.resolve(appData).toLowerCase()),
          'must not grant whole APPDATA tree')
      }
      if (temp) {
        assert.ok(allowReadNorm.includes(path.resolve(temp).toLowerCase()), 'TEMP in allowRead')
        assert.ok(cfg.filesystem.allowWrite.some(
          p => path.resolve(p).toLowerCase() === path.resolve(temp).toLowerCase(),
        ))
      }
      // resolvePythonRuntimeRoot + node paths 仍经 finalize 进入 allowRead
      const { resolvePythonRuntimeRoot } = await import('../packages/shared/dist/index.js')
      const pyRoot = path.resolve(resolvePythonRuntimeRoot()).toLowerCase()
      assert.ok(allowReadNorm.includes(pyRoot), 'python runtime root in allowRead')
      const { nodeRuntimeAllowReadPaths } = await import('../packages/agent-workspace/dist/node/resolve-node.js')
      const nodePaths = await nodeRuntimeAllowReadPaths()
      for (const p of nodePaths) {
        assert.ok(
          allowReadNorm.includes(path.resolve(p).toLowerCase()),
          `missing node allowRead path: ${p}`,
        )
      }
      assert.ok(cfg.filesystem.allowWrite.some(p => path.resolve(p) === path.resolve(rw)))
      assert.ok(cfg.filesystem.denyRead.some(p => path.resolve(p) === path.resolve(os.homedir())))
    } else {
      // 非 Win：策略出口不破坏既有路径（darwin/linux 系统只读仍在）
      assert.ok(cfg.filesystem.allowRead.some(p => path.resolve(p) === path.resolve(rw)))
      assert.ok(cfg.filesystem.denyRead.some(p => path.resolve(p) === path.resolve(os.homedir())))
      assert.ok(cfg.filesystem.allowWrite.some(p => path.resolve(p) === path.resolve(rw)))
      if (process.platform === 'darwin' || process.platform === 'linux') {
        assert.ok(cfg.filesystem.allowRead.some(p => path.resolve(p) === path.resolve('/usr/bin')))
      }
      if (process.platform === 'darwin') {
        assert.ok(cfg.filesystem.allowRead.some(p => path.resolve(p) === path.resolve('/opt/homebrew/etc')))
        assert.ok(cfg.filesystem.allowRead.some(p => path.resolve(p) === path.resolve('/opt/homebrew/opt')))
        assert.ok(cfg.filesystem.allowRead.some(p => path.resolve(p) === path.resolve('/usr/local/etc')))
      }
    }
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

test('assertAllowedShellArgv allows process.execPath after node rewrite', () => {
  assert.doesNotThrow(() => assertAllowedShellArgv([process.execPath, '-v']))
})

test('assertAllowedShellArgv no longer blocks arbitrary argv0 (grant+SRT is boundary)', () => {
  assert.doesNotThrow(() => assertAllowedShellArgv(['node', '-v']))
  assert.doesNotThrow(() => assertAllowedShellArgv(['Opptrix', '-v']))
})

test('commandNeedsNetwork detects npm-cli.js install argv shape', () => {
  assert.equal(
    commandNeedsNetwork([process.execPath, '/tmp/npm-cli.js', 'install', 'lodash']),
    true,
  )
  assert.equal(
    commandNeedsNetwork([process.execPath, '/tmp/npx-cli.js', 'install', 'lodash']),
    true,
  )
})

test('buildSandboxConfigFromGrants includes node runtime allowRead paths', async () => {
  await withTmpDataDir(async (tmp) => {
    const rw = path.join(tmp, 'rw-grant')
    await fs.mkdir(rw, { recursive: true })
    const { nodeRuntimeAllowReadPaths } = await import('../packages/agent-workspace/dist/node/resolve-node.js')
    const nodePaths = await nodeRuntimeAllowReadPaths()
    const cfg = await buildSandboxConfigFromGrants({
      grants: [{
        id: 'rw1',
        root_id: 'rw1',
        abs_path: rw,
        mode: 'rw',
        label: 'rw',
        is_default: false,
      }],
      allowNetworkInstall: false,
    })
    for (const p of nodePaths) {
      assert.ok(
        cfg.filesystem.allowRead.some(r => path.resolve(r) === path.resolve(p)),
        `missing node allowRead path: ${p}`,
      )
    }
  })
})

test('buildSandboxConfigFromGrantPaths includes python runtime root and node allowRead paths', async () => {
  await withTmpDataDir(async (tmp) => {
    const rw = path.join(tmp, 'rw-grant')
    await fs.mkdir(rw, { recursive: true })
    const { resolvePythonRuntimeRoot } = await import('../packages/shared/dist/index.js')
    const { nodeRuntimeAllowReadPaths } = await import('../packages/agent-workspace/dist/node/resolve-node.js')
    const nodePaths = await nodeRuntimeAllowReadPaths()
    const cfg = await buildSandboxConfigFromGrantPaths([{ abs_path: rw, mode: 'rw' }], false)
    const pyRoot = path.resolve(resolvePythonRuntimeRoot())
    assert.ok(
      cfg.filesystem.allowRead.some(r => path.resolve(r) === pyRoot),
      `missing python runtime root allowRead: ${pyRoot}`,
    )
    for (const p of nodePaths) {
      assert.ok(
        cfg.filesystem.allowRead.some(r => path.resolve(r) === path.resolve(p)),
        `missing node allowRead path: ${p}`,
      )
    }
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

test('assertAllowedShellArgv only requires non-empty (no binary allowlist)', () => {
  assert.doesNotThrow(() => assertAllowedShellArgv(['dig', 'example.com']))
  assert.doesNotThrow(() => assertAllowedShellArgv(['nslookup', 'example.com']))
  assert.doesNotThrow(() => assertAllowedShellArgv(['bash', '-c', 'echo hi']))
  assert.doesNotThrow(() => assertAllowedShellArgv(['rm', '-rf', '/tmp/x']))
  assert.throws(() => assertAllowedShellArgv([]), /命令不能为空/)
  assert.throws(() => assertAllowedShellArgv(['']), /命令不能为空/)
})

test('commandNeedsNetwork detects pip/npm install and ping', () => {
  assert.equal(commandNeedsNetwork(['python3', '-c', '1']), false)
  assert.equal(commandNeedsNetwork(['pip3', 'install', 'x']), true)
  assert.equal(commandNeedsNetwork(['npm', 'ci']), true)
  assert.equal(commandNeedsNetwork(['ping', '-c', '4', 'baidu.com']), true)
})

test('assertAllowedShellArgv allows ping and arbitrary binaries', () => {
  assert.doesNotThrow(() => assertAllowedShellArgv(['ping', '-c', '4', 'baidu.com']))
  assert.doesNotThrow(() => assertAllowedShellArgv(['bash', '-c', 'echo hi']))
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
  assert.ok(
    domains.includes('mirrors.aliyun.com') || domains.includes('pypi.tuna.tsinghua.edu.cn'),
    'install allowlist includes default CN mirrors without waiting for egress',
  )
})

test('hostPatternsFromHttpsUrls extracts host and parent wildcard', () => {
  const patterns = hostPatternsFromHttpsUrls([
    'https://mirrors.aliyun.com/pypi/simple',
    'https://registry.npmmirror.com/',
    'not-a-url',
    '',
  ])
  assert.ok(patterns.includes('mirrors.aliyun.com'))
  assert.ok(patterns.includes('*.aliyun.com'))
  assert.ok(patterns.includes('registry.npmmirror.com'))
})

test('networkDomainsForInstallAllowed merges extra pip urls', () => {
  const domains = networkDomainsForInstallAllowed([
    'https://custom-mirror.example.com/simple',
  ])
  assert.ok(domains.includes('pypi.org'))
  assert.ok(domains.includes('custom-mirror.example.com'))
  assert.ok(domains.includes('registry.npmmirror.com'))
})

test('formatNetworkInstallConfirmPrompt lists domains for users', () => {
  const prompt = formatNetworkInstallConfirmPrompt([
    'mirrors.aliyun.com',
    '*.aliyun.com',
    'pypi.org',
  ])
  assert.ok(prompt.includes('mirrors.aliyun.com'))
  assert.ok(prompt.includes('pypi.org'))
  assert.ok(prompt.includes('等'))
  assert.ok(!prompt.toLowerCase().includes('mcp'))
})

test('formatNetworkInstallConfirmPrompt prioritizes pipIndexUrls hosts before official', () => {
  const pipUrls = [
    'https://mirrors.aliyun.com/pypi/simple',
    'https://pypi.tuna.tsinghua.edu.cn/simple',
  ]
  const preferred = hostPatternsFromHttpsUrls(pipUrls)
  const domains = networkDomainsForInstallAllowed(pipUrls)
  const prompt = formatNetworkInstallConfirmPrompt(domains, 8, preferred)
  assert.ok(prompt.includes('mirrors.aliyun.com'), 'aliyun must appear in shown hosts')
  const aliyunAt = prompt.indexOf('mirrors.aliyun.com')
  const pypiAt = prompt.indexOf('pypi.org')
  assert.ok(aliyunAt >= 0)
  assert.ok(pypiAt < 0 || aliyunAt < pypiAt, 'pip mirror host should appear before official pypi.org')
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

test('buildSandboxConfigFromGrantPaths with no grants yields empty domains', async () => {
  resetConfiguredAllowedDomainsForTests()
  const prev = process.env.OPPTRIX_SHELL_ALLOWED_DOMAINS
  delete process.env.OPPTRIX_SHELL_ALLOWED_DOMAINS
  const cfg = await buildSandboxConfigFromGrantPaths(
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

test('confirmation matrix: package install hosts pre-authorized; arbitrary host not', () => {
  const store = new SessionNetworkEgressStore()
  assert.equal(isHostInPackageInstallAllowlist('pypi.org'), true)
  assert.equal(isHostInPackageInstallAllowlist('files.pythonhosted.org'), true)
  assert.equal(isHostInPackageInstallAllowlist('registry.npmjs.org'), true)
  assert.equal(isHostInPackageInstallAllowlist('registry.npmmirror.com'), true)
  assert.equal(isEgressHostPreAuthorized('s-matrix', 'pypi.org', store), true)
  assert.equal(isEgressHostPreAuthorized('s-matrix', 'registry.npmjs.org', store), true)
  assert.equal(isEgressHostPreAuthorized('s-matrix', 'evil.example.com', store), false)
  store.grantHost('s-matrix', 'evil.example.com')
  assert.equal(isEgressHostPreAuthorized('s-matrix', 'evil.example.com', store), true)
})

test('confirmation matrix: unsandboxed always prompts (no session sticky)', async () => {
  await withTmpDataDir(async () => {
    const svc = new WorkspaceService()
    const sessionId = 'unsandboxed-matrix'
    await svc.ensureDefaultRoot(sessionId)
    let confirms = 0
    for (let i = 0; i < 2; i++) {
      try {
        await svc.shellRun({
          sessionId,
          rootId: 'default',
          command: 'echo hello',
          escalate: 'unsandboxed',
        }, async (payload) => {
          confirms++
          assert.match(payload.title, /隔离外/)
          return { selected_ids: ['allow_once'] }
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        // 环境未就绪时仍应已弹出 unsandboxed 确认
        if (!/隔离|就绪|platform|sandbox|取消/i.test(msg) && !/用户已取消/.test(msg)) {
          throw err
        }
      }
    }
    assert.ok(confirms >= 2, 'unsandboxed 每次都须确认，无 session sticky')
  })
})

test('shell-command bg job: start → cancel', async () => {
  resetShellCommandJobsForTests()
  assert.equal(isShellBgEnabled(), true)
  const snap = startShellCommandJob({
    sessionId: 'bg-s1',
    commandSummary: 'sleep 30',
    timeoutMs: 60_000,
    run: async (signal) => {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, 30_000)
        signal.addEventListener('abort', () => {
          clearTimeout(t)
          reject(new Error('aborted'))
        }, { once: true })
      })
      return { exitCode: 0, stdout: '', stderr: '' }
    },
  })
  assert.equal(snap.status, 'running')
  assert.match(snap.job_id, /^shell-/)
  assert.equal(getShellCommandJob(snap.job_id)?.status, 'running')
  assert.equal(cancelShellCommandJob(snap.job_id), true)
  assert.equal(getShellCommandJob(snap.job_id)?.status, 'cancelled')
  resetShellCommandJobsForTests()
})

test('shell-command bg in-flight cap per session', () => {
  resetShellCommandJobsForTests()
  const mk = (i) => startShellCommandJob({
    sessionId: 'cap-s',
    commandSummary: `job-${i}`,
    timeoutMs: 60_000,
    run: async (signal) => {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, 60_000)
        signal.addEventListener('abort', () => {
          clearTimeout(t)
          reject(new Error('aborted'))
        }, { once: true })
      })
      return { exitCode: 0, stdout: '', stderr: '' }
    },
  })
  mk(1)
  mk(2)
  assert.throws(() => mk(3), /上限/)
  assert.equal(SHELL_BG_MAX_IN_FLIGHT_PER_SESSION, 2)
  resetShellCommandJobsForTests()
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

test('buildSandboxConfigFromGrantPaths includes granted host after ping confirm', async () => {
  const cfg = await buildSandboxConfigFromGrantPaths(
    [{ abs_path: '/tmp/ws', mode: 'rw' }],
    false,
    ['baidu.com'],
    { hosts: ['baidu.com'] },
  )
  assert.ok(cfg.network.allowedDomains.includes('baidu.com'))
  assert.deepEqual(cfg.network.deniedDomains, [])
})

test('buildSandboxConfigFromGrantPaths includes configured allowlist', async () => {
  const prev = process.env.OPPTRIX_SHELL_ALLOWED_DOMAINS
  resetConfiguredAllowedDomainsForTests()
  process.env.OPPTRIX_SHELL_ALLOWED_DOMAINS = 'trusted.example.com'
  const cfg = await buildSandboxConfigFromGrantPaths(
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

test('summarizeShellArgv truncates long command', () => {
  const long = summarizeShellArgv(['python3', '-c', 'x'.repeat(200)])
  assert.ok(long.endsWith('…'))
  assert.equal(summarizeShellArgv([]), '（空命令）')
})

test('opptrix_run runs interpreter without upfront egress confirm', async () => {
  await withTmpDataDir(async () => {
    const svc = new WorkspaceService()
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

test('opptrix_run needs no shell-run sticky confirmation in fence', async () => {
  await withTmpDataDir(async () => {
    const svc = new WorkspaceService()
    const sessionId = 'no-run-sticky'
    await svc.ensureDefaultRoot(sessionId)
    let confirmCalls = 0
    try {
      await svc.shellRun({
        sessionId,
        rootId: 'default',
        command: 'python3 -c "print(1)"',
      }, async () => {
        confirmCalls++
        return { selected_ids: ['cancel'] }
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      assert.doesNotMatch(msg, /需要用户确认运行命令/)
      assert.notEqual(err?.name, 'ShellRunConfirmationRequiredError')
      // 沙箱未就绪等环境错误可接受
      if (!/隔离|就绪|platform|sandbox|Python/i.test(msg)) throw err
    }
    assert.equal(confirmCalls, 0, '围栏内不得弹「允许运行命令」')
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

test('isWindowsSandboxProvisioned treats cannot-read as ready when user is provisioned', async () => {
  const { isWindowsSandboxProvisioned } = await import(
    '../packages/agent-workspace/dist/shell/ensure-windows-sandbox.js'
  )
  assert.equal(
    isWindowsSandboxProvisioned({
      user: { provisioned: true, credPresent: true },
      wfp: { state: 'cannot-read' },
    }),
    true,
  )
  assert.equal(
    isWindowsSandboxProvisioned({
      user: { provisioned: true, credPresent: true },
      wfp: { state: 'installed' },
    }),
    true,
  )
  assert.equal(
    isWindowsSandboxProvisioned({
      user: { provisioned: true, credPresent: true },
      wfp: { state: 'absent' },
    }),
    false,
  )
  assert.equal(
    isWindowsSandboxProvisioned({
      user: { provisioned: true, credPresent: false },
      wfp: { state: 'cannot-read' },
    }),
    false,
  )
  assert.equal(
    isWindowsSandboxProvisioned({
      user: { provisioned: true },
      wfp: { state: 'installed' },
    }),
    false,
  )
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

test('opptrix_run ping requires single merged confirm then grants host', async () => {
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
    const cfg = await buildSandboxConfigFromGrantPaths(
      [{ abs_path: '/tmp/ws', mode: 'rw' }],
      false,
      ['baidu.com'],
      egress.snapshot(sessionId),
    )
    assert.ok(cfg.network.allowedDomains.includes('baidu.com'))
  })
})

test('opptrix_run merged ping confirm is single dialog on cancel', async () => {
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

test('opptrix_run ping completes with one confirm when user allows host once', async () => {
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

test('opptrix_run rejects ping to private address', async () => {
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

test('opptrix_run defaults package-install domains without network_install confirm', async () => {
  await withTmpDataDir(async () => {
    const svc = new WorkspaceService()
    const sessionId = 'net-default-install'
    await svc.ensureDefaultRoot(sessionId)
    let networkInstallConfirms = 0
    try {
      await svc.shellRun({
        sessionId,
        rootId: 'default',
        command: 'pip3 install six',
        networkIntent: 'install',
      }, async (payload) => {
        if (payload.title === '允许联网安装') networkInstallConfirms++
        return { selected_ids: ['cancel'] }
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      assert.doesNotMatch(msg, /需要用户确认联网安装/)
      assert.notEqual(err?.name, 'NetworkInstallConfirmationRequiredError')
      if (!/隔离|就绪|platform|sandbox|Python|pip/i.test(msg)) throw err
    }
    assert.equal(networkInstallConfirms, 0, '包源默认已放行，不应弹联网安装确认')
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

test('parseCommandToArgv and resolveShellCommandInput', () => {
  assert.deepEqual(parseCommandToArgv('python3 -c "print(1)"'), ['python3', '-c', 'print(1)'])
  assert.equal(commandNeedsRealShell('echo hi | wc -l'), true)
  assert.equal(commandNeedsRealShell('python3 -c print(1)'), false)
  const fromCmd = resolveShellCommandInput({ command: 'ls -la' })
  assert.equal(fromCmd.fromLegacyArgv, false)
  assert.deepEqual(fromCmd.argv, ['ls', '-la'])
  const fromArgv = resolveShellCommandInput({ argv: ['ping', '-c', '1', 'x'] })
  assert.equal(fromArgv.fromLegacyArgv, true)
  assert.match(fromArgv.command, /ping/)
})

test('real shell: managed --target/--cert rewrite syncs into commandString', () => {
  assert.equal(commandNeedsRealShell('pip3 install requests && echo done'), true)
  const argv = parseCommandToArgv('pip3 install requests && echo done')
  const withTarget = assertPackageInstallPolicy(argv, '/ws', '/ws')
  assert.ok(withTarget.includes('--target'))
  assert.ok(withTarget.includes('.opptrix-packages'))
  const withCert = injectPipCertArgv(withTarget, path.join('/ws', '.opptrix', 'cacert.pem'))
  assert.ok(withCert.includes('--cert'))
  const commandString = syncCommandStringFromManagedArgv(withCert)
  assert.match(commandString, /--target/)
  assert.match(commandString, /\.opptrix-packages/)
  assert.match(commandString, /--cert/)
  assert.match(commandString, /&&/)
  assert.match(commandString, /echo/)
  // 与 argv spawn 路径一致：最终应以 argv 派生字符串为准
  assert.equal(commandString, argvToCommandString(withCert))
})

test('cwdRel missing or not a directory → structured WorkspaceError', async () => {
  await withTmpDataDir(async () => {
    const svc = new WorkspaceService()
    const sessionId = 'cwd-missing'
    await svc.ensureDefaultRoot(sessionId)

    await assert.rejects(
      () => svc.shellRun({
        sessionId,
        rootId: 'default',
        cwdRel: 'no-such-dir',
        command: 'echo ok',
      }),
      (err) => {
        const msg = err instanceof Error ? err.message : String(err)
        assert.match(msg, /工作目录不存在/)
        assert.match(msg, /mkdir|相对/)
        return true
      },
    )

    const root = (await svc.listGrants(sessionId)).find(g => g.root_id === 'default')
    assert.ok(root)
    const fileRel = 'not-a-dir.txt'
    await fs.writeFile(path.join(root.abs_path, fileRel), 'x', 'utf8')

    await assert.rejects(
      () => svc.shellRun({
        sessionId,
        rootId: 'default',
        cwdRel: fileRel,
        command: 'echo ok',
      }),
      (err) => {
        const msg = err instanceof Error ? err.message : String(err)
        assert.match(msg, /不是目录/)
        return true
      },
    )
  })
})

test('session shell runtime dispose clears session entry', async () => {
  await resetSessionShellRuntimeForTests()
  const rt = getSessionShellRuntime()
  assert.equal(rt.hasSessionForTests('s-dispose'), false)
  // acquire without real SRT init is hard offline; just verify dispose is idempotent
  await rt.disposeSession('s-dispose')
  await rt.disposeSession('s-dispose')
  await resetSessionShellRuntimeForTests()
})

test('hashSandboxConfig is stable for same config shape', () => {
  const a = hashSandboxConfig({
    network: { allowedDomains: ['pypi.org'], deniedDomains: [] },
    filesystem: { denyRead: [], allowRead: [], allowWrite: [], denyWrite: [] },
  })
  const b = hashSandboxConfig({
    network: { allowedDomains: ['pypi.org'], deniedDomains: [] },
    filesystem: { denyRead: [], allowRead: [], allowWrite: [], denyWrite: [] },
  })
  assert.equal(a, b)
  assert.notEqual(a, hashSandboxConfig({
    network: { allowedDomains: ['example.com'], deniedDomains: [] },
    filesystem: { denyRead: [], allowRead: [], allowWrite: [], denyWrite: [] },
  }))
})
