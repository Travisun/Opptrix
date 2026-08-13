/**
 * doc-library 孤儿 blob/md GC + deleteDocument 同步 unlink。
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile, utimes, access, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, before, after } from 'node:test'

describe('doc-library orphan blob/md GC', () => {
  /** @type {string} */
  let dir
  /** @type {string | undefined} */
  let prevDataDir

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'opptrix-doc-orphan-'))
    prevDataDir = process.env.OPPTRIX_DATA_DIR
    process.env.OPPTRIX_DATA_DIR = dir
  })

  after(async () => {
    if (prevDataDir === undefined) delete process.env.OPPTRIX_DATA_DIR
    else process.env.OPPTRIX_DATA_DIR = prevDataDir
    await rm(dir, { recursive: true, force: true })
  })

  it('prunes unreferenced blobs/md; keeps referenced; deleteDocument unlinks', async () => {
    const {
      openDocLibraryDb,
      DocLibraryRepository,
      pruneOrphanBlobsAndMarkdown,
      blobPathForSha,
      markdownPathForDocument,
      docLibraryRoot,
    } = await import('../packages/doc-library/dist/index.js')

    const dbPath = join(dir, 'doc-library', 'doc-library.db')
    const db = openDocLibraryDb(dbPath)
    const repo = new DocLibraryRepository(db)

    const shaKeep = createHash('sha256').update('keep-body').digest('hex')
    const shaOrphan = createHash('sha256').update('orphan-body').digest('hex')
    const keepBlob = blobPathForSha(shaKeep)
    const orphanBlob = blobPathForSha(shaOrphan)
    await mkdir(join(docLibraryRoot(), 'blobs'), { recursive: true })
    await mkdir(join(docLibraryRoot(), 'markdown'), { recursive: true })
    await writeFile(keepBlob, 'keep-body')
    await writeFile(orphanBlob, 'orphan-body')

    const docId = '11111111-1111-1111-1111-111111111111'
    const orphanMdId = '22222222-2222-2222-2222-222222222222'
    const keepMd = markdownPathForDocument(docId)
    const orphanMd = markdownPathForDocument(orphanMdId)
    await writeFile(keepMd, '# keep')
    await writeFile(orphanMd, '# orphan')

    repo.insertDocument({
      id: docId,
      content_sha256: shaKeep,
      name: 'keep.txt',
      mime: 'text/plain',
      kind: 'text',
      byte_size: 9,
      blob_path: keepBlob,
    })
    repo.markParseReady(docId, {
      pageCount: 1,
      charCount: 4,
      markdown: '# keep',
      chunks: [{ page: 1, offset: 0, text: 'keep' }],
      engineId: 'text-l0',
      engineVersion: '1',
    })

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    await utimes(orphanBlob, twoHoursAgo, twoHoursAgo)
    await utimes(orphanMd, twoHoursAgo, twoHoursAgo)
    await utimes(keepBlob, twoHoursAgo, twoHoursAgo)
    await utimes(keepMd, twoHoursAgo, twoHoursAgo)

    const now = Date.now()
    const pruned = pruneOrphanBlobsAndMarkdown(db, {
      minAgeMs: 60 * 60 * 1000,
      nowMs: now,
    })
    assert.equal(pruned.removedBlobs, 1)
    assert.equal(pruned.removedMarkdown, 1)
    await access(keepBlob)
    await access(keepMd)
    await assert.rejects(() => access(orphanBlob), /ENOENT/)
    await assert.rejects(() => access(orphanMd), /ENOENT/)

    // deleteDocument：删行并 unlink blob/md
    assert.equal(repo.deleteDocument(docId), true)
    assert.equal(repo.getDocument(docId), null)
    await assert.rejects(() => access(keepBlob), /ENOENT/)
    await assert.rejects(() => access(keepMd), /ENOENT/)

    db.close()
  })

  it('skips fresh orphan files within minAgeMs', async () => {
    const {
      openDocLibraryDb,
      pruneOrphanBlobsAndMarkdown,
      blobPathForSha,
      docLibraryRoot,
    } = await import('../packages/doc-library/dist/index.js')

    const db = openDocLibraryDb(join(dir, 'doc-library', 'doc-library-fresh.db'))
    const sha = createHash('sha256').update('fresh-orphan').digest('hex')
    const blob = blobPathForSha(sha)
    await mkdir(join(docLibraryRoot(), 'blobs'), { recursive: true })
    await writeFile(blob, 'fresh-orphan')
    const recent = new Date(Date.now() - 30_000)
    await utimes(blob, recent, recent)

    const result = pruneOrphanBlobsAndMarkdown(db, {
      minAgeMs: 60 * 60 * 1000,
      nowMs: Date.now(),
    })
    assert.equal(result.removedBlobs, 0)
    assert.ok(result.skippedFresh >= 1)
    await access(blob)
    db.close()
  })
})
