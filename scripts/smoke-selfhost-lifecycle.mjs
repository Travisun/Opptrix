#!/usr/bin/env node
/**
 * Self-host lifecycle smoke against a prebuilt image (no docker build here).
 *
 * Phases: startup → hot upgrade → base needsBaseRefresh skip → base recreate.
 *
 * Env:
 *   OPPTRIX_LIFECYCLE_IMAGE                 default opptrix:local-smoke (CI: opptrix:ci-smoke)
 *   OPPTRIX_LIFECYCLE_SKIP_IF_NO_IMAGE=1    exit 0 when image missing
 *   OPPTRIX_LIFECYCLE_HEALTH_TIMEOUT_MS     default 180000
 *
 * Flags: --keep  retain container/volume after success
 */
import { spawnSync } from 'node:child_process'
import https from 'node:https'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_LIFECYCLE_IMAGE,
  LIFECYCLE_APP_VERSIONS as APP,
  LIFECYCLE_BASE_VERSIONS as BASE,
  LIFECYCLE_MARKER_CONTENT,
  LIFECYCLE_MARKER_REL,
  classifyActivatePendingOutput,
  dockerImageExists,
  isHealthOk,
  parseHealthBody,
  pickHostPort,
  resourceNames,
} from './lib/selfhost-lifecycle.mjs'

const HOME = '/opptrix'
const CONTAINER_PORT = 8712
const MARKER_PATH = `${HOME}/${LIFECYCLE_MARKER_REL}`

function log(phase, msg) {
  console.log(`[lifecycle:${phase}] ${msg}`)
}

function die(msg, code = 1) {
  console.error(`[lifecycle] ERROR: ${msg}`)
  process.exit(code)
}

/**
 * @param {string[]} args
 * @param {{ allowFail?: boolean }} [opts]
 */
function docker(args, opts = {}) {
  const r = spawnSync('docker', args, { encoding: 'utf8', shell: false })
  if (!opts.allowFail && (r.status ?? 1) !== 0) {
    const err = (r.stderr || r.stdout || '').trim() || `docker ${args.join(' ')} failed`
    throw new Error(err)
  }
  return r
}

/**
 * @param {string} name
 * @param {string[]} scriptArgs
 * @param {{ env?: Record<string, string>, allowFail?: boolean }} [opts]
 */
function dockerExecNode(name, scriptArgs, opts = {}) {
  const envArgs = []
  for (const [k, v] of Object.entries(opts.env ?? {})) {
    envArgs.push('-e', `${k}=${v}`)
  }
  return docker(
    ['exec', ...envArgs, name, 'node', ...scriptArgs],
    { allowFail: opts.allowFail },
  )
}

function commonServerEnv(appVersion, baseVersion) {
  return {
    STOCK_RESEARCH_HOST: '0.0.0.0',
    OPPTRIX_ENABLE_HTTP: '0',
    OPPTRIX_HTTPS_PORT: String(CONTAINER_PORT),
    SERVE_UI: '1',
    OPPTRIX_HOME: HOME,
    OPPTRIX_DATA_DIR: `${HOME}/private`,
    OPPTRIX_SYSTEM_DIR: `${HOME}/system`,
    OPPTRIX_AGENT_WORKSPACE_DIR: `${HOME}/workspace`,
    OPPTRIX_MOUNTS_DIR: `${HOME}/mounts`,
    OPPTRIX_MODELS_DIR: `${HOME}/models`,
    OPPTRIX_DOCKER: '1',
    OPPTRIX_SEED_ROOT: '/app',
    OPPTRIX_SKIP_MODEL_FETCH: '1',
    OPPTRIX_FETCH_MODELS_ON_START: '0',
    OPPTRIX_WITH_MODELS: '0',
    // Isolate lifecycle smoke from CDN / silent hot-download races on state.json.
    OPPTRIX_UPDATE_ENABLED: '0',
    OPPTRIX_BOOT_CDN_CHECK: '0',
    OPPTRIX_APP_VERSION: appVersion,
    OPPTRIX_BASE_VERSION: baseVersion,
    OPPTRIX_RELEASE_TAG: baseVersion,
  }
}

