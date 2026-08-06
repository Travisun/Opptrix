/**
 * Agent 画布 / 脑图制品工具：create / update / read。
 */
import { TOOL_META } from './tool-meta.js'
import {
  ARTIFACT_SOURCE_MAX_CHARS,
  readAttachmentMeta,
  readAttachmentText,
  saveCanvasAttachment,
  saveMindmapAttachment,
  updateCanvasAttachment,
  updateMindmapAttachment,
} from './chat-attachments.js'
import type { CanvasAttachmentMeta, CanvasPageSpec, ChatAttachmentMeta } from './media-types.js'
import { currentToolSessionId } from './mcp/tool-session-context.js'

type JsonSchema = {
  type: 'object'
  properties: Record<string, {
    type: string
    description?: string
    items?: unknown
    default?: unknown
    enum?: string[]
  }>
  required?: string[]
}

export interface CanvasToolDef {
  name: string
  description: string
  category: string
  parameters: JsonSchema
  handler: (args: Record<string, unknown>) => Promise<unknown>
  meta?: (typeof TOOL_META)[string]
}

const S = (properties: JsonSchema['properties'], required?: string[]): JsonSchema =>
  ({ type: 'object', properties, required })

function requireSessionId(): string | null {
  const id = currentToolSessionId()?.trim()
  return id || null
}

function parsePageSpec(raw: unknown): CanvasPageSpec | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const row = raw as Record<string, unknown>
  if (typeof row.preset === 'string' && row.preset.trim()) {
    return { preset: row.preset.trim() }
  }
  const widthMm = Number(row.widthMm)
  const heightMm = Number(row.heightMm)
  if (Number.isFinite(widthMm) && widthMm > 0 && Number.isFinite(heightMm) && heightMm > 0) {
    return { widthMm, heightMm }
  }
  const widthPx = Number(row.widthPx)
  const heightPx = Number(row.heightPx)
  if (Number.isFinite(widthPx) && widthPx > 0 && Number.isFinite(heightPx) && heightPx > 0) {
    return { widthPx, heightPx }
  }
  return undefined
}

/** Normalize mode; accept legacy `paged` / `infinite` from older attachments. */
function normalizeCanvasMode(raw: unknown): CanvasAttachmentMeta['mode'] {
  if (raw === 'print' || raw === 'paged') return 'print'
  if (raw === 'fluid' || raw === 'infinite' || raw === 'document') return 'fluid'
  return 'fluid'
}

function parseCanvasMeta(args: Record<string, unknown>): CanvasAttachmentMeta {
  const mode = normalizeCanvasMode(args.mode)
  const page = parsePageSpec(args.page)
  const pageCountRaw = Number(args.pageCount)
  const pageCount = Number.isFinite(pageCountRaw) && pageCountRaw >= 1
    ? Math.min(200, Math.floor(pageCountRaw))
    : undefined
  return {
    mode,
    ...(page != null ? { page } : {}),
    ...(pageCount != null ? { pageCount } : {}),
  }
}

type MindmapNode = {
  id: string
  parentId: string | null
  label: string
  note?: string
}

function parseMindmapNodes(raw: unknown): MindmapNode[] | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: '请提供 nodes 数组（至少一个节点）' }
  }
  const nodes: MindmapNode[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const id = String(row.id ?? '').trim()
    if (!id) continue
    if (seen.has(id)) return { error: `节点 id 重复：${id}` }
    seen.add(id)
    const parentRaw = row.parentId
    const parentId = parentRaw == null || parentRaw === ''
      ? null
      : String(parentRaw).trim() || null
    const label = String(row.label ?? '').trim() || id
    const note = row.note != null ? String(row.note) : undefined
    nodes.push({
      id,
      parentId,
      label,
      ...(note != null && note !== '' ? { note } : {}),
    })
  }
  if (!nodes.length) return { error: 'nodes 无效：需要含 id 的节点' }
  return nodes
}

function okAttachment(attachment: ChatAttachmentMeta, message: string) {
  return { ok: true as const, attachment, message }
}

