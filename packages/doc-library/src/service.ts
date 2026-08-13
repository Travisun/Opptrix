import type Database from 'better-sqlite3'
import type {
  ChunkReadResult,
  DocumentKind,
  DocSearchOpts,
  FtsSearchHit,
  IngestFromAttachmentInput,
  IngestFromAttachmentResult,
  IngestFromTextInput,
  IngestFromTextResult,
  PageRangeReadResult,
  ParseProgress,
  ParseRunner,
  ParseStatus,
  SessionDocumentView,
} from './types.js'
import { DocLibraryRepository } from './repository.js'
import { searchFtsChunks } from './fts.js'
import { newDocumentId, sha256Buffer } from './paths.js'
import { EmbeddingService, getEmbeddingService } from './embedding.js'
import { getVectorStore, type VectorStore } from './vector-store.js'
import { searchHybridChunks } from './hybrid-search.js'
import { extractTextL0, TEXT_L0_ENGINE_VERSION } from './engines/text-l0.js'
import { isPlainTextDocument } from './document-kind.js'
import { shouldEmbedToVector } from './embed-policy.js'

export { shouldEmbedToVector } from './embed-policy.js'

export type LegacyExtractWriter = (
  sessionId: string,
  attachmentId: string,
  result: {
    pageCount: number
    charCount: number
    markdown: string
    chunks: Array<{ id: string; page: number; offset: number; text: string }>
  },
) => void

export interface ParseLifecycleHooks {
  onFailed?: (
    input: IngestFromAttachmentInput,
    error: string,
    partial?: { pageCount?: number; charCount?: number },
  ) => void
  /** 转换 / 抽正文 / 内嵌 OCR 中间进度（status 仍为 pending） */
  onProgress?: (
    input: IngestFromAttachmentInput,
    progress: ParseProgress,
  ) => void
}

const MIN_USEFUL_CHARS = 24
const EMBED_BATCH_SIZE = 8

export class DocLibraryService {
  private readonly repo: DocLibraryRepository
  private parseRunner: ParseRunner | null = null
  private legacyWriter: LegacyExtractWriter | null = null
  private lifecycleHooks: ParseLifecycleHooks | null = null
  private embedding: EmbeddingService = getEmbeddingService()
  private vectorStore: VectorStore = getVectorStore()
  /** sha256 → 进行中的 parse Promise，并发单飞 */
  private readonly parseInflight = new Map<string, Promise<void>>()
  /** documentId → 进行中的 embed Promise */
  private readonly embedInflight = new Map<string, Promise<void>>()

  constructor(private readonly db: Database.Database) {
    this.repo = new DocLibraryRepository(db)
  }

  setParseRunner(runner: ParseRunner): void {
    this.parseRunner = runner
  }

  setLegacyExtractWriter(writer: LegacyExtractWriter): void {
    this.legacyWriter = writer
  }

  setParseLifecycleHooks(hooks: ParseLifecycleHooks): void {
    this.lifecycleHooks = hooks
  }

  setEmbeddingService(svc: EmbeddingService): void {
    this.embedding = svc
  }

  setVectorStore(store: VectorStore): void {
    this.vectorStore = store
  }

  getEmbeddingService(): EmbeddingService {
    return this.embedding
  }

