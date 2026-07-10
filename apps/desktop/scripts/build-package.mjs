#!/usr/bin/env node
/** Run electron-builder with platform args; unsigned mac builds use ad-hoc sign + no hardened runtime. */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { appendDesktopArtifactNameArgs } from './lib/desktop-artifact-names.mjs'
import { NPM_CMD, NPM_SHELL } from './lib/commands.mjs'
import { resolveUpdateFeedUrl } from './lib/update-feed-url.mjs'

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PKG_PATH = path.join(DESKTOP_ROOT, 'package.json')
const platformArgs = process.argv.slice(2)
const publishToGitHub = platformArgs.includes('--publish')
const updateFeedUrl = resolveUpdateFeedUrl()

function withUpdateFeedPublishConfig(run) {
  const originalPkgBytes = fs.readFileSync(PKG_PATH)
  const pkg = JSON.parse(originalPkgBytes.toString())
  pkg.build.publish = [{ provider: 'generic', url: updateFeedUrl }]
  fs.writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`)
  try {
    return run()
  } finally {
    fs.writeFileSync(PKG_PATH, originalPkgBytes)
  }
}

const ebArgs = [
  '--config.npmRebuild=false',
  ...(publishToGitHub ? [] : ['--publish', 'never']),
  ...platformArgs,
]
appendDesktopArtifactNameArgs(ebArgs, platformArgs)

const isMacBuild = platformArgs.includes('--mac')
const macUnsigned = process.env.OPPTRIX_MAC_UNSIGNED === '1'

if (isMacBuild && macUnsigned) {
  console.log('macOS unsigned build: hardenedRuntime disabled, afterPack ad-hoc sign')
  ebArgs.push('-c.mac.hardenedRuntime=false')
}

const result = withUpdateFeedPublishConfig(() =>
  spawnSync(NPM_CMD, ['exec', '--', 'electron-builder', ...ebArgs], {
    cwd: DESKTOP_ROOT,
    stdio: 'inherit',
    shell: NPM_SHELL,
    env: process.env,
  }),
)

process.exit(result.status ?? 1)
