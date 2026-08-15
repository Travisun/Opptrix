import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isSerialTool,
  SERIAL_TOOL_NAMES,
  partitionToolCallsForExecution,
} from '../packages/agent/dist/loop/tool-parallel.js'

function tc(id, name) {
  return { id, function: { name, arguments: '{}' } }
}

test('isSerialTool covers Explorer serial set', () => {
  for (const name of [
    'ask_user',
    'workspace_write',
    'workspace_replace_lines',
    'workspace_delete',
    'download_file',
    'request_folder_access',
    'opptrix_run',
    'shell_run',
    'opptrix_install',
    'shell_install',
    'code_preflight',
    'ensure_python',
    'request_secret',
    'grant_session_secret',
    'create_scheduled_job',
    'update_scheduled_job',
    'enable_scheduled_job',
    'disable_scheduled_job',
    'delete_scheduled_job',
    'run_scheduled_job_now',
    'activate_tool_pack',
    'activate_agent_skill',
    'enable_mcp_server',
    'disable_mcp_server',
    'edit_mcp_server',
    'install_mcp_server',
    'uninstall_mcp_server',
    'reorder_mcp_servers',
    'update_research_checklist',
    'browser_navigate',
    'browser_click',
    'browser_type',
    'browser_close',
    'browser_screenshot',
  ]) {
    assert.equal(isSerialTool(name), true, name)
    assert.equal(SERIAL_TOOL_NAMES.has(name), true, name)
  }
})

test('schedule_turn_wake registers async and is not serial', () => {
  assert.equal(isSerialTool('schedule_turn_wake'), false)
  assert.equal(SERIAL_TOOL_NAMES.has('schedule_turn_wake'), false)
})

test('namespaced external MCP tools are serial by default', () => {
  assert.equal(isSerialTool('my_server__get_quote'), true)
  assert.equal(isSerialTool('alpha__tool'), true)
})

test('read-only research tools are parallel-eligible', () => {
  for (const name of [
    'get_instrument_realtime',
    'search_instruments',
    'workspace_glob',
    'workspace_read',
    'browser_snapshot',
    'http_fetch',
    'evaluate_instrument',
  ]) {
    assert.equal(isSerialTool(name), false, name)
  }
})

test('partition: consecutive reads → one parallel batch', () => {
  const calls = [tc('1', 'workspace_read'), tc('2', 'get_instrument_realtime'), tc('3', 'search_instruments')]
  const batches = partitionToolCallsForExecution(calls)
  assert.equal(batches.length, 1)
  assert.equal(batches[0].mode, 'parallel')
  assert.deepEqual(batches[0].calls.map(c => c.id), ['1', '2', '3'])
})

test('partition: serial tool splits batches and stays alone', () => {
  const calls = [
    tc('a', 'workspace_read'),
    tc('b', 'get_instrument_realtime'),
    tc('c', 'ask_user'),
    tc('d', 'workspace_read'),
    tc('e', 'shell_run'),
  ]
  const batches = partitionToolCallsForExecution(calls)
  assert.deepEqual(
    batches.map(b => ({ mode: b.mode, ids: b.calls.map(c => c.id) })),
    [
      { mode: 'parallel', ids: ['a', 'b'] },
      { mode: 'serial', ids: ['c'] },
      { mode: 'parallel', ids: ['d'] },
      { mode: 'serial', ids: ['e'] },
    ],
  )
})

test('partition: order contract — flat call ids match input order', () => {
  const calls = [
    tc('1', 'search_instruments'),
    tc('2', 'ask_user'),
    tc('3', 'workspace_read'),
    tc('4', 'workspace_write'),
    tc('5', 'get_instrument_realtime'),
  ]
  const batches = partitionToolCallsForExecution(calls)
  const flat = batches.flatMap(b => b.calls.map(c => c.id))
  assert.deepEqual(flat, ['1', '2', '3', '4', '5'])
})

test('partition: all-serial stays serial singles', () => {
  const calls = [tc('1', 'ask_user'), tc('2', 'shell_run')]
  const batches = partitionToolCallsForExecution(calls)
  assert.equal(batches.every(b => b.mode === 'serial' && b.calls.length === 1), true)
})

test('partition: single read is parallel batch of one', () => {
  const batches = partitionToolCallsForExecution([tc('x', 'workspace_read')])
  assert.equal(batches.length, 1)
  assert.equal(batches[0].mode, 'parallel')
  assert.equal(batches[0].calls.length, 1)
})
