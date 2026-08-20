/**
 * MCP builtin-python 哨兵：materialize 展开 active_path、空 args / 未就绪失败态。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BUILTIN_NODE_COMMAND,
  BUILTIN_PYTHON_COMMAND,
  clearBuiltinPythonPathCacheForTests,
  isBuiltinPythonCommand,
  materializeBuiltinStdioTransport,
  setResolvePythonRuntimeForTests,
} from '../packages/agent/dist/mcp/builtin/resolve-builtin-stdio.js'

test.afterEach(() => {
  setResolvePythonRuntimeForTests(null)
  clearBuiltinPythonPathCacheForTests()
})

test('isBuiltinPythonCommand matches sentinel only', () => {
  assert.equal(isBuiltinPythonCommand(BUILTIN_PYTHON_COMMAND), true)
  assert.equal(isBuiltinPythonCommand('  builtin-python  '), true)
  assert.equal(isBuiltinPythonCommand(BUILTIN_NODE_COMMAND), false)
  assert.equal(isBuiltinPythonCommand('python3'), false)
})

test('builtin-python with script args expands to active_path and keeps cwd/env', async () => {
  let calls = 0
  setResolvePythonRuntimeForTests(async () => {
    calls += 1
    return {
      system_path: null,
      system_version: null,
      opptrix_path: '/mock/opptrix/python',
      opptrix_version: '3.12.0',
      active_source: 'opptrix',
      active_path: '/mock/opptrix/python',
      active_version: '3.12.0',
      ready: true,
      recommend_install: false,
      message: '已使用 Opptrix 托管 Python，可直接运行脚本与安装依赖。',
    }
  })

  const args = ['/abs/path/to/mcp_server.py', '--verbose']
  const out = await materializeBuiltinStdioTransport('my-py-mcp', {
    transport: 'stdio',
    command: BUILTIN_PYTHON_COMMAND,
    args,
    cwd: '/abs/path/to',
    env: { FOO: 'bar' },
  })
  assert.equal(out.command, '/mock/opptrix/python')
  assert.deepEqual(out.args, args)
  assert.equal(out.cwd, '/abs/path/to')
  assert.deepEqual(out.env, { FOO: 'bar' })
  assert.equal(calls, 1)

  // 短 TTL 缓存：第二次不应再次探测
  const out2 = await materializeBuiltinStdioTransport('my-py-mcp', {
    transport: 'stdio',
    command: BUILTIN_PYTHON_COMMAND,
    args: ['/other/script.py'],
  })
  assert.equal(out2.command, '/mock/opptrix/python')
  assert.equal(calls, 1)
})

test('builtin-python with empty args throws clear error (no silent system python)', async () => {
  setResolvePythonRuntimeForTests(async () => {
    throw new Error('should not probe when args empty')
  })
  await assert.rejects(
    () => materializeBuiltinStdioTransport('custom-py', {
      transport: 'stdio',
      command: BUILTIN_PYTHON_COMMAND,
      args: [],
    }),
    (err) => {
      assert.ok(err instanceof Error)
      assert.match(err.message, /脚本|绝对路径|服务编号/)
      assert.ok(!/api|token|provider|sqlite/i.test(err.message))
      return true
    },
  )
})

test('builtin-python when python not ready throws user-facing message', async () => {
  setResolvePythonRuntimeForTests(async () => ({
    system_path: null,
    system_version: null,
    opptrix_path: null,
    opptrix_version: null,
    active_source: 'none',
    active_path: null,
    active_version: null,
    ready: false,
    recommend_install: true,
    message: '尚未检测到可用的 Python。可在设置中安装托管版本，或先在系统中安装 Python。',
  }))
  await assert.rejects(
    () => materializeBuiltinStdioTransport('custom-py', {
      transport: 'stdio',
      command: BUILTIN_PYTHON_COMMAND,
      args: ['/abs/script.py'],
    }),
    (err) => {
      assert.ok(err instanceof Error)
      assert.match(err.message, /Python/)
      assert.match(err.message, /设置/)
      assert.ok(!/resolvePythonRuntime|active_path|probe/i.test(err.message))
      return true
    },
  )
})

test('builtin-node path still works alongside builtin-python', async () => {
  const customArgs = ['/opt/custom/mcp-entry.mjs']
  const materialized = await materializeBuiltinStdioTransport('custom-node', {
    transport: 'stdio',
    command: BUILTIN_NODE_COMMAND,
    args: customArgs,
  })
  assert.equal(materialized.command, process.execPath)
  assert.deepEqual(materialized.args, customArgs)
})
