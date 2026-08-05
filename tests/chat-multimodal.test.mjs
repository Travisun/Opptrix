import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  lookupModelsDevMediaEntry,
  resetModelsDevCacheForTests,
} from '../packages/agent/dist/llm/models-dev-context.js'
import { resolveAttachmentLimits } from '../packages/agent/dist/attachment-limits.js'
import { parseAssistantResponseContent } from '../packages/agent/dist/content-parts.js'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

describe('resolveAttachmentLimits', () => {
  it('applies OpenAI tier for gpt-4o', () => {
    const limits = resolveAttachmentLimits('gpt-4o', ['text', 'image', 'pdf'])
    assert.equal(limits.maxBytesByKind.image, 20 * 1024 * 1024)
    assert.equal(limits.maxBytesByKind.pdf, 32 * 1024 * 1024)
    assert.ok(limits.maxCount >= 5)
  })

  it('applies conservative defaults for unknown models', () => {
    const limits = resolveAttachmentLimits('unknown-model-xyz', ['text', 'image'])
    assert.equal(limits.maxBytesByKind.image, 10 * 1024 * 1024)
    // PDF 始终保留本地整理限额
    assert.equal(limits.maxBytesByKind.pdf, 20 * 1024 * 1024)
  })

  it('applies Claude tier stricter image cap', () => {
    const limits = resolveAttachmentLimits('claude-sonnet-4-6', ['text', 'image', 'pdf'])
    assert.equal(limits.maxBytesByKind.image, 5 * 1024 * 1024)
  })
})

describe('lookupModelsDevMediaEntry', () => {
  it('reads modalities from catalog fixture', () => {
    const catalog = {
      openai: {
        models: {
          'gpt-4.1': {
            attachment: true,
            modalities: { input: ['text', 'image', 'pdf'], output: ['text'] },
          },
        },
      },
    }
    const hit = lookupModelsDevMediaEntry(catalog, 'gpt-4.1', 'openai')
    assert.ok(hit)
    assert.equal(hit.attachment, true)
    assert.deepEqual(hit.input, ['text', 'image', 'pdf'])
  })
})

describe('parseAssistantResponseContent', () => {
  it('extracts text and ignores unknown parts', () => {
    const parsed = parseAssistantResponseContent('sess-1', [
      { type: 'text', text: '你好' },
      { type: 'unknown', data: 'x' },
    ])
    assert.equal(parsed.text, '你好')
    assert.equal(parsed.attachments.length, 0)
  })
})

describe('chat attachment path traversal', () => {
  it('rejects invalid attachment ids', async () => {
    process.env.OPPTRIX_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-att-'))
    const { readAttachmentMeta } = await import('../packages/agent/dist/chat-attachments.js')
    assert.equal(readAttachmentMeta('sess', '../etc/passwd'), null)
    fs.rmSync(process.env.OPPTRIX_DATA_DIR, { recursive: true, force: true })
    delete process.env.OPPTRIX_DATA_DIR
  })
})

describe('resolveUploadMime', () => {
  it('prefers X-Attachment-Mime over octet-stream Content-Type', async () => {
    const { resolveUploadMime } = await import('../packages/agent/dist/chat-attachments.js')
    assert.equal(
      resolveUploadMime('application/octet-stream', 'image/png'),
      'image/png',
    )
  })

  it('falls back to Content-Type when not octet-stream', async () => {
    const { resolveUploadMime } = await import('../packages/agent/dist/chat-attachments.js')
    assert.equal(resolveUploadMime('image/jpeg', undefined), 'image/jpeg')
  })

  it('defaults to octet-stream when no explicit mime', async () => {
    const { resolveUploadMime } = await import('../packages/agent/dist/chat-attachments.js')
    assert.equal(resolveUploadMime('application/octet-stream', undefined), 'application/octet-stream')
  })
})

describe('parseNonNegativeIntHeader', () => {
  it('parses valid non-negative integers', async () => {
    const { parseNonNegativeIntHeader } = await import('../packages/agent/dist/chat-attachments.js')
    assert.equal(parseNonNegativeIntHeader('3'), 3)
    assert.equal(parseNonNegativeIntHeader(['5']), 5)
  })

  it('returns 0 for invalid or negative values', async () => {
    const { parseNonNegativeIntHeader } = await import('../packages/agent/dist/chat-attachments.js')
    assert.equal(parseNonNegativeIntHeader(undefined), 0)
    assert.equal(parseNonNegativeIntHeader('-1'), 0)
    assert.equal(parseNonNegativeIntHeader('abc'), 0)
  })
})

describe('mime extension fallback', () => {
  it('infers kind from filename when mime empty', async () => {
    const { mimeToMediaKind, inferMimeFromFilename } = await import('../packages/agent/dist/media-types.js')
    assert.equal(inferMimeFromFilename('photo.png'), 'image/png')
    assert.equal(mimeToMediaKind('', 'photo.png'), 'image')
    assert.equal(mimeToMediaKind('application/octet-stream', 'doc.pdf'), 'pdf')
  })

  it('resolveUploadMime uses filename fallback', async () => {
    const { resolveUploadMime } = await import('../packages/agent/dist/chat-attachments.js')
    assert.equal(
      resolveUploadMime('application/octet-stream', 'application/octet-stream', 'clip.mp4'),
      'video/mp4',
    )
  })
})

describe('modelAllowsAttachments', () => {
  it('always true (library ingest path available even when media unloaded)', async () => {
    const { modelAllowsAttachments } = await import('../client-ui/src/chat/mediaCapabilities.ts')
    assert.equal(modelAllowsAttachments({ attachment: false, input: ['text', 'image'], output: ['text'], limits: { maxBytesByKind: {}, maxCount: 5, maxTotalBytes: 1e6 } }), true)
    assert.equal(modelAllowsAttachments({ attachment: true, input: ['text'], output: ['text'], limits: { maxBytesByKind: {}, maxCount: 0, maxTotalBytes: 0 } }), true)
    assert.equal(modelAllowsAttachments(null), true)
  })
})

describe('partitionPinsForModel', () => {
  it('keeps all pins when media is null', async () => {
    const { partitionPinsForModel } = await import('../client-ui/src/chat/mediaCapabilities.ts')
    const pinned = [{ id: 'a1', kind: 'image', name: 'x.png', mime: 'image/png', size: 100, createdAt: '2026-01-01T00:00:00.000Z' }]
    const { kept, removedIds } = partitionPinsForModel(pinned, null)
    assert.deepEqual(kept, pinned)
    assert.deepEqual(removedIds, [])
  })

  it('keeps library-ingest pins and removes non-ingest kinds for text-only model', async () => {
    const { partitionPinsForModel } = await import('../client-ui/src/chat/mediaCapabilities.ts')
    const media = {
      attachment: false,
      input: ['text'],
      output: ['text'],
      limits: { maxBytesByKind: {}, maxCount: 0, maxTotalBytes: 0 },
    }
    const pinned = [
      { id: 'a1', kind: 'image', name: 'x.png', mime: 'image/png', size: 100, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'a2', kind: 'video', name: 'clip.mp4', mime: 'video/mp4', size: 200, createdAt: '2026-01-01T00:00:00.000Z' },
    ]
    const { kept, removedIds } = partitionPinsForModel(pinned, media)
    assert.equal(kept.length, 1)
    assert.equal(kept[0].id, 'a1')
    assert.deepEqual(removedIds, ['a2'])
  })
})

resetModelsDevCacheForTests()
