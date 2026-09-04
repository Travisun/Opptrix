import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

const ENFORCE_ENV = 'OPPTRIX_PLATFORM_PACK_ENFORCE'

/**
 * SF-thin-A: grant file overwrite/delete no longer use Hands confirm.
 * Former SF2 ask_user confirm path is unbound; helpers may remain deprecated.
 */
describe('hands ConfirmHandler SF2 → thin-A (no file confirm)', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  /** @type {string | undefined} */
  let prevEnforceEnv

  beforeEach(async () => {
    prevEnforceEnv = process.env[ENFORCE_ENV]
    process.env[ENFORCE_ENV] = '0'
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
    platform.createPlatformContext().packs.enable('coding', true)
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
    if (prevEnforceEnv === undefined) {
      delete process.env[ENFORCE_ENV]
    } else {
      process.env[ENFORCE_ENV] = prevEnforceEnv
    }
  })

  it('ABI is 0.9.0-phase-a', () => {
    const ctx = platform.createPlatformContext()
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.9.0-phase-a')
    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
  })

  it('overwrite without ConfirmHandler → ok (thin-A)', async () => {
    const hands = platform.createHandsPort({
      gate: platform.createPlatformContext().gate,
      workspace: {
        async listGrants() {
          return []
        },
        async listDir() {
          return { entries: [], path: '.' }
        },
        async readFile() {
          return { content: '', truncated: false, size: 0 }
        },
        async mkdir() {
          return { path: 'd' }
        },
        async deletePath() {
          return { deleted: 'x' }
        },
        async writeFile(_sessionId, _rootId, relPath, content) {
          return { path: relPath, bytes: Buffer.byteLength(content, 'utf8') }
        },
      },
    })

    const issued = hands.issue({
      token: 'hands.workspace.writeFile',
      args: {
        sessionId: 's1',
        rootId: 'default',
        relPath: 'x.txt',
        content: 'ok',
        confirmOverwrite: true,
      },
    })
    assert.equal(issued.ok, true)
    if (!issued.ok) throw new Error('expected issue ok')
    const obs = await hands.invoke(issued.ticket)
    assert.equal(obs.ok, true)
    if (!obs.ok) throw new Error(`expected ok, got ${obs.error}`)
    const data = /** @type {{ path?: string }} */ (obs.data)
    assert.equal(data.path, 'x.txt')
  })

  it('bindHandsConfirmHandler is dead no-op; overwrite still ok', async () => {
    const hands = platform.createHandsPort({
      gate: platform.createPlatformContext().gate,
      workspace: {
        async listGrants() {
          return []
        },
        async listDir() {
          return { entries: [], path: '.' }
        },
        async readFile() {
          return { content: '', truncated: false, size: 0 }
        },
        async mkdir() {
          return { path: 'd' }
        },
        async deletePath() {
          return { deleted: 'x' }
        },
        async writeFile(_sessionId, _rootId, relPath, content) {
          return { path: relPath, bytes: Buffer.byteLength(content, 'utf8') }
        },
      },
    })
    hands.bindHandsConfirmHandler(null)
    hands.bindHandsConfirmHandler(
      platform.createHandsConfirmHandler({
        allocatePromptId: () => 'x',
        pushUserPrompt: () => {
          throw new Error('should not push user_prompt for grant file ops')
        },
        waitForAnswer: async () => ({
          kind: 'option',
          selected_ids: ['confirm'],
          selected_labels: ['确认'],
        }),
      }),
    )

    const issued = hands.issue({
      token: 'hands.workspace.writeFile',
      args: {
        sessionId: 's1',
        rootId: 'default',
        relPath: 'x.txt',
        content: 'ok',
        confirmOverwrite: true,
      },
    })
    assert.equal(issued.ok, true)
    if (!issued.ok) throw new Error('expected issue ok')
    const obs = await hands.invoke(issued.ticket)
    assert.equal(obs.ok, true)
  })

  it('PlatformContext.bindHandsConfirmHandler still exists (no-op)', () => {
    const ctx = platform.createPlatformContext()
    assert.equal(typeof ctx.bindHandsConfirmHandler, 'function')
    ctx.bindHandsConfirmHandler(null)
  })

  it('deprecated createHandsConfirmHandler still maps confirm → once', async () => {
    /** @type {Array<{ sessionId: string, payload: { id: string, mode?: string } }>} */
    const pushes = []
    /** @type {Map<string, (a: { kind: string, selected_ids: string[], selected_labels: string[] }) => void>} */
    const waiters = new Map()

    const handler = platform.createHandsConfirmHandler({
      allocatePromptId: () => 'prompt-sf2-1',
      pushUserPrompt: (sessionId, payload) => {
        pushes.push({ sessionId, payload })
      },
      waitForAnswer: (sessionId, promptId) =>
        new Promise((resolve) => {
          waiters.set(`${sessionId}:${promptId}`, resolve)
        }),
    })

    const confirmP = platform.runWithHandsConfirmSession('sess-ok', () =>
      handler({
        title: '确认覆盖',
        prompt: '文件「x.txt」已存在，确定覆盖吗？',
        options: [
          { id: 'once', label: '仅此一次' },
          { id: 'cancel', label: '取消' },
        ],
        operation: 'overwrite',
        root_id: 'default',
        path: 'x.txt',
      }),
    )

    assert.equal(pushes.length, 1)
    assert.equal(pushes[0]?.payload.mode, 'confirm')
    const resolveOk = waiters.get('sess-ok:prompt-sf2-1')
    assert.ok(resolveOk)
    resolveOk({
      kind: 'option',
      selected_ids: ['confirm'],
      selected_labels: ['确认'],
    })
    const okAnswer = await confirmP
    assert.deepEqual(okAnswer.selected_ids, ['once'])
  })
})
