/** L0/L1/L2 解析引擎标识 */
export type ParseEngineId = 'pdf-extract-l0' | 'pdfplumber-l1' | 'unlimited-ocr-l2'

export type ParseStatus = 'pending' | 'ready' | 'failed'

export type DocumentKind = 'pdf' | 'image' | 'other'

export interface DocumentRow {
  id: string
  content_sha256: string
  name: string
  mime: string
  kind: DocumentKind
  byte_size: number
  blob_path: string
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

/** 单次解析选项（升阶 / 强制引擎） */
export interface ParseRunOpts {
  /** 用户请求深度整理 → 允许升至 L2（须已安装） */
  deepParse?: boolean
  /** 强制指定引擎；不可用时降级并带友好 error */
  forceEngine?: ParseEngineId
}

/** 注入 L0/L1/L2 解析；由 agent 实现，避免 doc-library → agent 循环依赖 */
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
  /** 深度整理（扫描件 / 版面增强路径） */
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