/**
 * @param {string} image
 * @param {{ name: string, volume: string, port: number, appVersion: string, baseVersion: string }} opts
 */
function startServer(image, opts) {
  docker(['rm', '-f', opts.name], { allowFail: true })
  const args = [
    'run', '-d',
    '--name', opts.name,
    '-p', `127.0.0.1:${opts.port}:${CONTAINER_PORT}`,
    '-v', `${opts.volume}:${HOME}`,
  ]
  for (const [k, v] of Object.entries(commonServerEnv(opts.appVersion, opts.baseVersion))) {
    args.push('-e', `${k}=${v}`)
  }
  // Long-running server: do NOT set OPPTRIX_ONCE
  args.push(image)
  docker(args)
}

/**
 * @param {number} port
 * @param {number} timeoutMs
 */
async function waitHealth(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let last = ''
  while (Date.now() < deadline) {
    try {
      const text = await new Promise((resolve, reject) => {
        const req = https.get(
          {
            hostname: '127.0.0.1',
            port,
            path: '/api/health',
            rejectUnauthorized: false,
            timeout: 3000,
          },
          (res) => {
            /** @type {Buffer[]} */
            const chunks = []
            res.on('data', (c) => chunks.push(Buffer.from(c)))
            res.on('end', () => {
              const body = Buffer.concat(chunks).toString('utf8')
              if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
                reject(new Error(`health HTTP ${res.statusCode}`))
                return
              }
              resolve(body)
            })
          },
        )
        req.on('timeout', () => {
          req.destroy()
          reject(new Error('timeout'))
        })
        req.on('error', reject)
      })
      last = text
      const body = parseHealthBody(text)
      if (isHealthOk(body)) return body
    } catch (err) {
      last = err instanceof Error ? err.message : String(err)
    }
    await new Promise((r) => setTimeout(r, 1500))
  }
  throw new Error(`health timeout after ${timeoutMs}ms; last=${last.slice(0, 200)}`)
}

/** @param {string} name */
function readState(name) {
  const r = dockerExecNode(name, [
    '-e',
    "console.log(require('fs').readFileSync('/opptrix/system/state.json','utf8'))",
  ])
  return JSON.parse(String(r.stdout || '').trim())
}

/** @param {string} name */
function readBootVersion(name) {
  const r = docker(
    ['exec', name, 'sh', '-c', 'readlink /opptrix/system/boot 2>/dev/null || cat /opptrix/system/boot 2>/dev/null || true'],
    { allowFail: true },
  )
  const raw = String(r.stdout || '').trim()
  const m = raw.match(/slots\/([^/\s]+)/)
  return m?.[1] ?? (raw || null)
}

/**
 * Copy boot slot → new version, set pending, run activate-pending.
 * @param {string} name
 * @param {{ from: string, to: string, minBaseImage: string, baseVersion: string }} opts
 */
