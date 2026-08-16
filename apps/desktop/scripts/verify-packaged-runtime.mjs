#!/usr/bin/env node
/**
 * Fail CI if electron-builder omitted sidecar deps under runtime-stage,
 * or afterPack failed to restore deps → node_modules for ESM resolution.
 *
 * Also asserts packaged `python/` (bundle-manifest + interpreter) and that
 * ffmpeg-static is present and executable (X_OK on posix; .exe on win).
 *
 * Staging: ship as `deps/` (createFilter skips exact relative `node_modules`).
 * afterPack: rename to `node_modules` so packaged ESM can `import 'fastify'`.
 * NODE_PATH alone is NOT enough for Node ESM bare specifiers.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertPlaywrightChromiumExecutable } from './lib/assert-playwright-chromium.mjs'
import { hostMatchesTarget, normalizeArch, resolveRuntimeTarget } from './lib/runtime-target.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function fail(msg) {
  console.error(`verify-packaged-runtime: ${msg}`)
  process.exit(1)
}

function platformKeyFromTarget(platform, arch) {
  const a = normalizeArch(arch)
  if (platform === 'win32') return a === 'arm64' ? 'win-arm64' : 'win-amd64'
  if (platform === 'darwin') return a === 'arm64' ? 'darwin-arm64' : 'darwin-x64'
  if (platform === 'linux') return a === 'arm64' ? 'linux-arm64' : 'linux-x64'
  return null
}

function findRuntimeStages(releaseDir) {
  const found = []
  const stack = [releaseDir]
  while (stack.length > 0) {
    const dir = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const full = path.join(dir, entry.name)
      if (entry.name === 'runtime-stage') {
        found.push(full)
      } else if (entry.name === 'node_modules' || entry.name === '.git') {
        continue
      } else {
        stack.push(full)
      }
    }
  }
  return found
}

/**
 * Packaged python sits beside runtime-stage under Resources (mac) / resources (win/linux).
 * extraResources maps resources/python → python.
 */
function findPythonBundles(releaseDir, stageDirs) {
  const found = new Set()
  for (const stage of stageDirs) {
    const sibling = path.join(path.dirname(stage), 'python')
    if (fs.existsSync(path.join(sibling, 'bundle-manifest.json'))) {
      found.add(sibling)
    }
  }
  // Fallback walk: any python/ with bundle-manifest (skip node_modules trees)
  const stack = [releaseDir]
  while (stack.length > 0) {
    const dir = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const full = path.join(dir, entry.name)
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'deps') {
        continue
      }
      if (entry.name === 'python' && fs.existsSync(path.join(full, 'bundle-manifest.json'))) {
        found.add(full)
      } else {
        stack.push(full)
      }
    }
  }
  return [...found]
}

function assertPythonBundle(pythonDir, expectedPlatformKey) {
  const manifestPath = path.join(pythonDir, 'bundle-manifest.json')
  if (!fs.existsSync(manifestPath)) {
    fail(`missing ${manifestPath}`)
  }
  let manifest
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  } catch (err) {
    fail(`invalid JSON ${manifestPath}: ${err instanceof Error ? err.message : err}`)
  }
  if (!manifest || typeof manifest.platformKey !== 'string') {
    fail(`${manifestPath} must include platformKey string`)
  }
  if (expectedPlatformKey && manifest.platformKey !== expectedPlatformKey) {
    fail(
      `python bundle-manifest platformKey=${JSON.stringify(manifest.platformKey)} `
        + `expected ${JSON.stringify(expectedPlatformKey)} under ${pythonDir}`,
    )
  }
  const isWin = String(manifest.platformKey).startsWith('win-')
  const candidates = isWin
    ? [path.join(pythonDir, 'python.exe'), path.join(pythonDir, 'Scripts', 'python.exe')]
    : [path.join(pythonDir, 'bin', 'python3'), path.join(pythonDir, 'bin', 'python')]
  const bin = candidates.find((p) => fs.existsSync(p))
  if (!bin) {
    fail(
      `missing python interpreter under ${pythonDir} `
        + `(looked for ${candidates.map((p) => path.relative(pythonDir, p)).join(', ')})`,
    )
  }
  if (!isWin) {
    try {
      fs.accessSync(bin, fs.constants.X_OK)
    } catch {
      fail(`python interpreter not executable (need X_OK): ${bin}`)
    }
  }
  console.log(`verify-packaged-runtime: OK python ${bin} (${manifest.platformKey})`)
}