export function buildCanvasTools(): CanvasToolDef[] {
  return [
    {
      name: 'create_canvas',
      category: '制品',
      description: '创建可预览的投研画布（TSX 源码），用户可在消息中点击打开',
      parameters: S({
        title: { type: 'string', description: '画布标题（显示名）' },
        source: { type: 'string', description: '画布 TSX 源码字符串' },
        mode: {
          type: 'string',
          description: '布局模式：fluid（流体宽度，默认）或 print（可选打印尺寸）',
          enum: ['fluid', 'print'],
          default: 'fluid',
        },
        page: {
          type: 'object',
          description: '可选：打印尺寸 {widthMm,heightMm} 或 {widthPx,heightPx}；fluid 模式可忽略',
        },
        pageCount: { type: 'number', description: '可选页数（print 模式）' },
      }, ['title', 'source']),
      handler: async (args) => {
        const sessionId = requireSessionId()
        if (!sessionId) return { error: '当前无会话上下文，无法创建画布' }
        const title = String(args.title ?? '').trim()
        const source = String(args.source ?? '')
        if (!title) return { error: '请提供 title' }
        if (!source.trim()) return { error: '请提供 source' }
        if (source.length > ARTIFACT_SOURCE_MAX_CHARS) {
          return { error: `源码过长（上限 ${ARTIFACT_SOURCE_MAX_CHARS} 字符）` }
        }
        try {
          const attachment = saveCanvasAttachment({
            sessionId,
            name: title,
            source,
            canvas: parseCanvasMeta(args),
          })
          return okAttachment(attachment, '已创建画布，用户可在消息中点击预览')
        } catch (e) {
          return { error: e instanceof Error ? e.message : String(e) }
        }
      },
      meta: TOOL_META.create_canvas,
    },
    {
      name: 'update_canvas',
      category: '制品',
      description: '更新已有画布的源码或页面元数据',
      parameters: S({
        attachment_id: { type: 'string', description: '画布附件 id（来自 create_canvas）' },
        source: { type: 'string', description: '新的 TSX 源码' },
        title: { type: 'string', description: '可选：更新显示名' },
        mode: {
          type: 'string',
          description: '可选：fluid 或 print',
          enum: ['fluid', 'print'],
        },
        page: { type: 'object', description: '可选：打印尺寸（fluid 可忽略）' },
        pageCount: { type: 'number', description: '可选页数' },
      }, ['attachment_id', 'source']),
      handler: async (args) => {
        const sessionId = requireSessionId()
        if (!sessionId) return { error: '当前无会话上下文' }
        const attachmentId = String(args.attachment_id ?? '').trim()
        const source = String(args.source ?? '')
        if (!attachmentId) return { error: '请提供 attachment_id' }
        if (!source.trim()) return { error: '请提供 source' }
        if (source.length > ARTIFACT_SOURCE_MAX_CHARS) {
          return { error: `源码过长（上限 ${ARTIFACT_SOURCE_MAX_CHARS} 字符）` }
        }
        const existing = readAttachmentMeta(sessionId, attachmentId)
        if (!existing || existing.kind !== 'canvas') {
          return { error: '找不到该画布附件' }
        }
        const hasCanvasPatch = args.mode != null || args.page != null || args.pageCount != null
        const canvas = hasCanvasPatch
          ? {
              ...parseCanvasMeta({
                mode: args.mode ?? existing.canvas?.mode,
                page: args.page ?? existing.canvas?.page,
                pageCount: args.pageCount ?? existing.canvas?.pageCount,
              }),
            }
          : undefined
        const title = args.title != null ? String(args.title).trim() : undefined
        try {
          const attachment = updateCanvasAttachment({
            sessionId,
            attachmentId,
            source,
            canvas,
            name: title || undefined,
          })
          if (!attachment) return { error: '更新画布失败' }
          return okAttachment(attachment, '已更新画布')
        } catch (e) {
          return { error: e instanceof Error ? e.message : String(e) }
        }
      },
      meta: TOOL_META.update_canvas,
    },
    {
      name: 'read_canvas',
      category: '制品',
      description: '读取画布元数据与 TSX 源码',
      parameters: S({
        attachment_id: { type: 'string', description: '画布附件 id' },
      }, ['attachment_id']),
      handler: async (args) => {
        const sessionId = requireSessionId()
        if (!sessionId) return { error: '当前无会话上下文' }
        const attachmentId = String(args.attachment_id ?? '').trim()
        if (!attachmentId) return { error: '请提供 attachment_id' }
        const meta = readAttachmentMeta(sessionId, attachmentId)
        if (!meta || meta.kind !== 'canvas') return { error: '找不到该画布附件' }
        const source = readAttachmentText(sessionId, attachmentId)
        if (source == null) return { error: '画布源码不可读' }
        return { ok: true, attachment: meta, source }
      },
      meta: TOOL_META.read_canvas,
    },
    {
      name: 'create_mindmap',
      category: '制品',
      description: '创建可预览的脑图，用户可在消息中点击打开',
      parameters: S({
        title: { type: 'string', description: '脑图标题（显示名）' },
        rootId: { type: 'string', description: '根节点 id' },
        nodes: {
          type: 'array',
          description: '节点列表：[{id, parentId|null, label, note?}]',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              parentId: { type: 'string' },
              label: { type: 'string' },
              note: { type: 'string' },
            },
          },
        },
      }, ['title', 'rootId', 'nodes']),
      handler: async (args) => {
        const sessionId = requireSessionId()
        if (!sessionId) return { error: '当前无会话上下文，无法创建脑图' }
        const title = String(args.title ?? '').trim()
        const rootId = String(args.rootId ?? '').trim()
        if (!title) return { error: '请提供 title' }
        if (!rootId) return { error: '请提供 rootId' }
        const parsed = parseMindmapNodes(args.nodes)
        if ('error' in parsed) return parsed
        if (!parsed.some(n => n.id === rootId)) {
          return { error: `rootId「${rootId}」不在 nodes 中` }
        }
        const tree = { version: 1, rootId, nodes: parsed }
        try {
          const attachment = saveMindmapAttachment({
            sessionId,
            name: title,
            tree,
            mindmap: { rootId },
          })
          return okAttachment(attachment, '已创建脑图，用户可在消息中点击预览')
        } catch (e) {
          return { error: e instanceof Error ? e.message : String(e) }
        }
      },
      meta: TOOL_META.create_mindmap,
    },
    {
      name: 'update_mindmap',
      category: '制品',
      description: '更新已有脑图的节点树',
      parameters: S({
        attachment_id: { type: 'string', description: '脑图附件 id' },
        rootId: { type: 'string', description: '根节点 id' },
        nodes: {
          type: 'array',
          description: '完整节点列表：[{id, parentId|null, label, note?}]',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              parentId: { type: 'string' },
              label: { type: 'string' },
              note: { type: 'string' },
            },
          },
        },
        title: { type: 'string', description: '可选：更新显示名' },
      }, ['attachment_id', 'rootId', 'nodes']),
      handler: async (args) => {
        const sessionId = requireSessionId()
        if (!sessionId) return { error: '当前无会话上下文' }
        const attachmentId = String(args.attachment_id ?? '').trim()
        const rootId = String(args.rootId ?? '').trim()
        if (!attachmentId) return { error: '请提供 attachment_id' }
        if (!rootId) return { error: '请提供 rootId' }
        const existing = readAttachmentMeta(sessionId, attachmentId)
        if (!existing || existing.kind !== 'mindmap') {
          return { error: '找不到该脑图附件' }
        }
        const parsed = parseMindmapNodes(args.nodes)
        if ('error' in parsed) return parsed
        if (!parsed.some(n => n.id === rootId)) {
          return { error: `rootId「${rootId}」不在 nodes 中` }
        }
        const title = args.title != null ? String(args.title).trim() : undefined
        try {
          const attachment = updateMindmapAttachment({
            sessionId,
            attachmentId,
            tree: { version: 1, rootId, nodes: parsed },
            mindmap: { rootId },
            name: title || undefined,
          })
          if (!attachment) return { error: '更新脑图失败' }
          return okAttachment(attachment, '已更新脑图')
        } catch (e) {
          return { error: e instanceof Error ? e.message : String(e) }
        }
      },
      meta: TOOL_META.update_mindmap,
    },
    {
      name: 'read_mindmap',
      category: '制品',
      description: '读取脑图元数据与节点树 JSON',
      parameters: S({
        attachment_id: { type: 'string', description: '脑图附件 id' },
      }, ['attachment_id']),
      handler: async (args) => {
        const sessionId = requireSessionId()
        if (!sessionId) return { error: '当前无会话上下文' }
        const attachmentId = String(args.attachment_id ?? '').trim()
        if (!attachmentId) return { error: '请提供 attachment_id' }
        const meta = readAttachmentMeta(sessionId, attachmentId)
        if (!meta || meta.kind !== 'mindmap') return { error: '找不到该脑图附件' }
        const text = readAttachmentText(sessionId, attachmentId)
        if (text == null) return { error: '脑图内容不可读' }
        let tree: unknown = text
        try {
          tree = JSON.parse(text) as unknown
        } catch {
          /* 返回原文 */
        }
        return { ok: true, attachment: meta, tree }
      },
      meta: TOOL_META.read_mindmap,
    },
  ]
}
