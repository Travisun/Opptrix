#!/usr/bin/env node
/** Run electron-builder with platform args; unsigned mac builds use ad-hoc sign + no hardened runtime. */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NPM_CMD, NPM_SHELL } from './lib/commands.mjs'

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const platformArgs = process.argv.slice(2)

const ebArgs = ['--config.npmRebuild=false', '--publish', 'never', ...platformArgs]

const isMacBuild = platformArgs.includes('--mac')
const macUnsigned = process.env.OPPTRIX_MAC_UNSIGNED === '1'

if (isMacBuild && macUnsigned) {
  console.log('macOS unsigned build: hardenedRuntime disabled, afterPack ad-hoc sign')
  ebArgs.push('-c.mac.hardenedRuntime=false')
}

const result = spawnSync(NPM_CMD, ['exec', '--', 'electron-builder', ...ebArgs], {
  cwd: DESKTOP_ROOT,
  stdio: 'inherit',
  shell: NPM_SHELL,
  env: process.env,
})

process.exit(result.status ?? 1)
