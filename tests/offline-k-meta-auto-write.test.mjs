/**
 * offline-k-meta 自动写入：成功写 meta / 失败与非目标模式不写
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'node:http'
import {
  offlineKMetaPath,
  readOfflineKMeta,
  recordOfflineKDumpSuccess,
  shouldAutoWriteOfflineKMeta,
  tryRecordOfflineKDumpSuccess,
  OFFLINE_K_META_RELATIVE_PATH,
  resolveSharedWorkspaceRoot,
} from '../packages/agent-workspace/dist/index.js'
import { prepareFuyaoDump } from '../packages/market-data/dist/index.js'
import { getLocalDataCatalog } from '../packages/agent/dist/local-data-catalog.js'

async function withTmpDataDir(fn) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'opptrix-offline-meta-'))
  const prev = process.env.OPPTRIX_DATA_DIR
  process.env.OPPTRIX_DATA_DIR = tmp
  try {
    await fn(tmp)
  } finally {
    if (prev == null) delete process.env.OPPTRIX_DATA_DIR
    else process.env.OPPTRIX_DATA_DIR = prev
    await fs.rm(tmp, { recursive: true, force: true })
  }
}

test('shouldAutoWriteOfflineKMeta only for full|incremental + local_path + ok', () => {
  assert.equal(shouldAutoWriteOfflineKMeta('full', 'local_path', true), true)
  assert.equal(shouldAutoWriteOfflineKMeta('incremental', 'local_path', true), true)
  assert.equal(shouldAutoWriteOfflineKMeta('adjustment_factors', 'local_path', true), false)
  assert.equal(shouldAutoWriteOfflineKMeta('full', 'presigned_url', true), false)
  assert.equal(shouldAutoWriteOfflineKMeta('full', 'local_path', false), false)
  assert.equal(shouldAutoWriteOfflineKMeta('incremental', 'local_path', false), false)
})

test('recordOfflineKDumpSuccess writes lastSuccessAt and lastDumpKind', async () => {
  await withTmpDataDir(async () => {
    const at = new Date('2026-07-27T12:00:00.000Z')
    const { meta, metaPath, metaRelativePath } = await recordOfflineKDumpSuccess({
      dumpKind: 'full',
      bytes: 12345,
      at,
    })
    assert.equal(metaRelativePath, OFFLINE_K_META_RELATIVE_PATH)
    assert.equal(metaPath, offlineKMetaPath())
    assert.equal(meta.lastSuccessAt, at.toISOString())
    assert.equal(meta.lastDumpKind, 'full')
    assert.equal(meta.bytes, 12345)
    assert.equal(meta.fullRelativePath, 'data/dumps/cn-daily-k-full.parquet')
    assert.equal(meta.incrRelativePath, 'data/dumps/cn-daily-k-incr.parquet')

    const disk = JSON.parse(await fs.readFile(metaPath, 'utf8'))
    assert.equal(disk.lastSuccessAt, at.toISOString())
    assert.equal(disk.lastDumpKind, 'full')

    const incr = await recordOfflineKDumpSuccess({
      dumpKind: 'incremental',
      bytes: 99,
      at: new Date('2026-07-28T12:00:00.000Z'),
    })
    assert.equal(incr.meta.lastDumpKind, 'incremental')
    assert.equal(incr.meta.fullRelativePath, 'data/dumps/cn-daily-k-full.parquet')
    assert.equal(incr.meta.bytes, 99)
  })
})

test('tryRecordOfflineKDumpSuccess writes on success and skips adjustment_factors', async () => {
  await withTmpDataDir(async () => {
    const ok = await tryRecordOfflineKDumpSuccess({
      dumpKind: 'incremental',
      mode: 'local_path',
      ok: true,
      bytes: 4096,
    })
    assert.equal(ok.meta_written, true)
    assert.equal(ok.meta_path, OFFLINE_K_META_RELATIVE_PATH)
    const meta = await readOfflineKMeta(offlineKMetaPath())
    assert.ok(meta?.lastSuccessAt)
    assert.equal(meta?.lastDumpKind, 'incremental')

    const prevAt = meta.lastSuccessAt
    const skipAdj = await tryRecordOfflineKDumpSuccess({
      dumpKind: 'adjustment_factors',
      mode: 'local_path',
      ok: true,
      bytes: 100,
    })
    assert.equal(skipAdj.meta_written, false)
    const afterAdj = await readOfflineKMeta(offlineKMetaPath())
    assert.equal(afterAdj?.lastSuccessAt, prevAt)
    assert.equal(afterAdj?.lastDumpKind, 'incremental')

    const skipFail = await tryRecordOfflineKDumpSuccess({
      dumpKind: 'full',
      mode: 'local_path',
      ok: false,
    })
    assert.equal(skipFail.meta_written, false)
    const afterFail = await readOfflineKMeta(offlineKMetaPath())
    assert.equal(afterFail?.lastSuccessAt, prevAt)
  })
})

test('prepareFuyaoDump success + tryRecord writes meta under shared cache', async () => {
  await withTmpDataDir(async () => {
    const dest = path.join(resolveSharedWorkspaceRoot(), 'data', 'dumps')
    await fs.mkdir(dest, { recursive: true })
    const parquet = Buffer.alloc(8192, 2)
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-length': String(parquet.length) })
      res.end(parquet)
    })
    await new Promise(r => server.listen(0, '127.0.0.1', r))
    const { port } = /** @type {{ port: number }} */ (server.address())
    try {
      const result = await prepareFuyaoDump({
        dumpKind: 'full',
        mode: 'local_path',
        forceRefresh: true,
        destDir: dest,
        fetchUrl: async () => ({
          presigned_url: `http://127.0.0.1:${port}/full.parquet`,
        }),
      })
      assert.equal(result.ok, true, result.error)

      const metaResult = await tryRecordOfflineKDumpSuccess({
        dumpKind: 'full',
        mode: 'local_path',
        ok: result.ok,
        bytes: result.bytes,
      })
      assert.equal(metaResult.meta_written, true)

      const metaFile = path.join(
        resolveSharedWorkspaceRoot(),
        'data',
        'cache',
        'offline-k-meta.json',
      )
      const raw = await fs.readFile(metaFile, 'utf8')
      const parsed = JSON.parse(raw)
      assert.ok(parsed.lastSuccessAt)
      assert.equal(parsed.lastDumpKind, 'full')
      assert.equal(typeof parsed.bytes, 'number')
    } finally {
      server.close()
    }
  })
})

