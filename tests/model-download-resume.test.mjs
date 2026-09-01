import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const repoRoot = path.resolve(import.meta.dirname, '..')

async function importDownload() {
  return import(
    pathToFileURL(path.join(repoRoot, 'apps/desktop/scripts/lib/model-download.mjs')).href
  )
}

describe('model-download resume', () => {
  /** @type {string | undefined} */
  let tmpDir
  /** @type {http.Server | undefined} */
  let server
  /** @type {number} */
  let port = 0

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-dl-resume-'))
    const payload = Buffer.alloc(64 * 1024, 0xab)
    server = http.createServer((req, res) => {
      const range = req.headers.range
      if (range) {
        const m = /^bytes=(\d+)-$/.exec(String(range))
        const start = m ? Number(m[1]) : 0
        if (start >= payload.length) {
          res.writeHead(416)
          res.end()
          return
        }
        const slice = payload.subarray(start)
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${payload.length - 1}/${payload.length}`,
          'Content-Length': String(slice.length),
          'Accept-Ranges': 'bytes',
        })
        res.end(slice)
        return
      }
      res.writeHead(200, {
        'Content-Length': String(payload.length),
        'Accept-Ranges': 'bytes',
      })
      res.end(payload)
    })
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address()
        port = typeof addr === 'object' && addr ? addr.port : 0
        resolve(undefined)
      })
    })
  })

  afterEach(async () => {
    if (server) {
      await new Promise((resolve) => server.close(() => resolve(undefined)))
    }
    if (tmpDir) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  })

  it('resumes from .download partial via Range', async () => {
    const mod = await importDownload()
    const dest = path.join(tmpDir, 'blob.bin')
    const partial = `${dest}.download`
    const firstHalf = Buffer.alloc(32 * 1024, 0xab)
    await fs.promises.writeFile(partial, firstHalf)

    /** @type {number[]} */
    const receivedMarks = []
    await mod.downloadWithRetries(`http://127.0.0.1:${port}/blob.bin`, dest, {
      logPrefix: 'test-resume',
      onProgress: (p) => {
        receivedMarks.push(p.received)
      },
    })

    assert.equal(fs.existsSync(dest), true)
    assert.equal(fs.existsSync(partial), false)
    assert.equal(fs.statSync(dest).size, 64 * 1024)
    assert.ok(receivedMarks.some((n) => n >= 32 * 1024))
  })
})
