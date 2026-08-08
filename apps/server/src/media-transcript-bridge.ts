/**
 * 会话附件音视频 → 后台转写桥接。
 * 在 saveAttachment 经 registerMediaTranscriptHook 调度；agent 不依赖 local-inference。
 */
import {
  applyAttachmentExtractMeta,
  isTranscriptExtractKind,
  registerMediaTranscriptHook,
  resolveAttachmentFilePath,
  writeLegacyExtractArtifacts,
  type ChatAttachmentMeta,
} from '@opptrix/agent'
import { ffmpegRuntime } from '@opptrix/local-inference'
import {
  mediaTranscriptUserFacingError,
  transcribeMediaFile,
} from './speech-transcribe.js'

let wired = false

function failExtract(
  sessionId: string,
  attachmentId: string,
  error: string,
): void {
  applyAttachmentExtractMeta(sessionId, attachmentId, {
    status: 'failed',
    phase: 'failed',
    error,
    message: undefined,
  })
}

async function runMediaTranscript(
  sessionId: string,
  attachmentId: string,
  meta: ChatAttachmentMeta,
): Promise<void> {
  if (!isTranscriptExtractKind(meta.kind)) return

  applyAttachmentExtractMeta(sessionId, attachmentId, {
    status: 'pending',
    phase: 'converting',
    message: '正在准备音轨…',
  })

  const inputPath = resolveAttachmentFilePath(sessionId, attachmentId)
  if (!inputPath) {
    failExtract(sessionId, attachmentId, '文件不可用，请重新添加')
    return
  }

  try {
    const probe = await ffmpegRuntime.probe(inputPath)
    if (!probe.hasAudio) {
      failExtract(sessionId, attachmentId, '该文件没有可用的声音，无法转写')
      return
    }

    applyAttachmentExtractMeta(sessionId, attachmentId, {
      status: 'pending',
      phase: 'extracting',
      message: '正在转写音视频…',
    })

    const result = await transcribeMediaFile({
      inputPath,
      mime: meta.mime,
    })

    const text = result.text.trim()
    if (!text) {
      failExtract(sessionId, attachmentId, '未能识别出有效内容，请换更清晰的录音后重试')
      return
    }

    writeLegacyExtractArtifacts(sessionId, attachmentId, {
      pageCount: 1,
      charCount: text.length,
      markdown: text,
      chunks: [{ id: 'c0', page: 1, offset: 0, text }],
    })

    applyAttachmentExtractMeta(sessionId, attachmentId, {
      status: 'ready',
      phase: 'ready',
      charCount: text.length,
      pageCount: 1,
      readyAt: new Date().toISOString(),
      message: undefined,
      error: undefined,
    })
  } catch (err) {
    console.warn(
      '[media-transcript] failed:',
      err instanceof Error ? err.message : err,
    )
    failExtract(sessionId, attachmentId, mediaTranscriptUserFacingError(err))
  }
}

export function ensureMediaTranscriptBridge(): void {
  if (wired) return
  registerMediaTranscriptHook((sessionId, attachmentId, meta) => {
    void runMediaTranscript(sessionId, attachmentId, meta).catch((err) => {
      console.warn(
        '[media-transcript] unhandled:',
        err instanceof Error ? err.message : err,
      )
      failExtract(sessionId, attachmentId, '暂时无法完成转写，请稍后重试')
    })
  })
  wired = true
}
