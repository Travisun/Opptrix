#!/usr/bin/env node
/**
 * 离线 Harness 实验室 — 可选自动晋升（不进 engine.chat / 不注册为 chat tool）。
 *
 * Usage:
 *   node scripts/harness-lab-auto.mjs
 *   npm run harness:lab
 *
 * Env:
 *   OPPTRIX_HARNESS_AUTO_PROMOTE=0|false|off  — 强制关停自动晋升
 */

import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// 读已构建 dist
const agentPath = path.join(root, 'packages/agent/dist/index.js')
const { runHarnessLab, isHarnessAutoPromoteEnabled } = await import(agentPath)

const enabled = isHarnessAutoPromoteEnabled()
const result = runHarnessLab({
  promote: 'auto',
  includeHeldIn: true,
  reportInput: {
    turns: [
      { role: 'user', content: '茅台多少钱' },
      {
        role: 'assistant',
        content: '大概 1800',
        toolSteps: [
          {
            id: 'lab-1',
            tool: 'get_stock_quote',
            label: '行情',
            status: 'error',
            resultPreview: '{"error":"timeout"}',
            startedAt: new Date().toISOString(),
          },
        ],
      },
    ],
  },
})

const summary = {
  autoPromoteEnabled: enabled,
  hasProposal: Boolean(result.proposal),
  validationOk: result.validation?.ok ?? null,
  safetyVeto: result.validation?.safetyVeto ?? null,
  promotedId: result.promoted?.id ?? null,
  skipReason: result.skipReason ?? null,
  heldInExamCount: result.heldIn?.examCount ?? null,
}

console.log(JSON.stringify(summary, null, 2))
process.exitCode = result.promoted || result.skipReason || !result.proposal ? 0 : 1
