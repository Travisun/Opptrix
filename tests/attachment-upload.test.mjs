/**
 * 大附件上传超时与错误文案（P2）
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

const {
  ATTACHMENT_UPLOAD_BASE_TIMEOUT_MS,
  ATTACHMENT_UPLOAD_MAX_TIMEOUT_MS,
  attachmentUploadTimeoutMs,
  formatAttachmentUploadError,
  isAttachmentUploadAbortError,
} = await import('../client-ui/src/chat/attachmentUpload.ts')

describe('attachmentUploadTimeoutMs', () => {
  it('小文件保持 180s 基准，不抬高全局语义', () => {
    assert.equal(attachmentUploadTimeoutMs(0), ATTACHMENT_UPLOAD_BASE_TIMEOUT_MS)
    assert.equal(attachmentUploadTimeoutMs(1024), ATTACHMENT_UPLOAD_BASE_TIMEOUT_MS)
    assert.equal(attachmentUploadTimeoutMs(20 * 1024 * 1024), ATTACHMENT_UPLOAD_BASE_TIMEOUT_MS)
  })

  it('超过 20MB 逐步抬高，上限 10 分钟', () => {
    const t40 = attachmentUploadTimeoutMs(40 * 1024 * 1024)
    assert.equal(t40, ATTACHMENT_UPLOAD_BASE_TIMEOUT_MS + 30_000)
    const tHuge = attachmentUploadTimeoutMs(2 * 1024 * 1024 * 1024)
    assert.equal(tHuge, ATTACHMENT_UPLOAD_MAX_TIMEOUT_MS)
    assert.ok(tHuge <= 600_000)
  })
})

describe('formatAttachmentUploadError', () => {
  it('超时 / 过大 / 网络均为产品级可重试文案', () => {
    assert.match(formatAttachmentUploadError(new Error('timeout')), /添加超时/)
    assert.match(
      formatAttachmentUploadError(null, { status: 413, raw: 'Payload Too Large' }),
      /文件过大/,
    )
    assert.match(formatAttachmentUploadError(new Error('Failed to fetch')), /网络/)
  })

  it('Abort 可识别且不误报超时', () => {
    const err = new Error('已取消添加')
    err.name = 'AbortError'
    assert.equal(isAttachmentUploadAbortError(err), true)
    assert.equal(formatAttachmentUploadError(err), '已取消添加')
  })
})