  ingestFromAttachment(input: IngestFromAttachmentInput): IngestFromAttachmentResult {
    const contentSha256 = sha256Buffer(input.data)
    const existing = this.repo.findDocumentBySha(contentSha256)
    let documentId: string
    let reused = false
    const forceReparse = Boolean(input.deepParse || input.forceEngine)
    const textLike = input.kind === 'text' || isPlainTextDocument(input.mime, input.name)

    if (existing) {
      documentId = existing.id
      reused = true
    } else {
      documentId = newDocumentId()
      const blobPath = this.repo.writeBlob(contentSha256, input.data)
      this.repo.insertDocument({
        id: documentId,
        content_sha256: contentSha256,
        name: input.name,
        mime: input.mime,
        kind: textLike ? 'text' : input.kind,
        byte_size: input.data.length,
        blob_path: blobPath,
      })
      if (this.parseRunner && !textLike) {
        this.repo.upsertParsePending(documentId, this.parseRunner.engineId, this.parseRunner.engineVersion)
      }
    }

    this.repo.linkSession(input.sessionId, documentId, input.attachmentId)

    // 纯文本：同步 text-l0 → ready/legacy → 异步 embed（跳过 PDF 异步队列）
    if (textLike) {
      return this.finishTextAttachmentSync(documentId, contentSha256, input, reused, forceReparse)
    }

    const artifact = this.repo.getParseArtifact(documentId)
    const parseStatus: ParseStatus = artifact?.status ?? 'pending'

    if (this.parseRunner) {
      if (!reused && parseStatus !== 'ready') {
        void this.scheduleParse(contentSha256, documentId, input)
      } else if (reused && parseStatus === 'pending') {
        void this.scheduleParse(contentSha256, documentId, input)
      } else if (reused && forceReparse) {
        void this.scheduleParse(contentSha256, documentId, input, { force: true })
      }
    }

    return {
      documentId,
      contentSha256,
      reused,
      parseStatus: forceReparse && reused ? 'pending' : parseStatus,
      pageCount: artifact?.page_count ?? undefined,
      charCount: artifact?.char_count ?? undefined,
      error: artifact?.error ?? undefined,
      readyAt: artifact?.ready_at ?? undefined,
    }
  }

  /**
   * 附件纯文本快路径：同步切块入库，立刻可预览；向量仍异步。
   */
  private finishTextAttachmentSync(
    documentId: string,
    contentSha256: string,
    input: IngestFromAttachmentInput,
    reused: boolean,
    forceReparse: boolean,
  ): IngestFromAttachmentResult {
    const artifact = this.repo.getParseArtifact(documentId)
    if (reused && artifact?.status === 'ready' && !forceReparse) {
      if (input.source === 'attachment' && this.legacyWriter) {
        const chunks = this.repo.getChunks(documentId)
        const md = this.repo.readMarkdown(documentId)
        if (md && chunks.length) {
          this.legacyWriter(input.sessionId, input.attachmentId, {
            pageCount: artifact.page_count ?? 1,
            charCount: artifact.char_count ?? md.length,
            markdown: md,
            chunks: chunks.map(r => ({
              id: `c${r.seq}`,
              page: r.page,
              offset: r.offset,
              text: r.text,
            })),
          })
        }
      }
      return {
        documentId,
        contentSha256,
        reused,
        parseStatus: 'ready',
        pageCount: artifact.page_count ?? undefined,
        charCount: artifact.char_count ?? undefined,
        readyAt: artifact.ready_at ?? undefined,
      }
    }

    const parsed = extractTextL0(input.data)
    if (parsed.charCount < MIN_USEFUL_CHARS || !parsed.chunks.length) {
      const err = parsed.error
        ?? (parsed.charCount > 0
          ? '内容过短，暂时无法加入检索；你仍可预览原文'
          : '文件似乎没有可读内容，请确认后重试')
      this.repo.upsertParsePending(documentId, 'text-l0', TEXT_L0_ENGINE_VERSION)
      this.repo.markParseFailed(documentId, err, {
        pageCount: parsed.pageCount,
        charCount: parsed.charCount,
      })
      this.lifecycleHooks?.onFailed?.(input, err, {
        pageCount: parsed.pageCount,
        charCount: parsed.charCount,
      })
      return {
        documentId,
        contentSha256,
        reused,
        parseStatus: 'failed',
        pageCount: parsed.pageCount || undefined,
        charCount: parsed.charCount || undefined,
        error: err,
      }
    }

    this.repo.upsertParsePending(documentId, 'text-l0', TEXT_L0_ENGINE_VERSION)
    const chunkRows = this.repo.markParseReady(documentId, {
      pageCount: parsed.pageCount,
      charCount: parsed.charCount,
      markdown: parsed.markdown,
      chunks: parsed.chunks,
      engineId: 'text-l0',
      engineVersion: TEXT_L0_ENGINE_VERSION,
    })

    if (input.source === 'attachment' && this.legacyWriter) {
      this.legacyWriter(input.sessionId, input.attachmentId, {
        pageCount: parsed.pageCount,
        charCount: parsed.charCount,
        markdown: parsed.markdown,
        chunks: chunkRows.map(r => ({
          id: `c${r.seq}`,
          page: r.page,
          offset: r.offset,
          text: r.text,
        })),
      })
    }

    void this.scheduleEmbed(documentId)

    const ready = this.repo.getParseArtifact(documentId)
    return {
      documentId,
      contentSha256,
      reused,
      parseStatus: ready?.status ?? 'ready',
      pageCount: ready?.page_count ?? parsed.pageCount,
      charCount: ready?.char_count ?? parsed.charCount,
      readyAt: ready?.ready_at ?? undefined,
    }
  }

