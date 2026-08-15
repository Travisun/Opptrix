import type { FastifyInstance } from 'fastify'
import fs from 'node:fs'
import path from 'node:path'
import type { AgentEngine } from '@opptrix/agent'
import {
  mimeToMediaKind,
  resolveModelMediaCapabilitiesAsync,
  saveAttachment,
  deleteAttachment,
  readAttachmentMeta,
  readAttachmentBuffer,
  readExtractMarkdown,
  resolveAttachmentFilePath,
  resolveSafeWebRelativePath,
  validateAttachmentAgainstCapabilities,
  isAttachmentReferenced,
  listSessionAttachmentMetas,
  parseNonNegativeIntHeader,
  resolveUploadMime,
  updateCanvasAttachment,
  updateMindmapAttachment,
} from '@opptrix/agent'
import { decodeTextBuffer, isPlainTextDocument } from '@opptrix/doc-library'
import { WEB_CSP, guessWebAssetMime } from './opptrix-vendor-routes.js'
import {
  buildLoopbackWebPreviewUrl,
  captureWebPreviewFullPagePng,
} from './web-preview-export.js'

function sanitizeFilename(name: string): string {
  const base = path.basename(name.trim() || 'file')
  return base.replace(/[^\w.\-()\u4e00-\u9fff]/g, '_').slice(0, 180) || 'file'
}

/** 解析单段 `Range: bytes=`；非法/不可满足返回 `unsatisfied`，无 Range 返回 null */
function parseBytesRange(
  rangeHeader: string | undefined,
  size: number,
): { start: number; end: number } | 'unsatisfied' | null {
  if (!rangeHeader) return null
  const trimmed = rangeHeader.trim()
  // 仅支持单段 bytes；多段 / 非 bytes 视为不可满足（媒体 seek 只需单段）
  const m = /^bytes=(\d*)-(\d*)$/i.exec(trimmed)
  if (!m) return 'unsatisfied'
  const startRaw = m[1] ?? ''
  const endRaw = m[2] ?? ''
  if (startRaw === '' && endRaw === '') return 'unsatisfied'
  if (size <= 0) return 'unsatisfied'

  let start: number
  let end: number
  if (startRaw === '') {
    // suffix: bytes=-N → 最后 N 字节
    const suffix = Number(endRaw)
    if (!Number.isFinite(suffix) || suffix <= 0) return 'unsatisfied'
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(startRaw)
    if (!Number.isFinite(start) || start < 0) return 'unsatisfied'
    end = endRaw === '' ? size - 1 : Number(endRaw)
    if (!Number.isFinite(end) || end < start) return 'unsatisfied'
    if (end >= size) end = size - 1
  }
  if (start >= size) return 'unsatisfied'
  return { start, end }
}

async function resolveSessionMediaCaps(agent: AgentEngine, sessionId: string) {
  const session = agent.getSession(sessionId)
  if (!session) return null
  const modelRef = session.model?.trim() || ''
  const colon = modelRef.indexOf(':')
  const providerId = colon > 0 ? modelRef.slice(0, colon) : undefined
  const modelId = colon > 0 ? modelRef.slice(colon + 1) : modelRef
  if (!modelId) {
    return resolveModelMediaCapabilitiesAsync('default', providerId)
  }
  return resolveModelMediaCapabilitiesAsync(modelId, providerId)
}

/** 附件上传 body 上限：与 Fastify 实例 bodyLimit 对齐；业务层本地路径不设硬字节门禁 */
export const ATTACHMENT_UPLOAD_BODY_LIMIT = 4 * 1024 * 1024 * 1024

const attachmentBinaryBodyOpts = {
  parseAs: 'buffer' as const,
  bodyLimit: ATTACHMENT_UPLOAD_BODY_LIMIT,
}