function stageHotSlot(name, opts) {
  const inline = `
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const su = await import(pathToFileURL('/app/packages/system-update/dist/index.js').href);
const systemDir = '/opptrix/system';
const from = ${JSON.stringify(opts.from)};
const to = ${JSON.stringify(opts.to)};
const minBase = ${JSON.stringify(opts.minBaseImage)};
const src = path.join(systemDir, 'slots', from);
const dest = path.join(systemDir, 'slots', to);
if (!fs.existsSync(src)) throw new Error('missing source slot ' + src);
if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true, dereference: true });
const existing = su.readRuntimeMarker(dest);
su.writeRuntimeMarker(dest, {
  version: to,
  requires: {
    node: existing?.requires?.node?.trim() || '>=24 <25',
    minBaseImage: minBase,
  },
  hooks: existing?.hooks ?? { postActivate: [] },
});
su.setPendingVersion(to, systemDir);
const st = su.readState(systemDir);
if (st.pendingVersion !== to) {
  throw new Error('setPendingVersion failed: expected ' + to + ' got ' + st.pendingVersion);
}
console.log(JSON.stringify({ pending: to, state: st }));
`
  const staged = dockerExecNode(name, ['--input-type=module', '-e', inline])
  const stagedOut = `${staged.stdout || ''}${staged.stderr || ''}`.trim()
  const stateAfterStage = readState(name)
  if (stateAfterStage.pendingVersion !== opts.to) {
    throw new Error(
      `stage did not persist pending=${opts.to}, got ${JSON.stringify(stateAfterStage.pendingVersion)}; `
        + `stageOut=${stagedOut.slice(0, 800)}`,
    )
  }
  const act = docker(
    [
      'exec',
      '-e', `OPPTRIX_BASE_VERSION=${opts.baseVersion}`,
      '-e', `OPPTRIX_RELEASE_TAG=${opts.baseVersion}`,
      '-e', 'OPPTRIX_DOCKER=1',
      '-e', `OPPTRIX_SYSTEM_DIR=${HOME}/system`,
      name,
      'node', '/app/scripts/system-boot.mjs', 'activate-pending',
    ],
    { allowFail: true },
  )
  const out = `${act.stdout || ''}${act.stderr || ''}`
  if (classifyActivatePendingOutput(out) === 'noop') {
    const st = readState(name)
    return {
      output: `${out}\n[lifecycle:debug] state=${JSON.stringify(st)} stageOut=${stagedOut.slice(0, 400)}`,
      class: 'noop',
      code: act.status ?? 1,
    }
  }
  return { output: out, class: classifyActivatePendingOutput(out), code: act.status ?? 1 }
}

function writeMarker(name) {
  docker([
    'exec', name, 'sh', '-c',
    `mkdir -p ${HOME}/private && printf '%s' '${LIFECYCLE_MARKER_CONTENT}' > ${MARKER_PATH}`,
  ])
}

function assertMarker(name) {
  const r = docker(['exec', name, 'cat', MARKER_PATH], { allowFail: true })
  if ((r.status ?? 1) !== 0 || String(r.stdout || '').trim() !== LIFECYCLE_MARKER_CONTENT) {
    throw new Error(`marker missing or wrong under ${MARKER_PATH}`)
  }
}

/**
 * Dump recent container logs before teardown (health timeout / failure diagnosis).
 * @param {string} name
 */
function dumpContainerLogs(name) {
  log('logs', `docker logs --tail 200 ${name}`)
  const r = docker(['logs', '--tail', '200', name], { allowFail: true })
  const out = `${r.stdout || ''}${r.stderr || ''}`.trimEnd()
  if (out) {
    console.error(out)
  } else {
    console.error('[lifecycle:logs] (empty or container missing)')
  }
}

function cleanup(name, volume, keep) {
  if (keep) {
    log('cleanup', `keeping --keep container=${name} volume=${volume}`)
    return
  }
  docker(['rm', '-f', name], { allowFail: true })
  docker(['volume', 'rm', '-f', volume], { allowFail: true })
  log('cleanup', 'removed container + volume')
}

