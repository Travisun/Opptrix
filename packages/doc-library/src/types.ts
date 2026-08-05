/** 解析引擎标识；`rapidocr-l2` / `unlimited-ocr-l2` / `pdfplumber-l1` 为兼容别名（读旧 artifact 不炸） */
export type ParseEngineId =
  | 'text-l0'
  | 'office-l0'
  | 'pdf-extract-l0'
  | 'ocr-l2'
  | 'pdfplumber-l1'
  | 'rapidocr-l2'
  | 'unlimited-ocr-l2'

export type ParseStatus = 'pending' | 'ready' | 'failed'

export type DocumentKind =
  | 'pdf'
  | 'image'
  | 'text'
  | 'docx'
  | 'doc'
  | 'pptx'
  | 'ppt'
  | 'other'

/** 文档来源：研报附件 vs 资讯 */
export type DocumentSourceType = 'report' | 'news'

export interface DocumentRow {
  id: string
  content_sha256: string
  name: string
  mime: string
  kind: DocumentKind
  byte_size: number
  blob_path: string
  /** 默认 report；资讯 ingest 写 news */
  source_type: DocumentSourceType
  /** 外部主键（如资讯 article id）；研报可空 */
  external_id: string | null
  created_at: string
  updated_at: string
}

export interface ParseArtifactRow {
  document_id: string
  engine_id: ParseEngineId
  engine_version: string
  status: ParseStatus
  page_count: number | null
  char_count: number | null
  md_path: string | null
  error: string | null
  ready_at: string | null
  parse_fingerprint: string | null
}

export interface ChunkRow {
  id: string
  document_id: string
  seq: number
  page: number
  offset: number
  text: string
  char_count: number
  /** ISO 时间；已写入向量索引时非 null */
  embedded_at: string | null
}

export interface SessionDocumentRow {
  session_id: string
  document_id: string
  attachment_id: string | null
  linked_at: string
}

export interface ParseChunkInput {
  page: number
  offset: number
  text: string
}

export interface ParseRunResult {
  pageCount: number
  charCount: number
  markdown: string
  chunks: ParseChunkInput[]
  error?: string
  /** 空页占比 0..1；缺失时由 Router 从 markdown/chunks 估算 */
  emptyPageRatio?: number
  /** 级联结束后实际采用的引擎（ParseRouter 会填充） */
  usedEngineId?: ParseEngineId
  usedEngineVersion?: string
}

/** 解析过程阶段（附件 meta / UI 轮询） */
export type ParseProgressPhase = 'converting' | 'extracting' | 'ocr' | 'ready' | 'failed'

export interface ParseProgress {
  phase: ParseProgressPhase
  ocrDone?: number
  ocrTotal?: number
  /** 用户可见短句（可选） */
  message?: string
}

/** 单次解析选项（升阶 / 强制引擎 / 路由上下文） */
export interface ParseRunOpts {
  /** 用户请求深度整理 → 允许升至 OCR（须已就绪） */
  deepParse?: boolean
  /** 强制指定引擎；不可用时降级并带友好 error */
  forceEngine?: ParseEngineId
  /** 文档类型（Router 按 kind 选首引擎） */
  kind?: DocumentKind
  mime?: string
  filename?: string
  /** 异步整理进度（转换 / 抽正文 / 内嵌 OCR） */
  onProgress?: (progress: ParseProgress) => void
}

/** 注入解析引擎；由 agent 组装 ParseRouter，避免 doc-library → agent 循环依赖 */
export interface ParseRunner {
  engineId: ParseEngineId
  engineVersion: string
  /** 可选：可用性探测（侧车 / 可选包） */
  isAvailable?(): boolean | Promise<boolean>
  run(blob: Buffer, opts?: ParseRunOpts): Promise<ParseRunResult>
}

export interface IngestFromAttachmentInput {
  sessionId: string
  attachmentId: string
  name: string
  mime: string
  kind: DocumentKind
  data: Buffer
  /** attachment 来源时双写 legacy extract */
  source: 'attachment' | 'import'
  /** 深度整理（扫描件 OCR） */
  deepParse?: boolean
  /** 强制引擎；须已可用，否则保留最佳结果 */
  forceEngine?: ParseEngineId
}

export interface IngestFromAttachmentResult {
  documentId: string
  contentSha256: string
  reused: boolean
  parseStatus: ParseStatus
  pageCount?: number
  charCount?: number
  error?: string
  readyAt?: string
}

/** 纯文本入库（资讯正文等）；source_type + external_id 去重 */
export interface IngestFromTextInput {
  text: string
  name: string
  sourceType: DocumentSourceType
  externalId: string
  mime?: string
}

export type IngestFromTextResult = IngestFromAttachmentResult

export interface SessionDocumentView {
  document_id: string
  attachment_id: string | null
  name: string
  mime: string
  kind: DocumentKind
  status: ParseStatus
  page_count: number | null
  char_count: number | null
  error: string | null
  linked_at: string
}

/** 检索范围：会话附件 vs 全库（ready 文档） */
export type DocSearchScope = 'session' | 'library'

export interface DocSearchOpts {
  scope?: DocSearchScope
  sourceType?: DocumentSourceType
  attachmentId?: string
  documentId?: string
  limit?: number
}

export interface FtsSearchHit {
  chunk_id: string
  document_id: string
  attachment_id: string | null
  page: number
  excerpt: string
  rank: number
}

export interface ChunkReadResult {
  chunk_id: string
  document_id: string
  page: number
  text: string
  truncated: boolean
}

export interface PageRangeReadResult {
  document_id: string
  page_from: number
  page_to: number
  text: string
  truncated: boolean
}

/** 将历史引擎 ID 规范为当前主 ID（写库用） */
export function canonicalizeParseEngineId(id: ParseEngineId | string): ParseEngineId {
  if (id === 'rapidocr-l2' || id === 'unlimited-ocr-l2') return 'ocr-l2'
  if (
    id === 'text-l0'
    || id === 'office-l0'
    || id === 'pdf-extract-l0'
    || id === 'ocr-l2'
    || id === 'pdfplumber-l1'
  ) {
    return id
  }
  return 'pdf-extract-l0'
}

export function isOcrEngineId(id: ParseEngineId | undefined): boolean {
  return id === 'ocr-l2' || id === 'rapidocr-l2' || id === 'unlimited-ocr-l2'
}