function assertFfmpegBinary(ffmpegBin, target) {
  const base = path.basename(ffmpegBin).toLowerCase()
  const isWinExe = base === 'ffmpeg.exe'
  if (isWinExe) {
    // Windows: .exe presence is the execute check (X_OK is not meaningful the same way).
    if (!fs.existsSync(ffmpegBin)) {
      fail(`missing ffmpeg.exe at ${ffmpegBin}`)
    }
  } else {
    try {
      fs.accessSync(ffmpegBin, fs.constants.X_OK)
    } catch {
      fail(`ffmpeg not executable (need X_OK): ${ffmpegBin}`)
    }
  }

  const hostCanRunOs = isWinExe ? process.platform === 'win32' : process.platform !== 'win32'
  if (hostCanRunOs && hostMatchesTarget(target)) {
    const ver = spawnSync(ffmpegBin, ['-version'], {
      encoding: 'utf8',
      timeout: 8_000,
      windowsHide: true,
    })
    if (ver.error) {
      const detail = ver.error instanceof Error ? ver.error.message : String(ver.error)
      const hint = /ETIMEDOUT|ETIME/i.test(detail)
        ? ` (often wrong-arch binary under Rosetta — ensure OPPTRIX_RUNTIME_ARCH=`
          + `${target.arch} so hostMatchesTarget skips -version on cross builds)`
        : ''
      fail(
        `ffmpeg -version spawn failed for ${ffmpegBin}: ${detail}${hint}`,
      )
    }
    if (ver.status !== 0) {
      fail(
        `ffmpeg -version failed for ${ffmpegBin} `
          + `(status=${ver.status}, stderr=${String(ver.stderr ?? '').slice(0, 200)})`,
      )
    }
    console.log(`verify-packaged-runtime: OK ffmpeg -version (${ffmpegBin})`)
  } else {
    console.log(
      `verify-packaged-runtime: OK ffmpeg present `
        + `(skip -version; host ${process.platform}-${process.arch} vs target ${target.platform}-${target.arch})`,
    )
  }
}

function assertStage(stageDir, target) {
  const nmFastify = path.join(stageDir, 'node_modules', 'fastify')
  const depsFastify = path.join(stageDir, 'deps', 'fastify')
  if (fs.existsSync(depsFastify) && !fs.existsSync(nmFastify)) {
    fail(
      `${path.join(stageDir, 'deps')} still present without node_modules — `
        + 'afterPack must rename deps → node_modules for ESM imports',
    )
  }
  if (!fs.existsSync(nmFastify)) {
    fail(`missing ${nmFastify} (sidecar cannot start without Fastify)`)
  }
  if (fs.existsSync(path.join(stageDir, 'deps'))) {
    fail(`${path.join(stageDir, 'deps')} must be renamed to node_modules after pack`)
  }
  const playwrightBrowsers = path.join(stageDir, 'playwright-browsers')
  const chromiumExe = assertPlaywrightChromiumExecutable(
    playwrightBrowsers,
    // Prefer restored node_modules; deps/ should already be renamed after pack.
    [path.join(stageDir, 'node_modules'), path.join(stageDir, 'deps')],
    fail,
    target,
  )
  // afterPack restores deps → node_modules; speech/media require bundled ffmpeg.
  const ffmpegDir = path.join(stageDir, 'node_modules', 'ffmpeg-static')
  const ffmpegCandidates = [
    path.join(ffmpegDir, 'ffmpeg'),
    path.join(ffmpegDir, 'ffmpeg.exe'),
  ]
  const ffmpegBin = ffmpegCandidates.find((p) => fs.existsSync(p))
  if (!ffmpegBin) {
    fail(
      `missing ffmpeg binary under ${ffmpegDir} `
        + '(need ffmpeg or ffmpeg.exe — stage must hard-fail if absent)',
    )
  }
  assertFfmpegBinary(ffmpegBin, target)
  console.log(`verify-packaged-runtime: OK ${nmFastify}`)
  console.log(`verify-packaged-runtime: OK Chromium ${chromiumExe}`)
  console.log(`verify-packaged-runtime: OK ffmpeg ${ffmpegBin}`)
}

const releaseDir = path.resolve(process.argv[2] || path.join(__dirname, '../release'))
if (!fs.existsSync(releaseDir)) {
  fail(`release dir not found: ${releaseDir}`)
}

const target = resolveRuntimeTarget()
const expectedPlatformKey = platformKeyFromTarget(target.platform, target.arch)
if (!expectedPlatformKey) {
  fail(`unsupported runtime target ${target.platform}-${target.arch}`)
}

const stages = findRuntimeStages(releaseDir)
if (stages.length === 0) {
  fail(`no runtime-stage under ${releaseDir} — build may have failed before extraResources`)
}

for (const stage of stages) {
  assertStage(stage, target)
}

const pythonDirs = findPythonBundles(releaseDir, stages)
if (pythonDirs.length === 0) {
  fail(
    `no packaged python/bundle-manifest.json under ${releaseDir} `
      + '(extraResources must copy resources/python → python beside runtime-stage)',
  )
}
for (const pythonDir of pythonDirs) {
  assertPythonBundle(pythonDir, expectedPlatformKey)
}

console.log(
  `verify-packaged-runtime: ${stages.length} runtime-stage + ${pythonDirs.length} python tree(s) OK`,
)
