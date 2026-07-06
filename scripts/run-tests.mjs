#!/usr/bin/env node
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const testsDir = path.join(root, 'tests')
const testFiles = readdirSync(testsDir)
  .filter(name => name.endsWith('.test.mjs'))
  .sort()
  .map(name => path.join('tests', name))

const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...testFiles], {
  cwd: root,
  stdio: 'inherit',
  shell: false,
})

process.exit(result.status ?? 1)
