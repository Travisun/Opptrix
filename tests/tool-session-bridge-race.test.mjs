/**
 * 同会话打断重发时，旧 chat finally 不得清掉新一轮的 workspace / pack bridge。
 * 依赖：先 npm run build -w @opptrix/agent
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  bindWorkspaceToolBridge,
  unbindWorkspaceToolBridge,
  clearWorkspaceToolBridge,
  buildWorkspaceTools,
} from '../packages/agent/dist/mcp/workspace-tools.js'
import { runInToolSession } from '../packages/agent/dist/mcp/tool-session-context.js'
import { ToolRegistry } from '../packages/agent/dist/tools.js'

function stubBridge(sessionId) {
  return {
    sessionId,
    confirm: async () => ({ selected_ids: [] }),
  }
}

test('unbind 旧 gen 不清除同会话新 bind 的 workspace bridge', async () => {
  clearWorkspaceToolBridge()
  const sessionId = 'sess-race-ws'
  const tools = buildWorkspaceTools()
  const folderAccess = tools.find(t => t.name === 'request_folder_access')
  assert.ok(folderAccess)

  const gen1 = bindWorkspaceToolBridge(stubBridge(sessionId))
  const gen2 = bindWorkspaceToolBridge(stubBridge(sessionId))
  assert.notEqual(gen1, gen2)

  // 模拟被 abort 的旧 chat finally：只应卸掉 gen1
  unbindWorkspaceToolBridge(sessionId, gen1)

  const ok = await runInToolSession(sessionId, () => folderAccess.handler({}))
  assert.equal(ok.awaiting_user_grant, true)

  // 卸掉正确 gen 后应报会话错误
  unbindWorkspaceToolBridge(sessionId, gen2)
  const fail = await runInToolSession(sessionId, () => folderAccess.handler({}))
  assert.match(String(fail.error ?? ''), /workspace 工具需在聊天会话中调用/)

  // 无 ALS 上下文同样失败
  const noCtx = await folderAccess.handler({})
  assert.match(String(noCtx.error ?? ''), /workspace 工具需在聊天会话中调用/)

  clearWorkspaceToolBridge()
})

test('clearPackSession 旧 gen 不清除同会话新 bind', async () => {
  const hub = { dispatch: async () => ({ success: true, data: {} }) }
  const registry = new ToolRegistry(hub)
  const sessionId = 'sess-race-pack'
  const activate = registry.get('activate_tool_pack')
  assert.ok(activate)

  const gen1 = registry.bindPackSession({
    sessionId,
    listPacks: () => ({ packs: [] }),
    activatePacks: () => ({ ok: true, activated: ['news'] }),
  })
  const gen2 = registry.bindPackSession({
    sessionId,
    listPacks: () => ({ packs: [] }),
    activatePacks: () => ({ ok: true, activated: ['etf'] }),
  })
  assert.notEqual(gen1, gen2)

  registry.clearPackSession(sessionId, gen1)

  const ok = await runInToolSession(sessionId, () =>
    activate.handler({ pack_ids: ['etf'] }),
  )
  assert.equal(ok.ok, true)
  assert.deepEqual(ok.activated, ['etf'])

  registry.clearPackSession(sessionId, gen2)
  const fail = await runInToolSession(sessionId, () =>
    activate.handler({ pack_ids: ['etf'] }),
  )
  assert.match(String(fail.error ?? ''), /activate_tool_pack 需在聊天会话中调用/)
})