  /**
   * 纯文本入库（资讯等）：同步 text-l0 切块；研报可异步 embed，资讯仅 FTS。
   * 以 external_id + sourceType 去重；正文变更则覆盖并重建 chunk。
   */
  ingestFromText(input: IngestFromTextInput): IngestFromTextResult | null {
    const text = String(input.text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
    if (text.length < MIN_USEFUL_CHARS) return null

    const externalId = String(input.externalId ?? '').trim()
    if (!externalId) return null

    const name = String(input.name ?? '').trim() || externalId
    const mime = input.mime?.trim() || 'text/plain'
    const data = Buffer.from(text, 'utf8')
    const contentSha256 = sha256Buffer(data)
    const parsed = extractTextL0(data)
    if (parsed.charCount < MIN_USEFUL_CHARS || !parsed.chunks.length) return null

    const byExternal = this.repo.findDocumentByExternalId(input.sourceType, externalId)
    const bySha = this.repo.findDocumentBySha(contentSha256)

    let documentId: string
    let reused = false

    if (byExternal) {
      documentId = byExternal.id
      reused = byExternal.content_sha256 === contentSha256
      if (!reused) {
        const blobPath = this.repo.writeBlob(contentSha256, data)
        this.repo.updateDocumentContent(documentId, {
          content_sha256: contentSha256,
          name,
          mime,
          kind: 'text',
          byte_size: data.length,
          blob_path: blobPath,
          source_type: input.sourceType,
          external_id: externalId,
        })
      } else if (byExternal.name !== name) {
        this.repo.updateDocumentContent(documentId, {
          content_sha256: contentSha256,
          name,
          mime,
          kind: 'text',
          byte_size: data.length,
          blob_path: byExternal.blob_path,
          source_type: input.sourceType,
          external_id: externalId,
        })
      }
    } else if (bySha) {
      documentId = bySha.id
      reused = true
      this.repo.updateDocumentContent(documentId, {
        content_sha256: contentSha256,
        name,
        mime,
        kind: 'text',
        byte_size: data.length,
        blob_path: bySha.blob_path,
        source_type: input.sourceType,
        external_id: externalId,
      })
    } else {
      documentId = newDocumentId()
      const blobPath = this.repo.writeBlob(contentSha256, data)
      this.repo.insertDocument({
        id: documentId,
        content_sha256: contentSha256,
        name,
        mime,
        kind: 'text',
        byte_size: data.length,
        blob_path: blobPath,
        source_type: input.sourceType,
        external_id: externalId,
      })
    }

    const artifact = this.repo.getParseArtifact(documentId)
    if (!(reused && artifact?.status === 'ready')) {
      this.repo.markParseReady(documentId, {
        pageCount: parsed.pageCount,
        charCount: parsed.charCount,
        markdown: parsed.markdown,
        chunks: parsed.chunks,
        engineId: 'text-l0',
        engineVersion: TEXT_L0_ENGINE_VERSION,
      })
    }

    if (shouldEmbedToVector(input.sourceType)) {
      void this.scheduleEmbed(documentId)
    }

    const ready = this.repo.getParseArtifact(documentId)
    return {
      documentId,
      contentSha256,
      reused,
      parseStatus: ready?.status ?? 'ready',
      pageCount: ready?.page_count ?? parsed.pageCount,
      charCount: ready?.char_count ?? parsed.charCount,
      readyAt: ready?.ready_at ?? undefined,
    }
  }

  private scheduleParse(
    contentSha256: string,
    documentId: string,
    input: IngestFromAttachmentInput,
    opts: { force?: boolean } = {},
  ): Promise<void> {
    const inflightKey = opts.force
      ? `${contentSha256}:force:${input.forceEngine ?? ''}:${input.deepParse ? '1' : '0'}`
      : contentSha256
    const existing = this.parseInflight.get(inflightKey)
    if (existing) return existing

    const job = this.runParse(documentId, input, opts).finally(() => {
      this.parseInflight.delete(inflightKey)
    })
    this.parseInflight.set(inflightKey, job)
    return job
  }

  private async runParse(
    documentId: string,
    input: IngestFromAttachmentInput,
    opts: { force?: boolean } = {},
  ): Promise<void> {
    const runner = this.parseRunner
    if (!runner) return

    const artifact = this.repo.getParseArtifact(documentId)
    if (artifact?.status === 'ready' && !opts.force) return

    this.repo.upsertParsePending(
      documentId,
      runner.engineId,
      runner.engineVersion,
      { force: opts.force },
    )

    const blob = this.repo.readBlob(documentId)
    if (!blob) {
      const err = '研报文件不可用，请重新添加'
      this.repo.markParseFailed(documentId, err)
      this.lifecycleHooks?.onFailed?.(input, err)
      return
    }

    try {
      const result = await runner.run(blob, {
        deepParse: input.deepParse,
        forceEngine: input.forceEngine,
        kind: input.kind,
        mime: input.mime,
        filename: input.name,
        onProgress: progress => {
          this.lifecycleHooks?.onProgress?.(input, progress)
        },
      })
      if (result.error && result.charCount < MIN_USEFUL_CHARS) {
        const err = result.error ?? '未能从该研报提取到可复制文本，请换电子版后再试'
        this.repo.markParseFailed(documentId, err, { pageCount: result.pageCount, charCount: result.charCount })
        this.lifecycleHooks?.onFailed?.(input, err, { pageCount: result.pageCount, charCount: result.charCount })
        return
      }
      if (result.charCount < MIN_USEFUL_CHARS) {
        const err = '未能从该研报提取到可复制文本，请换可读电子版后再试'
        this.repo.markParseFailed(documentId, err, { pageCount: result.pageCount, charCount: result.charCount })
        this.lifecycleHooks?.onFailed?.(input, err, { pageCount: result.pageCount, charCount: result.charCount })
        return
      }

      const chunkRows = this.repo.markParseReady(documentId, {
        pageCount: result.pageCount,
        charCount: result.charCount,
        markdown: result.markdown,
        chunks: result.chunks,
        engineId: result.usedEngineId,
        engineVersion: result.usedEngineVersion,
      })

      if (input.source === 'attachment' && this.legacyWriter) {
        this.legacyWriter(input.sessionId, input.attachmentId, {
          pageCount: result.pageCount,
          charCount: result.charCount,
          markdown: result.markdown,
          chunks: chunkRows.map(r => ({
            id: `c${r.seq}`,
            page: r.page,
            offset: r.offset,
            text: r.text,
          })),
        })
      }

      // 向量索引异步、可失败；未装模型时静默跳过
      void this.scheduleEmbed(documentId)
    } catch {
      const err = '未能整理该研报，请换可复制文本的电子版后再试'
      this.repo.markParseFailed(documentId, err)
      this.lifecycleHooks?.onFailed?.(input, err)
    }
  }

  /** parse ready 后异步 embed；幂等；无模型不中断；news 跳过 */
  scheduleEmbed(documentId: string): Promise<void> {
    const doc = this.repo.getDocument(documentId)
    if (doc && !shouldEmbedToVector(doc.source_type)) {
      return Promise.resolve()
    }
    const existing = this.embedInflight.get(documentId)
    if (existing) return existing
    const job = this.runEmbed(documentId).finally(() => {
      this.embedInflight.delete(documentId)
    })
    this.embedInflight.set(documentId, job)
    return job
  }

  private async runEmbed(documentId: string): Promise<void> {
    try {
      const doc = this.repo.getDocument(documentId)
      if (doc && !shouldEmbedToVector(doc.source_type)) return

      const ready = this.embedding.isReady()
        || await this.embedding.tryEnableDefaultBackend()
      if (!ready) return

      const vectorOk = await this.vectorStore.isAvailable()
      if (!vectorOk) return

      const pending = this.repo.getChunksNeedingEmbed(documentId)
      if (!pending.length) return

      // 清旧向量（重解析遗留 chunk_id / 半成品），再全量写入未嵌入块
      await this.vectorStore.deleteByDocument(documentId)
      this.repo.clearChunkEmbeddedAt(documentId)
      const chunks = this.repo.getChunks(documentId)
      if (!chunks.length) return

      for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
        const batch = chunks.slice(i, i + EMBED_BATCH_SIZE)
        const vectors = await this.embedding.embedPassages(batch.map(c => c.text))
        if (!vectors) return
        await this.vectorStore.upsert(
          batch.map((c, idx) => ({
            chunk_id: c.id,
            document_id: c.document_id,
            text: c.text,
            vector: vectors[idx] ?? [],
          })).filter(r => r.vector.length > 0),
        )
        this.repo.markChunksEmbedded(batch.map(c => c.id))
      }
    } catch {
      // 向量失败不影响入库 / FTS
    }
  }

