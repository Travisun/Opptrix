/**
 * Agent 网页制品工具：create_web / update_web / read_web / list_web_vendor
 * 对齐 canvas-tools；资源仅允许 `/opptrix-vendor/...`，禁止外网 CDN。
 */
import { ARTIFACT_SOURCE_MAX_CHARS } from './chat-attachments.js'
import {
  readAttachmentMeta,
  readWebIndexHtml,
  saveWebAttachment,
  updateWebAttachment,
  type WebExtraFile,
} from './chat-attachments.js'
import type { ChatAttachmentMeta } from './media-types.js'
import { TOOL_META } from './tool-meta.js'
import { currentToolSessionId } from './mcp/tool-session-context.js'
import { readWebVendorManifest, summarizeWebVendorLibs } from './web-vendor.js'

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

export interface WebToolDef {
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

function okAttachment(
  attachment: ChatAttachmentMeta,
  message: string,
  extra?: Record<string, unknown>,
) {
  return { ok: true as const, attachment, message, ...extra }
}

function parseExtraFiles(raw: unknown): WebExtraFile[] | { error: string } {
  if (raw == null) return []
  if (!Array.isArray(raw)) return { error: 'files 须为数组' }
  const out: WebExtraFile[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const p = String(row.path ?? '').trim()
    const content = String(row.content ?? '')
    if (!p) return { error: 'files[].path 必填' }
    if (!content && content !== '') {
      /* allow empty */
    }
    if (content.length > ARTIFACT_SOURCE_MAX_CHARS) {
      return { error: `文件 ${p} 过长（上限 ${ARTIFACT_SOURCE_MAX_CHARS} 字符）` }
    }
    out.push({ path: p, content })
  }
  return out
}

/** 粗检：禁止明显外网 CDN 引用（仍以预览 CSP 为硬边界） */
function warnCdnUsage(html: string): string | undefined {
  if (/https?:\/\/cdn\.|unpkg\.com|jsdelivr\.net|cdnjs\.cloudflare/i.test(html)) {
    return '检测到外网 CDN 链接：请改为 /opptrix-vendor/... 本地库，离线预览可能无法加载外网资源'
  }
  return undefined
}

export function buildWebTools(): WebToolDef[] {
  return [
    {
      name: 'create_web',
      category: '制品',
      description:
        '创建可预览的单页 HTML 网页制品（index.html + 同目录相对资源）；脚本/样式须引用 /opptrix-vendor/...，禁止外网 CDN',
      parameters: S({
        title: { type: 'string', description: '网页标题（显示名）' },
        html: { type: 'string', description: '入口 index.html 完整 HTML 字符串' },
        files: {
          type: 'array',
          description: '可选额外相对路径文件：[{path, content}]，如 styles.css、app.js',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              content: { type: 'string' },
            },
          },
        },
      }, ['title', 'html']),
      handler: async (args) => {
        const sessionId = requireSessionId()
        if (!sessionId) return { error: '当前无会话上下文，无法创建网页' }
        const title = String(args.title ?? '').trim()
        const html = String(args.html ?? '')
        if (!title) return { error: '请提供 title' }
        if (!html.trim()) return { error: '请提供 html' }
        if (html.length > ARTIFACT_SOURCE_MAX_CHARS) {
          return { error: `HTML 过长（上限 ${ARTIFACT_SOURCE_MAX_CHARS} 字符）` }
        }
        const parsed = parseExtraFiles(args.files)
        if ('error' in parsed) return parsed
        try {
          const attachment = saveWebAttachment({
            sessionId,
            name: title,
            html,
            files: parsed,
          })
          const supportedLibs = summarizeWebVendorLibs()
          const warn = warnCdnUsage(html)
          return okAttachment(attachment, '已创建网页，用户可在消息中点击预览', {
            supported_libs: supportedLibs,
            vendor_manifest: '/api/opptrix-vendor/manifest',
            ...(warn ? { warning: warn } : {}),
          })
        } catch (e) {
          return { error: e instanceof Error ? e.message : String(e) }
        }
      },
      meta: TOOL_META.create_web,
    },
    {
      name: 'update_web',
      category: '制品',
      description: '更新已有网页制品的 HTML 与可选相对路径文件',
      parameters: S({
        attachment_id: { type: 'string', description: '网页附件 id（来自 create_web）' },
        html: { type: 'string', description: '新的 index.html 内容' },
        title: { type: 'string', description: '可选：更新显示名' },
        files: {
          type: 'array',
          description: '可选：覆盖/新增相对路径文件 [{path, content}]',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              content: { type: 'string' },
            },
          },
        },
      }, ['attachment_id', 'html']),
      handler: async (args) => {
        const sessionId = requireSessionId()
        if (!sessionId) return { error: '当前无会话上下文' }
        const attachmentId = String(args.attachment_id ?? '').trim()
        const html = String(args.html ?? '')
        if (!attachmentId) return { error: '请提供 attachment_id' }
        if (!html.trim()) return { error: '请提供 html' }
        if (html.length > ARTIFACT_SOURCE_MAX_CHARS) {
          return { error: `HTML 过长（上限 ${ARTIFACT_SOURCE_MAX_CHARS} 字符）` }
        }
        const existing = readAttachmentMeta(sessionId, attachmentId)
        if (!existing || existing.kind !== 'web') {
          return { error: '找不到该网页附件' }
        }
        const parsed = parseExtraFiles(args.files)
        if ('error' in parsed) return parsed
        const title = args.title != null ? String(args.title).trim() : undefined
        try {
          const attachment = updateWebAttachment({
            sessionId,
            attachmentId,
            html,
            files: parsed.length ? parsed : undefined,
            name: title || undefined,
          })
          if (!attachment) return { error: '更新网页失败' }
          const warn = warnCdnUsage(html)
          return okAttachment(attachment, '已更新网页', warn ? { warning: warn } : undefined)
        } catch (e) {
          return { error: e instanceof Error ? e.message : String(e) }
        }
      },
      meta: TOOL_META.update_web,
    },
    {
      name: 'read_web',
      category: '制品',
      description: '读取网页制品元数据与 index.html 源码',
      parameters: S({
        attachment_id: { type: 'string', description: '网页附件 id' },
      }, ['attachment_id']),
      handler: async (args) => {
        const sessionId = requireSessionId()
        if (!sessionId) return { error: '当前无会话上下文' }
        const attachmentId = String(args.attachment_id ?? '').trim()
        if (!attachmentId) return { error: '请提供 attachment_id' }
        const meta = readAttachmentMeta(sessionId, attachmentId)
        if (!meta || meta.kind !== 'web') return { error: '找不到该网页附件' }
        const html = readWebIndexHtml(sessionId, attachmentId)
        if (html == null) return { error: '网页内容不可读' }
        return { ok: true, attachment: meta, html }
      },
      meta: TOOL_META.read_web,
    },
    {
      name: 'list_web_vendor',
      category: '制品',
      description: '列出本机离线网页库（manifest 摘要）；脚本引用路径形如 /opptrix-vendor/<id>/...',
      parameters: S({}),
      handler: async () => {
        const manifest = readWebVendorManifest()
        if (!manifest) {
          return {
            ok: false,
            error: '未找到离线网页库，请确认已部署 web-vendor',
            supported_libs: [],
          }
        }
        return {
          ok: true,
          version: manifest.version,
          supported_libs: summarizeWebVendorLibs(manifest),
          href_root: '/opptrix-vendor/',
          manifest_url: '/api/opptrix-vendor/manifest',
        }
      },
      meta: TOOL_META.list_web_vendor,
    },
  ]
}