test('prepareFuyaoDump failure path does not write offline-k-meta', async () => {
  await withTmpDataDir(async () => {
    const dest = path.join(resolveSharedWorkspaceRoot(), 'data', 'dumps')
    await fs.mkdir(dest, { recursive: true })
    const result = await prepareFuyaoDump({
      dumpKind: 'incremental',
      mode: 'local_path',
      forceRefresh: true,
      destDir: dest,
      fetchUrl: async () => {
        throw new Error('mock download-url failure')
      },
    })
    assert.equal(result.ok, false)

    const metaResult = await tryRecordOfflineKDumpSuccess({
      dumpKind: 'incremental',
      mode: 'local_path',
      ok: result.ok,
      bytes: result.bytes,
    })
    assert.equal(metaResult.meta_written, false)

    const metaFile = offlineKMetaPath()
    await assert.rejects(() => fs.access(metaFile), { code: 'ENOENT' })
  })
})

test('catalog notes prepare_fuyao_dump auto-writes meta', () => {
  const pkg = getLocalDataCatalog({ api_id: 'shared.packages.cn-offline-daily-k' })
  assert.ok(!('error' in pkg))
  assert.match(pkg.how_to_call, /自动写/)
  assert.match(pkg.how_to_call, /markUpdateSuccess.*补写|补写.*markUpdateSuccess/)

  const dump = getLocalDataCatalog({ api_id: 'fuyao.dump' })
  assert.ok(!('error' in dump))
  assert.ok(dump.notes?.some(n => /自动写|offline-k-meta/.test(n)))
})