  /** 模型安装后回填未嵌入文档（排除 news） */
  async embedPendingDocuments(limit = 50): Promise<number> {
    const rows = this.db.prepare(`
      SELECT DISTINCT c.document_id
      FROM chunks c
      JOIN parse_artifacts pa ON pa.document_id = c.document_id
      JOIN documents d ON d.id = c.document_id
      WHERE pa.status = 'ready'
        AND c.embedded_at IS NULL
        AND COALESCE(d.source_type, 'report') != 'news'
      LIMIT ?
    `).all(limit) as Array<{ document_id: string }>
    let n = 0
    for (const row of rows) {
      await this.scheduleEmbed(row.document_id)
      n += 1
    }
    return n
  }

  linkSession(sessionId: string, documentId: string, attachmentId: string | null): void {
    this.repo.linkSession(sessionId, documentId, attachmentId)
  }

  listSessionDocuments(sessionId: string): SessionDocumentView[] {
    return this.repo.listSessionDocuments(sessionId).map(row => ({
      document_id: row.document_id,
      attachment_id: row.attachment_id,
      name: row.name,
      mime: row.mime,
      kind: row.kind as DocumentKind,
      status: row.status ?? 'pending',
      page_count: row.page_count,
      char_count: row.char_count,
      error: row.error,
      linked_at: row.linked_at,
    }))
  }

