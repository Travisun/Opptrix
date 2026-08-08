import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  lookupModelsDevMediaEntry,
  resetModelsDevCacheForTests,
} from '../packages/agent/dist/llm/models-dev-context.js'
import {
  LARGE_FILE_WARN_BYTES,
  resolveAttachmentLimits,
} from '../packages/agent/dist/attachment-limits.js'
import { parseAssistantResponseContent } from '../packages/agent/dist/content-parts.js'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

describe('resolveAttachmentLimits', () => {
  it('exports 500MB large-file warn threshold', () => {
    assert.equal(LARGE_FILE_WARN_BYTES, 500 * 1024 * 1024)
  })

  it('does not hard-cap local-path kinds (image/pdf/audio/video)', () => {
    const limits = resolveAttachmentLimits('gpt-4o', ['text', 'image', 'pdf', 'audio', 'video'])
    assert.equal(limits.maxBytesByKind.image, undefined)
    assert.equal(limits.maxBytesByKind.pdf, undefined)
    assert.equal(limits.maxBytesByKind.audio, undefined)
    assert.equal(limits.maxBytesByKind.video, undefined)
    assert.ok(limits.maxCount >= 50)
  })

  it('keeps local-path uncapped for unknown models', () => {
    const limits = resolveAttachmentLimits('unknown-model-xyz', ['text', 'image'])
    assert.equal(limits.maxBytesByKind.image, undefined)
    assert.equal(limits.maxBytesByKind.pdf, undefined)
    assert.ok(limits.maxCount >= 50)
  })

  it('keeps local-path uncapped for Claude tier', () => {
    const limits = resolveAttachmentLimits('claude-sonnet-4-6', ['text', 'image', 'pdf'])
    assert.equal(limits.maxBytesByKind.image, undefined)
    assert.equal(limits.maxBytesByKind.pdf, undefined)
  })
})

describe('validateAttachmentAgainstCapabilities local path size', () => {
  it('allows library/transcript files beyond former 25/50MB caps', async () => {
    const { validateAttachmentAgainstCapabilities } = await import(
      '../packages/agent/dist/chat-attachments.js'
    )
    const caps = {
      attachment: false,
      input: ['text'],
      output: ['text'],
      limits: {
        maxBytesByKind: { audio: 25 * 1024 * 1024, video: 50 * 1024 * 1024, pdf: 20 * 1024 * 1024 },
        maxCount: 5,
        maxTotalBytes: 80 * 1024 * 1024,
      },
    }
    const overOldAudio = 26 * 1024 * 1024
    const overOldVideo = 51 * 1024 * 1024
    const overOldPdf = 30 * 1024 * 1024
    const overOldTotal = 100 * 1024 * 1024
    assert.equal(
      validateAttachmentAgainstCapabilities('audio', overOldAudio, caps, 0, 0).ok,
      true,
    )
    assert.equal(
      validateAttachmentAgainstCapabilities('video', overOldVideo, caps, 0, 0).ok,
      true,
    )
    assert.equal(
      validateAttachmentAgainstCapabilities('pdf', overOldPdf, caps, 0, 0).ok,
      true,
    )
    assert.equal(
      validateAttachmentAgainstCapabilities('image', overOldTotal, caps, 0, overOldTotal).ok,
      true,
    )
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

  it('keeps library-ingest and transcript pins for text-only model', async () => {
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
      { id: 'a3', kind: 'audio', name: 'clip.wav', mime: 'audio/wav', size: 150, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'a4', kind: 'canvas', name: 'board.canvas.tsx', mime: 'application/vnd.opptrix.canvas+tsx', size: 50, createdAt: '2026-01-01T00:00:00.000Z' },
    ]
    const { kept, removedIds } = partitionPinsForModel(pinned, media)
    assert.deepEqual(kept.map(k => k.id).sort(), ['a1', 'a2', 'a3'])
    assert.deepEqual(removedIds, ['a4'])
  })
})

resetModelsDevCacheForTests()
