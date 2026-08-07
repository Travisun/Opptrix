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
  validateAttachmentAgainstCapabilities,
  isAttachmentReferenced,
  listSessionAttachmentMetas,
  parseNonNegativeIntHeader,
  resolveUploadMime,
  updateCanvasAttachment,
  updateMindmapAttachment,
} from '@opptrix/agent'
import { decodeTextBuffer, isPlainTextDocument } from '@opptrix/doc-library'

function sanitizeFilename(name: string): string {
  const base = path.basename(name.trim() || 'file')
  return base.replace(/[^\w.\-()\u4e00-\u9fff]/g, '_').slice(0, 180) || 'file'
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

export function registerSessionAttachmentRoutes(app: FastifyInstance, agent: AgentEngine) {
  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer' },
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

      // canvas/mindmap 等使用 meta.mime（如 application/vnd.opptrix.*）
      reply.header('Content-Type', meta.mime || 'application/octet-stream')
      reply.header('Content-Disposition', `inline; filename="${encodeURIComponent(meta.name)}"`)
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
