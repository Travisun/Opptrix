/**
 * 桌面启动加速 P0–P2：源码契约（phase 拆分、splash∥spawn、reuse probe）。
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const serverIndex = fs.readFileSync(
  path.join(here, '../apps/server/src/index.ts'),
  'utf8',
)
const mainCjs = fs.readFileSync(
  path.join(here, '../apps/desktop/electron/main.cjs'),
  'utf8',
)

function sliceBootstrap(src) {
  const start = src.indexOf('async function bootstrap()')
  assert.ok(start >= 0, 'bootstrap() missing')
  const end = src.indexOf('\nlet shuttingDown', start)
  assert.ok(end > start, 'bootstrap body end marker missing')
  return src.slice(start, end)
}

describe('server bootstrap phaseA / phaseB', () => {
  const boot = sliceBootstrap(serverIndex)

  it('registers routes and listens before schedulers (phaseA → listen → phaseB)', () => {
    const listenAt = boot.indexOf('await listenWithStaleCleanup()')
    assert.ok(listenAt >= 0)

    const phaseAMarkers = [
      'await initOutboundNetwork()',
      'await registerNewsRoutes(app)',
      'registerStaticUi',
      'setNotFoundHandler',
    ]
    for (const m of phaseAMarkers) {
      const at = boot.indexOf(m)
      assert.ok(at >= 0, `phaseA missing: ${m}`)
      assert.ok(at < listenAt, `${m} must be before listen`)
    }

    const phaseBMarkers = [
      'startNewsFeedScheduler()',
      'startEnrichmentScheduler(',
      'startRetentionMaintenance(',
      'scheduleService.start()',
      'maybeBootstrapTranslationModel',
      'pruneOrphanChatAttachments',
      'ensureBundledRagRuntime',
    ]
    for (const m of phaseBMarkers) {
      const at = boot.indexOf(m)
      assert.ok(at >= 0, `phaseB missing: ${m}`)
      assert.ok(at > listenAt, `${m} must be after listen`)
    }
  })

  it('documents Fastify 5 lock: no new routes after listen', () => {
    assert.match(boot, /Fastify 5/)
    assert.match(boot, /禁止再 app\.register/)
    const afterListen = boot.slice(boot.indexOf('await listenWithStaleCleanup()'))
    assert.doesNotMatch(afterListen, /await register\w+Routes\(app\)/)
    assert.doesNotMatch(afterListen, /app\.register\(/)
    assert.doesNotMatch(afterListen, /app\.(get|post|put|delete|patch)\(/)
  })
})

describe('desktop splash ∥ sidecar + reuse probe', () => {
  it('MIN_SPLASH_MS is 1000 (800–1200)', () => {
    const m = mainCjs.match(/const MIN_SPLASH_MS\s*=\s*(\d+)/)
    assert.ok(m, 'MIN_SPLASH_MS missing')
    const ms = Number(m[1])
    assert.equal(ms, 1000)
    assert.ok(ms >= 800 && ms <= 1200)
  })

  it('bootstrapApp runs splash and ensureSidecarReady in parallel', () => {
    const start = mainCjs.indexOf('async function bootstrapApp')
    assert.ok(start >= 0)
    const end = mainCjs.indexOf('async function handleScheduleTickFromOs', start)
    const body = mainCjs.slice(start, end)
    assert.match(body, /Promise\.all\(\[splashPromise,\s*sidecarPromise\]\)/)
    assert.match(body, /sidecarAlreadyReady:\s*true/)
  })

  it('loadAppInMainWindow skips ensure when sidecarAlreadyReady', () => {
    const start = mainCjs.indexOf('async function loadAppInMainWindow')
    const end = mainCjs.indexOf('async function ensureSidecarReady', start)
    const body = mainCjs.slice(start, end)
    assert.match(body, /sidecarAlreadyReady/)
    assert.match(body, /if\s*\(\s*!sidecarAlreadyReady\s*\)/)
  })

  it('ensureSidecarReady probes health before spawn and sets reuse', () => {
    const start = mainCjs.indexOf('async function ensureSidecarReady')
    const end = mainCjs.indexOf('async function bootstrapApp', start)
    const body = mainCjs.slice(start, end)
    const probeAt = body.indexOf('probeSidecarHealth')
    const spawnAt = body.indexOf('spawnSidecar()')
    assert.ok(probeAt >= 0, 'probeSidecarHealth required before spawn')
    assert.ok(spawnAt > probeAt, 'probe must precede spawn')
    assert.match(body, /apiPortMode\s*=\s*['"]reuse['"]/)
  })
})