export async function main() {
  const keep = process.argv.includes('--keep')
  const image = process.env.OPPTRIX_LIFECYCLE_IMAGE?.trim() || DEFAULT_LIFECYCLE_IMAGE
  const skipMissing = process.env.OPPTRIX_LIFECYCLE_SKIP_IF_NO_IMAGE === '1'
  const healthTimeout = Number(process.env.OPPTRIX_LIFECYCLE_HEALTH_TIMEOUT_MS || 180_000)

  if (!dockerImageExists(image)) {
    const msg = `image missing: ${image}`
    if (skipMissing) {
      console.log(`[lifecycle] skip: ${msg} (OPPTRIX_LIFECYCLE_SKIP_IF_NO_IMAGE=1)`)
      process.exit(0)
    }
    die(msg, 2)
  }

  const { container: name, volume } = resourceNames()
  const port = pickHostPort()
  log('init', `image=${image} container=${name} volume=${volume} port=${port}`)

  docker(['volume', 'create', volume])
  let ok = false
  try {
    log('startup', `APP=${APP.start} BASE=${BASE.start}`)
    startServer(image, {
      name, volume, port, appVersion: APP.start, baseVersion: BASE.start,
    })
    await waitHealth(port, healthTimeout)
    writeMarker(name)
    assertMarker(name)
    let state = readState(name)
    if (state.currentVersion !== APP.start) {
      throw new Error(`expected currentVersion ${APP.start}, got ${state.currentVersion}`)
    }
    log('startup', `health ok; boot=${readBootVersion(name)}; marker written`)

    log('hot', `stage ${APP.hot} minBase=${BASE.start}`)
    const hot = stageHotSlot(name, {
      from: APP.start,
      to: APP.hot,
      minBaseImage: BASE.start,
      baseVersion: BASE.start,
    })
    if (hot.class !== 'activated') {
      throw new Error(`hot activate expected activated, got ${hot.class}: ${hot.output}`)
    }
    docker(['restart', name])
    await waitHealth(port, healthTimeout)
    state = readState(name)
    if (state.currentVersion !== APP.hot) {
      throw new Error(`after hot: expected currentVersion ${APP.hot}, got ${state.currentVersion}`)
    }
    assertMarker(name)
    log('hot', `advanced to ${APP.hot}; marker ok`)

    log('base-skip', `pending ${APP.base} minBase=${BASE.next} while host base=${BASE.start}`)
    const skip = stageHotSlot(name, {
      from: APP.hot,
      to: APP.base,
      minBaseImage: BASE.next,
      baseVersion: BASE.start,
    })
    if (skip.class !== 'skipped-base') {
      throw new Error(`expected needsBaseRefresh skip, got ${skip.class}: ${skip.output}`)
    }
    state = readState(name)
    if (state.currentVersion !== APP.hot) {
      throw new Error(`base-skip should leave currentVersion=${APP.hot}, got ${state.currentVersion}`)
    }
    if (state.pendingVersion !== APP.base) {
      throw new Error(`base-skip should keep pending=${APP.base}, got ${state.pendingVersion}`)
    }
    assertMarker(name)
    log('base-skip', 'activate-pending skipped as expected')

    log('base-up', `recreate with APP=${APP.base} BASE=${BASE.next}`)
    docker(['rm', '-f', name], { allowFail: true })
    startServer(image, {
      name, volume, port, appVersion: APP.base, baseVersion: BASE.next,
    })
    await waitHealth(port, healthTimeout)
    state = readState(name)
    if (state.currentVersion !== APP.base) {
      throw new Error(`after base-up: expected currentVersion ${APP.base}, got ${state.currentVersion}`)
    }
    assertMarker(name)
    log('base-up', `advanced to ${APP.base}; marker retained`)

    ok = true
    log('done', 'all phases passed')
  } finally {
    if (!ok) {
      try {
        dumpContainerLogs(name)
      } catch {
        /* ignore log dump failures */
      }
    }
    cleanup(name, volume, keep && ok)
  }
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch((err) => {
    console.error(`[lifecycle] FAIL: ${err instanceof Error ? err.message : String(err)}`)
    const { container, volume } = resourceNames()
    try {
      dumpContainerLogs(container)
    } catch {
      /* ignore */
    }
    if (!process.argv.includes('--keep')) {
      docker(['rm', '-f', container], { allowFail: true })
      docker(['volume', 'rm', '-f', volume], { allowFail: true })
    }
    process.exit(1)
  })
}
