import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  ENDPOINT_FILENAME,
  RUNNER_SH,
  RUNNER_CMD,
  endpointFilePath,
  runnerScriptPath,
  sanitizeEndpointHost,
  writeOsScheduleEndpoint,
  readOsScheduleEndpoint,
  resolveColdStartArgv,
  resolveHeadlessTickArgv,
  defaultHeadlessTickPath,
  buildBashRunnerScript,
  buildCmdRunnerScript,
  ensureOsScheduleTickRunner,
  resolveOsTickInvocation,
} = require('../apps/desktop/electron/os-schedule/tick-runner.cjs')
const {
  resolveResourcesPathFromExec,
  resolvePackagedRuntimeStage,
  buildSidecarEnv,
  serverEntryPath,
} = require('../apps/desktop/electron/os-schedule/sidecar-launch.cjs')

const HEADLESS = defaultHeadlessTickPath()

describe('os-schedule tick-runner', () => {
  /** @type {string} */
  let tmpDir

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-tick-runner-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('sanitizeEndpointHost forces loopback', () => {
    assert.equal(sanitizeEndpointHost('127.0.0.1'), '127.0.0.1')
    assert.equal(sanitizeEndpointHost('localhost'), '127.0.0.1')
    assert.equal(sanitizeEndpointHost('evil.example'), '127.0.0.1')
    assert.equal(sanitizeEndpointHost(''), '127.0.0.1')
  })

  it('writeOsScheduleEndpoint writes host/port/execPath/headlessTick (no secrets)', () => {
    const execPath = '/Applications/Opptrix.app/Contents/MacOS/Opptrix'
    const written = writeOsScheduleEndpoint(tmpDir, {
      host: '0.0.0.0',
      port: 8712,
      execPath,
      headlessTick: HEADLESS,
    })
    assert.equal(written.host, '127.0.0.1')
    assert.equal(written.port, '8712')
    assert.equal(written.execPath, execPath)
    assert.equal(written.headlessTick, HEADLESS)

    const file = endpointFilePath(tmpDir)
    assert.equal(path.basename(file), ENDPOINT_FILENAME)
    const raw = fs.readFileSync(file, 'utf8')
    assert.ok(!/token|secret|key|password/i.test(raw))
    assert.deepEqual(JSON.parse(raw), {
      host: '127.0.0.1',
      port: '8712',
      execPath,
      headlessTick: HEADLESS,
    })
    assert.deepEqual(readOsScheduleEndpoint(tmpDir), {
      host: '127.0.0.1',
      port: '8712',
      execPath,
      headlessTick: HEADLESS,
    })
  })

  it('resolveHeadlessTickArgv is ELECTRON_RUN_AS_NODE pair (no --schedule-tick)', () => {
    const packaged = resolveHeadlessTickArgv({
      execPath: '/Applications/Opptrix.app/Contents/MacOS/Opptrix',
      headlessTickPath: HEADLESS,
    })
    assert.deepEqual(packaged, [
      '/Applications/Opptrix.app/Contents/MacOS/Opptrix',
      HEADLESS,
    ])
    assert.ok(!packaged.includes('--schedule-tick'))
    assert.ok(!packaged.includes('--background'))

    // resolveColdStartArgv aliases to headless argv
    assert.deepEqual(
      resolveColdStartArgv({
        isPackaged: true,
        execPath: '/Applications/Opptrix.app/Contents/MacOS/Opptrix',
        mainCjsPath: '/ignored/main.cjs',
        headlessTickPath: HEADLESS,
      }),
      packaged,
    )
  })

  it('bash runner is HTTP-first then ELECTRON_RUN_AS_NODE headless-tick', () => {
    const endpoint = path.join(tmpDir, ENDPOINT_FILENAME)
    const execPath = '/Applications/Opptrix.app/Contents/MacOS/Opptrix'
    const script = buildBashRunnerScript({
      endpointFile: endpoint,
      coldStartArgv: [execPath, HEADLESS],
    })
    assert.match(script, /^#!\/bin\/bash/)
    assert.match(script, /\bcurl\b/)
    assert.match(script, /\/api\/schedule\/tick/)
    assert.match(script, /\{"trigger":"os"\}/)
    assert.match(script, /export ELECTRON_RUN_AS_NODE=1/)
    assert.match(script, /export OPPTRIX_OS_SCHEDULE_ENDPOINT=/)
    assert.match(script, /exec "\$EXEC" "\$HEADLESS_TICK"/)
    assert.doesNotMatch(script, /--schedule-tick/)
    assert.doesNotMatch(script, /--background/)
    assert.ok(script.includes(HEADLESS) || script.includes('HEADLESS_TICK'))
    assert.ok(script.indexOf('curl') < script.indexOf('export ELECTRON_RUN_AS_NODE'))
    assert.ok(script.indexOf('export ELECTRON_RUN_AS_NODE') < script.indexOf('exec "$EXEC"'))
  })

  it('cmd runner is HTTP-first then ELECTRON_RUN_AS_NODE headless-tick', () => {
    const endpoint = path.join(tmpDir, ENDPOINT_FILENAME)
    const script = buildCmdRunnerScript({
      endpointFile: endpoint,
      coldStartArgv: ['C:\\Opptrix\\Opptrix.exe', 'C:\\Opptrix\\headless-tick.cjs'],
    })
    assert.match(script, /curl\.exe .*\/api\/schedule\/tick/)
    assert.match(script, /set ELECTRON_RUN_AS_NODE=1/)
    assert.match(script, /OPPTRIX_OS_SCHEDULE_ENDPOINT/)
    assert.match(script, /"%EXEC%" "%HEADLESS_TICK%"/)
    assert.doesNotMatch(script, /--schedule-tick/)
    assert.doesNotMatch(script, /--background/)
    assert.ok(script.indexOf('curl.exe') < script.indexOf('ELECTRON_RUN_AS_NODE'))
  })

  it('ensureOsScheduleTickRunner writes endpoint + headless fallback (no GUI flags)', () => {
    const result = ensureOsScheduleTickRunner({
      userDataDir: tmpDir,
      isPackaged: true,
      execPath: '/Applications/Opptrix.app/Contents/MacOS/Opptrix',
      headlessTickPath: HEADLESS,
      platform: 'darwin',
      defaultPort: '8711',
    })
    assert.equal(result.scriptPath, runnerScriptPath(tmpDir, 'darwin'))
    assert.equal(path.basename(result.scriptPath), RUNNER_SH)
    assert.ok(fs.existsSync(result.scriptPath))
    assert.ok(fs.existsSync(result.endpointFile))
    const ep = readOsScheduleEndpoint(tmpDir)
    assert.equal(ep?.execPath, '/Applications/Opptrix.app/Contents/MacOS/Opptrix')
    assert.equal(ep?.headlessTick, HEADLESS)
    const body = fs.readFileSync(result.scriptPath, 'utf8')
    assert.match(body, /\/api\/schedule\/tick/)
    assert.match(body, /ELECTRON_RUN_AS_NODE=1/)
    assert.doesNotMatch(body, /--schedule-tick/)
    const mode = fs.statSync(result.scriptPath).mode & 0o111
    assert.ok(mode !== 0, 'runner should be executable')
  })

  it('ensureOsScheduleTickRunner writes .cmd on win32', () => {
    const result = ensureOsScheduleTickRunner({
      userDataDir: tmpDir,
      isPackaged: true,
      execPath: 'C:\\Opptrix\\Opptrix.exe',
      headlessTickPath: 'C:\\Opptrix\\headless-tick.cjs',
      platform: 'win32',
    })
    assert.equal(path.basename(result.scriptPath), RUNNER_CMD)
    assert.ok(fs.existsSync(result.scriptPath))
    const body = fs.readFileSync(result.scriptPath, 'utf8')
    assert.match(body, /curl\.exe/)
    assert.match(body, /ELECTRON_RUN_AS_NODE=1/)
    assert.doesNotMatch(body, /--schedule-tick/)
  })

  it('resolveOsTickInvocation uses bash+runner on darwin/linux and cmd on win32', () => {
    const darwin = resolveOsTickInvocation({
      userDataDir: tmpDir,
      isPackaged: true,
      execPath: '/Applications/Opptrix.app/Contents/MacOS/Opptrix',
      headlessTickPath: HEADLESS,
      platform: 'darwin',
    })
    assert.deepEqual(darwin.programArguments, ['/bin/bash', darwin.scriptPath])
    assert.ok(!darwin.programArguments.some((a) => a.includes('Opptrix.app/Contents/MacOS')))

    const linux = resolveOsTickInvocation({
      userDataDir: tmpDir,
      isPackaged: false,
      execPath: '/usr/bin/electron',
      headlessTickPath: HEADLESS,
      platform: 'linux',
    })
    assert.match(linux.execStart, /^\/bin\/bash /)
    assert.ok(linux.execStart.includes(linux.scriptPath))

    const win = resolveOsTickInvocation({
      userDataDir: tmpDir,
      isPackaged: true,
      execPath: 'C:\\Opptrix\\Opptrix.exe',
      headlessTickPath: 'C:\\Opptrix\\headless-tick.cjs',
      platform: 'win32',
    })
    assert.equal(win.programArguments.length, 1)
    assert.equal(win.programArguments[0], win.scriptPath)
    assert.match(win.taskRun, /\.cmd"/)
  })
})

describe('os-schedule sidecar-launch helpers', () => {
  it('resolveResourcesPathFromExec / resolvePackagedRuntimeStage for macOS app bundle', () => {
    const exec = '/Applications/Opptrix.app/Contents/MacOS/Opptrix'
    const resources = resolveResourcesPathFromExec(exec)
    assert.equal(resources, '/Applications/Opptrix.app/Contents/Resources')
    assert.equal(
      resolvePackagedRuntimeStage(exec),
      '/Applications/Opptrix.app/Contents/Resources/runtime-stage',
    )
  })

  it('buildSidecarEnv packaged forces loopback host + ELECTRON_RUN_AS_NODE', () => {
    const root = '/tmp/fake-runtime-stage'
    const env = buildSidecarEnv({
      root,
      host: '0.0.0.0',
      port: 8712,
      resourcesPath: '/tmp/fake-resources',
      isDev: false,
      version: '0.0.0-test',
      baseEnv: {},
    })
    assert.equal(env.STOCK_RESEARCH_HOST, '127.0.0.1')
    assert.equal(env.STOCK_RESEARCH_PORT, '8712')
    assert.equal(env.ELECTRON_RUN_AS_NODE, '1')
    assert.equal(env.OPPTRIX_RUNTIME_STAGE, root)
    assert.equal(env.OPPTRIX_APP_VERSION, '0.0.0-test')
    assert.equal(env.UI_DIST_PATH, path.join(root, 'client-ui/dist'))
    assert.equal(serverEntryPath(root), path.join(root, 'apps/server/dist/index.js'))
  })
})
