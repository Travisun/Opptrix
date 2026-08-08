/**
 * 音视频后台转写：agent 层状态机 + content-parts（不跑真实 ffmpeg/ASR）
 */
import { describe, it, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-media-tx-'))
const prevDataDir = process.env.OPPTRIX_DATA_DIR
process.env.OPPTRIX_DATA_DIR = tmpRoot

/** @type {typeof import('../packages/agent/dist/media-types.js')} */
let mediaTypes
/** @type {typeof import('../packages/agent/dist/chat-attachments.js')} */
let chatAttachments
/** @type {typeof import('../packages/agent/dist/content-parts.js')} */
let contentParts

before(async () => {
  mediaTypes = await import('../packages/agent/dist/media-types.js')
  chatAttachments = await import('../packages/agent/dist/chat-attachments.js')
  contentParts = await import('../packages/agent/dist/content-parts.js')
})

after(() => {
  if (prevDataDir === undefined) delete process.env.OPPTRIX_DATA_DIR
  else process.env.OPPTRIX_DATA_DIR = prevDataDir
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

describe('isTranscriptExtractKind', () => {
  it('matches audio and video only', () => {
    assert.equal(mediaTypes.isTranscriptExtractKind('audio'), true)
    assert.equal(mediaTypes.isTranscriptExtractKind('video'), true)
    assert.equal(mediaTypes.isTranscriptExtractKind('pdf'), false)
    assert.equal(mediaTypes.isTranscriptExtractKind('image'), false)
    assert.equal(mediaTypes.isLibraryIngestKind('audio'), false)
  })
})

describe('validateAttachmentAgainstCapabilities transcript path', () => {
  it('allows audio/video without model native modalities', () => {
    const caps = {
      attachment: false,
      input: ['text'],
      output: ['text'],
      limits: { maxBytesByKind: {}, maxCount: 0, maxTotalBytes: 0 },
    }
    const audio = chatAttachments.validateAttachmentAgainstCapabilities('audio', 1024, caps, 0, 0)
    const video = chatAttachments.validateAttachmentAgainstCapabilities('video', 2048, caps, 0, 0)
    assert.equal(audio.ok, true)
    assert.equal(video.ok, true)
  })

  it('allows audio/video beyond former 25/50MB hard caps', () => {
    const caps = {
      attachment: false,
      input: ['text'],
      output: ['text'],
      limits: {
        maxBytesByKind: { audio: 25 * 1024 * 1024, video: 50 * 1024 * 1024 },
        maxCount: 5,
        maxTotalBytes: 80 * 1024 * 1024,
      },
    }
    const audio = chatAttachments.validateAttachmentAgainstCapabilities(
      'audio',
      40 * 1024 * 1024,
      caps,
      0,
      0,
    )
    const video = chatAttachments.validateAttachmentAgainstCapabilities(
      'video',
      120 * 1024 * 1024,
      caps,
      0,
      70 * 1024 * 1024,
    )
    assert.equal(audio.ok, true)
    assert.equal(video.ok, true)
  })
})

describe('saveAttachment audio/video extract gate', () => {
  /** @type {Array<{ sessionId: string, attachmentId: string, meta: object }>} */
  let hookCalls

  beforeEach(() => {
    hookCalls = []
    chatAttachments.registerMediaTranscriptHook((sessionId, attachmentId, meta) => {
      hookCalls.push({ sessionId, attachmentId, meta })
    })
  })

  afterEach(() => {
    // 清空 hook，避免影响其他用例
    chatAttachments.registerMediaTranscriptHook(() => {})
  })

  it('sets extract.pending and schedules hook for audio', () => {
    const meta = chatAttachments.saveAttachment({
      sessionId: 'sess-audio-1',
      name: 'note.wav',
      mime: 'audio/wav',
      data: Buffer.from('RIFF....'),
    })
    assert.equal(meta.kind, 'audio')
    assert.equal(meta.extract?.status, 'pending')
    assert.equal(meta.extract?.phase, 'converting')
    assert.ok(meta.extract?.message)
    assert.equal(hookCalls.length, 1)
    assert.equal(hookCalls[0].attachmentId, meta.id)
  })

  it('sets extract.pending for video', () => {
    const meta = chatAttachments.saveAttachment({
      sessionId: 'sess-video-1',
      name: 'clip.mp4',
      mime: 'video/mp4',
      data: Buffer.from('ftyp'),
    })
    assert.equal(meta.kind, 'video')
    assert.equal(meta.extract?.status, 'pending')
    assert.equal(hookCalls.length, 1)
  })
})

describe('waitForAttachmentExtractReady', () => {
  it('resolves pending → ready for transcript kind', async () => {
    chatAttachments.registerMediaTranscriptHook(() => {
      /* 不自动完成，由测试手动推进 */
    })
    const meta = chatAttachments.saveAttachment({
      sessionId: 'sess-wait-ready',
      name: 'talk.m4a',
      mime: 'audio/mp4',
      data: Buffer.from('aaaa'),
    })
    assert.equal(meta.extract?.status, 'pending')

    setTimeout(() => {
      chatAttachments.writeLegacyExtractArtifacts('sess-wait-ready', meta.id, {
        pageCount: 1,
        charCount: 12,
        markdown: '你好世界转写文稿',
        chunks: [{ id: 'c0', page: 1, offset: 0, text: '你好世界转写文稿' }],
      })
      chatAttachments.applyAttachmentExtractMeta('sess-wait-ready', meta.id, {
        status: 'ready',
        phase: 'ready',
        charCount: 12,
        readyAt: new Date().toISOString(),
      })
    }, 80)

    const waited = await chatAttachments.waitForAttachmentExtractReady(
      'sess-wait-ready',
      meta.id,
      5_000,
    )
    assert.equal(waited.ok, true)
    if (waited.ok) {
      assert.equal(waited.meta.extract?.status, 'ready')
    }
  })

  it('returns failed for transcript kind', async () => {
    chatAttachments.registerMediaTranscriptHook((sessionId, attachmentId) => {
      chatAttachments.applyAttachmentExtractMeta(sessionId, attachmentId, {
        status: 'failed',
        phase: 'failed',
        error: '该文件没有可用的声音，无法转写',
      })
    })
    const meta = chatAttachments.saveAttachment({
      sessionId: 'sess-wait-fail',
      name: 'silent.mp4',
      mime: 'video/mp4',
      data: Buffer.from('xxxx'),
    })
    const waited = await chatAttachments.waitForAttachmentExtractReady(
      'sess-wait-fail',
      meta.id,
      3_000,
    )
    assert.equal(waited.ok, false)
    if (!waited.ok) {
      assert.equal(waited.reason, 'failed')
      assert.match(waited.message, /没有可用的声音|无法转写/)
    }
  })

  it('waitForPdfExtractReady remains a compatible alias', async () => {
    chatAttachments.registerMediaTranscriptHook(() => {})
    const meta = chatAttachments.saveAttachment({
      sessionId: 'sess-alias',
      name: 'a.wav',
      mime: 'audio/wav',
      data: Buffer.from('wav'),
    })
    chatAttachments.applyAttachmentExtractMeta('sess-alias', meta.id, {
      status: 'ready',
      phase: 'ready',
      charCount: 1,
    })
    chatAttachments.writeLegacyExtractArtifacts('sess-alias', meta.id, {
      pageCount: 1,
      charCount: 1,
      markdown: 'ok',
      chunks: [{ id: 'c0', page: 1, offset: 0, text: 'ok' }],
    })
    const waited = await chatAttachments.waitForPdfExtractReady('sess-alias', meta.id, 2_000)
    assert.equal(waited.ok, true)
  })
})

describe('content-parts for audio/video transcript', () => {
  it('emits transcript text when ready', () => {
    const sessionId = 'sess-cp-ready'
    chatAttachments.registerMediaTranscriptHook(() => {})
    const meta = chatAttachments.saveAttachment({
      sessionId,
      name: 'meeting.mp3',
      mime: 'audio/mpeg',
      data: Buffer.from('mp3data'),
    })
    chatAttachments.writeLegacyExtractArtifacts(sessionId, meta.id, {
      pageCount: 1,
      charCount: 20,
      markdown: '今天讨论了季度业绩',
      chunks: [{ id: 'c0', page: 1, offset: 0, text: '今天讨论了季度业绩' }],
    })
    chatAttachments.applyAttachmentExtractMeta(sessionId, meta.id, {
      status: 'ready',
      phase: 'ready',
      charCount: 20,
    })
    const readyMeta = chatAttachments.readAttachmentMeta(sessionId, meta.id)
    assert.ok(readyMeta)
    const parts = contentParts.attachmentToContentParts(sessionId, readyMeta, 'http://127.0.0.1:8787')
    assert.equal(parts.length, 1)
    assert.equal(parts[0].type, 'text')
    if (parts[0].type === 'text') {
      assert.match(parts[0].text, /音视频文稿/)
      assert.match(parts[0].text, /季度业绩/)
      assert.doesNotMatch(parts[0].text, /input_audio/)
    }
  })

  it('emits pending / failed placeholders without raw audio', () => {
    const pendingParts = contentParts.attachmentToContentParts('s', {
      id: 'p1',
      kind: 'audio',
      mime: 'audio/wav',
      name: 'a.wav',
      size: 10,
      createdAt: '2026-01-01T00:00:00.000Z',
      extract: { status: 'pending', phase: 'extracting', message: '正在转写音视频…' },
    }, 'http://127.0.0.1:8787')
    assert.equal(pendingParts[0].type, 'text')
    if (pendingParts[0].type === 'text') {
      assert.match(pendingParts[0].text, /转写中/)
    }

    const failedParts = contentParts.attachmentToContentParts('s', {
      id: 'f1',
      kind: 'video',
      mime: 'video/mp4',
      name: 'v.mp4',
      size: 10,
      createdAt: '2026-01-01T00:00:00.000Z',
      extract: { status: 'failed', phase: 'failed', error: '该文件没有可用的声音，无法转写' },
    }, 'http://127.0.0.1:8787')
    assert.equal(failedParts[0].type, 'text')
    if (failedParts[0].type === 'text') {
      assert.match(failedParts[0].text, /转写失败/)
      assert.match(failedParts[0].text, /没有可用的声音/)
    }
  })
})