  getParseStatus(documentId: string): {
    status: ParseStatus
    pageCount?: number
    charCount?: number
    error?: string
    readyAt?: string
  } | null {
    const artifact = this.repo.getParseArtifact(documentId)
    if (!artifact) return null
    return {
      status: artifact.status,
      pageCount: artifact.page_count ?? undefined,
      charCount: artifact.char_count ?? undefined,
      error: artifact.error ?? undefined,
      readyAt: artifact.ready_at ?? undefined,
    }
  }

  resolveDocumentId(sessionId: string, attachmentId: string): string | null {
    return this.repo.resolveDocumentByAttachment(sessionId, attachmentId)
  }

  searchFts(
    sessionId: string,
    query: string,
    opts: DocSearchOpts = {},
  ): FtsSearchHit[] {
    return searchFtsChunks(this.db, query, {
      sessionId,
      scope: opts.scope,
      sourceType: opts.sourceType,
      attachmentId: opts.attachmentId,
      documentId: opts.documentId,
      limit: opts.limit,
    })
  }

  /**
   * FTS ⊕ 向量 RRF；无 embedding / LanceDB 不可用时 === searchFts。
   */
  async searchHybrid(
    sessionId: string,
    query: string,
    opts: DocSearchOpts = {},
  ): Promise<FtsSearchHit[]> {
    return searchHybridChunks(this.db, query, {
      sessionId,
      scope: opts.scope,
      sourceType: opts.sourceType,
      attachmentId: opts.attachmentId,
      documentId: opts.documentId,
      limit: opts.limit,
      embedding: this.embedding,
      vectorStore: this.vectorStore,
    })
  }

