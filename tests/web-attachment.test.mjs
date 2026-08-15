/**
 * Web 制品落盘 + 相对路径安全解析
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  readWebIndexHtml,
  resolveSafeWebRelativePath,
  saveWebAttachment,
  updateWebAttachment,
} from '../packages/agent/dist/index.js'
import { getUserDataStore } from '../packages/user-store/dist/index.js'

function withTempStore(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-web-att-'))
  const prev = process.env.OPPTRIX_DATA_DIR
  process.env.OPPTRIX_DATA_DIR = tmp
  getUserDataStore().close()
  return Promise.resolve()
    .then(() => fn(tmp))
    .finally(() => {
      getUserDataStore().close()
      fs.rmSync(tmp, { recursive: true, force: true })
      if (prev == null) delete process.env.OPPTRIX_DATA_DIR
      else process.env.OPPTRIX_DATA_DIR = prev
    })
}

describe('saveWebAttachment', () => {
  it('writes index.html and relative files under attachment dir', async () => {
    await withTempStore(async () => {
      const sessionId = 'sess-web-1'
      const meta = saveWebAttachment({
        sessionId,
        name: '行情看板',
        html: '<!doctype html><html><body><h1>ok</h1><script src="/opptrix-vendor/chart.js/chart.umd.min.js"></script></body></html>',
        files: [
          { path: 'styles.css', content: 'body{margin:0}' },
          { path: 'js/app.js', content: 'console.log(1)' },
        ],
      })
      assert.equal(meta.kind, 'web')
      assert.equal(meta.mime, 'text/html')
      assert.match(meta.name, /\.html$/i)
      assert.ok(meta.web?.files?.includes('styles.css'))
      assert.ok(meta.web?.files?.includes('js/app.js'))

      const html = readWebIndexHtml(sessionId, meta.id)
      assert.ok(html?.includes('<h1>ok</h1>'))

      const cssPath = resolveSafeWebRelativePath(sessionId, meta.id, 'styles.css')
      assert.equal(fs.readFileSync(cssPath, 'utf8'), 'body{margin:0}')

      const jsPath = resolveSafeWebRelativePath(sessionId, meta.id, 'js/app.js')
      assert.equal(fs.readFileSync(jsPath, 'utf8'), 'console.log(1)')

      const updated = updateWebAttachment({
        sessionId,
        attachmentId: meta.id,
        html: '<html><body>v2</body></html>',
        files: [{ path: 'styles.css', content: 'body{color:red}' }],
      })
      assert.ok(updated)
      assert.equal(readWebIndexHtml(sessionId, meta.id), '<html><body>v2</body></html>')
      assert.equal(fs.readFileSync(cssPath, 'utf8'), 'body{color:red}')
    })
  })

  it('rejects path traversal on relative web assets', async () => {
    await withTempStore(async () => {
      const sessionId = 'sess-web-2'
      const meta = saveWebAttachment({
        sessionId,
        name: 'safe',
        html: '<html></html>',
      })
      assert.throws(
        () => resolveSafeWebRelativePath(sessionId, meta.id, '../meta.json'),
        /无效/,
      )
      assert.throws(
        () => resolveSafeWebRelativePath(sessionId, meta.id, '..\\..\\etc\\passwd'),
        /无效/,
      )
      assert.throws(
        () => resolveSafeWebRelativePath(sessionId, meta.id, 'meta.json'),
        /无效/,
      )
      // default entry ok
      const indexPath = resolveSafeWebRelativePath(sessionId, meta.id, '')
      assert.ok(indexPath.endsWith(`${path.sep}index.html`))
    })
  })
})
