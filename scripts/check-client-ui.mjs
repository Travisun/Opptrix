#!/usr/bin/env node
/**
 * client-ui 统一本地 QA（改码后测试环节入口）
 *
 * 1. TypeScript 类型检查
 * 2. ESLint React / Hooks / jsx-key
 * 3. 仓库定制 React 模式审查（listRowKey、不稳定 hook 参数等）
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** @type {Array<{ name: string, cmd: string, args: string[] }>} */
const STEPS = [
  { name: 'TypeScript (typecheck:ui)', cmd: 'npm', args: ['run', 'typecheck:ui'] },
  { name: 'ESLint (lint:ui)', cmd: 'npm', args: ['run', 'lint:ui'] },
  { name: 'React pattern audit (audit:ui)', cmd: 'node', args: ['scripts/audit-client-ui-react.mjs'] },
]

function runStep({ name, cmd, args }) {
  console.log(`\n━━━ ${name} ━━━`)
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  return result.status ?? 1
}

let failed = false
for (const step of STEPS) {
  if (runStep(step) !== 0) failed = true
}

console.log(failed ? '\n[check:ui] FAILED' : '\n[check:ui] ALL PASSED')
process.exit(failed ? 1 : 0)
