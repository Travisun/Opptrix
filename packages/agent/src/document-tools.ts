/**
 * 会话附件研报工具：list / search / read（库优先，legacy 回退）。
 */
import './doc-library-bridge.js'
import { TOOL_META } from './tool-meta.js'
import {
  listSessionAttachmentMetas,
  readExtractChunks,
  readExtractMarkdown,
  type ExtractChunkRecord,
} from './chat-attachments.js'
import { ensureDocLibraryBridge } from './doc-library-bridge.js'
import { currentToolSessionId } from './mcp/tool-session-context.js'
import type { DocumentSourceType } from '@opptrix/doc-library'

type JsonSchema = {
  type: 'object'
  properties: Record<string, {
    type: string
    description?: string
    items?: unknown
    default?: unknown
  }>
  required?: string[]
}

export interface DocumentToolDef {
  name: string
  description: string
  category: string
  parameters: JsonSchema
  handler: (args: Record<string, unknown>) => Promise<unknown>
  meta?: (typeof TOOL_META)[string]
}

type DocLibrarySvc = ReturnType<typeof ensureDocLibraryBridge>

type LibraryHit = {
  chunk_id: string
  document_id: string
  name?: string
  attachment_id?: string
  page: number
  score: number
  excerpt: string
}

function S(properties: JsonSchema['properties'], required?: string[]): JsonSchema {
  return { type: 'object', properties, required }
}

function requireSessionId(): string | null {
  const id = currentToolSessionId()?.trim()
  return id || null
}

function parseLimit(raw: unknown, defaultVal = 8): number {
  const limitRaw = Number(raw)
  return Number.isFinite(limitRaw) ? Math.min(20, Math.max(1, Math.floor(limitRaw))) : defaultVal
}

function shortChunkId(chunkId: string): string {
  return chunkId.includes(':') ? chunkId.split(':').pop() ?? chunkId : chunkId
}

function parseSourceType(raw: unknown): DocumentSourceType | undefined {
  const s = typeof raw === 'string' ? raw.trim() : ''
  if (s === 'report' || s === 'news') return s
  return undefined
}

function scoreChunk(query: string, text: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  const hay = text.toLowerCase()
  let score = 0
  const tokens = q.split(/[\s,，、;；]+/).map(t => t.trim()).filter(t => t.length >= 2)
  for (const token of tokens.length ? tokens : [q]) {
    if (!token) continue
    let idx = 0
    while (true) {
      const hit = hay.indexOf(token, idx)
      if (hit < 0) break
      score += token.length
      idx = hit + token.length
    }
  }
  return score
}

function excerptAround(text: string, query: string, maxLen = 420): string {
  const q = query.trim()
  if (!q) return text.slice(0, maxLen)
  const lower = text.toLowerCase()
  const token = q.toLowerCase().split(/[\s,，、;；]+/).find(t => t.length >= 2) ?? q.toLowerCase()
  const at = lower.indexOf(token)
  if (at < 0) return text.slice(0, maxLen)
  const start = Math.max(0, at - 80)
  const end = Math.min(text.length, start + maxLen)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  return `${prefix}${text.slice(start, end)}${suffix}`
}

function mapHybridHits(hits: Awaited<ReturnType<DocLibrarySvc['searchHybrid']>>, svc: DocLibrarySvc): LibraryHit[] {
  return hits.map(h => {
    const doc = svc.getRepository().getDocument(h.document_id)
    return {
      chunk_id: shortChunkId(h.chunk_id),
      document_id: h.document_id,
      name: doc?.name,
      attachment_id: h.attachment_id ?? undefined,
      page: h.page,
      score: Math.abs(h.rank),
      excerpt: h.excerpt,
    }
  })
}

async function searchLibraryHybrid(
  svc: DocLibrarySvc,
  query: string,
  opts: { sourceType?: DocumentSourceType; limit?: number },
): Promise<LibraryHit[]> {
  const hits = await svc.searchHybrid('', query, {
    scope: 'library',
    sourceType: opts.sourceType,
    limit: opts.limit,
  })
  return mapHybridHits(hits, svc)
}

