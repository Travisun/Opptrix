/**
 * doc-library ↔ agent 桥接：ParseRouter（text/office/pdf + OCR）+ legacy 双写。
 * ingest 调度在 saveAttachment；解析完成后同步 meta.extract。
 */
import {
  getDocLibraryService,
  ParseRouter,
  createTextL0Runner,
  createOfficeL0Runner,
  createOcrL2Runner,
  documentKindFromMime,
  enhancePagesWithEmbeddedImageOcr,
  pagesToParseResult,
  type LegacyExtractWriter,
  type ParseEngineId,
  type ParseRunner,
  type DocumentKind,
} from '@opptrix/doc-library'
import { extractPdfToMarkdown } from './pdf-extract.js'
import {
  applyAttachmentExtractMeta,
  readAttachmentMeta,
  registerDocumentIngestHook,
  writeLegacyExtractArtifacts,
} from './chat-attachments.js'
import type { ChatAttachmentMeta, MediaKind } from './media-types.js'

const ENGINE_VERSION = '1.0.0'

const pdfExtractL0Runner: ParseRunner = {
  engineId: 'pdf-extract-l0',
  engineVersion: ENGINE_VERSION,
  async run(blob) {
    const result = await extractPdfToMarkdown(blob)
    const pages = result.pages.map(p => ({
      page: p.page,
      text: [p.text, ...p.tablesMd].filter(Boolean).join('\n\n').trim(),
    }))
    // L0 内联：可复制文本 + 页内嵌图 OCR；失败/超时不丢正文
    const enhanced = await enhancePagesWithEmbeddedImageOcr(blob, pages, { format: 'pdf' })
    const rebuilt = pagesToParseResult(enhanced)
    if (rebuilt.charCount > 0) {
      return rebuilt
    }
    const emptyPages = result.pages.filter(p => !p.text.trim() && p.tablesMd.length === 0).length
    const emptyPageRatio = result.pageCount > 0 ? emptyPages / result.pageCount : 1
    return {
      pageCount: result.pageCount,
      charCount: result.charCount,
      markdown: result.markdown,
      emptyPageRatio,
      chunks: result.chunks.map(c => ({
        page: c.page,
        offset: c.offset,
        text: c.text,
      })),
    }
  },
}

function buildParseRouter(): ParseRunner {
  return new ParseRouter({
    text: createTextL0Runner(),
    office: createOfficeL0Runner(),
    pdf: pdfExtractL0Runner,
    ocr: createOcrL2Runner(),
  })
}

const legacyExtractWriter: LegacyExtractWriter = (sessionId, attachmentId, result) => {
  writeLegacyExtractArtifacts(sessionId, attachmentId, result)
  const existing = readAttachmentMeta(sessionId, attachmentId)
  applyAttachmentExtractMeta(sessionId, attachmentId, {
    status: 'ready',
    documentId: existing?.extract?.documentId,
    pageCount: result.pageCount,
    charCount: result.charCount,
    readyAt: new Date().toISOString(),
  })
}

let wired = false

export function ensureDocLibraryBridge(): ReturnType<typeof getDocLibraryService> {
  const svc = getDocLibraryService()
  if (!wired) {
    svc.setParseRunner(buildParseRouter())
    svc.setLegacyExtractWriter(legacyExtractWriter)
    svc.setParseLifecycleHooks({
      onFailed(input, error, partial) {
        const existing = readAttachmentMeta(input.sessionId, input.attachmentId)
        applyAttachmentExtractMeta(input.sessionId, input.attachmentId, {
          status: 'failed',
          documentId: existing?.extract?.documentId,
          error,
          pageCount: partial?.pageCount,
          charCount: partial?.charCount,
        })
      },
    })
    registerDocumentIngestHook(ingestDocumentAttachment)
    wired = true
  }
  return svc
}

export function mediaKindToDocumentKind(
  mediaKind: MediaKind,
  mime: string,
  name: string,
): DocumentKind {
  if (mediaKind === 'pdf') return 'pdf'
  if (mediaKind === 'image') return 'image'
  if (mediaKind === 'document') return documentKindFromMime(mime, name)
  return documentKindFromMime(mime, name)
}

export function ingestDocumentAttachment(
  sessionId: string,
  attachmentId: string,
  meta: {
    name: string
    mime: string
    kind: MediaKind
    deepParse?: boolean
    forceEngine?: ParseEngineId
  },
  data: Buffer,
): void {
  const svc = ensureDocLibraryBridge()
  const docKind = mediaKindToDocumentKind(meta.kind, meta.mime, meta.name)
  const ingested = svc.ingestFromAttachment({
    sessionId,
    attachmentId,
    name: meta.name,
    mime: meta.mime,
    kind: docKind,
    data,
    source: 'attachment',
    deepParse: meta.deepParse,
    forceEngine: meta.forceEngine,
  })

  applyAttachmentExtractMeta(sessionId, attachmentId, {
    status: ingested.parseStatus,
    documentId: ingested.documentId,
    pageCount: ingested.pageCount,
    charCount: ingested.charCount,
    error: ingested.error,
    readyAt: ingested.readyAt,
  })

  if (ingested.parseStatus === 'ready') {
    syncReadyExtractFromLibrary(sessionId, attachmentId, ingested.documentId)
  }
}

/** @deprecated 使用 ingestDocumentAttachment */
export function ingestPdfAttachment(
  sessionId: string,
  attachmentId: string,
  meta: { name: string; mime: string; deepParse?: boolean; forceEngine?: ParseEngineId },
  data: Buffer,
): void {
  ingestDocumentAttachment(
    sessionId,
    attachmentId,
    { ...meta, kind: 'pdf' },
    data,
  )
}

/** 解析失败时同步 meta（legacyWriter 仅成功路径） */
export function syncFailedExtractMeta(
  sessionId: string,
  attachmentId: string,
  error: string,
  partial?: { pageCount?: number; charCount?: number },
): void {
  applyAttachmentExtractMeta(sessionId, attachmentId, {
    status: 'failed',
    error,
    pageCount: partial?.pageCount,
    charCount: partial?.charCount,
  })
}

/** SHA 命中且库内已 ready：补写 legacy + meta */
export function syncReadyExtractFromLibrary(
  sessionId: string,
  attachmentId: string,
  documentId: string,
): void {
  const svc = ensureDocLibraryBridge()
  const status = svc.getParseStatus(documentId)
  if (!status || status.status !== 'ready') return

  const repo = svc.getRepository()
  const chunks = repo.getChunks(documentId)
  const md = repo.readMarkdown(documentId)
  if (!md || !chunks.length) return

  writeLegacyExtractArtifacts(sessionId, attachmentId, {
    pageCount: status.pageCount ?? 0,
    charCount: status.charCount ?? md.length,
    markdown: md,
    chunks: chunks.map(c => ({
      id: `c${c.seq}`,
      page: c.page,
      offset: c.offset,
      text: c.text,
    })),
  })
  applyAttachmentExtractMeta(sessionId, attachmentId, {
    status: 'ready',
    documentId,
    pageCount: status.pageCount,
    charCount: status.charCount,
    readyAt: status.readyAt,
  })
}

export function shouldIngestAttachment(meta: Pick<ChatAttachmentMeta, 'kind'>): boolean {
  return meta.kind === 'pdf' || meta.kind === 'document' || meta.kind === 'image'
}

// 模块加载时注册 hook，使 saveAttachment 走文档库
ensureDocLibraryBridge()
