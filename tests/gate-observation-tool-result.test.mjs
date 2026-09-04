/**
 * C2: AgentEngine/Discover map Gate denials to error-shaped tool results.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const agentModUrl = pathToFileURL(
  path.join(here, '../packages/agent/dist/index.js'),
).href

describe('toolResultFromGateObservation (C2)', () => {
  /** @type {typeof import('../packages/agent/dist/index.js')} */
  let agent

  it('ok:true → returns data payload', async () => {
    agent = await import(agentModUrl)
    const data = { quote: 1 }
    assert.equal(
      agent.toolResultFromGateObservation({
        ok: true,
        data,
        auditId: 'a1',
      }),
      data,
    )
  })

  it('ok:false → { error, denialCode } (not success payload)', async () => {
    agent = await import(agentModUrl)
    const result = agent.toolResultFromGateObservation({
      ok: false,
      denialCode: 'pack_disabled',
      message: "Domain pack 'research' is disabled",
      auditId: 'a2',
      data: { shouldNotSurface: true },
    })
    assert.deepEqual(result, {
      error: "Domain pack 'research' is disabled",
      denialCode: 'pack_disabled',
    })
  })

  it('ok:false without message → derives error from denialCode', async () => {
    agent = await import(agentModUrl)
    const result = agent.toolResultFromGateObservation({
      ok: false,
      denialCode: 'quota_exceeded',
      auditId: 'a3',
    })
    assert.deepEqual(result, {
      error: 'Capability denied: quota_exceeded',
      denialCode: 'quota_exceeded',
    })
  })
})