export function registerSessionAttachmentRoutes(app: FastifyInstance, agent: AgentEngine) {
  // Blob/File 上传时浏览器可能把 Content-Type 设为真实 MIME（如 video/mp4），
  // 若不注册高限 parser，会回落到实例默认解析并触发 413。
  app.addContentTypeParser(
    'application/octet-stream',
    attachmentBinaryBodyOpts,
    (_req, body, done) => { done(null, body) },
  )
  app.addContentTypeParser(
    'application/pdf',
    attachmentBinaryBodyOpts,
    (_req, body, done) => { done(null, body) },
  )
  app.addContentTypeParser(
    /^(?:audio|video|image)\/[\w.+-]+(?:\s*;.*)?$/i,
    attachmentBinaryBodyOpts,
    (_req, body, done) => { done(null, body) },
  )
  app.addContentTypeParser(
    'text/plain',
    { parseAs: 'string' },
    (_req, body, done) => { done(null, body) },
  )
  app.addContentTypeParser(
    'application/vnd.opptrix.canvas+tsx',
    { parseAs: 'string' },
    (_req, body, done) => { done(null, body) },
  )
  app.addContentTypeParser(
    'application/vnd.opptrix.mindmap+json',
    { parseAs: 'string' },
    (_req, body, done) => { done(null, body) },
  )

  app.get<{ Params: { id: string } }>(
    '/api/sessions/:id/attachments',
    async (req, reply) => {
      const session = agent.getSession(req.params.id)
      if (!session) return reply.code(404).send({ error: 'session not found' })

      const metas = listSessionAttachmentMetas(req.params.id)
      const attachments = metas.map(meta => ({
        ...meta,
        referenced: isAttachmentReferenced(meta.id, session.turns),
      }))
      return { attachments }
    },
  )

  app.post<{ Params: { id: string } }>(
    '/api/sessions/:id/attachments',
    { bodyLimit: ATTACHMENT_UPLOAD_BODY_LIMIT },
    async (req, reply) => {
      const session = agent.getSession(req.params.id)
      if (!session) return reply.code(404).send({ error: 'session not found' })

      const contentType = typeof req.headers['content-type'] === 'string'
        ? req.headers['content-type']
        : undefined
      const attachmentMime = typeof req.headers['x-attachment-mime'] === 'string'
        ? req.headers['x-attachment-mime']
        : undefined
      const rawName = req.headers['x-attachment-name']
      const name = sanitizeFilename(typeof rawName === 'string' ? decodeURIComponent(rawName) : 'file')

      const mime = resolveUploadMime(contentType, attachmentMime, name)
      const kind = mimeToMediaKind(mime, name)
      if (!kind) return reply.code(400).send({ error: '不支持此文件类型' })

      const body = req.body
      if (!Buffer.isBuffer(body) || body.length === 0) {
        return reply.code(400).send({ error: '请上传有效文件' })
      }

      const caps = await resolveSessionMediaCaps(agent, req.params.id)
      if (!caps) return reply.code(404).send({ error: 'session not found' })

      const pinnedCount = parseNonNegativeIntHeader(req.headers['x-pinned-count'])
      const pinnedTotal = parseNonNegativeIntHeader(req.headers['x-pinned-total-bytes'])
      const validation = validateAttachmentAgainstCapabilities(
        kind,
        body.length,
        caps,
        pinnedCount,
        pinnedTotal,
      )
      if (!validation.ok) return reply.code(400).send({ error: validation.error })

      try {
        const meta = saveAttachment({
          sessionId: req.params.id,
          name,
          mime,
          data: body,
        })
        return { attachment: meta }
      } catch (e) {
        const message = e instanceof Error ? e.message : '上传失败'
        return reply.code(400).send({ error: message })
      }
    },
  )

  app.get<{ Params: { id: string; attachmentId: string } }>(
    '/api/sessions/:id/attachments/:attachmentId/extract',
    async (req, reply) => {
      const session = agent.getSession(req.params.id)
      if (!session) return reply.code(404).send({ error: 'session not found' })

      const meta = readAttachmentMeta(req.params.id, req.params.attachmentId)
      if (!meta) return reply.code(404).send({ error: 'attachment not found' })

      return {
        attachment_id: meta.id,
        name: meta.name,
        kind: meta.kind,
        extract: meta.extract ?? null,
      }
    },
  )

  app.get<{ Params: { id: string; attachmentId: string } }>(
    '/api/sessions/:id/attachments/:attachmentId/meta',
    async (req, reply) => {
      const session = agent.getSession(req.params.id)
      if (!session) return reply.code(404).send({ error: 'session not found' })

      const meta = readAttachmentMeta(req.params.id, req.params.attachmentId)
      if (!meta) return reply.code(404).send({ error: 'attachment not found' })
      return { attachment: meta }
    },
  )

  app.get<{ Params: { id: string; attachmentId: string } }>(
    '/api/sessions/:id/attachments/:attachmentId',
    async (req, reply) => {
      const session = agent.getSession(req.params.id)
      if (!session) return reply.code(404).send({ error: 'session not found' })

      const meta = readAttachmentMeta(req.params.id, req.params.attachmentId)
      if (!meta) return reply.code(404).send({ error: 'attachment not found' })

      const filePath = resolveAttachmentFilePath(req.params.id, req.params.attachmentId)
      if (!filePath) return reply.code(404).send({ error: 'attachment not found' })

      let size: number
      try {
        size = fs.statSync(filePath).size
      } catch {
        return reply.code(404).send({ error: 'attachment not found' })
      }

      // canvas/mindmap 等使用 meta.mime（如 application/vnd.opptrix.*）
      reply.header('Content-Type', meta.mime || 'application/octet-stream')
      reply.header('Content-Disposition', `inline; filename="${encodeURIComponent(meta.name)}"`)
      reply.header('Accept-Ranges', 'bytes')

      const rangeHeader = typeof req.headers.range === 'string' ? req.headers.range : undefined
      const range = parseBytesRange(rangeHeader, size)

      if (range === 'unsatisfied') {
        reply.header('Content-Range', `bytes */${size}`)
        return reply.code(416).send()
      }

      if (range) {
        const { start, end } = range
        const chunkSize = end - start + 1
        reply.header('Content-Range', `bytes ${start}-${end}/${size}`)
        reply.header('Content-Length', String(chunkSize))
        return reply
          .code(206)
          .send(fs.createReadStream(filePath, { start, end }))
      }

      reply.header('Content-Length', String(size))
      return reply.send(fs.createReadStream(filePath))
    },
  )

  // 网页制品：同目录相对资源（默认入口 index.html）；路径穿越拒绝
  app.get<{ Params: { id: string; attachmentId: string; '*': string } }>(
    '/api/sessions/:id/attachments/:attachmentId/web',
    async (req, reply) => {
      return reply.redirect(
        `/api/sessions/${encodeURIComponent(req.params.id)}/attachments/${encodeURIComponent(req.params.attachmentId)}/web/index.html`,
      )
    },
  )

  /**
   * 网页预览导出长图（Playwright fullPage）。须注册在 web/* 通配符之前。
   * 返回 image/png；失败时 JSON { error }。
   */
  app.get<{ Params: { id: string; attachmentId: string } }>(
    '/api/sessions/:id/attachments/:attachmentId/web/export.png',
    async (req, reply) => {
      const session = agent.getSession(req.params.id)
      if (!session) return reply.code(404).send({ error: 'session not found' })

      const meta = readAttachmentMeta(req.params.id, req.params.attachmentId)
      if (!meta || meta.kind !== 'web') {
        return reply.code(404).send({ error: 'attachment not found' })
      }

      let indexPath: string
      try {
        indexPath = resolveSafeWebRelativePath(req.params.id, req.params.attachmentId, 'index.html')
      } catch {
        return reply.code(404).send({ error: 'attachment not found' })
      }
      if (!fs.existsSync(indexPath) || !fs.statSync(indexPath).isFile()) {
        return reply.code(404).send({ error: 'file not found' })
      }

      const addr = app.server.address()
      if (!addr || typeof addr === 'string') {
        return reply.code(503).send({
          error: '暂时无法导出，请稍后重试',
        })
      }

      const pageUrl = buildLoopbackWebPreviewUrl(
        addr.address,
        addr.port,
        req.params.id,
        req.params.attachmentId,
      )
      const result = await captureWebPreviewFullPagePng(pageUrl)
      if (!result.ok) {
        return reply.code(result.status).send({ error: result.message })
      }

      const base = path.basename(meta.name).replace(/\.[^.]+$/, '') || 'export'
      reply.header('Content-Type', 'image/png')
      reply.header(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(`${base}.png`)}"`,
      )
      reply.header('Cache-Control', 'no-store')
      return reply.send(result.png)
    },
  )

  app.get<{ Params: { id: string; attachmentId: string; '*': string } }>(
    '/api/sessions/:id/attachments/:attachmentId/web/*',
    async (req, reply) => {
      const session = agent.getSession(req.params.id)
      if (!session) return reply.code(404).send({ error: 'session not found' })

      const meta = readAttachmentMeta(req.params.id, req.params.attachmentId)
      if (!meta || meta.kind !== 'web') {
        return reply.code(404).send({ error: 'attachment not found' })
      }

      const rel = String(req.params['*'] ?? '').trim() || 'index.html'
      let filePath: string
      try {
        filePath = resolveSafeWebRelativePath(req.params.id, req.params.attachmentId, rel)
      } catch {
        return reply.code(400).send({ error: 'invalid web path' })
      }
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        return reply.code(404).send({ error: 'file not found' })
      }

      reply.header('Content-Type', guessWebAssetMime(filePath))
      reply.header('Content-Security-Policy', WEB_CSP)
      reply.header('X-Content-Type-Options', 'nosniff')
      reply.header('Cache-Control', 'no-store')
      return reply.send(fs.createReadStream(filePath))
    },
  )

  app.put<{ Params: { id: string; attachmentId: string } }>(
    '/api/sessions/:id/attachments/:attachmentId',
    async (req, reply) => {
      const session = agent.getSession(req.params.id)
      if (!session) return reply.code(404).send({ error: 'session not found' })

      const meta = readAttachmentMeta(req.params.id, req.params.attachmentId)
      if (!meta) return reply.code(404).send({ error: 'attachment not found' })

      if (meta.kind !== 'canvas' && meta.kind !== 'mindmap') {
        return reply.code(400).send({ error: '仅支持更新画布或脑图附件' })
      }

      try {
        if (meta.kind === 'canvas') {
          let source = ''
          if (typeof req.body === 'string') {
            source = req.body
          } else if (Buffer.isBuffer(req.body)) {
            source = req.body.toString('utf8')
          } else if (req.body && typeof req.body === 'object' && 'source' in (req.body as object)) {
            source = String((req.body as { source?: unknown }).source ?? '')
          } else {
            return reply.code(400).send({ error: '请提供画布源码（text/plain 或 JSON.source）' })
          }
          if (!source.trim()) return reply.code(400).send({ error: '画布源码不能为空' })
          const updated = updateCanvasAttachment({
            sessionId: req.params.id,
            attachmentId: req.params.attachmentId,
            source,
          })
          if (!updated) return reply.code(404).send({ error: 'attachment not found' })
          return { attachment: updated }
        }

        // mindmap
        let tree: unknown
        if (typeof req.body === 'string') {
          try {
            tree = JSON.parse(req.body) as unknown
          } catch {
            return reply.code(400).send({ error: '脑图内容须为有效 JSON' })
          }
        } else if (Buffer.isBuffer(req.body)) {
          try {
            tree = JSON.parse(req.body.toString('utf8')) as unknown
          } catch {
            return reply.code(400).send({ error: '脑图内容须为有效 JSON' })
          }
        } else if (req.body && typeof req.body === 'object') {
          const body = req.body as Record<string, unknown>
          tree = body.tree ?? body
        } else {
          return reply.code(400).send({ error: '请提供脑图 JSON' })
        }

        const rootIdFromTree = (() => {
          if (!tree || typeof tree !== 'object') return meta.mindmap?.rootId
          const row = tree as Record<string, unknown>
          const rid = row.rootId
          return typeof rid === 'string' && rid.trim() ? rid.trim() : meta.mindmap?.rootId
        })()

        const updated = updateMindmapAttachment({
          sessionId: req.params.id,
          attachmentId: req.params.attachmentId,
          tree,
          mindmap: rootIdFromTree ? { rootId: rootIdFromTree } : meta.mindmap,
        })
        if (!updated) return reply.code(404).send({ error: 'attachment not found' })
        return { attachment: updated }
      } catch (e) {
        const message = e instanceof Error ? e.message : '更新失败'
        return reply.code(400).send({ error: message })
      }
    },
  )

  app.get<{ Params: { id: string; attachmentId: string } }>(
    '/api/sessions/:id/attachments/:attachmentId/extract/text',
    async (req, reply) => {
      const session = agent.getSession(req.params.id)
      if (!session) return reply.code(404).send({ error: 'session not found' })

      const meta = readAttachmentMeta(req.params.id, req.params.attachmentId)
      if (!meta) return reply.code(404).send({ error: 'attachment not found' })

      const md = readExtractMarkdown(req.params.id, req.params.attachmentId)
      if (md) {
        // Buffer 发送，避免 Fastify 对 string 走 JSON 序列化坑
        return reply
          .type('text/markdown; charset=utf-8')
          .send(Buffer.from(md, 'utf8'))
      }

      // 纯文本：无 extract.md 时直接读原文（上传侧多为 kind=document）
      const plainText =
        meta.kind === 'text'
        || isPlainTextDocument(meta.mime, meta.name)
        || (meta.kind === 'document' && isPlainTextDocument(meta.mime, meta.name))
      if (plainText) {
        const buffer = readAttachmentBuffer(req.params.id, req.params.attachmentId)
        if (buffer) {
          const text = decodeTextBuffer(buffer)
          return reply
            .type('text/plain; charset=utf-8')
            .send(Buffer.from(text, 'utf8'))
        }
      }

      if (meta.extract?.status === 'pending') {
        return reply.code(202).send({ status: 'pending' })
      }

      if (meta.extract?.status === 'failed') {
        return reply.code(422).send({
          status: 'failed',
          message: meta.extract?.error ?? '未能整理该文件',
        })
      }

      return reply.code(422).send({ status: 'failed', message: '暂不支持预览此文件' })
    },
  )

  app.delete<{ Params: { id: string; attachmentId: string } }>(
    '/api/sessions/:id/attachments/:attachmentId',
    async (req, reply) => {
      const session = agent.getSession(req.params.id)
      if (!session) return reply.code(404).send({ error: 'session not found' })

      const meta = readAttachmentMeta(req.params.id, req.params.attachmentId)
      if (!meta) return reply.code(404).send({ error: 'attachment not found' })

      if (isAttachmentReferenced(req.params.attachmentId, session.turns)) {
        return reply.code(409).send({ error: '该附件已在对话中使用，无法删除' })
      }

      const ok = deleteAttachment(req.params.id, req.params.attachmentId)
      return { ok }
    },
  )
}
