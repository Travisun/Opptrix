import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

describe('platform-jobs K3', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('createJobsFacade aggregates mocked backends and dedupes by source:id', () => {
    /** @type {import('../apps/server/dist/platform/index.js').JobsFacadeBackend[]} */
    const backends = [
      {
        list: () => [
          {
            id: 'a1',
            kind: 'agent.shell-command',
            status: 'running',
            label: 'echo hi',
            updatedAt: '2026-01-01T00:00:00.000Z',
            source: 'agent-job-registry',
          },
        ],
        cancel: (id) => id === 'a1',
      },
      {
        list: () => [
          {
            id: 'd1',
            kind: 'discover',
            status: 'running',
            label: 'discover one',
            updatedAt: '2026-01-02T00:00:00.000Z',
            source: 'discover-jobs',
          },
          // Same source+id twice — second dropped
          {
            id: 'd1',
            kind: 'discover',
            status: 'done',
            label: 'dup dropped',
            source: 'discover-jobs',
          },
        ],
        cancel: (id) => id === 'd1',
      },
      {
        list: () => [
          {
            id: 's1',
            kind: 'schedule.agent_chat',
            status: 'scheduled',
            label: 'morning brief',
            source: 'schedule',
          },
        ],
        cancel: () => false,
      },
      {
        list: () => [],
        cancel: () => false,
      },
    ]

    const facade = platform.createJobsFacade({ backends })
    const listed = facade.list()
    assert.equal(listed.length, 3)
    assert.deepEqual(
      listed.map((j) => `${j.source}:${j.id}`),
      ['agent-job-registry:a1', 'discover-jobs:d1', 'schedule:s1'],
    )
    assert.equal(listed[0]?.label, 'echo hi')
    assert.equal(listed[1]?.label, 'discover one')
  })

  it('cancel tries backends in order and returns true on first success', () => {
    /** @type {string[]} */
    const tried = []
    const facade = platform.createJobsFacade({
      backends: [
        {
          list: () => [],
          cancel: (id) => {
            tried.push(`agent:${id}`)
            return false
          },
        },
        {
          list: () => [],
          cancel: (id) => {
            tried.push(`discover:${id}`)
            return id === 'job-x'
          },
        },
        {
          list: () => [],
          cancel: (id) => {
            tried.push(`schedule:${id}`)
            return id === 'sched-only'
          },
        },
      ],
    })

    assert.equal(facade.cancel('job-x'), true)
    assert.deepEqual(tried, ['agent:job-x', 'discover:job-x'])
    assert.equal(facade.cancel(''), false)
    tried.length = 0
    assert.equal(facade.cancel('missing'), false)
    assert.deepEqual(tried, ['agent:missing', 'discover:missing', 'schedule:missing'])
  })

  it('createPlatformContext wires a real jobs facade', () => {
    const ctx = platform.createPlatformContext()
    assert.equal(ctx.abiVersion, '0.8.43-w58')
    assert.ok(ctx.jobs)
    assert.equal(typeof ctx.jobs.list, 'function')
    assert.equal(typeof ctx.jobs.cancel, 'function')
    assert.ok(Array.isArray(ctx.jobs.list()))
    assert.equal(ctx.jobs.cancel('__no_such_job__'), false)
    assert.ok(ctx.extensions)
    assert.ok(ctx.packs)
    assert.ok(ctx.meter)
  })
})
