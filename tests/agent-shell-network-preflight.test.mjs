/**
 * 沙盒联网预授权（requestNetworkInstall / Egress）与 workspace_write 换行
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  NetworkInstallStickyStore,
  SessionNetworkEgressStore,
  WorkspaceService,
  normalizeWorkspaceTextContent,
  hostFromNetworkInput,
} from '../packages/agent-workspace/dist/index.js'

async function withTmpDataDir(fn) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'opptrix-net-preflight-'))
  const prev = process.env.OPPTRIX_DATA_DIR
  process.env.OPPTRIX_DATA_DIR = tmp
  try {
    return await fn(tmp)
  } finally {
    if (prev === undefined) delete process.env.OPPTRIX_DATA_DIR
    else process.env.OPPTRIX_DATA_DIR = prev
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {})
  }
}

test('NetworkInstallStickyStore grantPreflight consume', () => {
  const sticky = new NetworkInstallStickyStore()
  assert.equal(sticky.has('s1'), false)
  sticky.grantPreflight('s1')
  assert.equal(sticky.hasPreflight('s1'), true)
  assert.equal(sticky.consumePreflight('s1'), true)
  assert.equal(sticky.hasPreflight('s1'), false)
  assert.equal(sticky.consumePreflight('s1'), false)
})

test('requestNetworkInstall sticky → sticky.has', async () => {
  await withTmpDataDir(async () => {
    const networkSticky = new NetworkInstallStickyStore()
    const svc = new WorkspaceService({ networkInstallSticky: networkSticky })
    const sessionId = 'preflight-sticky'
    let confirms = 0
    const result = await svc.requestNetworkInstall(sessionId, async () => {
      confirms++
      return { selected_ids: ['sticky'] }
    }, '需要装 pip 包')
    assert.equal(result.ok, true)
    assert.equal(result.already_granted, true)
    assert.equal(result.sticky, true)
    assert.equal(networkSticky.has(sessionId), true)
    assert.equal(confirms, 0, '包源默认已放行，预批零确认')

    const again = await svc.requestNetworkInstall(sessionId, async () => {
      confirms++
      return { selected_ids: ['cancel'] }
    })
    assert.equal(again.already_granted, true)
    assert.equal(confirms, 0)
  })
})

test('requestNetworkInstall once preflight → shell install 路径不再弹联网确认', async () => {
  await withTmpDataDir(async () => {
    const networkSticky = new NetworkInstallStickyStore()
    const svc = new WorkspaceService({
      networkInstallSticky: networkSticky,
    })
    const sessionId = 'preflight-once'
    await svc.ensureDefaultRoot(sessionId)

    let networkConfirms = 0
    await svc.requestNetworkInstall(sessionId, async (payload) => {
      networkConfirms++
      assert.equal(payload.title, '允许联网安装')
      return { selected_ids: ['once'] }
    })
    assert.equal(networkConfirms, 0, '包源默认已放行，预批零确认')
    assert.equal(networkSticky.has(sessionId), true)

    let runNetworkConfirms = 0
    try {
      await svc.shellRun({
        sessionId,
        rootId: 'default',
        command: 'pip3 install six',
        networkIntent: 'install',
      }, async (payload) => {
        if (payload.title === '允许联网安装') runNetworkConfirms++
        return { selected_ids: ['cancel'] }
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      assert.doesNotMatch(msg, /需要用户确认联网安装/)
      assert.notEqual(err?.name, 'NetworkInstallConfirmationRequiredError')
    }
    assert.equal(runNetworkConfirms, 0, '主路径默认含包源，不应弹联网安装确认')
  })
})

test('requestNetworkEgress grants host session', async () => {
  await withTmpDataDir(async () => {
    const egress = new SessionNetworkEgressStore()
    const svc = new WorkspaceService({ sessionNetworkEgress: egress })
    const sessionId = 'egress-grant'
    // 公网 IP 免 DNS，避免测试环境无解析
    const result = await svc.requestNetworkEgress(
      sessionId,
      ['8.8.8.8', '1.1.1.1'],
      async () => ({ selected_ids: ['allow_host_session'] }),
      '脚本需访问公共 DNS',
    )
    assert.equal(result.ok, true)
    assert.ok(result.granted_hosts.includes('8.8.8.8'))
    assert.ok(result.granted_hosts.includes('1.1.1.1'))
    assert.equal(egress.hasHost(sessionId, '8.8.8.8'), true)
    assert.equal(egress.hasHost(sessionId, '1.1.1.1'), true)
  })
})

test('requestNetworkEgress once → preflight hosts', async () => {
  await withTmpDataDir(async () => {
    const egress = new SessionNetworkEgressStore()
    const svc = new WorkspaceService({ sessionNetworkEgress: egress })
    const sessionId = 'egress-once'
    const result = await svc.requestNetworkEgress(
      sessionId,
      ['8.8.4.4'],
      async () => ({ selected_ids: ['allow_host_once'] }),
    )
    assert.equal(result.ok, true)
    assert.deepEqual(result.once_hosts, ['8.8.4.4'])
    assert.equal(egress.hasPreflightHost(sessionId, '8.8.4.4'), true)
    assert.equal(egress.hasHost(sessionId, '8.8.4.4'), false)
    const consumed = egress.consumeAllPreflight(sessionId)
    assert.deepEqual(consumed, ['8.8.4.4'])
    assert.equal(egress.hasPreflightHost(sessionId, '8.8.4.4'), false)
  })
})

test('SessionNetworkEgressStore preflight without DNS', () => {
  const egress = new SessionNetworkEgressStore()
  egress.grantPreflightHost('s1', 'cdn.Example.ORG')
  assert.equal(egress.hasPreflightHost('s1', 'cdn.example.org'), true)
  assert.equal(egress.hasHost('s1', 'cdn.example.org'), false)
  egress.grantHost('s1', 'cdn.example.org')
  assert.equal(egress.hasPreflightHost('s1', 'cdn.example.org'), false)
  assert.equal(egress.hasHost('s1', 'cdn.example.org'), true)
})

test('hostFromNetworkInput parses URL and bare host', () => {
  assert.equal(hostFromNetworkInput('https://PyPI.org/simple'), 'pypi.org')
  assert.equal(hostFromNetworkInput('Example.COM'), 'example.com')
})

test('normalizeWorkspaceTextContent LF and windows script EOL', () => {
  const py = normalizeWorkspaceTextContent('script.py', 'a\r\nb\rc\n')
  assert.equal(py, 'a\nb\nc\n')
  const bat = normalizeWorkspaceTextContent('run.bat', 'echo hi\r\nexit\n')
  if (os.EOL === '\r\n') {
    assert.equal(bat, 'echo hi\r\nexit\r\n')
  } else {
    assert.equal(bat, 'echo hi\nexit\n')
  }
  const ps1 = normalizeWorkspaceTextContent('x.ps1', 'Write-Host 1\r\n')
  if (os.EOL === '\r\n') {
    assert.equal(ps1.includes('\r\n'), true)
  } else {
    assert.equal(ps1, 'Write-Host 1\n')
  }
})

test('decodeWorkspaceText strips BOM and detects CRLF', async () => {
  const {
    decodeWorkspaceText,
    encodeWorkspaceText,
    WorkspaceTextEncodingError,
  } = await import('../packages/agent-workspace/dist/workspace-text.js')
  const bomCrlf = Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from('你好\r\n世界\r\n', 'utf8'),
  ])
  const decoded = decodeWorkspaceText(bomCrlf)
  assert.equal(decoded.hadBom, true)
  assert.equal(decoded.eol, 'crlf')
  assert.equal(decoded.text, '你好\n世界\n')
  const encoded = encodeWorkspaceText(decoded.text, { relPath: 'a.py', eol: decoded.eol })
  assert.equal(encoded.equals(Buffer.from('你好\r\n世界\r\n', 'utf8')), true)
  assert.equal(encoded[0] === 0xef, false)
})

test('decodeWorkspaceText rejects illegal utf8 with hint', async () => {
  const {
    decodeWorkspaceText,
    WorkspaceTextEncodingError,
    WORKSPACE_TEXT_ENCODING_HINT,
  } = await import('../packages/agent-workspace/dist/workspace-text.js')
  assert.throws(
    () => decodeWorkspaceText(Buffer.from([0xff, 0xfe, 0x41])),
    (err) => err instanceof WorkspaceTextEncodingError
      && err.hint.includes('UTF-8')
      && WORKSPACE_TEXT_ENCODING_HINT.includes('UTF-8'),
  )
})

test('workspace_write applies newline normalization', async () => {
  await withTmpDataDir(async () => {
    const svc = new WorkspaceService()
    const sessionId = 'write-nl'
    await svc.ensureDefaultRoot(sessionId)
    await svc.writeFile(sessionId, 'default', 'hello.py', 'print(1)\r\nprint(2)\r')
    const read = await svc.readFile(sessionId, 'default', 'hello.py')
    assert.equal(read.content, 'print(1)\nprint(2)\n')
  })
})

test('workspace replaceLines preserves CRLF on disk', async () => {
  await withTmpDataDir(async () => {
    const svc = new WorkspaceService()
    const sessionId = 'crlf-preserve'
    await svc.ensureDefaultRoot(sessionId)
    const root = (await svc.listGrants(sessionId)).find(g => g.root_id === 'default')
    assert.ok(root)
    const abs = path.join(root.abs_path, 'crlf.py')
    await fs.writeFile(abs, Buffer.from('a\r\nb\r\nc\r\n', 'utf8'))
    const r = await svc.replaceLines(sessionId, 'default', 'crlf.py', [
      { start_line: 2, new_text: 'B' },
    ])
    assert.equal(r.ok, true)
    const raw = await fs.readFile(abs)
    assert.equal(raw.toString('binary'), 'a\r\nB\r\nc\r\n')
    const read = await svc.readFile(sessionId, 'default', 'crlf.py')
    assert.equal(read.content, 'a\nB\nc\n')
  })
})

test('workspace_read strips BOM for logic text', async () => {
  await withTmpDataDir(async () => {
    const svc = new WorkspaceService()
    const sessionId = 'bom-read'
    await svc.ensureDefaultRoot(sessionId)
    const root = (await svc.listGrants(sessionId)).find(g => g.root_id === 'default')
    assert.ok(root)
    const abs = path.join(root.abs_path, 'bom.txt')
    await fs.writeFile(abs, Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from('中文\n', 'utf8'),
    ]))
    const read = await svc.readFile(sessionId, 'default', 'bom.txt')
    assert.equal(read.content.startsWith('\uFEFF'), false)
    assert.equal(read.content, '中文\n')
  })
})

test('deprecated shell tools are not exposed in chat tools list', async () => {
  const toolsPath = path.resolve('packages/agent/src/mcp/workspace-tools.ts')
  const src = await fs.readFile(toolsPath, 'utf8')
  assert.doesNotMatch(src, /name:\s*'request_shell_network'/)
  assert.doesNotMatch(src, /name:\s*'opptrix_install'/)
  assert.doesNotMatch(src, /name:\s*'shell_install'/)
  assert.doesNotMatch(src, /name:\s*'shell_run'/)
  assert.match(src, /name:\s*'opptrix_run'/)
})

test('network install/egress preflight still uses ConfirmHandler not askUser', async () => {
  const runnerPath = path.resolve('packages/agent-workspace/src/shell/runner.ts')
  const src = await fs.readFile(runnerPath, 'utf8')
  assert.match(src, /requestNetworkInstall/)
  assert.match(src, /requestNetworkEgress/)
  assert.match(src, /confirmNetworkInstallPreflight|confirmNetworkEgressPreflight/)
})