  getChunkRange(
    sessionId: string,
    attachmentId: string,
    opts: {
      chunkId?: string
      pageFrom?: number
      pageTo?: number
      maxChars?: number
    },
  ): ChunkReadResult | PageRangeReadResult | { error: string } | null {
    const documentId = this.repo.resolveDocumentByAttachment(sessionId, attachmentId)
    if (!documentId) return null
    return this.getChunkRangeByDocumentId(documentId, opts)
  }

  getChunkRangeByDocumentId(
    documentId: string,
    opts: {
      chunkId?: string
      pageFrom?: number
      pageTo?: number
      maxChars?: number
    },
  ): ChunkReadResult | PageRangeReadResult | { error: string } | null {
    if (!this.repo.getDocument(documentId)) return null

    const maxChars = opts.maxChars ?? 6000

    if (opts.chunkId) {
      const hit = this.repo.getChunk(documentId, opts.chunkId)
        ?? this.repo.getChunks(documentId).find(c => c.id.endsWith(`:${opts.chunkId}`) || c.id === opts.chunkId)
      if (!hit) return { error: `找不到片段 ${opts.chunkId}` }
      const text = hit.text.slice(0, maxChars)
      return {
        chunk_id: hit.id,
        document_id: documentId,
        page: hit.page,
        text,
        truncated: hit.text.length > maxChars,
      }
    }

    const pageFrom = opts.pageFrom ?? 1
    const pageTo = opts.pageTo ?? pageFrom
    const chunks = this.repo.getChunks(documentId).filter(c => c.page >= pageFrom && c.page <= pageTo)

    if (chunks.length) {
      let text = chunks.map(c => `<!-- page:${c.page} -->\n${c.text}`).join('\n\n')
      const truncated = text.length > maxChars
      if (truncated) text = text.slice(0, maxChars)
      return { document_id: documentId, page_from: pageFrom, page_to: pageTo, text, truncated }
    }

    const md = this.repo.readMarkdown(documentId)
    if (!md) return { error: '指定页无内容' }

    const pageRe = /<!--\s*page:(\d+)\s*-->/g
    const parts: { page: number; start: number }[] = []
    let m: RegExpExecArray | null
    while ((m = pageRe.exec(md)) !== null) {
      parts.push({ page: Number(m[1]), start: m.index })
    }
    const slices: string[] = []
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]!
      if (p.page < pageFrom || p.page > pageTo) continue
      const end = parts[i + 1]?.start ?? md.length
      slices.push(md.slice(p.start, end).trim())
    }
    let text = slices.join('\n\n')
    const truncated = text.length > maxChars
    if (truncated) text = text.slice(0, maxChars)
    return { document_id: documentId, page_from: pageFrom, page_to: pageTo, text, truncated }
  }

  getRepository(): DocLibraryRepository {
    return this.repo
  }
}