export function buildDocumentTools(): DocumentToolDef[] {
  return [
    {
      name: 'list_session_documents',
      category: '研报',
      description: '列出本对话已上传并整理的研报 PDF（文件名、页数、整理状态、attachment_id、document_id）',
      parameters: S({}),
      handler: async () => {
        const sessionId = requireSessionId()
        if (!sessionId) return { error: '当前无会话上下文，无法列出研报' }

        const svc = ensureDocLibraryBridge()
        const libraryDocs = svc.listSessionDocuments(sessionId)
        if (libraryDocs.length) {
          const docs = libraryDocs.map(d => ({
            attachment_id: d.attachment_id ?? undefined,
            document_id: d.document_id,
            name: d.name,
            status: d.status,
            page_count: d.page_count ?? undefined,
            char_count: d.char_count ?? undefined,
            error: d.error ?? undefined,
          }))
          return { documents: docs, count: docs.length, source: 'library' as const }
        }

        const docs = listSessionAttachmentMetas(sessionId)
          .filter(m => m.kind === 'pdf' || m.kind === 'document' || m.kind === 'image')
          .map(m => ({
            attachment_id: m.id,
            document_id: m.extract?.documentId,
            name: m.name,
            status: m.extract?.status ?? 'pending',
            page_count: m.extract?.pageCount,
            char_count: m.extract?.charCount,
            error: m.extract?.error,
          }))
        return { documents: docs, count: docs.length, source: 'legacy' as const }
      },
      meta: TOOL_META.list_session_documents,
    },
    {
      name: 'search_library',
      category: '研报',
      description: '在本机研报库与资讯库中按关键词检索相关片段（跨会话），返回文档名、页码与摘录',
      parameters: S({
        query: { type: 'string', description: '检索关键词，如公司名、主题、评级' },
        limit: { type: 'number', description: '最多返回条数，默认 8，上限 20' },
        source_type: { type: 'string', description: '可选：report（研报）或 news（资讯）' },
      }, ['query']),
      handler: async (args) => {
        const query = String(args.query ?? '').trim()
        if (!query) return { error: '请提供 query' }
        const limit = parseLimit(args.limit)
        const sourceType = parseSourceType(args.source_type)

        const svc = ensureDocLibraryBridge()
        const hits = await searchLibraryHybrid(svc, query, { sourceType, limit })
        return {
          query,
          source_type: sourceType,
          hits,
          hit_count: hits.length,
          source: 'library' as const,
        }
      },
      meta: TOOL_META.search_library,
    },
    {
      name: 'search_document',
      category: '研报',
      description: '在本会话已链文档中按关键词检索相关片段；可指定 attachment_id，缺省搜全部已链文档',
      parameters: S({
        query: { type: 'string', description: '检索关键词，如评级、目标价、核心观点' },
        attachment_id: { type: 'string', description: '可选：限定单份研报（来自 list_session_documents）' },
        limit: { type: 'number', description: '最多返回条数，默认 8，上限 20' },
      }, ['query']),
      handler: async (args) => {
        const sessionId = requireSessionId()
        if (!sessionId) return { error: '当前无会话上下文' }
        const attachmentId = String(args.attachment_id ?? '').trim()
        const query = String(args.query ?? '').trim()
        if (!query) return { error: '请提供 query' }
        const limit = parseLimit(args.limit)

        const svc = ensureDocLibraryBridge()
        const hybridHits = await svc.searchHybrid(sessionId, query, {
          scope: 'session',
          attachmentId: attachmentId || undefined,
          limit,
        })
        if (hybridHits.length) {
          const ranked = mapHybridHits(hybridHits, svc)
          return {
            attachment_id: attachmentId || undefined,
            query,
            hits: ranked,
            hit_count: ranked.length,
            source: 'library' as const,
          }
        }

        if (!attachmentId) {
          return {
            attachment_id: undefined,
            query,
            hits: [] as LibraryHit[],
            hit_count: 0,
            source: 'library' as const,
            message: '本会话尚无已整理文档或未命中关键词；可 list_session_documents 确认，或改用 search_library 跨库检索',
          }
        }

        const chunks = readExtractChunks(sessionId, attachmentId)
        if (!chunks) {
          return { error: '研报尚未整理完成或不存在，请先 list_session_documents 确认状态' }
        }
        const ranked = chunks
          .map((c: ExtractChunkRecord) => ({
            chunk_id: c.id,
            document_id: undefined,
            page: c.page,
            score: scoreChunk(query, c.text),
            excerpt: excerptAround(c.text, query),
          }))
          .filter(r => r.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit)
        return {
          attachment_id: attachmentId,
          query,
          hits: ranked,
          hit_count: ranked.length,
          source: 'legacy' as const,
        }
      },
      meta: TOOL_META.search_document,
    },
    {
      name: 'read_document',
      category: '研报',
      description: '按 document_id 或 attachment_id 精读已整理文档的 Markdown 片段（页码范围或 chunk）',
      parameters: S({
        document_id: { type: 'string', description: '文档 id（来自 search_library / search_document）' },
        attachment_id: { type: 'string', description: '可选：本会话附件 id（与 document_id 二选一）' },
        page_from: { type: 'number', description: '起始页（含），默认 1' },
        page_to: { type: 'number', description: '结束页（含）；与 page_from 一起用' },
        chunk_id: { type: 'string', description: '可选：直接读取 search 返回的 chunk_id' },
        max_chars: { type: 'number', description: '返回字符上限，默认 6000，上限 12000' },
      }),
      handler: async (args) => {
        const sessionId = requireSessionId()
        if (!sessionId) return { error: '当前无会话上下文' }
        const documentIdArg = String(args.document_id ?? '').trim()
        const attachmentId = String(args.attachment_id ?? '').trim()
        if (!documentIdArg && !attachmentId) {
          return { error: '请提供 document_id 或 attachment_id' }
        }
        const maxRaw = Number(args.max_chars)
        const maxChars = Number.isFinite(maxRaw) ? Math.min(12_000, Math.max(500, Math.floor(maxRaw))) : 6000

        const chunkId = typeof args.chunk_id === 'string' ? args.chunk_id.trim() : ''
        const fromRaw = Number(args.page_from)
        const toRaw = Number(args.page_to)
        const pageFrom = Number.isFinite(fromRaw) && fromRaw >= 1 ? Math.floor(fromRaw) : 1
        const pageTo = Number.isFinite(toRaw) && toRaw >= pageFrom
          ? Math.floor(toRaw)
          : pageFrom

        const svc = ensureDocLibraryBridge()
        const documentId = documentIdArg || svc.resolveDocumentId(sessionId, attachmentId)
        if (documentId) {
          const fullChunkId = chunkId && !chunkId.includes(':')
            ? `${documentId}:c${chunkId.replace(/^c/, '')}`
            : chunkId
          const libResult = documentIdArg
            ? svc.getChunkRangeByDocumentId(documentId, {
              chunkId: fullChunkId || undefined,
              pageFrom,
              pageTo,
              maxChars,
            })
            : svc.getChunkRange(sessionId, attachmentId, {
              chunkId: fullChunkId || undefined,
              pageFrom,
              pageTo,
              maxChars,
            })
          if (libResult && !('error' in libResult)) {
            if ('chunk_id' in libResult) {
              return {
                attachment_id: attachmentId || undefined,
                document_id: documentId,
                chunk_id: shortChunkId(libResult.chunk_id),
                page: libResult.page,
                text: libResult.text,
                truncated: libResult.truncated,
                source: 'library' as const,
              }
            }
            return {
              attachment_id: attachmentId || undefined,
              document_id: documentId,
              page_from: libResult.page_from,
              page_to: libResult.page_to,
              text: libResult.text,
              truncated: libResult.truncated,
              source: 'library' as const,
            }
          }
          if (libResult && 'error' in libResult) {
            return { error: libResult.error }
          }
        }

        if (!attachmentId) {
          return { error: '找不到该 document_id 对应文档' }
        }

        const chunks = readExtractChunks(sessionId, attachmentId)
        if (!chunks) {
          return { error: '研报尚未整理完成或不存在' }
        }

        if (chunkId) {
          const hit = chunks.find(c => c.id === chunkId)
          if (!hit) return { error: `找不到片段 ${chunkId}` }
          const text = hit.text.slice(0, maxChars)
          return {
            attachment_id: attachmentId,
            chunk_id: hit.id,
            page: hit.page,
            text,
            truncated: hit.text.length > maxChars,
            source: 'legacy' as const,
          }
        }

        const selected = chunks.filter(c => c.page >= pageFrom && c.page <= pageTo)
        if (!selected.length) {
          const md = readExtractMarkdown(sessionId, attachmentId)
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
          return {
            attachment_id: attachmentId,
            page_from: pageFrom,
            page_to: pageTo,
            text,
            truncated,
            source: 'legacy' as const,
          }
        }

        let text = selected.map(c => `<!-- page:${c.page} -->\n${c.text}`).join('\n\n')
        const truncated = text.length > maxChars
        if (truncated) text = text.slice(0, maxChars)
        return {
          attachment_id: attachmentId,
          page_from: pageFrom,
          page_to: pageTo,
          text,
          truncated,
          source: 'legacy' as const,
        }
      },
      meta: TOOL_META.read_document,
    },
  ]
}
